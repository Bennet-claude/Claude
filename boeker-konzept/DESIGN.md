# DESIGN – Welt „Stein, Moos, Holz – und Licht in der Nacht“

## Szene
Ein Friedhof am Abend: Kalkstein und Grabsteine, Zypressen, Moos, und Hunderte Grablichter in der Dunkelheit.
Hell im Alltag (Stein), dunkel dort, wo es ernst wird (Trauerfall, Kontakt). Das Licht verbindet beides.

## Farben
| Token | Wert | Rolle |
|---|---|---|
| `--kalk` | #EDEDE7 | Grundfläche (Off-White, kühl) |
| `--granit` | #222523 | Text, Buttons |
| `--nacht` | #0D110F | Trauerfall, Kontakt, Lichtermeer |
| `--salbei-hell` / `--salbei-tief` | #D3D9CC / #42503C | Vorsorge-Tafel, Fokus |
| `--holz-hell` / `--holz-tief` | #EAE2D6 / #6A4D31 | nur Tischlerei |
| `--licht` | #E8C483 | Kerzenlicht: Umriss, Lichter am Weg, Symbol-Knöpfe |

## Schrift
- Überschriften: Libre Caslon Display 400, groß und eng gesetzt
- Text und Bedienung: Golos Text 400/500/600, Basis 19–21 px
- Telefonnummer im Kontakt groß in Golos (eindeutige Ziffern)

## Form
- Rundbogen als Leitmotiv: Tor im Einstieg, Grabstein-Reihe, Fotofenster, Aufzählungszeichen, Favicon.
- Buttons in Pillenform mit rundem Symbol-Knopf.
- Tafeln mit 10 px Radius, gleich gebaut; Material unterscheidet sie (Moos, Holz).

## Bewegung
- Highlight 1 „Lichtermeer“: Canvas-Szene im Bogen, goldener Umriss beim Laden, Lichter-Welle, Kamerafahrt beim Scrollen.
- Highlight 2 „Lichter am Weg“: Funke auf der goldenen Linie, Lichtring beim Entzünden.
- Ruhig: Steine steigen auf, Bildfenster öffnen sich, Texte blenden ein.
- Easing nach Emil Kowalski (`cubic-bezier(0.23, 1, 0.32, 1)`), Grundtempo 1,6 s, Scrub-Nachlauf 1–1,2 s.
