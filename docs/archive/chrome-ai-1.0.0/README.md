# AI Study Assistant 🎓

Etyczny asystent AI do nauki - wtyczka Chrome z obsługą Claude i Gemini.

## ✨ Funkcje

- 🤖 **Multi-AI Support** - Claude Opus 4.5, Claude Sonnet 4.5, Gemini 3 Pro, Gemini 3 Flash, i więcej
- 📸 **Screenshot Tool** - Zaznacz obszar ekranu i zapytaj AI o pomoc
- 💬 **Inteligentny Chat** - Pełna historia rozmów z renderowaniem matematyki i kodu
- 🎨 **Tryb jasny/ciemny** - Automatyczny lub ręczny wybór motywu
- 🔒 **Prywatność** - Twoje klucze API są przechowywane lokalnie

## 🚀 Instalacja

### Metoda 1: Załaduj jako rozpakowane rozszerzenie (deweloperzy)

1. Pobierz/sklonuj ten folder
2. Otwórz Chrome i przejdź do `chrome://extensions/`
3. Włącz **Tryb dewelopera** (prawy górny róg)
4. Kliknij **Załaduj rozpakowane**
5. Wybierz folder `ai-study-assistant`

### Metoda 2: Chrome Web Store (wkrótce)

Rozszerzenie będzie dostępne w Chrome Web Store.

## ⚙️ Konfiguracja

1. Po instalacji kliknij ikonę rozszerzenia
2. Przejdź do **Ustawienia**
3. Wprowadź swoje klucze API:
   - **Claude API**: [console.anthropic.com](https://console.anthropic.com/settings/keys)
   - **Gemini API**: [aistudio.google.com](https://aistudio.google.com/apikey)

## 🎯 Użycie

1. **Ctrl+Shift+A** - Otwórz/zamknij panel asystenta
2. Wybierz model AI (Gemini lub Claude)
3. Zadaj pytanie lub użyj przycisku 📷 do zrzutu ekranu
4. Otrzymaj pomoc z matematyki, kodu, lub innych tematów!

## 🤖 Obsługiwane modele

### Google Gemini
| Model | Opis |
|-------|------|
| `gemini-3-pro-preview` | Najnowszy i najinteligentniejszy |
| `gemini-3-flash-preview` | Szybki z inteligencją Pro |
| `gemini-2.5-flash` | Najlepszy stosunek cena/jakość |
| `gemini-2.5-pro` | Zaawansowane myślenie |

### Anthropic Claude
| Model | Opis |
|-------|------|
| `claude-opus-4-5-20251101` | Najinteligentniejszy Claude |
| `claude-sonnet-4-5-20250929` | Zbalansowany model |
| `claude-sonnet-4-20250514` | Szybki i stabilny |

## 📝 Funkcje matematyczne

Asystent obsługuje formatowanie LaTeX:
- Inline: `$x^2 + y^2 = r^2$`
- Blok: `$$\int_a^b f(x)dx$$`

## 🔒 Prywatność i bezpieczeństwo

- Klucze API są przechowywane **tylko lokalnie** w Chrome Storage
- **Żadne dane** nie są wysyłane na nasze serwery
- Komunikacja odbywa się **bezpośrednio** z API Claude/Gemini
- Kod jest otwarty i możesz go zaudytować

## 📁 Struktura projektu

```
ai-study-assistant/
├── manifest.json      # Konfiguracja rozszerzenia Chrome
├── popup.html         # Popup po kliknięciu ikony
├── options.html       # Strona ustawień
├── js/
│   ├── background.js  # Service Worker
│   └── content.js     # Główny skrypt (sidebar, API, UI)
├── css/
│   └── content.css    # Style interfejsu
└── icons/             # Ikony rozszerzenia
```

## 🛠️ Rozwój

### Wymagania
- Chrome 88+ (Manifest V3)
- Klucze API Claude i/lub Gemini

### Testowanie lokalne
1. Edytuj pliki w folderze
2. Przejdź do `chrome://extensions/`
3. Kliknij **Odśwież** na karcie rozszerzenia

## 📄 Licencja

MIT License - używaj dowolnie!

## 🤝 Wkład

Pull requesty są mile widziane! Dla większych zmian, najpierw otwórz issue.

---

Made with ❤️ dla studentów i uczniów
