package pl.okstudy.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.LocalDate;

final class Prefs {
  private static final Object SPEECH_LOCK = new Object();
  final SharedPreferences store;

  Prefs(Context context) {
    store = context.getSharedPreferences("preferences", Context.MODE_PRIVATE);
  }

  String provider() {
    return store.getString("provider", "gemini");
  }

  String model() {
    return store.getString(modelKey(), "");
  }

  String modelKey() {
    return "model."
        + provider()
        + (provider().equals("chatgpt") ? "." + store.getString("chatgpt.activeId", "") : "");
  }

  String cropMode() {
    return store.getString("cropMode", "ask");
  }

  float answerX() {
    return Math.max(0, Math.min(1, store.getFloat("answerX", .94f)));
  }

  float answerY() {
    return Math.max(0, Math.min(1, store.getFloat("answerY", .84f)));
  }

  String longPress() {
    return store.getString("longPress", "menu");
  }

  void profile(String name) {
    var edit = store.edit().putString("profile", name);
    switch (name) {
      case "discreet":
        edit.putBoolean("answerOnly", true)
            .putString("style", "text")
            .putFloat("opacity", .18f)
            .putInt("textSize", 14)
            .putInt("duration", 6)
            .putString("indicator", "off")
            .putString("voice", "off");
        break;
      case "readable":
        edit.putBoolean("answerOnly", true)
            .putString("style", "card")
            .putFloat("opacity", .8f)
            .putInt("textSize", 21)
            .putInt("duration", 15)
            .putString("indicator", "minimal")
            .putString("voice", "off");
        break;
      case "study":
        edit.putBoolean("answerOnly", false)
            .putString("style", "card")
            .putFloat("opacity", .8f)
            .putInt("textSize", 18)
            .putInt("duration", 30)
            .putString("indicator", "full")
            .putString("voice", "off");
        break;
      case "voice":
        edit.putBoolean("answerOnly", true)
            .putString("voice", "only")
            .putString("engine", "system")
            .putString("indicator", "minimal");
        break;
    }
    edit.apply();
  }

  boolean only() {
    return store.getBoolean("answerOnly", true);
  }

  boolean doubleTap() {
    return store.getBoolean("doubleTap", true);
  }

  float opacity() {
    return Math.max(.05f, Math.min(.8f, store.getFloat("opacity", .65f)));
  }

  int textSize() {
    return Math.max(12, Math.min(26, store.getInt("textSize", 16)));
  }

  int duration() {
    return Math.max(3, Math.min(30, store.getInt("duration", 10)));
  }

  String style() {
    return store.getString("style", "text");
  }

  String indicator() {
    return store.getString("indicator", "minimal");
  }

  String voice() {
    return store.getString("voice", "off");
  }

  String engine() {
    return store.getString("engine", "system");
  }

  String color() {
    return store.getString("color", "light");
  }

  String position() {
    return store.getString("position", "bottom");
  }

  void reserveSpeech() throws Exception {
    synchronized (SPEECH_LOCK) {
      String day = LocalDate.now().toString();
      int count = day.equals(store.getString("speechDay", "")) ? store.getInt("speechCount", 0) : 0;
      int limit = store.getInt("speechLimit", 0);
      if (limit > 0 && count >= limit)
        throw new Exception("Osiągnięto dzienny limit nowych nagrań OpenAI.");
      if (!store.edit().putString("speechDay", day).putInt("speechCount", count + 1).commit())
        throw new Exception("Nie udało się zapisać licznika odczytów.");
    }
  }
}
