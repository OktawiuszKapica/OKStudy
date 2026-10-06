package pl.okstudy.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Device-bound encryption; no plaintext fallback and no cloud backup. */
final class Secrets {
  private static final String ALIAS = "okstudy.mobile.keys.v1";
  private final SharedPreferences store;

  Secrets(Context context) {
    store = context.getSharedPreferences("encrypted-keys", Context.MODE_PRIVATE);
  }

  private SecretKey key() throws Exception {
    KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
    keys.load(null);
    if (!keys.containsAlias(ALIAS)) {
      KeyGenerator generator =
          KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      generator.init(
          new KeyGenParameterSpec.Builder(
                  ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .build());
      generator.generateKey();
    }
    return (SecretKey) keys.getKey(ALIAS, null);
  }

  synchronized void put(String provider, String value) throws Exception {
    if (value.isEmpty()) {
      store.edit().remove(provider).apply();
      return;
    }
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key());
    cipher.updateAAD(provider.getBytes(StandardCharsets.UTF_8));
    String encoded =
        Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
            + ":"
            + Base64.encodeToString(
                cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    if (!store.edit().putString(provider, encoded).commit())
      throw new Exception("Nie udało się zapisać klucza.");
  }

  synchronized String get(String provider) throws Exception {
    String encoded = store.getString(provider, "");
    if (encoded.isEmpty()) return "";
    try {
      String[] parts = encoded.split(":", 2);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.DECRYPT_MODE,
          key(),
          new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
      cipher.updateAAD(provider.getBytes(StandardCharsets.UTF_8));
      return new String(
          cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    } catch (Exception error) {
      throw new Exception("Klucz na tym urządzeniu jest niedostępny. Zapisz go ponownie.");
    }
  }

  boolean has(String provider) {
    return !store.getString(provider, "").isEmpty();
  }
}
