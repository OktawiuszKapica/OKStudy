package pl.okstudy.mobile;

import android.content.Context;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

final class Speech {
  private final Context context;
  private final Handler main = new Handler(Looper.getMainLooper());
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private TextToSpeech tts;
  private MediaPlayer player;
  private File file;
  private ApiClient.Cancel active;
  private boolean ready, closed;
  private int initStatus = Integer.MIN_VALUE;
  private Runnable queued;
  private Consumer<Exception> systemFailure;
  private byte[] cache;
  private String cacheKey = "";
  private long cacheAt;

  Speech(Context context) {
    this.context = context.getApplicationContext();
    tts =
        new TextToSpeech(
            this.context,
            status ->
                main.post(
                    () -> {
                      if (closed) return;
                      initStatus = status;
                      ready =
                          status == TextToSpeech.SUCCESS
                              && tts.setLanguage(Locale.forLanguageTag("pl-PL")) >= 0;
                      if (queued != null) {
                        Runnable next = queued;
                        queued = null;
                        next.run();
                      }
                    }));
    tts.setOnUtteranceProgressListener(
        new UtteranceProgressListener() {
          public void onStart(String id) {}

          public void onDone(String id) {
            main.post(
                () -> {
                  if (active != null
                      && id.equals(Integer.toHexString(System.identityHashCode(active))))
                    active = null;
                });
          }

          public void onError(String id) {
            main.post(
                () -> {
                  if (active == null
                      || !id.equals(Integer.toHexString(System.identityHashCode(active)))) return;
                  Consumer<Exception> report = systemFailure;
                  stop();
                  if (report != null)
                    report.accept(new Exception("Głos systemowy nie ukończył odczytu."));
                });
          }
        });
  }

  boolean busy() {
    return active != null;
  }

  void read(String text, Consumer<Exception> failure) {
    stop();
    if (closed || text.trim().isEmpty()) return;
    ApiClient.Cancel token = new ApiClient.Cancel();
    active = token;
    Prefs prefs = new Prefs(context);
    String input = text.substring(0, Math.min(4000, text.length()));
    if (!prefs.engine().equals("openai")) {
      systemFailure = failure;
      Runnable start =
          () -> {
            if (active != token || token.cancelled) return;
            if (!ready) {
              active = null;
              failure.accept(
                  new Exception("Zainstaluj polski głos w ustawieniach syntezy mowy telefonu."));
              return;
            }
            if (tts.speak(
                    input,
                    TextToSpeech.QUEUE_FLUSH,
                    null,
                    Integer.toHexString(System.identityHashCode(token)))
                == TextToSpeech.ERROR) {
              active = null;
              failure.accept(new Exception("Nie udało się uruchomić głosu systemowego."));
            }
          };
      if (initStatus == Integer.MIN_VALUE) queued = start;
      else start.run();
      return;
    }
    executor.execute(
        () -> {
          try {
            String key = new Secrets(context).get("openai");
            if (key.isEmpty())
              throw new Exception("Głos OpenAI wymaga osobnego klucza API OpenAI.");
            String id =
                android.util.Base64.encodeToString(
                    MessageDigest.getInstance("SHA-256")
                        .digest((key + "\n" + input).getBytes(StandardCharsets.UTF_8)),
                    android.util.Base64.NO_WRAP);
            byte[] audio;
            token.check();
            if (id.equals(cacheKey)
                && cache != null
                && System.currentTimeMillis() - cacheAt < 30 * 60 * 1000L) audio = cache;
            else {
              prefs.reserveSpeech();
              token.check();
              audio = new ApiClient().speech(key, input, token);
              token.check();
              if (audio.length <= 2 * 1024 * 1024) {
                cache = audio;
                cacheKey = id;
                cacheAt = System.currentTimeMillis();
              }
            }
            byte[] result = audio;
            main.post(
                () -> {
                  if (closed || active != token || token.cancelled) return;
                  try {
                    file = File.createTempFile("okstudy-speech-", ".mp3", context.getCacheDir());
                    Files.write(file.toPath(), result);
                    player = new MediaPlayer();
                    player.setDataSource(file.getAbsolutePath());
                    player.setOnPreparedListener(
                        p -> {
                          if (active == token && !token.cancelled) p.start();
                        });
                    player.setOnCompletionListener(p -> stop());
                    player.setOnErrorListener(
                        (p, what, extra) -> {
                          stop();
                          failure.accept(new Exception("Nie udało się odtworzyć głosu OpenAI."));
                          return true;
                        });
                    player.prepareAsync();
                  } catch (Exception error) {
                    stop();
                    failure.accept(error);
                  }
                });
          } catch (Exception error) {
            main.post(
                () -> {
                  if (active == token && !token.cancelled && !closed) {
                    stop();
                    failure.accept(error);
                  }
                });
          }
        });
  }

  void stop() {
    if (active != null) active.cancel();
    active = null;
    queued = null;
    systemFailure = null;
    if (tts != null) tts.stop();
    if (player != null) {
      player.release();
      player = null;
    }
    if (file != null) {
      file.delete();
      file = null;
    }
  }

  void close() {
    closed = true;
    stop();
    if (tts != null) tts.shutdown();
    executor.shutdownNow();
    cache = null;
  }
}
