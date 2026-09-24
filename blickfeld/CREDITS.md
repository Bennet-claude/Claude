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
in den Einstellungen.

## Bewegungsdaten (Motion Capture)

| Quelle | Nutzung | Lizenz / Hinweis der Quelle |
|---|---|---|
| **CMU Graphics Lab Motion Capture Database**, http://mocap.cs.cmu.edu, als BVH-Umwandlung von https://github.com/una-dinosauria/cmu-mocap | Aufnahmen 35_01 (Skelett, Gehen), 10_01 (Stand), 16_36/16_35 (Traben), 35_22 (Laufen), 16_46 (schnelles Laufen), 09_12 (rückwärts), 69_42 (Seitschritt), 10_02 (Schuss) – mit `tools/extract-mocap.mjs` auf je einen Zyklus zugeschnitten, geglättet, auf 0,98 m Hüfthöhe skaliert und als Quaternionen in `src/render/mocap-data.js` gespeichert | „The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.“ CMU gestattet die freie Nutzung, auch kommerziell. |

Die Spielerkörper selbst sind prozedural modelliert (`src/render/players.js`) und werden über
das Skelett aus den CMU-Daten gehäutet. Hechtsprung des Torwarts, Sprint über 4,3 m/s hinaus
und die Kopfdrehung zum Ball werden aus den Daten abgeleitet bzw. ergänzt.

## Schriften

| Schrift | Lizenz | Quelle |
|---|---|---|
| Barlow Condensed (Jeremy Tribby) – Wortmarke, große Überschriften | SIL Open Font License 1.1 | Google Fonts (per Link eingebunden; ohne Netz greift die Systemschrift) |
| Systemschrift (auf iPad/iPhone: SF Pro) – gesamte Oberfläche | – | vom Betriebssystem, nicht mitgeliefert |

## 3D-Modelle, Texturen, Sounds

Keine externen 3D-Modelle, Texturen oder Sounds. Figuren, Ball, Tore, Tribünen und alle
Texturen (Rasen, Publikum, Netz, Rückennummern) werden zur Laufzeit prozedural erzeugt.
Icons sind eigene, einfache SVG-Pfade. Farben der Oberfläche: Apple-Systemfarben
(Dark Mode) für Bedeutungen, sonst Kreideweiß auf dunklem Grund.

Die Bewertung („KI-Analyse“) ist regelbasiert und läuft vollständig auf dem Gerät – kein
Sprachmodell, keine Server-Aufrufe, keine API-Schlüssel.

Keine echten Vereine, Logos oder Spielernamen.
