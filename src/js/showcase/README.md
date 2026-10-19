# Civic Type R showcase

Entry: `/3d-showcase`, `3d-showcase.html`, `src/js/pages/showcase.js`.
Run `npm run dev`; production build: `npm run build`.

## Asset and accuracy

The scene now loads a Blender-authored GLB through `car-asset.js`. The old
procedural browser car has been removed. This remains a photographic reference
study, **not an accurate 1:1 replica or manufacturer CAD**. Body surfaces, panel
joins and cabin fittings still need replacement or substantial refinement to
meet the requested fidelity. Reference dimensions alone do not establish accuracy.

- Editable source: `assets/showcase/civic-type-r-fl5.blend`
- Rebuild script: `scripts/blender/build-civic.py`
- Runtime mesh: `public/models/civic-type-r/civic-type-r-fl5.glb`
- Geometry statistics: `public/models/civic-type-r/model-info.json`

Run Blender with `--background --factory-startup --python scripts/blender/build-civic.py`.
The script rebuilds the source and Draco-compressed GLB and renders a local
preview in `.shots/civic-assets/`. The GLB is approximately 0.75 MB; its local
WASM decoder and wrapper are in `public/draco/` with the Apache 2.0 licence.
The current geometry has roughly 263,000 triangles. Transfer size is small,
but performance still needs testing on physical phones.

The car faces +Z with +Y up; the right hand driver sits at negative X.
Paint, glass, wheels, steering and wipers retain separate materials or rigs.
`car-asset.js` adds surface grain and live canvas dashboard textures.
`scene.js` loads a local 1K studio HDR after the mesh, with a generated room
environment available immediately. The HDR is Studio Small 03 by Greg Zaal,
from Poly Haven under CC0; attribution is in `public/environments/LICENSE.txt`.

## Interaction and lifecycle

`scene.js` owns exterior orbit, bounded cabin head movement, camera transitions,
lighting, animation and cleanup. `world.js` owns the road, instanced scenery,
rain particles and floor. Desktop reflections use a 1024px planar reflector;
mobile uses the PBR floor. Render density is capped at 1.35 on mobile and 1.75
on desktop. Shadow maps use 1024px and 2048px respectively.

`rain.js` accumulates droplets on a windscreen surface. Moving wipers clear
the sectors between their previous and current angles. The windscreen surface
and rig pivots must be realigned if replacing the mesh. Tint approximates
opacity using VLT; it is not a calibrated optical simulation. Driving is a
scenic animation, not a vehicle physics model.

Idle rendering, visibility handling, reduced motion, loading failures and
WebGL context loss are handled in the scene and page controller. The mobile
viewer stays visible while the controls scroll.

## Sources and verification

Honda reference dimensions: https://www.honda.com.my/model/type-r/spec

The user supplied https://github.com/alphardex/su7-replica as an experience
reference. No code or assets were copied because no licence was present in
the reviewed repository. No third-party Civic mesh has been incorporated.
Local webfonts have their OFL licences in `public/fonts/showcase/`.

The browser regression scripts in `scripts/check-showcase*.mjs` were written
for the original scene. They have not been rerun against this GLB revision.
Current browser spot checks cover model loading, paint and rainy night driver
view; passing those checks does not certify visual accuracy or phone performance.
Development-only `window.__showcase` inspection is stripped from production.
