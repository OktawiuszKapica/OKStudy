<p align="center"><img src="assets/brand/mark.svg" alt="OKStudy" width="112"></p>

# OKStudy 2

**Zaznacz zadanie. Zrozum rozwiązanie.**

Rozszerzenie Chrome do nauki z Gemini, Claude, OpenAI lub Grok. Własna identyfikacja, grafiki, motywy grafitowy i jasny oraz panel do rozmowy obok strony. Autorem projektu jest **Oktawiusz Kapica** — OK to jego inicjały.

## Co potrafi

- Wybór fragmentu ekranu z podglądem i potwierdzeniem, analiza widocznego ekranu lub zaznaczonego tekstu.
- **Wyjaśnij** — rozwiązanie krok po kroku; **Podpowiedz** — kolejne wskazówki na żądanie; **Express** — krótka odpowiedź na stronie.
- Panel boczny: odpowiedź na żywo, Markdown, wzory matematyczne, źródła, dopytywanie, kopiowanie i eksport notatki `.md`.
- Historia do 40 zadań, wyszukiwanie również po treści odpowiedzi, usuwanie pojedynczych zadań lub całej historii.
- Głos: sam tekst, tekst i odczyt lub sam odczyt. Express ma regulowaną pozycję, wielkość tekstu, widoczność i czas.
- Szybka zmiana dostawcy i modelu bezpośrednio pod ikoną rozszerzenia.
- Klucze API czterech dostawców albo dostępny plan ChatGPT przez opcjonalny moduł na Windows.

## Instalacja i aktualizacja

1. Rozpakuj paczkę `OKStudy-2.0.0.zip`. Folder **OKStudy** zawiera `manifest.json`.
2. Otwórz `chrome://extensions`, włącz **Tryb dewelopera** i wybierz **Załaduj rozpakowane**.
3. Wskaż folder OKStudy i przypnij ikonę do paska przeglądarki.
4. W ustawieniach wybierz dostawcę i sposób połączenia, a następnie **Zapisz ustawienia**.

Przy aktualizacji istniejącej instalacji zachowaj jej folder i przeładuj rozszerzenie po zastąpieniu plików. Nowa ścieżka może oznaczać nowy identyfikator rozszerzenia i oddzielne dane. Ustawienia z wersji 1.x, klucze i wcześniej wybrane modele migrują automatycznie. Stary model pozostaje dostępny jako własny identyfikator; jeśli dostawca go wycofał, wybierz nowy w ustawieniach.

Wymagany jest Chrome 116+ lub przeglądarka Chromium z obsługą panelu bocznego. Strony ustawień przeglądarki i sklepu rozszerzeń są ograniczone przez przeglądarkę.

## Połączenie przez API

Wybierz dostawcę, wklej klucz, wybierz model i zapisz. Przycisk **Sprawdź połączenie** wysyła krótkie zapytanie do wybranego modelu. Limity i opłaty wynikają z konta dostawcy. OKStudy nie zakłada stałej „darmowej liczby zapytań”.

Klucze: [Gemini](https://aistudio.google.com/apikey), [Claude](https://console.anthropic.com/settings/keys), [OpenAI](https://platform.openai.com/api-keys), [Grok](https://console.x.ai).

Wyszukiwanie używa narzędzia dostawcy. Brak dostępu do wyszukiwania jest pokazywany jako błąd; aplikacja nie oznacza odpowiedzi bez wyszukiwania jako sprawdzonej w sieci. Lista modeli ma opcję podania własnego identyfikatora. Model musi obsługiwać obrazy, aby analizować zrzuty.

## Połączenie z planem ChatGPT — Windows

Ta opcja korzysta z oficjalnego [Sign in with ChatGPT dla aplikacji lokalnych](https://developers.openai.com/siwc/token-sharing-open-source). Dostępność modeli, uprawnienia oraz limity wynikają z konta. OKStudy pobiera listę modeli po zalogowaniu. Użycie planu jest oddzielone od klucza API; osiągnięcie limitu nie uruchamia płatnego API w tle.

Logowanie wymaga lokalnego modułu **companion** i Node.js 22+. Rozszerzenie komunikuje się z nim przez Native Messaging. Moduł otwiera logowanie na stronie OpenAI, odbiera potwierdzenie przez lokalny adres `127.0.0.1` i wysyła obsługiwane zapytania bezpośrednio do OpenAI.

1. W ustawieniach wybierz **OpenAI → Konto ChatGPT**.
2. Rozwiń instrukcję pierwszego połączenia i skopiuj polecenie zawierające identyfikator Twojego rozszerzenia.
3. Otwórz PowerShell w folderze `companion` z paczki i wykonaj skopiowane polecenie. Instalator działa dla bieżącego użytkownika, bez administratora, i rejestruje moduł dla Chrome, Edge oraz Brave.
4. Kliknij **Continue with ChatGPT**, zaakceptuj komunikację z modułem i dokończ logowanie na stronie OpenAI.
5. Wybierz udostępniony model i zapisz ustawienia.

Instalator kopiuje moduł do `%LOCALAPPDATA%\OKStudy\native-host`. Powtórz instalację po zmianie folderu/identyfikatora rozszerzenia albo aktualizacji modułu. Kopie rozszerzenia z innym ID wymagają osobnej rejestracji dozwolonego ID.

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

Skróty mogą kolidować z innymi rozszerzeniami. Ich faktyczne przypisania są widoczne w ustawieniach OKStudy; można je zmienić w `chrome://extensions/shortcuts`. Dawny „zapasowy skrót analizy” uruchamia teraz zaznaczenie fragmentu.

## Dane i prywatność

- Treść zadania, obraz oraz kontekst rozmowy trafiają do wybranego dostawcy. Obowiązują jego zasady przetwarzania danych.
- Klucze API pozostają w lokalnym magazynie rozszerzenia, poza synchronizacją Chrome. Skrypt działający na stronie nie ma dostępu do magazynu kluczy.
- Moduł ChatGPT przechowuje własne poświadczenia w `%LOCALAPPDATA%\OKStudy\chatgpt.credentials`, zabezpieczone przez Windows DPAPI dla bieżącego użytkownika. Nie odczytuje sesji innych aplikacji. Odnawianie tokenów jest blokowane pomiędzy procesami, aby uniknąć równoczesnej rotacji.
- Historia domyślnie żyje tylko w sesji rozszerzenia. Trwałe zapisywanie na tym urządzeniu można włączyć w ustawieniach.
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
npm run package
```

Źródła: `src/`. Pliki `js/` są generowane przez esbuild. Interfejs używa modułowego JavaScriptu, lokalnego Manrope, DOMPurify, Marked i KaTeX. Moduł w `companion/` korzysta z Node.js oraz JOSE. Gotowe pliki rozszerzenia są dołączone — użytkownik paczki nie musi instalować npm.

Testy korzystają z syntetycznych danych i kontrolowanych odpowiedzi dostawców. Instrukcje oraz zakres prób przed publicznym wydaniem: [docs/TESTING.md](docs/TESTING.md). Kierunek wizualny i briefy grafik: [docs/DESIGN.md](docs/DESIGN.md). Poprzednie zmiany: [docs/CHANGELOG.md](docs/CHANGELOG.md). Licencje bibliotek: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

Dokumentacja integracji ChatGPT: [logowanie](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [konta i sesje](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [modele i zapytania](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference). Implementację przygotowano według dokumentacji dostępnej 6 października 2026.

## Autor

**Oktawiusz Kapica** · [Portfolio](https://oktawiuszkapica.pl) · [GitHub](https://github.com/OktawiuszKapica) · [Kontakt](mailto:hello@oktawiuszkapica.pl)

Make studying OK again.
