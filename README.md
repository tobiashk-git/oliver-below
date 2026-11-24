# Oliver: Below the Valley

A turn-based, permadeath, room-by-room roguelike for iPhone, set beneath *Oliver in the Valley of Adventure*.
Plain JS and canvas, no build step. Installs to the home screen as a PWA once served over HTTPS.

## Run it

    py tools/serve.py 8090        then open http://localhost:8090

## Shape of a run

24 floors: six zones of four (Barrow, Frostpeak, Verdantwood, Emberfall, Gloomfen, Castle). Every fourth floor is a boss
with a bed before the arena; floors 6, 10, 18 and 22 have a mini-boss. Beat the Ancient Warden on 24 and go home, or carry
on into the Endless Deep, where difficulty compounds 6% a floor.

## Run length (simulated, not yet measured with people)

`sim.html` plays the real rules with three kinds of player and a time model (seconds per step, decision, fight turn, dialog).
Final numbers, seeds 9000+, minutes per run:

| Player | Target | 25% | median | 75% | median floor | runs | beat the Warden |
|---|---|---|---|---|---|---|---|
| Beginner | 5-15 | 9 | 13 | 16 | 4 | 80 | 0 |
| Average | 20-60 | 21 | 40 | 69 | 11 | 50 | 4 |
| Expert | 60-180+ | 54 | 130 | 139 | 29 | 24 | 15 |

Re-run in the console of sim.html: `simAsync([['beginner',80],['average',50],['expert',24]],{maxFloors:60,seed:9000})`, then read `SIM.rows`.

The knobs are all at the top of `js/data.js`: `K.matk` and `K.mhp` (monster curves), `HUMP` (where it gets hard), `K.regen`,
and boss telegraph multipliers in `MON`. Potion and food supply are the pity timers at the end of `js/dungeon.js`.

## Files

- `js/data.js` content and numbers, `js/dungeon.js` generation, sight, paths, `js/engine.js` rules (no DOM), `js/render.js` canvas, `js/ui.js` panels, `js/main.js` input
- `js/bot.js`, `sim.html` simulated players (not loaded by the game)
- `tools/build_assets.py` rebuilds `assets/` from the Valley Game Godot folder, which it only reads
- `tools/make_artifact.py` writes `artifact.html` for the private claude.ai page
- `sw.js` offline cache: bump `VERSION` on every deploy

Art, music and sound credits: `CREDITS.md`.
