# OKStudy Windows — sprawdzenie użytkownika

1. Zainstaluj Windows 0.2.0 przez nowy instalator, bez usuwania poprzednich ustawień. Otwórz przez menu Start. Sprawdź wygląd Studio, zamknięcie okna, powrót z ikony przy zegarze, ponowne uruchomienie istniejącego procesu i Zakończ.
2. W Połączeniach zaloguj ChatGPT. Lista powinna pobrać się od razu, bez zamykania programu. Zapisz model, odśwież, sprawdź także anulowanie logowania i przełączenie konta. Jeśli lista zawiedzie, otwórz Szczegóły połączenia i przekaż komunikat. Osobno można sprawdzić wybrane API; to płatne użycie API, bez automatycznego przełączania po błędzie planu.
3. Otwórz PDF lub Word z prostym zadaniem. Ctrl+Alt+O, przeciągnij ramkę, Enter. Przed potwierdzeniem nie powinno być żądania AI. Esc anuluje podgląd.
4. Sprawdź samą odpowiedź D i hasło w profilu Czytelny/Dyskretny; kliknięcia powinny przechodzić do otwartego programu. Ctrl+Alt+R nie wysyła zapytania. Ctrl+Alt+K zatrzymuje trwającą analizę lub głos.
5. Sprawdź mały/pusty fragment: ostrzeżenie, poprawienie ramki oraz Wyślij mimo ostrzeżenia. Wyłącz tę opcję i sprawdź zatwierdzanie bez ostrzeżenia.
6. W aplikacji użyj Wyjaśnij, następnie Sprawdź innym modelem. Obie odpowiedzi muszą być widoczne, z nazwami modeli; pierwsza pozostaje zachowana. Sprawdzanie to dodatkowe użycie. Po 5 minutach lub zmianie połączenia potrzebny jest świeży kadr.
7. Oznacz dwa modele gwiazdką. Sprawdź przyciski na Start, ręczne odświeżenie i wycofany identyfikator. Nie oczekuj dostępu do modeli, których serwer nie udostępnia.
8. Sprawdź wyszukiwanie i przypinanie historii. Bez trwałego zapisu ponowne uruchomienie usuwa historię; po włączeniu zapisu pozostaje. Wyłączenie zapisu usuwa jej kopię z szyfrowanego pliku.
9. Sprawdź drugi monitor, ujemne położenie monitora, skalowanie 100/150/200% i przeniesienie aplikacji między ekranami. W chronionych oknach Windows może uniemożliwić zrzut.
10. Sprawdź kliknięcie/przeciągnięcie/menu przycisku OK, Dodaj obraz z pliku oraz motywy Grafit/Papier/system. Suwaki powinny zmieniać podgląd i zachować wartości po zapisaniu.
11. Odinstaluj przez listę aplikacji Windows. Domyślnie zachowaj dane, ponownie zainstaluj i sprawdź ustawienia. Opcjonalne usunięcie danych dotyczy tylko własnych ustawień/historii Windows; konto rozszerzenia nie powinno zostać wylogowane.

Automatyczne kontrole 0.2.0 korzystają z wygenerowanych obrazów, sztucznych odpowiedzi sieciowych i przechwycenia własnego okna testowego przez rzeczywiste API Windows. Sprawdzają rejestrację skrótu i nakładkę przepuszczającą kliknięcia, instalację/aktualizację/usuwanie w izolowanym katalogu oraz rzeczywisty frontend Studio. Nie potwierdzają działania prawdziwego konta, wszystkich aplikacji ani różnych konfiguracji monitorów. Podglądy natywnego WebView2 obejmują program, instalator i deinstalator; brak żywego logowania i płatnych wywołań.
