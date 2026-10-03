# Böker Bestattungen und Tischlerei – Konzeptentwurf

> **Unverbindlicher Konzeptentwurf von Studio Leine – nicht im Auftrag von Böker Bestattungen und Tischlerei erstellt. Alle Texte und Bilder sind Platzhalter.**
> Die Seite ist mit `noindex, nofollow` gekennzeichnet. Es wurden keine Logos, Fotos oder Texte der bestehenden Website übernommen; die Wortmarke ist reiner Text.

Ruhige Scroll-Landingpage für einen Bestatter mit Tischlerei in Hannover-Ricklingen.
Statisch: HTML, CSS, Vanilla-JS. Kein Framework, kein Build-Schritt, keine externen Ressourcen.

## Starten

```bash
cd boeker-konzept
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Struktur

```
boeker-konzept/
├── index.html              Landingpage (alle Abschnitte)
├── impressum.html          Platzhalterseite
├── datenschutz.html        Platzhalterseite
├── favicon.svg             Bogen-Symbol
├── assets/
│   ├── css/style.css       Tokens, Layout, Komponenten (mobile-first)
│   ├── js/lichtermeer.js   Der nächtliche Friedhof mit Grablichtern (Canvas 2D, ohne Bibliothek)
│   ├── js/main.js          Menü, Absicherung ohne GSAP, Lichtermeer anlegen und bedienen, Grablichter an den Steinen, Pfadlänge im Trauerfall-Weg
│   ├── js/motion.js        Alle Scroll-Animationen (GSAP + ScrollTrigger)
│   ├── vendor/             gsap.min.js, ScrollTrigger.min.js (3.15.0, lokal)
│   ├── img/granit.png      Granitkorn der Grundfläche (256 px Kachel, 16 KB)
│   └── fonts/              Libre Caslon Display, Golos Text (woff2, lokal, OFL)
├── PRODUCT.md              Produktwahrheit (Zielgruppen, Ton, Grenzen)
├── DESIGN.md               Gestaltungsentscheidungen
└── README.md
```

### Aufbau (jede Einheit ist ein `<section data-section="…">`)

| `data-section` | Inhalt |
|---|---|
| `start` | Einstieg mit Anrufen-Button. Rechts (mobil oben) ein Bogen mit dem Lichtermeer → Highlight 1 |
| `trauerfall` | Was ist im Trauerfall zu tun? 4 Schritte → Highlight 2 |
| `bestattungsarten` | Fünf Bestattungsarten als Reihe von Grabsteinen, die Inschrift ist in den Stein gemeißelt |
| `vorsorge`, `tischlerei` | Zwei gleich gebaute Tafeln nebeneinander: Efeu und Eiche |
| `ueber-uns` | Foto im Bogen, Text, vier Fakten |
| `kontakt` | Große Telefonnummer, zwei Buttons, ferner Lichterstreifen, drei Spalten: Adresse, Erreichbarkeit, Anfahrt |

Zwischen Trauerfall und Bestattungsarten sowie vor dem Kontakt liegt je ein weicher Übergang von Schwarz zu Granit.

Mobil (unter 1024 px) gibt es eine feste untere Leiste mit **Anrufen** (`tel:`) und **Anfahrt**.

## Animationen

| | Name | Was passiert |
|---|---|---|
| **Highlight 1** | Lichtermeer | Beim Laden zieht sich ein goldener Umriss um den Bogen. Darin erscheint ein Friedhof bei Nacht: Grabreihen mit Einfassungen, ein Kiesweg, Zypressen, Nebel. Die Grablichter gehen von vorn nach hinten an und flackern leise. Beim Scrollen öffnet sich der Bogen zum ganzen Bild, die Kamera gleitet über den Weg, dann erscheint „Bestattungen und Tischlerei unter einem Dach.“ |
| **Highlight 2** | Lichter am Weg | Ein Funke läuft die goldene Linie entlang (groß: waagerecht, Handy: senkrecht) und entzündet jeden Schritt mit einem kurzen Lichtring. Startet, sobald der Weg ins Bild kommt. Ist der Abschnitt ganz zu sehen, brennen alle vier Lichter. |
| ruhig 1 | Steine | Eine Erdlinie zieht sich von links nach rechts, die Steine steigen nacheinander aus ihr auf, dann wird die Inschrift von links nach rechts eingemeißelt. An den Scroll gekoppelt: fertig, wenn die Reihe ganz zu sehen ist, danach bleibt sie stehen. Handy: sanftes Einblenden. |
| ruhig 2 | Bildfenster | Bild-Platzhalter öffnen sich langsam von unten. |
| ruhig 3 | Einblenden | Textgruppen erscheinen sanft nacheinander. |

Dazu im Kontakt ein ferner Lichterstreifen als stilles Echo des Einstiegs, und in den Übergängen kleine Lichter: Am Morgen verlöschen sie, am Abend gehen sie an.

### Interaktion

| Wo | Was |
|---|---|
| Lichtermeer, Maus | Der Zeiger leuchtet wie eine Laterne: Boden und nahe Steine werden warm angestrahlt. |
| Lichtermeer, Klick oder Tippen | An dieser Stelle wird ein neues Grablicht entzündet (kurzes Aufflammen, Funken steigen auf). |
| Button „Ein Licht entzünden“ | Entzündet ein Licht vor der Kamera. Per Tastatur erreichbar; bekommt er den Fokus, scrollt die Seite ans Ende der Kamerafahrt. Screenreader hören „Ein Licht wurde entzündet.“ |
| Grabsteine (ab 960 px) | Mit der Maus über einem Stein steht ein Grablicht davor und der Fuß des Steins wird warm. Ein Klick lässt es brennen. |

**Technik:** Das Lichtermeer ist ein Canvas-2D-Renderer ohne Bibliothek (Perspektive, Grabsteine mit Seitenfläche, Körnung und Glanz, Lichter mit vorberechneten Leucht-Sprites, zwischengespeicherter Hintergrund). Es läuft nur, solange es sichtbar ist, startet erst nach dem Laden und zeichnet auf kleinen Bildschirmen mit 30 statt 60 Bildern pro Sekunde.
Der Bogen wird mit `clip-path: path()` ausgeschnitten. Ein `inset(… round …)` schneidet ein Canvas in Chrome nur grob aus; an den Ecken waren Rechtecke zu sehen.

**Sicherheitsnetz**

- Ohne JavaScript oder wenn GSAP nicht lädt: Alles ist sofort sichtbar.
- Bei „Bewegung reduzieren“: keine Scroll-Animationen, das Lichtermeer ist ein ruhiges Standbild, die Lichter am Weg brennen ohne Flackern. Lichter entzünden geht trotzdem.
- Eingeblendete Texte sind nur durchsichtig, nicht versteckt: Screenreader finden alle Überschriften jederzeit.

**Anpassen:** Tempo über `--motion-duration` in `style.css`. Länge der Kamerafahrt: `end` in `lichtermeer()` in `motion.js`. Dichte der Lichter: `dichte` in `main.js`.

## Gestaltung

- **Farben** (abgeleitet aus Granit, Efeu, Eiche und Grablicht, Details in `DESIGN.md`): Granit hell `#DADBD8`, Kalkstein `#EBECE9`, Basalt `#2E3030`, Schwarz `#000000`, Efeu `#3D4A36`, Eiche `#5E4630`, Grablicht-Rot `#9E2F25` (einziger Akzent, nur „Ein Licht entzünden“), Kerzenflamme `#F1C26A` (nur Illustration).
- **Oberflächen:** Grundfläche mit feinem Granitkorn. Die Grabsteine haben je Material eine eigene Oberfläche aus SVG-Filtern (Kalkstein, schwarzer Granit, grauer Granit, Sandstein, Muschelkalk).
- **Schriften (lokal):** *Libre Caslon Display* für Überschriften, feierlich und mit starken Kontrasten. *Golos Text* für Fließtext und Bedienung, sehr gut lesbar.
- **Buttons:** Pillenform mit rundem Symbol-Knopf (Phosphor Icons: Telefon, Pfeil, Kartennadel, Flamme). Beim Drücken geben sie leicht nach, bei Maus-Hover rückt der Knopf ein Stück vor.
- **Formsprache:** Der Rundbogen (Tor, Grabstein, Kapellenfenster) zieht sich durch die Seite.

## Barrierefreiheit (ältere Besucher im Blick)

- Fließtext 19–21 px, Buttons mindestens 56 px hoch (Kopfzeile 48 px), Telefonnummer überall als `tel:`-Link.
- Alle Farbpaare nach WCAG AA geprüft: Fließtext 6,5 bis 11,2 : 1, Text auf Tafeln und Steinen mindestens 5,1 : 1.
- Sichtbarer Tastaturfokus, „Zum Inhalt springen“, Menü-Button mit Text, Escape schließt das Menü.
- Das Lichtermeer ist für Screenreader als Stimmungsbild beschrieben.

## Datenschutz und Technik

- Schriften und GSAP liegen lokal, keine Google-Fonts- oder CDN-Einbindung.
- Keine Karten-Einbettung: Adresse als Text, dazu externe Links (Google Maps, OpenStreetMap).
- Keine Tracker, keine Cookies, kein Formular. Kontakt nur über `tel:` und `mailto:`.

## SEO

- Title und Meta-Description je Seite.
- JSON-LD `FuneralHome` nur mit verifizierten Daten: Name, Adresse, Telefon.
- `noindex, nofollow`, solange es ein Konzept ist. Vor dem Livegang entfernen.

## Qualitätscheck (lokal gemessen)

- Lighthouse Mobil:
  - mit gzip-Kompression (wie bei üblichem Hosting): Performance 98–99, Barrierefreiheit 100, Best Practices 100
  - auf `python3 -m http.server` ohne Kompression: Performance 92–93
  - SEO 60 nur wegen des gewollten `noindex`
- Lichtermeer in einer Testumgebung ohne Grafikkarte: rund 45–55 Bilder pro Sekunde auf dem Desktop.
- Screenshots für Desktop (1440 px) und Mobil (390 px) geprüft, mit und ohne Bewegung, Tastaturbedienung getestet, keine Konsolenfehler, kein seitliches Scrollen.
- Design-Detektor (impeccable): Übrig bleiben nur Abstands-Heuristiken, die visuell geprüft sind, und ein Fehlalarm: Die helle Inschrift auf dem schwarzen Granitstein steht auf dem SVG-Stein; der Detektor misst gegen die Seitenfarbe dahinter.

## [PRÜFEN]-Liste

Alles hier ist im Entwurf sichtbar markiert und muss vom Betrieb bestätigt oder geliefert werden.

**Aus der Recherche – vom Betrieb zu bestätigen**
1. Gründungsjahr 1961 (Start und Über uns)
2. Familienbetrieb, Meister- und Ausbildungsbetrieb
3. Eigene Trauerhalle
4. E-Mail-Adresse `bestattungen@boeker-hannover.de`
5. Mitgliedschaft im Bestatterverband Niedersachsen e. V.
6. Stadtbahn-Haltestelle Beekestraße: Linien 3, 7 und 17, Fußweg
7. Hausbesuche und Übernahme der Formalitäten

**Fehlende Angaben**

8. Telefonische Erreichbarkeit (auch nachts und am Wochenende?)
9. Öffnungszeiten
10. Welche Bestattungsarten werden angeboten?
11. Finanzielle Vorsorge: Treuhandkonto, Sterbegeldversicherung?
12. Leistungsumfang der Tischlerei
13. Text zur Geschichte des Hauses und zu den Menschen
14. Name und Funktion für das Inhaberfoto
15. Parkplätze, stufenloser Zugang?
16. Impressum (Rechtstext vom Betrieb, mit Generator)
17. Datenschutzerklärung (Rechtstext vom Betrieb, mit Generator)

**Zusätzlich gegenlesen lassen:** die allgemeinen Hinweise im Abschnitt „Im Trauerfall“ (116 117, 112, Unterlagen). Sie sind als Orientierung formuliert und ersetzen keine Rechtsberatung.

**Benötigte Fotos:** Beratungsgespräch, Werkstatt, Inhaber/Inhaberin. Das Lichtermeer ist eine gezeichnete Szene und braucht kein Foto.

## Recherche

Sichtbar waren nur Zusammenfassungen aus Suchergebnissen. Die Seiten selbst waren aus der Arbeitsumgebung nicht abrufbar. Deshalb ist alles als [PRÜFEN] markiert.

- Firmeneintrag auf hannover.de: „Böker Bestattungen“, mit Unterseite „Böker Trauerhalle“
- Mitgliedereintrag „Bestattungen Böker e. K.“ beim Bestatterverband Niedersachsen e. V.
- Mitgliederliste der IG Ricklingen
- Wikipedia „Stadtbahn Hannover“ und „Ricklingen (Stadtbezirk)“: Haltestelle Beekestraße, Linien 3, 7, 17

## Artefakt-Vorschau

Für die Vorschau als claude.ai-Artefakt wird eine Einzeldatei erzeugt: Schriften als data-URIs, CSS und JS eingebettet, GSAP 3.12.5 von cdnjs.
Name, Adresse, Telefonnummer, E-Mail und Rechercheangaben sind dort durch Platzhalter („Mustermann“) ersetzt. Ein verlinkbares Artefakt mit den echten Daten würde wie die echte Website des Betriebs wirken.
Die echten Daten stehen nur in diesem Projektordner.

## Lizenzen

- GSAP 3.15.0 und ScrollTrigger: kostenlose „Standard License“ von GreenSock, auch für kommerzielle Nutzung (https://gsap.com/standard-license)
- Libre Caslon Display und Golos Text: SIL Open Font License 1.1 (Lizenztexte in `assets/fonts/`)
- Symbole: Phosphor Icons, regular (MIT-Lizenz, https://phosphoricons.com)

## Verwendete Skills

- `greensock/gsap-skills`: ScrollTrigger (Pin, Scrub), Timelines, `quickSetter`, `gsap.matchMedia()` für reduzierte Bewegung, Performance-Regeln
- `frontend-design` (Anthropic): eigenständige Gestaltung, Schrift als Gestaltungselement
- `impeccable` (overdrive, bolder, craft floor): Richtungen zur Wahl vorgelegt, ein starker Moment statt vieler, Qualitätsboden, Design-Detektor
- `emil-design-eng`, `animate` (Emil Kowalski): Easing-Kurven, `scale(0.97)` beim Drücken, Hover nur mit Maus, `clip-path`-Reveals, Stagger
- `farbe-ohne-ki-look` (eigener Skill): Palette aus drei realen Dingen des Betriebs abgeleitet, ein Akzent pro Bildschirm, keine dekorativen Verläufe
- `taste-skill` (Leonxlnx): weg von generischen KI-Mustern (Pillen-Labels, Schraffuren, Glow), echte Materialien statt Flächen
