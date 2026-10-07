package pl.okstudy.mobile;

import java.time.Instant;
import java.util.*;
import org.json.*;

/**
 * In-memory protocol metadata. Never store bodies, credentials, account email or image/text input.
 */
final class ChatGptDiagnostics {
  private record Saved(String account, long generation, String text) {}

  private static volatile Saved catalog, response;

  static void catalog(String account, long generation, String text) {
    catalog = new Saved(account, generation, "KATALOG · " + Instant.now() + "\n" + text);
  }

  static void response(String account, long generation, String text) {
    response = new Saved(account, generation, "ODPOWIEDŹ · " + Instant.now() + "\n" + text);
  }

  static String report(String account, long generation) {
    return "OKStudy Mobile "
        + BuildConfig.VERSION_NAME
        + " · diagnostyka ChatGPT\n"
        + "Raport zawiera metadane, bez danych logowania, obrazu i treści zadania/odpowiedzi.\n\n"
        + matching(
            catalog, account, generation, "Pobierz modele konta, aby zapisać raport katalogu.")
        + "\n\n"
        + matching(response, account, generation, "Wykonaj analizę, aby zapisać raport odbioru.");
  }

  private static String matching(Saved value, String account, long generation, String empty) {
    return value != null && value.generation == generation && value.account.equals(account)
        ? value.text
        : empty;
  }

  static String catalogSummary(JSONObject value) {
    JSONArray rows = value.optJSONArray("models");
    JSONArray data = value.optJSONArray("data");
    StringBuilder report =
        new StringBuilder("Źródło: GET api.openai.com/v1/models\n")
            .append("Żądanie z pominięciem cache HTTP.\n")
            .append("Tablica models: ")
            .append(rows == null ? "brak" : rows.length())
            .append("\nTablica data: ")
            .append(data == null ? "brak" : data.length())
            .append("\nhas_more: ")
            .append(value.optBoolean("has_more", false));
    if (rows == null) return report.toString();
    int visible = 0, invalid = 0;
    List<String> lines = new ArrayList<>();
    Map<String, String> wanted = new LinkedHashMap<>();
    // These are diagnostic probes for the reported issue, never a hardcoded picker list.
    for (String id : new String[] {"gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna"})
      wanted.put(id, "niezwrócony w tablicy models");
    for (int i = 0; i < rows.length(); i++) {
      JSONObject row = rows.optJSONObject(i);
      if (row == null || !ApiClient.validModel(row.optString("slug"))) {
        invalid++;
        continue;
      }
      String slug = row.optString("slug"), flag = row.optString("visibility");
      boolean listed = flag.equals("list");
      if (listed) visible++;
      String visibility = flag.isEmpty() ? "brak" : flag.matches("[a-z_]{1,30}") ? flag : "inna";
      String result =
          "visibility=" + visibility + (listed ? " · pokazany" : " · pominięty przez filtr");
      if (wanted.containsKey(slug)) wanted.put(slug, result);
      if (lines.size() < 160) lines.add(slug + " | " + result);
    }
    report
        .append("\nPokazane: ")
        .append(visible)
        .append("\nNieprawidłowe wpisy: ")
        .append(invalid)
        .append("\n");
    for (var entry : wanted.entrySet())
      report.append("\n").append(entry.getKey()).append(": ").append(entry.getValue());
    report.append("\n\nWpisy zwrócone przez serwer:\n").append(String.join("\n", lines));
    if (rows.length() > 160) report.append("\nRaport wypisuje pierwsze 160 poprawnych wpisów.");
    return report.toString();
  }
}
