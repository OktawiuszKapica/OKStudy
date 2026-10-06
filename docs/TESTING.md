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

Test przeglądarkowy ładuje rzeczywisty manifest MV3 do osobnego profilu Chromium. Dostawcę AI zastępuje kontrolowana odpowiedź w service workerze. Test nie używa płatnego API. Raport, eksport i zrzuty interfejsu trafiają do `artifacts/browser/`.

Weryfikacja z 6 października 2026: **21 testów Node oraz 22 sprawdzenia przeglądarkowe — wszystkie zakończone powodzeniem**. Test przeglądarkowy obejmuje uprawnienie `activeTab`, blokadę dostępu skryptu strony do kluczy, zatwierdzanie i anulowanie kadru, dopytywanie, wzory, eksport, wyszukiwanie historii, przerwane strumienie, zastąpienie analizy nową oraz oczyszczanie odpowiedzi z niebezpiecznego HTML. Układ sprawdzono przy szerokościach 1280, 400, 390 i 320 px. Akcja paska jest uruchamiana przez CDP na testowej karcie; skróty przeglądarki wymagają osobnej próby ręcznej.

## Przed publicznym wydaniem

Automatyczne testy nie zastępują próby z kontami dostawców. Osobno trzeba potwierdzić:

1. Faktyczne logowanie ChatGPT po instalacji modułu, dostęp do modeli na koncie i jedno zadanie z obrazem.
2. Rzeczywiste odpowiedzi i wyszukiwanie dla używanych kont API.
3. Skróty zarejestrowane przez konkretną przeglądarkę oraz dostępność polskiego głosu.

Publikacja w sklepie lub GitHub Releases nie jest częścią lokalnego pakowania.
