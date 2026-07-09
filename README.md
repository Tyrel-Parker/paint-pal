# PaintPal

Coloring book + paint-by-numbers, generated from photos. Built for
phone/tablet, hosted for free on GitHub Pages, runs entirely client-side —
no backend, no account, everything saves to the device via IndexedDB.

## How it works

1. **Built-in pictures**: drop a photo into `source-images/` and commit it —
   a pre-commit hook (`.githooks/`, wired up by `npm install`) automatically
   runs the preprocess for changed images, stages the regenerated
   `public/puzzles/` assets into the same commit, and appends a note to the
   commit message. Each photo becomes a Free Paint outline plus three
   paint-by-numbers puzzles (easy/medium/hard). You can also run
   `npm run preprocess` manually; it's incremental (content-hash cache in
   `public/puzzles/preprocess-cache.json`) and handles deleted sources.
   **After changing pipeline code**, run `npm run preprocess -- --force` —
   code changes don't show up in source hashes.
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
2. **Split-palette k-means** in Lab space: the subject and background (per
   an on-device background-removal model) are clustered *independently* with
   their own color budgets, so a small or low-contrast subject can't lose
   its colors to acres of sky — and the silhouette is a guaranteed region
   boundary. An adaptive loop retries with more colors / gentler merging
   when an image lands under its difficulty's target region count (or
   merges harder when it overshoots).
3. Nearest-palette assignment, **mode-filter** boundary smoothing, connected
   components, then merging: small regions into their nearest-colored
   neighbor, background regions aggressively (plus a similarity pass that
   collapses gradient banding in skies/snow/bokeh).
4. The **Free Paint outline** is drawn by the
   [informative-drawings](https://github.com/carolineec/informative-drawings)
   photo→line-drawing model (Chan et al. 2022, MIT;
   [ONNX port](https://huggingface.co/rocca/informative-drawings-line-art-onnx)
   self-hosted at `public/models/line-art.onnx`, ~17MB), run via
   onnxruntime — onnxruntime-node at build time, onnxruntime-web (wasm) on
   device. Its soft pencil output becomes coloring-book ink through a
   per-image adaptive curve (darkness normalized by its 95th percentile).
   If the model can't load, a classical fallback composes a traced
   silhouette + edge/dark-mark feature lines instead.

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
