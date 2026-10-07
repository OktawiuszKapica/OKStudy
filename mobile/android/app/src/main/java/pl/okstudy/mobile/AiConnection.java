package pl.okstudy.mobile;

import android.content.Context;

/** A snapshot of the user's explicit provider/account/model choice for one task. */
final class AiConnection {
  final Context context;
  final String provider, model, key, account;
  final long epoch;
  final String task;

  AiConnection(Context c) throws Exception {
    context = c.getApplicationContext();
    Prefs prefs = new Prefs(c);
    provider = prefs.provider();
    model = prefs.model();
    account = ChatGpt.selected(c);
    epoch = ChatGpt.generation;
    task = "";
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
      return ChatGpt.analyze(context, account, model, image, only, cancel, task);
    }
    return new ApiClient().analyze(provider, key, model, image, only, cancel, task);
  }

  private AiConnection(AiConnection source, String selectedModel, String prompt) {
    context = source.context;
    provider = source.provider;
    model = selectedModel;
    key = source.key;
    account = source.account;
    epoch = source.epoch;
    task = prompt;
  }

  AiConnection withModel(String selectedModel) throws Exception {
    if (!ApiClient.validModel(selectedModel) || selectedModel.equals(model))
      throw new Exception("Wybierz inny model do sprawdzenia.");
    return new AiConnection(this, selectedModel, task);
  }

  AiConnection withMainQuestion() {
    return new AiConnection(this, model, "To cały ekran. Rozwiąż tylko jedno główne pytanie pośrodku obrazu, z całą jego treścią i wariantami ABCD. Pomijaj reklamy, nawigację i inne zadania. Gdy kilka pytań jest równie wyraźnych i nie można wybrać jednego, zwróć krótko: Wybierz fragment. Nie zgaduj intencji użytkownika.");
  }
}
