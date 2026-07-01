# PaintPal

Color-by-numbers, generated from your own photos. Built for phone/tablet,
hosted for free on GitHub Pages, runs entirely client-side — no backend, no
account, everything saves to the device via IndexedDB.

## How it works

1. Drop a photo into `source-images/`.
2. `npm run preprocess` (not yet implemented) reduces it to a limited palette,
   segments it into numbered regions at each difficulty tier, and writes the
   result into `public/puzzles/` as a static manifest + images. These ship
   with the app as built-in puzzles.
3. Kids can also add their own photos from within the app — those are
   processed in the browser and saved to IndexedDB on that device only, so
   they never collide with or get overwritten by new built-in images.
4. Two ways to play a puzzle: **Paint by Number** (fixed numbered palette,
   difficulty controls region count) or **Free Paint** (full color wheel, any
   region, no numbers).
5. Progress saves automatically per puzzle/mode and can be cleared to restart.
   Finished pieces are kept in a local gallery to browse later.

## Difficulty tiers

| Difficulty | Colors |
|---|---|
| Easy | 6-8 |
| Medium | 9-15 |
| Hard | 15-20 |

## Stack

Vite + React + TypeScript, `idb` for local storage, `vite-plugin-pwa` for
installability/offline support. Deploys to GitHub Pages via
`.github/workflows/deploy.yml` on every push to `main`.

## Status

Repo scaffold, storage layer, and gallery shell are in place. The image
segmentation pipeline (`scripts/preprocess.mjs` and the in-browser equivalent)
and the actual puzzle-painting screen are the next big pieces.

## Local dev

```
npm install
npm run dev
npm run build   # production build, served from base path /paint-pal/
```
