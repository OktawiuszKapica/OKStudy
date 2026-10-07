# OKStudy Windows 0.1.0

Uruchom `releases/OKStudy-Windows-0.1.0-Setup.exe`. Instalator dodaje aplikację do menu Start dla bieżącego użytkownika. Alternatywnie rozpakuj `OKStudy-Windows-0.1.0-portable.zip` i uruchom `OKStudy.exe`; pozostałe pliki muszą pozostać obok programu. Windows 10/11 x64, .NET Framework 4.8. Instalator zawiera własny Node. Pliki EXE nie mają podpisu wydawcy.

W **Połączeniach** wybierz ChatGPT lub jedno z czterech API. ChatGPT korzysta z oficjalnego logowania w przeglądarce i współdzieli lokalny magazyn kont z companionem rozszerzenia. Jeśli konto było połączone wcześniej, wybierz je. API wymaga osobnego klucza i jest rozliczane osobno. Wklej klucz, pobierz katalog, wybierz model i zapisz połączenie. Model spoza listy możesz wpisać ręcznie; dopiero zapytanie potwierdzi dostęp.

| Działanie | Skrót |
|---|---|
| Zaznacz zadanie w dowolnym widocznym programie | Ctrl + Alt + O |
| Potwierdź fragment w podglądzie | Enter |
| Anuluj zaznaczanie | Esc |
| Powtórz ostatnią odpowiedź bez nowego zapytania | Ctrl + Alt + R |
| Przerwij analizę/odczyt | Ctrl + Alt + K |

Przeciągnij ramkę i potwierdź. Do dostawcy trafia tylko wybrany fragment; cały obraz podglądu pozostaje lokalny. Kadry nie są zapisywane na dysku. Zrzut powstaje na polecenie użytkownika; aplikacja nie monitoruje ekranu stale. Chronione okna, treści DRM i ekran zabezpieczeń Windows mogą być puste/niedostępne. Układy powyżej 60 mln pikseli wymagają zmniejszenia rozdzielczości lub liczby ekranów.

**Wygląd** pozwala ustawić sam tekst/kartę, widoczność 5–100%, wielkość, czas, pozycję oraz komunikat analizy. Nad programem pozostaje tylko odpowiedź, przepuszczająca kliknięcia. Profile zmieniają prezentację; Głos systemu używa bezpłatnego głosu Windows. Rozszerzenie i Android zachowują swoje opcje głosu OpenAI.

**Sprawdź innym modelem** wysyła ten sam kadr jako nowe, niezależne zadanie. To dodatkowe użycie planu albo API. Wyniki są pokazane razem w aplikacji; oryginalny wynik nie jest nadpisywany. Do wyjaśnienia/sprawdzenia ostatni kadr jest dostępny w pamięci przez 5 minut. Wyczyszczenie, zmiana połączenia i zamknięcie programu zwalniają go wcześniej. Powtórka z historii zawiera tylko tekst i nie odtwarza dawnego kadru.

Klucze i opcjonalna historia są szyfrowane DPAPI dla konta Windows; historia jest domyślnie wyłączona po zamknięciu procesu. Plik: `%LOCALAPPDATA%\OKStudy\desktop\settings.dat`. Konta ChatGPT korzystają z dotychczasowego osobnego magazynu companion. Zamknięcie okna chowa aplikację do ikony przy zegarze. **Zakończ** z menu tej ikony kończy proces i skróty. Aplikacja nie ustawia automatycznego startu systemowego.

W razie konfliktu skrótu użyj menu przy zegarze. Rejestracja skrótów i nakładka zależą od interaktywnej sesji Windows; skróty nie działają po zakończeniu programu.

Źródła natywne: `desktop/windows/`. Warstwa dostawców: `desktop/bridge.js`, współdzielone `src/providers.js`, `src/model-catalog.js`, `companion/auth.js` i magazyn DPAPI. Budowanie: `npm run build:desktop`. Kontrole na sztucznych danych: `npm run test:desktop`; nie czytają ekranu ani prawdziwego konta. Scenariusze ręczne: [docs/WINDOWS-TESTS.md](../docs/WINDOWS-TESTS.md).
