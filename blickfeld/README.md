# Blickfeld – Entscheidungstrainer für zentrale Mittelfeldspieler

Browser-Spiel in Ich-Perspektive: Wahrnehmen (Scannen vor der Ballannahme) und Entscheiden
unter Zeitdruck. Zielgerät: iPad und iPhone in Safari, Querformat. Kein Build-Schritt.

Die Situationen stammen aus echten Profispielen (Metrica Sports Sample Data, anonymisiert):
Alle 22 Spieler und der Ball bewegen sich bis zur Annahme exakt wie im Original, der Spieler
ist der Empfänger des Passes. Ab seiner Entscheidung übernimmt die Simulation.

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
node --test tests/*.test.js    # Passwege, Bewertung (5 Szenen), echte Situationen, Auswahl, Determinismus
node tools/probe-real.mjs      # spielt alle echten Situationen durch: Timing, Ergebnisse, Noten
node tools/probe.mjs           # Diagnose der handgebauten Testszene
node tools/smoke.mjs           # Headless-Chromium: spielt mehrere Situationen, Screenshots
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
                      ai.js (Verhalten), director.js (Pass/Dribbling/Sichern, Abfangen),
                      ball.js (Flugbahnen), clock.js
  eval/               lanes.js (Zeit bis zum Abfangen), evaluate.js (Optionen, Note, Erklärung),
                      weights.js (alle Gewichte), options.js
  generator/          scheduler.js (Auswahl ohne Wiederholung, Schwächen häufiger)
  render/             renderer.js, pitch.js, figures.js, props.js, fpcamera.js, geo.js
  ui/                 input.js (Pointer Events), screens.js, debug.js, storage.js
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
- Im Render-Loop keine Objekt-Allokationen, gemeinsame Geometrien, InstancedMesh für die
  Figuren, keine Echtzeitschatten.

## Stand

- M1: Feld, Kamera, Kopfdrehen, Ball, handgebaute Szene, Tempo-Regler, Pause, Debug-FPS.
- **Laufendes Spiel** (dieser Stand): 428 echte Situationen (gespiegelt 856 Varianten),
  alle Spieler in Bewegung, Annahme im Lauf, sauber getimete Pässe, Anlaufen der Gegner,
  Sichern mit Haltezeit/Unterstützung/Foul, Bewertung mit Note und Erklärung, Scan-Rückmeldung,
  Punkte, Serien, Positionswahl, Auswahl ohne Wiederholung, Statistik je Phase.
- Offen: Analyse aus der Vogelperspektive, adaptive Schwierigkeit, PWA/Offline, Gyroskop.
