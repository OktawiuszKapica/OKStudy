# OKStudy na telefonie i tablecie

Stan: Android 0.2.2 i źródła Apple 0.1.0, 7 października 2026, oddzielnie od rozszerzenia 2.1.0. Android ma nakładkę, logowanie ChatGPT, edytor kadru, profile i nowy wygląd. W 0.2.2 poprawiono zbieranie tekstu ze strumienia ChatGPT i dodano diagnostykę modeli i odpowiedzi. Na prośbę użytkownika 0.2.2 nie uruchamiano w emulatorze ani na telefonie; testy wykona on osobiście. Instrukcja: [mobile/README.md](../mobile/README.md), weryfikacja: [mobile/TESTING.md](../mobile/TESTING.md), [plan testów telefonu](../mobile/PHONE-TESTS.md). Źródła Apple nie zostały skompilowane na tej maszynie Windows; nie ma IPA ani TestFlight.

## Obsługa

1. Użytkownik wybiera model, sposób odpowiedzi i uruchamia sesję pomocy.
2. Mały znacznik przy krawędzi uruchamia analizę po jednym lub dwóch stuknięciach. Można go przesunąć. Gest jest przypisany do znacznika, żeby zwykłe dotykanie pozostałej części ekranu nadal obsługiwało otwartą aplikację.
3. Gest pobiera świeży obraz, ukrywając znacznik i poprzednią odpowiedź. Domyślnie otwiera edytor; obraz trafia do AI po zatwierdzeniu kadru. Można wybrać cały ekran lub zapisany obszar, osobny dla pionu i poziomu. Między gestami powierzchnia VirtualDisplay jest odłączona, bez kończenia systemowej sesji. Nie zmierzono zużycia baterii na telefonie.
4. Odpowiedź: samo `D`, `Dynamika Techniczna` albo krótkie wyjaśnienie. Android: delikatny tekst/karta lub głos, widoczność 5–80%, wielkość 12–26 sp i czas 3–30 s. Profile oraz podgląd z przeciąganiem ustalają wygląd i pozycję. Opcjonalne przytrzymanie OK prosi o wyjaśnienie ostatniego kadru w aplikacji; przy wyniku nie pojawia się dodatkowy napis.
5. Przerwanie zatrzymuje bieżące zapytanie; zakończenie sesji zwalnia przechwytywanie obrazu i usuwa nakładkę.

## Android

Implementacja w `mobile/android/`: `MediaProjection`, usługa pierwszoplanowa typu `mediaProjection` i niewielkie okna `TYPE_APPLICATION_OVERLAY`. Minimum Android 8.0, compile/target API 36. Wymagane są systemowa zgoda na sesję i zezwolenie na nakładkę. Systemowe oznaczenie przechwytywania pozostaje widoczne. Nowszy Android pozwala udostępnić jedną aplikację lub cały ekran. Zakończenie sesji obsługuje `onStop()`; wznowienie wymaga nowej zgody. Obrót zmienia rozmiar i powierzchnię istniejącego VirtualDisplay zamiast ponownie wykorzystywać token sesji. [MediaProjection](https://developer.android.com/media/grow/media-projection)

Przycisk otrzymuje mały obszar dotyku, a okno odpowiedzi ma przepuszczać dotknięcia zgodnie z ograniczeniami systemu. Nie należy stosować pełnoekranowej niewidocznej warstwy przechwytującej gesty. Część aplikacji może chronić swój obraz; brak dostępnego obrazu trzeba pokazać jako błąd, bez wysyłania poprzedniej klatki. [Okna i flagi Androida](https://developer.android.com/reference/android/view/WindowManager.LayoutParams)

Klucze i tokeny są szyfrowane przez Android Keystore. Ostatni kadr jest dostępny do wyjaśnienia przez 5 minut w pamięci, z wcześniejszym usuwaniem po wyczyszczeniu, zmianie połączenia lub zakończeniu sesji. Wyniki dawnych testów 0.1.0 nie potwierdzają wydania 0.2.2. Na telefonie pozostają do sprawdzenia logowanie i odnawianie konta, kadrowanie, gesty, nowy interfejs, blokada, nakładki producenta, prawdziwe modele, głos oraz bateria.

## iPhone i iPad

Przechwytywanie obrazu i wyświetlanie własnej nakładki nad inną aplikacją to odrębne możliwości. Dokumentacja Apple opisuje ScreenCaptureKit na iOS 27+, lecz wskazany przykład jest oznaczony jako beta. Nie można zakładać dostępności na urządzeniach użytkownika. Wspiera on sesję przechwytywania przez systemowy wybór zawartości, także gdy aplikacja nie jest na pierwszym planie. [Przykład Apple](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-on-ios)

Z dokumentacji okien UIKit nie wynika dostępność dowolnej nakładki nad innymi aplikacjami. Dlatego identyczny mechanizm jak na Androidzie pozostaje niepotwierdzony; nie jest obiecywaną funkcją. Wariant do sprawdzenia na konkretnym systemie: zrzut przekazany skrótem lub arkuszem udostępniania, wynik w panelu OKStudy, jako powiadomienie albo odczyt. Na obsługiwanym iPhonie Back Tap może uruchomić skrót po dwóch lub trzech stuknięciach z tyłu urządzenia; nie zakładamy tej samej funkcji na iPadzie. [Okna UIKit](https://developer.apple.com/documentation/uikit/windows-and-screens), [Back Tap](https://support.apple.com/guide/iphone/back-tap-iphaa57e7885/ios)

Projekt `mobile/ios/` dla iOS/iPadOS 17+ zawiera wybór zrzutu ze Zdjęć, arkusz Udostępnij i akcję Skrótów „Analizuj obraz w OKStudy”. Wynik pojawia się w aplikacji, arkuszu lub systemowym wyniku Skrótu. Nie zaimplementowano nakładki Androida ani beta ScreenCaptureKit. Kompilacja i testy wymagają macOS/Xcode; na tej maszynie Windows nie wykonano tych testów. Konfiguracja podpisu, App Group i Keychain: [README iOS](../mobile/ios/README.md).

## Połączenia i modele

Android 0.2.2 zawiera osobną natywną integrację Sign in with ChatGPT (PKCE, lokalny callback, OIDC/JWKS, magazyn Keystore, odnawianie i wylogowanie) oraz dotychczasowe cztery API. Nie wymaga modułu Windows. Wybór modelu planu jest osobny dla każdej rejestracji konta. Użytkownik potwierdził logowanie i pobranie modeli, ale w 0.2.1 nadal otrzymał błąd braku tekstu. W 0.2.2 usunięto ograniczenie parsera do ostatniego zdarzenia; po sukcesie zbiera także tekst przesyłany wcześniej w fragmentach. Dokładny przebieg odpowiedzi na telefonie pozostaje niepotwierdzony. Limity nie uruchamiają płatnego API jako zastępstwa. Źródła Apple 0.1.0 nadal wymagają klucza API. [Oficjalna dokumentacja OpenAI](https://developers.openai.com/siwc/token-sharing-open-source).

**Połączenia → Diagnostyka ChatGPT** pokazuje metadane ostatniego pobrania katalogu i analizy. Raport odróżnia model nieotrzymany od serwera od modelu ukrytego przez filtr `visibility`; wyszczególnia zgłoszone `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna`. Nie jest to lista zapasowa modeli. Przyczyna ich braku wymaga raportu z telefonu. Raport można skopiować, jest tylko w pamięci i nie zawiera poświadczeń, adresu konta, obrazu ani treści zadania lub odpowiedzi.

Nowe nazwy modeli pobiera katalog konta. Zmiana protokołu zapytań nadal może wymagać aktualizacji aplikacji; wycofanego modelu nie zastępujemy samodzielnie innym płatnym modelem.
