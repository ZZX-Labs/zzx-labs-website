# Globe boundaries, offline map layers, and historical editions

## Water boundaries

The independent `water/` index covers 11,656 distinct published Natural Earth
1:10m reference features in nine marine, lake, reservoir, and river source
files, including its Australia, Europe, and North America supplements. Oceans,
seas, gulfs, bays, straits, lakes, reservoirs, and river paths can be selected
on the globe or from the water selector. Inland polygons and river centerlines
take precedence over the underlying land hit map; marine polygons do not hide
land. The selected outline, mapped class, feature identifier, source file URL,
source digest, and rights appear in the record. Narrow rivers use vector
distance at the current map zoom, rather than relying on a 2048-pixel image.

The original country lookup and every globe texture remain intact. Water
geometry is a **present-day cartographic reference**, not 1962–2027 hydrographic
history. Source maps can have gaps or overlapping named marine areas, and
Natural Earth generalizes or omits many small waters. No dataset can honestly
promise every river, pond, or disputed sea boundary worldwide. A source with
finer coverage may be added as a separately credited GeoJSON export; verify
its reuse terms and source date before publishing it. OpenStreetMap extracts
are under ODbL and require attribution and publication of any adapted database
under its terms: https://www.openstreetmap.org/copyright .

To rebuild the reference from the pinned public-domain GeoJSON digests:

```bash
python3 tools/worldfactbook/build_water_boundaries.py \
  --sources tools/worldfactbook/data/water-sources.json \
  --output worldfactbook/boundaries/water --download
python3 tools/worldfactbook/render_water_layer.py \
  --water worldfactbook/boundaries/water \
  --base worldfactbook/boundaries/reference/tactical.png \
  --layers worldfactbook/boundaries/layers.json
python3 tools/worldfactbook/verify_water_boundaries.py --repo .
```

The builder writes bounded geometry and feature-index shards. The renderer
adds an optional hydrographic imagery choice; the default tactical layer and
country hit image are unchanged. The source
GeoJSON files downloaded into `tools/worldfactbook/data/water-inputs/` are
build inputs and do not need to be copied to Pages. For historical water
outlines, provide a separate source manifest whose *every* entry cites that
edition year, then run the builder with `--year YEAR`. Unreviewed historical
geometry stays explicitly marked until independently checked.

The globe never requests tiles from `tile.openstreetmap.org`, OpenTopoMap, or
NASA during a visitor's session. The map, topographic relief, satellite
texture, and geographic hit map are local files. A country or territory can
be selected by clicking its polygon. Small islands and locations absent from
the vector source can also be selected with the overlaid point markers and
the adjacent location list. Clicking a map unit without a Factbook profile
reports that no source-backed record exists for that year.

The initial `reference/` boundaries come from Natural Earth 1:50m Admin 0
Map Units. This is a contemporary reference, not a reconstruction of 1962,
1989, 2004, or any other past year. Natural Earth map data are public domain:
https://www.naturalearthdata.com/about/terms-of-use/ . The relief is Natural
Earth 1:50m Shaded Relief. The satellite composite is NASA's Blue Marble
image from 2002. Credit: NASA Earth Observatory. This image never implies a
satellite observation from the selected Factbook edition year.

Historical outlines need independently sourced and reviewed GeoJSON for each
edition. To add a year, include a `FeatureCollection` of `Polygon` or
`MultiPolygon` geometries in longitude/latitude degrees. Each feature should
provide `properties.factbook_code` matching the archive's location code.
Alternatively provide `properties.ISO_A2_EH` or an explicit reviewed mapping
file with `--aliases`. Resolve historical states, territorial splits, names,
and contested boundaries against the cited year rather than assigning them
modern ISO identifiers without review. The builder writes dated image and
JSON shards and changes only that year's boundary manifest entry:

```bash
python3 tools/worldfactbook/build_globe_assets.py \
  --year 1962 --geojson /path/to/reviewed-1962.geojson \
  --source-url https://example.org/source-1962 \
  --catalogue worldfactbook/api/country-archive/index.json \
  --points worldfactbook/country-points.json \
  --output worldfactbook/boundaries
```

The output is initially marked `unreviewed` so it cannot silently imply a
complete reconstruction. Map unit outlines follow the source dataset's
cartography, including disputed-area conventions. Natural Earth has 265
input map units grouped into 251 selectable geographic locations in this
reference export, 241 of which match a Factbook archive location code. The
other 10 can be clicked but do not have a source-backed archive profile.
The Factbook archive contains additional historic and provisional labels;
36 of those currently lack coordinates and remain accessible from the
location selector pending source and identity review. Coverage is audited
per edition, never inferred from the appearance of the modern reference.

Each output JSON file stays under 480,000 bytes. Raster textures are below
2 MiB. The `regions.png` image encodes a feature ID at every covered pixel;
browser clicks invert the globe projection to read that ID. The matching
`index.json` identifies the place and points to size-bounded geometry shards
for the selected outline. Keep index, hit image, map textures, and shard files
together when copying the website. Small islands narrower than a texture
pixel are handled by location markers.

## Globe imagery and themes

`layers.json` defines 28 source layers. Seven are installed in this package:
tactical graphite, political map, topographic tint, shaded relief, NASA Blue
Marble 2002, Blue Marble with relief shading, and hydrographic reference.
Twenty-one optional layers
are disabled until their distinct local rasters are installed. The included
reference rasters are 2048 × 1024, not UHD. The interface does not silently
upscale them and call them UHD. It retains the selected data edition year
independently of imagery date and map boundary provenance.

To install an authorized 2:1 equirectangular raster (prefer 8192 × 4096),
from the website checkout root run:

```bash
python3 tools/worldfactbook/install_globe_layer.py \
  --repo . --layer nasa_jan --source /path/to/january-raster.tif \
  --credit 'NASA Blue Marble Next Generation, January composite' \
  --licence 'Public domain' \
  --source-url 'https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/'
```

The installer requires Pillow. It resamples only above 8192 × 4096, writes
a bounded local WebP, records its hash and attribution, and enables that
source layer. It does not fetch or cache tiles. OpenStreetMap source data are
available under ODbL, but the community tile servers prohibit bulk downloads
and require visible attribution. For the `osm` option, provide your own
redistributable equirectangular map raster and retain © OpenStreetMap
contributors and its licence. Terrain relief in the included assets is a
shaded image proxy; it is not a measured elevation mesh or Google Earth detail.
NOAA ETOPO 2022 is a CC0 candidate for a future measured elevation mesh.

The 32 themes are palettes for the globe studio, country library, controls,
grid, and markers. They do not replace a layer's provenance or date, and
they do not change the site's header, footer, typography, or other sections.

## Country readout while exports are pending

The preferred readout is `api/country-archive/index.json` and its verified
country/year parts generated by the desktop importer. This checkout does not
contain that export yet. Until it is released, the reader can show excerpts
from the existing `api/editions/<year>/<category>.json` corpus by country code.
The fallback is explicitly marked **unreviewed**: some records have wrong
edition years or country/category assignments. For example, the legacy
1962 India excerpt includes a January 1979 population date. These excerpts
are raw source leads, not completed 1962 profiles. The fallback links each
original source when its URL is present. Missing editions and locations
remain missing; a later reviewed country export takes precedence automatically.
