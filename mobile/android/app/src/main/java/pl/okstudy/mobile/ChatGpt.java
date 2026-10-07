package pl.okstudy.mobile;

import android.content.Context;
import android.os.SystemClock;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.json.*;

/** Native public OAuth client. Credentials remain encrypted on this phone. */
final class ChatGpt {
  private static final Object LOCK = new Object();
  private static final Object SESSION_LOCK = new Object();
  static final String RESOURCE = "https://api.openai.com/v1",
      SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
  static volatile long generation;
  static volatile Attempt pending;
  static volatile String loginMessage = "";

  static Map<String, String> fields(String... values) {
    Map<String, String> map = new LinkedHashMap<>();
    for (int i = 0; i < values.length; i += 2) map.put(values[i], values[i + 1]);
    return map;
  }

  private static JSONObject vault(Context c) throws Exception {
    String text = new Secrets(c).get("chatgpt.accounts");
    return text.isEmpty()
        ? new JSONObject().put("accounts", new JSONArray())
        : new JSONObject(text);
  }

  private static void persist(Context c, JSONObject value) throws Exception {
    new Secrets(c).put("chatgpt.accounts", value.toString());
  }

  static String selected(Context c) {
    return new Prefs(c).store.getString("chatgpt.activeId", "");
  }

  static JSONObject account(Context c, String id) throws Exception {
    synchronized (LOCK) {
      JSONArray array = vault(c).getJSONArray("accounts");
      for (int i = 0; i < array.length(); i++)
        if (array.getJSONObject(i).optString("client_id").equals(id)) return array.getJSONObject(i);
      return new JSONObject();
    }
  }

  static List<ApiClient.Model> accounts(Context c) throws Exception {
    synchronized (LOCK) {
      List<ApiClient.Model> result = new ArrayList<>();
      JSONArray rows = vault(c).getJSONArray("accounts");
      for (int i = 0; i < rows.length(); i++) {
        JSONObject a = rows.getJSONObject(i);
        String id = a.getString("client_id");
        result.add(
            new ApiClient.Model(
                id,
                a.optString("email", "Połączenie ChatGPT")
                    + " · "
                    + id.substring(Math.max(0, id.length() - 6))
                    + (a.optString("access_token").isEmpty() ? " · zaloguj ponownie" : "")));
      }
      return result;
    }
  }

  static boolean sharing(JSONObject a) {
    return Arrays.asList(a.optString("scope").split(" ")).contains("chatgpt.tokens.use.direct");
  }

  static void require(Context c, String id) throws Exception {
    JSONObject a = account(c, id);
    if (a.optString("access_token").isEmpty())
      throw new Exception("Najpierw połącz konto przyciskiem Continue with ChatGPT.");
    if (!sharing(a))
      throw new Exception(
          "Konto jest zalogowane, ale nie udzielono zgody na korzystanie z planu. Zaloguj je"
              + " ponownie.");
  }

  static void select(Context c, String id) throws Exception {
    synchronized (LOCK) {
      if (account(c, id).optString("client_id").isEmpty())
        throw new Exception("Nie znaleziono konta ChatGPT.");
      generation++;
      if (!new Prefs(c).store.edit().putString("chatgpt.activeId", id).commit())
        throw new Exception("Nie udało się zapisać wyboru konta.");
    }
  }

  private static void save(Context c, JSONObject record) throws Exception {
    synchronized (LOCK) {
      JSONObject v = vault(c);
      JSONArray rows = v.getJSONArray("accounts");
      for (int i = 0; i < rows.length(); i++)
        if (rows.getJSONObject(i).optString("client_id").equals(record.getString("client_id"))) {
          rows.put(i, record);
          persist(c, v);
          return;
        }
      if (rows.length() >= 20) throw new Exception("Zapisano już 20 połączeń ChatGPT.");
      rows.put(record);
      persist(c, v);
    }
  }

  static String token(Context c, String id, ApiClient.Cancel caller) throws Exception {
    caller.check();
    synchronized (SESSION_LOCK) {
      JSONObject record = account(c, id);
      require(c, id);
      if (record.optLong("expires_at") < System.currentTimeMillis() + 60000) {
        if (record.optString("refresh_token").isEmpty())
          throw new Exception("Zaloguj ponownie konto ChatGPT.");
        // A rotating refresh token must be persisted even if the originating task is cancelled.
        ApiClient.Cancel renewal = new ApiClient.Cancel();
        JSONObject renewed =
            exchange(
                fields(
                    "grant_type",
                    "refresh_token",
                    "client_id",
                    id,
                    "refresh_token",
                    record.getString("refresh_token"),
                    "resource",
                    RESOURCE),
                renewal);
        if (renewed.has("id_token"))
          Identity.verify(
              renewed.getString("id_token"), id, null, record.getString("subject"), renewal);
        updateTokens(record, renewed);
        save(c, record);
      }
      caller.check();
      if (!sharing(record))
        throw new Exception("Zgoda na korzystanie z planu ChatGPT została cofnięta.");
      return record.getString("access_token");
    }
  }

  private static JSONObject exchange(Map<String, String> values, ApiClient.Cancel cancel)
      throws Exception {
    return new JSONObject(
        PlanHttp.request(
            "https://auth.openai.com/api/accounts/oauth/token",
            "POST",
            null,
            "application/x-www-form-urlencoded",
            PlanHttp.form(values),
            cancel));
  }

  private static void updateTokens(JSONObject record, JSONObject data) throws Exception {
    if (data.optString("access_token").isEmpty()
        || !data.optString("token_type", "Bearer").equalsIgnoreCase("Bearer"))
      throw new Exception("Logowanie nie zwróciło dostępu do modeli.");
    record.put("access_token", data.getString("access_token"));
    for (String field : new String[] {"refresh_token", "id_token", "scope"})
      if (data.has(field)) record.put(field, data.get(field));
    record.put(
        "expires_at",
        System.currentTimeMillis()
            + Math.max(0, Math.min(86400, data.optLong("expires_in", 3600))) * 1000);
  }

  static boolean signOut(Context c, String id) throws Exception {
    synchronized (LOCK) {
      generation++;
    }
    synchronized (SESSION_LOCK) {
      JSONObject a = account(c, id);
      boolean revoked = a.optString("refresh_token").isEmpty();
      for (int attempt = 0; !revoked && attempt < 2; attempt++) {
        try {
          ApiClient.Cancel token = new ApiClient.Cancel();
          JSONObject discovery =
              new JSONObject(
                  PlanHttp.request(
                      "https://auth.openai.com/.well-known/openid-configuration",
                      "GET",
                      null,
                      null,
                      null,
                      token));
          URI url = URI.create(discovery.getString("revocation_endpoint"));
          if (!"auth.openai.com".equals(url.getHost())) throw new Exception();
          PlanHttp.request(
              url.toString(),
              "POST",
              null,
              "application/x-www-form-urlencoded",
              PlanHttp.form(
                  fields(
                      "token",
                      a.getString("refresh_token"),
                      "token_type_hint",
                      "refresh_token",
                      "client_id",
                      id)),
              token);
          revoked = true;
        } catch (Exception ignored) {
          if (attempt == 0) {
            try {
              Thread.sleep(400);
            } catch (InterruptedException stopped) {
              Thread.currentThread().interrupt();
              break;
            }
          }
        }
      }
      for (String field :
          new String[] {"access_token", "refresh_token", "id_token", "scope", "expires_at"})
        a.remove(field);
      if (a.has("client_id")) save(c, a);
      return revoked;
    }
  }

  static List<ApiClient.Model> models(Context c, String id, ApiClient.Cancel cancel)
      throws Exception {
    long epoch = generation;
    String diagnostic = "Nie odebrano pełnej odpowiedzi HTTP katalogu.";
    try {
      PlanHttp.Reply reply =
          PlanHttp.exchange(RESOURCE + "/models", "GET", token(c, id, cancel), null, null, cancel);
      diagnostic = reply.describe();
      JSONObject response = new JSONObject(reply.requireSuccess());
      diagnostic += "\n" + ChatGptDiagnostics.catalogSummary(response);
      JSONArray rows = response.getJSONArray("models");
      List<ApiClient.Model> result = new ArrayList<>();
      for (int i = 0; i < rows.length(); i++) {
        JSONObject row = rows.optJSONObject(i);
        if (row == null) continue;
        String slug = row.optString("slug");
        if (row.optString("visibility").equals("list") && ApiClient.validModel(slug))
          result.add(new ApiClient.Model(slug, row.optString("display_name", slug)));
      }
      cancel.check();
      if (epoch != generation)
        throw new Exception("Konto zostało zmienione. Pobierz modele ponownie.");
      return result;
    } finally {
      if (!cancel.cancelled && epoch == generation)
        ChatGptDiagnostics.catalog(id, epoch, diagnostic);
    }
  }

  static String analyze(
      Context c, String id, String model, String jpeg, boolean only, ApiClient.Cancel cancel)
      throws Exception {
    return analyze(c,id,model,jpeg,only,cancel,"");
  }

  static String analyze(
      Context c, String id, String model, String jpeg, boolean only, ApiClient.Cancel cancel, String task)
      throws Exception {
    if (!ApiClient.validModel(model) || jpeg.isEmpty() || jpeg.length() > 12_000_000)
      throw new Exception("Nieprawidłowe zadanie.");
    long epoch = generation;
    JSONObject body = ApiClient.payload("openai", model, jpeg, only, task);
    body.remove("max_output_tokens");
    body.put("stream", true);
    body.put("store", false);
    String access = token(c, id, cancel);
    if (epoch != generation) throw new Exception("Konto zostało zmienione. Ponów zadanie.");
    ResponsesStream stream = new ResponsesStream();
    String diagnostic = "Nie odebrano pełnej odpowiedzi HTTP analizy.";
    try {
      PlanHttp.Reply reply =
          PlanHttp.exchange(
              RESOURCE + "/responses", "POST", access, "application/json", body.toString(), cancel);
      diagnostic = reply.describe();
      String result = stream.read(reply.requireSuccess(), only);
      cancel.check();
      if (epoch != generation) throw new Exception("Konto zostało zmienione. Ponów zadanie.");
      return result;
    } finally {
      if (!cancel.cancelled && epoch == generation)
        ChatGptDiagnostics.response(
            id,
            epoch,
            "Źródło: POST api.openai.com/v1/responses\nWybrany model: "
                + model
                + "\n"
                + diagnostic
                + "\n"
                + stream.describe());
    }
  }

  static final class Attempt implements AutoCloseable {
    final Context context;
    final String existing, state, nonce, verifier, redirect, url;
    final long epoch;
    final ApiClient.Cancel cancel = new ApiClient.Cancel();
    final ServerSocket listener;

    Attempt(Context context, String selected) throws Exception {
      this.context = context.getApplicationContext();
      existing = selected == null ? "" : selected;
      synchronized (LOCK) {
        if (pending != null) throw new Exception("Logowanie jest już otwarte.");
        if (!existing.isEmpty() && account(context, existing).optString("client_id").isEmpty())
          throw new Exception("Wybierz zapisane konto ponownie.");
        epoch = ++generation;
      }
      state = random();
      nonce = random();
      verifier = random();
      listener = new ServerSocket();
      listener.bind(new InetSocketAddress("127.0.0.1", 0));
      listener.setSoTimeout(1000);
      redirect = "http://127.0.0.1:" + listener.getLocalPort() + "/auth/callback";
      try {
        Prefs prefs = new Prefs(context);
        String host = prefs.store.getString("chatgpt.host", "");
        if (host.isEmpty()) {
          host = "urn:uuid:" + UUID.randomUUID();
          if (!prefs.store.edit().putString("chatgpt.host", host).commit())
            throw new Exception("Nie udało się zapisać instalacji.");
        }
        Map<String, String> fields =
            fields(
                "client_id",
                existing.isEmpty() ? "dynamic_agent_client" : existing,
                "ext_agent_host_id",
                host,
                "response_type",
                "code",
                "redirect_uri",
                redirect,
                "scope",
                SCOPE,
                "resource",
                RESOURCE,
                "state",
                state,
                "nonce",
                nonce,
                "code_challenge_method",
                "S256",
                "code_challenge",
                Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(
                        MessageDigest.getInstance("SHA-256")
                            .digest(verifier.getBytes(StandardCharsets.US_ASCII))));
        if (existing.isEmpty()) fields.put("agent_name_hint", "OKStudy");
        url = "https://auth.openai.com/api/accounts/authorize?" + PlanHttp.form(fields);
      } catch (Exception e) {
        listener.close();
        throw e;
      }
    }

    void finish() throws Exception {
      long deadline = SystemClock.elapsedRealtime() + 160000;
      Map<String, String> callback = null;
      while (callback == null && SystemClock.elapsedRealtime() < deadline) {
        cancel.check();
        try (Socket socket = listener.accept()) {
          socket.setSoTimeout(2500);
          StringBuilder request = new StringBuilder();
          InputStream input = socket.getInputStream();
          while (request.length() < 16384 && !request.toString().endsWith("\r\n\r\n")) {
            int b = input.read();
            if (b < 0) break;
            request.append((char) b);
          }
          String[] lines = request.toString().split("\r\n");
          Map<String, String> params = new LinkedHashMap<>();
          boolean valid = false;
          try {
            String[] first = lines[0].split(" ");
            URI uri = URI.create(first[1]);
            String host = "";
            for (String line : lines)
              if (line.toLowerCase(Locale.ROOT).startsWith("host:"))
                host = line.substring(5).trim();
            if (!first[0].equals("GET")
                || uri.isAbsolute()
                || !uri.getPath().equals("/auth/callback")
                || !host.equals("127.0.0.1:" + listener.getLocalPort())) throw new Exception();
            for (String pair : uri.getRawQuery().split("&")) {
              String[] item = pair.split("=", 2);
              String key = URLDecoder.decode(item[0], "UTF-8");
              if (params.containsKey(key)) throw new Exception();
              params.put(key, URLDecoder.decode(item.length == 2 ? item[1] : "", "UTF-8"));
            }
            valid = Identity.same(state, params.getOrDefault("state", ""));
          } catch (Exception ignored) {
          }
          byte[] body =
              (valid
                      ? "OKStudy: wroc do aplikacji. Koncze laczenie konta."
                      : "Nieprawidlowe potwierdzenie.")
                  .getBytes(StandardCharsets.UTF_8);
          String head =
              "HTTP/1.1 "
                  + (valid ? "200 OK" : "400 Bad Request")
                  + "\r\n"
                  + "Content-Type: text/plain; charset=utf-8\r\n"
                  + "Cache-Control: no-store\r\n"
                  + "Content-Security-Policy: default-src 'none'\r\n"
                  + "Connection: close\r\n"
                  + "Content-Length: "
                  + body.length
                  + "\r\n\r\n";
          try {
            socket.getOutputStream().write(head.getBytes(StandardCharsets.US_ASCII));
            socket.getOutputStream().write(body);
          } catch (IOException ignored) {
          }
          if (valid) callback = params;
        } catch (SocketTimeoutException ignored) {
        }
      }
      listener.close();
      cancel.check();
      if (callback == null) throw new Exception("Minął czas logowania. Spróbuj ponownie.");
      if (callback.containsKey("error"))
        throw new Exception("Logowanie anulowano lub nie udzielono zgody.");
      String id = callback.getOrDefault("client_id", existing),
          code = callback.getOrDefault("code", "");
      if (!id.matches("[A-Za-z0-9_-]{1,200}")
          || id.equals("dynamic_agent_client")
          || (!existing.isEmpty() && !id.equals(existing))
          || code.isEmpty()
          || code.length() > 4096)
        throw new Exception("Nieprawidłowa rejestracja aplikacji ChatGPT.");
      JSONObject old = account(context, id);
      synchronized (LOCK) {
        cancel.check();
        if (generation != epoch) throw new Exception("Logowanie zostało przerwane.");
        if (existing.isEmpty()) {
          save(context, new JSONObject().put("client_id", id));
          new Prefs(context).store.edit().putString("chatgpt.pendingId", id).commit();
        }
      }
      synchronized (SESSION_LOCK) {
        JSONObject data =
            exchange(
                fields(
                    "grant_type",
                    "authorization_code",
                    "client_id",
                    id,
                    "code",
                    code,
                    "code_verifier",
                    verifier,
                    "redirect_uri",
                    redirect,
                    "resource",
                    RESOURCE),
                cancel);
        JSONObject identity =
            Identity.verify(
                data.optString("id_token"), id, nonce, old.optString("subject"), cancel);
        JSONObject record =
            new JSONObject()
                .put("client_id", id)
                .put("subject", identity.getString("sub"))
                .put("email", identity.optString("email", "Konto ChatGPT"))
                .put("scope", data.optString("scope"));
        updateTokens(record, data);
        synchronized (LOCK) {
          cancel.check();
          if (generation != epoch) throw new Exception("Konto zostało zmienione.");
          save(context, record);
          select(context, id);
          new Prefs(context)
              .store
              .edit()
              .remove("chatgpt.pendingId")
              .putString("provider", "chatgpt")
              .commit();
        }
        loginMessage =
            sharing(record)
                ? "Konto połączone. Korzystasz z planu ChatGPT."
                : "Konto połączone bez zgody na korzystanie z planu. Zaloguj ponownie i udziel"
                    + " zgody.";
      }
    }

    public void close() {
      cancel.cancel();
      try {
        listener.close();
      } catch (IOException ignored) {
      }
    }
  }

  private static String random() {
    byte[] bytes = new byte[32];
    new SecureRandom().nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }
}
