package pl.okstudy.mobile;

import java.io.*;
import java.net.*;
import java.util.regex.*;
import org.json.*;

/** Runs only after the user's button press. No keys, account details or device IDs are sent. */
final class UpdateChecker {
  record Release(String version, String url) {}

  static Release latest() throws Exception {
    HttpURLConnection http =
        (HttpURLConnection)
            URI.create("https://api.github.com/repos/OktawiuszKapica/OKStudy/releases?per_page=20")
                .toURL()
                .openConnection();
    try {
      http.setInstanceFollowRedirects(false);
      http.setConnectTimeout(10000);
      http.setReadTimeout(15000);
      http.setRequestProperty("Accept", "application/vnd.github+json");
      http.setRequestProperty("User-Agent", "OKStudy-Mobile/" + BuildConfig.VERSION_NAME);
      if (http.getResponseCode() != 200) throw new IOException();
      String body;
      try (InputStream input = http.getInputStream();
          ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
        byte[] buffer = new byte[8192];
        int n;
        while ((n = input.read(buffer)) != -1) {
          if (bytes.size() + n > 2_000_000) throw new IOException();
          bytes.write(buffer, 0, n);
        }
        body = bytes.toString("UTF-8");
      }
      JSONArray releases = new JSONArray(body);
      Release best = null;
      Pattern pattern =
          Pattern.compile("OKStudy-Mobile-([0-9]{1,5}\\.[0-9]{1,5}\\.[0-9]{1,5})\\.apk");
      for (int i = 0; i < releases.length(); i++) {
        JSONObject release = releases.getJSONObject(i);
        if (release.optBoolean("draft")) continue;
        JSONArray assets = release.optJSONArray("assets");
        if (assets == null) continue;
        for (int j = 0; j < assets.length(); j++) {
          JSONObject asset = assets.getJSONObject(j);
          Matcher match = pattern.matcher(asset.optString("name"));
          if (!match.matches()) continue;
          URI uri = URI.create(asset.optString("browser_download_url"));
          if (!"https".equals(uri.getScheme())
              || !"github.com".equals(uri.getHost())
              || uri.getUserInfo() != null
              || uri.getPort() != -1
              || !uri.getPath().startsWith("/OktawiuszKapica/OKStudy/releases/download/")) continue;
          String version = match.group(1);
          if (newer(version, best == null ? BuildConfig.VERSION_NAME : best.version()))
            best = new Release(version, uri.toString());
        }
      }
      return best;
    } finally {
      http.disconnect();
    }
  }

  static boolean newer(String a, String b) {
    String[] x = a.split("\\."), y = b.split("\\.");
    for (int i = 0; i < 3; i++) {
      int diff = Integer.parseInt(x[i]) - Integer.parseInt(y[i]);
      if (diff != 0) return diff > 0;
    }
    return false;
  }
}
