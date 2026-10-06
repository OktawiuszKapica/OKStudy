# OKStudy na telefonie i tablecie

Stan: natywna implementacja mobilna 0.1.0, 6 października 2026, oddzielna od rozszerzenia 2.1.0. Android ma projekt aplikacji z nakładką; iPhone/iPad — źródła SwiftUI, Share Extension i App Intent. Instrukcja: [mobile/README.md](../mobile/README.md), weryfikacja: [mobile/TESTING.md](../mobile/TESTING.md). Źródła Apple nie zostały skompilowane na tej maszynie Windows; nie ma IPA ani TestFlight.

## Obsługa

1. Użytkownik wybiera model, sposób odpowiedzi i uruchamia sesję pomocy.
2. Mały znacznik przy krawędzi uruchamia analizę po jednym lub dwóch stuknięciach. Można go przesunąć. Gest jest przypisany do znacznika, żeby zwykłe dotykanie pozostałej części ekranu nadal obsługiwało otwartą aplikację.
3. Dopiero ten gest wysyła bieżący obraz do wybranego dostawcy. Aplikacja nie prowadzi ciągłej analizy AI. Znacznik i poprzednia odpowiedź są ukrywane na czas pobrania klatki.
4. Odpowiedź: samo `D`, `Dynamika Techniczna` albo krótkie wyjaśnienie. Android: delikatny tekst/karta lub głos, widoczność 5–80%, wielkość 12–26 sp i czas 3–30 s. Przełącznik wyjaśnienia jest w ustawieniach; nie zasłania ekranu obok odpowiedzi.
5. Przerwanie zatrzymuje bieżące zapytanie; zakończenie sesji zwalnia przechwytywanie obrazu i usuwa nakładkę.

## Android

Implementacja w `mobile/android/`: `MediaProjection`, usługa pierwszoplanowa typu `mediaProjection` i niewielkie okna `TYPE_APPLICATION_OVERLAY`. Minimum Android 8.0, compile/target API 36. Wymagane są systemowa zgoda na sesję i zezwolenie na nakładkę. Systemowe oznaczenie przechwytywania pozostaje widoczne. Nowszy Android pozwala udostępnić jedną aplikację lub cały ekran. Zakończenie sesji obsługuje `onStop()`; wznowienie wymaga nowej zgody. Obrót zmienia rozmiar i powierzchnię istniejącego VirtualDisplay zamiast ponownie wykorzystywać token sesji. [MediaProjection](https://developer.android.com/media/grow/media-projection)

Przycisk otrzymuje mały obszar dotyku, a okno odpowiedzi ma przepuszczać dotknięcia zgodnie z ograniczeniami systemu. Nie należy stosować pełnoekranowej niewidocznej warstwy przechwytującej gesty. Część aplikacji może chronić swój obraz; brak dostępnego obrazu trzeba pokazać jako błąd, bez wysyłania poprzedniej klatki. [Okna i flagi Androida](https://developer.android.com/reference/android/view/WindowManager.LayoutParams)

Klucze są szyfrowane przez Android Keystore. Obrazy pozostają w pamięci na czas zadania. Automatyczne testy obejmują przetwarzanie odpowiedzi, katalogi i anulowanie; szczegółowe wyniki znajdują się w raporcie powyżej. Na telefonie docelowym pozostają do sprawdzenia: blokada, nakładki producenta, dłuższa sesja, prawdziwe modele i głos oraz bateria.

## iPhone i iPad

Przechwytywanie obrazu i wyświetlanie własnej nakładki nad inną aplikacją to odrębne możliwości. Dokumentacja Apple opisuje ScreenCaptureKit na iOS 27+, lecz wskazany przykład jest oznaczony jako beta. Nie można zakładać dostępności na urządzeniach użytkownika. Wspiera on sesję przechwytywania przez systemowy wybór zawartości, także gdy aplikacja nie jest na pierwszym planie. [Przykład Apple](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-on-ios)

Z dokumentacji okien UIKit nie wynika dostępność dowolnej nakładki nad innymi aplikacjami. Dlatego identyczny mechanizm jak na Androidzie pozostaje niepotwierdzony; nie jest obiecywaną funkcją. Wariant do sprawdzenia na konkretnym systemie: zrzut przekazany skrótem lub arkuszem udostępniania, wynik w panelu OKStudy, jako powiadomienie albo odczyt. Na obsługiwanym iPhonie Back Tap może uruchomić skrót po dwóch lub trzech stuknięciach z tyłu urządzenia; nie zakładamy tej samej funkcji na iPadzie. [Okna UIKit](https://developer.apple.com/documentation/uikit/windows-and-screens), [Back Tap](https://support.apple.com/guide/iphone/back-tap-iphaa57e7885/ios)

Projekt `mobile/ios/` dla iOS/iPadOS 17+ zawiera wybór zrzutu ze Zdjęć, arkusz Udostępnij i akcję Skrótów „Analizuj obraz w OKStudy”. Wynik pojawia się w aplikacji, arkuszu lub systemowym wyniku Skrótu. Nie zaimplementowano nakładki Androida ani beta ScreenCaptureKit. Kompilacja i testy wymagają macOS/Xcode; na tej maszynie Windows nie wykonano tych testów. Konfiguracja podpisu, App Group i Keychain: [README iOS](../mobile/ios/README.md).

## Połączenia i modele

Wspólne z rozszerzeniem pozostają format krótkiej odpowiedzi i reguły katalogu modeli. Adaptery przechwytywania, okien, głosu i magazynu poświadczeń są zależne od platformy. **Mobilne 0.1.0 wymaga własnego klucza API. Nie ma jeszcze logowania abonamentem ChatGPT na telefonie.** Moduł Windows Native Messaging nie jest przenoszony do telefonu; potrzebna jest osobna integracja mobilna. Aplikacja nie przełącza abonamentu na płatne API bez wiedzy użytkownika.

Nowe nazwy modeli pobiera katalog konta. Zmiana protokołu zapytań nadal może wymagać aktualizacji aplikacji; wycofanego modelu nie zastępujemy samodzielnie innym płatnym modelem.
