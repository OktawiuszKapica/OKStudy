package pl.okstudy.mobile;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.RSAPublicKeySpec;
import java.util.Base64;
import org.json.*;

/** OIDC validation: no unverified JWT claims enter the account store. */
final class Identity {
  static JSONObject verify(
      String jwt, String client, String nonce, String subject, ApiClient.Cancel cancel)
      throws Exception {
    if (jwt == null || jwt.length() > 32768) throw invalid();
    String[] parts = jwt.split("\\.", -1);
    if (parts.length != 3) throw invalid();
    JSONObject header = decode(parts[0]), claims = decode(parts[1]);
    if (!header.optString("alg").equals("RS256")
        || header.has("crit")
        || header.optString("kid").isEmpty()) throw invalid();
    JSONObject jwks =
        new JSONObject(
            PlanHttp.request(
                "https://auth.openai.com/.well-known/jwks.json", "GET", null, null, null, cancel));
    JSONArray keys = jwks.getJSONArray("keys");
    boolean valid = false;
    for (int i = 0; i < keys.length(); i++) {
      JSONObject key = keys.getJSONObject(i);
      if (!key.optString("kid").equals(header.getString("kid"))
          || !key.optString("kty").equals("RSA")
          || !key.optString("use", "sig").equals("sig")
          || !key.optString("alg", "RS256").equals("RS256")) continue;
      Signature signature = Signature.getInstance("SHA256withRSA");
      signature.initVerify(
          KeyFactory.getInstance("RSA")
              .generatePublic(
                  new RSAPublicKeySpec(
                      new BigInteger(1, Base64.getUrlDecoder().decode(key.getString("n"))),
                      new BigInteger(1, Base64.getUrlDecoder().decode(key.getString("e"))))));
      signature.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
      valid = signature.verify(Base64.getUrlDecoder().decode(parts[2]));
      break;
    }
    long now = System.currentTimeMillis() / 1000;
    Object audience = claims.opt("aud");
    boolean audienceMatches = client.equals(audience);
    if (audience instanceof JSONArray array) {
      for (int i = 0; i < array.length(); i++)
        if (client.equals(array.optString(i))) audienceMatches = true;
      if (array.length() > 1 && !client.equals(claims.optString("azp"))) throw invalid();
    }
    if (!valid
        || !audienceMatches
        || !claims.optString("iss").equals("https://auth.openai.com")
        || claims.optLong("exp", 0) <= now
        || claims.optLong("nbf", 0) > now + 30
        || claims.optString("sub").isEmpty()
        || (nonce != null && !same(nonce, claims.optString("nonce")))
        || (subject != null && !subject.isEmpty() && !same(subject, claims.optString("sub"))))
      throw invalid();
    return claims;
  }

  static boolean same(String a, String b) {
    return MessageDigest.isEqual(
        a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
  }

  private static JSONObject decode(String value) throws Exception {
    return new JSONObject(new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8));
  }

  private static Exception invalid() {
    return new Exception(
        "Nie udało się potwierdzić tożsamości konta ChatGPT. Zaloguj się ponownie.");
  }
}
