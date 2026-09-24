# Blickfeld – Entscheidungstrainer für zentrale Mittelfeldspieler

Browser-Spiel in Ich-Perspektive: Wahrnehmen (Scannen vor der Ballannahme) und Entscheiden
unter Zeitdruck. Zielgerät: iPad und iPhone in Safari, Querformat. Kein Build-Schritt.

Die Situationen stammen aus echten Profispielen (Metrica Sports Sample Data, anonymisiert):
Alle 22 Spieler und der Ball bewegen sich bis zur Annahme exakt wie im Original, der Spieler
ist der Empfänger des Passes. Ab seiner Entscheidung übernimmt die Simulation – und der
Spielzug läuft weiter: Mitspieler spielen selbst, man läuft mit, fordert den Ball, spielt in
den Raum und schließt ab. Am Ende bewertet die Analyse den ganzen Spielzug.

## Spielen

- **Vorspann** (lang oder kurz, in den Einstellungen) → **Menü** mit vier Modi:
  - **Karriere**: 5 Kapitel × 6 Level, je ein Ziel (z. B. „Linien überspielen“, „Tor“),
    1–3 Sterne; das nächste Level öffnet sich mit mindestens einem Stern.
  - **Training**: endlos, eigenes Tempo (0,5× / 0,75× / 1×), Einheiten à 12 Spielzüge.
  - **Tempo**: startet bei 0,8×, jeder gute Spielzug (≥ 2 Sterne) macht es 0,05× schneller
    (bis 1,35×). Drei Leben; ein Leben kostet ein Spielzug ohne Stern oder ein eigener Ballverlust.
  - **Blitz**: 90 Sekunden, so viele Punkte wie möglich.
- Steuerung: waagerecht wischen = Kopf drehen; Mitspieler antippen = Pass (vor der Annahme:
  Direktpass); auf den Rasen tippen = Pass in den Raum; aufs Tor tippen = Schuss dorthin;
  mit Ball hoch wischen = Dribbling; ohne Ball wischen = Sprint; Knopf unten rechts =
  Sichern (mit Ball) bzw. Fordern (Mitspieler hat den Ball).

## Starten

ES-Module brauchen einen Webserver (nicht per `file://` öffnen):

```sh
cd blickfeld
npx serve .          # oder: python3 -m http.server
```

Debug-Anzeige (FPS, Frame-Zeiten, Draw Calls, Passwege): `?debug=1` oder `#debug` an die
Adresse hängen oder im Pausemenü einschalten.

## Tests

```sh
node --test tests/*.test.js    # Passwege, Bewertung, echte Situationen, Spielzug, Schuss, Auswahl
node tools/probe-real.mjs      # alle echten Situationen: Timing der Pässe, Ergebnisse, Noten
node tools/probe-move.mjs 400  # weitergeführte Spielzüge: Enden, Schüsse/xG, KI, Sterne
node tools/probe.mjs           # Diagnose der handgebauten Testszene
node tools/smoke.mjs           # Headless-Chromium: Vorspann, Menü, Karriere, Spielzug, Screenshots
node tools/lineup.mjs out/     # Prüfstand der Spielerfiguren (Laufzyklen, Schuss, Torwart)
```

Bibliothek neu erzeugen (Metrica-CSV von https://github.com/metrica-sports/sample-data):

```sh
node tools/extract-situations.mjs <ordner-mit-Sample_Game_1_…csv>
```

## Aufbau

```
index.html            Canvas, Oberfläche, Import-Map (three → vendor/three)
css/app.css
vendor/three/         three.js r186, fest gepinnt, unverändert
src/
  config.js           alle Konstanten (Tempi, Beschleunigung, Sichtfeld, Passweg-Modell)
  core/               rng.js (mulberry32), math.js
  sim/                world.js (Zustand, feste 60-Hz-Schritte), replay.js (echte Laufwege),
                      ai.js (Verhalten inkl. Freilaufen, Tiefenlauf, Torwart),
                      director.js (Pass, Pass in den Raum, Schuss, Dribbling, Sichern,
                      KI mit Ball, Ende des Spielzugs), shot.js (xG, Streuung, Block, Parade),
                      ball.js (Flugbahnen), clock.js
  eval/               lanes.js (Zeit bis zum Abfangen, Wettlauf zum Ball),
                      evaluate.js (Optionen, Note, Erklärung), move.js (Bewertung des
                      ganzen Spielzugs), weights.js (alle Gewichte), options.js
  game/               career.js (Kapitel, Level, Ziele, Sterne)
  generator/          scheduler.js (Auswahl ohne Wiederholung, Schwächen häufiger)
  render/             renderer.js, pitch.js, players.js (gehäutete Figuren + Mocap),
                      mocap-data.js (erzeugt), props.js, fpcamera.js, cinematic.js, geo.js
  ui/                 input.js (Pointer Events), screens.js (Menü, HUD, Analyse), debug.js, storage.js
scenes/real/          library.js (erzeugt), loader.js (Situation → Szene, gespiegelt)
scenes/handmade.js    handgebaute Testszene
tests/                node --test, ohne Abhängigkeiten
tools/                probe.mjs, smoke.mjs, artifact-entry.mjs
```

Grundregeln:

- `sim/`, `eval/` und `generator/` importieren kein Three.js. Sie laufen in Node und sind
  deterministisch: gleiche Szene + gleiche Eingaben (mit Tick-Nummer protokolliert) ergeben
  exakt denselben Ablauf.
- Simulation mit fester Schrittweite 1/60 s. Der Tempo-Regler skaliert nur die zugeführte
  Zeit; gezeichnet wird zwischen den letzten zwei Zuständen interpoliert.
- Abfangen entscheidet ein Modell (Reaktion 0,25 s, dann Lauf mit Beschleunigung). Die
  Auflösung nutzt dasselbe Modell, deshalb gibt es keine zufälligen Fehlpässe.
- Im Render-Loop keine Objekt-Allokationen, eine gemeinsame Körpergeometrie für alle 22
  Figuren (Skinning auf der GPU, Knochenmatrizen aus eigener Vorwärtskinematik), keine
  Echtzeitschatten.
- Schüsse streuen über einen Zufallsgenerator mit festem Seed je Szene – reproduzierbar.

## Stand

- M1: Feld, Kamera, Kopfdrehen, Ball, handgebaute Szene, Tempo-Regler, Pause, Debug-FPS.
- **Laufendes Spiel** (dieser Stand): 428 echte Situationen (gespiegelt 856 Varianten),
  alle Spieler in Bewegung, Annahme im Lauf, sauber getimete Pässe, Anlaufen der Gegner,
  Sichern mit Haltezeit/Unterstützung/Foul, Bewertung mit Note und Erklärung, Scan-Rückmeldung,
  Punkte, Serien, Positionswahl, Auswahl ohne Wiederholung, Statistik je Phase.
- **Runde 3** (dieser Stand): Spieler mit Motion-Capture-Animation (CMU), weitergeführter
  Spielzug mit KI-Mitspielern, Pass in den Raum, Torschuss mit Torwart, Bewertung des ganzen
  Spielzugs mit Sternen, Vorspann, neues Menü, Karriere/Training/Tempo/Blitz.
- Offen: Analyse aus der Vogelperspektive, Sound, PWA/Offline, Kopfbälle und Flanken.
