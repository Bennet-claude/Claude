# Credits

## Bibliotheken

| Paket | Version | Lizenz | Quelle | Einbindung |
|---|---|---|---|---|
| three.js | r186 (0.186.0) | MIT | npm-Paket `three@0.186.0`, Dateien `build/three.module.js` und `build/three.core.js`, unverändert | lokal in `vendor/three/`, Lizenztext in `vendor/three/LICENSE` |

## Spieldaten

| Quelle | Nutzung | Hinweis der Quelle |
|---|---|---|
| **Metrica Sports – Sample Data** (Sample Game 1 und 2), https://github.com/metrica-sports/sample-data | Positionsdaten (25 Hz, anonymisiert, keine Namen, Vereine oder Wettbewerbe) und Pass-Ereignisse, aufbereitet mit `tools/extract-situations.mjs` zu den Situationen in `scenes/real/library.js` | „Please be responsible with the use of this data. If you use it for anything public, please acknowledge the source.“ |

Die Rohdaten liegen nicht im Repository; `scenes/real/library.js` enthält nur kurze,
quantisierte Ausschnitte (Laufwege um einzelne Pässe herum). Im Spiel steht die Quelle
auf dem Startbildschirm.

## Schriften

| Schrift | Lizenz | Quelle |
|---|---|---|
| Barlow, Barlow Condensed (Jeremy Tribby) | SIL Open Font License 1.1 | Google Fonts (per Link eingebunden; für den Offline-Betrieb ab M4 lokal) |

## 3D-Modelle, Texturen, Sounds

Keine externen Assets. Figuren, Ball, Tore, Tribünen und alle Texturen (Rasen, Publikum,
Netz, Rückennummern) werden zur Laufzeit prozedural erzeugt. Sollten später externe Modelle
dazukommen, dann nur mit CC0-Lizenz und mit Eintrag in dieser Datei.

Keine echten Vereine, Logos oder Spielernamen.
