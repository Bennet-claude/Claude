# Böker Bestattungen und Tischlerei – Konzeptentwurf

> **Unverbindlicher Konzeptentwurf von Studio Leine – nicht im Auftrag von Böker Bestattungen und Tischlerei erstellt. Alle Texte und Bilder sind Platzhalter.**
> Die Seite ist mit `noindex, nofollow` gekennzeichnet. Es wurden keine Logos, Fotos oder Texte der bestehenden Website übernommen; die Wortmarke ist reiner Text.

Ruhige One-Page-Landingpage (Scrollseite) für einen Bestatter mit Tischlerei in Hannover-Ricklingen.
Statisch: HTML, CSS, Vanilla-JS. Kein Framework, kein Build-Schritt, keine externen Ressourcen.

## Starten

```bash
cd boeker-konzept
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

`index.html` lässt sich auch direkt per Doppelklick öffnen. Für die Scroll-Animationen ist ein lokaler Server zuverlässiger.

## Struktur

```
boeker-konzept/
├── index.html              Landingpage (alle Abschnitte)
├── impressum.html          Platzhalterseite
├── datenschutz.html        Platzhalterseite
├── favicon.svg             Bogen-Symbol
├── assets/
│   ├── css/style.css       Tokens, Layout, Komponenten (mobile-first)
│   ├── js/main.js          Menü, Absicherung ohne GSAP, Pfadlänge im Trauerfall-Weg
│   ├── js/motion.js        Alle Scroll-Animationen (GSAP + ScrollTrigger)
│   ├── vendor/             gsap.min.js, ScrollTrigger.min.js (3.15.0, lokal)
│   └── fonts/              Marcellus, Atkinson Hyperlegible Next (woff2, lokal, OFL)
├── PRODUCT.md              Produktwahrheit (Zielgruppen, Ton, Grenzen)
├── DESIGN.md               Gestaltungsentscheidungen
└── README.md
```

### Abschnitte (jeweils `<section data-section="…">`)

| `data-section`      | Inhalt                                                          |
|---------------------|-----------------------------------------------------------------|
| `start`             | Einstieg, Anrufen-Button, Bogen „Eingang“ → Highlight 1          |
| `trauerfall`        | Was ist im Trauerfall zu tun? 4 Schritte (Ablauf) → Highlight 2 |
| `bestattungsarten`  | Erd-, Feuer-, Baum-, Seebestattung, eigener Abschied             |
| `vorsorge`          | Bestattungsvorsorge, Gesprächstermin per Telefon                 |
| `tischlerei`        | Möbelbau, Türen, Fenster (Holzton)                               |
| `ueber-uns`         | Betrieb, Fakten (alle als [PRÜFEN] markiert)                     |
| `kontakt`           | Telefon, Adresse, E-Mail, Anfahrt, externe Kartenlinks           |

Mobil (unter 1024 px) gibt es eine feste untere Leiste mit **Anrufen** (`tel:`) und **Anfahrt** (Sprung zum Abschnitt Anfahrt).

## Animationen

Langsam und ruhig, alle an das Scrollen gekoppelt. Grundtempo in `style.css`: `--motion-duration: 1.6s`, `--motion-ease`. `motion.js` liest `--motion-duration` aus.

| | Name | Abschnitt | Was passiert |
|---|---|---|---|
| **Highlight 1** | Das Tor öffnet sich | Start | Der Abschnitt bleibt stehen. Der Bogen (wie ein Friedhofstor) weitet sich langsam zum ganzen Bild, es dämmert, dann erscheint „Bestattungen und Tischlerei unter einem Dach.“ |
| **Highlight 2** | Lichter am Weg | Im Trauerfall | Eine warme Linie wächst mit dem Scrollen den Weg entlang. An jedem der vier Schritte entzündet sich ein Licht (wie ein Grablicht) und flackert leise. |
| ruhig 1 | Feine Linien | Listen, Fakten, Vorsorge | Trennlinien ziehen sich von links nach rechts. |
| ruhig 2 | Bogenfenster | Bild-Platzhalter | Bilder öffnen sich langsam von unten. |
| ruhig 3 | Ruhiges Einblenden | Überschriften, Texte, Listen | Inhalte erscheinen sanft und nacheinander. |

**Sicherheitsnetz**

- Ohne JavaScript oder wenn GSAP nicht lädt: Alles ist sofort sichtbar (`main.js` entfernt dann die Klasse `motion-ok`).
- Bei „Bewegung reduzieren“ im Betriebssystem: keine Scroll-Animationen, Lichter brennen ruhig, kein Flackern (`gsap.matchMedia()` + `@media (prefers-reduced-motion: reduce)`).
- Das Flackern läuft nur, solange der Abschnitt sichtbar ist.

**Anpassen**

- Tempo: `--motion-duration` in `assets/css/style.css`.
- Länge von Highlight 1: `end` in `tor()` in `motion.js` (Faktor 1.15 bzw. 0.95 der Fensterhöhe).
- Eine Animation abschalten: in `motion.js` den Aufruf im `mm.add(…)`-Block entfernen (z. B. `bogenfenster();`).

## Gestaltung

- **Farben:** Kalkstein-Off-White `#EDEDE7`, Anthrazit `#252826`, gedämpftes Salbeigrün `#7E8C77` / `#44513E`, Holzton `#9A7A58` / `#6A4D31` (nur Tischlerei), Kerzenlicht `#E8C483` (nur im Trauerfall-Weg). Feines Steinkorn als Textur.
- **Schriften (lokal):** *Marcellus* für Überschriften – angelehnt an römische Inschriften, also an gemeißelte Buchstaben in Stein. *Atkinson Hyperlegible Next* für Text – vom Braille Institute für Menschen mit eingeschränktem Sehvermögen entwickelt. Die Null hat bewusst einen Schrägstrich, damit sie nicht mit „O“ verwechselt wird.
- **Formsprache:** Der Rundbogen (Tor, Kapellenfenster, Grabstein) zieht sich durch die Seite. Die Tischlerei hat bewusst gerade Kanten.
- Keine Verläufe als Schmuck, kein Glassmorphism, keine Icon-Karten-Raster, keine Stock-Fotos.

## Barrierefreiheit (ältere Besucher im Blick)

- Fließtext 19–21 px, Buttons mindestens 56 px hoch, Telefonnummer überall als `tel:`-Link.
- Kontraste nach WCAG AA geprüft (Fließtext 6,8 : 1 und mehr; gedimmte Schritte 5,1 : 1).
- Sichtbarer Tastaturfokus, „Zum Inhalt springen“-Link, Menü-Button mit Text „Menü“ (nicht nur Symbol), Escape schließt das Menü.
- Semantisches HTML: `header`, `nav`, `main`, `section`, `ol` für die Schritte, `address`, `dl` für Fakten.

## Datenschutz und Technik

- Schriften und GSAP liegen lokal, keine Google-Fonts- oder CDN-Einbindung.
- Keine Google-Maps-Einbettung: Adresse als Text, dazu zwei externe Kartenlinks (OpenStreetMap, Google Maps).
- Keine Tracker, keine Cookies, kein Formular. Kontakt nur über `tel:` und `mailto:`.

## SEO

- Title und Meta-Description je Seite.
- JSON-LD `FuneralHome` nur mit verifizierten Daten: Name, Adresse, Telefon.
- `noindex, nofollow`, solange es ein Konzept ist. Vor dem Livegang entfernen.

## Qualitätscheck (lokal gemessen)

- Lighthouse Mobil: Performance 95, Barrierefreiheit 100, Best Practices 100. SEO 60 nur wegen des gewollten `noindex`.
  Gemessen auf `python3 -m http.server` ohne Kompression. Mit gzip/Brotli und Caching beim Hoster ist mehr zu erwarten.
- Screenshots für Desktop (1440 px), Tablet (800 px) und Mobil (390 px) geprüft, mit und ohne Bewegung, keine Konsolenfehler.
- Design-Detektor (impeccable): Hinweise zu Off-White, Kerzenlicht und Schraffur der Platzhalter sind bewusste Entscheidungen aus dem Briefing. Die Hinweise „cramped padding“ bei Abschnitten sind Fehlalarme: Die Abstände entstehen über `.wrap` und `padding-block`.

## [PRÜFEN]-Liste

Alles hier ist im Entwurf sichtbar markiert und muss vom Betrieb bestätigt oder geliefert werden.

**Aus der Recherche – vom Betrieb zu bestätigen**
1. Gründungsjahr 1961 (Start und Über uns)
2. Familienbetrieb, Meister- und Ausbildungsbetrieb
3. Eigene Trauerhalle (Bestattungsarten und Über uns)
4. E-Mail-Adresse `bestattungen@boeker-hannover.de`
5. Mitgliedschaft im Bestatterverband Niedersachsen e. V.
6. Stadtbahn-Haltestelle Beekestraße: Linien 3, 7 und 17, Fußweg
7. Hausbesuche und Übernahme der Formalitäten

**Fehlende Angaben**

8. Telefonische Erreichbarkeit (auch nachts und am Wochenende?)
9. Öffnungszeiten
10. Welche Bestattungsarten werden angeboten?
11. Finanzielle Vorsorge: Treuhandkonto, Sterbegeldversicherung?
12. Leistungsumfang der Tischlerei, eigene Rufnummer?
13. Text zur Geschichte des Hauses und zu den Menschen
14. Name und Funktion für das Inhaberfoto
15. Parkmöglichkeiten
16. Stufenloser Zugang?
17. Impressum (Rechtstext vom Betrieb, mit Generator)
18. Datenschutzerklärung (Rechtstext vom Betrieb, mit Generator)

**Zusätzlich gegenlesen lassen:** die allgemeinen Hinweise im Abschnitt „Im Trauerfall“ (116 117, 112, Unterlagen). Sie sind als Orientierung formuliert und ersetzen keine Rechtsberatung.

**Benötigte Fotos:** Eingang Beekestraße 66–68, Trauerhalle, Werkstatt, Möbelstück, Inhaber/Inhaberin.

## Recherche

Sichtbar waren nur Zusammenfassungen aus Suchergebnissen. Die Seiten selbst waren aus der Arbeitsumgebung nicht abrufbar. Deshalb ist alles als [PRÜFEN] markiert.

- Firmeneintrag auf hannover.de: „Böker Bestattungen“, mit Unterseite „Böker Trauerhalle“
- Mitgliedereintrag „Bestattungen Böker e. K.“ beim Bestatterverband Niedersachsen e. V.
- Mitgliederliste der IG Ricklingen
- Wikipedia „Stadtbahn Hannover“ und „Ricklingen (Stadtbezirk)“: Haltestelle Beekestraße, Linien 3, 7, 17

## Lizenzen

- GSAP 3.15.0 und ScrollTrigger: kostenlose „Standard License“ von GreenSock, auch für kommerzielle Nutzung (https://gsap.com/standard-license)
- Marcellus und Atkinson Hyperlegible Next: SIL Open Font License 1.1 (Lizenztexte in `assets/fonts/`)
- Symbole für Telefon und Kartennadel: nach Lucide (ISC-Lizenz)

## Verwendete Skills

- `greensock/gsap-skills`: ScrollTrigger (Pin, Scrub, `batch`), Timelines, `gsap.matchMedia()` für reduzierte Bewegung, Performance-Regeln
- `frontend-design` (Anthropic): eigenständige Gestaltung statt Standard-Look, Schrift als Gestaltungselement
- `impeccable`: Qualitätsboden (Kontrast, Fokus, Auswahlfarbe, Scrollleiste), Bewegungsregeln, Design-Detektor
- `emil-design-eng` (Emil Kowalski): Easing, `scale(0.98)` beim Drücken, `clip-path`-Reveals, Hover nur mit Maus
