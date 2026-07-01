Drop source photos here (e.g. `bear.jpg`, `bird.png`).

Running `npm run preprocess` (script not yet implemented — see `scripts/`) will
read every image in this folder, generate the color-by-number data for each
difficulty tier, and write the results to `public/puzzles/`. Renaming or
replacing a file here produces a new puzzle ID rather than overwriting
existing players' saved progress.
