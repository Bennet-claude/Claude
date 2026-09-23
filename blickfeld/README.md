# Blickfeld – Entscheidungstrainer für zentrale Mittelfeldspieler

Browser-Spiel in Ich-Perspektive: Wahrnehmen (Scannen vor der Ballannahme) und Entscheiden
unter Zeitdruck. Zielgerät: iPad und iPhone in Safari, Querformat. Kein Build-Schritt.

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
node --test tests/*.test.js    # Passweg-Modell, Szene, Determinismus, Tempo-Unabhängigkeit
node tools/probe.mjs           # Diagnose der Testszene: Passwege über die Zeit
node tools/smoke.mjs           # Headless-Chromium: lädt die Seite, spielt an, Screenshots
```

## Aufbau

```
index.html            Canvas, Oberfläche, Import-Map (three → vendor/three)
css/app.css
vendor/three/         three.js r186, fest gepinnt, unverändert
src/
  config.js           alle Konstanten (Tempi, Beschleunigung, Sichtfeld, Passweg-Modell)
  core/               rng.js (mulberry32), math.js
  sim/                world.js (Zustand, feste 60-Hz-Schritte), ai.js (Verhalten),
                      director.js (Pass/Dribbling/Sichern, Abfangen), ball.js (Flugbahnen), clock.js
  eval/               lanes.js (Zeit bis zum Abfangen), options.js
  render/             renderer.js, pitch.js, figures.js, props.js, fpcamera.js, geo.js
  ui/                 input.js (Pointer Events), screens.js, debug.js, storage.js
  generator/          (M3)
scenes/handmade.js    handgebaute Szenen
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

- **M1** (dieser Stand): Feld, Kamera, Kopfdrehen, Ball, eine handgebaute Szene mit Pass,
  Direktpass, Dribbling, Sichern, Abfangen, Tempo-Regler, Pause, Debug-FPS.
- M2: Bewertung, Analyse aus der Vogelperspektive, Tests mit fünf Szenen.
- M3: Generator mit Validierung und Anti-Wiederholung.
- M4: Einheiten, Statistik, adaptive Schwierigkeit, PWA.
