package pl.okstudy.mobile;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** HTTPS only, bounded responses, no redirects carrying credentials. */
final class PlanHttp {
  static String request(
      String url, String method, String bearer, String type, String body, ApiClient.Cancel cancel)
      throws Exception {
    URI uri = URI.create(url);
    if (!"https".equals(uri.getScheme())
        || uri.getUserInfo() != null
        || uri.getPort() != -1
        || !("auth.openai.com".equals(uri.getHost()) || "api.openai.com".equals(uri.getHost())))
      throw new Exception("Nieprawidłowy adres logowania.");
    HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
    cancel.attach(connection);
    try {
      connection.setInstanceFollowRedirects(false);
      connection.setConnectTimeout(15000);
      connection.setReadTimeout("auth.openai.com".equals(uri.getHost()) ? 15000 : 90000);
      connection.setRequestMethod(method);
      connection.setRequestProperty("Accept", "application/json, text/event-stream");
      if (bearer != null) connection.setRequestProperty("Authorization", "Bearer " + bearer);
      if (body != null) {
        connection.setRequestProperty("Content-Type", type);
        byte[] data = body.getBytes(StandardCharsets.UTF_8);
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(data.length);
        try (OutputStream output = connection.getOutputStream()) {
          output.write(data);
        }
      }
      int status = connection.getResponseCode();
      InputStream stream =
          status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
      String result = "";
      if (stream != null) {
        try (InputStream input = stream;
            ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
          byte[] buffer = new byte[8192];
          int n;
          while ((n = input.read(buffer)) != -1) {
            cancel.check();
            if (bytes.size() + n > 16_000_000)
              throw new Exception("Odpowiedź OpenAI jest zbyt duża.");
            bytes.write(buffer, 0, n);
          }
          result = bytes.toString("UTF-8");
        }
      }
      cancel.check();
      if (status < 200 || status >= 300) throw failure(result, status);
      return result;
    } finally {
      connection.disconnect();
    }
  }

  static String form(Map<String, String> fields) throws Exception {
    StringJoiner joined = new StringJoiner("&");
    for (var e : fields.entrySet())
      joined.add(
          URLEncoder.encode(e.getKey(), "UTF-8") + "=" + URLEncoder.encode(e.getValue(), "UTF-8"));
    return joined.toString();
  }

  static Exception failure(String body, int status) {
    // Never put raw provider responses (or OAuth codes/tokens) in the UI or logs.
    if (body.contains("subscription_sharing_usage_limit_exceeded") || status == 429)
      return new Exception(
          "Osiągnięto limit planu ChatGPT lub limit aplikacji. Otwórz Zarządzaj użyciem w sekcji"
              + " AI.");
    if (body.contains("subscription_sharing_usage_unavailable") || status == 403)
      return new Exception(
          "Korzystanie z planu ChatGPT jest niedostępne dla tego konta lub modelu. Sprawdź zgodę i"
              + " ustawienia ChatGPT.");
    if (status == 401 || body.contains("invalid_grant"))
      return new Exception("Sesja ChatGPT wygasła lub została cofnięta. Zaloguj się ponownie.");
    if (status == 404)
      return new Exception("Model ChatGPT jest niedostępny. Odśwież listę modeli konta.");
    return new Exception(
        "ChatGPT nie ukończył operacji"
            + (status > 0 ? " (" + status + ")" : "")
            + ". Spróbuj ponownie lub wybierz inny model.");
  }

  static String completed(String stream, boolean only) throws Exception {
    JSONObject completed = null;
    for (String block : stream.split("\\r?\\n\\r?\\n")) {
      StringBuilder data = new StringBuilder();
      for (String line : block.split("\\r?\\n")) {
        if (line.startsWith("data:")) {
          if (data.length() > 0) data.append('\n');
          data.append(line.substring(5).replaceFirst("^ ", ""));
        }
      }
      if (data.length() == 0 || data.toString().equals("[DONE]")) continue;
      JSONObject event = new JSONObject(data.toString());
      String type = event.optString("type");
      if (type.equals("response.failed")
          || type.equals("error")
          || type.equals("response.incomplete")) throw failure(data.toString(), 0);
      if (type.equals("response.completed")) completed = event.getJSONObject("response");
    }
    if (completed == null)
      throw new Exception(
          "Połączenie zakończyło się przed pełną odpowiedzią ChatGPT. Spróbuj ponownie.");
    String answer = ApiClient.cleanAnswer(ApiClient.extract("openai", completed), only);
    if (answer.isEmpty()) throw new Exception("ChatGPT nie zwrócił odpowiedzi.");
    return answer;
  }
}
