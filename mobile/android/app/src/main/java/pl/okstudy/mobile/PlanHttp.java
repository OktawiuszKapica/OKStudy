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
      connection.setUseCaches(false);
      if (method.equals("GET")) connection.setRequestProperty("Cache-Control", "no-cache");
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
    String code = "", reason = "", param = "";
    try {
      JSONObject detail = new JSONObject(body);
      JSONObject response = detail.optJSONObject("response");
      if (response != null) detail = response;
      JSONObject error = detail.optJSONObject("error");
      if (error != null) {
        code = error.isNull("code") ? "" : error.optString("code");
        if (code.isEmpty()) code = error.optString("type");
        param = error.isNull("param") ? "" : error.optString("param");
      } else if (detail.opt("error") instanceof String) code = detail.getString("error");
      else code = detail.optString("code");
      JSONObject incomplete = detail.optJSONObject("incomplete_details");
      if (incomplete != null) reason = incomplete.optString("reason");
    } catch (JSONException ignored) {
    }
    String message =
        switch (code) {
          case "subscription_sharing_usage_limit_exceeded" ->
              "Osiągnięto limit planu ChatGPT lub aplikacji. Otwórz Zarządzaj użyciem w"
                  + " Połączeniach.";
          case "subscription_sharing_usage_unavailable", "subscription_sharing_user_unavailable" ->
              "OpenAI nie może teraz sprawdzić dostępności planu. Spróbuj później; konto pozostaje"
                  + " zapisane.";
          case "subscription_sharing_user_not_eligible" ->
              "Plan ChatGPT jest niedostępny dla wybranego konta lub obszaru roboczego. Sprawdź"
                  + " Zarządzaj użyciem.";
          case "subscription_sharing_unsupported_capability" ->
              "To połączenie ChatGPT nie obsługuje wybranej funkcji lub modelu. Sprawdź wskazane"
                  + " pole zadania.";
          case "subscription_sharing_route_not_supported" ->
              "OpenAI nie udostępnia tej operacji dla połączenia. Zgłoś ten komunikat.";
          case "subscription_sharing_invalid_user",
              "chatpass_v2_scope_not_authorized",
              "chatpass_v2_invalid_authorization_context" ->
              "OpenAI nie zaakceptowało uprawnień tego połączenia. Sprawdź konto i zgodę na użycie"
                  + " planu.";
          case "invalid_grant",
              "invalid_token",
              "token_expired",
              "invalid_refresh_token",
              "refresh_token_expired",
              "refresh_token_invalidated",
              "refresh_token_reused" ->
              "Sesja ChatGPT wygasła lub została cofnięta. Zaloguj się ponownie.";
          case "model_not_found", "model_not_available", "unsupported_model" ->
              "Ten model nie jest dostępny dla połączenia ChatGPT. Odśwież listę i zapisz inny"
                  + " model.";
          case "invalid_request_error", "invalid_value", "unsupported_parameter" ->
              "OpenAI odrzuciło parametry zadania. Zgłoś ten komunikat wraz z nazwą wybranego"
                  + " modelu.";
          case "invalid_image", "invalid_image_format", "invalid_base64_image", "image_too_large" ->
              "OpenAI odrzuciło obraz. Zaznacz mniejszy fragment i spróbuj ponownie.";
          case "rate_limit_exceeded" ->
              "Zbyt wiele zapytań do ChatGPT. Odczekaj chwilę i ponów zadanie.";
          case "server_error", "internal_error" ->
              "Błąd po stronie OpenAI. Spróbuj ponownie za chwilę.";
          default -> "";
        };
    // Only known protocol identifiers are safe to expose, never arbitrary error text.
    String diagnostic = message.isEmpty() ? "" : code;
    if (message.isEmpty() && reason.equals("max_output_tokens")) {
      message = "ChatGPT przerwał odpowiedź po osiągnięciu limitu długości. Zawęź zadanie.";
      diagnostic = reason;
    } else if (message.isEmpty() && reason.equals("content_filter")) {
      message = "ChatGPT nie ukończył odpowiedzi z powodu ograniczeń treści.";
      diagnostic = reason;
    }
    if (message.isEmpty())
      message =
          switch (status) {
            case 401 ->
                "OpenAI nie zaakceptowało tego połączenia. Sprawdź konto i zgodę na użycie planu.";
            case 403 -> "Brak dostępu do tej operacji ChatGPT. Sprawdź zgodę i ustawienia konta.";
            case 404 -> "Model lub operacja ChatGPT są niedostępne. Odśwież listę modeli.";
            case 429 -> "Osiągnięto limit zapytań. Odczekaj chwilę i sprawdź Zarządzaj użyciem.";
            default ->
                status >= 500
                    ? "Błąd po stronie OpenAI. Spróbuj ponownie za chwilę."
                    : "ChatGPT nie ukończył operacji. Spróbuj ponownie lub wybierz inny model.";
          };
    String details = status > 0 ? "HTTP " + status : "";
    if (!diagnostic.isEmpty()) details += (details.isEmpty() ? "" : "; ") + diagnostic;
    if (param.matches("[a-z_]{1,40}(?:\\.[a-z_0-9]{1,40}|\\[[0-9]{1,4}\\]){0,6}"))
      details += (details.isEmpty() ? "" : "; ") + "pole: " + param;
    return new Exception(message + (details.isEmpty() ? "" : " (" + details + ")"));
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
    if (completed.has("error") && !completed.isNull("error"))
      throw failure(completed.toString(), 0);
    String answer = ApiClient.cleanAnswer(ApiClient.extract("openai", completed), only);
    if (answer.isEmpty()) throw new Exception("ChatGPT nie zwrócił odpowiedzi.");
    return answer;
  }
}
