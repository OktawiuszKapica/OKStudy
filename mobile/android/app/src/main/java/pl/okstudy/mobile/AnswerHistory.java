package pl.okstudy.mobile;

import android.content.Context;
import java.util.*;
import org.json.*;

/** Bounded text-only history; persistent storage is explicit and encrypted with Keystore. */
final class AnswerHistory {
  record Entry(String id, long at, String provider, String model, String text, boolean pinned) {}

  private static final List<Entry> items = new ArrayList<>();
  private static boolean loaded;

  private static void load(Context c) throws Exception {
    if (loaded) return;
    List<Entry> restored = new ArrayList<>();
    if (new Prefs(c).store.getBoolean("persistentHistory", false)) {
      String saved = new Secrets(c).get("answer.history");
      if (!saved.isEmpty()) {
        JSONArray rows = new JSONArray(saved);
        for (int i = 0; i < Math.min(60, rows.length()); i++) {
          JSONObject row = rows.getJSONObject(i);
          String text = row.optString("text");
          if (text.isEmpty() || text.length() > 100000) continue;
          if (restored.stream().mapToInt(e -> e.text.length()).sum() + text.length() > 600000)
            break;
          restored.add(
              new Entry(
                  row.getString("id"),
                  row.optLong("at"),
                  row.optString("provider"),
                  row.optString("model"),
                  text,
                  row.optBoolean("pinned")));
        }
      }
    }
    items.addAll(restored);
    loaded = true;
  }

  static synchronized List<Entry> list(Context c, String query) throws Exception {
    load(c);
    String find = query.trim().toLowerCase(Locale.forLanguageTag("pl"));
    return items.stream()
        .filter(
            e -> (e.text + " " + e.model).toLowerCase(Locale.forLanguageTag("pl")).contains(find))
        .sorted(
            Comparator.comparing(Entry::pinned)
                .reversed()
                .thenComparing(Entry::at, Comparator.reverseOrder()))
        .collect(java.util.stream.Collectors.toList());
  }

  static synchronized void add(Context c, String text, AiConnection connection) throws Exception {
    load(c);
    if (text.trim().isEmpty()) return;
    items.add(
        0,
        new Entry(
            UUID.randomUUID().toString(),
            System.currentTimeMillis(),
            connection.provider,
            connection.model,
            text.substring(0, Math.min(text.length(), 100000)),
            false));
    while (items.size() > 60 || items.stream().mapToInt(e -> e.text.length()).sum() > 600000) {
      int remove = items.size() - 1;
      while (remove > 0 && items.get(remove).pinned) remove--;
      items.remove(remove);
    }
    persist(c);
  }

  static synchronized void pin(Context c, String id) throws Exception {
    load(c);
    for (int i = 0; i < items.size(); i++) {
      Entry e = items.get(i);
      if (e.id.equals(id)) {
        if (!e.pinned && items.stream().filter(Entry::pinned).count() >= 20)
          throw new Exception("Możesz przypiąć 20 odpowiedzi.");
        items.set(i, new Entry(e.id, e.at, e.provider, e.model, e.text, !e.pinned));
      }
    }
    persist(c);
  }

  static synchronized void remove(Context c, String id) throws Exception {
    load(c);
    items.removeIf(e -> id == null || e.id.equals(id));
    persist(c);
  }

  static synchronized void persistent(Context c, boolean enabled) throws Exception {
    load(c);
    // Remove old disk data before turning persistence off; a failure leaves the setting unchanged.
    if (!enabled) new Secrets(c).put("answer.history", "");
    if (!new Prefs(c).store.edit().putBoolean("persistentHistory", enabled).commit())
      throw new Exception("Nie zapisano ustawienia historii.");
    if (enabled) persist(c);
  }

  private static void persist(Context c) throws Exception {
    if (!new Prefs(c).store.getBoolean("persistentHistory", false)) return;
    JSONArray rows = new JSONArray();
    for (Entry e : items)
      rows.put(
          new JSONObject()
              .put("id", e.id)
              .put("at", e.at)
              .put("provider", e.provider)
              .put("model", e.model)
              .put("text", e.text)
              .put("pinned", e.pinned));
    new Secrets(c).put("answer.history", rows.toString());
  }
}
