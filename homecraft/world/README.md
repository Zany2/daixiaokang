# BJUT campus world

This is a static, outdoor campus diorama based on the user-supplied `bjut.jpg`.
It contains 56 places, including 43 building volumes, five gates, squares,
residences and sports grounds. The world bounds span 576 by 460 scene meters,
compared with the previous 232 by 204 footprint. Coordinates use approximate
ground-contact anchors from the oblique reference diagram. Heights,
facades, road widths and details not visible in the diagram are inferred; this
is not survey data or an architectural reconstruction. Building interiors are
not included. The custom mark is not the university's official seal.

## Preview and verify

From the `homecraft` directory, run:

```powershell
python tools/serve.py 4175
```

Open the printed HTTP URL. Double-clicking `index.html` does not load ES modules.
With Node.js 22+ and the development dependencies installed, run in another terminal:

```powershell
npm run check
npm run check:campus
```

The campus check verifies non-overlapping building/road footprints, connected
walking routes from the entrance, all location cards, directory search, real
building clicks on desktop and touch devices, walking, the map and weather.
Screenshots are saved in the ignored `tools/.check/` directory. The generic
check reports draw calls and triangle counts. Software-rendered browser frame
times are not a measurement of phone GPU performance.

## Edit the campus

| File | Purpose |
| --- | --- |
| `places.js` | Stable place ids, Chinese/English names, regions, footprints, heights, entrance points and descriptions |
| `reference-layout.js` | Reference projection, irregular campus parcels, bounds and road geometry helpers |
| `layout.js` | World bounds, spawn, opening views and engine stations |
| `build.js` | Batched architecture, trees, street furniture, collisions and roof surfaces |
| `architecture.js` | Building families, multi-part massing, facade windows, entrances, roof equipment, stadium and gates |
| `environment.js` | Varied trees, planted seating, pergola, bicycle shelters, vehicles, fences, goals, hoops and baked street lights |
| `details-layout.js` | Shared positions for parking, bicycle shelters and their ground markings |
| `signage.js` | One texture atlas and mesh for facade names and wayfinding plaques |
| `ground-art.js` | Shared procedural roads, squares, sports fields and minimap footprints |
| `labels.js` | Single-atlas place labels; major places remain visible from the overview |
| `navigation.js` | Coarse A* for long routes, with every edge checked against the engine collision grid |
| `pages.js` | Place cards, direct building selection, overview and searchable directory |
| `campus.css` | Campus interface and responsive overrides for the original HUD |
| `stories.js` | Place introductions and personal memories supplied by the owner |

Keep place ids stable when correcting names or coordinates. They connect the
geometry, cards, stations and stories. A building uses a rectangular footprint;
`x` increases east and `z` increases south. `h` is its approximate height.
An entrance `at: [x, z]` must remain outside building footprints. The tests catch
blocked or unreachable entrances. The campus uses the original engine without
source edits, so future upstream engine updates remain reviewable.

## Reference layout

`reference-layout.js` approximates the ground projection with
`u = 900 + 2 * (x - z)` and `v = 630 + x + z`. Each place retains its source
pixel anchor in `reference: [u, v]`; the anchor estimates the building base,
not the elevated roof label. This supports repeatable corrections against the
same image without rearranging buildings into an unrelated rectangular grid.
Widths, depths and heights remain inferred. The world units are scene meters,
not verified physical campus dimensions.

The west research buildings follow the road in a separate parcel; both tracks
run along the north-south world axis. Basketball courts sit between the tracks,
three tennis courts sit east of the southern track, and the main stadium and
smaller memorial hall occupy the southern sports zone. The southeast teaching,
art, energy, computing and training buildings form separate groups. Curved and
angled perimeter roads follow the irregular outline. Roads, field markings,
fences, entrances, the map and opening cameras use the same layout sources.

Long walking paths use a 2 m A* grid and validate each edge at 20 cm intervals
against the original engine navigation grid. Short routes and narrow passages
retain the engine search. Camera clearance scales with the enlarged overview
so the northern campus and the portrait view remain visible in the fog model.

## Detail model

The detailed version uses 113 structural parts for the 43 buildings. Libraries
have separate wings and a lower glazed atrium; the materials building has an
open U-shaped ground-level courtyard; research towers have podiums and
setbacks; residences have stairwell glazing, service balconies and condenser
housings. Roofs include parapets, access housings, vents, skylights and selected
solar panels. Structural roof surfaces follow these parts instead of retaining
the original invisible full-height box. The stadium uses an elliptical dome
with an analytic collision/landing surface, a central skylight and radial seams.

Environmental additions include varied tree crowns, flower planters, slatted
benches, a pergola, covered bicycle racks, parked cars, waste bins, gate booths,
barriers, court fences, tennis nets, football goals, bleachers and basketball
equipment. Painted paving, garden paths, parking bays and field markings share
the same layout data as their geometry. Courtyard furniture, solar panels and
other small details are artistic approximations, not claims about surveyed
campus facilities. Roof equipment is decorative; the underlying structural
terraces provide the walkable surface. Entrances remain exterior representations.

Facade and wayfinding signs share one atlas. Architecture and planting use
instanced box batches; court nets share one cutout mesh and bicycle wheels one
instanced mesh. No frame-time animations or real-time lights were added. New
fences have collision bounds with open court entrances. The campus check samples
every structural part for roof height, ray picking and landing agreement, and
checks that both fenced sports areas remain accessible.

## Add a place story

Add entries to the exported `STORIES` object in `stories.js`, keyed by the place
id from `places.js`. The production object is intentionally empty until the
owner supplies the content. This example is a schema, not a published memory:

```js
export const STORIES = {
  library: {
    intro: 'Owner-provided introduction.',
    entries: [
      {
        title: 'Owner-provided title',
        date: '2026-11', // Optional display text; an exact date is not required.
        paragraphs: ['First paragraph.', 'Second paragraph.'],
        photos: [
          { src: 'assets/memories/library-01.webp', caption: 'Photo caption.' },
        ],
      },
    ],
  },
};
```

Text is rendered as escaped text. Multiple stories and photos can be attached
to each place. Photos load lazily when its card opens; use optimized WebP or JPEG
images and descriptive captions. Paths are relative to the site's deployment
directory, so `assets/...` also works under `/campus/`. A new backend is not
required. Changes are edited in source and published with the static site;
there is no visitor editing, upload form, or persistence API.

## Deployment boundary

Keep the current personal website and its production configuration unchanged
until the actual hosting configuration is provided. This directory can be
served at `/campus/` or its own origin with the same relative imports. Upload
`index.html`, `homecraft.json`, `home.config.js`, `world/`, `engine/`, `vendor/`
and `assets/` together. Include both the original engine assets and the custom
campus assets. No Node.js server is needed in production. Preserve upstream
license notices and the built-in Homecraft/BetterMapIt attribution.

The served reference image lives at `assets/campus-reference.jpg`; the original
`bjut.jpg` remains the source reference. If the diagram is replaced, update both
and review footprints manually. Static deployments do not generate models from
new images automatically. See `../../deploy/HOMECRAFT.md` for subtree updates.
