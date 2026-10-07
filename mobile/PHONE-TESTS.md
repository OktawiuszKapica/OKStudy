# OKStudy Android 0.3.0 — sprawdzenie na telefonie

Zakończ aktywną sesję i zainstaluj `OKStudy-Mobile-0.3.0.apk` jako aktualizację. Zachowano identyfikator i podpis — nie odinstalowuj poprzedniej wersji. Zgodnie z dyspozycją nie uruchamiano Androida, emulatora ani testów wykonujących kod aplikacji. Wykonano kompilację, Lint i kontrolę APK. Użytkownik potwierdził działanie analizy w 0.2.2; nowe funkcje sprawdza poniżej.

## Najpierw nowe funkcje 0.3.0

1. Na Start sprawdź nazwę połączenia/modelu, profile i ostatnią odpowiedź. Bardzo delikatny profil nadal powinien pozostawiać tylko wynik nad zadaniem.
2. Wygląd → Przytrzymanie OK → Małe menu. Uruchom sesję, przytrzymaj OK i sprawdź analizę, powtórkę, wyjaśnienie, zmianę profilu oraz automatyczne zniknięcie po 5 s. Menu nie może trafić na zrzut. Zmień orientację z otwartym menu — ma zniknąć.
3. Wygląd → Dodaj kafelek OKStudy. W szybkich ustawieniach rozpocznij sesję z zatwierdzeniem systemowym, potem ją zakończ. Sprawdź również tapnięcie na zablokowanym telefonie i odmowę dodania kafelka.
4. Po kilku analizach: Start → Historia. Szukaj po treści/modelu, przypnij wynik, Pokaż ponownie i usuń. Powtórka nie wysyła nowego zapytania. Dawna odpowiedź z historii nie może używać obecnego kadru do wyjaśnienia.
5. Bez trwałej historii zakończ proces aplikacji — tekst historii ma zniknąć. Włącz zapis w Wyglądzie, uzyskaj odpowiedź i zamknij proces: historia ma pozostać. Wyłącz zapis i ponownie zamknij proces: dyskowa historia nie ma wrócić.
6. Połączenia: pobierz modele, oznacz dwa gwiazdką i przełącz nimi na Start. Zmiana konta/klucza nie może pokazać ulubionych poprzedniego połączenia. Pierwsze pobranie nie oznacza wszystkich modeli jako Nowy. Po ręcznym odświeżeniu zapisany model nie może zmienić się sam.
7. Sprawdź mały i pusty/rozmyty kadr: popraw ramkę lub Wyślij mimo ostrzeżenia. W trybie zapisanego/całego kadru słaby obraz powinien otworzyć edytor. Po wyłączeniu kontroli kadru ostrzeżeń nie ma.
8. Po świeżej analizie: Sprawdź modelem, wybierz inny. To dodatkowe użycie planu/API. Obie odpowiedzi mają być widoczne w aplikacji, oryginalny tekst pozostaje zachowany, brak nowej nakładki nad zadaniem. Przerwij sprawdzanie i upewnij się, że nie pojawia się spóźniony wynik. Po 5 min lub zmianie konta potrzeba nowego kadru.

Dalsze scenariusze obejmują funkcje z wcześniejszych wydań.

## Najpierw po aktualizacji z 0.2.1

1. W **Połączeniach** pozostaw zapisane konto i dotknij **Pobierz modele konta**. Zamknij listę; raport zapamięta identyfikatory modeli otrzymanych od serwera oraz ich widoczność. Odświeżenie nie zmienia zapisanego modelu.
2. Uruchom sesję i przeanalizuj proste zadanie na zapisanym modelu. Poprawka zbiera fragmenty tekstu nawet wtedy, gdy końcowe zdarzenie nie powtarza odpowiedzi. Zapisz, czy pojawia się wynik, czy błąd.
3. Gdy nadal brakuje 6.1 Sol / 6 Sol / 6 Luna albo analiza nie działa, otwórz **Połączenia → Diagnostyka ChatGPT → Kopiuj raport** i przekaż tekst raportu. Zawiera osobno katalog oraz ostatnią analizę. Nie zawiera danych logowania, obrazu ani treści zadania i odpowiedzi. Nie zamykaj procesu aplikacji przed skopiowaniem — raport jest tylko w pamięci.
4. Przy błędzie można dodatkowo dotknąć komunikatu na dole aplikacji i użyć **Kopiuj**. Aktualizacja nie wymaga ponownego logowania; zrób to dopiero, gdy aplikacja zgłosi faktyczne wygaśnięcie sesji.

Ręczny identyfikator modelu pozostaje dostępny przez **Wpisz identyfikator → Zapisz połączenie**. Nie potwierdzono jeszcze, że wpisanie `gpt-6.1-sol` rozwiązuje zgłoszony problem, dlatego nie zastępuje to raportu katalogu.

## 1. Konto ChatGPT

1. Otwórz **Połączenia → Dostawca → ChatGPT — Twój plan → Continue with ChatGPT**.
2. W systemowej przeglądarce zaloguj własne konto, wybierz dostępny obszar roboczy i udziel zgody na korzystanie z planu. Po komunikacie OKStudy wróć do aplikacji. Sesja logowania ma limit około 2½ minuty; w razie przekroczenia rozpocznij ją ponownie.
3. Sprawdź adres konta i komunikat korzystania z planu. Dotknij **Pobierz modele konta**, wybierz model obsługujący obrazy i **Zapisz połączenie**.
4. Sprawdź również anulowanie logowania, ponowne logowanie na to samo konto, zmianę konta i wylogowanie. Każde konto zachowuje własny model.
5. Po dłuższej przerwie sprawdź analizę ponownie — aplikacja powinna odnowić sesję. Jeśli dostęp zostanie cofnięty w ChatGPT, powinna poprosić o ponowne logowanie. Brak zgody lub limit nie może przełączyć zadania na API.

## 2. Zadanie i kadr

1. Na Start wybierz **Uruchom pomoc na ekranie**, zatwierdź nakładkę i systemowe udostępnianie **całego ekranu**. Otwórz zwykłą aplikację z zadaniem.
2. Domyślnie stuknij dwa razy w przycisk OK. Powinien pojawić się bieżący zrzut i edytor kadru. Zaznacz jedno pytanie i dotknij **Analizuj zaznaczony fragment**. Wcześniej obraz nie powinien być wysłany do AI.
3. Sprawdź samo `D` dla ABCD i samo hasło dla pytania otwartego. Potwierdź, że kolejne zadanie używa nowego obrazu, a nakładka OK nie znajduje się w zrzucie.
4. Powtórz z **Zapamiętaj kadr dla tej orientacji**. Kolejny gest powinien użyć tego samego obszaru nowego obrazu. Po obrocie pierwsze zadanie wymaga osobnego kadru. Kadry są wspólne dla orientacji, nie przypisane do aplikacji.
5. Sprawdź **Cały obraz**, anulowanie kadrowania, wyczyszczenie zapamiętanych kadrów i obraz udostępniony z galerii. Galeria zawsze otrzymuje świeży wybór obszaru, gdy kadrowanie jest włączone.

## 3. Odpowiedź i obsługa

- Wygląd: profile Dyskretny, Czytelny, Nauka i Głos; ręczna widoczność 5–80%, wielkość, czas oraz przeciągnięcie D w podglądzie. Odpowiedź nad zadaniem powinna przepuszczać dotyk do aplikacji pod spodem.
- Ustaw „Przytrzymanie przycisku OK → Wyjaśnij ostatnią odpowiedź”. Po krótkim wyniku przytrzymaj OK. Wyjaśnienie powinno pojawić się w aplikacji na podstawie ostatniego kadru, bez nowego zrzutu. To dodatkowe wywołanie AI.
- Po wyczyszczeniu, zakończeniu sesji albo upływie 5 minut ostatni kadr powinien być niedostępny do wyjaśnienia.
- Sprawdź pojedyncze/podwójne stuknięcie, przesuwanie przycisku, przerwanie trwającej analizy, blokadę telefonu i zakończenie sesji z powiadomienia.
- Przy wyłączonym komunikacie awaria pokazuje na chwilę `!`; szczegóły są w aplikacji. Przerwane zapytanie nie powinno później wyświetlić wyniku.
- Sprawdź odczyt systemowy. OpenAI Marin wymaga osobnego klucza API i opłat; abonament ChatGPT nie zastępuje tego klucza.
- Porównaj baterię i czas odpowiedzi przy kilku zadaniach, a potem po kilku minutach bez używania przycisku. Odłączanie powierzchni między gestami zostało wdrożone, ale nie zmierzono efektu na urządzeniu.

## 4. Aktualizacje

Przycisk w Połączeniach sprawdza publiczne wydania repozytorium GitHub i pokazuje nowszy pasujący APK. W tym zadaniu nie opublikowano wydania. Do czasu publikacji nowej paczki brak aktualizacji jest prawidłowym wynikiem. Pobranie uruchamia przeglądarkę; instalację potwierdzasz w Androidzie.

Przy zgłoszeniu problemu zapisz model telefonu, wersję Androida, wersję OKStudy, wybrany tryb i kroki prowadzące do błędu. Nie przesyłaj kluczy, tokenów ani adresu URL z przeglądarki podczas logowania.
