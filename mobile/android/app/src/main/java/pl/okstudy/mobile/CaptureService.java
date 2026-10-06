package pl.okstudy.mobile;

import android.animation.ValueAnimator;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.*;
import android.hardware.display.*;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.*;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.TextView;
import java.util.concurrent.*;

public final class CaptureService extends Service {
  static final String START = "pl.okstudy.START",
      STOP = "pl.okstudy.STOP",
      CANCEL = "pl.okstudy.CANCEL";
  private static final int NOTICE = 1701;
  private final Handler main = new Handler(Looper.getMainLooper());
  private HandlerThread framesThread;
  private Handler frames;
  private final ExecutorService network = Executors.newSingleThreadExecutor();
  private MediaProjection projection;
  private VirtualDisplay display;
  private ImageReader reader;
  private WindowManager windows;
  private TextView button, answer;
  private WindowManager.LayoutParams buttonPosition;
  private Prefs prefs;
  private Speech speech;
  private ValueAnimator pulse;
  private ApiClient.Cancel active;
  private volatile ApiClient.Cancel capture;
  private volatile long lastFrame;
  private long captureBaseline, captureStarted;
  private int generation;
  private volatile boolean ending;
  private final Runnable hideAnswer = () -> removeAnswer();

  @Override
  public void onCreate() {
    super.onCreate();
    prefs = new Prefs(this);
    windows = (WindowManager) getSystemService(WINDOW_SERVICE);
    speech = new Speech(this);
    framesThread = new HandlerThread("OKStudy-frames");
    framesThread.start();
    frames = new Handler(framesThread.getLooper());
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) {
      stopSelf();
      return START_NOT_STICKY;
    }
    if (STOP.equals(intent.getAction())) {
      stopSelf();
      return START_NOT_STICKY;
    }
    if (CANCEL.equals(intent.getAction())) {
      cancel();
      return START_NOT_STICKY;
    }
    if (!START.equals(intent.getAction()) || projection != null) return START_NOT_STICKY;
    try {
      if (!Settings.canDrawOverlays(this))
        throw new Exception("Zezwól OKStudy na wyświetlanie nad innymi aplikacjami.");
      NotificationManager manager = getSystemService(NotificationManager.class);
      manager.createNotificationChannel(
          new NotificationChannel(
              "screen-session", "Pomoc na ekranie", NotificationManager.IMPORTANCE_LOW));
      if (Build.VERSION.SDK_INT >= 29)
        startForeground(
            NOTICE, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
      else startForeground(NOTICE, notification());
      @SuppressWarnings("deprecation")
      Intent permission = intent.getParcelableExtra("permission");
      if (permission == null || intent.getIntExtra("result", 0) != Activity.RESULT_OK)
        throw new Exception("Uruchom sesję ponownie z aplikacji OKStudy.");
      projection =
          ((MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE))
              .getMediaProjection(Activity.RESULT_OK, permission);
      projection.registerCallback(
          new MediaProjection.Callback() {
            @Override
            public void onStop() {
              stopSelf();
            }

            @Override
            public void onCapturedContentResize(int w, int h) {
              resize(w, h);
            }
          },
          main);
      Point size = screen();
      createReader(size.x, size.y, true);
      createButton();
      AppState.active = true;
      AppState.error = "";
    } catch (Exception error) {
      AppState.error = message(error);
      stopSelf();
    }
    return START_NOT_STICKY;
  }

  private Notification notification() {
    PendingIntent open =
        PendingIntent.getActivity(
            this,
            0,
            new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    PendingIntent stop =
        PendingIntent.getService(
            this,
            1,
            new Intent(this, CaptureService.class).setAction(STOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    PendingIntent cancel =
        PendingIntent.getService(
            this,
            2,
            new Intent(this, CaptureService.class).setAction(CANCEL),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    return new Notification.Builder(this, "screen-session")
        .setSmallIcon(R.drawable.ic_status)
        .setContentTitle("OKStudy — pomoc na ekranie")
        .setContentText("Stuknij w przycisk, aby przeanalizować zadanie.")
        .setContentIntent(open)
        .setOngoing(true)
        .addAction(new Notification.Action.Builder(null, "Przerwij analizę", cancel).build())
        .addAction(new Notification.Action.Builder(null, "Zakończ sesję", stop).build())
        .build();
  }

  @SuppressWarnings("deprecation")
  private Point screen() {
    if (Build.VERSION.SDK_INT >= 30) {
      Rect r = windows.getMaximumWindowMetrics().getBounds();
      return new Point(r.width(), r.height());
    }
    Point p = new Point();
    windows.getDefaultDisplay().getRealSize(p);
    return p;
  }

  private void createReader(int width, int height, boolean first) {
    float scale = Math.min(1, ImageCodec.MAX_EDGE / (float) Math.max(width, height));
    int w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 3);
    reader.setOnImageAvailableListener(
        source -> {
          // Drain idle frames without creating bitmaps. During a capture retain only
          // the reader's bounded queue, then take its newest frame after hiding UI.
          if (capture != null) return;
          try (Image image = source.acquireLatestImage()) {
            if (image != null) lastFrame = image.getTimestamp();
          } catch (IllegalStateException ignored) {
          }
        },
        frames);
    if (first)
      display =
          projection.createVirtualDisplay(
              "OKStudy",
              w,
              h,
              getResources().getConfiguration().densityDpi,
              DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
              reader.getSurface(),
              null,
              frames);
    else {
      display.resize(w, h, getResources().getConfiguration().densityDpi);
      display.setSurface(reader.getSurface());
    }
  }

  private void resize(int w, int h) {
    AppState.trace("resize " + w + "x" + h);
    if (ending || display == null || w < 1 || h < 1) return;
    float scale = Math.min(1, ImageCodec.MAX_EDGE / (float) Math.max(w, h));
    if (reader != null
        && reader.getWidth() == Math.round(w * scale)
        && reader.getHeight() == Math.round(h * scale)) return;
    cancel();
    frames.post(
        () -> {
          if (ending || display == null) return;
          try {
            display.setSurface(null);
            reader.setOnImageAvailableListener(null, null);
            reader.close();
            lastFrame = 0;
            createReader(w, h, false);
          } catch (Exception e) {
            main.post(
                () -> {
                  AppState.error = message(e);
                  stopSelf();
                });
          }
        });
    clampButton();
    removeAnswer();
  }

  @Override
  public void onConfigurationChanged(Configuration configuration) {
    super.onConfigurationChanged(configuration);
    if (Build.VERSION.SDK_INT < 34) {
      Point p = screen();
      resize(p.x, p.y);
    } else {
      clampButton();
      removeAnswer();
    }
  }

  private int dp(float n) {
    return Design.dp(this, n);
  }

  private WindowManager.LayoutParams overlay(int width, int height, boolean touchable) {
    int flags =
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;
    if (!touchable) flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
    return new WindowManager.LayoutParams(
        width,
        height,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        flags,
        PixelFormat.TRANSLUCENT);
  }

  // GestureDetector forwards confirmed taps to performClick; TalkBack uses the
  // same listener directly. Drag/long-press must not trigger a second click.
  @android.annotation.SuppressLint("ClickableViewAccessibility")
  private void createButton() {
    button = Design.text(this, "OK", 15, Design.LIME, true);
    button.setGravity(Gravity.CENTER);
    button.setBackground(Design.shape(this, Design.BG, 22));
    button.setContentDescription(
        "OKStudy. Stuknij, aby analizować. Przytrzymaj, aby otworzyć ustawienia.");
    buttonPosition = overlay(dp(44), dp(44), true);
    buttonPosition.gravity = Gravity.TOP | Gravity.LEFT;
    buttonPosition.alpha = .85f;
    Point s = screen();
    buttonPosition.x =
        Math.round(prefs.store.getFloat("buttonX", .92f) * Math.max(0, s.x - dp(44)));
    buttonPosition.y =
        Math.round(prefs.store.getFloat("buttonY", .55f) * Math.max(0, s.y - dp(44)));
    windows.addView(button, buttonPosition);
    clampButton();
    GestureDetector gestures =
        new GestureDetector(
            this,
            new GestureDetector.SimpleOnGestureListener() {
              @Override
              public boolean onDown(android.view.MotionEvent event) {
                return true;
              }

              @Override
              public boolean onSingleTapConfirmed(android.view.MotionEvent event) {
                AppState.trace("single tap; double mode=" + prefs.doubleTap());
                if (active != null || !prefs.doubleTap()) button.performClick();
                return true;
              }

              @Override
              public boolean onDoubleTap(android.view.MotionEvent event) {
                AppState.trace("double tap");
                if (active != null || prefs.doubleTap()) button.performClick();
                return true;
              }

              @Override
              public void onLongPress(android.view.MotionEvent event) {
                cancel();
                startActivity(
                    new Intent(CaptureService.this, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
              }
            });
    button.setOnTouchListener(
        new View.OnTouchListener() {
          float x, y;
          int left, top;
          boolean moved;

          public boolean onTouch(View view, android.view.MotionEvent event) {
            AppState.trace("touch " + event.getActionMasked());
            gestures.onTouchEvent(event);
            if (event.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) {
              x = event.getRawX();
              y = event.getRawY();
              left = buttonPosition.x;
              top = buttonPosition.y;
              moved = false;
            } else if (event.getActionMasked() == android.view.MotionEvent.ACTION_MOVE) {
              float dx = event.getRawX() - x, dy = event.getRawY() - y;
              if (Math.abs(dx) + Math.abs(dy) > dp(8)) moved = true;
              if (moved) {
                buttonPosition.x = left + Math.round(dx);
                buttonPosition.y = top + Math.round(dy);
                clampButton();
              }
            } else if (event.getActionMasked() == android.view.MotionEvent.ACTION_UP && moved) {
              Point s = screen();
              prefs
                  .store
                  .edit()
                  .putFloat("buttonX", buttonPosition.x / (float) Math.max(1, s.x - dp(44)))
                  .putFloat("buttonY", buttonPosition.y / (float) Math.max(1, s.y - dp(44)))
                  .apply();
            }
            return true;
          }
        });
    button.setOnClickListener(v -> analyze());
  }

  private void clampButton() {
    if (button == null || buttonPosition == null) return;
    Point s = screen();
    buttonPosition.x = Math.max(dp(4), Math.min(s.x - dp(48), buttonPosition.x));
    buttonPosition.y = Math.max(dp(40), Math.min(s.y - dp(90), buttonPosition.y));
    try {
      windows.updateViewLayout(button, buttonPosition);
    } catch (IllegalArgumentException ignored) {
    }
  }

  private void analyze() {
    AppState.trace("analyze");
    if (ending) return;
    if (active != null) {
      cancel();
      return;
    }
    try {
      String provider = prefs.provider(),
          model = prefs.model(),
          key = new Secrets(this).get(provider);
      ApiClient.validate(provider, key, model);
      ApiClient.Cancel token = new ApiClient.Cancel();
      active = token;
      capture = token;
      generation++;
      int current = generation;
      captureBaseline = lastFrame;
      captureStarted = SystemClock.elapsedRealtime();
      removeAnswer();
      speech.stop();
      button.setVisibility(View.INVISIBLE);
      AppState.error = "";
      frames.postDelayed(() -> grab(token, current, provider, key, model, prefs.only()), 220);
      main.postDelayed(
          () -> {
            if (active == token && !ending && capture == token) {
              capture = null;
              fail(
                  token,
                  new Exception(
                      "Nie udało się pobrać świeżego obrazu. Sprawdź, czy wybrana aplikacja jest"
                          + " widoczna."));
            }
          },
          3500);
    } catch (Exception error) {
      fail(null, error);
    }
  }

  private void grab(
      ApiClient.Cancel token,
      int current,
      String provider,
      String key,
      String model,
      boolean only) {
    if (ending || capture != token || token.cancelled) return;
    try (Image image = reader.acquireLatestImage()) {
      if (image == null || image.getTimestamp() <= captureBaseline) {
        if (SystemClock.elapsedRealtime() - captureStarted < 3000) {
          frames.postDelayed(() -> grab(token, current, provider, key, model, only), 80);
          return;
        }
        throw new Exception("Nie udało się pobrać świeżego zrzutu. Spróbuj ponownie.");
      }
      AppState.trace("frame acquired");
      lastFrame = image.getTimestamp();
      String jpeg = ImageCodec.fromFrame(image);
      token.check();
      capture = null;
      main.post(
          () -> {
            if (active == token && !ending) {
              button.setVisibility(View.VISIBLE);
              working();
            }
          });
      network.execute(
          () -> {
            try {
              String text = new ApiClient().analyze(provider, key, model, jpeg, only, token);
              main.post(
                  () -> {
                    if (ending || active != token || token.cancelled || current != generation)
                      return;
                    active = null;
                    resetButton();
                    AppState.answer = text;
                    AppState.error = "";
                    if (!prefs.voice().equals("only")) showAnswer(text, false);
                    if (!prefs.voice().equals("off")) speech.read(text, e -> fail(null, e));
                  });
            } catch (Exception error) {
              main.post(
                  () -> {
                    if (active == token && !token.cancelled) fail(token, error);
                  });
            }
          });
    } catch (Exception error) {
      main.post(
          () -> {
            if (active == token && !token.cancelled) fail(token, error);
          });
    }
  }

  private void working() {
    resetButton();
    if (prefs.indicator().equals("off")) return;
    button.setText("•••");
    pulse = ValueAnimator.ofFloat(.35f, 1f);
    pulse.setDuration(650);
    pulse.setRepeatCount(ValueAnimator.INFINITE);
    pulse.setRepeatMode(ValueAnimator.REVERSE);
    pulse.addUpdateListener(
        v -> {
          if (button != null) button.setAlpha((float) v.getAnimatedValue());
        });
    pulse.start();
    if (prefs.indicator().equals("full")) showAnswer("Analizuję zadanie…", true);
  }

  private void resetButton() {
    if (pulse != null) {
      pulse.cancel();
      pulse = null;
    }
    if (button != null) {
      button.setAlpha(1);
      button.setText("OK");
      button.setTextColor(Design.LIME);
      button.setVisibility(View.VISIBLE);
      button.setContentDescription(
          active != null
              ? "Przerwij analizę OKStudy"
              : "OKStudy. Stuknij, aby analizować. Przytrzymaj, aby otworzyć ustawienia.");
    }
  }

  private void showAnswer(String value, boolean progress) {
    removeAnswer();
    answer =
        Design.text(
            this,
            value,
            progress ? 14 : prefs.textSize(),
            prefs.color().equals("dark") ? Color.rgb(20, 32, 25) : Design.TEXT,
            false);
    answer.setMaxLines(10);
    answer.setPadding(dp(10), dp(7), dp(10), dp(7));
    if (prefs.style().equals("card") || progress)
      answer.setBackground(
          Design.shape(
              this, prefs.color().equals("dark") ? Color.rgb(245, 248, 239) : Design.BG, 14));
    else
      answer.setShadowLayer(
          dp(2), 0, dp(1), prefs.color().equals("dark") ? Color.WHITE : Color.BLACK);
    answer.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    Point size = screen();
    answer.setMaxWidth(Math.min(dp(340), size.x - dp(32)));
    WindowManager.LayoutParams layout =
        overlay(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            false);
    layout.gravity =
        (prefs.position().equals("top") ? Gravity.TOP : Gravity.BOTTOM) | Gravity.RIGHT;
    layout.x = dp(16);
    layout.y = dp(prefs.position().equals("top") ? 75 : 90);
    layout.alpha = progress ? .8f : prefs.opacity();
    if (Build.VERSION.SDK_INT >= 31) {
      float max =
          getSystemService(android.hardware.input.InputManager.class)
              .getMaximumObscuringOpacityForTouch();
      layout.alpha = Math.min(layout.alpha, max);
    }
    windows.addView(answer, layout);
    if (!progress) main.postDelayed(hideAnswer, prefs.duration() * 1000L);
  }

  private void removeAnswer() {
    main.removeCallbacks(hideAnswer);
    if (answer != null) {
      try {
        windows.removeView(answer);
      } catch (IllegalArgumentException ignored) {
      }
      answer = null;
    }
  }

  private void fail(ApiClient.Cancel token, Exception error) {
    if (ending || token != null && active != token) return;
    AppState.error = message(error);
    if (active != null) active.cancel();
    active = null;
    capture = null;
    resetButton();
    if (button != null) {
      button.setText("!");
      button.setTextColor(Color.rgb(255, 193, 168));
      button.setContentDescription(AppState.error);
      main.postDelayed(
          () -> {
            if (active == null && !ending) resetButton();
          },
          1500);
    }
    if (prefs.indicator().equals("full")) showAnswer(AppState.error, false);
  }

  private static String message(Exception error) {
    return error instanceof java.net.SocketTimeoutException
        ? "Analiza trwała za długo. Spróbuj ponownie."
        : error.getMessage() == null
            ? "Nie udało się wykonać analizy. Sprawdź połączenie."
            : error.getMessage();
  }

  private void cancel() {
    AppState.trace("cancel");
    if (active != null) active.cancel();
    active = null;
    capture = null;
    generation++;
    speech.stop();
    removeAnswer();
    resetButton();
  }

  @Override
  public void onDestroy() {
    ending = true;
    AppState.active = false;
    if (active != null) active.cancel();
    capture = null;
    main.removeCallbacksAndMessages(null);
    speech.close();
    if (pulse != null) pulse.cancel();
    removeAnswer();
    if (button != null) {
      try {
        windows.removeView(button);
      } catch (IllegalArgumentException ignored) {
      }
      button = null;
    }
    if (display != null) {
      display.release();
      display = null;
    }
    if (projection != null) {
      projection.stop();
      projection = null;
    }
    frames.post(
        () -> {
          if (reader != null) {
            reader.close();
            reader = null;
          }
          framesThread.quitSafely();
        });
    network.shutdownNow();
    stopForeground(STOP_FOREGROUND_REMOVE);
    super.onDestroy();
  }
}
