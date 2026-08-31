// Solar System Simulator — main application logic.
// Uses global THREE (loaded via CDN script tag in index.html) and the
// SUN / PLANETS data defined in data.js.

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Renderer / Scene / Camera setup
  // ---------------------------------------------------------------------
  const container = document.getElementById("app");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
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

  // ---------------------------------------------------------------------
  // Lighting
  // ---------------------------------------------------------------------
  const ambient = new THREE.AmbientLight(0x404060, 1.2);
  scene.add(ambient);

  const sunLight = new THREE.PointLight(0xffffff, 2.2, 0, 0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  // ---------------------------------------------------------------------
  // Sun
  // ---------------------------------------------------------------------
  const sunGeo = new THREE.SphereGeometry(SUN.radius, 48, 48);
  const sunMat = new THREE.MeshBasicMaterial({ color: SUN.color });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.userData.isSelectable = true;
  sunMesh.userData.dataKey = "sun";
  scene.add(sunMesh);

  // subtle glow via a larger transparent sphere
  const glowGeo = new THREE.SphereGeometry(SUN.radius * 1.35, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: SUN.emissive,
    transparent: true,
    opacity: 0.22,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(glowGeo, glowMat));

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
  // Build planets
  // ---------------------------------------------------------------------
  const planetObjects = []; // { data, pivot, mesh, angle }

  PLANETS.forEach((p) => {
    scene.add(buildOrbitRing(p.distance));

    const pivot = new THREE.Object3D();
    scene.add(pivot);

    const geo = new THREE.SphereGeometry(p.radius, 40, 40);
    const mat = new THREE.MeshStandardMaterial({
      color: p.color,
      roughness: 0.85,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.distance, 0, 0);
    mesh.userData.isSelectable = true;
    mesh.userData.dataKey = p.key;
    pivot.add(mesh);

    // Saturn's rings
    if (p.rings) {
      const ringGeo = new THREE.RingGeometry(p.rings.innerRadius, p.rings.outerRadius, 64);
      // RingGeometry UVs assume XY plane; rotate to lie flat, and fix radial UV mapping for a nicer look
      const pos = ringGeo.attributes.position;
      const v3 = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i);
        ringGeo.attributes.uv.setXY(i, v3.length() < (p.rings.innerRadius + p.rings.outerRadius) / 2 ? 0 : 1, 1);
      }
      const ringMat = new THREE.MeshStandardMaterial({
        color: p.rings.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        roughness: 0.9,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2.2;
      mesh.add(ringMesh);
    }

    // Moon (Earth only, for now)
    let moonPivot = null;
    let moonMesh = null;
    if (p.moon) {
      moonPivot = new THREE.Object3D();
      mesh.add(moonPivot);
      const mGeo = new THREE.SphereGeometry(p.moon.radius, 24, 24);
      const mMat = new THREE.MeshStandardMaterial({ color: p.moon.color, roughness: 0.9 });
      moonMesh = new THREE.Mesh(mGeo, mMat);
      moonMesh.position.set(p.moon.distance, 0, 0);
      moonPivot.add(moonMesh);
    }

    planetObjects.push({
      data: p,
      pivot,
      mesh,
      moonPivot,
      moonMesh,
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
  let userIsControlling = false; // becomes true once user interacts, used to pause auto camera behaviors

  function updateCameraFromSpherical() {
    camSpherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, camSpherical.phi));
    camSpherical.radius = Math.max(3, Math.min(600, camSpherical.radius));
    const offset = new THREE.Vector3().setFromSpherical(camSpherical);
    camera.position.copy(controlsTarget).add(offset);
    camera.lookAt(controlsTarget);
  }
  updateCameraFromSpherical();

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
      camSpherical.theta -= dx * rotateSpeed;
      camSpherical.phi -= dy * rotateSpeed;
      updateCameraFromSpherical();
    } else if (isPanning) {
      exitTourToFreeIfNeeded();
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
  let cameraAnim = null; // { fromPos, toPos, fromTarget, toTarget, fromSph, toSph, start, duration, onDone }

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

  function flyCameraTo(targetPos, distance, duration, onDone) {
    const fromTarget = controlsTarget.clone();
    const toTarget = targetPos.clone();

    // Compute a nice viewing offset (keep current azimuth/elevation direction, but new radius)
    const dir = new THREE.Vector3().setFromSpherical(camSpherical).normalize();
    const desiredSph = new THREE.Spherical().setFromVector3(dir.clone().multiplyScalar(distance));

    cameraAnim = {
      fromTarget,
      toTarget,
      fromSph: camSpherical.clone(),
      toSph: desiredSph,
      start: performance.now(),
      duration,
      onDone,
    };
  }

  function flyCameraToKey(key, durationScale) {
    const data = getDataByKey(key);
    const worldPos = getWorldPositionForKey(key);
    const radius = data.radius || 3;
    const viewDist = Math.max(radius * 5, 8);
    flyCameraTo(worldPos, viewDist, 1800 * (durationScale || 1));
  }

  function updateCameraAnim(now) {
    if (!cameraAnim) return;
    const t = Math.min(1, (now - cameraAnim.start) / cameraAnim.duration);
    const e = easeInOutCubic(t);

    controlsTarget.lerpVectors(cameraAnim.fromTarget, cameraAnim.toTarget, e);

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

  const tourStops = ["sun", ...PLANETS.map((p) => p.key), "__end__"];

  const tourState = {
    active: false,
    paused: false,
    index: 0,
    dwellTimer: null,
    dwellRemaining: 0,
    dwellStart: 0,
    dwellDuration: 4200,
  };

  function tourStopLabel(key) {
    if (key === "__end__") return "Tour complete";
    const data = getDataByKey(key);
    return data ? data.name : key;
  }

  function startTour() {
    tourState.active = true;
    tourState.paused = false;
    tourState.index = 0;
    tourBar.classList.add("visible");
    tourBtn.textContent = "▶ Start Tour";
    goToTourStop(0);
  }

  function stopTour(showReset) {
    tourState.active = false;
    tourState.paused = false;
    clearTimeout(tourState.dwellTimer);
    tourBar.classList.remove("visible");
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
      // Pull back to a wide overview shot
      flyCameraTo(new THREE.Vector3(0, 0, 0), 95, 2200, () => {
        armDwell();
      });
      return;
    }

    hideInfoPanel();
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
    flyCameraTo(new THREE.Vector3(0, 0, 0), 90, 1200);
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
      if (obj.moonPivot) {
        obj.moonPivot.rotation.y += (obj.data.moon.orbitSpeed || 5) * ORBIT_TIME_SCALE * dt;
      }
    });

    sunMesh.rotation.y += 0.05 * dt;

    updateCameraAnim(now);

    renderer.render(scene, camera);
  }

  document.getElementById("loading").remove();
  animate();
})();
