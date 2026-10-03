# DESIGN – Welt „Granit, Efeu, Eiche – und Licht in der Nacht“

## Szene
Ein Friedhof am Abend: heller Granit, schwarzer polierter Stein, Efeu auf den Gräbern und Hunderte Grablichter in der Dunkelheit.
Hell im Alltag (Stein), schwarz dort, wo es ernst wird (Trauerfall, Kontakt). Das Licht verbindet beides.

## Farben (Skill „farbe-ohne-ki-look“)
Drei Dinge aus der Welt des Betriebs, aus denen die Farben abgeleitet sind: Grabsteine aus Granit und Basalt, Efeu und Buchsbaum auf den Gräbern, geräucherte Eiche aus der Werkstatt. Dazu die rote Hülle der Grablichter als einziger Akzent.

| Token | Wert | Herkunft | Rolle |
|---|---|---|---|
| `--granit-hell` | #DADBD8 | heller Grabstein-Granit | Grundfläche, mit feinem Korn (PNG-Kachel) |
| `--kalkstein` | #EBECE9 | hellere Stufe derselben Steinfamilie | Kopf, Hinweisleiste, untere Leiste |
| `--basalt` | #2E3030 | Basalt-Schrifttafel | Text, Buttons |
| `--schwarz` | #000000 | polierter schwarzer Granit | Trauerfall, Kontakt, Fuß, Lichtermeer |
| `--efeu` | #3D4A36 | Efeu und Buchsbaum | Vorsorge-Tafel, Fokusring |
| `--eiche` | #5E4630 | geräucherte Eiche | Tischlerei-Tafel |
| `--grablicht` | #9E2F25 | rote Hülle der Grablichter | Akzent, nur „Ein Licht entzünden“ |
| `--flamme` | #F1C26A | Kerzenflamme | nur in der Illustration (Lichter, Umriss) |

Bewusst nicht: Creme mit Terrakotta, fast-schwarz mit Neon-Akzent, dekorative Verläufe, Glow-Schatten, Schraffuren.
Die einzigen Verläufe sind Licht (Kerzen) und die Übergänge zwischen Nacht und Tag.

## Schrift
- Überschriften: Libre Caslon Display 400, groß und eng gesetzt, auch als gemeißelte Inschrift auf den Steinen
- Text und Bedienung: Golos Text 400/500/600, Basis 19–21 px
- Telefonnummer im Kontakt groß in Golos (eindeutige Ziffern)

## Form
- Rundbogen als Leitmotiv: Tor im Einstieg, Grabsteine, Fotofenster, Aufzählungszeichen, Favicon.
- Buttons in Pillenform mit rundem Symbol-Knopf (Phosphor Icons, regular).
- Tafeln mit 10 px Radius, gleich gebaut; das Material unterscheidet sie (Efeu, Eiche).
- Grabsteine als SVG-Formen mit eigener Oberfläche je Material (SVG-Filter): Kalkstein gewölkt, schwarzer Granit poliert mit Glanz, grauer Granit gesprenkelt, Sandstein geschichtet, Muschelkalk mit Poren. Licht von oben links, abgerundete Kanten, Kontaktschatten am Fuß.

## Übergänge
Zwischen Schwarz und Granit liegt eine 12–22 rem hohe Zone. Schwarz läuft dort in Transparenz aus (Smootherstep-Kurve statt linear). Darunter liegt die Granitfläche der Seite, deshalb gibt es weder Kante noch Farbsprung.
Am Morgen (nach dem Trauerfall) verlöschen dort kleine Lichter, am Abend (vor dem Kontakt) gehen sie an.

## Bewegung
- Highlight 1 „Lichtermeer“: Canvas-Szene im Bogen, goldener Umriss beim Laden, Lichter-Welle, Kamerafahrt beim Scrollen. Mit der Maus wird der Zeiger zur Laterne; ein Klick oder der Button entzündet ein eigenes Licht.
- Highlight 2 „Lichter am Weg“: Funke auf der goldenen Linie, Lichtring beim Entzünden.
- Ruhig: Erdlinie und aufsteigende Steine mit gemeißelter Inschrift, Bildfenster öffnen sich, Texte blenden ein.
- Easing nach Emil Kowalski (`cubic-bezier(0.23, 1, 0.32, 1)`), Grundtempo 1,6 s, Scrub-Nachlauf 1–1,5 s.
