# Historia wersji

## 2.0.0

Nowy interfejs i identyfikacja, panel nauki, wybór fragmentu, rozmowa, historia, bezpieczniejsza obsługa połączeń i opcjonalny moduł kont ChatGPT.


### v1.4.0
- 🔊 **Czytanie na głos** - odpowiedź czytana przez głośnik/słuchawki (Express czyta odpowiedź, Tłumacz „Wniosek"); w trybie głosu dymek się nie pokazuje
- 📊 **Licznik zużycia Gemini** w ustawieniach (dzienny darmowy limit)
- 🔔 **Powiadomienie o nowej wersji** - baner, gdy na GitHubie jest nowsza wersja
- 💳 **Czytelny błąd przy braku środków** na koncie API (zamiast mylącego „błędne zapytanie")
- ➕ Dodany **Grok (xAI)** jako czwarty dostawca
- ⬆️ Aktualizacja modeli: Claude Opus 4.8, GPT-5.5

### v1.3.0
- 🤖 **Multi-AI** - do wyboru **Gemini, Claude, ChatGPT i Grok** (każdy na własnym kluczu)
- 🔑 Osobne klucze i modele zapamiętywane per dostawca
- 🧪 Test klucza działa dla każdego z dostawców
- 🎨 Prawdziwe logo każdego dostawcy w ustawieniach
- 📋 Modele: Gemini 3.5 Flash / 3.1 Pro, Claude Sonnet 4.6 / Haiku 4.5 / Opus 4.8, GPT-5 mini / GPT-5.5, Grok 4 / Grok 4 Fast
- ℹ️ Wyszukiwarka (Alt+I) działa tylko dla Gemini; dla pozostałych dostawców traktowana jak zwykła analiza

### v1.2.1
- 🐛 **Naprawka pozycji przy zoomie** - dymek nie ucieka poza ekran przy powiększeniu przeglądarki innym niż 100% (np. 125%, 150%)
- 🆘 **Zapasowy skrót analizy** - jeśli Alt+O koliduje z inną wtyczką, można w `chrome://extensions/shortcuts` ustawić własny (np. Alt+A) dla „Szybka analiza - zapasowy skrót"
- 💬 **Widoczny komunikat**, gdy nie uda się zrobić zrzutu (zamiast cichego braku reakcji)

### v1.2.0
- 🎓 **Tryb Tłumacz** (domyślny) - wyjaśnienie krok po kroku zamiast samej odpowiedzi, czytelny panel na dole ekranu
- ⚡ **Tryb Express** - dotychczasowe zachowanie (sama odpowiedź, dyskretnie) jako opcja
- 🔘 Przełącznik trybu w ustawieniach (zapisywany na stałe)
- 🧼 Mniej śladów w przeglądarce (wyciszone logi, neutralne nazwy w DOM)
- ⏱️ Limit czasu zapytania (auto-przerwanie po 30 s zamiast zawieszenia)

### v1.1.0
- 🆕 **Alt+K** - przerywanie / kasowanie bieżącej analizy (anuluje też zapytanie do API w locie)
- 🆕 **Alt+M** - przełączanie modelu Flash/Pro w locie (skrót przypisywany ręcznie)
- 🆕 **Historia odpowiedzi** - kolejne naciśnięcia Alt+P cofają się do 5 odpowiedzi wstecz
- 🆕 **Kopiowanie** - przytrzymanie Alt+P kopiuje odpowiedź do schowka
- 🆕 **Test klucza API** w ustawieniach (przycisk „Sprawdź klucz")
- 🆕 **Klik w ikonę** otwiera ustawienia
- 🛡️ **Internet (Alt+I)** automatycznie przechodzi w tryb bez wyszukiwania na darmowym kluczu
- 💬 **Czytelne komunikaty błędów** (zły klucz, brak dostępu, limit zapytań, niedostępny model)
- ⬆️ Aktualizacja modeli: **Gemini 3.5 Flash** (domyślny) i **Gemini 3.1 Pro**
- 🔄 Automatyczna migracja starych ustawień modeli
- 🧹 Drobne porządki w repozytorium

### v1.0.0
- Pierwsza publiczna wersja
- Analiza zrzutów ekranu przez Gemini 3
- Obsługa wielu typów pytań
- Tryb szybki i z wyszukiwaniem
- Funkcja powtarzania odpowiedzi

