# Weryfikacja OKStudy Mobile 0.1.0

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
