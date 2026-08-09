Drop source photos into a category subfolder here (e.g. `animals/bear.jpg`,
`fantasy/dragon.jpg`, `dinosaurs/trex.jpg`). Images placed directly in this
folder (not inside a subfolder) are skipped with a warning.

The subfolder name becomes the puzzle's `category` (shown as a folder in the
app's main view). Basenames must stay unique across the *entire* tree, not
just within one category folder — puzzle IDs are derived from the basename
alone, so `animals/fox.jpg` and `fantasy/fox.jpg` would collide.

Running `npm run preprocess` reads every image under every category
subfolder, generates the color-by-number data for each difficulty tier, and
writes the results to `public/puzzles/`. Renaming or replacing a file here
produces a new puzzle ID rather than overwriting existing players' saved
progress; moving a file to a different category folder (same filename, same
content) keeps its existing ID and just updates its category.
