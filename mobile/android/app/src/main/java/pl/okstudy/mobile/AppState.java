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

  private AppState() {}
}
