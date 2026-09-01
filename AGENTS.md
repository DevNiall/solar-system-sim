# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Build & structure

Vite project (`vite.config.js`, `package.json`): `npm install && npm run dev` for local dev, `npm run build` for a production build in `dist/`. Three.js is an npm dependency (`import * as THREE from "three"` in `src/app.js`), no CDN script tag.

- `src/app.js` / `src/data.js` — app logic and data, both ES modules (`import`/`export`).
- `public/` — static assets (textures, media) served as-is at the site root; referenced in `src/data.js` via `` `${import.meta.env.BASE_URL}textures/...` `` so paths resolve correctly under the GitHub Pages subpath.
- `vite.config.js` sets `base: "/solar-system-sim/"` to match the GitHub Pages URL (`https://devniall.github.io/solar-system-sim/`). If the Pages URL/repo name ever changes, update `base` here.
- Deployment: `.github/workflows/deploy.yml` builds with Vite and publishes `dist/` via `actions/deploy-pages`. Requires the repo's Pages source to be set to "GitHub Actions" (not "Deploy from a branch") in repo settings.
- Moon data model: `src/app.js` builds `moonPivots`/`moonMeshes` arrays per planet from `p.moons` (array) or the legacy singular `p.moon` object in `src/data.js`, so adding more moons per planet doesn't require another refactor.
- Quiz mode: `src/quiz.js` (`generateQuizQuestions`) derives flashcard Q&A pairs from `stats`/`tagline`/`facts` on `SUN`/`PLANETS` in `src/data.js` — it's purely data-driven, so new stat fields or facts automatically produce more flashcards without touching quiz code. UI wiring (button, modal, reveal/next/exit) lives in `src/app.js` near the end, using `#quizModal` markup/styles in `index.html`. It's an additive, unscored flashcard flow — no points/streaks — and doesn't touch tour/camera/info-panel state.
- Deep-linkable selection: `setUrlBody`/`getUrlBody` in `src/app.js` sync the selected body to a `?body=<key>` query param via `history.replaceState` (no pushState, so it doesn't clutter back-button history) and `selectPlanet` is called once on startup if the URL already encodes a body. Only explicit user selection writes the URL; tour playback and manual camera drag/zoom never touch it.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
