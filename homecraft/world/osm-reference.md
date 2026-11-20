# Campus map reference and derived outline data

Reviewed on 2026-11-19:

- [Mapcarta: Beijing University of Technology](https://mapcarta.com/W33617299)
- [OSM campus boundary, way 33617299](https://www.openstreetmap.org/way/33617299)
- [Earthol satellite reference](https://www.earthol.com/fun-1-school-bjpu.html)

Mapcarta identifies OpenStreetMap as its geometry source. OSM data was obtained
from the public OSM API for an area around the campus. Raw reference downloads
and the comparison overlay remain in the ignored `tools/.check/` directory.
Earthol imagery was inspected visually; tiles and screenshots from that service
are not redistributed as project assets.

## Attribution and license

Outline data is © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
licensed under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
The adapted outline dataset in [osm-footprints.js](osm-footprints.js) is also
made available under ODbL 1.0. The site's overview card links to the attribution,
license and downloadable adapted data. This data license is separate from the
project's code license. Keep this notice with copies of the dataset.

## Adaptation

Each `outline` stores points in a local 0–1 rectangle, x east and z south.
Source way ids and versions are retained. Source longitude/latitude extrema
were normalized independently per building. Near-equal coordinate runs within
3.5% of a building's extent were clustered to remove small digitization skew;
collinear vertices were removed. `architecture.js` partitions these orthogonal
polygons into non-overlapping structural rectangles. Those same rectangles
provide building rendering, collision, roof landing surfaces, clicks and map
footprints. The screenshot anchors and outer dimensions remain authoritative
for scene placement. Normalization can distort physical proportions.

| Scene id | OSM source way |
| --- | --- |
| first-teaching | [543815688](https://www.openstreetmap.org/way/543815688) |
| information | [543815690](https://www.openstreetmap.org/way/543815690) |
| applied-science | [543815691](https://www.openstreetmap.org/way/543815691) |
| management | [442376435](https://www.openstreetmap.org/way/442376435) |
| science | [320605372](https://www.openstreetmap.org/way/320605372) |
| student-9 | [442376433](https://www.openstreetmap.org/way/442376433) |
| computing | [442376462](https://www.openstreetmap.org/way/442376462) |
| technology | [442376459](https://www.openstreetmap.org/way/442376459) |
| water-environment | [1047352413](https://www.openstreetmap.org/way/1047352413) |
| civil-west | [1047352415](https://www.openstreetmap.org/way/1047352415) |
| mechanical | [1047352414](https://www.openstreetmap.org/way/1047352414) |
| library (reference only) | [839812059](https://www.openstreetmap.org/way/839812059) |

Matching used physical footprint/location, not automatic name matching. Some
OSM labels conflict with the owner-provided plan; the table documents geometry
sources, not a verification of each current building name. Library's OSM outline
is too coarse to describe roof setbacks, so its rendering uses manually
approximated stepped blocks instead. Third Teaching's internal courts and the
stadium axis are visual approximations from the supplied map references.

No absolute WGS84-to-Baidu/Google coordinate conversion was applied. Building
heights, windows, entrances, furnishings and most roof equipment are artistic
approximations. Source age and detail vary; this is not a measured campus model.
