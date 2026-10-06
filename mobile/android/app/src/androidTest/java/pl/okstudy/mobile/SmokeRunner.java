package pl.okstudy.mobile;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.*;
import android.content.*;
import android.graphics.BitmapFactory;
import android.os.*;
import android.util.Base64;
import android.view.*;
import android.view.accessibility.*;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.BooleanSupplier;

/** Isolated emulator only. Mock HTTP, real Keystore, consent, projection and overlay. */
@android.annotation.TargetApi(35)
public final class SmokeRunner extends Instrumentation {
  private final StringBuilder report = new StringBuilder();

  @Override
  public void onCreate(Bundle args) {
    super.onCreate(args);
    start();
  }

  @Override
  public void onStart() {
    Bundle result = new Bundle();
    try {
      if (!Build.HARDWARE.equals("ranchu") || !Build.PRODUCT.contains("sdk"))
        throw new Exception("Run only on the isolated test emulator.");
      Context context = getTargetContext();
      shell("appops set pl.okstudy.mobile SYSTEM_ALERT_WINDOW allow");
      shell("pm grant pl.okstudy.mobile android.permission.POST_NOTIFICATIONS");
      AccessibilityServiceInfo info = getUiAutomation().getServiceInfo();
      info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
      getUiAutomation().setServiceInfo(info);
      Prefs prefs = new Prefs(context);
      prefs
          .store
          .edit()
          .putString("provider", "openai")
          .putString("model.openai", "future-test-model")
          .putBoolean("doubleTap", false)
          .putString("indicator", "minimal")
          .putString("voice", "off")
          .putString("cropMode", "full")
          .putInt("duration", 30)
          .commit();
      new Secrets(context).put("openai", "test-only-key");
      check(new Secrets(context).get("openai").equals("test-only-key"), "Keystore round trip");
      check(
          !context
              .getSharedPreferences("encrypted-keys", 0)
              .getAll()
              .toString()
              .contains("test-only-key"),
          "Key is encrypted at rest");
      AtomicInteger requests = new AtomicInteger();
      ApiClient.testTransport =
          (url, method, headers, body, cancel) -> {
            check(
                method.equals("POST") && url.equals("https://api.openai.com/v1/responses"),
                "Capture uses expected endpoint");
            String encoded =
                body.getJSONArray("input")
                    .getJSONObject(0)
                    .getJSONArray("content")
                    .getJSONObject(1)
                    .getString("image_url")
                    .split(",", 2)[1];
            byte[] image = Base64.decode(encoded, Base64.DEFAULT);
            var bitmap = BitmapFactory.decodeByteArray(image, 0, image.length);
            check(
                bitmap != null
                    && bitmap.getWidth() > 100
                    && Math.max(bitmap.getWidth(), bitmap.getHeight()) <= 2000,
                "Fresh JPEG capture with bounded size");
            bitmap.recycle();
            requests.incrementAndGet();
            return reply("D");
          };
      MainActivity activity =
          (MainActivity)
              startActivitySync(
                  new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      runOnMainSync(
          () ->
              findButton(activity.getWindow().getDecorView(), "Uruchom pomoc na ekranie")
                  .performClick());
      waitUntil(
          () ->
              node("A single app") != null
                  || node("Single app") != null
                  || node("Entire screen") != null
                  || node("Start now") != null,
          15000,
          "Screen consent shown");
      if (node("A single app") != null) click("A single app");
      else if (node("Single app") != null) click("Single app");
      if (node("Entire screen") != null) click("Entire screen");
      if (node("Start now") != null) click("Start now");
      else if (node("Start recording") != null) click("Start recording");
      else click("Start");
      waitUntil(() -> AppState.active, 15000, "Projection session started");
      shell("am start -n pl.okstudy.mobile.test/pl.okstudy.mobile.FixtureActivity");
      SystemClock.sleep(600);
      tapControl("OK", false);
      waitUntil(() -> AppState.answer.equals("D"), 12000, "Real screen capture returned D");
      waitUntil(() -> overlayShown("D"), 3000, "Answer overlay visible over test task");
      try (FileOutputStream output =
          new FileOutputStream(new File(context.getCacheDir(), "answer-preview.png"))) {
        var screenshot = getUiAutomation().takeScreenshot();
        if (screenshot != null) {
          screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output);
          screenshot.recycle();
        }
      }
      getUiAutomation().setRotation(UiAutomation.ROTATION_FREEZE_90);
      SystemClock.sleep(2500);
      AppState.answer = "";
      prefs.store.edit().putBoolean("doubleTap", true).commit();
      tapControl("OK", true);
      waitUntil(() -> AppState.answer.equals("D"), 12000, "Capture after screen rotation");
      check(requests.get() == 2, "Exactly one request per tap");
      prefs.store.edit().putBoolean("doubleTap", false).commit();
      CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
      ApiClient.testTransport =
          (u, m, h, b, c) -> {
            entered.countDown();
            release.await(5, TimeUnit.SECONDS);
            return reply("LATE");
          };
      AppState.answer = "";
      click("OK");
      check(entered.await(8, TimeUnit.SECONDS), "Delayed request started");
      click("•••");
      release.countDown();
      SystemClock.sleep(700);
      check(AppState.answer.isEmpty(), "Cancelled result was discarded");
      prefs.store.edit().putString("indicator", "off").commit();
      ApiClient.testTransport =
          (u, m, h, b, c) -> {
            throw new IOException("Test connection failure");
          };
      click("OK");
      waitUntil(() -> node("!") != null, 7000, "Silent mode briefly shows error mark");
      SystemClock.sleep(1800);
      check(node("!") == null, "Error mark disappears");
      runOnMainSync(
          () ->
              context.startService(
                  new Intent(context, CaptureService.class).setAction(CaptureService.STOP)));
      waitUntil(() -> !AppState.active, 5000, "Session stops");
      SystemClock.sleep(300);
      check(node("OK") == null, "Overlay removed after stop");
      result.putString("stream", "\nPASS\n" + report);
      finish(Activity.RESULT_OK, result);
    } catch (Throwable error) {
      report
          .append("State: active=")
          .append(AppState.active)
          .append(" error=")
          .append(AppState.error)
          .append('\n');
      for (var window : getUiAutomation().getWindows()) {
        report
            .append("Window type=")
            .append(window.getType())
            .append(" title=")
            .append(window.getTitle())
            .append('\n');
        if (window.getRoot() != null) dump(window.getRoot(), report);
      }
      StringWriter trace = new StringWriter();
      report.append(AppState.debugEvents).append('\n');
      error.printStackTrace(new PrintWriter(trace));
      result.putString("stream", "\nFAIL\n" + report + trace);
      finish(Activity.RESULT_CANCELED, result);
    } finally {
      ApiClient.testTransport = null;
      getUiAutomation().setRotation(UiAutomation.ROTATION_UNFREEZE);
    }
  }

  private byte[] reply(String answer) {
    return ("{\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\""
            + answer
            + "\"}]}]}")
        .getBytes(StandardCharsets.UTF_8);
  }

  private synchronized void check(boolean ok, String name) {
    if (!ok) throw new AssertionError(name);
    report.append("✓ ").append(name).append('\n');
  }

  private void waitUntil(BooleanSupplier condition, int timeout, String name) {
    long end = SystemClock.elapsedRealtime() + timeout;
    while (SystemClock.elapsedRealtime() < end) {
      if (condition.getAsBoolean()) {
        check(true, name);
        return;
      }
      SystemClock.sleep(100);
    }
    throw new AssertionError(name);
  }

  private void shell(String command) throws Exception {
    try (var fd = getUiAutomation().executeShellCommand(command);
        var input = new FileInputStream(fd.getFileDescriptor())) {
      input.readAllBytes();
    }
  }

  private AccessibilityNodeInfo node(String text) {
    for (var window : getUiAutomation().getWindows()) {
      var root = window.getRoot();
      if (root != null) {
        var found = search(root, text);
        if (found != null) return found;
      }
    }
    return null;
  }

  private boolean overlayShown(String text) {
    AtomicBoolean visible = new AtomicBoolean();
    runOnMainSync(
        () -> {
          for (View view : android.view.inspector.WindowInspector.getGlobalWindowViews()) {
            if (view instanceof TextView label
                && text.contentEquals(label.getText())
                && view.isShown()
                && view.isAttachedToWindow()) visible.set(true);
          }
        });
    return visible.get();
  }

  private AccessibilityNodeInfo search(AccessibilityNodeInfo root, String text) {
    if (text.equalsIgnoreCase(root.getText() == null ? "" : root.getText().toString())) return root;
    for (int i = 0; i < root.getChildCount(); i++) {
      var child = root.getChild(i);
      if (child != null) {
        var found = search(child, text);
        if (found != null) return found;
      }
    }
    return null;
  }

  private void dump(AccessibilityNodeInfo node, StringBuilder result) {
    if (node.getText() != null || node.getContentDescription() != null)
      result
          .append("  ")
          .append(node.getText())
          .append(" / ")
          .append(node.getContentDescription())
          .append('\n');
    for (int i = 0; i < node.getChildCount(); i++)
      if (node.getChild(i) != null) dump(node.getChild(i), result);
  }

  private void click(String text) {
    waitUntil(() -> node(text) != null, 5000, "Found " + text);
    var n = node(text);
    while (n != null && !n.isClickable()) n = n.getParent();
    if (n == null || !n.performAction(AccessibilityNodeInfo.ACTION_CLICK))
      throw new AssertionError("Could not click " + text);
    SystemClock.sleep(200);
  }

  private void tapControl(String text, boolean twice) {
    waitUntil(() -> node(text) != null, 5000, "Found " + text);
    android.graphics.Rect bounds = new android.graphics.Rect();
    node(text).getBoundsInScreen(bounds);
    report.append("Tap bounds: ").append(bounds).append('\n');
    for (int tap = 0; tap < (twice ? 2 : 1); tap++) {
      long time = SystemClock.uptimeMillis();
      for (int action : new int[] {MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP}) {
        MotionEvent event =
            MotionEvent.obtain(
                time, SystemClock.uptimeMillis(), action, bounds.centerX(), bounds.centerY(), 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        check(getUiAutomation().injectInputEvent(event, true), "Touch injected");
        event.recycle();
        SystemClock.sleep(40);
      }
    }
  }

  private Button findButton(View root, String text) {
    if (root instanceof Button b && text.contentEquals(b.getText())) return b;
    if (root instanceof ViewGroup group)
      for (int i = 0; i < group.getChildCount(); i++) {
        Button result = findButton(group.getChildAt(i), text);
        if (result != null) return result;
      }
    return null;
  }
}
