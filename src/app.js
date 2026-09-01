// Solar System Simulator — main application logic.
// THREE is imported as an ES module (npm dependency); SUN / PLANETS data
// come from data.js (also an ES module).

import * as THREE from "three";
import { TEXTURES, SUN, PLANETS } from "./data.js";
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

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 40, 90);

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
  // Build planets
  // ---------------------------------------------------------------------
  const planetObjects = []; // { data, pivot, mesh, angle }

  PLANETS.forEach((p) => {
    scene.add(buildOrbitRing(p.distance));

    const pivot = new THREE.Object3D();
    scene.add(pivot);

    const geo = new THREE.SphereGeometry(p.radius, 48, 48);
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

    mesh.position.set(p.distance, 0, 0);
    mesh.userData.isSelectable = true;
    mesh.userData.dataKey = p.key;
    pivot.add(mesh);

    // Saturn's rings
    if (p.rings) {
      const ringGeo = buildRingGeometry(p.rings.innerRadius, p.rings.outerRadius);
      const ringMat = new THREE.MeshStandardMaterial({
        color: p.rings.texture ? 0xffffff : p.rings.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: p.rings.texture ? 1 : 0.75,
        roughness: 0.9,
      });
      if (p.rings.texture) applyTexture(p.rings.texture, ringMat, "map", true);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2.2;
      mesh.add(ringMesh);
    }

    // Moons (currently only Earth has one, via p.moon; also supports a
    // future p.moons array so more planets can get multiple moons without
    // another refactor here).
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
      pivot,
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
    camSpherical.radius = Math.max(3, Math.min(600, camSpherical.radius));
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

  function onClick(e) {
    // ignore clicks that are actually the end of a drag
    if (dragDistance > 6) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const selectable = [sunMesh, ...planetObjects.map((o) => o.mesh)];
    const intersects = raycaster.intersectObjects(selectable, false);
    if (intersects.length > 0) {
      const key = intersects[0].object.userData.dataKey;
      selectPlanet(key, true);
    }
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
    const viewDist = Math.max(radius * 5, 8);
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
  // are visited. "full" is the original Sun -> all 8 planets sequence and
  // stays the default so existing behavior is unchanged.
  const TOUR_SCOPES = {
    full: ["sun", ...PLANETS.map((p) => p.key)],
    inner: ["mercury", "venus", "earth", "mars"],
    outer: ["jupiter", "saturn", "uranus", "neptune"],
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
      flyCameraTo(() => new THREE.Vector3(0, 0, 0), 95, 2200, () => {
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
    flyCameraTo(() => new THREE.Vector3(0, 0, 0), 90, 1200);
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

  document.getElementById("loading").remove();
  animate();
})();
