# Zimmer 3D

Interaktive 3D-Rekonstruktion eines realen Zimmers, gebaut aus 14 Referenzfotos.

Die Maßherleitung, die Fotoauswertung und die Konfidenz jeder einzelnen Angabe
stehen in [RAUMANALYSE.md](./RAUMANALYSE.md).

## Stand

| Meilenstein | Inhalt | Status |
|---|---|---|
| M0 | Gerüst, Kamerapresets, Screenshot-Werkzeug | fertig |
| M1 | Raumhülle: Wände, Nische, Tür, Fenster, Laibungen, Heizkörper, Sockel, Decke | fertig |
| M2 | Großmöbel | offen |
| M3 | Materialien und Licht verfeinern | offen |
| M4 | Details und Deko | offen |
| M5 | Editiermodus | offen |
| M6 | Möbeltausch, Planungsmodus, Varianten | offen |
| M7 | UI-Feinschliff, iPad, Performance | offen |

## Entwickeln

```bash
npm install
npm run dev
```

## Qualitätssicherung

Alle Kameraperspektiven entsprechen Standpunkten der Referenzfotos
(siehe `ref` in `src/data/views.ts`). Der Abgleich läuft so:

```bash
npm run build
npm run preview &
npm run shots -- --url http://127.0.0.1:4173
```

Die Renderings landen in `shots/` und werden direkt neben das jeweilige
Referenzfoto gelegt. Nach jeder Modellierungsstufe: größte Abweichung
suchen, korrigieren, erneut rendern.

Einzelne Ansicht: `npm run shots -- --only tuerwand`

## Architektur

```
src/data/room.ts      Alle Raummaße. Einzige Wahrheitsquelle - eine Maßkorrektur
                      ist hier eine Zahlenänderung, kein Umbau.
src/data/views.ts     Kamerapresets mit Verweis auf das jeweilige Referenzfoto
src/scene/walls.ts    Zerlegung von Wänden mit Öffnungen in Rechtecke
src/scene/Room.tsx    Raumhülle
src/scene/Lighting.tsx  Tageslicht-Setup (Fensterwand als einzige Quelle)
src/scene/Postprocessing.tsx  Umgebungsverdeckung, abschaltbar
tools/shoot.mjs       Headless-Renderings für den Fotoabgleich
```

## Hinweis zum Deployment

Dieses Verzeichnis liegt im Repository der Friseur-Website. Es wird bewusst
**nicht** mitveröffentlicht: `zimmer-3d/` wird von GitHub Pages nicht
ausgeliefert, solange kein Build dorthin kopiert wird. Referenzfotos sind
nicht eingecheckt.
