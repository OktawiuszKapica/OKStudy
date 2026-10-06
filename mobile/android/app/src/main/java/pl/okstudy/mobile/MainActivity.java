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
  private static final int OVERLAY = 10, CAPTURE = 11, IMAGE = 12, NOTIFICATION = 13;
  private Prefs prefs;
  private Secrets secrets;
  private EditText keyField, modelField;
  private TextView status, answer, sessionState;
  private Button start, analyzeImage, catalog;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final ExecutorService network = Executors.newFixedThreadPool(2);
  private ApiClient.Cancel request, catalogRequest;
  private boolean pendingStart, alive;
  private String image, displayedAnswer = "", displayedError = "";
  private Speech speech;
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
    build();
    accept(getIntent());
  }

  private void build() {
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.setBackgroundColor(Design.BG);
    LinearLayout page = Design.column(this);
    page.setPadding(dp(22), dp(18), dp(22), dp(34));
    scroll.addView(page);
    scroll.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          v.setPadding(0, insets.getSystemWindowInsetTop(), 0, insets.getSystemWindowInsetBottom());
          return insets;
        });
    setContentView(scroll);
    LinearLayout logo = new LinearLayout(this);
    logo.setGravity(Gravity.CENTER_VERTICAL);
    logo.addView(new Design.Mark(this), new LinearLayout.LayoutParams(dp(45), dp(35)));
    TextView name = Design.text(this, "  OKStudy", 25, Design.TEXT, true);
    logo.addView(name);
    page.addView(logo);
    TextView eyebrow = Design.text(this, "TWOJA POMOC W NAUCE · MOBILE", 10, Design.LIME, true);
    eyebrow.setLetterSpacing(.12f);
    eyebrow.setPadding(0, dp(28), 0, dp(10));
    page.addView(eyebrow);
    page.addView(
        Design.text(this, "Zadanie na ekranie.\nOdpowiedź pod ręką.", 31, Design.TEXT, true));
    TextView intro =
        Design.text(
            this,
            "Uruchom sesję, otwórz zadanie i stuknij w pływający przycisk OKStudy.",
            14,
            Design.MUTED,
            false);
    intro.setPadding(0, dp(12), 0, dp(12));
    page.addView(intro);
    sessionState = Design.text(this, "", 12, Design.MUTED, false);
    page.addView(sessionState);
    start = Design.button(this, "Uruchom pomoc na ekranie", true);
    start.setOnClickListener(
        v -> {
          if (AppState.active) {
            startService(new Intent(this, CaptureService.class).setAction(CaptureService.STOP));
          } else begin();
        });
    page.addView(start);
    Button pick = Design.button(this, "Wybierz lub udostępnij zrzut", false);
    pick.setOnClickListener(
        v -> {
          Intent intent =
              new Intent(Intent.ACTION_OPEN_DOCUMENT)
                  .setType("image/*")
                  .addCategory(Intent.CATEGORY_OPENABLE);
          startActivityForResult(intent, IMAGE);
        });
    page.addView(pick);
    status =
        Design.text(
            this,
            "Obraz trafia do AI dopiero po Twoim stuknięciu. Sesję możesz zatrzymać w powiadomieniu"
                + " lub tutaj.",
            12,
            Design.MUTED,
            false);
    status.setPadding(0, dp(12), 0, 0);
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    page.addView(status);
    analyzeImage = Design.button(this, "Analizuj wybrany zrzut", true);
    analyzeImage.setVisibility(View.GONE);
    analyzeImage.setOnClickListener(v -> analyzeShared());
    page.addView(analyzeImage);
    LinearLayout connection =
        Design.card(
            this,
            page,
            "01  Twoje AI",
            "Własny klucz API. Użycie jest rozliczane przez dostawcę, poza abonamentem ChatGPT.");
    label(connection, "Dostawca");
    Spinner provider = spinner(connection, ApiClient.NAMES);
    label(connection, "Klucz API");
    keyField = edit(connection, "Wklej klucz", true);
    label(connection, "Model");
    modelField = edit(connection, "Pobierz listę lub wpisz identyfikator", false);
    modelField.setText(prefs.model());
    keyHint();
    provider.setSelection(Arrays.asList(ApiClient.PROVIDERS).indexOf(prefs.provider()));
    provider.setOnItemSelectedListener(
        new AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(AdapterView<?> p) {}

          public void onItemSelected(AdapterView<?> p, View view, int i, long id) {
            if (prefs.provider().equals(ApiClient.PROVIDERS[i])) return;
            if (catalogRequest != null) catalogRequest.cancel();
            prefs.store.edit().putString("provider", ApiClient.PROVIDERS[i]).apply();
            keyField.setText("");
            modelField.setText(prefs.model());
            keyHint();
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
    Button remove = Design.button(this, "Usuń klucz tego dostawcy", false);
    remove.setOnClickListener(
        v -> {
          try {
            secrets.put(prefs.provider(), "");
            keyField.setText("");
            keyHint();
            show("Usunięto klucz tego dostawcy.", false);
          } catch (Exception e) {
            error(e);
          }
        });
    connection.addView(remove);
    LinearLayout presentation =
        Design.card(
            this,
            page,
            "02  Tak, jak lubisz",
            "Przytrzymaj przycisk OKStudy, żeby wrócić tutaj. Przeciągnij go, żeby zmienić"
                + " miejsce.");
    toggle(presentation, "Tylko odpowiedź: D albo samo hasło", "answerOnly", true);
    toggle(presentation, "Uruchamiaj podwójnym stuknięciem", "doubleTap", true);
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
        new String[] {"bottom", "top"},
        new String[] {"Na dole ekranu", "U góry ekranu"},
        "bottom");
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
            page,
            "03  Głos",
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
            "Głos OpenAI wymaga klucza OpenAI zapisanego wyżej. Tekst jest wysyłany do OpenAI."
                + " Odczyt generuje AI; nowe nagrania są osobno płatne.",
            12,
            Design.MUTED,
            false));
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
            page,
            "Ostatnia odpowiedź",
            "Odpowiedź pozostaje tylko w bieżącej sesji aplikacji. Zrzut nie jest zapisywany w"
                + " galerii.");
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
    Button clear = Design.button(this, "Wyczyść odpowiedź", false);
    clear.setOnClickListener(
        v -> {
          AppState.answer = "";
          AppState.error = "";
          answer.setText("Tutaj pojawi się wynik analizy.");
          displayedAnswer = "";
          speech.stop();
        });
    result.addView(clear);
    TextView foot =
        Design.text(
            this,
            "OKStudy Mobile 0.1.0 · wersja testowa\nOktawiusz Kapica",
            11,
            Design.MUTED,
            false);
    foot.setPadding(0, dp(24), 0, 0);
    page.addView(foot);
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
    int i = Arrays.asList(values).indexOf(prefs.store.getString(key, fallback));
    s.setSelection(Math.max(0, i));
    s.setOnItemSelectedListener(
        new AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(AdapterView<?> p) {}

          public void onItemSelected(AdapterView<?> p, View v, int i, long id) {
            prefs.store.edit().putString(key, values[i]).apply();
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
    bar.setOnSeekBarChangeListener(
        new SeekBar.OnSeekBarChangeListener() {
          public void onStartTrackingTouch(SeekBar b) {}

          public void onStopTrackingTouch(SeekBar b) {}

          public void onProgressChanged(SeekBar b, int n, boolean user) {
            if (!user) return;
            value.setText((n + min) + unit);
            if (fraction) prefs.store.edit().putFloat(key, (n + min) / 100f).apply();
            else prefs.store.edit().putInt(key, n + min).apply();
          }
        });
  }

  private void saveConnection() throws Exception {
    String model = modelField.getText().toString().trim(),
        entered = keyField.getText().toString().trim();
    String key = entered.isEmpty() ? secrets.get(prefs.provider()) : entered;
    ApiClient.validate(prefs.provider(), key, model);
    if (!entered.isEmpty()) secrets.put(prefs.provider(), entered);
    prefs.store.edit().putString("model." + prefs.provider(), model).apply();
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
    try {
      String draft = keyField.getText().toString().trim(),
          key = draft.isEmpty() ? secrets.get(provider) : draft;
      ApiClient.validate(provider, key, "catalog");
      if (catalogRequest != null) catalogRequest.cancel();
      ApiClient.Cancel token = new ApiClient.Cancel();
      catalogRequest = token;
      catalog.setEnabled(false);
      show("Pobieram aktualne modele konta…", false);
      network.execute(
          () -> {
            try {
              List<ApiClient.Model> models = new ApiClient().models(provider, key, token);
              runOnUiThread(
                  () -> {
                    if (!alive || token.cancelled || !provider.equals(prefs.provider())) return;
                    catalog.setEnabled(true);
                    if (models.isEmpty()) {
                      show("Konto nie zwróciło modeli. Możesz wpisać identyfikator ręcznie.", true);
                      return;
                    }
                    String[] labels =
                        models.stream()
                            .map(m -> m.name().equals(m.id()) ? m.name() : m.name() + "\n" + m.id())
                            .toArray(String[]::new);
                    new AlertDialog.Builder(this)
                        .setTitle("Modele konta")
                        .setItems(
                            labels,
                            (d, i) -> {
                              modelField.setText(models.get(i).id());
                              show("Wybrano model. Zapisz połączenie.", false);
                            })
                        .setNegativeButton("Zamknij", null)
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
    show("Przygotowuję zrzut…", false);
    network.execute(
        () -> {
          try {
            String encoded = ImageCodec.fromUri(this, uri);
            runOnUiThread(
                () -> {
                  if (!alive) return;
                  image = encoded;
                  analyzeImage.setVisibility(View.VISIBLE);
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
      String provider = prefs.provider(),
          model = prefs.model(),
          key = secrets.get(provider),
          captured = image;
      boolean only = prefs.only();
      if (captured == null) return;
      ApiClient.Cancel token = new ApiClient.Cancel();
      request = token;
      analyzeImage.setText("Przerwij analizę");
      show("Analizuję zadanie…", false);
      network.execute(
          () -> {
            try {
              String value = new ApiClient().analyze(provider, key, model, captured, only, token);
              runOnUiThread(
                  () -> {
                    if (!alive || request != token || token.cancelled) return;
                    request = null;
                    AppState.answer = value;
                    AppState.error = "";
                    image = null;
                    analyzeImage.setText("Analizuj wybrany zrzut");
                    analyzeImage.setVisibility(View.GONE);
                    refreshState();
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
    } catch (Exception e) {
      error(e);
    }
  }

  private void refreshState() {
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
    status.setText(value);
    status.setTextColor(error ? Color.rgb(255, 193, 168) : Design.MUTED);
  }

  private void error(Exception error) {
    show(
        error instanceof java.net.SocketTimeoutException
            ? "Usługa nie odpowiedziała na czas. Spróbuj ponownie."
            : error.getMessage() == null ? "Nie udało się wykonać działania." : error.getMessage(),
        true);
  }

  @Override
  protected void onResume() {
    super.onResume();
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
