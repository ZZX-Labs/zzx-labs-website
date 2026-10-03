# World Factbook decorative artwork

This release includes two lightweight PNGs in `worldfactbook/media/decorative/`.
They appear only inside the World Factbook hero and Daily Desk. The map renderer,
its layers, controls, country boundaries and the site's global header and footer
are unchanged. The other 30 PNGs belong to the separate optional graphics pack,
which can live in a private asset repository until needed on Pages.

Generate the entire pack with Python and Pillow (no Node or external image
service):

```sh
python -m pip install Pillow
python tools/worldfactbook/build_decorative_art.py --out /tmp/wfb-art --all
```

`--all` writes 32 PNGs across four families and eight dark/natural palettes,
plus a `catalog.json` and a contact sheet. Use `--palette tactical --family wave`
for one PNG, and `--variant N` to make a distinct arrangement. The command
prints its destination and writes attribution/provenance into PNG metadata.

Art is original parametric geometry; no CIA artwork or screenshot is reproduced.
Graphic backgrounds are decoration, not a source of factual or geographic data.
Serve public art only from the Pages bundle or a public asset CDN: browser code
must not expose a private repository token or attempt private-repo downloads.
