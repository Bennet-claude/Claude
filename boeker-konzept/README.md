# Böker Bestattungen und Tischlerei – Konzeptentwurf

> **Unverbindlicher Konzeptentwurf von Studio Leine – nicht im Auftrag von Böker Bestattungen und Tischlerei erstellt. Alle Texte und Bilder sind Platzhalter.**
> Die Seite ist mit `noindex, nofollow` gekennzeichnet. Es wurden keine Logos, Fotos oder Texte der bestehenden Website übernommen; die Wortmarke ist reiner Text.

Ruhige Website für einen Bestatter mit Tischlerei in Hannover-Ricklingen: eine Startseite zum Scrollen und eine eigene Seite „Bestattungsarten“, auf die jeder Grabstein der Startseite führt.
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
├── index.html              Startseite (Einstieg, Trauerfall, Grabsteine, Vorsorge, Tischlerei, Über uns, Kontakt)
├── bestattungsarten.html   Fünf Bestattungsarten in fünf Farbabschnitten, mit Animationen und Vergleich
├── impressum.html          Platzhalterseite
├── datenschutz.html        Platzhalterseite
├── favicon.svg             Bogen-Symbol
├── assets/
│   ├── css/style.css       Tokens, Layout, Komponenten (mobile-first)
│   ├── img/abendgang/      Zehn Szenen „Abendgang“ (01–10, je AVIF, WebP, JPEG, 1520 × 364)
│   ├── js/main.js          Menü, Absicherung ohne GSAP, Abendgang starten und anhalten, Grablichter an den Steinen, Pfadlänge im Trauerfall-Weg
│   ├── js/motion.js        Scroll-Animationen der Startseite (GSAP + ScrollTrigger)
│   ├── js/bestattungsarten.js  Leiste und Animationen der Seite „Bestattungsarten“
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
| `start` | Überschrift, Einstiegstext, Anrufen-Button; darunter (mobil oben) das Bildband „Abendgang“ → Highlight 1 |
| `trauerfall` | Was ist im Trauerfall zu tun? 4 Schritte → Highlight 2 |
| `bestattungsarten` | Fünf Bestattungsarten als Reihe von Grabsteinen, die Inschrift ist in den Stein gemeißelt. Jeder Stein ist ein Link zum passenden Abschnitt der Seite „Bestattungsarten“. |
| `vorsorge`, `tischlerei` | Zwei gleich gebaute Tafeln nebeneinander: Efeu und Eiche |
| `ueber-uns` | Foto im Bogen, Text, vier Fakten |
| `kontakt` | Große Telefonnummer, zwei Buttons, Standbild „Ein letzter Blick“, drei Spalten: Adresse, Erreichbarkeit, Anfahrt |

Zwischen Trauerfall und Bestattungsarten sowie vor dem Kontakt liegt je ein weicher Übergang von Schwarz zu Granit.

Mobil (unter 1024 px) gibt es eine feste untere Leiste mit **Anrufen** (`tel:`) und **Anfahrt**.

## Animationen

| | Name | Was passiert |
|---|---|---|
| **Highlight 1** | Abendgang | Zehn Szenen eines Spaziergangs über den Friedhof im Abendlicht, vom Eingangstor bis zum letzten Blick über die Hügel. Jede Szene steht 6 Sekunden, die Überblendung dauert 2 Sekunden, dabei rückt das Bild langsam 7 % näher und ein Stück zur Seite. Darunter wechselt die Bildunterschrift. Ein Durchgang dauert eine Minute, dann beginnt er von vorn. |
| **Highlight 2** | Lichter am Weg | Ein Funke läuft die goldene Linie entlang (groß: waagerecht, Handy: senkrecht) und entzündet jeden Schritt mit einem kurzen Lichtring. Startet, sobald der Weg ins Bild kommt. Ist der Abschnitt ganz zu sehen, brennen alle vier Lichter. |
| ruhig 1 | Steine | Eine Erdlinie zieht sich von links nach rechts, die Steine steigen nacheinander aus ihr auf, dann wird die Inschrift von links nach rechts eingemeißelt. An den Scroll gekoppelt, in beide Richtungen: Beim Zurückscrollen sinken die Steine wieder, beim nächsten Herunterscrollen steigen sie erneut auf, so oft man möchte. Handy: sanftes Einblenden, ebenfalls wiederholbar. |
| ruhig 2 | Bildfenster | Bild-Platzhalter öffnen sich langsam von unten. |
| ruhig 3 | Einblenden | Textgruppen erscheinen sanft nacheinander. |

Dazu in den Übergängen kleine Lichter: Am Morgen verlöschen sie, am Abend gehen sie an. Im Kontakt steht die letzte Szene als ruhiges Standbild.

Auf der Seite gibt es keine 3D-Animationen mehr. Alles bewegt sich flach, nur über `opacity` und `transform`.

### Interaktion

| Wo | Was |
|---|---|
| Knopf „Anhalten“ unter dem Bildband | Hält den Abendgang an und lässt ihn weiterlaufen („Abspielen“). Bei „Bewegung reduzieren“ heißt er „Nächstes Bild“ und blättert von Hand. |
| Grabsteine | Ein Klick führt zum passenden Abschnitt der Seite „Bestattungsarten“. Ab 960 px steht beim Zeigen mit der Maus (oder beim Ansteuern mit der Tastatur) ein Grablicht vor dem Stein. |

**Technik:** Der Abendgang ist reines CSS: drei `@keyframes` (Überblendung, Bildzug, Bildunterschrift), alle Szenen mit derselben Laufzeit von 60 Sekunden, versetzt um je 6 Sekunden. Jede Szene blendet über der vorigen ein (`z-index`), sinkt danach nach hinten und verschwindet erst, wenn die nächste ganz deckt. So scheint nie Schwarz durch, auch nicht beim Sprung von Szene 10 zurück zu Szene 1. Die Animation läuft auf der Grafikkarte und bleibt flüssig, auch wenn das Skript beschäftigt ist.
`main.js` startet sie erst, wenn alle zehn Bilder dekodiert sind; bis dahin steht die erste Szene genau in dem Zustand still, an dem der Ablauf einsetzt. Außerhalb des Bildes und bei verdecktem Tab pausiert sie.

**Sicherheitsnetz**

- Ohne JavaScript oder wenn GSAP nicht lädt: Alles ist sofort sichtbar.
- Bei „Bewegung reduzieren“: keine Scroll-Animationen, der Abendgang steht still und lässt sich mit „Nächstes Bild“ durchblättern, die Lichter am Weg brennen ohne Flackern.
- Eingeblendete Texte sind nur durchsichtig, nicht versteckt: Screenreader finden alle Überschriften jederzeit.

**Anpassen:** Tempo über `--motion-duration` in `style.css`. Abendgang: Standzeit und Überblendung stehen in den Keyframes `film-blende`, `film-zug`, `film-titel` und in den `animation-delay`-Werten (Kommentar in `style.css`). Bildausschnitt je Szene: `--fx` im HTML, Richtung des Bildzugs: `--dx`.

## Seite „Bestattungsarten“

Fünf Abschnitte, jeder in seiner eigenen Farbe; hell und dunkel wechseln sich ab, damit klar zu sehen ist, wo der nächste beginnt. Eine mitlaufende Leiste oben zeigt, in welchem Abschnitt man gerade ist (Farbpunkt = Farbe des Abschnitts).

| Abschnitt | Farbe | Animation |
|---|---|---|
| Erdbestattung | Graberde `#3A322B` | Sarg: „Teile zeigen“ hebt Deckel, Kissen, Decke, Matratze ab und löst die Griffe. |
| Feuerbestattung | Asche `#E3E1DC` | Urne: drehen durch Ziehen, mit den Pfeiltasten oder den Knöpfen; dreht sich sonst ganz langsam von selbst. „Teile zeigen“ zerlegt sie in Schmuckurne, Deckel, Aschekapsel, Kapseldeckel und Kennstein. |
| Baumbestattung | Efeu `#3D4A36` | Zeitregler: Die Wurzeln wachsen, die Urne bekommt Risse und wird Teil des Waldbodens. Läuft beim ersten Erscheinen einmal vor. |
| Seebestattung | Gischt `#DCE3E5` | An das Scrollen gekoppelt: Blüten auf dem Wasser, die Urne sinkt und löst sich auf, die Stelle erscheint in der Seekarte. |
| Ihr eigener Abschied | Eiche `#5E4630` | Zusammenstellen: Kerzenlicht, Foto, Blumen, Worte, Musik erscheinen auf dem Tisch; darunter steht die Auswahl. |

Jeder Abschnitt: kurz erklärt, „Gut zu wissen“, „Passt zu Ihnen, wenn …“, Anrufen-Button, Weiter zum nächsten. Am Ende ein Vergleich (auf dem Handy als Karten).
Die Animationen sind flach (2D, SVG): Die Urne „dreht“ sich, weil Riffelung, Plakette und Etikett mit Sinus und Kosinus um die Achse laufen, während das Licht stehen bleibt. Teile werden in der Legende hervorgehoben, wenn man auf einen Eintrag zeigt oder tippt.
Zwischen den Seiten blendet der Browser weich über (View Transitions, wo unterstützt).

`bestattungsarten.html` übernimmt Kopf, Navigation und Fuß von `index.html`. Bei Änderungen dort bitte beide Seiten gleich halten.

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
- Das Bildband ist für Screenreader als Spaziergang beschrieben; die wechselnden Bildunterschriften werden nicht vorgelesen. Automatische Bewegung lässt sich anhalten (WCAG 2.2.2).

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
  - mit gzip-Kompression (wie bei üblichem Hosting): Startseite Performance 98, Barrierefreiheit 100, Best Practices 100; Seite „Bestattungsarten“ 100, 100, 100
  - SEO 60 nur wegen des gewollten `noindex`
- Abendgang: zehn Bilder zusammen 415 KB (AVIF), die ganze Seite 562 KB.
- Screenshots für Desktop (1440 px) und Mobil (390 px) geprüft, mit und ohne Bewegung, Tastaturbedienung getestet, keine Konsolenfehler, kein seitliches Scrollen.
- Design-Detektor (impeccable): Übrig bleiben nur Abstands-Heuristiken, die visuell geprüft sind, und ein Fehlalarm: Die helle Inschrift auf dem schwarzen Granitstein steht auf dem SVG-Stein; der Detektor misst gegen die Seitenfarbe dahinter.

## [PRÜFEN]-Liste

Alles hier ist im Entwurf sichtbar markiert und muss vom Betrieb bestätigt oder geliefert werden.

**Seite „Bestattungsarten“ – vom Betrieb gegenlesen lassen**
- Welche Bestattungsarten werden angeboten?
- Die allgemeinen Angaben je Bestattungsart, die Teile von Sarg und Urne, der Vergleich
- Ruhezeiten der Friedhöfe in Hannover

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

**Benötigte Fotos:** Beratungsgespräch, Werkstatt, Inhaber/Inhaberin. Die zehn Szenen des Abendgangs hat der Auftraggeber dieses Entwurfs geliefert. [PRÜFEN: Herkunft und Nutzungsrechte der Abendgang-Bilder klären, bevor sie öffentlich verwendet werden.]

## Recherche

Sichtbar waren nur Zusammenfassungen aus Suchergebnissen. Die Seiten selbst waren aus der Arbeitsumgebung nicht abrufbar. Deshalb ist alles als [PRÜFEN] markiert.

- Firmeneintrag auf hannover.de: „Böker Bestattungen“, mit Unterseite „Böker Trauerhalle“
- Mitgliedereintrag „Bestattungen Böker e. K.“ beim Bestatterverband Niedersachsen e. V.
- Mitgliederliste der IG Ricklingen
- Wikipedia „Stadtbahn Hannover“ und „Ricklingen (Stadtbezirk)“: Haltestelle Beekestraße, Linien 3, 7, 17

## Artefakt-Vorschau

Für die Vorschau als claude.ai-Artefakt werden zwei Dateien erzeugt (Startseite und „Bestattungsarten“): Schriften und Bilder als data-URIs, CSS und JS eingebettet, GSAP 3.12.5 von cdnjs.
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
