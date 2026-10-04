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
| `--schwarz` | #000000 | polierter schwarzer Granit | Trauerfall, Kontakt, Fuß |
| `--efeu` | #3D4A36 | Efeu und Buchsbaum | Vorsorge-Tafel, Fokusring |
| `--eiche` | #5E4630 | geräucherte Eiche | Tischlerei-Tafel |
| `--grablicht` | #9E2F25 | rote Hülle der Grablichter | Akzent, nur im Grablicht an den Steinen |
| `--flamme` | #F1C26A | Kerzenflamme | nur in gezeichnetem Licht (Lichter am Weg, Grablichter) |

Bewusst nicht: Creme mit Terrakotta, fast-schwarz mit Neon-Akzent, dekorative Verläufe, Glow-Schatten, Schraffuren.
Die einzigen Verläufe sind Licht (Kerzen) und die Übergänge zwischen Nacht und Tag.

## Schrift
- Überschriften: Libre Caslon Display 400, groß und eng gesetzt, auch als gemeißelte Inschrift auf den Steinen
- Text und Bedienung: Golos Text 400/500/600, Basis 19–21 px
- Telefonnummer im Kontakt groß in Golos (eindeutige Ziffern)

## Form
- Rundbogen als Leitmotiv: Grabsteine, Fotofenster, Aufzählungszeichen, Favicon. Der Einstieg ist ein breites Bildband wie ein Blick durch ein Fenster.
- Buttons in Pillenform mit rundem Symbol-Knopf (Phosphor Icons, regular).
- Tafeln mit 10 px Radius, gleich gebaut; das Material unterscheidet sie (Efeu, Eiche).
- Grabsteine als SVG-Formen mit eigener Oberfläche je Material (SVG-Filter): Kalkstein gewölkt, schwarzer Granit poliert mit Glanz, grauer Granit gesprenkelt, Sandstein geschichtet, Muschelkalk mit Poren. Licht von oben links, abgerundete Kanten, Kontaktschatten am Fuß.

## Übergänge
Zwischen Schwarz und Granit liegt eine 12–22 rem hohe Zone. Schwarz läuft dort in Transparenz aus (Smootherstep-Kurve statt linear). Darunter liegt die Granitfläche der Seite, deshalb gibt es weder Kante noch Farbsprung.
Am Morgen (nach dem Trauerfall) verlöschen dort kleine Lichter, am Abend (vor dem Kontakt) gehen sie an.

## Bewegung
- Highlight 1 „Abendgang“: zehn Fotos eines Spaziergangs über den Friedhof im Abendlicht gehen ruhig ineinander über, jedes mit einem langsamen, flachen Bildzug (7 % näher, ein Stück zur Seite). Bildunterschrift darunter, Knopf zum Anhalten. Reines CSS, keine 3D-Szene.
- Highlight 2 „Lichter am Weg“: Funke auf der goldenen Linie, Lichtring beim Entzünden.
- Ruhig: Erdlinie und aufsteigende Steine mit gemeißelter Inschrift, Bildfenster öffnen sich, Texte blenden ein.
- Easing nach Emil Kowalski (`cubic-bezier(0.23, 1, 0.32, 1)`), Grundtempo 1,6 s, Scrub-Nachlauf 1–1,5 s.
