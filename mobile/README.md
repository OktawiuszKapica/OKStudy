# OKStudy Mobile — Android 0.3.1

Android ma opcjonalny przycisk, kadrowanie, odpowiedź nad inną aplikacją, logowanie ChatGPT, profile i dedykowane ilustracje. Wersja 0.3.1 dodaje gesty przy krawędzi, dwa narożniki i działania analizy/kadrowania w powiadomieniu przy całkowicie ukrytym OK. Zachowuje małe menu, kafelek, historię, ulubione modele, kontrolę kadru i porównanie z 0.3.0. Nadal obsługuje API Gemini, Claude, OpenAI i Grok. Projekt iPhone/iPad pozostaje w źródłach 0.1.0.

**Stan:** 0.3.1 skompilowana i podpisana na Windows. Zgodnie z dyspozycją użytkownika **nie uruchamiano Androida ani jego testów na emulatorze lub telefonie**; wykonano kompilację, Lint i kontrolę podpisu. Użytkownik potwierdził działanie poprzedniej 0.2.2. Nowe funkcje sprawdza osobiście według [PHONE-TESTS.md](PHONE-TESTS.md). Źródła Apple wymagają Maca/Xcode. [Weryfikacja i historia](TESTING.md).

## Nowy wygląd i sterowanie

- Trzy zakładki: Start, Połączenia, Wygląd. Oryginalny monogram OK, grafit i limonka, dwie dedykowane ilustracje ImageGen.
- Profile Dyskretny, Czytelny, Nauka i Głos; ręczne ustawienia zachowują możliwość bardzo delikatnej odpowiedzi.
- Podgląd odpowiedzi D z przeciąganiem i suwakami pozycji. Nad zadaniem pozostaje tylko wynik przepuszczający dotyk.
- Kadrowanie przed każdym zadaniem, zapamiętany kadr albo cały ekran. Kadry zapisują się osobno dla pionu i poziomu, nie dla konkretnej aplikacji.
- Opcjonalne przytrzymanie OK otwiera wyjaśnienie ostatniego kadru w aplikacji, bez dodatkowego napisu przy krótkiej odpowiedzi.
- Powierzchnia przechwytywania jest odłączana między gestami. Wpływu na baterię nie zmierzono na fizycznym telefonie.

## Android — instalacja

1. Zakończ aktywną sesję OKStudy, przenieś `releases/OKStudy-Mobile-0.3.1.apk` na telefon i otwórz plik. Zezwól aplikacji Pliki/przeglądarce na instalację APK, jeśli Android o to poprosi. Minimum Android 8.0. Aktualizacja zachowuje podpis, identyfikator i ustawienia 0.1.0/0.2.x — nie odinstalowuj wcześniejszej wersji.
2. W zakładce **Połączenia** wybierz **ChatGPT — Twój plan**, dotknij **Continue with ChatGPT** i zatwierdź połączenie w przeglądarce. Po komunikacie wróć do OKStudy. Alternatywnie wybierz dostawcę API i zapisz własny klucz. Następnie **Pobierz modele konta**, wybierz model obsługujący obrazy i **Zapisz połączenie**. Nowy identyfikator można wpisać w polu Model lub przez „Wpisz identyfikator” w oknie listy. Przykład: `gpt-6.1-sol`; dostępność potwierdza dopiero zadanie. Lista pochodzi z OpenAI dla tego połączenia, więc nie musi pokrywać się z listą w ChatGPT/Codex.
3. Wybierz „Uruchom pomoc na ekranie”. Włącz „Wyświetlanie nad innymi aplikacjami”, zatwierdź powiadomienia i systemową zgodę na przechwytywanie. Dla działania podczas zmiany aplikacji wybierz **cały ekran**; wybranie jednej aplikacji ogranicza sesję do niej.
4. Otwórz zadanie i **stuknij dwa razy w mały przycisk OK**. Domyślnie wybierz fragment zrzutu i zatwierdź „Analizuj zaznaczony fragment”. Pojedyncze stuknięcie i pracę bez edytora kadru ustawisz w Wyglądzie. Przeciągnięcie przesuwa przycisk; przytrzymanie otwiera aplikację albo wyjaśnienie, zgodnie z wyborem.
5. Podczas analizy stuknięcie przycisku ją przerywa. Sesję kończy przycisk w aplikacji albo akcja „Zakończ sesję” w systemowym powiadomieniu. Kolejna sesja wymaga nowej zgody systemu.

Nie jest wymagany Chrome ani moduł Windows. Nie trzeba przyznawać Dostępności ani dostępu do wszystkich plików. Możesz też udostępnić pojedynczy obraz z galerii bez uruchamiania sesji ekranu.

## Obsługa bez przycisku OK

Wygląd → Gesty i kadr: wybierz OK, jedną strefę, dwa narożniki lub same działania w powiadomieniu. Jedna strefa: dwa stuknięcia analizują cały udostępniony obraz, przytrzymanie wybiera fragment. Dwa narożniki: wybrany analizuje obraz, przeciwny wybiera fragment. Ustaw róg, rozmiar 24–64 dp, widoczność znacznika i wibrację. Strefy przechwytują dotyk tylko w swoich obszarach. Zmiany działają w aktywnej sesji; ukryty OK pozostaje ukryty podczas analizy, wyniku i błędu.

Powiadomienie ma Analizuj ekran / Wybierz fragment oraz Przerwij analizę lub Zakończ sesję. Rozwinięte powiadomienie zamyka się przez krótkie przejście bez interfejsu przed zrzutem. Pełny obraz trafia do wybranego AI bez edytora; model ma rozwiązać jedno główne pytanie pośrodku i poprosić o fragment przy niejednoznaczności. Nie gwarantujemy rozpoznania intencji przez model. Początek nowej sesji nadal wymaga zgody Androida; nie dodano Dostępności ani ukrytego monitorowania.

## Odpowiedzi i głos

- Domyślnie samo `D`, wynik albo hasło. Opcjonalnie kilka kroków wyjaśnienia. Odpowiedź nie zawiera surowych znaczników `**`.
- Android: delikatny tekst lub karta, jasny/ciemny kolor, widoczność **5–80%**, wielkość **12–26 sp**, czas **3–30 s**, góra/dół ekranu. Okno odpowiedzi przepuszcza dotyk; maksymalna nieprzezroczystość respektuje ograniczenie Androida. Przycisk pozostaje osobnym małym obszarem dotyku.
- Komunikat pełny, małe pulsujące kropki albo wyłączony. W trybie wyłączonym błąd pokazuje mały `!` przez 1,5 s; szczegóły pozostają w aplikacji.
- Głos systemowy po polsku lub **OpenAI Marin przez osobno płatne API**. Głos jest generowany przez AI. Klucz OpenAI zapiszesz w sekcji Głos bez zmiany konta/dostawcy rozwiązywania zadań. Plan ChatGPT nie zastępuje klucza do odczytu.
- Android: dzienny limit prób generowania nagrań i pamięć ostatniego nagrania przez 30 minut w danym odtwarzaczu. Licznik nie jest limitem kosztów całego konta API. Apple: każde ręczne „Przeczytaj” dla OpenAI tworzy nowe nagranie; brak mobilnego cache/limitu na iOS w tej wersji.

## Konta, modele i obrazy

**Android ma natywną integrację Sign in with ChatGPT**, bez modułu Windows. Logowanie otwiera systemową przeglądarkę; po zgodzie wracasz do aplikacji. Obsługuje osobne konta, odnawianie sesji, wylogowanie i odsyłacz do limitów. Nie przełącza się sam na płatne API. Użytkownik potwierdził działanie analizy po poprawkach w 0.2.2. Nie potwierdzono osobno przyczyny brakujących nazw modeli.

Przy problemie pobierz modele, wykonaj analizę i otwórz **Połączenia → Diagnostyka ChatGPT → Kopiuj raport**. Raport pokazuje status HTTP, rodzaje odebranych zdarzeń, liczbę znaków oraz identyfikatory i widoczność modeli zwróconych przez serwer. Wyróżnia `gpt-6.1-sol`, `gpt-6-sol` i `gpt-6-luna`, ale nie dopisuje ich do listy jako dostępnych. Przyczyna ich braku na zgłoszonym koncie pozostaje nieustalona; sam zrzut listy i informacja o abonamencie x5 jej nie rozstrzygają. Raport nie zawiera kluczy, tokenów, adresu konta, obrazu ani treści zadania i odpowiedzi. Pozostaje w pamięci procesu, jest przypisany do aktywnego połączenia i nie wysyła się automatycznie.

Po stronie kodu: Authorization Code + PKCE, stan i nonce, lokalny callback `127.0.0.1`, podpis ID tokenu/JWKS i kontrola tożsamości; credential vault zaszyfrowany w Keystore. Modele planu pobierane są z jego katalogu; inference używa publicznego Responses API z `store:false`, `stream:true` i potwierdzeniem `response.completed`. [Dokumentacja OpenAI](https://developers.openai.com/siwc/token-sharing-open-source).

Katalog pobierany jest z konta dostawcy, z obsługą stronicowania. Nie ma zamkniętej listy nazw modeli. Dotychczasowy wybór nie zmienia się sam po odświeżeniu; usunięcie modelu wymaga świadomego wyboru kolejnego. API katalogu nie zawsze podaje możliwości obrazu, dlatego wybrany model może odrzucić zdjęcie. Wtedy aplikacja pokazuje błąd, bez automatycznego przełączania modelu lub dostawcy.

Android utrzymuje zatwierdzoną sesję obrazu, lecz pobiera świeżą klatkę po geście. W trybie wyboru fragmentu **wysłanie do AI następuje po zatwierdzeniu kadru**. Przed pobraniem ukrywa własne nakładki. Nie nagrywa filmu ani dźwięku. Klucze/tokeny chroni Keystore. Ostatni kadr jest dostępny do wyjaśnienia/sprawdzenia przez 5 minut w RAM; wyczyszczenie, zmiana połączenia lub koniec sesji usuwa go wcześniej. Kadr nie jest zapisywany na dysku. Historia przechowuje tylko tekst: domyślnie w RAM procesu, opcjonalnie szyfrowana przez Keystore.

## Menu, historia i modele

- Przytrzymaj OK: Analizuj, Powtórz, Wyjaśnij w aplikacji, Zmień profil. Menu znika po akcji/5 s. W Wyglądzie można wybrać dawną akcję przytrzymania.
- Wygląd → Dodaj kafelek OKStudy: kafelek Androida rozpoczyna/kończy sesję. Uruchomienie nadal przechodzi przez zgody systemowe.
- Start → Historia: wyszukaj, przypnij/odepnij, usuń lub Pokaż ponownie bez nowego zapytania. Limit 60 pozycji/600 tys. znaków i 20 przypiętych. Wygląd pozwala włączyć trwały zapis i usunąć historię.
- Połączenia → ★: do 8 ulubionych na konto/klucz, dwa dostępne ulubione na Start. Katalog odświeża się po 6 h, nowe identyfikatory mają Nowy przez 24 h. Pierwsze pobranie nie oznacza całej listy jako nowej.
- Ostrzeżenie kadru sprawdza lokalnie wielkość, kontrast i szczegóły. Można poprawić ramkę, wyłączyć kontrolę lub wybrać Wyślij mimo ostrzeżenia.
- Start → Sprawdź modelem: wybierz inny model. Ten sam kadr trafia do niego jako osobne zapytanie bez pierwszej odpowiedzi. To dodatkowe użycie planu/API. Obie odpowiedzi są widoczne w aplikacji; nad zadaniem nie pojawia się dodatkowy przycisk. Zgodność nie gwarantuje poprawności.

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

Zobacz [ios/README.md](ios/README.md). Źródła 0.1.0 Apple nie zostały zmienione przez wydanie Androida 0.3.1 i nadal wymagają klucza API. Projekt wymaga Maca, Xcode i podpisania na koncie Apple. Wynik pokazuje w aplikacji, arkuszu udostępniania albo systemowym wyniku Skrótu. Brak IPA/TestFlight w tym wydaniu.
