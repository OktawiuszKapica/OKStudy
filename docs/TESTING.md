# Weryfikacja OKStudy 2

## Uruchomienie

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:browser
npm run test:presentation
npm run build:installer
npm test
npm run package
```

Testy Node sprawdzają migrację danych (także błąd zapisu), kolejność usuwania synchronizowanych kluczy, równoczesne zapisy historii, anulowanie, skalowanie kadru, SSE z dzielonym UTF-8, końcowe błędy strumienia, adaptery czterech dostawców oraz obsługę limitów.

Testy modułu ChatGPT obejmują callback OAuth, podpis i najważniejsze roszczenia ID tokenu, zachowanie rejestracji po nieudanej wymianie kodu, szyfrowanie DPAPI, wylogowanie i unieważnianie sesji, blokadę odnawiania pomiędzy procesami oraz ramkowanie protokołu Native Messaging. Używają wyłącznie syntetycznych tokenów w tymczasowym katalogu. Nie odczytują istniejących sesji ChatGPT lub Codex.

Testy klienta Native Messaging sprawdzają brak funkcji mimo nadanej zgody, rozróżnianie błędów instalacji i dostępu oraz ponowną próbę po zainstalowaniu modułu. Osobny test parsuje plik instalatora w Windows PowerShell 5, aby wykryć problemy z kodowaniem polskich znaków.

Test przeglądarkowy ładuje rzeczywisty manifest MV3 do osobnego profilu Chromium. Dostawcę AI zastępuje kontrolowana odpowiedź w service workerze. Test nie używa płatnego API. Raport, eksport i zrzuty interfejsu trafiają do `artifacts/browser/`.

Test `test:presentation` sprawdza nowe ustawienia i odpowiedzi w prawdziwym skrypcie strony z zamkniętym Shadow DOM: usuwanie gwiazdek, dokładnie `D` oraz `Dynamika Techniczna`, trzy warianty komunikatu, kliknięcie kropek, błąd znikający po 1,5 sekundy i zachowanie tekstu przy awarii odczytu. API głosowe zastępuje syntetyczna odpowiedź z trzysekundowym cichym nagraniem WAV; rzeczywisty odtwarzacz `offscreen` dekoduje je i zgłasza koniec. Sprawdzane są też odczyt automatyczny, tryb „Tylko głos”, próbka, odczyt z panelu oraz anulowanie podczas generowania. Strona zadania ma `media-src 'none'`, aby zweryfikować odtwarzanie niezależne od jej ograniczeń. Raport i zrzuty: `artifacts/presentation/`. Jakość i dostępność rzeczywistych głosów OpenAI wymagają oddzielnego odsłuchu z kluczem API.

Testy Node obejmują dodatkowo format krótkich odpowiedzi, instrukcje wszystkich dostawców, zachowanie znaków matematycznych, limit długości odczytu, wybór i anulowanie głosu systemowego, osobne poświadczenia API odczytu, brak automatycznej zamiany konta ChatGPT na API i zachowanie odtwarzania przy ponownym uruchomieniu service workera.

Wersja 2.1.0 dodaje testy stronicowania katalogów modeli, odświeżania i rozdzielenia list według klucza, zachowania wycofanego wyboru, profili bez zmiany połączenia, pozycji per witryna, kontrastu, pamięci nagrań i atomowego limitu dziennego. W przeglądarce sprawdzane są też rzeczywiste gesty Alt + przeciągnięcie i Alt + kliknięcie, 5% widoczności, szybkie ustawienia i zmiana nazwy modelu w kontrolowanym katalogu dostawcy.

Test instalatora wymaga zbudowanego EXE (`npm run build:installer`). W pozostałych środowiskach jest oznaczony jako pominięty. Na Windows instaluje pliki do osobnego katalogu, sprawdza błędne ID, zachowanie istniejących rejestracji i syntetycznych poświadczeń oraz otrzymuje odpowiedź Native Messaging uruchamiając dołączony Node.js. Tryb `--test-install` nie zmienia prawdziwego rejestru. Podgląd okna instalatora trafia do `artifacts/installer/` i wymaga oceny wizualnej.

Weryfikacja wersji **2.1.0** z 6 października 2026: **41 testów Node (bez pominięć), 22 kontrole dotychczasowych funkcji, 36 kontroli odpowiedzi/ustawień/głosu oraz 7 kontroli Native Messaging — zakończone powodzeniem**. Instalator obejrzano i uruchomiono również dla lokalnej instalacji; hash modułu jest zgodny z paczką, a test Chromium korzysta już z dołączonego środowiska Node.js. Jeden przebieg testu podglądu instalatora przekroczył zbyt krótki limit czasu przy równoległych testach Windows; limit zwiększono i pełny zestaw przeszedł ponownie. Katalogi, generowanie odpowiedzi i głosu były testowane na kontrolowanych danych, bez płatnych wywołań. Aplikacja mobilna nie została zbudowana ani sprawdzona na urządzeniu.

Weryfikacja wersji **2.0.2** z 6 października 2026: **32 testy Node, 22 kontrole dotychczasowych funkcji, 23 kontrole odpowiedzi i głosu oraz 7 kontroli Native Messaging — wszystkie zakończone powodzeniem**. Łącznie 52 kontrole przeglądarkowe. Odtwarzacz sprawdzono na nagraniu testowym; nie wykonywano płatnych wywołań ani rzeczywistego logowania na konto użytkownika.

Weryfikacja wersji 2.0.1 z 6 października 2026: **25 testów Node oraz 22 sprawdzenia interfejsu — wszystkie zakończone powodzeniem**. Test przeglądarkowy obejmuje uprawnienie `activeTab`, blokadę dostępu skryptu strony do kluczy, zatwierdzanie i anulowanie kadru, dopytywanie, wzory, eksport, wyszukiwanie historii, przerwane strumienie, zastąpienie analizy nową oraz oczyszczanie odpowiedzi z niebezpiecznego HTML. Układ sprawdzono przy szerokościach 1280, 400, 390 i 320 px. Akcja paska jest uruchamiana przez CDP na testowej karcie; skróty przeglądarki wymagają osobnej próby ręcznej.

## Połączenie przeglądarki z modułem Windows

Po zainstalowaniu `companion/install.ps1` dla identyfikatora rozszerzenia ładowanego z bieżącego katalogu można uruchomić:

```sh
npm run test:native
```

Test używa prawdziwego Native Messaging i zainstalowanego modułu Node.js. Chromium ma oddzielny profil i `LOCALAPPDATA`, więc moduł nie odczytuje kont użytkownika. Wywołanie otwarcia strony OpenAI jest przechwytywane w `chrome.tabs.create` i kierowane do pustej karty; callback OAuth otrzymuje syntetyczną odmowę, bez tokenu i bez użycia API. Sprawdzane są dostępność uprawnienia na pierwszym uruchomieniu, komunikaty awarii, połączenie z modułem, żądany adres autoryzacji i możliwość ponowienia po anulowaniu. Raport trafia do `artifacts/native-browser/report.json`.

Dla wersji 2.0.1 wszystkie **7 sprawdzeń połączenia** przeszło 6 października 2026. Łącznie z testami interfejsu daje to 29 sprawdzeń przeglądarkowych.

## Przed publicznym wydaniem

Automatyczne testy nie zastępują próby z kontami dostawców. Osobno trzeba potwierdzić:

1. Faktyczne logowanie ChatGPT po instalacji modułu, dostęp do modeli na koncie i jedno zadanie z obrazem.
2. Rzeczywiste odpowiedzi i wyszukiwanie dla używanych kont API.
3. Skróty zarejestrowane przez konkretną przeglądarkę oraz dostępność polskiego głosu.
4. Odsłuch rzeczywistego nagrania OpenAI i naliczanie użycia na koncie API; testy automatyczne nie pobierają płatnych nagrań.

Publikacja w sklepie lub GitHub Releases nie jest częścią lokalnego pakowania.
