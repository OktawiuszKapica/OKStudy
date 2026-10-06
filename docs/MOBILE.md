# OKStudy na telefonie i tablecie

Stan: projekt funkcji, 6 października 2026. Wydanie 2.1.0 nie zawiera APK ani aplikacji iOS. Docelowo są to aplikacje natywne działające także przy otwartej innej aplikacji. Przeglądarka nie jest wymagana. Dobór wspieranych wersji systemów wymaga informacji o urządzeniach użytkownika.

## Obsługa

1. Użytkownik wybiera model, sposób odpowiedzi i uruchamia sesję pomocy.
2. Mały znacznik przy krawędzi uruchamia analizę po jednym lub dwóch stuknięciach. Można go przesunąć. Gest jest przypisany do znacznika, żeby zwykłe dotykanie pozostałej części ekranu nadal obsługiwało otwartą aplikację.
3. Dopiero ten gest wysyła bieżący obraz do wybranego dostawcy. Aplikacja nie prowadzi ciągłej analizy AI. Znacznik i poprzednia odpowiedź są ukrywane na czas pobrania klatki.
4. Odpowiedź: samo `D`, `Dynamika Techniczna` albo krótkie wyjaśnienie. Wybór delikatnego tekstu, etykiety lub głosu; regulowana widoczność i czas. Dłuższe wyjaśnienie dostępne na osobne żądanie, bez stałego napisu obok wyniku.
5. Przerwanie zatrzymuje bieżące zapytanie; zakończenie sesji zwalnia przechwytywanie obrazu i usuwa nakładkę.

## Android

Plan techniczny: `MediaProjection`, usługa pierwszoplanowa typu `mediaProjection` i niewielkie okna `TYPE_APPLICATION_OVERLAY`. Wymagane są systemowa zgoda na sesję przechwytywania i zezwolenie na nakładkę. Systemowe oznaczenie przechwytywania pozostaje widoczne. Nowszy Android pozwala udostępnić jedną aplikację lub cały ekran. Zablokowanie urządzenia może zakończyć sesję; aplikacja musi obsłużyć `onStop()` i ponownie poprosić o zgodę przy wznowieniu. [MediaProjection](https://developer.android.com/media/grow/media-projection)

Przycisk otrzymuje mały obszar dotyku, a okno odpowiedzi ma przepuszczać dotknięcia zgodnie z ograniczeniami systemu. Nie należy stosować pełnoekranowej niewidocznej warstwy przechwytującej gesty. Część aplikacji może chronić swój obraz; brak dostępnego obrazu trzeba pokazać jako błąd, bez wysyłania poprzedniej klatki. [Okna i flagi Androida](https://developer.android.com/reference/android/view/WindowManager.LayoutParams)

Pierwszy prototyp powinien potwierdzić na urządzeniu: zgodę, nakładkę, stuknięcie, jeden świeży zrzut, odpowiedź i poprawne zatrzymanie. Następnie: obrót ekranu, powrót z blokady, zmiana aplikacji, brak sieci, anulowanie i zużycie baterii. Klucze wymagają magazynu opartego o Android Keystore. Obrazy powinny pozostać tylko w pamięci na czas zadania.

## iPhone i iPad

Przechwytywanie obrazu i wyświetlanie własnej nakładki nad inną aplikacją to odrębne możliwości. Dokumentacja Apple opisuje ScreenCaptureKit na iOS 27+, lecz wskazany przykład jest oznaczony jako beta. Nie można zakładać dostępności na urządzeniach użytkownika. Wspiera on sesję przechwytywania przez systemowy wybór zawartości, także gdy aplikacja nie jest na pierwszym planie. [Przykład Apple](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-on-ios)

Z dokumentacji okien UIKit nie wynika dostępność dowolnej nakładki nad innymi aplikacjami. Dlatego identyczny mechanizm jak na Androidzie pozostaje niepotwierdzony; nie jest obiecywaną funkcją. Wariant do sprawdzenia na konkretnym systemie: zrzut przekazany skrótem lub arkuszem udostępniania, wynik w panelu OKStudy, jako powiadomienie albo odczyt. Na obsługiwanym iPhonie Back Tap może uruchomić skrót po dwóch lub trzech stuknięciach z tyłu urządzenia; nie zakładamy tej samej funkcji na iPadzie. [Okna UIKit](https://developer.apple.com/documentation/uikit/windows-and-screens), [Back Tap](https://support.apple.com/guide/iphone/back-tap-iphaa57e7885/ios)

Kompilacja i testy aplikacji Apple wymagają środowiska macOS/Xcode i urządzenia. Na tej maszynie Windows nie wykonano tych testów.

## Połączenia i modele

Wspólne z rozszerzeniem pozostają format krótkiej odpowiedzi, profile i reguły katalogu modeli. Adaptery przechwytywania, okien, głosu i magazynu poświadczeń są zależne od platformy. Modułu Windows Native Messaging nie przenosi się do telefonu. Obsługa konta ChatGPT wymaga osobnego potwierdzenia oficjalnej ścieżki logowania dla platformy mobilnej; samo posiadanie abonamentu nie zastępuje tego kroku.

Nowe nazwy modeli pobiera katalog konta. Zmiana protokołu zapytań nadal może wymagać aktualizacji aplikacji; wycofanego modelu nie zastępujemy samodzielnie innym płatnym modelem.
