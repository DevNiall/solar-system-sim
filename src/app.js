// Solar System Simulator — main application logic.
// THREE is imported as an ES module (npm dependency); SUN / PLANETS data
// come from data.js (also an ES module).

import * as THREE from "three";
import { TEXTURES, SUN, PLANETS, ASTEROID_BELT } from "./data.js";
import { generateQuizQuestions, shuffle } from "./quiz.js";

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Renderer / Scene / Camera setup
  // ---------------------------------------------------------------------
  const container = document.getElementById("app");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.insertBefore(renderer.domElement, container.firstChild);

  const scene = new THREE.Scene();

  // How far back the camera sits for a whole-system overview: the startup
  // view, the "Tour complete" pull-back, and the Reset View button all use it.
  // Derived from the outermost orbit rather than hardcoded so it keeps framing
  // the system if the distance scale in data.js is retuned again. The 1.7
  // factor leaves margin for the inclined orbits — Pluto's real 17.2° tilt in
  // particular carries it far out of the ecliptic plane at this scale.
  const OUTERMOST_ORBIT = PLANETS.reduce((max, p) => Math.max(max, p.distance), 0);
  const OVERVIEW_DISTANCE = Math.round(OUTERMOST_ORBIT * 1.7);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  // Same distance as OVERVIEW_DISTANCE, looking down on the ecliptic at ~24°.
  camera.position.set(0, OVERVIEW_DISTANCE * 0.41, OVERVIEW_DISTANCE * 0.912);

  // ---------------------------------------------------------------------
  // Texture loading helper (graceful fallback to solid colors on failure)
  // ---------------------------------------------------------------------
  const textureLoader = new THREE.TextureLoader();

  // Applies a texture asynchronously to a material property (e.g. "map").
  // The material's base `color` is set by the caller beforehand, so if the
  // texture fails to load (404, offline, unsupported format, etc.) the mesh
  // simply keeps showing its solid fallback color — no crash, no broken look.
  function applyTexture(url, material, mapKey, colorManaged) {
    if (!url) return;
    textureLoader.load(
      url,
      (tex) => {
        if (colorManaged && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        material[mapKey] = tex;
        material.needsUpdate = true;
      },
      undefined,
      () => {
        console.warn("[textures] failed to load, falling back to solid color:", url);
      }
    );
  }

  // ---------------------------------------------------------------------
  // Starfield background
  // ---------------------------------------------------------------------
  function buildStarfield() {
    const starCount = 4000;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // distribute on a large sphere shell so stars stay behind everything
      const radius = 400 + Math.random() * 500;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.1,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(geo, mat);
    scene.add(stars);
  }
  buildStarfield();

  // Milky way skybox: a large inverted sphere textured with a real starfield
  // photo, sitting behind the procedural point-star field for extra depth.
  // Falls back to plain black (already the page background) if it fails.
  function buildSkybox() {
    if (!TEXTURES.starsMilkyWay) return;
    const geo = new THREE.SphereGeometry(900, 48, 32);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x666666 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    applyTexture(TEXTURES.starsMilkyWay, mat, "map", true);
    // once textured, let it show at full brightness rather than tinted
    mat.color.set(0xffffff);
  }
  buildSkybox();

  // ---------------------------------------------------------------------
  // Asteroid belt
  //
  // Built the same way as the starfield above — one procedurally-filled
  // BufferGeometry rendered as a single THREE.Points — but scattered through a
  // flat annulus between Mars and Jupiter instead of a sphere shell. This is a
  // decorative field, NOT a set of individually simulated bodies: the whole
  // cloud is one object that we spin slowly about Y, so a thousand-plus
  // asteroids cost one draw call and no per-body work in the animation loop.
  // Ceres is the one belt object modelled for real, as a PLANETS entry.
  // ---------------------------------------------------------------------
  let asteroidBelt = null;

  // PointsMaterial draws square sprites by default, which reads fine as a
  // distant dusty band but looks like a field of floating cubes once the tour
  // (or a click on Ceres) puts the camera inside the belt. This canvas-drawn
  // soft disc is used as the material's map so each particle is a round rock.
  // alphaTest (rather than plain alpha blending) keeps depth writes on, so
  // particles occlude each other and get correctly hidden behind planets.
  function buildAsteroidSpriteTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.7, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  function buildAsteroidBelt() {
    const belt = ASTEROID_BELT;
    if (!belt) return;

    const count = belt.count;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = belt.colors.map((c) => new THREE.Color(c));
    const mid = (belt.innerRadius + belt.outerRadius) / 2;
    const halfWidth = (belt.outerRadius - belt.innerRadius) / 2;

    for (let i = 0; i < count; i++) {
      // Averaging two uniform samples gives a triangular distribution peaked
      // at the belt's mid-radius, so it thins out towards both edges rather
      // than stopping at a hard line — much closer to how the real belt looks.
      const spread = (Math.random() + Math.random() - 1) * halfWidth;
      const radius = mid + spread;
      const theta = Math.random() * Math.PI * 2;
      // Same trick vertically, and thinner near the edges of the annulus so
      // the field reads as a flattened torus rather than a flat washer.
      const edgeFalloff = 1 - Math.abs(spread) / halfWidth;
      const y = (Math.random() + Math.random() - 1) * belt.thickness * edgeFalloff;

      positions[i * 3] = Math.cos(theta) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * radius;

      const c = palette[(Math.random() * palette.length) | 0];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: belt.particleSize,
      sizeAttenuation: true,
      vertexColors: true,
      map: buildAsteroidSpriteTexture(),
      transparent: true,
      alphaTest: 0.4,
    });
    asteroidBelt = new THREE.Points(geo, mat);
    scene.add(asteroidBelt);
  }
  buildAsteroidBelt();

  // ---------------------------------------------------------------------
  // Lighting
  // ---------------------------------------------------------------------
  const ambient = new THREE.AmbientLight(0x404060, 1.2);
  scene.add(ambient);

  const sunLight = new THREE.PointLight(0xffffff, 2.2, 0, 0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  // ---------------------------------------------------------------------
  // Sun (textured, with a glow sprite standing in for bloom postprocessing)
  // ---------------------------------------------------------------------
  const sunGeo = new THREE.SphereGeometry(SUN.radius, 48, 48);
  const sunMat = new THREE.MeshBasicMaterial({ color: SUN.color });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  // The Sun has an axial tilt too (7.25° to the ecliptic). Euler order XYZ
  // evaluates as Rx * Ry, so the fixed tilt on X stays outside the spin that
  // the animation loop accumulates on Y — the sphere spins about its tilted
  // axis rather than tumbling.
  sunMesh.rotation.x = (SUN.axialTilt || 0) * (Math.PI / 180);
  sunMesh.userData.isSelectable = true;
  sunMesh.userData.dataKey = "sun";
  scene.add(sunMesh);
  applyTexture(SUN.texture, sunMat, "map", true);

  // Soft volumetric-looking corona via a backside sphere...
  const glowGeo = new THREE.SphereGeometry(SUN.radius * 1.35, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: SUN.emissive,
    transparent: true,
    opacity: 0.22,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(glowGeo, glowMat));

  // ...plus a camera-facing radial-gradient sprite for a bloom-like glow.
  // This avoids needing the ES-module-only three.js postprocessing/EffectComposer
  // stack, keeping the app a plain <script> / no-build-step setup.
  function buildGlowSprite() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2
    );
    gradient.addColorStop(0, "rgba(255,240,200,0.9)");
    gradient.addColorStop(0.25, "rgba(255,210,120,0.55)");
    gradient.addColorStop(0.6, "rgba(255,170,60,0.18)");
    gradient.addColorStop(1, "rgba(255,140,40,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    const scale = SUN.radius * 6;
    sprite.scale.set(scale, scale, 1);
    scene.add(sprite);
  }
  buildGlowSprite();

  // ---------------------------------------------------------------------
  // Orbit ring helper
  // ---------------------------------------------------------------------
  function buildOrbitRing(distance) {
    const segments = 128;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * distance, 0, Math.sin(a) * distance));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x445077, transparent: true, opacity: 0.45 });
    return new THREE.Line(geo, mat);
  }

  // ---------------------------------------------------------------------
  // Saturn ring geometry with correct radial/angular UVs so the real ring
  // texture (a thin radial strip with transparency) maps cleanly.
  // ---------------------------------------------------------------------
  function buildRingGeometry(innerRadius, outerRadius) {
    const geo = new THREE.RingGeometry(innerRadius, outerRadius, 128, 1);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const v3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v3.fromBufferAttribute(pos, i);
      const radial = (v3.length() - innerRadius) / (outerRadius - innerRadius);
      const angular = (Math.atan2(v3.y, v3.x) + Math.PI) / (Math.PI * 2);
      // The ring texture's gradient runs along its width (U), with height (V)
      // being angle-invariant, so U must track radial distance and V the
      // angle — mapping it the other way makes the radial gradient repeat
      // once per angular segment, producing a banded/striped look.
      uv.setXY(i, radial, angular);
    }
    return geo;
  }

  // ---------------------------------------------------------------------
  // Spin-axis indicator: a faint line through a body's poles, living in its
  // tilted axisGroup so it points exactly along the real rotation axis.
  // Without it, axial tilt is invisible on smooth, near-featureless bodies
  // (Uranus is the worst case — a plain pale-cyan ball), which would hide the
  // single most striking real fact the tilt data encodes. Kept thin and
  // low-opacity so it reads as a guide line at a close-up and all but
  // disappears in the whole-system overview, and it is never added to the
  // raycast list so it can't intercept clicks meant for the planet.
  // ---------------------------------------------------------------------
  function buildAxisIndicator(radius) {
    const half = radius * 2.0;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -half, 0),
      new THREE.Vector3(0, half, 0),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x9fb6d8,
      transparent: true,
      opacity: 0.38,
    });
    return new THREE.Line(geo, mat);
  }

  // ---------------------------------------------------------------------
  // Build planets
  // ---------------------------------------------------------------------
  const planetObjects = []; // { data, orbitGroup, pivot, axisGroup, mesh, angle }

  const DEG = Math.PI / 180;

  PLANETS.forEach((p) => {
    // ORBITAL PLANE.
    // Every body hangs off an orbit group carrying its real orbital
    // inclination, so the orbit RING and the body itself are tilted together
    // and always agree. Two angles (both degrees in data.js):
    //   ascendingNode (Y) — which way round the Sun the orbit tips up
    //   orbitalInclination (X) — how far it tips
    // Euler order YXZ makes that read as Ry(node) * Rx(inclination): incline
    // the plane first, then swing the whole tilted plane round to its real
    // node longitude. Without the node term every orbit would hinge about the
    // same line, which looks like a folded fan rather than real planes.
    //
    // The tilt lives on this outer group rather than on the pivot because the
    // pivot's own rotation.y is rewritten every frame to advance the orbit —
    // combining both rotations on one Euler would make the plane wobble.
    const orbitGroup = new THREE.Object3D();
    orbitGroup.rotation.order = "YXZ";
    orbitGroup.rotation.y = (p.ascendingNode || 0) * DEG;
    orbitGroup.rotation.x = (p.orbitalInclination || 0) * DEG;
    scene.add(orbitGroup);

    orbitGroup.add(buildOrbitRing(p.distance));

    const pivot = new THREE.Object3D();
    orbitGroup.add(pivot);

    // AXIAL TILT.
    // The spin axis has to stay pointing the SAME WAY in the orbital frame all
    // year (that fixed lean is what causes seasons, and what makes Uranus look
    // like it is rolling rather than always pole-on to the Sun). But this group
    // sits inside `pivot`, which spins by the orbital angle, so it must undo
    // that: with Euler order YXZ its world rotation is
    //   Ry(angle) * Ry(-angle) * Rx(tilt) = Rx(tilt)
    // i.e. a constant lean, whatever point of the orbit the body is at.
    // rotation.y is refreshed each frame in the animation loop.
    const axisGroup = new THREE.Object3D();
    axisGroup.rotation.order = "YXZ";
    axisGroup.rotation.x = (p.axialTilt || 0) * DEG;
    axisGroup.position.set(p.distance, 0, 0);
    pivot.add(axisGroup);

    // Added to the axisGroup (not the mesh) so the guide line shows the tilt
    // without spinning with the planet.
    axisGroup.add(buildAxisIndicator(p.radius));

    // Sub-unit bodies (the dwarf planets) are moon-sized on screen, so they
    // get the same 32-segment sphere the moons use instead of the 48-segment
    // one the planets need — visually identical at that size, and it keeps
    // them from costing more vertices per frame than Jupiter does.
    const segments = p.radius < 1 ? 32 : 48;

    const geo = new THREE.SphereGeometry(p.radius, segments, segments);
    let mesh;

    if (p.key === "earth") {
      // Earth gets a Phong material so we can use a real specular map
      // (oceans reflect more light than land) in addition to its day texture.
      const mat = new THREE.MeshPhongMaterial({
        color: p.color,
        shininess: 12,
        specular: new THREE.Color(0x333333),
      });
      mesh = new THREE.Mesh(geo, mat);
      applyTexture(p.texture, mat, "map", true);
      applyTexture(p.specularTexture, mat, "specularMap", false);

      // Cloud layer: a slightly larger sphere. The clouds texture is bright
      // clouds on a near-black background; additive blending makes the black
      // background contribute nothing while clouds glow softly on top.
      if (p.cloudsTexture) {
        const cloudGeo = new THREE.SphereGeometry(p.radius * 1.015, 48, 48);
        const cloudMat = new THREE.MeshLambertMaterial({
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        applyTexture(p.cloudsTexture, cloudMat, "map", true);
        mesh.add(cloudMesh);
        mesh.userData.cloudMesh = cloudMesh;
      }
    } else {
      const mat = new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: 0.85,
        metalness: 0.05,
      });
      mesh = new THREE.Mesh(geo, mat);
      applyTexture(p.texture, mat, "map", true);
    }

    // Sits at the origin of its axisGroup, which is what carries both the
    // orbital position and the (fixed) axial tilt; the mesh itself only ever
    // spins about its own — now tilted — Y axis.
    mesh.position.set(0, 0, 0);
    mesh.userData.isSelectable = true;
    mesh.userData.dataKey = p.key;
    axisGroup.add(mesh);

    // Saturn's rings sit in its equatorial plane, so they simply lie flat in
    // the tilted axisGroup's frame — Saturn's real 26.7° obliquity is what now
    // tips them (and, over its 29-year orbit, opens and closes them to view).
    if (p.rings) {
      const ringGeo = buildRingGeometry(p.rings.innerRadius, p.rings.outerRadius);
      const ringMat = new THREE.MeshStandardMaterial({
        color: p.rings.texture ? 0xffffff : p.rings.color,
        side: THREE.DoubleSide,
        transparent: true,
        // Untextured rings default to 0.75; `rings.opacity` lets a body dial
        // that down (Uranus' rings are real but genuinely very dark and faint).
        opacity: p.rings.texture ? 1 : (p.rings.opacity ?? 0.75),
        roughness: 0.9,
      });
      if (p.rings.texture) applyTexture(p.rings.texture, ringMat, "map", true);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      mesh.add(ringMesh);
    }

    // Moons: a `p.moons` array of defs (legacy singular `p.moon` still
    // accepted). Each moon is a pivot parented to the planet mesh, so moons
    // travel with the planet along its orbit, are spun by the pivot, and
    // circle in the planet's (now tilted) equatorial plane — which is where
    // regular satellites really orbit.
    const moonDefs = p.moons || (p.moon ? [p.moon] : []);
    const moonPivots = [];
    const moonMeshes = [];
    moonDefs.forEach((m) => {
      const moonPivot = new THREE.Object3D();
      mesh.add(moonPivot);
      const mGeo = new THREE.SphereGeometry(m.radius, 32, 32);
      const mMat = new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.9 });
      const moonMesh = new THREE.Mesh(mGeo, mMat);
      moonMesh.position.set(m.distance, 0, 0);
      moonMesh.userData.isSelectable = false;
      moonPivot.add(moonMesh);
      applyTexture(m.texture, mMat, "map", true);
      moonPivots.push(moonPivot);
      moonMeshes.push(moonMesh);
    });

    planetObjects.push({
      data: p,
      orbitGroup,
      pivot,
      axisGroup,
      mesh,
      moonPivots,
      moonMeshes,
      angle: Math.random() * Math.PI * 2,
    });
  });

  // ---------------------------------------------------------------------
  // Custom orbit/pan/zoom camera controls (no external deps)
  // ---------------------------------------------------------------------
  const controlsTarget = new THREE.Vector3(0, 0, 0);
  let camSpherical = new THREE.Spherical();
  (function initSpherical() {
    const offset = new THREE.Vector3().copy(camera.position).sub(controlsTarget);
    camSpherical.setFromVector3(offset);
  })();

  let isDragging = false;
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;
  const rotateSpeed = 0.006;
  const panSpeed = 0.06;
  const zoomSpeed = 1.0;

  // When set, the main loop re-centers controlsTarget on this function's
  // return value every frame — used so the camera can stay locked onto a
  // moving planet (during tour flights AND while dwelling at a tour stop,
  // since planets keep orbiting the whole time). Cleared whenever the user
  // manually takes control of the camera.
  let liveFollowFn = null;

  function updateCameraFromSpherical() {
    camSpherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, camSpherical.phi));
    camSpherical.radius = Math.max(3, Math.min(700, camSpherical.radius));
    const offset = new THREE.Vector3().setFromSpherical(camSpherical);
    camera.position.copy(controlsTarget).add(offset);
    camera.lookAt(controlsTarget);
  }
  updateCameraFromSpherical();

  function clearFollow() {
    liveFollowFn = null;
  }

  renderer.domElement.addEventListener("mousedown", (e) => {
    if (e.button === 0) isDragging = true;
    if (e.button === 2) isPanning = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener("mouseup", () => {
    isDragging = false;
    isPanning = false;
  });
  window.addEventListener("mousemove", (e) => {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (isDragging) {
      exitTourToFreeIfNeeded();
      clearFollow();
      camSpherical.theta -= dx * rotateSpeed;
      camSpherical.phi -= dy * rotateSpeed;
      updateCameraFromSpherical();
    } else if (isPanning) {
      exitTourToFreeIfNeeded();
      clearFollow();
      const panOffset = new THREE.Vector3();
      const cameraDir = new THREE.Vector3();
      camera.getWorldDirection(cameraDir);
      const right = new THREE.Vector3().crossVectors(cameraDir, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, cameraDir).normalize();
      panOffset.addScaledVector(right, -dx * panSpeed * (camSpherical.radius / 60));
      panOffset.addScaledVector(up, dy * panSpeed * (camSpherical.radius / 60));
      controlsTarget.add(panOffset);
      updateCameraFromSpherical();
    }
  });
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      exitTourToFreeIfNeeded();
      // zooming stays compatible with an active follow (doesn't cancel it),
      // since the radius is independent of what point we're centered on
      camSpherical.radius += e.deltaY * zoomSpeed * 0.05 * (camSpherical.radius / 40 + 0.5);
      updateCameraFromSpherical();
    },
    { passive: false }
  );

  function exitTourToFreeIfNeeded() {
    if (tourState.active) {
      stopTour(false);
    }
  }

  // ---------------------------------------------------------------------
  // Touch controls (additive; mouse controls above are untouched).
  // Single-finger drag -> orbit. Two-finger drag -> pinch-zoom is treated
  // as the primary two-finger gesture; two-finger pan is intentionally not
  // supported since disambiguating pinch vs. pan reliably on a small
  // tablet viewport added complexity out of proportion to the benefit for
  // this age group. Tap (no significant finger movement) -> select planet,
  // reusing the same drag-distance threshold as the mouse click handler.
  // ---------------------------------------------------------------------
  let touchMode = null; // "orbit" | "pinch" | null
  let touchLastX = 0;
  let touchLastY = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchDragDistance = 0;
  let pinchStartDist = 0;
  let pinchStartRadius = 0;

  function touchMidpoint(t0, t1) {
    return {
      x: (t0.clientX + t1.clientX) / 2,
      y: (t0.clientY + t1.clientY) / 2,
    };
  }
  function touchDistance(t0, t1) {
    return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
  }

  renderer.domElement.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        touchMode = "orbit";
        touchStartX = touchLastX = e.touches[0].clientX;
        touchStartY = touchLastY = e.touches[0].clientY;
        touchDragDistance = 0;
      } else if (e.touches.length === 2) {
        touchMode = "pinch";
        pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
        pinchStartRadius = camSpherical.radius;
        const mid = touchMidpoint(e.touches[0], e.touches[1]);
        touchLastX = mid.x;
        touchLastY = mid.y;
      }
    },
    { passive: false }
  );

  renderer.domElement.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (touchMode === "orbit" && e.touches.length === 1) {
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const dx = x - touchLastX;
        const dy = y - touchLastY;
        touchLastX = x;
        touchLastY = y;
        touchDragDistance = Math.hypot(x - touchStartX, y - touchStartY);
        exitTourToFreeIfNeeded();
        clearFollow();
        camSpherical.theta -= dx * rotateSpeed;
        camSpherical.phi -= dy * rotateSpeed;
        updateCameraFromSpherical();
      } else if (touchMode === "pinch" && e.touches.length === 2) {
        exitTourToFreeIfNeeded();
        const dist = touchDistance(e.touches[0], e.touches[1]);
        const scale = pinchStartDist / Math.max(dist, 1e-6);
        camSpherical.radius = pinchStartRadius * scale;
        updateCameraFromSpherical();
      }
    },
    { passive: false }
  );

  function onTouchEnd(e) {
    if (e.touches.length === 0) {
      if (touchMode === "orbit" && touchDragDistance <= 6) {
        const touch = e.changedTouches[0];
        if (touch) selectAtScreenPoint(touch.clientX, touch.clientY);
      }
      touchMode = null;
    } else if (e.touches.length === 1) {
      // Went from pinch/orbit down to one finger; restart orbit tracking
      // from here rather than jumping using stale coordinates.
      touchMode = "orbit";
      touchStartX = touchLastX = e.touches[0].clientX;
      touchStartY = touchLastY = e.touches[0].clientY;
      touchDragDistance = 0;
    }
  }
  renderer.domElement.addEventListener("touchend", onTouchEnd, { passive: false });
  renderer.domElement.addEventListener("touchcancel", onTouchEnd, { passive: false });

  // ---------------------------------------------------------------------
  // Raycasting / selection
  // ---------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let selectedKey = null;

  function getDataByKey(key) {
    if (key === "sun") return SUN;
    const found = planetObjects.find((o) => o.data.key === key);
    return found ? found.data : null;
  }

  function selectAtScreenPoint(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const selectable = [sunMesh, ...planetObjects.map((o) => o.mesh)];
    const intersects = raycaster.intersectObjects(selectable, false);
    if (intersects.length > 0) {
      const key = intersects[0].object.userData.dataKey;
      selectPlanet(key, true);
    }
  }

  function onClick(e) {
    // ignore clicks that are actually the end of a drag
    if (dragDistance > 6) return;
    selectAtScreenPoint(e.clientX, e.clientY);
  }

  let dragStartX = 0,
    dragStartY = 0,
    dragDistance = 0;
  renderer.domElement.addEventListener("mousedown", (e) => {
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragDistance = 0;
  });
  renderer.domElement.addEventListener("mousemove", (e) => {
    dragDistance = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
  });
  renderer.domElement.addEventListener("click", onClick);

  // ---------------------------------------------------------------------
  // Info panel
  // ---------------------------------------------------------------------
  const infoPanel = document.getElementById("infoPanel");
  const infoName = document.getElementById("infoName");
  const infoTagline = document.getElementById("infoTagline");
  const infoSwatch = document.getElementById("infoSwatch");
  const infoStats = document.getElementById("infoStats");
  const infoFacts = document.getElementById("infoFacts");
  const infoCloseBtn = document.getElementById("infoCloseBtn");

  function showInfoPanel(data) {
    infoName.textContent = data.name;
    infoTagline.textContent = data.tagline || "";
    infoSwatch.style.background = "#" + data.color.toString(16).padStart(6, "0");
    infoStats.innerHTML = "";
    Object.entries(data.stats || {}).forEach(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      infoStats.appendChild(dt);
      infoStats.appendChild(dd);
    });
    infoFacts.innerHTML = "";
    (data.facts || []).forEach((f) => {
      const li = document.createElement("li");
      li.textContent = f;
      infoFacts.appendChild(li);
    });
    infoPanel.classList.add("visible");
  }

  function hideInfoPanel() {
    infoPanel.classList.remove("visible");
    selectedKey = null;
  }

  infoCloseBtn.addEventListener("click", () => {
    hideInfoPanel();
    if (tourState.active) {
      // allow user to dismiss without exiting the tour; it will re-show at next stop
    }
  });

  function selectPlanet(key, fromUserClick) {
    selectedKey = key;
    const data = getDataByKey(key);
    if (!data) return;
    showInfoPanel(data);
    if (fromUserClick) {
      exitTourToFreeIfNeeded();
      flyCameraToKey(key, 1.4);
      setUrlBody(key);
    }
  }

  // ---------------------------------------------------------------------
  // Deep-linkable state: reflect the selected body in the URL (?body=key)
  // so a view can be bookmarked/shared. We only ever touch the URL on an
  // explicit user selection (click) and read it once on startup, using
  // replaceState (not pushState) so normal camera/tour navigation never
  // creates extra back-button history entries to fight with.
  // ---------------------------------------------------------------------
  function setUrlBody(key) {
    try {
      const url = new URL(window.location.href);
      if (key) {
        url.searchParams.set("body", key);
      } else {
        url.searchParams.delete("body");
      }
      window.history.replaceState(null, "", url);
    } catch (err) {
      // URL API issues (e.g. unusual embedding contexts) shouldn't break the app
      console.warn("[deep-link] failed to update URL:", err);
    }
  }

  function getUrlBody() {
    try {
      return new URLSearchParams(window.location.search).get("body");
    } catch (err) {
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // Camera fly-to animation helper
  // ---------------------------------------------------------------------
  // cameraAnim: { fromTarget, getTarget, fromSph, toSph, start, duration, onDone }
  // `getTarget` is a function re-evaluated every frame so a moving planet's
  // LIVE position is what we converge on — not a stale snapshot taken when
  // the flight started (which would drift as the planet keeps orbiting).
  let cameraAnim = null;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function getWorldPositionForKey(key) {
    if (key === "sun") return new THREE.Vector3(0, 0, 0);
    const obj = planetObjects.find((o) => o.data.key === key);
    if (!obj) return new THREE.Vector3(0, 0, 0);
    const worldPos = new THREE.Vector3();
    obj.mesh.getWorldPosition(worldPos);
    return worldPos;
  }

  // getTargetFn: () => THREE.Vector3, evaluated live every frame (both during
  // the flight and afterwards, via liveFollowFn) so the camera tracks a
  // moving target correctly instead of a fixed point captured at flight-start.
  function flyCameraTo(getTargetFn, distance, duration, onDone) {
    const fromTarget = controlsTarget.clone();

    // Compute a nice viewing offset (keep current azimuth/elevation direction, but new radius)
    const dir = new THREE.Vector3().setFromSpherical(camSpherical).normalize();
    const desiredSph = new THREE.Spherical().setFromVector3(dir.clone().multiplyScalar(distance));

    liveFollowFn = getTargetFn;

    cameraAnim = {
      fromTarget,
      getTarget: getTargetFn,
      fromSph: camSpherical.clone(),
      toSph: desiredSph,
      start: performance.now(),
      duration,
      onDone,
    };
  }

  function flyCameraToKey(key, durationScale) {
    const data = getDataByKey(key);
    const radius = data.radius || 3;
    // Sub-unit bodies (the dwarf planets) need a much closer stop than the
    // radius x 5 / 8-unit floor used for planets, or the tour and click-to-
    // select would frame Ceres and Pluto as barely-visible dots.
    const viewDist = radius < 1 ? Math.max(radius * 14, 3.5) : Math.max(radius * 5, 8);
    flyCameraTo(() => getWorldPositionForKey(key), viewDist, 1800 * (durationScale || 1));
  }

  function updateCameraAnim(now) {
    if (!cameraAnim) return;
    const t = Math.min(1, (now - cameraAnim.start) / cameraAnim.duration);
    const e = easeInOutCubic(t);

    // Re-evaluate the live target every frame so fast-moving planets (e.g.
    // Mercury) don't cause the camera to converge on a stale position.
    const liveTarget = cameraAnim.getTarget();
    controlsTarget.lerpVectors(cameraAnim.fromTarget, liveTarget, e);

    camSpherical.radius = THREE.MathUtils.lerp(cameraAnim.fromSph.radius, cameraAnim.toSph.radius, e);
    camSpherical.theta = THREE.MathUtils.lerp(cameraAnim.fromSph.theta, cameraAnim.toSph.theta, e);
    camSpherical.phi = THREE.MathUtils.lerp(cameraAnim.fromSph.phi, cameraAnim.toSph.phi, e);

    updateCameraFromSpherical();

    if (t >= 1) {
      const done = cameraAnim.onDone;
      cameraAnim = null;
      if (done) done();
    }
  }

  // ---------------------------------------------------------------------
  // Guided tour
  // ---------------------------------------------------------------------
  const tourBtn = document.getElementById("tourBtn");
  const tourBar = document.getElementById("tourBar");
  const tourLabel = document.getElementById("tourLabel");
  const tourPrevBtn = document.getElementById("tourPrev");
  const tourNextBtn = document.getElementById("tourNext");
  const tourPauseBtn = document.getElementById("tourPause");
  const tourExitBtn = document.getElementById("tourExit");
  const resetBtn = document.getElementById("resetBtn");
  const tourScopeSelect = document.getElementById("tourScope");
  const tourSpeedSelect = document.getElementById("tourSpeed");

  // Tour scopes determine which bodies (besides the closing "__end__" stop)
  // are visited. "full" is the Sun -> everything in PLANETS order (which is
  // distance order, so Ceres is visited inside the asteroid belt and Pluto
  // last) and stays the default.
  const TOUR_SCOPES = {
    full: ["sun", ...PLANETS.map((p) => p.key)],
    inner: ["mercury", "venus", "earth", "mars"],
    outer: ["jupiter", "saturn", "uranus", "neptune"],
    dwarf: PLANETS.filter((p) => p.dwarf).map((p) => p.key),
  };

  // Dwell duration (ms) per stop for each speed preset. "normal" matches the
  // original hardcoded 4200ms duration.
  const TOUR_SPEEDS = {
    relaxed: 7000,
    normal: 4200,
    quick: 2400,
  };

  let tourStops = [...TOUR_SCOPES.full, "__end__"];

  const tourState = {
    active: false,
    paused: false,
    index: 0,
    dwellTimer: null,
    dwellRemaining: 0,
    dwellStart: 0,
    dwellDuration: TOUR_SPEEDS.normal,
  };

  function tourStopLabel(key) {
    if (key === "__end__") return "Tour complete";
    const data = getDataByKey(key);
    return data ? data.name : key;
  }

  function startTour() {
    const scope = TOUR_SCOPES[tourScopeSelect?.value] || TOUR_SCOPES.full;
    tourStops = [...scope, "__end__"];
    tourState.dwellDuration =
      TOUR_SPEEDS[tourSpeedSelect?.value] || TOUR_SPEEDS.normal;
    tourState.active = true;
    tourState.paused = false;
    tourState.index = 0;
    tourBar.classList.add("visible");
    tourBtn.textContent = "▶ Start Tour";
    if (tourScopeSelect) tourScopeSelect.disabled = true;
    if (tourSpeedSelect) tourSpeedSelect.disabled = true;
    goToTourStop(0);
  }

  function stopTour(showReset) {
    tourState.active = false;
    tourState.paused = false;
    clearTimeout(tourState.dwellTimer);
    tourBar.classList.remove("visible");
    if (tourScopeSelect) tourScopeSelect.disabled = false;
    if (tourSpeedSelect) tourSpeedSelect.disabled = false;
    clearFollow();
    if (showReset !== false) {
      // no-op, kept for symmetry
    }
  }

  function goToTourStop(index) {
    clearTimeout(tourState.dwellTimer);
    if (index < 0) index = 0;
    if (index >= tourStops.length) {
      finishTour();
      return;
    }
    tourState.index = index;
    const key = tourStops[index];
    tourLabel.textContent = tourStopLabel(key);
    tourPrevBtn.disabled = index === 0;
    tourNextBtn.disabled = false;

    if (key === "__end__") {
      hideInfoPanel();
      // Pull back to a wide overview shot (fixed point, nothing to track)
      flyCameraTo(() => new THREE.Vector3(0, 0, 0), OVERVIEW_DISTANCE, 2200, () => {
        armDwell();
      });
      return;
    }

    hideInfoPanel();
    // flyCameraToKey wires up liveFollowFn to continuously track this body's
    // live (orbiting) position — both during the flight and, since we never
    // clear it below, for the whole dwell period that follows.
    flyCameraToKey(key, 1.3);
    // Show facts partway through the flight for a natural reveal, then dwell
    const revealDelay = 900;
    clearTimeout(tourState._revealTimer);
    tourState._revealTimer = setTimeout(() => {
      if (!tourState.active) return;
      const data = getDataByKey(key);
      if (data) {
        selectedKey = key;
        showInfoPanel(data);
      }
    }, revealDelay);

    armDwell();
  }

  function armDwell() {
    clearTimeout(tourState.dwellTimer);
    tourState.dwellStart = performance.now();
    tourState.dwellRemaining = tourState.dwellDuration;
    if (!tourState.paused) {
      tourState.dwellTimer = setTimeout(() => {
        if (tourState.active && !tourState.paused) {
          goToTourStop(tourState.index + 1);
        }
      }, tourState.dwellDuration);
    }
  }

  function finishTour() {
    tourLabel.textContent = "Tour complete";
    tourState.index = tourStops.length - 1;
    setTimeout(() => {
      if (tourState.active) {
        stopTour();
        hideInfoPanel();
      }
    }, 3200);
  }

  tourBtn.addEventListener("click", () => {
    startTour();
  });

  tourExitBtn.addEventListener("click", () => {
    stopTour();
  });

  tourPauseBtn.addEventListener("click", () => {
    tourState.paused = !tourState.paused;
    tourPauseBtn.textContent = tourState.paused ? "▶ Resume" : "⏸ Pause";
    if (tourState.paused) {
      clearTimeout(tourState.dwellTimer);
    } else {
      // resume with remaining dwell time (simplified: restart a shorter dwell)
      tourState.dwellTimer = setTimeout(() => {
        if (tourState.active && !tourState.paused) {
          goToTourStop(tourState.index + 1);
        }
      }, Math.max(1200, tourState.dwellDuration - (performance.now() - tourState.dwellStart)));
    }
  });

  tourNextBtn.addEventListener("click", () => {
    goToTourStop(tourState.index + 1);
  });

  tourPrevBtn.addEventListener("click", () => {
    goToTourStop(tourState.index - 1);
  });

  resetBtn.addEventListener("click", () => {
    stopTour();
    hideInfoPanel();
    clearFollow();
    flyCameraTo(() => new THREE.Vector3(0, 0, 0), OVERVIEW_DISTANCE, 1200);
  });

  // ---------------------------------------------------------------------
  // About modal
  // ---------------------------------------------------------------------
  const aboutBtn = document.getElementById("aboutBtn");
  const aboutModal = document.getElementById("aboutModal");
  const aboutCloseBtn = document.getElementById("aboutCloseBtn");
  aboutBtn.addEventListener("click", () => aboutModal.classList.add("visible"));
  aboutCloseBtn.addEventListener("click", () => aboutModal.classList.remove("visible"));
  aboutModal.addEventListener("click", (e) => {
    if (e.target === aboutModal) aboutModal.classList.remove("visible");
  });

  // ---------------------------------------------------------------------
  // Quiz mode — a calm, unscored flashcard flow (question / reveal / next).
  // Purely additive: it doesn't touch tour state, camera, or info panel.
  // ---------------------------------------------------------------------
  const quizBtn = document.getElementById("quizBtn");
  const quizModal = document.getElementById("quizModal");
  const quizCloseBtn = document.getElementById("quizCloseBtn");
  const quizProgress = document.getElementById("quizProgress");
  const quizQuestionEl = document.getElementById("quizQuestion");
  const quizAnswerEl = document.getElementById("quizAnswer");
  const quizRevealBtn = document.getElementById("quizRevealBtn");
  const quizNextBtn = document.getElementById("quizNextBtn");
  const quizExitBtn = document.getElementById("quizExitBtn");

  const quizState = {
    cards: [],
    index: 0,
    revealed: false,
  };

  function showQuizCard() {
    const card = quizState.cards[quizState.index];
    quizQuestionEl.textContent = card.question;
    quizAnswerEl.textContent = "";
    quizState.revealed = false;
    quizRevealBtn.disabled = false;
    quizProgress.textContent = `Card ${quizState.index + 1} of ${quizState.cards.length}`;
  }

  function openQuiz() {
    if (quizState.cards.length === 0) {
      quizState.cards = shuffle(generateQuizQuestions(SUN, PLANETS));
    }
    quizState.index = 0;
    showQuizCard();
    quizModal.classList.add("visible");
  }

  function closeQuiz() {
    quizModal.classList.remove("visible");
  }

  function revealQuizAnswer() {
    const card = quizState.cards[quizState.index];
    quizAnswerEl.textContent = card.answer;
    quizState.revealed = true;
  }

  function nextQuizCard() {
    quizState.index = (quizState.index + 1) % quizState.cards.length;
    showQuizCard();
  }

  quizBtn.addEventListener("click", openQuiz);
  quizCloseBtn.addEventListener("click", closeQuiz);
  quizExitBtn.addEventListener("click", closeQuiz);
  quizRevealBtn.addEventListener("click", revealQuizAnswer);
  quizNextBtn.addEventListener("click", nextQuizCard);
  quizModal.addEventListener("click", (e) => {
    if (e.target === quizModal) closeQuiz();
  });

  // ---------------------------------------------------------------------
  // Resize handling
  // ---------------------------------------------------------------------
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------------------------------------------------------------------
  // Main animation loop
  // ---------------------------------------------------------------------
  const ORBIT_TIME_SCALE = 0.25; // global speed multiplier for legibility
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const now = performance.now();

    planetObjects.forEach((obj) => {
      obj.angle += obj.data.orbitSpeed * ORBIT_TIME_SCALE * dt;
      obj.pivot.rotation.y = obj.angle;
      // Cancel the pivot's orbital rotation so the tilted spin axis keeps
      // pointing the same way all the way round the orbit (see the axisGroup
      // comment where it's built) instead of precessing once per year.
      obj.axisGroup.rotation.y = -obj.angle;
      obj.mesh.rotation.y += (obj.data.rotationSpeed || 0.3) * dt;
      if (obj.mesh.userData.cloudMesh) {
        obj.mesh.userData.cloudMesh.rotation.y += 0.02 * dt;
      }
      if (obj.moonPivots && obj.moonPivots.length) {
        const moonDefs = obj.data.moons || (obj.data.moon ? [obj.data.moon] : []);
        obj.moonPivots.forEach((moonPivot, i) => {
          const m = moonDefs[i];
          moonPivot.rotation.y += ((m && m.orbitSpeed) || 5) * ORBIT_TIME_SCALE * dt;
        });
      }
    });

    sunMesh.rotation.y += 0.05 * dt;

    // The belt is one rigid point cloud, so "orbiting" it is a single object
    // rotation — no per-asteroid work regardless of how many particles it has.
    if (asteroidBelt) {
      asteroidBelt.rotation.y += ASTEROID_BELT.driftSpeed * ORBIT_TIME_SCALE * dt;
    }

    updateCameraAnim(now);

    // Keep the camera locked onto whatever we're following (a tour stop's
    // planet, or a manually-clicked planet) even when no flight animation is
    // in progress — this is what keeps the view centered on a moving planet
    // for the entire dwell/pause duration at a tour stop.
    if (liveFollowFn && !cameraAnim) {
      controlsTarget.copy(liveFollowFn());
      updateCameraFromSpherical();
    }

    renderer.render(scene, camera);
  }

  // ---------------------------------------------------------------------
  // On startup, if the URL encodes a body (e.g. ?body=saturn), jump
  // straight to that selection/view instead of the default startup view.
  // ---------------------------------------------------------------------
  (function applyInitialDeepLink() {
    const initialKey = getUrlBody();
    if (initialKey && getDataByKey(initialKey)) {
      selectPlanet(initialKey, true);
    }
  })();

  document.getElementById("loading").remove();
  animate();
})();
