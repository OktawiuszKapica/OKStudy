package pl.okstudy.mobile;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
  private static final int OVERLAY = 10, CAPTURE = 11, IMAGE = 12, NOTIFICATION = 13, CHATGPT = 14;
  private static final String[] PROVIDERS = {"chatgpt", "gemini", "claude", "openai", "grok"};
  private static final String[] PROVIDER_NAMES = {
    "ChatGPT — Twój plan", "Gemini — API", "Claude — API", "OpenAI — API", "Grok — API"
  };
  private Prefs prefs;
  private Secrets secrets;
  private EditText keyField, modelField;
  private TextView status, answer, sessionState, modelHint;
  private Button start, analyzeImage, catalog;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final ExecutorService network = Executors.newFixedThreadPool(2);
  private ApiClient.Cancel request, catalogRequest;
  private boolean pendingStart, alive;
  private boolean statusError;
  private String image, displayedAnswer = "", displayedError = "";
  private Speech speech;
  private int selectedTab;
  private int imageVersion;
  private LinearLayout[] pages;
  private Button[] tabs;
  private ScrollView scroll;
  private LinearLayout accountBox, apiBox;
  private AnswerPreview preview;
  private Spinner positionPicker;
  private SeekBar positionX, positionY;
  private TextView positionXValue, positionYValue;
  private final Runnable refresh =
      new Runnable() {
        public void run() {
          if (alive) {
            refreshState();
            handler.postDelayed(this, 1000);
          }
        }
      };

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    alive = true;
    prefs = new Prefs(this);
    secrets = new Secrets(this);
    speech = new Speech(this);
    pendingStart = state != null && state.getBoolean("pendingStart");
    selectedTab = state == null ? 0 : Math.max(0, Math.min(2, state.getInt("tab", 0)));
    build();
    accept(getIntent());
  }

  private void build() {
    LinearLayout root = Design.column(this);
    root.setBackgroundColor(Design.BG);
    scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.setBackgroundColor(Design.BG);
    LinearLayout page = Design.column(this);
    page.setPadding(dp(22), dp(18), dp(22), dp(34));
    scroll.addView(page);
    root.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          v.setPadding(0, insets.getSystemWindowInsetTop(), 0, insets.getSystemWindowInsetBottom());
          return insets;
        });
    root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
    setContentView(root);
    LinearLayout logo = new LinearLayout(this);
    logo.setGravity(Gravity.CENTER_VERTICAL);
    logo.addView(new Design.Mark(this), new LinearLayout.LayoutParams(dp(45), dp(35)));
    TextView name = Design.text(this, "  OKStudy", 25, Design.TEXT, true);
    logo.addView(name, new LinearLayout.LayoutParams(0, -2, 1));
    logo.addView(Design.chip(this, "MOBILE / 02"));
    page.addView(logo);
    LinearLayout home = Design.column(this),
        aiPage = Design.column(this),
        stylePage = Design.column(this);
    pages = new LinearLayout[] {home, aiPage, stylePage};
    for (LinearLayout section : pages) page.addView(section);
    Design.art(this, home, R.drawable.focus_hero, 178);
    TextView eyebrow = Design.text(this, "TWOJA POMOC W NAUCE · MOBILE", 10, Design.LIME, true);
    eyebrow.setLetterSpacing(.12f);
    eyebrow.setPadding(0, dp(7), 0, dp(10));
    home.addView(eyebrow);
    home.addView(Design.text(this, "Twój mały skrót\ndo zrozumienia.", 29, Design.TEXT, true));
    TextView intro =
        Design.text(
            this,
            "Uruchom sesję, otwórz zadanie i stuknij w pływający przycisk OKStudy.",
            14,
            Design.MUTED,
            false);
    intro.setPadding(0, dp(12), 0, dp(12));
    home.addView(intro);
    sessionState = Design.text(this, "", 12, Design.MUTED, false);
    home.addView(sessionState);
    start = Design.button(this, "Uruchom pomoc na ekranie", true);
    start.setOnClickListener(
        v -> {
          if (AppState.active) {
            startService(new Intent(this, CaptureService.class).setAction(CaptureService.STOP));
          } else begin();
        });
    home.addView(start);
    Button pick = Design.button(this, "Wybierz lub udostępnij zrzut", false);
    pick.setOnClickListener(
        v -> {
          Intent intent =
              new Intent(Intent.ACTION_OPEN_DOCUMENT)
                  .setType("image/*")
                  .addCategory(Intent.CATEGORY_OPENABLE);
          startActivityForResult(intent, IMAGE);
        });
    home.addView(pick);
    status =
        Design.text(
            this,
            "Obraz trafia do AI dopiero po Twoim stuknięciu. Sesję możesz zatrzymać w powiadomieniu"
                + " lub tutaj.",
            12,
            Design.MUTED,
            false);
    status.setPadding(dp(22), dp(9), dp(22), dp(9));
    status.setMaxLines(4);
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    status.setOnClickListener(
        v -> {
          if (!statusError) return;
          String details = status.getText().toString();
          new AlertDialog.Builder(this)
              .setTitle("Szczegóły błędu")
              .setMessage(details)
              .setPositiveButton("Zamknij", null)
              .setNeutralButton(
                  "Kopiuj",
                  (d, i) ->
                      ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE))
                          .setPrimaryClip(ClipData.newPlainText("OKStudy — błąd", details)))
              .show();
        });
    status.setClickable(false);
    root.addView(status);
    analyzeImage = Design.button(this, "Analizuj wybrany zrzut", true);
    analyzeImage.setVisibility(View.GONE);
    analyzeImage.setOnClickListener(v -> analyzeShared());
    home.addView(analyzeImage);
    aiPage.addView(Design.text(this, "Twoje AI.\nTwój wybór.", 30, Design.TEXT, true));
    LinearLayout connection =
        Design.card(
            this,
            aiPage,
            "Połączenie",
            "Korzystaj ze swojego planu ChatGPT albo wybierz własny klucz API.");
    label(connection, "Dostawca");
    Spinner provider = spinner(connection, PROVIDER_NAMES);
    accountBox = Design.column(this);
    connection.addView(accountBox);
    apiBox = Design.column(this);
    connection.addView(apiBox);
    label(apiBox, "Klucz API");
    keyField = edit(apiBox, "Wklej klucz", true);
    apiBox.addView(
        Design.text(this, "API jest rozliczane osobno przez dostawcę.", 12, Design.MUTED, false));
    Button remove = Design.button(this, "Usuń klucz tego dostawcy", false);
    remove.setOnClickListener(
        v -> {
          try {
            secrets.put(prefs.provider(), "");
            keyField.setText("");
            keyHint();
            show("Usunięto klucz.", false);
          } catch (Exception e) {
            error(e);
          }
        });
    apiBox.addView(remove);
    label(connection, "Model");
    modelField = edit(connection, "Pobierz listę lub wpisz identyfikator", false);
    modelField.setText(prefs.model());
    modelHint = Design.text(this, "", 12, Design.MUTED, false);
    connection.addView(modelHint);
    keyHint();
    provider.setSelection(Math.max(0, Arrays.asList(PROVIDERS).indexOf(prefs.provider())));
    provider.setOnItemSelectedListener(
        new AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(AdapterView<?> p) {}

          public void onItemSelected(AdapterView<?> p, View view, int i, long id) {
            if (prefs.provider().equals(PROVIDERS[i])) return;
            if (catalogRequest != null) catalogRequest.cancel();
            cancelRequests();
            prefs.store.edit().putString("provider", PROVIDERS[i]).apply();
            keyField.setText("");
            modelField.setText(prefs.model());
            keyHint();
            refreshAccount();
            catalog.setEnabled(true);
          }
        });
    catalog = Design.button(this, "Pobierz modele konta", false);
    catalog.setOnClickListener(v -> loadModels());
    connection.addView(catalog);
    Button save = Design.button(this, "Zapisz połączenie", true);
    save.setOnClickListener(
        v -> {
          try {
            saveConnection();
            show("Połączenie zapisane. Możesz uruchomić sesję.", false);
          } catch (Exception e) {
            error(e);
          }
        });
    connection.addView(save);
    refreshAccount();
    Design.art(this, stylePage, R.drawable.answer_modes, 144);
    stylePage.addView(Design.text(this, "Odpowiedź\nw Twoim stylu.", 29, Design.TEXT, true));
    LinearLayout profiles =
        Design.card(
            this,
            stylePage,
            "Jeden dotyk. Twój profil.",
            "Każdy profil możesz dopasować suwakami poniżej.");
    String[] ids = {"discreet", "readable", "study", "voice"};
    String[] names = {
      "Dyskretny\nDelikatny tekst",
      "Czytelny\nWyraźna karta",
      "Nauka\nKrótkie kroki",
      "Głos\nOdczyt systemowy"
    };
    LinearLayout profileRow = null;
    for (int i = 0; i < ids.length; i++) {
      if (i % 2 == 0) {
        profileRow = new LinearLayout(this);
        profiles.addView(profileRow);
      }
      final String id = ids[i];
      Button p = Design.button(this, names[i], id.equals(prefs.store.getString("profile", "")));
      p.setTextSize(13);
      p.setOnClickListener(
          v -> {
            prefs.profile(id);
            selectedTab = 2;
            rebuildPreservingDrafts();
            show("Profil zastosowany. Możesz go dopasować poniżej.", false);
          });
      LinearLayout.LayoutParams cell = new LinearLayout.LayoutParams(0, dp(82), 1);
      cell.setMargins(i % 2 == 0 ? 0 : dp(5), dp(10), i % 2 == 0 ? dp(5) : 0, 0);
      profileRow.addView(p, cell);
    }
    LinearLayout presentation =
        Design.card(
            this,
            stylePage,
            "Gesty i kadr",
            "Przeciągnij przycisk OK, żeby zmienić jego miejsce na ekranie.");
    choose(
        presentation,
        "Obraz wysyłany do AI",
        "cropMode",
        new String[] {"ask", "saved", "full"},
        new String[] {
          "Wybieram fragment przed analizą", "Używam zapamiętanego kadru", "Cały przechwycony ekran"
        },
        "ask");
    Button clearCrop = Design.button(this, "Wyczyść zapamiętane kadry", false);
    clearCrop.setOnClickListener(
        v -> {
          var editor = prefs.store.edit();
          for (String key : prefs.store.getAll().keySet())
            if (key.startsWith("crop.")) editor.remove(key);
          editor.putString("cropMode", "ask").apply();
          selectedTab = 2;
          rebuildPreservingDrafts();
          show("Kadry wyczyszczone. Wybierz fragment przy kolejnym zadaniu.", false);
        });
    presentation.addView(clearCrop);
    choose(
        presentation,
        "Przytrzymanie przycisku OK",
        "longPress",
        new String[] {"settings", "explain"},
        new String[] {"Otwórz aplikację", "Wyjaśnij ostatnią odpowiedź"},
        "settings");
    presentation.addView(
        Design.text(
            this,
            "Wyjaśnienie korzysta z ostatniego kadru, przechowywanego do 5 minut w pamięci. To"
                + " dodatkowe zapytanie do wybranego AI.",
            12,
            Design.MUTED,
            false));
    toggle(presentation, "Tylko odpowiedź: D albo samo hasło", "answerOnly", true);
    toggle(presentation, "Uruchamiaj podwójnym stuknięciem", "doubleTap", true);
    presentation =
        Design.card(
            this,
            stylePage,
            "Tak wygląda Twój wynik",
            "Przeciągnij przykładowe D w podglądzie. Na prawdziwym ekranie odpowiedź przepuszcza"
                + " dotyk.");
    preview = new AnswerPreview(this);
    presentation.addView(preview, new LinearLayout.LayoutParams(-1, dp(210)));
    choose(
        presentation,
        "Wygląd odpowiedzi",
        "style",
        new String[] {"text", "card"},
        new String[] {"Sam delikatny tekst", "Mała karta"},
        "text");
    choose(
        presentation,
        "Kolor tekstu",
        "color",
        new String[] {"light", "dark"},
        new String[] {"Jasny", "Ciemny"},
        "light");
    choose(
        presentation,
        "Miejsce odpowiedzi",
        "position",
        new String[] {"bottom", "top", "custom"},
        new String[] {"Na dole ekranu", "U góry ekranu", "Moje miejsce z podglądu"},
        "bottom");
    slider(
        presentation,
        "Położenie poziome",
        "answerX",
        0,
        100,
        Math.round(prefs.answerX() * 100),
        "%",
        true);
    slider(
        presentation,
        "Położenie pionowe",
        "answerY",
        0,
        100,
        Math.round(prefs.answerY() * 100),
        "%",
        true);
    slider(
        presentation, "Widoczność", "opacity", 5, 80, Math.round(prefs.opacity() * 100), "%", true);
    slider(presentation, "Wielkość tekstu", "textSize", 12, 26, prefs.textSize(), " sp", false);
    slider(presentation, "Czas odpowiedzi", "duration", 3, 30, prefs.duration(), " s", false);
    choose(
        presentation,
        "Komunikat analizy",
        "indicator",
        new String[] {"full", "minimal", "off"},
        new String[] {
          "Analizuję zadanie…", "Małe animowane kropki", "Wyłączony; tylko krótki błąd"
        },
        "minimal");
    LinearLayout audio =
        Design.card(
            this,
            stylePage,
            "Głos",
            "Możesz czytać odpowiedź, słuchać jej albo połączyć oba sposoby.");
    choose(
        audio,
        "Odpowiedź",
        "voice",
        new String[] {"off", "both", "only"},
        new String[] {"Tylko tekst", "Tekst i głos", "Tylko głos"},
        "off");
    choose(
        audio,
        "Źródło głosu",
        "engine",
        new String[] {"system", "openai"},
        new String[] {"Polski głos systemowy", "OpenAI Marin — płatne API"},
        "system");
    audio.addView(
        Design.text(
            this,
            "Głos OpenAI wymaga osobnego klucza API poniżej. Tekst jest wysyłany do OpenAI."
                + " Odczyt generuje AI; nowe nagrania są osobno płatne.",
            12,
            Design.MUTED,
            false));
    label(audio, "Klucz OpenAI do głosu (nie zmienia dostawcy zadań)");
    EditText speechKey =
        edit(
            audio,
            secrets.has("openai") ? "Klucz OpenAI już zapisany" : "Wklej klucz API OpenAI",
            true);
    Button saveSpeechKey = Design.button(this, "Zapisz klucz głosu", false);
    saveSpeechKey.setOnClickListener(
        v -> {
          try {
            String value = speechKey.getText().toString().trim();
            if (value.isEmpty())
              throw new Exception("Wpisz klucz OpenAI albo pozostaw głos systemowy.");
            secrets.put("openai", value);
            speechKey.setText("");
            speechKey.setHint("Klucz OpenAI już zapisany");
            keyHint();
            show("Klucz głosu zapisany. Odczyt OpenAI korzysta z osobno płatnego API.", false);
          } catch (Exception e) {
            error(e);
          }
        });
    audio.addView(saveSpeechKey);
    slider(
        audio,
        "Dzienny limit nowych nagrań (0 = bez limitu)",
        "speechLimit",
        0,
        50,
        prefs.store.getInt("speechLimit", 0),
        "",
        false);
    LinearLayout result =
        Design.card(
            this,
            home,
            "Ostatnia odpowiedź",
            "Ostatni kadr pozostaje w pamięci do 5 minut, aby można było poprosić o wyjaśnienie."
                + " Wyczyść usuwa go od razu.");
    answer = Design.text(this, "Tutaj pojawi się wynik analizy.", 17, Design.TEXT, false);
    answer.setTextIsSelectable(true);
    result.addView(answer);
    Button copy = Design.button(this, "Kopiuj odpowiedź", false);
    copy.setOnClickListener(
        v -> {
          if (!AppState.answer.isEmpty()) {
            ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE))
                .setPrimaryClip(ClipData.newPlainText("OKStudy", AppState.answer));
            show("Skopiowano odpowiedź.", false);
          }
        });
    result.addView(copy);
    Button read = Design.button(this, "Przeczytaj / zatrzymaj", false);
    read.setOnClickListener(
        v -> {
          if (speech.busy()) speech.stop();
          else if (!AppState.answer.isEmpty()) speech.read(AppState.answer, this::error);
        });
    result.addView(read);
    Button explain = Design.button(this, "Wyjaśnij w aplikacji", false);
    explain.setOnClickListener(v -> explainLast());
    result.addView(explain);
    Button clear = Design.button(this, "Wyczyść odpowiedź", false);
    clear.setOnClickListener(
        v -> {
          AppState.answer = "";
          AppState.error = "";
          AppState.clearTask();
          answer.setText("Tutaj pojawi się wynik analizy.");
          displayedAnswer = "";
          speech.stop();
        });
    result.addView(clear);
    TextView foot =
        Design.text(
            this,
            "OKStudy Mobile " + BuildConfig.VERSION_NAME + " · wersja testowa\nOktawiusz Kapica",
            11,
            Design.MUTED,
            false);
    foot.setPadding(0, dp(24), 0, 0);
    page.addView(foot);
    Button update = Design.button(this, "Sprawdź aktualizacje", false);
    update.setOnClickListener(v -> checkUpdates(update));
    aiPage.addView(update);
    LinearLayout nav = new LinearLayout(this);
    nav.setPadding(dp(12), dp(6), dp(12), dp(8));
    tabs = new Button[3];
    String[] labels = {"Start", "Połączenia", "Wygląd"};
    for (int i = 0; i < 3; i++) {
      final int tab = i;
      tabs[i] = Design.button(this, labels[i], false);
      tabs[i].setTextSize(13);
      tabs[i].setOnClickListener(v -> showTab(tab));
      nav.addView(tabs[i], new LinearLayout.LayoutParams(0, dp(50), 1));
    }
    root.addView(nav);
    showTab(selectedTab);
    displayedAnswer = "";
    refreshState();
  }

  private void showTab(int tab) {
    selectedTab = tab;
    for (int i = 0; i < pages.length; i++) {
      pages[i].setVisibility(i == tab ? View.VISIBLE : View.GONE);
      tabs[i].setTextColor(i == tab ? Design.BG : Design.MUTED);
      tabs[i].setBackground(Design.shape(this, i == tab ? Design.LIME : Design.BG, 16));
      tabs[i].setSelected(i == tab);
    }
    scroll.scrollTo(0, 0);
  }

  private void rebuildPreservingDrafts() {
    String draftKey = keyField.getText().toString(), draftModel = modelField.getText().toString();
    if (catalogRequest != null) catalogRequest.cancel();
    build();
    keyField.setText(draftKey);
    modelField.setText(draftModel);
    if (image != null || request != null) analyzeImage.setVisibility(View.VISIBLE);
    analyzeImage.setText(request == null ? "Analizuj wybrany zrzut" : "Przerwij analizę");
  }

  private void cancelRequests() {
    imageVersion++;
    if (request != null) request.cancel();
    request = null;
    if (catalogRequest != null) catalogRequest.cancel();
    if (AppState.active)
      startService(new Intent(this, CaptureService.class).setAction(CaptureService.CANCEL));
    AppState.clearTask();
    speech.stop();
  }

  private void refreshAccount() {
    boolean plan = prefs.provider().equals("chatgpt");
    modelHint.setText(
        plan
            ? "Lista pochodzi z OpenAI dla tego połączenia i może różnić się od listy w ChatGPT lub"
                  + " Codex. Brak modelu? Wpisz jego identyfikator ręcznie; dostęp potwierdzi"
                  + " dopiero zadanie."
            : "Wybierz model obsługujący obrazy z listy dostawcy lub wpisz jego identyfikator.");
    accountBox.setVisibility(plan ? View.VISIBLE : View.GONE);
    apiBox.setVisibility(plan ? View.GONE : View.VISIBLE);
    accountBox.removeAllViews();
    if (!plan) return;
    try {
      String selected = ChatGpt.selected(this);
      org.json.JSONObject account = ChatGpt.account(this, selected);
      boolean connected = !account.optString("access_token").isEmpty();
      TextView hint =
          Design.text(
              this,
              connected
                  ? account.optString("email", "Konto ChatGPT")
                      + "\n"
                      + (ChatGpt.sharing(account)
                          ? "● Korzystasz z planu ChatGPT"
                          : "Wymagana zgoda na korzystanie z planu")
                  : "Połącz konto i korzystaj z dostępnego planu lub kredytów ChatGPT.",
              13,
              Design.MUTED,
              false);
      hint.setPadding(0, dp(14), 0, dp(8));
      accountBox.addView(hint);
      Button login = Design.button(this, "Continue with ChatGPT", false);
      login.setTextColor(Design.BG);
      login.setBackground(Design.shape(this, Design.TEXT, 16));
      login.setOnClickListener(
          v ->
              signIn(
                  selected.isEmpty() ? prefs.store.getString("chatgpt.pendingId", "") : selected));
      accountBox.addView(login);
      Button choose = Design.button(this, "Zmień lub dodaj konto", false);
      choose.setOnClickListener(
          v -> {
            try {
              var accounts = ChatGpt.accounts(this);
              String[] labels = new String[accounts.size() + 1];
              for (int i = 0; i < accounts.size(); i++) labels[i] = accounts.get(i).name();
              labels[accounts.size()] = "+ Dodaj inne konto";
              new AlertDialog.Builder(this)
                  .setTitle("Konta ChatGPT")
                  .setItems(
                      labels,
                      (d, i) -> {
                        if (i == accounts.size()) {
                          signIn("");
                          return;
                        }
                        try {
                          cancelRequests();
                          ChatGpt.select(this, accounts.get(i).id());
                          modelField.setText(prefs.model());
                          refreshAccount();
                          show("Konto zmienione. Odśwież listę modeli tego konta.", false);
                        } catch (Exception e) {
                          error(e);
                        }
                      })
                  .setNegativeButton("Zamknij", null)
                  .show();
            } catch (Exception e) {
              error(e);
            }
          });
      accountBox.addView(choose);
      Button usage = Design.button(this, "Zarządzaj użyciem ↗", false);
      usage.setOnClickListener(v -> openUrl("https://chatgpt.com/settings/usage"));
      accountBox.addView(usage);
      if (connected) {
        Button logout = Design.button(this, "Wyloguj to konto", false);
        logout.setOnClickListener(
            v -> {
              cancelRequests();
              logout.setEnabled(false);
              show("Wylogowuję konto…", false);
              // Revocation must finish even if this screen closes or rotates.
              ExecutorService signoutWorker = Executors.newSingleThreadExecutor();
              signoutWorker.execute(
                  () -> {
                    try {
                      boolean revoked = ChatGpt.signOut(getApplicationContext(), selected);
                      runOnUiThread(
                          () -> {
                            if (!alive) return;
                            refreshAccount();
                            show(
                                revoked
                                    ? "Konto wylogowane."
                                    : "Wylogowano na telefonie. Cofnięcia sesji online nie udało"
                                        + " się potwierdzić; możesz odłączyć aplikację w"
                                        + " ustawieniach ChatGPT.",
                                !revoked);
                          });
                    } catch (Exception e) {
                      runOnUiThread(
                          () -> {
                            if (alive) {
                              logout.setEnabled(true);
                              error(e);
                            }
                          });
                    } finally {
                      signoutWorker.shutdown();
                    }
                  });
            });
        accountBox.addView(logout);
      }
    } catch (Exception e) {
      accountBox.addView(
          Design.text(
              this,
              "Nie udało się odczytać zapisanych kont. " + ChatGptLoginService.message(e),
              12,
              Design.MUTED,
              false));
    }
  }

  private void signIn(String account) {
    cancelRequests();
    startActivityForResult(
        new Intent(this, ChatGptActivity.class).putExtra("account", account), CHATGPT);
  }

  private void openUrl(String url) {
    try {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    } catch (ActivityNotFoundException e) {
      show("Nie znaleziono przeglądarki. Zainstaluj ją i spróbuj ponownie.", true);
    }
  }

  private void checkUpdates(Button button) {
    button.setEnabled(false);
    show("Sprawdzam wydania OKStudy…", false);
    network.execute(
        () -> {
          try {
            UpdateChecker.Release release = UpdateChecker.latest();
            runOnUiThread(
                () -> {
                  if (!alive) return;
                  button.setEnabled(true);
                  if (release == null) {
                    show(
                        "Nie ma opublikowanego nowszego APK. Masz wersję "
                            + BuildConfig.VERSION_NAME
                            + ".",
                        false);
                    return;
                  }
                  new AlertDialog.Builder(this)
                      .setTitle("OKStudy " + release.version())
                      .setMessage(
                          "Pobierz APK w przeglądarce i zainstaluj jako aktualizację. Android"
                              + " sprawdzi podpis, a Twoje ustawienia pozostaną zapisane.")
                      .setPositiveButton("Pobierz APK", (d, i) -> openUrl(release.url()))
                      .setNegativeButton("Później", null)
                      .show();
                });
          } catch (Exception e) {
            runOnUiThread(
                () -> {
                  if (alive) {
                    button.setEnabled(true);
                    show("Nie udało się sprawdzić aktualizacji. Spróbuj później.", true);
                  }
                });
          }
        });
  }

  private void label(LinearLayout parent, String value) {
    TextView t = Design.text(this, value, 12, Design.MUTED, true);
    t.setPadding(0, dp(16), 0, dp(6));
    parent.addView(t);
  }

  private EditText edit(LinearLayout parent, String hint, boolean password) {
    EditText e = new EditText(this);
    e.setSingleLine();
    e.setTextSize(14);
    e.setTextColor(Design.TEXT);
    e.setHintTextColor(Design.MUTED);
    e.setHint(hint);
    e.setPadding(dp(12), dp(12), dp(12), dp(12));
    e.setBackground(Design.shape(this, Design.BG, 12));
    e.setInputType(
        InputType.TYPE_CLASS_TEXT
            | (password
                ? InputType.TYPE_TEXT_VARIATION_PASSWORD
                : InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS));
    e.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
    parent.addView(e, new LinearLayout.LayoutParams(-1, dp(50)));
    return e;
  }

  private Spinner spinner(LinearLayout parent, String[] labels) {
    Spinner s = new Spinner(this);
    ArrayAdapter<String> a =
        new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels);
    s.setAdapter(a);
    s.setBackground(Design.shape(this, Design.BG, 12));
    s.setPadding(dp(8), 0, dp(8), 0);
    parent.addView(s, new LinearLayout.LayoutParams(-1, dp(50)));
    return s;
  }

  private void choose(
      LinearLayout parent,
      String title,
      String key,
      String[] values,
      String[] names,
      String fallback) {
    label(parent, title);
    Spinner s = spinner(parent, names);
    if (key.equals("position")) positionPicker = s;
    int i = Arrays.asList(values).indexOf(prefs.store.getString(key, fallback));
    s.setSelection(Math.max(0, i));
    s.setOnItemSelectedListener(
        new AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(AdapterView<?> p) {}

          public void onItemSelected(AdapterView<?> p, View v, int i, long id) {
            prefs.store.edit().putString(key, values[i]).apply();
            if (preview != null) preview.invalidate();
          }
        });
  }

  private void toggle(LinearLayout parent, String title, String key, boolean fallback) {
    Switch s = new Switch(this);
    s.setText(title);
    s.setTextColor(Design.TEXT);
    s.setTextSize(14);
    s.setPadding(0, dp(13), 0, dp(13));
    s.setChecked(prefs.store.getBoolean(key, fallback));
    parent.addView(s);
    s.setOnCheckedChangeListener(
        (v, checked) -> prefs.store.edit().putBoolean(key, checked).apply());
  }

  private void slider(
      LinearLayout parent,
      String title,
      String key,
      int min,
      int max,
      int initial,
      String unit,
      boolean fraction) {
    label(parent, title);
    TextView value = Design.text(this, initial + unit, 12, Design.LIME, false);
    parent.addView(value);
    SeekBar bar = new SeekBar(this);
    bar.setMax(max - min);
    bar.setProgress(initial - min);
    parent.addView(bar, new LinearLayout.LayoutParams(-1, dp(40)));
    bar.setContentDescription(title);
    if (key.equals("answerX")) {
      positionX = bar;
      positionXValue = value;
    }
    if (key.equals("answerY")) {
      positionY = bar;
      positionYValue = value;
    }
    bar.setOnSeekBarChangeListener(
        new SeekBar.OnSeekBarChangeListener() {
          public void onStartTrackingTouch(SeekBar b) {}

          public void onStopTrackingTouch(SeekBar b) {}

          public void onProgressChanged(SeekBar b, int n, boolean user) {
            if (!user) return;
            value.setText((n + min) + unit);
            if (fraction) prefs.store.edit().putFloat(key, (n + min) / 100f).apply();
            else prefs.store.edit().putInt(key, n + min).apply();
            if (key.equals("answerX") || key.equals("answerY"))
              prefs.store.edit().putString("position", "custom").apply();
            if (preview != null) preview.invalidate();
          }
        });
  }

  private void saveConnection() throws Exception {
    String model = modelField.getText().toString().trim(),
        entered = keyField.getText().toString().trim();
    if (prefs.provider().equals("chatgpt")) {
      ChatGpt.require(this, ChatGpt.selected(this));
      if (!ApiClient.validModel(model))
        throw new Exception("Pobierz modele konta ChatGPT i wybierz model.");
    } else {
      String key = entered.isEmpty() ? secrets.get(prefs.provider()) : entered;
      ApiClient.validate(prefs.provider(), key, model);
      if (!entered.isEmpty()) secrets.put(prefs.provider(), entered);
    }
    prefs.store.edit().putString(prefs.modelKey(), model).apply();
    keyField.setText("");
    keyHint();
  }

  private void keyHint() {
    keyField.setHint(
        secrets.has(prefs.provider())
            ? "Klucz zapisany · puste pole zachowuje go"
            : "Wklej klucz API");
  }

  private void loadModels() {
    String provider = prefs.provider();
    String account = ChatGpt.selected(this);
    try {
      String draft = keyField.getText().toString().trim(),
          key = provider.equals("chatgpt") ? "" : draft.isEmpty() ? secrets.get(provider) : draft;
      if (provider.equals("chatgpt")) ChatGpt.require(this, account);
      else ApiClient.validate(provider, key, "catalog");
      if (catalogRequest != null) catalogRequest.cancel();
      ApiClient.Cancel token = new ApiClient.Cancel();
      catalogRequest = token;
      catalog.setEnabled(false);
      show("Pobieram aktualne modele konta…", false);
      network.execute(
          () -> {
            try {
              List<ApiClient.Model> models =
                  provider.equals("chatgpt")
                      ? ChatGpt.models(this, account, token)
                      : new ApiClient().models(provider, key, token);
              runOnUiThread(
                  () -> {
                    if (!alive
                        || token.cancelled
                        || !provider.equals(prefs.provider())
                        || (provider.equals("chatgpt") && !account.equals(ChatGpt.selected(this))))
                      return;
                    catalog.setEnabled(true);
                    show("Pobrano " + models.size() + " modeli dla tego połączenia.", false);
                    if (models.isEmpty()) {
                      show("Konto nie zwróciło modeli. Możesz wpisać identyfikator ręcznie.", true);
                      return;
                    }
                    String[] labels =
                        models.stream()
                            .map(m -> m.name().equals(m.id()) ? m.name() : m.name() + "\n" + m.id())
                            .toArray(String[]::new);
                    new AlertDialog.Builder(this)
                        .setTitle(
                            provider.equals("chatgpt")
                                ? "Lista OpenAI dla tego konta"
                                : "Modele konta")
                        .setItems(
                            labels,
                            (d, i) -> {
                              modelField.setText(models.get(i).id());
                              show("Wybrano model. Zapisz połączenie.", false);
                            })
                        .setNegativeButton("Zamknij", null)
                        .setNeutralButton("Wpisz identyfikator", (d, i) -> enterModel())
                        .show();
                  });
            } catch (Exception e) {
              runOnUiThread(
                  () -> {
                    if (alive && !token.cancelled) {
                      catalog.setEnabled(true);
                      error(e);
                    }
                  });
            }
          });
    } catch (Exception e) {
      error(e);
    }
  }

  private void enterModel() {
    LinearLayout content = Design.column(this);
    content.setPadding(dp(22), dp(8), dp(22), 0);
    content.addView(
        Design.text(
            this,
            "Wpisanie modelu nie potwierdza dostępu na koncie. Po wyborze zapisz połączenie.",
            13,
            Design.MUTED,
            false));
    String provider = prefs.provider();
    EditText input =
        edit(
            content,
            provider.equals("chatgpt") || provider.equals("openai")
                ? "np. gpt-6.1-sol"
                : "Identyfikator modelu",
            false);
    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setTitle("Własny model")
            .setView(content)
            .setPositiveButton("Wybierz", null)
            .setNegativeButton("Anuluj", null)
            .create();
    dialog.setOnShowListener(
        d ->
            dialog
                .getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(
                    v -> {
                      String model = input.getText().toString().trim();
                      if (!ApiClient.validModel(model)) {
                        input.setError("Wpisz prawidłowy identyfikator modelu.");
                        return;
                      }
                      modelField.setText(model);
                      show("Wybrano model. Zapisz połączenie.", false);
                      dialog.dismiss();
                    }));
    dialog.show();
  }

  private void begin() {
    try {
      saveConnection();
    } catch (Exception e) {
      error(e);
      return;
    }
    pendingStart = true;
    if (!Settings.canDrawOverlays(this)) {
      startActivityForResult(
          new Intent(
              Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())),
          OVERLAY);
      return;
    }
    if (Build.VERSION.SDK_INT >= 33
        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION);
      return;
    }
    capturePermission();
  }

  private void capturePermission() {
    pendingStart = false;
    startActivityForResult(
        ((MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE))
            .createScreenCaptureIntent(),
        CAPTURE);
  }

  @Override
  public void onRequestPermissionsResult(int code, String[] names, int[] results) {
    super.onRequestPermissionsResult(code, names, results);
    if (code == NOTIFICATION && pendingStart) capturePermission();
  }

  @Override
  protected void onActivityResult(int code, int result, Intent data) {
    super.onActivityResult(code, result, data);
    if (code == OVERLAY) {
      if (pendingStart && Settings.canDrawOverlays(this)) begin();
      else {
        pendingStart = false;
        show("Włącz wyświetlanie nad innymi aplikacjami, aby użyć pływającego przycisku.", true);
      }
    }
    if (code == CAPTURE && result == RESULT_OK && data != null) {
      Intent startIntent =
          new Intent(this, CaptureService.class)
              .setAction(CaptureService.START)
              .putExtra("permission", data)
              .putExtra("result", result);
      startForegroundService(startIntent);
      show("Sesja uruchomiona. Otwórz aplikację z zadaniem.", false);
      moveTaskToBack(true);
    }
    if (code == IMAGE && result == RESULT_OK && data != null) loadImage(data.getData());
    if (code == CHATGPT) {
      selectedTab = 1;
      build();
      show(
          ChatGpt.loginMessage.isEmpty() ? "Logowanie zostało zamknięte." : ChatGpt.loginMessage,
          false);
      try {
        if (ChatGpt.sharing(ChatGpt.account(this, ChatGpt.selected(this)))
            && !prefs.store.getBoolean("chatgpt.welcomed", false)) {
          prefs.store.edit().putBoolean("chatgpt.welcomed", true).apply();
          new AlertDialog.Builder(this)
              .setTitle("Korzystasz ze swojego planu ChatGPT")
              .setMessage(
                  "Kwalifikujące się zadania korzystają z planu lub dostępnych kredytów ChatGPT."
                      + " Dostęp i limity znajdziesz w Zarządzaj użyciem. Wybierz teraz model"
                      + " konta.")
              .setPositiveButton("Rozumiem", null)
              .show();
        }
      } catch (Exception e) {
        error(e);
      }
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    accept(intent);
  }

  @SuppressWarnings("deprecation")
  private void accept(Intent intent) {
    if (Intent.ACTION_SEND.equals(intent.getAction())
        && intent.getType() != null
        && intent.getType().startsWith("image/")) {
      Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
      if (uri != null) loadImage(uri);
    }
  }

  private void loadImage(Uri uri) {
    final int version = ++imageVersion;
    if (request != null) request.cancel();
    request = null;
    image = null;
    analyzeImage.setText("Analizuj wybrany zrzut");
    analyzeImage.setVisibility(View.GONE);
    show("Przygotowuję zrzut…", false);
    network.execute(
        () -> {
          try {
            String encoded = ImageCodec.fromUri(this, uri);
            runOnUiThread(
                () -> {
                  if (!alive || version != imageVersion) return;
                  image = encoded;
                  analyzeImage.setVisibility(View.VISIBLE);
                  showTab(0);
                  show("Zrzut gotowy. Kliknij Analizuj, aby wysłać go do wybranego AI.", false);
                });
          } catch (Exception e) {
            runOnUiThread(() -> error(e));
          }
        });
  }

  private void analyzeShared() {
    if (request != null) {
      request.cancel();
      request = null;
      analyzeImage.setText("Analizuj wybrany zrzut");
      show("Przerwano analizę.", false);
      return;
    }
    try {
      saveConnection();
      AiConnection connection = new AiConnection(this);
      String captured = image;
      boolean only = prefs.only();
      if (captured == null) return;
      if (!prefs.cropMode().equals("full")) {
        showCrop(captured, selected -> sendShared(connection, selected, only));
        return;
      }
      sendShared(connection, captured, only);
    } catch (Exception e) {
      error(e);
    }
  }

  private void sendShared(AiConnection connection, String captured, boolean only) {
    ApiClient.Cancel token = new ApiClient.Cancel();
    request = token;
    analyzeImage.setText("Przerwij analizę");
    show("Analizuję zadanie…", false);
    network.execute(
        () -> {
          try {
            String value = connection.analyze(captured, only, token);
            runOnUiThread(
                () -> {
                  if (!alive || request != token || token.cancelled) return;
                  request = null;
                  AppState.answer = value;
                  AppState.error = "";
                  AppState.remember(captured, connection);
                  image = null;
                  analyzeImage.setText("Analizuj wybrany zrzut");
                  analyzeImage.setVisibility(View.GONE);
                  refreshState();
                  showTab(0);
                  show("Odpowiedź jest gotowa poniżej.", false);
                  if (!prefs.voice().equals("off")) speech.read(value, this::error);
                });
          } catch (Exception e) {
            runOnUiThread(
                () -> {
                  if (alive && request == token && !token.cancelled) {
                    request = null;
                    analyzeImage.setText("Analizuj wybrany zrzut");
                    error(e);
                  }
                });
          }
        });
  }

  private void showCrop(String jpeg, java.util.function.Consumer<String> accept) {
    final int version = ++imageVersion;
    Dialog dialog = new Dialog(this, android.R.style.Theme_Material_NoActionBar);
    CropPanel panel =
        new CropPanel(
            this,
            jpeg,
            null,
            selection -> {
              dialog.dismiss();
              // Shared images always get a fresh selection, never a screen crop from another app.
              show("Przygotowuję wybrany fragment…", false);
              network.execute(
                  () -> {
                    try {
                      String cropped = CropPanel.crop(jpeg, selection.bounds());
                      runOnUiThread(
                          () -> {
                            if (alive && version == imageVersion) accept.accept(cropped);
                          });
                    } catch (Exception e) {
                      runOnUiThread(() -> error(e));
                    }
                  });
            },
            dialog::dismiss,
            false);
    dialog.setContentView(panel);
    dialog.setOnDismissListener(d -> panel.dispose());
    dialog.getWindow().setLayout(-1, -1);
    dialog.show();
    dialog.getWindow().setLayout(-1, -1);
  }

  private void explainLast() {
    AppState.explainRequested = false;
    AppState.LastTask task = AppState.lastTask();
    if (task == null) {
      show("Ostatni kadr wygasł. Przeanalizuj zadanie ponownie.", true);
      return;
    }
    if (request != null) request.cancel();
    showTab(0);
    analyzeImage.setVisibility(View.VISIBLE);
    sendShared(task.connection(), task.image(), false);
  }

  private void refreshState() {
    if (AppState.explainRequested) explainLast();
    if (positionPicker != null) {
      positionPicker.setSelection(
          prefs.position().equals("custom") ? 2 : prefs.position().equals("top") ? 1 : 0);
      positionX.setProgress(Math.round(prefs.answerX() * 100));
      positionY.setProgress(Math.round(prefs.answerY() * 100));
      positionXValue.setText(Math.round(prefs.answerX() * 100) + "%");
      positionYValue.setText(Math.round(prefs.answerY() * 100) + "%");
    }
    start.setText(AppState.active ? "Zakończ sesję na ekranie" : "Uruchom pomoc na ekranie");
    sessionState.setText(
        AppState.active
            ? "● Sesja aktywna · przycisk działa nad innymi aplikacjami"
            : "○ Sesja wyłączona");
    if (!displayedAnswer.equals(AppState.answer)) {
      displayedAnswer = AppState.answer;
      answer.setText(
          displayedAnswer.isEmpty() ? "Tutaj pojawi się wynik analizy." : displayedAnswer);
    }
    if (!displayedError.equals(AppState.error)) {
      displayedError = AppState.error;
      if (!displayedError.isEmpty()) show(displayedError, true);
    }
  }

  private int dp(float n) {
    return Design.dp(this, n);
  }

  private void show(String value, boolean error) {
    if (!alive) return;
    statusError = error;
    status.setText(value);
    status.setClickable(error);
    status.setContentDescription(error ? value + " Dotknij, aby otworzyć szczegóły błędu." : value);
    status.setTextColor(error ? Color.rgb(255, 193, 168) : Design.MUTED);
  }

  private void error(Exception error) {
    if (error instanceof org.json.JSONException
        || error instanceof java.security.GeneralSecurityException) {
      show(
          "Nie udało się odczytać poprawnej odpowiedzi usługi. Spróbuj ponownie lub zaloguj konto"
              + " jeszcze raz.",
          true);
      return;
    }
    show(
        error instanceof java.net.SocketTimeoutException
            ? "Usługa nie odpowiedziała na czas. Spróbuj ponownie."
            : error.getMessage() == null ? "Nie udało się wykonać działania." : error.getMessage(),
        true);
  }

  @Override
  protected void onResume() {
    super.onResume();
    refreshAccount();
    handler.post(refresh);
  }

  @Override
  protected void onPause() {
    handler.removeCallbacks(refresh);
    super.onPause();
  }

  @Override
  protected void onSaveInstanceState(Bundle state) {
    state.putBoolean("pendingStart", pendingStart);
    state.putInt("tab", selectedTab);
    super.onSaveInstanceState(state);
  }

  @Override
  protected void onDestroy() {
    alive = false;
    handler.removeCallbacksAndMessages(null);
    if (request != null) request.cancel();
    if (catalogRequest != null) catalogRequest.cancel();
    network.shutdownNow();
    speech.close();
    image = null;
    super.onDestroy();
  }
}
