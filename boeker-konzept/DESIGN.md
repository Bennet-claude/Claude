# DESIGN – Welt „Stein, Moos, Holz, Licht“

## Szene
Ein stiller Friedhof am frühen Abend in Ricklingen: Kalkstein, Moos auf Granit, ein Rundbogentor, Grablichter. Daneben eine Werkstatt mit Holz.
Hell im Alltag, dunkel dort, wo es ernst wird (Trauerfall, Kontakt).

## Farben
| Token | Wert | Rolle |
|---|---|---|
| `--kalk` | #EDEDE7 | Grundfläche (Off-White, kühl, nicht cremig) |
| `--granit` | #252826 | Text, dunkle Abschnitte |
| `--salbei` / `--salbei-tief` | #7E8C77 / #44513E | Moos: Platzhalter, Hover, Fokus |
| `--holz` / `--holz-tief` / `--holz-hell` | #9A7A58 / #6A4D31 / #E8E1D6 | nur Tischlerei |
| `--licht` | #E8C483 | nur die Lichter im Trauerfall-Weg |

## Schrift
- Überschriften: Marcellus (Inschriften-Antiqua, eine Stärke, nie fett gefälscht)
- Text und Bedienung: Atkinson Hyperlegible Next 400/700, Basis 19–21 px
- Telefonnummern groß in Atkinson 700 (eindeutige Ziffern)

## Form
- Rundbogen als Leitmotiv: Tor im Einstieg, Bildfenster, Aufzählungszeichen, Favicon.
- Tischlerei: gerade Kanten, Holzflächen.
- Feine 1-px-Linien als Gliederung, keine Karten, keine Icon-Raster.
- Dicht statt luftig: Start plus drei Kapitel von je etwa einer Bildschirmhöhe.
- Kapitel 2 zeigt drei Materialien nebeneinander: Stein (Bestattungsarten als Liste), Moos (Vorsorge im Bogenfeld), Holz (Tischlerei als Tafel).
- Kapitel 3 teilt den Bildschirm: links hell (Über uns), rechts dunkel (Kontakt).

## Bewegung
- Highlight 1 „Das Tor öffnet sich“ (Pin + Scrub, `clip-path` vom Bogen zum Vollbild, Dämmerung).
- Highlight 2 „Lichter am Weg“ (Scrub-Linie, ab 72em waagerecht; Lichter gehen an, sobald die Glut sie erreicht; leises Flackern nur im Sichtbereich).
- Ruhig: Linien (scaleX), Bogenfenster (clip-path von unten), Einblenden (opacity + 24 px).
- Grundtempo 1,6 s, Scrub-Nachlauf 1,2–1,4 s. Ohne JS und bei reduzierter Bewegung ist alles sofort sichtbar.
