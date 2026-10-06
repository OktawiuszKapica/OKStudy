package pl.okstudy.mobile;

import android.content.Context;

/** A snapshot of the user's explicit provider/account/model choice for one task. */
final class AiConnection {
  final Context context;
  final String provider, model, key, account;
  final long epoch;

  AiConnection(Context c) throws Exception {
    context = c.getApplicationContext();
    Prefs prefs = new Prefs(c);
    provider = prefs.provider();
    model = prefs.model();
    account = ChatGpt.selected(c);
    epoch = ChatGpt.generation;
    key = provider.equals("chatgpt") ? "" : new Secrets(c).get(provider);
    if (provider.equals("chatgpt")) {
      ChatGpt.require(c, account);
      if (!ApiClient.validModel(model))
        throw new Exception("Pobierz modele konta ChatGPT i zapisz wybór.");
    } else ApiClient.validate(provider, key, model);
  }

  String analyze(String image, boolean only, ApiClient.Cancel cancel) throws Exception {
    cancel.check();
    if (provider.equals("chatgpt")) {
      if (epoch != ChatGpt.generation)
        throw new Exception("Konto zostało zmienione. Ponów zadanie.");
      return ChatGpt.analyze(context, account, model, image, only, cancel);
    }
    return new ApiClient().analyze(provider, key, model, image, only, cancel);
  }
}
