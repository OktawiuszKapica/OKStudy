<p align="center"><img src="assets/brand/mark.svg" alt="OKStudy" width="112"></p>

# OKStudy 2

**Zaznacz zadanie. Zrozum rozwiązanie.**

Rozszerzenie Chrome do nauki z Gemini, Claude, OpenAI lub Grok. Własna identyfikacja, grafiki, motywy grafitowy i jasny oraz panel do rozmowy obok strony. Autorem projektu jest **Oktawiusz Kapica** — OK to jego inicjały.

## Co potrafi

- Wybór fragmentu ekranu z podglądem i potwierdzeniem, analiza widocznego ekranu lub zaznaczonego tekstu.
- **Wyjaśnij** — rozwiązanie krok po kroku; **Podpowiedz** — kolejne wskazówki na żądanie; **Express** — krótka odpowiedź na stronie, z opcją samego wyniku bez wyjaśnienia.
- Panel boczny: odpowiedź na żywo, Markdown, wzory matematyczne, źródła, dopytywanie, kopiowanie i eksport notatki `.md`.
- Historia do 40 zadań, wyszukiwanie również po treści odpowiedzi, usuwanie pojedynczych zadań lub całej historii.
- Głos: sam tekst, tekst i odczyt lub sam odczyt. Wybór głosu systemowego albo opcjonalnego głosu OpenAI przez osobno płatne API, regulacja tempa i próbka.
- Express: sam tekst, etykieta lub karta; opcjonalny automatyczny kontrast, widoczność od 5%, szerokość i czas. Alt + przeciągnięcie zapamiętuje miejsce dla danej witryny. Alt + kliknięcie otwiera wyjaśnienie w panelu, bez dodatkowego napisu przy odpowiedzi.
- Komunikat analizy: pełny, małe animowane kropki albo wyłączony.
- Profile Nauka, Dyskretna odpowiedź, Słuchanie oraz do 8 własnych profili. Szybkie ustawienia pod ikoną rozszerzenia.
- Lista modeli pobierana z konta dostawcy, z ręcznym odświeżaniem i zachowaniem wcześniej wybranego modelu.
- Klucze API czterech dostawców albo dostępny plan ChatGPT przez opcjonalny moduł na Windows.

## Instalacja i aktualizacja

1. Rozpakuj paczkę `OKStudy-2.1.0.zip`. Folder **OKStudy** zawiera `manifest.json`.
2. Otwórz `chrome://extensions`, włącz **Tryb dewelopera** i wybierz **Załaduj rozpakowane**.
3. Wskaż folder OKStudy i przypnij ikonę do paska przeglądarki.
4. W ustawieniach wybierz dostawcę i sposób połączenia, a następnie **Zapisz ustawienia**.

Przy aktualizacji istniejącej instalacji zachowaj jej folder i przeładuj rozszerzenie po zastąpieniu plików. Nowa ścieżka może oznaczać nowy identyfikator rozszerzenia i oddzielne dane. Ustawienia z wersji 1.x, klucze i wcześniej wybrane modele migrują automatycznie. Stary model pozostaje dostępny jako własny identyfikator; jeśli dostawca go wycofał, wybierz nowy w ustawieniach.

Po aktualizacji odśwież również strony z zadaniami, aby uruchomiły nowy skrypt odpowiedzi. Jeżeli korzystasz z planu ChatGPT, uruchom `companion/OKStudy-Setup.exe` z nowej paczki. Aktualizacja modułu zachowuje zapisane połączenie z kontem i wcześniej dodane identyfikatory rozszerzenia.

Wymagany jest Chrome 116+ lub przeglądarka Chromium z obsługą panelu bocznego. Strony ustawień przeglądarki i sklepu rozszerzeń są ograniczone przez przeglądarkę.

## Połączenie przez API

Wybierz dostawcę, wklej klucz, wybierz model i zapisz. Przycisk **Sprawdź połączenie** wysyła krótkie zapytanie do wybranego modelu. Limity i opłaty wynikają z konta dostawcy. OKStudy nie zakłada stałej „darmowej liczby zapytań”.

Klucze: [Gemini](https://aistudio.google.com/apikey), [Claude](https://console.anthropic.com/settings/keys), [OpenAI](https://platform.openai.com/api-keys), [Grok](https://console.x.ai).

Wyszukiwanie używa narzędzia dostawcy. Brak dostępu do wyszukiwania jest pokazywany jako błąd; aplikacja nie oznacza odpowiedzi bez wyszukiwania jako sprawdzonej w sieci. Lista modeli ma opcję podania własnego identyfikatora. Model musi obsługiwać obrazy, aby analizować zrzuty.

OKStudy pobiera katalog modeli Gemini, Claude, OpenAI i Grok przy otwarciu wyboru lub ustawień; lista API jest odświeżana, gdy ma więcej niż 6 godzin. **Odśwież modele** pobiera ją od razu. Lista jest oddzielona dla używanego klucza; katalog ChatGPT pochodzi z aktywnego konta. W razie awarii dostępna jest ostatnia lista z bieżącej sesji lub lista startowa.

Nowa nazwa modelu pojawia się z katalogu dostawcy bez aktualizacji rozszerzenia, jeżeli model korzysta z obsługiwanego sposobu wysyłania zapytań. Dostawcy nie zawsze podają obsługę obrazów w katalogu. Nowy protokół, wymagane parametry lub uprawnienia mogą nadal wymagać aktualizacji OKStudy. Wycofany model pozostaje oznaczony jako poprzedni/własny wybór; aplikacja prosi o zmianę i nie przełącza samodzielnie na inny model lub płatne API.

## Połączenie z planem ChatGPT — Windows

Ta opcja korzysta z oficjalnego [Sign in with ChatGPT dla aplikacji lokalnych](https://developers.openai.com/siwc/token-sharing-open-source). Dostępność modeli, uprawnienia oraz limity wynikają z konta. OKStudy pobiera listę modeli po zalogowaniu. Użycie planu jest oddzielone od klucza API; osiągnięcie limitu nie uruchamia płatnego API w tle.

Logowanie wymaga lokalnego modułu **companion**. Instalator Windows x64 zawiera własne środowisko Node.js — nie trzeba instalować go osobno. Rozszerzenie komunikuje się z modułem przez Native Messaging. Moduł otwiera logowanie na stronie OpenAI, odbiera potwierdzenie przez lokalny adres `127.0.0.1` i wysyła obsługiwane zapytania bezpośrednio do OpenAI.

1. W ustawieniach wybierz **OpenAI → Konto ChatGPT**.
2. Rozwiń instrukcję pierwszego połączenia i skopiuj identyfikator rozszerzenia.
3. Uruchom `companion/OKStudy-Setup.exe`, wklej identyfikator i kliknij **Zainstaluj połączenie**. Instalator działa dla bieżącego użytkownika, bez administratora, i rejestruje moduł dla Chrome, Edge oraz Brave.
4. Kliknij **Continue with ChatGPT** i dokończ logowanie na stronie OpenAI.
5. Wybierz udostępniony model i zapisz ustawienia.

Instalator kopiuje moduł do `%LOCALAPPDATA%\OKStudy\native-host`. Powtórz instalację po zmianie folderu/identyfikatora rozszerzenia albo aktualizacji modułu. Kopie rozszerzenia z innym ID wymagają osobnej rejestracji dozwolonego ID.

Instalator jest lokalnym wydaniem bez podpisu wydawcy; Windows może wyświetlić informację o nierozpoznanym wydawcy. W paczce pozostaje zaawansowana instalacja `companion/install.ps1`, wymagająca własnego Node.js 22+. Instalator EXE obsługuje także `--install IDENTYFIKATOR` do instalacji bez okna.

Od wersji 2.0.1 uprawnienie do komunikacji z modułem jest deklarowane przy instalacji rozszerzenia, żeby Chrome udostępniał je od uruchomienia. Sam moduł nadal instalujesz tylko wtedy, gdy chcesz korzystać z planu ChatGPT. Przy aktualizacji przeładuj rozszerzenie w `chrome://extensions` i ponownie otwórz jego ustawienia. Jeśli Chrome wyświetli prośbę o zaakceptowanie uprawnienia, potwierdź ją, aby włączyć połączenie.

Komunikat o braku funkcji połączenia oznacza konieczność przeładowania rozszerzenia; komunikat „Nie znaleziono modułu ChatGPT” oznacza brak instalacji modułu. Po przeniesieniu wtyczki do innego folderu użyj polecenia instalacji z jej aktualnych ustawień.

Możesz dodawać konta i przełączać je w ustawieniach. Każda rejestracja ma własny identyfikator. Wylogowanie usuwa lokalne tokeny, zachowuje rejestrację do ponownego logowania i próbuje zakończyć odnawialną sesję w OpenAI. Jeśli tego ostatniego nie uda się potwierdzić, OKStudy pokazuje komunikat. Dostępem i limitami zarządzasz w [ustawieniach użycia ChatGPT](https://chatgpt.com/settings/usage).

## Obsługa

Kliknij ikonę OKStudy i wybierz **Zaznacz zadanie**, **Cały ekran** albo **Zaznaczony tekst**. Zaznaczony tekst można też wysłać z menu pod prawym przyciskiem myszy.

Podczas wyboru fragmentu przeciągnij ramkę i kliknij **Analizuj fragment**. Obsługa klawiaturą: strzałki przesuwają obszar, Shift + strzałki zmieniają rozmiar, Enter zatwierdza, Escape anuluje. Przed zatwierdzeniem obraz nie trafia do AI. Opcja **Cały ekran** wysyła widoczną część strony bez wyboru kadru.

| Skrót | Działanie |
|---|---|
| Alt + O | Widoczny ekran, bez wyszukiwania |
| Alt + I | Widoczny ekran, z wyszukiwaniem |
| Alt + P | Kolejne odpowiedzi z historii; przytrzymanie kopiuje |
| Alt + K | Przerwanie i usunięcie bieżącego komunikatu |
| Do przypisania | Przełączenie modelu |
| Do przypisania | Zaznaczenie fragmentu ekranu |
| Do przypisania | Wyjaśnienie ostatniej odpowiedzi w panelu |
| Alt + kliknięcie odpowiedzi | Wyjaśnienie w panelu |
| Alt + przeciągnięcie odpowiedzi | Przesunięcie i zapis położenia dla witryny |

Skróty mogą kolidować z innymi rozszerzeniami. Ich faktyczne przypisania są widoczne w ustawieniach OKStudy; można je zmienić w `chrome://extensions/shortcuts`. Dawny „zapasowy skrót analizy” uruchamia teraz zaznaczenie fragmentu.

## Odpowiedzi, komunikaty i głos

W **Ustawienia → Odpowiedzi i wygląd**:

- **Express → Tylko odpowiedź, bez wyjaśnień** zwraca samo hasło lub wynik (np. `Dynamika Techniczna`) albo samą literę odpowiedzi (np. `D`). Przy kilku pytaniach zachowuje ich oznaczenia. Wyłączenie opcji przywraca krótkie wyjaśnienie. Express usuwa znaczniki Markdown, zachowując zwykłe znaki matematyczne.
- **Forma odpowiedzi i kontrast** pozwalają wybrać sam tekst, etykietę lub kartę. Automatyczny kontrast uwzględnia kolor tła strony w miejscu odpowiedzi; obrazy i gradienty mogą wymagać ręcznego wyboru. Wariant dyskretny zachowuje jasny tekst i wybraną przezroczystość, także 5%. Bez Alt odpowiedź przepuszcza kliknięcia do strony.
- **Profile** zmieniają sposób odpowiedzi i prezentację, zachowując dostawcę, model, klucze, źródło głosu i limit odczytów. Profil wybrany w pełnych ustawieniach wymaga **Zapisz ustawienia**; w menu rozszerzenia działa od razu.
- **Komunikat podczas analizy** pozwala wybrać pełny komunikat z przyciskiem, małe animowane kropki lub brak komunikatu. Kliknięcie kropek przerywa analizę. W dwóch dyskretnych wariantach błąd pokazuje mały `!` przez 1,5 sekundy; szczegóły pozostają w panelu. Alt+K działa również przy wyłączonym komunikacie.
- **Głos i tempo** pozwala wybrać głos dostępny w systemie/przeglądarce albo głos OpenAI, tempo 0,70–1,40× i odsłuchać próbkę. Automatyczny odczyt wymaga wybrania wyżej **Tekst i głos** lub **Tylko głos**. Przycisk głośnika w panelu uruchamia i zatrzymuje odczyt na żądanie. Jeden odczyt obejmuje do 4000 znaków.

Głos OpenAI używa modelu `gpt-4o-mini-tts` i 13 dostępnych głosów, domyślnie Marin. Wymaga klucza API OpenAI, niezależnie od dostawcy odpowiedzi lub połączenia z planem ChatGPT. Możesz wpisać klucz w sekcji głosu; jest współdzielony z ustawieniami odpowiedzi OpenAI. **Generowanie nowych nagrań i próbek jest rozliczane przez API, poza abonamentem ChatGPT.** Tekst nowego odczytu trafia do OpenAI. Odtwarzany głos jest generowany przez AI. Błąd głosu pozostawia odpowiedź tekstową w historii; nie uruchamia innego płatnego połączenia.

Ponowny odczyt tego samego tekstu tym samym głosem i tempem korzysta z pamięci przez 30 minut, o ile nagranie nadal się w niej mieści (do 12 nagrań, łącznie 2 MB). Wtedy nie powstaje nowe zapytanie API. Limit dzienny liczy wysłane próby wygenerowania nagrania, również nieudane; `0` oznacza brak limitu. Licznik dotyczy tego urządzenia i lokalnej daty, a nie kwoty na fakturze. Limit nie blokuje odsłuchu z pamięci.

Dokumentacja: [generowanie mowy OpenAI](https://developers.openai.com/api/docs/guides/text-to-speech). Obecna dokumentacja [modeli i zapytań przez plan ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) nie udostępnia integracji tego odczytu przez abonament.

## Dane i prywatność

- Treść zadania, obraz oraz kontekst rozmowy trafiają do wybranego dostawcy. Obowiązują jego zasady przetwarzania danych.
- Po wybraniu głosu OpenAI tekst nowego odczytu trafia dodatkowo do OpenAI, także przy odpowiedzi z innego modelu. Nagrania są przechowywane w pamięci sesji rozszerzenia (do 2 MB), poza historią i plikami. Po 30 minutach tracą ważność do ponownego użycia; stare wpisy są usuwane przy kolejnym zapisie nagrania, po zamknięciu przeglądarki lub przyciskiem **Usuń zapamiętane nagrania**. Usunięcie całej historii także czyści tę pamięć.
- Klucze API pozostają w lokalnym magazynie rozszerzenia, poza synchronizacją Chrome. Skrypt działający na stronie nie ma dostępu do magazynu kluczy.
- Moduł ChatGPT przechowuje własne poświadczenia w `%LOCALAPPDATA%\OKStudy\chatgpt.credentials`, zabezpieczone przez Windows DPAPI dla bieżącego użytkownika. Nie odczytuje sesji innych aplikacji. Odnawianie tokenów jest blokowane pomiędzy procesami, aby uniknąć równoczesnej rotacji.
- Historia domyślnie żyje tylko w sesji rozszerzenia. Trwałe zapisywanie na tym urządzeniu można włączyć w ustawieniach.
- Własne profile i pozycje odpowiedzi pozostają lokalnie. Pozycja zawiera tylko adres witryny (protokół, domenę i port), bez ścieżki odwiedzanej strony; zapamiętywane jest maksymalnie 200 witryn.
- Zrzuty nie są dodawane do trwałej historii. Maksymalnie trzy ostatnie obrazy są trzymane w pamięci przez maksymalnie 30 minut, o ile service worker nie zostanie wcześniej zamknięty. Dalsza rozmowa po utracie obrazu opiera się na zapisanym tekście; ponowna analiza obrazu wymaga ponownego zaznaczenia.
- Rozszerzenie wstrzykuje skrypt na stronę dopiero po działaniu użytkownika, przez `activeTab`. Nie ma stałego dostępu do wszystkich odwiedzanych stron.
- Czcionki, biblioteki, grafiki i kod są lokalne. Nie ma analityki ani zdalnie ładowanego JavaScriptu.

## Rozwój projektu

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run test:presentation
npm run build:installer
npm run package
```

Źródła: `src/`. Pliki `js/` są generowane przez esbuild. Interfejs używa modułowego JavaScriptu, lokalnego Manrope, DOMPurify, Marked i KaTeX. Moduł w `companion/` korzysta z Node.js oraz JOSE. Gotowe pliki rozszerzenia są dołączone — użytkownik paczki nie musi instalować npm.

Testy korzystają z syntetycznych danych i kontrolowanych odpowiedzi dostawców. Instrukcje oraz zakres prób przed publicznym wydaniem: [docs/TESTING.md](docs/TESTING.md). Kierunek wizualny i briefy grafik: [docs/DESIGN.md](docs/DESIGN.md). Poprzednie zmiany: [docs/CHANGELOG.md](docs/CHANGELOG.md). Licencje bibliotek: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

Dokumentacja integracji ChatGPT: [logowanie](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [konta i sesje](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [modele i zapytania](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference). Implementację przygotowano według dokumentacji dostępnej 6 października 2026.

## Wersja mobilna

Paczka 2.1.0 zawiera rozszerzenie komputerowe i moduł Windows. Oddzielne **OKStudy Mobile 0.1.0** ma natywny projekt Androida z pływającym przyciskiem i analizą ekranu oraz źródła aplikacji iPhone/iPad ze zrzutami przez Udostępnij i Skróty. Instrukcja instalacji APK i budowania: [mobile/README.md](mobile/README.md). [Raport testów i ograniczenia](mobile/TESTING.md). Projekt Apple wymaga kompilacji i testów na Macu; logowanie abonamentem ChatGPT nie jest jeszcze częścią wersji mobilnej.

## Autor

**Oktawiusz Kapica** · [Portfolio](https://oktawiuszkapica.pl) · [GitHub](https://github.com/OktawiuszKapica) · [Kontakt](mailto:hello@oktawiuszkapica.pl)

Make studying OK again.
