# PaintPal

Color-by-numbers, generated from your own photos. Built for phone/tablet,
hosted for free on GitHub Pages, runs entirely client-side — no backend, no
account, everything saves to the device via IndexedDB.

## How it works

1. Drop a photo into `source-images/`.
2. `npm run preprocess` reduces it to a limited palette, segments it into
   numbered regions at each difficulty tier, and writes the result into
   `public/puzzles/` as a static manifest + thumbnails. These ship with the
   app as built-in puzzles.
3. Kids can also add their own photos from within the app — those are
   processed in the browser and saved to IndexedDB on that device only, so
   they never collide with or get overwritten by new built-in images (not
   yet wired to a UI; the processing code exists in `src/lib/processPhoto.ts`).
4. Gallery flow: pick a picture → choose **Paint by Number** (fixed numbered
   palette, customizable before starting, must select the matching color
   before a tap fills a region) or **Free Paint** (full color wheel, any
   region, no numbers) → choose a difficulty.
5. Progress saves automatically per puzzle/mode and can be cleared to restart.
   Finished pieces are kept in a local gallery to browse later.

## Difficulty tiers

Both region count (geometric detail) and color count increase with
difficulty — harder tiers also process at a higher resolution, so "hard"
isn't just more colors, it's genuinely finer-grained geometry.

| Difficulty | Colors | Resolution |
|---|---|---|
| Easy | 7-9 | 640px |
| Medium | 12-18 | 1024px |
| Hard | 20-28 | 1536px |

## Stack

Vite + React + TypeScript, `idb` for local storage, `vite-plugin-pwa` for
installability/offline support, `image-q` for color quantization, `sharp`
(build-time only) for image decoding. Deploys to GitHub Pages via
`.github/workflows/deploy.yml` on every push to `main`.

## Status

Segmentation pipeline, gallery, and puzzle-painting screen (numbers + free
modes, autosave/resume, finished gallery) are all in place. Not yet built:
an in-app "add your own photo" UI (the processing code exists but isn't
wired up).

## Local dev

```
npm install
npm run dev
npm run build   # production build, served from base path /paint-pal/
```
