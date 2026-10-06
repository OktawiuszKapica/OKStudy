package pl.okstudy.mobile;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import java.util.concurrent.*;

public final class ChatGptLoginService extends Service {
  private final Handler main = new Handler(Looper.getMainLooper());
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private ChatGpt.Attempt attempt;

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int id) {
    if (attempt != null) return START_NOT_STICKY;
    attempt = ChatGpt.pending;
    if (attempt == null) {
      stopSelf();
      return START_NOT_STICKY;
    }
    NotificationManager manager = getSystemService(NotificationManager.class);
    manager.createNotificationChannel(
        new NotificationChannel(
            "chatgpt-login", "Łączenie konta ChatGPT", NotificationManager.IMPORTANCE_LOW));
    PendingIntent open =
        PendingIntent.getActivity(
            this,
            30,
            new Intent(this, ChatGptActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification notice =
        new Notification.Builder(this, "chatgpt-login")
            .setSmallIcon(R.drawable.ic_status)
            .setContentTitle("Łączenie OKStudy z ChatGPT")
            .setContentText("Po zalogowaniu dotknij, aby wrócić do OKStudy.")
            .setContentIntent(open)
            .setOngoing(true)
            .build();
    if (Build.VERSION.SDK_INT >= 34)
      startForeground(1702, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE);
    else startForeground(1702, notice);
    main.postDelayed(
        () -> {
          ChatGpt.loginMessage = "Minął czas logowania. Uruchom je ponownie.";
          stopSelf();
        },
        165000);
    worker.execute(
        () -> {
          try {
            attempt.finish();
          } catch (Exception e) {
            if (!attempt.cancel.cancelled) ChatGpt.loginMessage = message(e);
          } finally {
            main.post(this::stopSelf);
          }
        });
    return START_NOT_STICKY;
  }

  static String message(Exception e) {
    return e.getClass() == Exception.class && e.getMessage() != null
        ? e.getMessage()
        : "Nie udało się połączyć z ChatGPT. Sprawdź internet, datę telefonu i spróbuj ponownie.";
  }

  @Override
  public void onTimeout(int startId) {
    stopSelf();
  }

  @Override
  public void onTimeout(int startId, int type) {
    stopSelf();
  }

  @Override
  public void onDestroy() {
    main.removeCallbacksAndMessages(null);
    if (attempt != null) attempt.close();
    if (ChatGpt.pending == attempt) ChatGpt.pending = null;
    if (ChatGpt.loginMessage.isEmpty()) ChatGpt.loginMessage = "Logowanie zostało przerwane.";
    worker.shutdownNow();
    stopForeground(STOP_FOREGROUND_REMOVE);
    super.onDestroy();
  }
}
