# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Build & structure

Vite project (`vite.config.js`, `package.json`): `npm install && npm run dev` for local dev, `npm run build` for a production build in `dist/`. Three.js is an npm dependency (`import * as THREE from "three"` in `src/app.js`), no CDN script tag.

- `src/app.js` / `src/data.js` — app logic and data, both ES modules (`import`/`export`).
- `public/` — static assets (textures, media) served as-is at the site root; referenced in `src/data.js` via `` `${import.meta.env.BASE_URL}textures/...` `` so paths resolve correctly under the GitHub Pages subpath.
- `vite.config.js` sets `base: "/solar-system-sim/"` to match the GitHub Pages URL (`https://devniall.github.io/solar-system-sim/`). If the Pages URL/repo name ever changes, update `base` here.
- Deployment: `.github/workflows/deploy.yml` builds with Vite and publishes `dist/` via `actions/deploy-pages`. Requires the repo's Pages source to be set to "GitHub Actions" (not "Deploy from a branch") in repo settings.
- Moon data model: `src/app.js` builds `moonPivots`/`moonMeshes` per planet from `p.moons` (array; legacy singular `p.moon` still accepted) in `src/data.js`. Moon pivots are parented to the planet mesh, so a moon's on-screen orbit rate is planet `rotationSpeed` + moon `orbitSpeed`, and moons ride the planet's axial tilt (i.e. they orbit in its equatorial plane). Adding a moon is data-only. Moons are not clickable/selectable — per-moon facts live in the parent planet's `facts` array, which the info panel and quiz already surface.
- **Orientation (axial tilt / orbital inclination) is the one thing in this sim that is NOT exaggerated** — real degree values, applied at full strength. The rules and the reasoning are in the "AXIAL TILT AND ORBITAL INCLINATION" block in `src/data.js`'s header; read it before touching `axialTilt`, `orbitalInclination`, `ascendingNode`, or `rotationSpeed`. The one trap: obliquity > 90° (Venus, Pluto) already produces retrograde spin, so those bodies' `rotationSpeed` must stay positive.
- Transform chain per body in `src/app.js` (`PLANETS.forEach`): `orbitGroup` (YXZ: node on Y, inclination on X, static — carries the orbit ring too) → `pivot` (orbital angle on Y, rewritten each frame) → `axisGroup` (YXZ: `-angle` on Y to cancel the pivot, obliquity on X, so the spin axis stays fixed in the orbital frame like a real one) → `mesh` (day/night spin on Y). Rings and the faint pole-to-pole axis guide line hang off that tilted frame, which is why Saturn's/Uranus' rings tip correctly for free.
- **The visual distance scale is documented in the header comment of `src/data.js`** — a table of every body's real AU vs. visual `distance`, plus the two clearance constraints (outermost moon must fit inside the gap to the neighbouring orbit; the asteroid belt must clear both Mars' moons and Jupiter's). Read it before changing any `distance`, `radius`, or `ASTEROID_BELT` radius; the gaps around Jupiter and Saturn exist specifically to fit their moon systems.
- Adding a body is data-only: any `PLANETS`-shaped entry automatically gets an orbit ring, click-to-select, the info panel, guided-tour inclusion (array order = tour order = distance order), quiz flashcards, and `?body=<key>` deep linking. Dwarf planets (Ceres, Pluto) are just `PLANETS` entries with `dwarf: true`; that flag exists **only** so `src/quiz.js` can exclude them from "which *planet* is the smallest/slowest..." superlatives. Optional `orbitInclination` (radians) tilts the body's whole orbit group.
- Asteroid belt: one `THREE.Points` cloud built by `buildAsteroidBelt()` in `src/app.js` from the `ASTEROID_BELT` config in `src/data.js`, spun as a single rigid object in the animation loop. It is decorative — do not turn it into per-asteroid simulated bodies.
- Whole-system framing (startup view, Reset View, the "Tour complete" pull-back) derives from `OVERVIEW_DISTANCE` in `src/app.js`, computed from the outermost orbit, so retuning the distance scale reframes the camera automatically.
- Quiz mode: `src/quiz.js` (`generateQuizQuestions`) derives flashcard Q&A pairs from `stats`/`tagline`/`facts` on `SUN`/`PLANETS` in `src/data.js` — it's purely data-driven, so new stat fields or facts automatically produce more flashcards without touching quiz code. UI wiring (button, modal, reveal/next/exit) lives in `src/app.js` near the end, using `#quizModal` markup/styles in `index.html`. It's an additive, unscored flashcard flow — no points/streaks — and doesn't touch tour/camera/info-panel state.
- Deep-linkable selection: `setUrlBody`/`getUrlBody` in `src/app.js` sync the selected body to a `?body=<key>` query param via `history.replaceState` (no pushState, so it doesn't clutter back-button history) and `selectPlanet` is called once on startup if the URL already encodes a body. Only explicit user selection writes the URL; tour playback and manual camera drag/zoom never touch it.
- Camera controls (`src/app.js`, near "Custom orbit/pan/zoom camera controls") are hand-rolled spherical-coordinate orbit/pan/zoom with both mouse (`mousedown`/`mousemove`/`wheel`) and touch (`touchstart`/`touchmove`/`touchend`) listeners on `renderer.domElement`. Touch supports single-finger orbit, two-finger pinch-zoom, and tap-to-select; two-finger pan is intentionally not implemented (pinch is the only two-finger gesture) to avoid gesture-disambiguation complexity. Tap/click selection logic is shared via `selectAtScreenPoint(clientX, clientY)`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
