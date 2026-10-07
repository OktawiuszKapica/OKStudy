# OKStudy Android 0.2.2 — sprawdzenie na telefonie

Zakończ aktywną sesję i zainstaluj `OKStudy-Mobile-0.2.2.apk` jako aktualizację 0.1.0/0.2.x. Zachowano identyfikator aplikacji i lokalny klucz podpisu, więc nie trzeba odinstalowywać poprzedniej wersji ani usuwać konta i ustawień. Dla 0.2.2 nie uruchamiano aplikacji ani testów; kontrole działania wykonuje użytkownik.

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
