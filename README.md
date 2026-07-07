# PaintPal

Coloring book + paint-by-numbers, generated from photos. Built for
phone/tablet, hosted for free on GitHub Pages, runs entirely client-side —
no backend, no account, everything saves to the device via IndexedDB.

## How it works

1. **Built-in pictures**: drop a photo into `source-images/` and run
   `npm run preprocess`. Each photo becomes a Free Paint outline plus three
   paint-by-numbers puzzles (easy/medium/hard), written to `public/puzzles/`
   as a static manifest that ships with the app.
2. **Your own photos**: tap "＋ Add your photo" in the gallery. The same
   pipeline runs in the browser on that device; results are saved to
   IndexedDB and never leave the phone.
3. Gallery flow: pick a picture → choose **Paint by Number** (fixed numbered
   palette, customizable before starting, must select the matching color
   before a tap fills a region) or **Free Paint** (full color wheel, freehand
   drawing over the coloring-book outline) → choose a difficulty.
4. Progress saves automatically per puzzle/mode and can be cleared to restart.
   Finished pieces are kept in a local gallery to browse later.

## The pipeline

Shared pure-TypeScript code (`src/lib/segmentation/`) runs identically in
Node (build-time preprocess via `tsx`) and the browser (user photos):

1. sRGB → CIELAB, then **iterated bilateral filtering** (computed at reduced
   scale, restored via joint bilateral upsampling) — flattens texture and
   lighting so regions follow objects, not gradients.
2. **Weighted k-means** palette in Lab space; subject pixels (from an
   on-device background-removal model) get ~3x weight so palette diversity
   goes to the subject.
3. Nearest-palette assignment, **mode-filter** boundary smoothing, connected
   components, then merging: small regions into their nearest-colored
   neighbor, background regions aggressively (plus a similarity pass that
   collapses gradient banding in skies/snow/bokeh).
4. The **Free Paint outline** composes three line sources like a real
   coloring page: a bold closed silhouette (from a coarse segmentation),
   filled dark details (eyes/noses/mouths via adaptive local-contrast
   thresholding — inked solid, the way illustrators draw them), and
   Canny-style structural edges inside the subject. High-contrast region
   boundaries add a few interior lines; the background stays near-empty.

Difficulty scales resolution, color count, smoothing strength, and minimum
region size together:

| Difficulty | Colors (target) | Resolution |
|---|---|---|
| Easy | 8 | 640px |
| Medium | 14 | 1024px |
| Hard | 24 | 1536px |

### Tuning

`npm run preprocess && npm run preview:puzzles` renders a contact sheet per
image into `preview/` (original / outline / line + filled views per
difficulty). The bar: the easy *line* view alone must read as the subject,
and the outline must look like a coloring book page. Tune
`src/lib/segmentation/constants.ts` against these sheets.

Note: regenerating built-in puzzles changes region ids, which invalidates
any in-progress paintings of built-in pictures on devices that already
loaded the old manifest.

## Stack

Vite + React + TypeScript, `idb` for local storage, `vite-plugin-pwa` for
installability/offline support, `@imgly/background-removal` for on-device
subject detection, `sharp` (build-time only) for image decoding. Deploys to
GitHub Pages via `.github/workflows/deploy.yml` on every push to `main`.

## Local dev

```
npm install
npm run dev
npm run build   # production build, served from base path /paint-pal/
```
