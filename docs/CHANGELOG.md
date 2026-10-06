# Historia wersji

## 2.1.0

- Forma Express: tekst, etykieta albo karta; opcjonalny automatyczny kontrast, ręczny jasny/ciemny tekst i zachowany wariant dyskretny z widocznością od 5%. Regulacja szerokości odpowiedzi.
- Alt + przeciągnięcie zapisuje pozycję dla witryny. Alt + kliknięcie otwiera pełne wyjaśnienie w panelu, bez napisu lub przycisku przy krótkiej odpowiedzi. Dostępny także własny skrót klawiaturowy.
- Profile Nauka, Dyskretna odpowiedź, Słuchanie i do 8 własnych profili. Szybkie ustawienia pod ikoną rozszerzenia.
- Katalog modeli pobierany z konta API każdego dostawcy lub konta ChatGPT. Odświeżanie, pamięć listy API do 6 godzin i zachowanie poprzedniego wyboru po wycofaniu modelu.
- Pamięć ostatnich nagrań OpenAI i dzienny limit prób generowania. Ponowny odczyt z pamięci nie wysyła zapytania API.
- Instalator EXE na Windows x64 zawiera Node.js i zachowuje konta oraz istniejące rejestracje rozszerzenia. PowerShell pozostaje opcją zaawansowaną.
- Testy nowych ustawień, pozycji, katalogów modeli, profili, pamięci nagrań i samodzielnego instalatora. Projekt mobilny opisany osobno; ta wersja nie zawiera aplikacji Android/iOS.

## 2.0.2

- Odpowiedzi Express bez widocznych znaczników Markdown, z zachowaniem numeracji i zwykłych znaków matematycznych.
- Opcja „Tylko odpowiedź, bez wyjaśnień”: sama litera, hasło lub wynik. Obsługiwana przez czterech dostawców API i zaktualizowany moduł ChatGPT.
- Trzy warianty komunikatu analizy: pełny, małe animowane kropki z przerwaniem po kliknięciu oraz wyłączony. Dyskretny wykrzyknik błędu znika po 1,5 sekundy.
- Wybór głosu systemowego, tempo odczytu i odsłuch próbki.
- Opcjonalny głos OpenAI przez osobno płatne API: wybór 13 głosów, odczyt automatyczny i na żądanie, przerywanie generowania i odtwarzania. Działa również dla odpowiedzi innych dostawców i planu ChatGPT. Koszty i przekazywanie tekstu są opisane w ustawieniach.
- Odtwarzacz poza stroną zadania (`offscreen`), aby ograniczenia multimediów na stronie nie blokowały głosu. Błąd odczytu zachowuje odpowiedź tekstową.
- Testy dokładnych odpowiedzi, komunikatów, ustawień, izolacji kluczy i rzeczywistego odtwarzacza w Chromium z kontrolowanymi odpowiedziami API.

## 2.0.1

Naprawa pierwszego połączenia z kontem ChatGPT: uprawnienie Native Messaging jest dostępne od uruchomienia rozszerzenia. Osobne komunikaty wyjaśniają brak modułu, niedostępne uprawnienie, odmowę dostępu i problem z uruchomieniem Node.js. Poprawione kodowanie instalatora dla Windows PowerShell 5. Dodano testy tego połączenia w rzeczywistym Chromium i kontrolę parsowania instalatora.

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
