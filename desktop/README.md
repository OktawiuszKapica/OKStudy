# OKStudy Windows 0.2.1 — Studio

Uruchom `releases/OKStudy-Windows-0.2.1-Setup.exe`. Instalator aktualizuje poprzednią wersję, zachowuje ustawienia i dodaje aplikację do menu Start oraz listy aplikacji Windows. Alternatywnie rozpakuj `OKStudy-Windows-0.2.1-portable.zip` i uruchom `OKStudy.exe`; pliki oraz folder `ui` muszą pozostać obok programu. Windows 10/11 x64, .NET Framework 4.8 i Microsoft WebView2. Instalator pozwala uzupełnić brakujący WebView2 oficjalnym instalatorem Microsoft i zawiera własny Node. Pliki OKStudy EXE nie mają podpisu wydawcy.

Widok **Studio** odtwarza zatwierdzony projekt: Manrope, boczna nawigacja, dedykowana ilustracja, grafit/limonka i jasny Papier. Ten sam renderer i styl obsługują program, instalator i deinstalator. Wersja 0.2.0 naprawia brak identyfikatora aktywnego konta po logowaniu, przez który Windows odrzucał natychmiastowe pobranie modeli. Katalog pozostaje rzeczywistą listą konta, z odświeżaniem, ulubionymi i ręcznym wyborem. Wybór jest przechowywany osobno dla konta lub klucza. Szczegóły połączenia i pełny ostatni komunikat można odczytać w aplikacji.

W **Połączeniach** wybierz ChatGPT lub jedno z czterech API. ChatGPT korzysta z oficjalnego logowania w przeglądarce i współdzieli lokalny magazyn kont z companionem rozszerzenia. Jeśli konto było połączone wcześniej, wybierz je. API wymaga osobnego klucza i jest rozliczane osobno. Wklej klucz, pobierz katalog, wybierz model i zapisz połączenie. Model spoza listy możesz wpisać ręcznie; dopiero zapytanie potwierdzi dostęp.

| Działanie | Skrót |
|---|---|
| Zaznacz fragment i analizuj po puszczeniu myszy | Alt + Z |
| Analizuj monitor kursora lub aktywne okno | Alt + X |
| Zaznacz z ręcznym potwierdzeniem | Ctrl + Alt + O |
| Potwierdź fragment w podglądzie | Enter |
| Anuluj zaznaczanie | Esc |
| Powtórz ostatnią odpowiedź bez nowego zapytania | Ctrl + Alt + R |
| Przerwij analizę/odczyt | Ctrl + Alt + K |

**Skróty** pozwalają zmienić Alt+Z / Alt+X i całkowicie ukryć **OK**. Kliknięcie OK lub Zaznacz zadanie działa jak szybkie zaznaczanie: puszczenie myszy wysyła fragment bez Enter i ostrzeżenia czytelności. Ctrl+Alt+O zachowuje ręczne potwierdzenie oraz ostrzeżenie. Esc anuluje bez zapytania. Skróty zajęte przez inny program są zgłaszane; nieudany zapis przywraca poprzednie kombinacje. Ctrl+Alt+R/K pozostają zarezerwowane dla powtórki/przerwania. **Dodaj obraz** otwiera PNG/JPG/BMP z ręcznym kadrowaniem. Ikona przy zegarze pozostaje dostępna przy ukrytym OK.

Alt+X wysyła cały wybrany monitor lub aktywne okno bez edytora kadru. Model otrzymuje polecenie wyboru jednego pytania przy położeniu kursora lub pośrodku obrazu; przy niejednoznaczności ma odpowiedzieć „Wybierz fragment”. To wskazówka dla AI, nie gwarancja rozpoznania. Reklamy, nawigacja i inne pytania mają być pomijane. Kadry nie są zapisywane na dysku. Zrzut powstaje na polecenie użytkownika; aplikacja nie monitoruje ekranu stale. Chronione okna, treści DRM i ekran zabezpieczeń Windows mogą być puste/niedostępne. Układy powyżej 60 mln pikseli wymagają zmniejszenia rozdzielczości lub liczby ekranów.

**Wygląd** pokazuje podgląd odpowiedzi na przykładowym dokumencie i pozwala ustawić sam tekst/kartę, widoczność 5–100%, wielkość, czas oraz komunikat analizy. W **Więcej ustawień** znajdziesz położenie, motyw i automatyczny głos Windows. Nad programem pozostaje tylko odpowiedź, przepuszczająca kliknięcia. Profile Dyskretny/Czytelny/Nauka zmieniają prezentację. Kropki rzeczywiście animują się i pozwalają przerwać analizę kliknięciem. Wyłączony komunikat pokazuje jedynie wykrzyknik przez 1,5 sekundy przy błędzie; pełny komunikat pozostaje w aplikacji. Rozszerzenie i Android zachowują swoje opcje głosu OpenAI.

**Sprawdź innym modelem** wysyła ten sam kadr jako nowe, niezależne zadanie. To dodatkowe użycie planu albo API. Wyniki są pokazane razem w aplikacji; oryginalny wynik nie jest nadpisywany. Do wyjaśnienia/sprawdzenia ostatni kadr jest dostępny w pamięci przez 5 minut. Wyczyszczenie, zmiana połączenia i zamknięcie programu zwalniają go wcześniej. Powtórka z historii zawiera tylko tekst i nie odtwarza dawnego kadru.

Klucze i opcjonalna historia są szyfrowane DPAPI dla konta Windows; historia jest domyślnie wyłączona po zamknięciu procesu. Plik: `%LOCALAPPDATA%\OKStudy\desktop\settings.dat`. Konta ChatGPT korzystają z dotychczasowego osobnego magazynu companion. Zamknięcie okna chowa aplikację do ikony przy zegarze. **Zakończ** z menu tej ikony kończy proces i skróty. Aplikacja nie ustawia automatycznego startu systemowego.

W razie konfliktu skrótu użyj menu przy zegarze. Rejestracja skrótów i nakładka zależą od interaktywnej sesji Windows; skróty nie działają po zakończeniu programu.

Odinstalowanie: **Ustawienia Windows → Aplikacje → OKStudy Windows → Odinstaluj** albo `Uninstall.exe` z folderu zainstalowanego programu. Deinstalator zamyka tę instalację, usuwa jej pliki i skrót. Domyślnie zachowuje ustawienia i historię; można je usunąć osobnym wyborem. Współdzielony magazyn ChatGPT rozszerzenia pozostaje dostępny. Portable usuwa się przez usunięcie rozpakowanego folderu; jego Uninstall.exe obsługuje instalację użytkownika, nie dowolny katalog. Aktualizacja chroni również nieznane pliki pozostawione w starym folderze programu, zamiast usuwać je wraz z aplikacją.

Źródła natywne: `desktop/windows/`, UI: `desktop/ui/`, projekt i ilustracje: `desktop/assets/`. Warstwa dostawców: `desktop/bridge.js`, współdzielone `src/providers.js`, `src/model-catalog.js`, `companion/auth.js` i magazyn DPAPI. Budowanie: `npm run build:desktop`. Kontrole: `npm test`, `npm run test:desktop`, `node tests/desktop-ui.mjs`. Test przechwytywania czyta tylko własne syntetyczne okno; testy nie korzystają z kont użytkownika ani płatnego API. Scenariusze rzeczywistego użycia: [docs/WINDOWS-TESTS.md](../docs/WINDOWS-TESTS.md).
