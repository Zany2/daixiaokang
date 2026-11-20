# BJUT campus world

This is a static, outdoor campus diorama based on the owner's three images and
reviewed against the supplied Mapcarta and Earthol map pages:
`1.png` and `2.png` provide the north-up ground plan, and `bjut.jpg` provides
building appearance and approximate heights. There are 64 places, including
49 buildings, five gates, two tracks, two basketball areas, tennis courts,
Moon Lake, gardens and squares. The navigation bounds are 1,240 by 960 scene
meters; these include the west research parcel and a margin around the campus.
The previous scene covered 576 by 460 scene meters.

Dimensions are estimates from the screenshot scale bar, not survey data.
Facades, heights, entrances and some names remain approximate. The screenshots
do not cover the west research parcel, so its layout comes from the illustrated
map. Building interiors are not included. The custom mark is not an official seal.

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
| `osm-footprints.js` / `osm-reference.md` | ODbL reference outlines and provenance; no runtime map requests |
| `stadium-shape.js` | Shared rotated stadium profile for render, collision, roofs and map |
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
geometry, cards, stations and stories. A building has a rectangular outer bound with compound structural parts;
`x` increases east and `z` increases south. `h` is its approximate height.
An entrance `at: [x, z]` must remain outside building footprints. The tests catch
blocked or unreachable entrances. The only engine customization is `engine/ui/minimap.js`: it caps the map
backing image at 2,048 pixels per side and suppresses overlapping markers.
Preserve this intentional change when reviewing future upstream updates; the
official release manifest remains unchanged.

## Reference layout

The screenshots overlap. Matching their shared region gives an offset of
`[-62, 451]`: pixel `(u, v)` in `2.png` becomes `(u - 62, v + 451)` in the
coordinate system of `1.png`. The 50 m bar measures approximately 68 pixels.
`reference-layout.js` uses `x = (u - 650) * 50 / 68` and
`z = (v - 650) * 50 / 68`, snapped to quarter-meter coordinates. North points
toward negative z. Place anchors and footprint dimensions use this plan, rather
than inverting the illustrated map's oblique perspective.

The shared sources include the irregular boundary, roads, east green belt,
park paths, lake shoreline, court cells and football pitches. The render,
minimap, collision surfaces, navigation and checks use the same geometry.
The main library and computing area are west of the south track; the teaching
and residence blocks follow the north and central road grid. The two tracks
remain separate north-south ovals. North basketball courts lie between them;
tennis courts lie east of the south track; the second basketball area lies
south of it. The stadium occupies the southern parcel, while Moon Lake and
the east gardens follow the curved eastern edge.

Original ids remain stable so future stories keep their links. Labels have
been corrected where the screenshots and diagram agree (for example the
International Exchange Center and Yifu Library). Some labels from the earlier
world remain provisional until the owner supplies more detailed information.
The west-side library building is explicitly named by location rather than
claiming a verified use. Footprints have been simplified into rectangles or
courtyard wings where the screenshots do not support finer measurements.

`assets/campus-plan.webp` is a compressed, aligned copy of the two Baidu
screenshots for the reference card. It is loaded on demand. Original images
remain unchanged. No map service, API key or online tile request is required.

Long walking paths use a 2 m A* grid and validate each edge at 20 cm intervals
against the original engine navigation grid. Short routes and narrow passages
retain the engine search. Overview cameras and fog clearance cover the new
bounds on desktop and mobile. The surrounding ground prevents an artificial
coastline appearing when viewing the campus from far above.

## Detail model

The detailed version uses 137 structural parts for the 49 buildings. Yifu
Library has a broad stepped reading block and a raised rooflight. Third Teaching
has four cross wings, three roof courts and elevated southern connections,
with clear ground passages. Other teaching and research buildings have
open U-shaped ground-level courtyards; research towers have podiums and
setbacks; residences have stairwell glazing, service balconies and condenser
housings. Roofs include parapets, access housings, vents, skylights and selected
solar panels. Structural roof surfaces follow these parts instead of retaining
the original invisible full-height box. The main stadium uses a diagonally aligned elliptical dome with matching
analytic collision/landing and map geometry, a central skylight and radial seams.

Environmental additions include varied tree crowns, flower planters, slatted
benches, a pergola, covered bicycle racks, parked cars, waste bins, gate booths,
barriers, court fences, tennis nets, football goals, bleachers and basketball
equipment. Painted paving, garden paths, parking bays and field markings share
the same layout data as their geometry. Courtyard furniture, solar panels and
other small details are artistic approximations, not claims about surveyed
campus facilities. Roof equipment is decorative; the underlying structural
terraces provide the walkable surface. Entrances remain exterior representations.

Facade windows share one colored quad mesh, with physical cornices, selected
projecting sills and stairwell glazing. This avoids full cubes for thousands
of repeated panes. Facade and wayfinding signs share one atlas. Architecture and planting use
instanced box batches; court nets share one cutout mesh and bicycle wheels one
instanced mesh. No real-time lights were added. Labels use a shared atlas, pixel-sized quads
and a throttled, allocation-free screen-space collision pass. Atlas capacity
expands when places are added. Overview framing follows the camera aspect
ratio and refits after resizing. Building selection follows structural parts
and stadium meshes rather than empty courtyard bounding boxes. New
fences have collision bounds with open court entrances. The campus check samples
every structural part for roof height, ray picking and landing agreement, and
checks that all three fenced court areas remain accessible, every footprint
fits inside navigation bounds, open courtyards remain reachable and
walking routes avoid the ornamental lake. The lake is static scenery and does
not use the engine swimming system. The overview reports about 183,000 triangles
and 30 draw calls on the local software-rendered checks, within the 200,000 / 60
budget. Browser frame times are not real-phone GPU measurements.

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

## Map-source review (2026-11-19)

The owner supplied Mapcarta way W33617299 and Earthol's BJUT satellite map.
Public OSM geometry was retrieved once for inspection; no map service, key,
or network request is needed while the site runs. See [osm-reference.md](osm-reference.md)
for the ODbL attribution, individual source ways, transformations and limitations.
Eleven building envelopes use normalized orthogonal OSM outlines fitted to the
existing screenshot anchors. Yifu Library and Third Teaching use manually
approximated massing after visual review of the plan and satellite roofs.

OSM names and footprint detail differ from the owner's plan in several places.
Names were not imported automatically. Raw WGS84 coordinates were not mixed
with Baidu/Google map coordinates. This remains an approximate diorama, not a
surveyed or photogrammetric reconstruction. The west parcel's placement and
heights, all facades and roof equipment remain estimates.

The campus check also verifies real clicks on an empty courtyard and a built
wing, the three Third Teaching courtyard passages, non-overlapping overview
labels, bounded map-canvas size and world-to-image coordinate agreement.
It captures 320x1000 and 844x390 resize views in addition to desktop and mobile.

The campus command also runs stadium ray-intersection unit tests. The browser
check compares 12 off-center samples on each stadium against its rendered roof
mesh and camera obstruction distance, checks a real side wall, and verifies
that the empty corners of the rotated outer rectangle do not block the camera.
Camera obstruction uses the rotated cylinder and upper dome rather than the
rectangular broad-phase bounds. This fixes premature camera pull-in while
walking around the stadium's open corners.
Short landscape displays use a compact header, toolbar, start button and radar.
The resize checks also reject overlapping overview controls and browser console
errors, including shader failures.
The overview-to-walking return keeps fog clearance and the camera far plane
based on the actual camera distance until descent finishes. The held-shot flag
turns off before the return animation ends; using that flag alone would briefly
clip the campus out of view. The browser check samples the complete descent
on desktop and mobile and verifies that the camera reaches its walking position.
The upper-left panel groups campus identity and two external links: the owner's
personal site and BJUT's official homepage. Both open in a new tab. The three
map tools remain in a separate row below. Portal controls are hidden by the
campus stylesheet, including when the engine moves them inside a location
dialog; shared portal code and attribution remain intact.

## Multiplayer and chat

`home.config.js` enables multiplayer with `multiplayer.enabled`, room `bjut`,
and an optional `multiplayer.endpoint`. An empty endpoint uses
`wss://<current-origin>/api/campus/ws` on HTTPS deployments, including `/campus/`.
Localhost previews use `ws://127.0.0.1:8000/api/campus/ws`; start the existing
FastAPI backend and allow the preview origin in `CAMPUS_ALLOWED_ORIGINS`.

The client joins automatically after the scene loads, announces the room count,
and assigns a random guest nickname retained in session storage. Nicknames appear
above visible avatars; internal server IDs are not used as display names.
The minimap and full map show colored markers for all known remote players.
To keep rendering bounded, only the nearest 48 visitors within 180 meters have
3D avatars; overhead labels are further limited to 160 meters from the camera.
The room admission limit is not a guarantee of 1,024-player rendering throughput.

Press Enter to focus the upper-left chat or use its input directly. Keyboard
movement is suspended while typing. Messages accept up to 200 Unicode code
points, render as plain text, and appear in three-second speech bubbles.
The chat list has a fixed, viewport-bounded height and a reserved vertical
scrollbar. New messages follow the bottom only when already near it; reading
older messages preserves the scroll position, including when the oldest row expires.
Collapsing the panel preserves the reading anchor. Visitors following the newest
message stay at the bottom after expanding it or changing screen orientation.
Only the latest 100 messages received by this page are kept in memory; refresh clears
them. There is no server chat history, storage, or replay. Full rooms switch to
single-player roaming without automatically reconnecting; a manual retry is
available. Network interruptions retry with bounded exponential backoff.

Run `npm run test:network` for protocol-client regression tests. Production
requires the existing backend WebSocket route and an Nginx WebSocket proxy;
upload the rebuilt `dist/` after changing the client.
