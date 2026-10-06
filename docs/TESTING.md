# Weryfikacja OKStudy 2

## Uruchomienie

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:browser
npm run package
```

Testy Node sprawdzają migrację danych (także błąd zapisu), kolejność usuwania synchronizowanych kluczy, równoczesne zapisy historii, anulowanie, skalowanie kadru, SSE z dzielonym UTF-8, końcowe błędy strumienia, adaptery czterech dostawców oraz obsługę limitów.

Testy modułu ChatGPT obejmują callback OAuth, podpis i najważniejsze roszczenia ID tokenu, zachowanie rejestracji po nieudanej wymianie kodu, szyfrowanie DPAPI, wylogowanie i unieważnianie sesji, blokadę odnawiania pomiędzy procesami oraz ramkowanie protokołu Native Messaging. Używają wyłącznie syntetycznych tokenów w tymczasowym katalogu. Nie odczytują istniejących sesji ChatGPT lub Codex.

Testy klienta Native Messaging sprawdzają brak funkcji mimo nadanej zgody, rozróżnianie błędów instalacji i dostępu oraz ponowną próbę po zainstalowaniu modułu. Osobny test parsuje plik instalatora w Windows PowerShell 5, aby wykryć problemy z kodowaniem polskich znaków.

Test przeglądarkowy ładuje rzeczywisty manifest MV3 do osobnego profilu Chromium. Dostawcę AI zastępuje kontrolowana odpowiedź w service workerze. Test nie używa płatnego API. Raport, eksport i zrzuty interfejsu trafiają do `artifacts/browser/`.

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

Publikacja w sklepie lub GitHub Releases nie jest częścią lokalnego pakowania.
