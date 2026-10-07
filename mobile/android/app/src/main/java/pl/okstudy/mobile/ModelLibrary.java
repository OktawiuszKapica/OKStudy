package pl.okstudy.mobile;

import android.content.Context;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.json.*;

/** Catalog metadata and favourites are isolated by provider and credential/account. */
final class ModelLibrary {
  static final long TTL = 6 * 60 * 60 * 1000L;
  private final Prefs prefs;
  private final String key;

  ModelLibrary(Context c, String provider, String credential) throws Exception {
    prefs = new Prefs(c);
    byte[] digest =
        MessageDigest.getInstance("SHA-256")
            .digest((provider + ":" + credential).getBytes(StandardCharsets.UTF_8));
    StringBuilder name = new StringBuilder("catalog.");
    for (byte b : digest) name.append(String.format(Locale.ROOT, "%02x", b));
    key = name.toString();
  }

  static ModelLibrary current(Context c) throws Exception {
    String provider = new Prefs(c).provider();
    return new ModelLibrary(
        c,
        provider,
        provider.equals("chatgpt") ? ChatGpt.selected(c) : new Secrets(c).get(provider));
  }

  boolean expired() {
    return System.currentTimeMillis() - prefs.store.getLong(key + ".at", 0) >= TTL;
  }

  List<ApiClient.Model> models() {
    List<ApiClient.Model> result = new ArrayList<>();
    try {
      JSONArray rows = new JSONArray(prefs.store.getString(key, "[]"));
      for (int i = 0; i < rows.length(); i++) {
        JSONObject row = rows.getJSONObject(i);
        if (ApiClient.validModel(row.optString("id")))
          result.add(new ApiClient.Model(row.getString("id"), row.optString("name")));
      }
    } catch (JSONException ignored) {
    }
    Set<String> favourites = favourites();
    result.sort(
        Comparator.comparing((ApiClient.Model m) -> !favourites.contains(m.id()))
            .thenComparing(ApiClient.Model::name, String.CASE_INSENSITIVE_ORDER));
    return result;
  }

  void save(List<ApiClient.Model> models) throws Exception {
    Set<String> previous = new HashSet<>();
    for (ApiClient.Model m : models()) previous.add(m.id());
    JSONObject oldFresh = new JSONObject(prefs.store.getString(key + ".newTimes", "{}"));
    JSONObject fresh = new JSONObject();
    JSONArray rows = new JSONArray();
    Set<String> current = new HashSet<>();
    for (ApiClient.Model m : models) {
      if (!ApiClient.validModel(m.id()) || !current.add(m.id())) continue;
      long newAt =
          !previous.isEmpty() && !previous.contains(m.id())
              ? System.currentTimeMillis()
              : oldFresh.optLong(m.id(), 0);
      if (System.currentTimeMillis() - newAt < 86400000) fresh.put(m.id(), newAt);
      rows.put(
          new JSONObject()
              .put("id", m.id())
              .put("name", m.name().substring(0, Math.min(160, m.name().length()))));
      if (rows.length() >= 2000) break;
    }
    prefs
        .store
        .edit()
        .putString(key, rows.toString())
        .putLong(key + ".at", System.currentTimeMillis())
        .putString(key + ".newTimes", fresh.toString())
        .apply();
  }

  Set<String> favourites() {
    return new HashSet<>(prefs.store.getStringSet(key + ".favourites", Collections.emptySet()));
  }

  void toggle(String id) throws Exception {
    if (!ApiClient.validModel(id)) throw new Exception("Wybierz poprawny model.");
    Set<String> saved = favourites();
    if (!saved.remove(id)) {
      if (saved.size() >= 8)
        throw new Exception("Możesz zachować 8 ulubionych modeli dla połączenia.");
      saved.add(id);
    }
    prefs.store.edit().putStringSet(key + ".favourites", saved).apply();
  }

  String label(ApiClient.Model m) {
    boolean fresh = false;
    try {
      fresh =
          System.currentTimeMillis()
                  - new JSONObject(prefs.store.getString(key + ".newTimes", "{}"))
                      .optLong(m.id(), 0)
              < 86400000;
    } catch (JSONException ignored) {
    }
    return (favourites().contains(m.id()) ? "★ " : "")
        + m.name()
        + (fresh ? " · Nowy" : "")
        + (m.name().equals(m.id()) ? "" : "\n" + m.id());
  }
}
