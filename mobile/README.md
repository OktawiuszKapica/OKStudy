# OKStudy Mobile — Android 0.2.0

Android ma pływający przycisk, kadrowanie i odpowiedź nad inną aplikacją. Wersja 0.2.0 dodaje logowanie kontem ChatGPT, profile oraz nowy wygląd z ilustracjami. Nadal można korzystać z API Gemini, Claude, OpenAI lub Grok. Projekt iPhone/iPad pozostaje na etapie źródeł 0.1.0 z kluczami API, Zdjęciami, Udostępnij i Skrótami.

**Stan:** wersja testowa Androida skompilowana na Windows. Zgodnie z dyspozycją użytkownika **0.2.0 nie uruchamiano w emulatorze ani na telefonie**; wykonano kompilację, analizę statyczną i weryfikację podpisu. Testy konta i działania przeprowadza użytkownik według [PHONE-TESTS.md](PHONE-TESTS.md). Źródła Apple wymagają kompilacji i testów w Xcode na Macu. [Weryfikacja i historia](TESTING.md).

## Nowy wygląd i sterowanie

- Trzy zakładki: Start, Połączenia, Wygląd. Oryginalny monogram OK, grafit i limonka, dwie dedykowane ilustracje ImageGen.
- Profile Dyskretny, Czytelny, Nauka i Głos; ręczne ustawienia zachowują możliwość bardzo delikatnej odpowiedzi.
- Podgląd odpowiedzi D z przeciąganiem i suwakami pozycji. Nad zadaniem pozostaje tylko wynik przepuszczający dotyk.
- Kadrowanie przed każdym zadaniem, zapamiętany kadr albo cały ekran. Kadry zapisują się osobno dla pionu i poziomu, nie dla konkretnej aplikacji.
- Opcjonalne przytrzymanie OK otwiera wyjaśnienie ostatniego kadru w aplikacji, bez dodatkowego napisu przy krótkiej odpowiedzi.
- Powierzchnia przechwytywania jest odłączana między gestami. Wpływu na baterię nie zmierzono na fizycznym telefonie.

## Android — instalacja

1. Przenieś `releases/OKStudy-Mobile-0.2.0.apk` na telefon i otwórz plik. Zezwól aplikacji Pliki/przeglądarce na instalację APK, jeśli Android o to poprosi. Minimum Android 8.0. Aktualizacja zachowuje podpis, identyfikator i ustawienia 0.1.0 — nie odinstalowuj wcześniejszej wersji.
2. W zakładce **Połączenia** wybierz **ChatGPT — Twój plan**, dotknij **Continue with ChatGPT** i zatwierdź połączenie w przeglądarce. Po komunikacie wróć do OKStudy. Alternatywnie wybierz dostawcę API i zapisz własny klucz. Następnie **Pobierz modele konta**, wybierz model obsługujący obrazy i **Zapisz połączenie**. Nowy identyfikator można wpisać ręcznie.
3. Wybierz „Uruchom pomoc na ekranie”. Włącz „Wyświetlanie nad innymi aplikacjami”, zatwierdź powiadomienia i systemową zgodę na przechwytywanie. Dla działania podczas zmiany aplikacji wybierz **cały ekran**; wybranie jednej aplikacji ogranicza sesję do niej.
4. Otwórz zadanie i **stuknij dwa razy w mały przycisk OK**. Domyślnie wybierz fragment zrzutu i zatwierdź „Analizuj zaznaczony fragment”. Pojedyncze stuknięcie i pracę bez edytora kadru ustawisz w Wyglądzie. Przeciągnięcie przesuwa przycisk; przytrzymanie otwiera aplikację albo wyjaśnienie, zgodnie z wyborem.
5. Podczas analizy stuknięcie przycisku ją przerywa. Sesję kończy przycisk w aplikacji albo akcja „Zakończ sesję” w systemowym powiadomieniu. Kolejna sesja wymaga nowej zgody systemu.

Nie jest wymagany Chrome ani moduł Windows. Nie trzeba przyznawać Dostępności ani dostępu do wszystkich plików. Możesz też udostępnić pojedynczy obraz z galerii bez uruchamiania sesji ekranu.

## Odpowiedzi i głos

- Domyślnie samo `D`, wynik albo hasło. Opcjonalnie kilka kroków wyjaśnienia. Odpowiedź nie zawiera surowych znaczników `**`.
- Android: delikatny tekst lub karta, jasny/ciemny kolor, widoczność **5–80%**, wielkość **12–26 sp**, czas **3–30 s**, góra/dół ekranu. Okno odpowiedzi przepuszcza dotyk; maksymalna nieprzezroczystość respektuje ograniczenie Androida. Przycisk pozostaje osobnym małym obszarem dotyku.
- Komunikat pełny, małe pulsujące kropki albo wyłączony. W trybie wyłączonym błąd pokazuje mały `!` przez 1,5 s; szczegóły pozostają w aplikacji.
- Głos systemowy po polsku lub **OpenAI Marin przez osobno płatne API**. Głos jest generowany przez AI. Klucz OpenAI zapiszesz w sekcji Głos bez zmiany konta/dostawcy rozwiązywania zadań. Plan ChatGPT nie zastępuje klucza do odczytu.
- Android: dzienny limit prób generowania nagrań i pamięć ostatniego nagrania przez 30 minut w danym odtwarzaczu. Licznik nie jest limitem kosztów całego konta API. Apple: każde ręczne „Przeczytaj” dla OpenAI tworzy nowe nagranie; brak mobilnego cache/limitu na iOS w tej wersji.

## Konta, modele i obrazy

**Android 0.2.0 ma natywną integrację Sign in with ChatGPT**, bez modułu Windows. Logowanie otwiera systemową przeglądarkę; po zgodzie wracasz do aplikacji. Dostępność zależy od konta, planu, zgody na użycie planu i wybranego modelu. Obsługiwane są osobne rejestracje kont, odnawianie sesji, wylogowanie oraz odsyłacz do limitów. Nie ma automatycznego przełączenia na płatne API. Integracja wymaga jeszcze testu na prawdziwym koncie użytkownika.

Po stronie kodu: Authorization Code + PKCE, stan i nonce, lokalny callback `127.0.0.1`, podpis ID tokenu/JWKS i kontrola tożsamości; credential vault zaszyfrowany w Keystore. Modele planu pobierane są z jego katalogu; inference używa publicznego Responses API z `store:false`, `stream:true` i potwierdzeniem `response.completed`. [Dokumentacja OpenAI](https://developers.openai.com/siwc/token-sharing-open-source).

Katalog pobierany jest z konta dostawcy, z obsługą stronicowania. Nie ma zamkniętej listy nazw modeli. Dotychczasowy wybór nie zmienia się sam po odświeżeniu; usunięcie modelu wymaga świadomego wyboru kolejnego. API katalogu nie zawsze podaje możliwości obrazu, dlatego wybrany model może odrzucić zdjęcie. Wtedy aplikacja pokazuje błąd, bez automatycznego przełączania modelu lub dostawcy.

Android utrzymuje zatwierdzoną przez system sesję obrazu, lecz pobiera świeżą klatkę po geście. W trybie wyboru fragmentu **wysłanie do AI następuje dopiero po zatwierdzeniu kadru**. Przed pobraniem klatki ukrywa własny przycisk i poprzednią odpowiedź. Nie nagrywa filmu ani dźwięku. Klucze i tokeny chroni Android Keystore; w projekcie Apple klucze trafiają do Keychain. Ostatni wysłany kadr jest dostępny w pamięci do wyjaśnienia przez 5 minut; „Wyczyść”, zmiana połączenia lub zakończenie sesji usuwa go wcześniej. Nie zapisuje się w galerii ani na dysku. Brak serwera pośredniczącego OKStudy. Odpowiedzi są przechowywane tylko podczas działania procesu.

## Aktualizacje

„Sprawdź aktualizacje” w Połączeniach odczytuje publiczne wydania [repozytorium OKStudy](https://github.com/OktawiuszKapica/OKStudy/releases). Rozpoznaje nowsze pliki `OKStudy-Mobile-X.Y.Z.apk` i otwiera pobieranie w przeglądarce. W tym zadaniu nie publikowano wydania; funkcja pokaże nowy APK dopiero po jego publikacji. Pobranie/instalacja wymaga działania użytkownika, a Android weryfikuje podpis aktualizacji.

Obraz chroniony przez inną aplikację może być czarny lub niedostępny. Nie omijamy blokad systemu. Zablokowanie telefonu lub zakończenie udostępniania przez system może przerwać sesję; wznowienie następuje z aplikacji. Zużycie baterii i zachowanie nakładek producenta wymagają testów na docelowym telefonie.

## Budowanie Androida

Projekt `android/` można otworzyć w Android Studio. Używa AGP 8.13.2, Gradle 8.13, Java 17+, compile/target SDK 36, min SDK 26. Brak zewnętrznych bibliotek w APK.

Z katalogu głównego repo na Windows:

```powershell
node scripts/mobile-tools.mjs
node scripts/mobile-build.mjs assembleRelease lintRelease '-Dorg.gradle.jvmargs=-Xmx768m'
node scripts/mobile-package.mjs
```

Pierwszy skrypt pobiera i weryfikuje JDK, Gradle i Android SDK w ignorowanym `artifacts/mobile-tools`. Skrypt pakowania podpisuje APK prywatnym kluczem lokalnym. **Zachowaj `mobile/private/` poza repozytorium i paczkami dla użytkowników**: utrata klucza uniemożliwi aktualizację tej instalacji bez odinstalowania. Nie publikuj pliku hasła ani magazynu kluczy.

Alternatywnie z własnym JDK/SDK: `cd mobile/android`, następnie `./gradlew assembleRelease lintRelease` (Windows: `gradlew.bat`). Wskaż SDK przez `ANDROID_HOME` lub ignorowany `local.properties`. Testów urządzenia nie uruchamiać bez zmiany dyspozycji użytkownika. Grafiki i prompty: [assets/README.md](assets/README.md).

## iPhone i iPad

Zobacz [ios/README.md](ios/README.md). Źródła 0.1.0 Apple nie zostały zmienione przez wydanie Androida 0.2.0 i nadal wymagają klucza API. Projekt wymaga Maca, Xcode i podpisania na koncie Apple. Wynik pokazuje w aplikacji, arkuszu udostępniania albo systemowym wyniku Skrótu. Brak IPA/TestFlight w tym wydaniu.
