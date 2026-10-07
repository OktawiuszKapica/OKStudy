# Weryfikacja OKStudy Mobile

## Android 0.3.1 — uruchamianie bez przycisku OK

Wykonano wyłącznie `assembleRelease lintRelease`: sukces, **Lint 0 błędów / 37 ostrzeżeń**. Nie uruchomiono aplikacji, emulatora, telefonu ani testów jednostkowych/instrumentacyjnych. Zadania modelu Lint dla źródeł testowych są analizą statyczną i nie wykonują testów. Sprawdzono także skompilowane odwołania do `Arrays.asList` i `String.trim`, bez użycia nowszych metod biblioteki niedostępnych na części obsługiwanych Androidów.

APK `OKStudy-Mobile-0.3.1.apk`: versionCode 6, min SDK 26, target SDK 36, pakiet `pl.okstudy.mobile`, **168979 bajtów**, SHA-256 `af842eade36a65b2cef8c028ee3792d625d2f8727a6125c3fedec1e73c6d9278`. Podpis v2/v3 z niezmienionym certyfikatem SHA-256 `b38137d48a977354d4807c7c9ab6578ab6afeeb9aa095ad67ce767e438ccbf0d`.

Nowe strefy gestów, brak OK w przebiegu sukces/błąd/anulowanie, wibracja, obrót, zamknięcie powiadomień przed zrzutem i trafność wyboru pytania **nie zostały sprawdzone na urządzeniu**. Użytkownik wykonuje [próby telefonu](PHONE-TESTS.md). Nie wykonano logowania ani zapytań AI. iOS bez zmian.

## Android 0.3.0 — przygotowanie, bez uruchomienia aplikacji

Na prośbę użytkownika nie uruchamiano żadnych emulatorów, telefonów ani testów wykonujących kod Androida. Przeprowadzono kompilację release i Android Lint, sprawdzenie metadanych oraz podpis APK. `assembleRelease lintRelease`: sukces, Lint 0 błędów / 35 ostrzeżeń. Początkowo Lint zgłosił użycie starego przeciążenia `startActivityAndCollapse`; jest teraz ograniczone do API <34, z opisanym wyłączeniem tej konkretnej reguły. Na API 34+ działa PendingIntent. Nie wyłączono kontroli Lint globalnie.

APK `OKStudy-Mobile-0.3.0.apk`: versionCode 5, min SDK 26, target SDK 36, pakiet `pl.okstudy.mobile`, 160787 bajtów, SHA-256 `59d7573e0b6c4051391165cf477bfb384be083f85fff19d63c137585815a86d8`. Podpis v2/v3, ten sam certyfikat SHA-256 `b38137d48a977354d4807c7c9ab6578ab6afeeb9aa095ad67ce767e438ccbf0d`.

Użytkownik wcześniej potwierdził „działa” po 0.2.2. Nie traktujemy tego jako sprawdzenia nowych funkcji 0.3.0 ani wszystkich brakujących modeli. Menu, kafelek, historia, ulubione, ostrzeżenie kadru i porównanie wymagają prób opisanych w [PHONE-TESTS.md](PHONE-TESTS.md).

## Android 0.2.2 — zgłoszenie braku tekstu i nowszych modeli

Użytkownik sprawdził 5.6 Sol i 5.6 Terra w 0.2.1; aplikacja zgłasza „Model nie zwrócił odpowiedzi”. Lista nadal pomija 6.1 Sol, 6 Sol i 6 Luna. Przegląd kodu wykazał, że odbiornik mobilny czytał tylko `response.completed.response.output`, ignorując tekst przesyłany w pozostałych zdarzeniach. Jest to luka implementacji; bez odpowiedzi z telefonu nie potwierdzono, że właśnie ona odpowiada za konkretny zgłoszony przebieg. Implementacja 0.2.2 zbiera fragmenty i końcowe wersje tekstu zgodnie z [opisem strumienia Responses](https://developers.openai.com/api/docs/guides/streaming-responses), nadal wymagając ukończenia i odrzucając późny błąd.

Dodano źródła `ResponsesStreamTest` i `ChatGptDiagnosticsTest`: fragmenty bez powtórzenia tekstu na końcu, brak duplikacji, pusty końcowy tekst, treść z `output_item.done`, wykluczenie reasoning/narzędzi/kanału analysis, przerwany strumień, późny błąd, odmowa, sprzeczne identyfikatory wiadomości, ramki SSE, nieprawidłowy typ tekstu, pusty wynik, modele nieobecne/ukryte/widoczne, odmienny format katalogu, ograniczenie raportu do metadanych i aktualnego konta. **Przypadków nie uruchamiano.** Nie wykonano też żadnych prób aplikacji, emulatora, logowania ani wywołań AI.

Nowy raport w **Połączenia → Diagnostyka ChatGPT** zapisuje wyłącznie metadane ostatniego katalogu i analizy. Lista wyboru nadal pochodzi z `models[]` z filtrem `visibility: list`. Format nazwy dopuszcza wszystkie trzy zgłoszone modele. Nie znamy jednak zawartości odpowiedzi katalogu z telefonu i nie przypisujemy braku modeli abonamentowi. Raport pozwoli odróżnić brak wpisu u źródła od jego odfiltrowania przez aplikację. [Instrukcja zebrania raportu](PHONE-TESTS.md).

Kontrole przygotowania wydania zakończone 7 października 2026: `assembleRelease lintRelease` — sukces, Android Lint **0 błędów, 28 ostrzeżeń**. Zweryfikowano podpis APK v2/v3 i metadane pakietu `pl.okstudy.mobile`, versionCode 4, versionName 0.2.2. Zachowano certyfikat SHA-256 `b38137d48a977354d4807c7c9ab6578ab6afeeb9aa095ad67ce767e438ccbf0d` zgodny z poprzednim wydaniem. Pakiet `releases/OKStudy-Mobile-0.2.2.apk`: 148499 bajtów, SHA-256 `ebf2279c767950682e8490940ee1955c9359a0797641d46318643838fc8e1107`. To potwierdza przygotowanie pakietu, nie wynik analizy na prawdziwym koncie.

## Android 0.2.1 — poprawka po zgłoszeniu z telefonu

Zrzuty użytkownika z 7 października pokazują rozpoznane konto, pobraną listę modeli i błąd „Dostawca nie ukończył analizy”. Kod 0.2.0 sprawdzał samą obecność pola `error`, co odrzucało także poprawną odpowiedź `error: null`. [Oficjalny przykład `response.completed`](https://developers.openai.com/api/reference/resources/responses/streaming-events#responsecompleted) zawiera właśnie takie pole. Poprawiono rozpoznawanie błędu i zachowano wymóg ukończonej odpowiedzi.

Przygotowano `PlanHttpTest` z przypadkami: sukces JSON/SSE z `error: null`, prawdziwy błąd, niepełna odpowiedź, urwany strumień, błąd limitu po rozpoczęciu strumienia i komunikaty bez surowego payloadu. **Testów nie uruchamiano**, zgodnie z dyspozycją użytkownika. Weryfikacja wydania: kompilacja release, Android Lint, przegląd kodu i podpis APK. Nie uruchamiano aplikacji, emulatora ani wywołań AI.

Przyczyny braku `gpt-6.1-sol` na tym konkretnym koncie nie da się ustalić ze zrzutów. Implementacja pobiera listę z `GET /v1/models` według [oficjalnego kontraktu](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), bez listy wpisanej na stałe. Dodano jawne pominięcie cache HTTP, objaśnienie źródła listy i ręczny identyfikator. Ręczny wybór nie potwierdza uprawnień ani nie przełącza na API.

## Android 0.2.0 — bez uruchamiania emulatora

Na wyraźną prośbę Oktawiusza nie uruchamiano emulatora, aplikacji ani testów wykonujących jej kod. Wykonano kompilację release, analizę statyczną Android Lint, przegląd kodu i weryfikację podpisu pakietu. Testy na fizycznym telefonie wykonuje użytkownik według [PHONE-TESTS.md](PHONE-TESTS.md).

Logowanie ChatGPT, wymiana/odnawianie tokenów, działanie po powrocie z przeglądarki, nowy kadr, odłączanie powierzchni między gestami, gest wyjaśnienia, profile i nowy interfejs **nie zostały sprawdzone w uruchomionej aplikacji**. Kompilacja nie potwierdza działania prawdziwego konta, limitów, obrazu lub jakości głosu. Nie wykonano płatnych wywołań API.

Kod opiera się na oficjalnej dokumentacji [logowania](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [sesji](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [modeli i odpowiedzi](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) oraz [ograniczeń preview](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations). Wynik jest akceptowany po zdarzeniu `response.completed`; modele planu i API mają osobne wybory. Odświeżanie, ponowne logowanie i wylogowanie serializują zapis tokenów; operacje sieciowe nie trzymają blokady odczytu ustawień interfejsu.

Same kontrole przygotowania APK, bez testów urządzenia:

```powershell
node scripts/mobile-build.mjs assembleRelease lintRelease '-Dorg.gradle.jvmargs=-Xmx768m'
node scripts/mobile-package.mjs
```

Poniższe wyniki i polecenia emulatora są archiwum dla **0.1.0**, a nie wynikiem walidacji wydania 0.2.0. Nie uruchamiać emulatora bez zmiany dyspozycji użytkownika.

## Archiwum 0.1.0

## Powtarzalne sprawdzenia Androida

Z katalogu repozytorium:

```powershell
node scripts/mobile-tools.mjs
node scripts/mobile-build.mjs assembleDebug assembleDebugAndroidTest assembleRelease testDebugUnitTest lintDebug
node scripts/mobile-emulator.mjs prepare
node scripts/mobile-emulator.mjs start
```

Emulator ma osobny AVD `OKStudyTest`, port 5580 i pliki w ignorowanym `artifacts/mobile-tools`. Poczekaj na start systemu: `adb -s emulator-5580 shell getprop sys.boot_completed` musi zwrócić `1`. Następnie:

```powershell
adb -s emulator-5580 install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5580 install -r mobile/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s emulator-5580 shell am instrument -w pl.okstudy.mobile.test/pl.okstudy.mobile.SmokeRunner
```

`adb` jest w `artifacts/mobile-tools/sdk/platform-tools`. Runner jest przeznaczony wyłącznie dla izolowanego emulatora: ustawia testowe klucze i preferencje. Używa prawdziwego Keystore, MediaProjection i nakładek, a sieć zastępuje mockiem. Hook transportu jest ignorowany w release i nie jest dostępny przez eksportowany komponent.

Po testach: `node scripts/mobile-emulator.mjs stop`. Podpisanie i weryfikacja APK: `node scripts/mobile-package.mjs`.

## Zakres i wyniki

- 12 testów jednostkowych przeszło: odpowiedzi D/hasło/liczba, znaczniki i mnożenie, obrazy w payloadach, przyszłe modele, stronicowanie i zapętlony kursor, niepełne odpowiedzi, reasoning, anulowanie, pusta odpowiedź, klucze poza URL i endpoint mowy.
- Kompilacja debug/release i lint przeszły; lint nie zgłosił błędów. Pozostają ostrzeżenia m.in. o polskich tekstach w kodzie, nowszych zależnościach i zasobach dla starszych systemów.
- Test instrumentacyjny **przeszedł na Androidzie 15 / API 35**: Keystore, zgoda na cały ekran, prawdziwa klatka JPEG, odpowiedź D nad osobną aplikacją testową, rzeczywisty pojedynczy i podwójny dotyk, obrót, dokładnie jedno zapytanie, anulowanie spóźnionej odpowiedzi, wykrzyknik przez 1,5 s i usunięcie nakładki po zakończeniu.
- Kontrola wizualna: okno główne i delikatna odpowiedź D nad zadaniem. Przepuszczające dotyk okno odpowiedzi sprawdzane jest przez WindowInspector i zrzut; nie musi pojawiać się w drzewie interaktywnych okien dostępności.
- Końcowy podpisany APK release zainstalowano i uruchomiono w tym samym emulatorze po usunięciu wersji debug. Sprawdzono ekran startowy, działający proces i brak błędów AndroidRuntime. Podpis v2/v3 przeszedł weryfikację.
- Test wykrył zbędne przetwarzanie powtórnego zgłoszenia tego samego rozmiaru obrazu. Obsługa pomija teraz takie zgłoszenie, zachowując trwającą analizę. Dodatkowo krótki wynik ma szerokość dopasowaną do treści.

Emulator na tej maszynie potrzebował ponownego uruchomienia i renderowania GPU hosta; pierwszy start systemu przerwał Android Watchdog. Nie był to test uruchomionej aplikacji. Udany przebieg jest zapisany w `artifacts/mobile-tools/instrumentation.log`; obrazy `artifacts/mobile-home.png` i `artifacts/mobile-answer.png` pochodzą z rzeczywistego emulatora.

Raporty: `mobile/android/app/build/reports/`; logi: `artifacts/mobile-tools/`. Nie sprawdzono płatnych wywołań ani prawdziwych kont, fizycznego telefonu, wszystkich nakładek Androida, starszych systemów ani baterii. Mock sieci nie jest testem jakości modelu lub głosu.

## Apple

Źródła i testy XCTest przygotowano, ale **nie skompilowano ani nie uruchomiono na Macu**. XML/JSON i przegląd kodu nie zastępują Xcode. Pozostają do sprawdzenia kompilacja Swift/SDK, podpisywanie, Keychain/App Group, PhotosPicker, Share Extension, App Intent i głos.
