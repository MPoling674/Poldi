# Release Notes

## 2026-07-27 — Laderaum-Erweiterung & Piratenbeute-Buchung

**Neu**
- Laderaum jedes Schiffs (Flaggschiff und NPC-Handelsschiffe) kann jetzt stufenweise erweitert werden — pro Stufe +10 % Kapazität, maximal +100 % (Verdoppelung) bei Stufe 10. Die Werftkosten steigen pro Stufe.
- Ist eine Rumpf- oder Ladungsversicherung aktiv, wird die laufende Prämie beim Ausbau sofort anteilig für den Rest des Jahres erhöht. Ab der nächsten Jahres-Verlängerung wird automatisch die volle neue (höhere) Prämie fällig.

**Behoben**
- Gulden, die im Kampf gegen Piraten erbeutet werden, erscheinen jetzt korrekt als Ertrag ("Piratenbeute") in der Gewinn- und Verlustrechnung — vorher wurde das Gold zwar gutgeschrieben, tauchte aber nirgends in der GuV auf.
- Ware, die durch Piraten geraubt wird (Teilraub oder unversicherter Totalverlust), wird jetzt als eigener Posten "davon: Warenverluste durch Piraten" unter dem Wareneinkauf ausgewiesen — vorher ging der Verlust unbenannt im Saldo unter. Die Log-Meldungen zeigen dabei zusätzlich den Warenwert des Raubs.
