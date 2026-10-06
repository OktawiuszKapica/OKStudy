# OKStudy na iPhone i iPad — źródła 0.1.0

**Nie skompilowano ani nie uruchomiono na Apple.** Ten projekt przygotowano na Windows. Potrzebuje sprawdzenia w Xcode i na urządzeniu przed dystrybucją. Minimum iOS/iPadOS 17. Nie zawiera IPA ani konfiguracji TestFlight.

## Implementacja

- SwiftUI: wybór zrzutu przez PhotosPicker, podgląd przed wysłaniem, analiza, wynik, udostępnianie tekstu, systemowy głos polski lub OpenAI Marin przez płatne API.
- Share Extension: jedno zdjęcie z systemowego „Udostępnij”, jawny przycisk Analizuj, wynik i głos w arkuszu. Klucz i model ustawia się wcześniej w głównej aplikacji.
- App Intent „Analizuj obraz w OKStudy”: przyjmuje plik obrazu i zwraca tekst. Pozwala połączyć systemowe akcje Skrótów: „Zrób zrzut ekranu” → „Analizuj obraz w OKStudy” → „Pokaż wynik” / „Czytaj tekst”. Nie uruchamia samoczynnego czytania ekranu.
- Cztery API i ich aktualne katalogi modeli; ręczny identyfikator; brak automatycznej zmiany modelu. Klucze w Keychain, ustawienia w App Group, obrazy w pamięci, brak historii.

Nie zaimplementowano nakładki nad innymi aplikacjami ani beta ScreenCaptureKit z iOS 27. Podwójne/trzykrotne stuknięcie w tył **obsługiwanego iPhone’a** może uruchamiać skonfigurowany Skrót. Nie zakładamy takiego gestu na iPadzie. Opóźnienia i limit wykonywania Skrótów trzeba sprawdzić na docelowym urządzeniu.

## Kompilacja na Macu

1. Zainstaluj Xcode z SDK iOS oraz XcodeGen 2.44 lub nowszy (np. `brew install xcodegen`).
2. W katalogu `mobile/ios` uruchom `xcodegen generate`. Powstanie `OKStudy.xcodeproj` z aplikacją, rozszerzeniem i testami.
3. Otwórz projekt. W ustawieniach obu targetów wybierz własny **Development Team**. Jeżeli identyfikatory `pl.okstudy.mobile` są niedostępne, zmień identyfikator aplikacji, rozszerzenia i współdzielonej grupy na własne.
4. Włącz capability **App Groups** w aplikacji i rozszerzeniu: ta sama grupa co `OKSTUDY_APP_GROUP` (domyślnie `group.pl.okstudy.mobile`). Włącz **Keychain Sharing** w obu targetach z tą samą grupą co `OKSTUDY_KEYCHAIN_GROUP`. Konto/profil musi obsługiwać te capabilities. Domyślny projekt nie zawiera żadnego Team ID ani certyfikatu.
5. Uruchom testy schematu `OKStudy`, następnie aplikację na odblokowanym urządzeniu. Ustaw API. W Zdjęciach wybierz zrzut → Udostępnij → OKStudy; w razie potrzeby dodaj rozszerzenie do listy.
6. W aplikacji Skróty dodaj akcję „Analizuj obraz w OKStudy” po zrobieniu zrzutu i przed pokazaniem/odczytaniem wyniku. Na obsługiwanym iPhonie przypisz ten Skrót w Ustawienia → Dostępność → Dotyk → Stuknięcie w tył. System może wymagać potwierdzeń przy pierwszym uruchomieniu.

Testy w `Tests/APITests.swift` są przygotowane, ale **nie uruchomiono ich na Windows**. Pozostają do weryfikacji: kompilacja Swift/SDK, podpisywanie obu targetów, uprawnienia App Group/Keychain, import ze Zdjęć, rzeczywisty cykl Share Extension, App Intent, głos i rotacja iPada. Przed publikacją w App Store potrzebne są także manifesty prywatności, metadane i testy wydania.

Źródła: [Share Extensions](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html), [App Intents](https://developer.apple.com/documentation/appintents), [wspólny Keychain](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps), [Back Tap](https://support.apple.com/guide/iphone/back-tap-iphaa57e7885/ios), [XcodeGen](https://github.com/yonaskolb/XcodeGen).
