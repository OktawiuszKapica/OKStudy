# OKStudy Mobile 0.1.0

Natywne aplikacje towarzyszące rozszerzeniu. Android ma pływający przycisk i odpowiedź nad inną aplikacją. Projekt iPhone/iPad przyjmuje obraz przez Zdjęcia, Udostępnij i Skróty. Obie wersje korzystają bezpośrednio z API Gemini, Claude, OpenAI lub Grok.

**Stan:** pierwsza wersja testowa. Android jest kompilowany na Windows. Źródła Apple wymagają kompilacji i testów w Xcode na Macu; nie są gotowym plikiem instalacyjnym iOS. Pełną listę wykonanych sprawdzeń zawiera [TESTING.md](TESTING.md).

## Android — instalacja

1. Przenieś `releases/OKStudy-Mobile-0.1.0.apk` na telefon i otwórz plik. Zezwól użytej aplikacji Pliki/przeglądarce na instalację APK, gdy Android o to poprosi. Minimum Android 8.0; wersja testowana w emulatorze jest podana w raporcie.
2. Otwórz OKStudy. W „Twoje AI” wybierz dostawcę, wpisz **własny klucz API**, dotknij „Pobierz modele konta”, wybierz model obsługujący obrazy i zapisz połączenie. Identyfikator nowego modelu można wpisać ręcznie.
3. Wybierz „Uruchom pomoc na ekranie”. Włącz „Wyświetlanie nad innymi aplikacjami”, zatwierdź powiadomienia i systemową zgodę na przechwytywanie. Dla działania podczas zmiany aplikacji wybierz **cały ekran**; wybranie jednej aplikacji ogranicza sesję do niej.
4. Otwórz zadanie i **stuknij dwa razy w mały przycisk OK**. Pojedyncze stuknięcie można ustawić w aplikacji. Przeciągnięcie przesuwa przycisk; przytrzymanie otwiera OKStudy.
5. Podczas analizy stuknięcie przycisku ją przerywa. Sesję kończy przycisk w aplikacji albo akcja „Zakończ sesję” w systemowym powiadomieniu. Kolejna sesja wymaga nowej zgody systemu.

Nie jest wymagany Chrome ani moduł Windows. Nie trzeba przyznawać Dostępności ani dostępu do wszystkich plików. Możesz też udostępnić pojedynczy obraz z galerii bez uruchamiania sesji ekranu.

## Odpowiedzi i głos

- Domyślnie samo `D`, wynik albo hasło. Opcjonalnie kilka kroków wyjaśnienia. Odpowiedź nie zawiera surowych znaczników `**`.
- Android: delikatny tekst lub karta, jasny/ciemny kolor, widoczność **5–80%**, wielkość **12–26 sp**, czas **3–30 s**, góra/dół ekranu. Okno odpowiedzi przepuszcza dotyk; maksymalna nieprzezroczystość respektuje ograniczenie Androida. Przycisk pozostaje osobnym małym obszarem dotyku.
- Komunikat pełny, małe pulsujące kropki albo wyłączony. W trybie wyłączonym błąd pokazuje mały `!` przez 1,5 s; szczegóły pozostają w aplikacji.
- Głos systemowy po polsku lub **OpenAI Marin przez osobno płatne API**. Głos jest generowany przez AI. Klucz OpenAI można zapisać niezależnie od klucza używanego do rozwiązywania zadań.
- Android: dzienny limit prób generowania nagrań i pamięć ostatniego nagrania przez 30 minut w danym odtwarzaczu. Licznik nie jest limitem kosztów całego konta API. Apple: każde ręczne „Przeczytaj” dla OpenAI tworzy nowe nagranie; brak mobilnego cache/limitu na iOS w tej wersji.

## Konta, modele i obrazy

**Mobilne 0.1.0 wymaga klucza API. Logowanie abonamentem ChatGPT nie jest jeszcze zaimplementowane na telefonie.** Moduł logowania z Windows nie działa na Androidzie/iOS. Aplikacja nie podmienia logowania na płatne API bez wiedzy użytkownika.

Katalog pobierany jest z konta dostawcy, z obsługą stronicowania. Nie ma zamkniętej listy nazw modeli. Dotychczasowy wybór nie zmienia się sam po odświeżeniu; usunięcie modelu wymaga świadomego wyboru kolejnego. API katalogu nie zawsze podaje możliwości obrazu, dlatego wybrany model może odrzucić zdjęcie. Wtedy aplikacja pokazuje błąd, bez automatycznego przełączania modelu lub dostawcy.

Android utrzymuje systemową sesję obrazu, lecz **wysyła klatkę tylko po geście**. Przed pobraniem klatki ukrywa własny przycisk i poprzednią odpowiedź. Nie nagrywa filmu ani dźwięku. Klucze są szyfrowane kluczem Android Keystore; w projekcie Apple korzystają ze współdzielonego Keychain. Zrzuty pozostają w pamięci na czas analizy; dostawca otrzymuje wybrany obraz. Brak serwera pośredniczącego OKStudy. Odpowiedzi są przechowywane tylko podczas działania procesu.

Obraz chroniony przez inną aplikację może być czarny lub niedostępny. Nie omijamy blokad systemu. Zablokowanie telefonu lub zakończenie udostępniania przez system może przerwać sesję; wznowienie następuje z aplikacji. Zużycie baterii i zachowanie nakładek producenta wymagają testów na docelowym telefonie.

## Budowanie Androida

Projekt `android/` można otworzyć w Android Studio. Używa AGP 8.13.2, Gradle 8.13, Java 17+, compile/target SDK 36, min SDK 26. Brak zewnętrznych bibliotek w APK.

Z katalogu głównego repo na Windows:

```powershell
node scripts/mobile-tools.mjs
node scripts/mobile-build.mjs assembleDebug assembleRelease testDebugUnitTest lintDebug
node scripts/mobile-package.mjs
```

Pierwszy skrypt pobiera i weryfikuje JDK, Gradle i Android SDK w ignorowanym `artifacts/mobile-tools`. Skrypt pakowania podpisuje APK prywatnym kluczem lokalnym. **Zachowaj `mobile/private/` poza repozytorium i paczkami dla użytkowników**: utrata klucza uniemożliwi aktualizację tej instalacji bez odinstalowania. Nie publikuj pliku hasła ani magazynu kluczy.

Alternatywnie z własnym JDK/SDK: `cd mobile/android`, następnie `./gradlew assembleDebug testDebugUnitTest lintDebug` (Windows: `gradlew.bat`). Wskaż SDK przez `ANDROID_HOME` lub ignorowany `local.properties`.

## iPhone i iPad

Zobacz [ios/README.md](ios/README.md). Ten projekt wymaga Maca, Xcode i podpisania na koncie Apple. Nie udaje pływającej nakładki Androida: wynik pokazuje w aplikacji, arkuszu udostępniania albo systemowym wyniku Skrótu. Brak IPA/TestFlight w tym wydaniu.
