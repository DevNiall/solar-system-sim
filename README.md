# Solar System Simulator

A dependency-light, WebGL solar system visualizer built with [Three.js](https://threejs.org/) (loaded via CDN, no build step). Designed as an educational tool for high-school-level astronomy: explore the Sun and all eight planets, click on any body for real facts, and take a guided cinematic tour of the whole system.

## Running locally

No build step is required. Because the app loads `data.js` and `app.js` as separate scripts, you must serve the files over HTTP (opening `index.html` directly via `file://` will be blocked by the browser's script-loading/CORS rules in some browsers). The simplest options:

```bash
# Python 3 (built into most systems)
python3 -m http.server 8000

# or Node, if you have it
npx serve .
```

Then open `http://localhost:8000/` in Chrome.

## Features

- Sun + all 8 planets (Mercury–Neptune), each with distinct color/size, orbiting at different relative speeds.
- Earth's Moon, orbiting Earth, and Saturn's rings.
- Starfield background.
- Free camera controls: left-drag to orbit, right-drag to pan, scroll to zoom.
- Click any body to open an info panel with real astronomical facts (diameter, day/year length, moons, fun facts).
- **Guided tour**: click "Start Tour" to fly smoothly from the Sun out through every planet in order, pausing at each to show its facts. Use the tour bar to go to the Previous/Next stop, Pause/Resume, or Exit back to free exploration at any time.
- "About this simulation" panel explaining the scale tradeoffs (see below).

## Deliberate scale/accuracy tradeoffs

This simulator intentionally is **not to scale**, and says so in the UI:

- **Planet sizes** are exaggerated (especially the smaller inner planets) relative to the Sun so they remain visible — in reality the Sun is ~109x Earth's diameter, which would render most planets as invisible specks.
- **Orbital distances** use a compressed, roughly logarithmic layout so the whole system (Mercury through Neptune) fits in one viewport without needing the camera to travel astronomical (pun intended) distances.
- **Orbital speeds** preserve the *relative* ordering from real physics (inner planets orbit much faster than outer ones, consistent with Kepler's third law) but are scaled up dramatically for visible motion — they are not in true proportion to each other beyond ordering/relative ratios.
- Axial tilts, orbital inclinations, and most moons (beyond Earth's) are simplified or omitted for clarity.

All non-geometric facts presented in the info panels (diameters, day/year lengths, moon counts, and other details) are real, drawn from published NASA/JPL data.

## Project structure

- `index.html` — page markup, UI panels (info panel, tour bar, about modal), and CDN script tags.
- `data.js` — Sun/planet/moon data: visual parameters (color, compressed size/distance/speed) and real astronomical facts.
- `app.js` — Three.js scene setup, custom camera controls (orbit/pan/zoom), raycasting/selection, and the guided tour state machine.

No bundler, package manager, or build step is involved — just static files and a pinned Three.js CDN version (`three@0.160.0`).
