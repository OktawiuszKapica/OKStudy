package pl.okstudy.mobile;

/** Session-only answer: no screenshots or conversation in preferences. */
final class AppState {
  static volatile String debugEvents = "";

  static synchronized void trace(String event) {
    if (!BuildConfig.DEBUG) return;
    debugEvents += "\n" + event;
    if (debugEvents.length() > 8000)
      debugEvents = debugEvents.substring(debugEvents.length() - 8000);
  }

  static volatile String answer = "";
  static volatile String error = "";
  static volatile boolean active;
  static volatile boolean explainRequested;
  private static String lastImage;
  private static AiConnection lastConnection;
  private static long lastAt;
  private static final android.os.Handler expiry =
      new android.os.Handler(android.os.Looper.getMainLooper());
  private static final Runnable clear = AppState::clearTask;

  record LastTask(String image, AiConnection connection) {}

  static synchronized void remember(String image, AiConnection connection) {
    lastImage = image;
    lastConnection = connection;
    lastAt = android.os.SystemClock.elapsedRealtime();
    expiry.removeCallbacks(clear);
    expiry.postDelayed(clear, 300000);
  }

  static synchronized LastTask lastTask() {
    if (lastImage == null || android.os.SystemClock.elapsedRealtime() - lastAt > 300000) {
      clearTask();
      return null;
    }
    return new LastTask(lastImage, lastConnection);
  }

  static synchronized void clearTask() {
    lastImage = null;
    lastConnection = null;
    explainRequested = false;
    expiry.removeCallbacks(clear);
  }

  private AppState() {}
}
