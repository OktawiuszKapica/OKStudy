package pl.okstudy.mobile;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.util.concurrent.*;

/** The system browser owns passwords and MFA. This Activity never receives them. */
public final class ChatGptActivity extends Activity {
  private final Handler main = new Handler(Looper.getMainLooper());
  private boolean closed, started;
  private volatile ChatGpt.Attempt prepared;
  private TextView message;
  private final Runnable poll =
      new Runnable() {
        public void run() {
          if (closed) return;
          if (started && ChatGpt.pending == null) {
            message.setText(ChatGpt.loginMessage);
            setResult(RESULT_OK);
            finish();
            return;
          }
          main.postDelayed(this, 500);
        }
      };

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout root = Design.column(this);
    root.setPadding(
        Design.dp(this, 24), Design.dp(this, 55), Design.dp(this, 24), Design.dp(this, 32));
    root.setBackgroundColor(Design.BG);
    root.addView(
        new Design.Mark(this),
        new LinearLayout.LayoutParams(Design.dp(this, 52), Design.dp(this, 42)));
    root.addView(Design.text(this, "Połącz swój plan\nChatGPT", 30, Design.TEXT, true));
    message =
        Design.text(
            this,
            "Otwieram bezpieczne logowanie w przeglądarce. Po zatwierdzeniu wróć do OKStudy. Masz"
                + " około 2½ minuty; w razie potrzeby możesz spróbować ponownie.",
            15,
            Design.MUTED,
            false);
    message.setPadding(0, Design.dp(this, 24), 0, Design.dp(this, 18));
    root.addView(message);
    Button cancel = Design.button(this, "Anuluj", false);
    cancel.setOnClickListener(
        v -> {
          stopService(new Intent(this, ChatGptLoginService.class));
          finish();
        });
    root.addView(cancel);
    setContentView(root);
    if (ChatGpt.pending != null) {
      started = true;
      return;
    }
    if (state != null) {
      ChatGpt.loginMessage = "Logowanie zostało przerwane przez system. Uruchom je ponownie.";
      setResult(RESULT_OK);
      finish();
      return;
    }
    ExecutorService worker = Executors.newSingleThreadExecutor();
    worker.execute(
        () -> {
          try {
            ChatGpt.Attempt attempt =
                new ChatGpt.Attempt(this, getIntent().getStringExtra("account"));
            prepared = attempt;
            main.post(
                () -> {
                  if (closed || isFinishing()) {
                    attempt.close();
                    return;
                  }
                  ChatGpt.pending = attempt;
                  ChatGpt.loginMessage = "";
                  started = true;
                  try {
                    startForegroundService(new Intent(this, ChatGptLoginService.class));
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(attempt.url)));
                  } catch (Exception e) {
                    stopService(new Intent(this, ChatGptLoginService.class));
                    attempt.close();
                    ChatGpt.pending = null;
                    ChatGpt.loginMessage =
                        "Nie udało się otworzyć logowania. Sprawdź, czy telefon ma przeglądarkę.";
                  }
                });
          } catch (Exception e) {
            main.post(
                () -> {
                  started = true;
                  ChatGpt.loginMessage = ChatGptLoginService.message(e);
                });
          } finally {
            worker.shutdown();
          }
        });
  }

  @Override
  protected void onResume() {
    super.onResume();
    main.post(poll);
  }

  @Override
  protected void onPause() {
    main.removeCallbacks(poll);
    super.onPause();
  }

  @Override
  protected void onDestroy() {
    closed = true;
    if (prepared != null && ChatGpt.pending != prepared) prepared.close();
    main.removeCallbacksAndMessages(null);
    if (isFinishing() && ChatGpt.pending != null)
      stopService(new Intent(this, ChatGptLoginService.class));
    super.onDestroy();
  }
}
