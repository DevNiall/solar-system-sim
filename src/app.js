// Solar System Simulator — main application logic.
// THREE is imported as an ES module (npm dependency); SUN / PLANETS data
// come from data.js (also an ES module).

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TEXTURES, SUN, PLANETS, ASTEROID_BELT, SPACE_OBJECTS } from "./data.js";
import { buildQuizRound, generateQuizQuestions, shuffle } from "./quiz.js";

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
  // Start outside the compressed Oort shell so its near hemisphere reads as
  // a dense field around the distant Solar System.
  const OORT_CLOUD_CAMERA_DISTANCE = 2900;
  const MAX_CAMERA_DISTANCE = 3200;

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    10000
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
  // The shell's inner radius must clear every camera position the app ever
  // flies to, not just the default OVERVIEW_DISTANCE framing. The Grand
  // Tour's cold-open/system-reveal beats push the camera out to ~3x
  // OVERVIEW_DISTANCE (see GRAND_TOUR below) specifically to sell "a faint
  // star in the dark"; if the star shell's inner edge is closer than that,
  // the camera ends up flying *through* the field instead of past it, and a
  // handful of points land within a few units of the lens. THREE's
  // size-attenuated point sprites scale ~1/distance, so those few points
  // blow up into oversized, square, out-of-place bright pixels sitting in
  // front of the reveal — reproduced by screenshotting the cold-open beat.
  // Padding to 4x with a further 4x-wide shell keeps the whole tour's camera
  // moves (and ordinary free-cam zoom-out) safely inside the near edge.
  const STARFIELD_INNER = MAX_CAMERA_DISTANCE * 1.5;
  const STARFIELD_OUTER = STARFIELD_INNER * 2;
  function buildStarfield() {
    const starCount = 4000;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // distribute on a large sphere shell so stars stay behind everything
      const radius = STARFIELD_INNER + Math.random() * (STARFIELD_OUTER - STARFIELD_INNER);
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
      // Pushing the shell out ~4x further than before means every point is
      // ~4x farther from any given camera position, and size-attenuated
      // sprites scale ~1/distance — so the base size is scaled up to match,
      // keeping the ordinary (non-tour) starfield's apparent brightness/
      // density unchanged from before this fix.
      size: 14,
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
    // Must stay outside STARFIELD_OUTER (see buildStarfield above) or this
    // BackSide sphere would depth-occlude the far half of the procedural
    // point field; camera.far (2000) leaves it plenty of room.
    const geo = new THREE.SphereGeometry(STARFIELD_OUTER * 1.2, 48, 32);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x666666 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    applyTexture(TEXTURES.starsMilkyWay, mat, "map", true);
    // once textured, let it show at full brightness rather than tinted
    mat.color.set(0xffffff);
  }
  buildSkybox();

  // A dense, deliberately compressed shell representing the distant Oort
  // Cloud. It is a single point cloud, not individually simulated comets.
  const OORT_CLOUD_INNER_RADIUS = 880;
  const OORT_CLOUD_FADE_DISTANCE = 360;
  const OORT_CLOUD_OUTER_RADIUS = 1660;
  let oortCloud = null;

  function buildOortCloud() {
    const count = 14000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const outer = OORT_CLOUD_OUTER_RADIUS;
    const ice = new THREE.Color(0xa9cbe8);
    const blue = new THREE.Color(0x607fae);
    for (let i = 0; i < count; i++) {
      const radius = OORT_CLOUD_INNER_RADIUS + Math.pow(Math.random(), 1.8)
        * (outer - OORT_CLOUD_INNER_RADIUS);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const color = ice.clone().lerp(blue, Math.random() * 0.7);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const spriteSize = 64;
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spriteSize;
    spriteCanvas.height = spriteSize;
    const spriteContext = spriteCanvas.getContext("2d");
    const spriteGradient = spriteContext.createRadialGradient(
      spriteSize / 2, spriteSize / 2, 0,
      spriteSize / 2, spriteSize / 2, spriteSize / 2
    );
    spriteGradient.addColorStop(0, "rgba(255,255,255,1)");
    spriteGradient.addColorStop(0.3, "rgba(220,238,255,0.85)");
    spriteGradient.addColorStop(1, "rgba(180,210,255,0)");
    spriteContext.fillStyle = spriteGradient;
    spriteContext.fillRect(0, 0, spriteSize, spriteSize);
    const mat = new THREE.PointsMaterial({
      size: 6.4,
      sizeAttenuation: true,
      vertexColors: true,
      map: new THREE.CanvasTexture(spriteCanvas),
      alphaTest: 0.22,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    oortCloud = new THREE.Points(geo, mat);
    scene.add(oortCloud);
  }
  buildOortCloud();

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

  // "Dusk" cue for the Grand Tour's Jupiter reveal (see GRAND_TOUR): a global
  // dim of the scene lights, driven every frame from a camera flight's
  // `onProgress` (see flyCameraTo/updateCameraAnim), standing in for the
  // giant's shadow falling across the scene before it swings into frame.
  // Deliberately a scene-wide light dip rather than a per-object shadow/
  // occlusion effect — simple, cheap, and easy to reason about — per the
  // brief's fallback guidance. Any flight that does NOT pass `onProgress`
  // snaps this back to 0 when it starts, so leaving the Jupiter set piece
  // (or exiting the tour mid-beat) can never strand the scene dimmed.
  const AMBIENT_BASE_INTENSITY = ambient.intensity;
  const SUN_BASE_INTENSITY = sunLight.intensity;
  function setDuskAmount(amount) {
    const a = THREE.MathUtils.clamp(amount, 0, 1);
    ambient.intensity = THREE.MathUtils.lerp(AMBIENT_BASE_INTENSITY, AMBIENT_BASE_INTENSITY * 0.22, a);
    sunLight.intensity = THREE.MathUtils.lerp(SUN_BASE_INTENSITY, SUN_BASE_INTENSITY * 0.3, a);
  }

  // ---------------------------------------------------------------------
  // Selective-bloom layer
  //
  // Objects on BLOOM_LAYER are the only things that emit into the bloom pass
  // (see "Postprocessing" further down) — everything else is rendered black
  // there, so it occludes the glow without contributing to it. That lets the
  // Sun glow hard without the planet textures, orbit rings, asteroid belt or
  // starfield getting smeared.
  // `enableBloom(obj)` is the single entry point: anything emissive added
  // later (a glowing accent, a comet, a spacecraft thruster) only has to call
  // it to join the effect.
  // ---------------------------------------------------------------------
  const BLOOM_LAYER = 1;
  function enableBloom(obj) {
    obj.layers.enable(BLOOM_LAYER);
  }

  // ---------------------------------------------------------------------
  // Sun (textured sphere + corona shell; the halo itself is real bloom
  // postprocessing, applied to everything on BLOOM_LAYER)
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
  enableBloom(sunMesh);
  scene.add(sunMesh);
  applyTexture(SUN.texture, sunMat, "map", true);

  // Soft volumetric-looking corona via a backside sphere. It is deliberately
  // faint on its own — its real job is to give UnrealBloomPass a wider,
  // softer-edged source than the hard disc of the Sun itself, which is what
  // turns the bloom into a graded halo instead of a uniform ring.
  const glowGeo = new THREE.SphereGeometry(SUN.radius * 1.35, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: SUN.emissive,
    transparent: true,
    opacity: 0.25,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sunCorona = new THREE.Mesh(glowGeo, glowMat);
  enableBloom(sunCorona);
  scene.add(sunCorona);

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
      moonMesh.userData.isSelectable = true;
      moonMesh.userData.dataKey = m.key;
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
  // Space objects: human-made craft use a separate registry so their
  // deliberately compressed paths never alter planet scale or quiz data.
  // ---------------------------------------------------------------------
  const spaceObjects = [];
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  function addSelectableKey(root, key) {
    root.traverse((child) => {
      if (child.isMesh) child.userData.dataKey = key;
    });
  }

  function buildSpaceObjectFallback(data) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: data.color, metalness: 0.7, roughness: 0.3 })
    );
    body.rotation.z = Math.PI / 2;
    group.add(body);
    const panels = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.04, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x274d78, metalness: 0.5, roughness: 0.45 })
    );
    group.add(panels);
    return group;
  }

  function createSpaceObject(data) {
    const root = new THREE.Group();
    const visual = new THREE.Group();
    root.add(visual);
    const fallback = buildSpaceObjectFallback(data);
    visual.add(fallback);
    root.userData.dataKey = data.key;
    addSelectableKey(fallback, data.key);
    scene.add(root);

    const entry = { data, root, visual, orbit: null, phase: Math.random() * Math.PI * 2 };
    if (data.placement === "low-earth-orbit") {
      const earth = planetObjects.find((object) => object.data.key === "earth");
      const orbitPlane = new THREE.Object3D();
      orbitPlane.rotation.order = "YXZ";
      orbitPlane.rotation.y = (data.ascendingNode || 0) * DEG;
      orbitPlane.rotation.x = (data.orbitInclination || 0) * DEG;
      earth.axisGroup.add(orbitPlane);
      entry.orbit = new THREE.Object3D();
      orbitPlane.add(entry.orbit);
      entry.orbit.add(root);
      root.position.set(data.orbitRadius, 0, 0);
    } else if (data.placement === "sun-earth-l2") {
      entry.orbit = new THREE.Object3D();
      scene.add(entry.orbit);
      entry.orbit.add(root);
    } else {
      root.position.fromArray(data.position);
    }

    gltfLoader.load(
      `${import.meta.env.BASE_URL}${data.model}`,
      (gltf) => {
        visual.remove(fallback);
        const model = gltf.scene;
        if (data.key === "iss") {
          const detached = [];
          model.traverse((child) => {
            if (/^(bendedtru|pCylinder)/.test(child.name)) detached.push(child);
          });
          detached.forEach((child) => child.parent?.remove(child));
        }
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3()).length();
        model.scale.setScalar(size > 0 ? data.visualSize / size : 1);
        const center = bounds.getCenter(new THREE.Vector3());
        model.position.copy(center).multiplyScalar(-model.scale.x);
        addSelectableKey(model, data.key);
        visual.add(model);
      },
      undefined,
      () => console.warn("[models] failed to load; using fallback:", data.model)
    );
    spaceObjects.push(entry);
  }

  SPACE_OBJECTS.forEach(createSpaceObject);

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

  // Companion to liveFollowFn for the Grand Tour: when set, the camera's
  // OFFSET DIRECTION (not just the point it looks at) is recomputed every
  // frame from this function. Needed because Jupiter's moons orbit fast at
  // this time scale — Callisto sweeps ~20°/s around Jupiter — so a direction
  // sampled once at flight start goes stale within a second and would let
  // Jupiter drift into frame during the very approach that is supposed to
  // hide it. Keeping it live means the camera rides Callisto's far side and
  // Jupiter stays exactly 180° behind us until the reveal beat.
  let liveDirFn = null;

  function updateCameraFromSpherical() {
    camSpherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, camSpherical.phi));
    // Lower bound was 3 for a long time; the Grand Tour's Callisto stop needs
    // to sit intimately close to a 0.38-unit moon, so it is now 1.2. (3 was
    // never a "don't fly inside a body" guard anyway — the Sun's radius is
    // 6.5.) The upper bound clears the Oort Cloud opening.
    camSpherical.radius = Math.max(1.2, Math.min(MAX_CAMERA_DISTANCE, camSpherical.radius));
    const offset = new THREE.Vector3().setFromSpherical(camSpherical);
    camera.position.copy(controlsTarget).add(offset);
    camera.lookAt(controlsTarget);
  }
  updateCameraFromSpherical();

  function clearFollow() {
    liveFollowFn = null;
    liveDirFn = null;
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
      // Keep tracking a focused body (selectedKey set) while orbiting around
      // it — only panning or clicking away breaks that lock.
      if (!selectedKey) clearFollow();
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
  // Keyboard controls (arrow keys / WASD). Held keys are tracked here and
  // applied once per frame in animate(), using wall-clock delta time rather
  // than the (pausable, speed-scaled) simulation step, so controls still
  // work while playback is paused and stay frame-rate independent.
  //
  // Arrow keys always orbit/look around the current pivot (controlsTarget),
  // mirroring the mouse-drag orbit above — including the same lock-
  // preserving behavior: looking around a focused body doesn't stop the
  // camera from tracking it, only panning or clicking away does.
  //
  // WASD is context-sensitive: while locked onto a body (selectedKey set)
  // it orbits too, per the "rotate around the focused body" ask. Free
  // (nothing focused), it instead FLIES the camera — translating both the
  // camera and its pivot together along the view direction/right vector, so
  // the current look angle and distance-to-pivot are preserved and the user
  // can roam anywhere rather than only orbiting a fixed point.
  // ---------------------------------------------------------------------
  const ROTATE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"]);
  const keysDown = new Set();
  const KEY_ROTATE_SPEED = 1.3; // rad/sec
  const FREE_FLY_SPEED = 30; // units/sec at radius 60, scales with zoom like panSpeed does

  function normalizeKey(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }
  function isTypingTarget(el) {
    return !!el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA");
  }
  window.addEventListener("keydown", (e) => {
    const key = normalizeKey(e);
    if (!ROTATE_KEYS.has(key) || isTypingTarget(document.activeElement)) return;
    e.preventDefault(); // don't let arrow keys scroll the page
    keysDown.add(key);
  });
  window.addEventListener("keyup", (e) => {
    keysDown.delete(normalizeKey(e));
  });
  window.addEventListener("blur", () => keysDown.clear());

  function applyKeyboardControls(realDtMs) {
    if (!keysDown.size) return;
    const dt = realDtMs / 1000;
    const locked = !!selectedKey;
    const rotStep = KEY_ROTATE_SPEED * dt;
    let dTheta = 0;
    let dPhi = 0;
    if (keysDown.has("ArrowLeft")) dTheta += rotStep;
    if (keysDown.has("ArrowRight")) dTheta -= rotStep;
    if (keysDown.has("ArrowUp")) dPhi -= rotStep;
    if (keysDown.has("ArrowDown")) dPhi += rotStep;
    if (locked) {
      if (keysDown.has("a")) dTheta += rotStep;
      if (keysDown.has("d")) dTheta -= rotStep;
      if (keysDown.has("w")) dPhi -= rotStep;
      if (keysDown.has("s")) dPhi += rotStep;
    }
    if (dTheta || dPhi) {
      exitTourToFreeIfNeeded();
      if (!locked) clearFollow();
      camSpherical.theta += dTheta;
      camSpherical.phi += dPhi;
      updateCameraFromSpherical();
    }

    if (!locked) {
      let forward = 0;
      let strafe = 0;
      if (keysDown.has("w")) forward += 1;
      if (keysDown.has("s")) forward -= 1;
      if (keysDown.has("d")) strafe += 1;
      if (keysDown.has("a")) strafe -= 1;
      if (forward || strafe) {
        exitTourToFreeIfNeeded();
        clearFollow();
        const speed = FREE_FLY_SPEED * dt * (camSpherical.radius / 60 + 0.3);
        const viewDir = new THREE.Vector3();
        camera.getWorldDirection(viewDir);
        const right = new THREE.Vector3().crossVectors(viewDir, camera.up).normalize();
        const delta = new THREE.Vector3()
          .addScaledVector(viewDir, forward * speed)
          .addScaledVector(right, strafe * speed);
        controlsTarget.add(delta);
        camera.position.add(delta);
      }
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
        if (!selectedKey) clearFollow();
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
    const spaceObject = SPACE_OBJECTS.find((object) => object.key === key);
    if (spaceObject) return spaceObject;
    for (const obj of planetObjects) {
      if (obj.data.key === key) return obj.data;
      const moons = obj.data.moons || (obj.data.moon ? [obj.data.moon] : []);
      const moon = moons.find((m) => m.key === key);
      if (moon) return moon;
    }
    return null;
  }

  function selectAtScreenPoint(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const selectable = [
      sunMesh,
      ...planetObjects.flatMap((o) => [o.mesh, ...o.moonMeshes]),
      ...spaceObjects.map((object) => object.root),
    ];
    const intersects = raycaster.intersectObjects(selectable, true);
    if (intersects.length > 0) {
      const key = intersects[0].object.userData.dataKey;
      selectPlanet(key, true);
    } else if (selectedKey && !tourState.active) {
      // Clicking/tapping empty space breaks the lock onto a focused body.
      deselectBody();
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

  // Breaks the camera's lock onto a focused body: hides its info panel,
  // stops the camera from tracking it, and clears the deep-link.
  function deselectBody() {
    hideInfoPanel();
    clearFollow();
    setUrlBody(null);
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

  // A longer, softer S-curve than the cubic: it leaves and arrives almost
  // imperceptibly, which is what makes the Grand Tour's big moves (the
  // opening reveal, the inward sweep, the Jupiter swing) read as graceful
  // rather than as a slide. Used only where a move is long enough to earn it.
  function easeInOutQuint(t) {
    return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
  }

  function getWorldPositionForKey(key) {
    if (key === "sun") return new THREE.Vector3(0, 0, 0);
    const spaceObject = spaceObjects.find((object) => object.data.key === key);
    if (spaceObject) return spaceObject.root.getWorldPosition(new THREE.Vector3());
    const obj = planetObjects.find((o) => o.data.key === key);
    if (obj) {
      const worldPos = new THREE.Vector3();
      obj.mesh.getWorldPosition(worldPos);
      return worldPos;
    }
    for (const planet of planetObjects) {
      const moonIndex = (planet.data.moons || (planet.data.moon ? [planet.data.moon] : []))
        .findIndex((moon) => moon.key === key);
      if (moonIndex >= 0) {
        return planet.moonMeshes[moonIndex].getWorldPosition(new THREE.Vector3());
      }
    }
    const worldPos = new THREE.Vector3();
    return worldPos;
  }

  // Live world position of one of a planet's moons, by moon name. Moons are
  // parented to the (tilted, orbiting) planet mesh, so this is the only
  // honest way to get their position — there is no static value to use.
  function getMoonWorldPosition(planetKey, moonName) {
    const obj = planetObjects.find((o) => o.data.key === planetKey);
    if (!obj) return new THREE.Vector3();
    const defs = obj.data.moons || (obj.data.moon ? [obj.data.moon] : []);
    const i = defs.findIndex((m) => m.name === moonName);
    const mesh = obj.moonMeshes[i < 0 ? 0 : i];
    return mesh ? mesh.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  }

  // Builds a camera offset direction expressed RELATIVE TO THE SUNLIGHT on a
  // body, which is the whole reason the Grand Tour can give every planet its
  // own look. The Sun is at the origin, so a body's own azimuth is the
  // direction its lit face points:
  //
  //   azimuth  0     camera outward of the body  -> fully lit disc
  //   azimuth ±π/2   camera off to the side      -> half-lit, terminator
  //   azimuth  π     camera between Sun and body -> backlit crescent
  //                  (and the Sun itself sits just behind the body, so its
  //                   bloom halo rims the limb — the "silhouette into light")
  //
  // `elevation` is the usual spherical phi: 0 is straight down the north
  // pole, π/2 is exactly in the body's orbital plane, > π/2 looks up at it.
  function sunRelativeDir(bodyPos, azimuth, elevation) {
    // + π because a spherical offset built on the body's own azimuth places
    // the camera between the Sun and the body (i.e. on its night side);
    // shifting by half a turn makes azimuth 0 mean "sunlight over your
    // shoulder", which is the convention the shot list above is written in.
    const theta = Math.atan2(bodyPos.x, bodyPos.z) + Math.PI + azimuth;
    return new THREE.Vector3().setFromSpherical(new THREE.Spherical(1, elevation, theta));
  }

  // getTargetFn: () => THREE.Vector3, evaluated live every frame (both during
  // the flight and afterwards, via liveFollowFn) so the camera tracks a
  // moving target correctly instead of a fixed point captured at flight-start.
  //
  // `opts` (all optional) is the Grand Tour's extension point:
  //   dir      THREE.Vector3 — explicit offset direction from target to
  //            camera, sampled once here at flight start. Omit it and the
  //            camera keeps its current azimuth/elevation and only changes
  //            radius, which is the original (and still default) behaviour.
  //   follow   false to not leave liveFollowFn set (used for fixed staging
  //            points, where locking on afterwards would serve no purpose).
  //   onProgress(t) — optional, called every frame of the flight with the
  //            RAW (unequal, linear) 0..1 progress, for effects that want
  //            their own curve independent of the camera's easing (e.g. the
  //            Jupiter reveal's dusk cue). Flights that omit it reset the
  //            dusk cue to 0 immediately, so it can never leak into a shot
  //            that doesn't ask for it.
  function flyCameraTo(getTargetFn, distance, duration, onDone, opts) {
    const fromTarget = controlsTarget.clone();
    const options = opts || {};
    if (!options.onProgress) setDuskAmount(0);

    // Compute a nice viewing offset (keep current azimuth/elevation direction, but new radius)
    const dir = options.dir
      ? options.dir.clone().normalize()
      : new THREE.Vector3().setFromSpherical(camSpherical).normalize();
    const desiredSph = new THREE.Spherical().setFromVector3(dir.clone().multiplyScalar(distance));

    // Azimuth is periodic, so a naive lerp from e.g. 3.0 to -3.0 rad would
    // whip the camera nearly all the way around the system instead of
    // crossing the ±π seam. Only ever take the short way round: the original
    // tours never changed theta, but every Grand Tour stop does.
    let dTheta = desiredSph.theta - camSpherical.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    desiredSph.theta = camSpherical.theta + dTheta;

    liveFollowFn = options.follow === false ? null : getTargetFn;
    // "flight" keeps the destination direction fresh only while flying;
    // `true` also holds it for the dwell that follows (see liveDirFn).
    liveDirFn = options.liveDir === true ? options.getDir : null;

    cameraAnim = {
      fromTarget,
      getTarget: getTargetFn,
      getDir: options.liveDir ? options.getDir : null,
      fromSph: camSpherical.clone(),
      toSph: desiredSph,
      useTourArc: options.tourArc === true,
      avoidJupiter: options.avoidJupiter !== false,
      start: performance.now(),
      duration,
      onDone,
      onProgress: options.onProgress || null,
      ease: options.ease || easeInOutCubic,
    };
  }

  function getTourViewDistance(key) {
    const data = getDataByKey(key);
    const radius = data.radius || data.focusDistance || 3;
    // Sub-unit bodies (the dwarf planets) need a much closer stop than the
    // radius x 5 / 8-unit floor used for planets, or the tour and click-to-
    // select would frame Ceres and Pluto as barely-visible dots.
    return data.viewDistance
      || (radius < 1 ? Math.max(radius * 14, 3.5) : Math.max(radius * 5, 8));
  }

  function flyCameraToKey(key, durationScale, opts) {
    const viewDist = getTourViewDistance(key);
    flyCameraTo(
      () => getWorldPositionForKey(key),
      viewDist,
      1800 * (durationScale || 1),
      null,
      opts
    );
  }

  function updateCameraAnim(now) {
    if (!cameraAnim) return;
    const t = Math.min(1, (now - cameraAnim.start) / cameraAnim.duration);
    const e = cameraAnim.ease ? cameraAnim.ease(t) : easeInOutCubic(t);
    if (cameraAnim.onProgress) cameraAnim.onProgress(t);

    // Re-evaluate the live target every frame so fast-moving planets (e.g.
    // Mercury) don't cause the camera to converge on a stale position.
    const liveTarget = cameraAnim.getTarget();
    controlsTarget.lerpVectors(cameraAnim.fromTarget, liveTarget, e);
    if (cameraAnim.useTourArc && t > 0 && t < 1) {
      const direct = liveTarget.clone().sub(cameraAnim.fromTarget);
      const lift = Math.max(5, direct.length() * 0.14);
      const outward = cameraAnim.fromTarget.clone().add(liveTarget);
      if (outward.lengthSq() < 1e-6) outward.crossVectors(direct, camera.up);
      if (outward.lengthSq() < 1e-6) outward.set(0, 1, 0);
      outward.normalize();
      controlsTarget
        .addScaledVector(outward, lift * Math.sin(Math.PI * e))
        .addScaledVector(camera.up, lift * 0.6 * Math.sin(Math.PI * e));
    }

    // Re-derive the destination angles from a still-moving reference frame
    // (a fast-orbiting moon) if this flight asked for it.
    if (cameraAnim.getDir) {
      const d = cameraAnim.getDir().clone().normalize();
      const s = new THREE.Spherical().setFromVector3(d);
      cameraAnim.toSph.phi = s.phi;
      let dTheta = s.theta - cameraAnim.fromSph.theta;
      while (dTheta > Math.PI) dTheta -= Math.PI * 2;
      while (dTheta < -Math.PI) dTheta += Math.PI * 2;
      cameraAnim.toSph.theta = cameraAnim.fromSph.theta + dTheta;
    }

    camSpherical.radius = THREE.MathUtils.lerp(cameraAnim.fromSph.radius, cameraAnim.toSph.radius, e);
    camSpherical.theta = THREE.MathUtils.lerp(cameraAnim.fromSph.theta, cameraAnim.toSph.theta, e);
    camSpherical.phi = THREE.MathUtils.lerp(cameraAnim.fromSph.phi, cameraAnim.toSph.phi, e);

    updateCameraFromSpherical();
    if (cameraAnim.avoidJupiter) {
      const jupiter = planetObjects.find((object) => object.data.key === "jupiter");
      if (jupiter) {
        const jupiterPosition = jupiter.mesh.getWorldPosition(new THREE.Vector3());
        const clearance = jupiter.data.radius + 3.2;
        const offset = camera.position.clone().sub(jupiterPosition);
        if (offset.lengthSq() < clearance * clearance) {
          if (offset.lengthSq() < 1e-6) offset.copy(camera.position).sub(controlsTarget);
          if (offset.lengthSq() < 1e-6) offset.set(0, 1, 0);
          camera.position.copy(jupiterPosition).addScaledVector(offset.normalize(), clearance);
          camera.lookAt(controlsTarget);
        }
      }
    }

    if (t >= 1) {
      const done = cameraAnim.onDone;
      cameraAnim = null;
      if (done) done();
    }
  }

  // ---------------------------------------------------------------------
  // Simulation playback controls (pause + speed)
  //
  // This is a PLAYBACK-RATE control, not a data edit: nothing here mutates
  // the `orbitSpeed` / `rotationSpeed` / moon `orbitSpeed` values in data.js.
  // The multiplier is applied once, to the per-frame delta time in animate(),
  // so every body speeds up or slows down by the same factor and the
  // real-relative-speed ordering baked into the data stays exactly intact.
  //
  // Deliberately independent of the guided tour's "pace" control, which only
  // changes how long the camera dwells at each stop. Pause/speed are never
  // reset by starting or stopping a tour — if a teacher sets 0.25× to talk
  // through Mercury's orbit, starting a tour keeps that setting.
  // ---------------------------------------------------------------------
  const SIM_SPEEDS = [0.25, 0.5, 1, 2, 4];

  const simState = {
    paused: false,
    speed: 1,
  };

  const simPauseBtn = document.getElementById("simPauseBtn");
  const simSpeedSelect = document.getElementById("simSpeed");

  function updateSimPauseButton() {
    if (!simPauseBtn) return;
    simPauseBtn.textContent = simState.paused ? "▶ Play" : "⏸ Pause";
    simPauseBtn.classList.toggle("toggled", simState.paused);
    simPauseBtn.setAttribute("aria-pressed", String(simState.paused));
    simPauseBtn.title = simState.paused
      ? "Resume all orbits and spins"
      : "Freeze or resume all orbits and spins (you can still move the camera while paused)";
  }

  function setSimPaused(paused) {
    simState.paused = !!paused;
    updateSimPauseButton();
    // Keep the tour bar's own pause label honest: a global pause also holds
    // the tour in place (see tourClock).
    updateTourPauseButton();
  }

  if (simPauseBtn) {
    simPauseBtn.addEventListener("click", () => setSimPaused(!simState.paused));
  }

  function applySimSpeedFromSelect() {
    if (!simSpeedSelect) return;
    const value = parseFloat(simSpeedSelect.value);
    // Guard against a hand-edited/unknown option value rather than letting
    // NaN silently freeze (or explode) the simulation.
    simState.speed = SIM_SPEEDS.includes(value) ? value : 1;
  }

  if (simSpeedSelect) {
    simSpeedSelect.addEventListener("change", applySimSpeedFromSelect);
  }
  updateSimPauseButton();
  // Browsers restore <select> state across a soft reload, so read the control
  // once at startup rather than assuming it still shows the `selected` 1x
  // option — otherwise the dropdown could say 4x while the sim ran at 1x.
  applySimSpeedFromSelect();

  // ---------------------------------------------------------------------
  // Guided tour
  // ---------------------------------------------------------------------
  const tourBtn = document.getElementById("tourBtn");
  const tourBar = document.getElementById("tourBar");
  const tourNarration = document.getElementById("tourNarration");
  const tourTimeline = document.getElementById("tourTimeline");
  const tourTimelineTrack = document.getElementById("tourTimelineTrack");
  const tourPrevBtn = document.getElementById("tourPrev");
  const tourNextBtn = document.getElementById("tourNext");
  const tourPauseBtn = document.getElementById("tourPause");
  const tourExitBtn = document.getElementById("tourExit");
  const resetBtn = document.getElementById("resetBtn");
  const browseToursBtn = document.getElementById("browseToursBtn");
  const tourPickerModal = document.getElementById("tourPickerModal");
  const tourPickerCloseBtn = document.getElementById("tourPickerCloseBtn");
  const tourPickerImage = document.getElementById("tourPickerImage");
  const tourPickerName = document.getElementById("tourPickerName");
  const tourPickerDescription = document.getElementById("tourPickerDescription");
  const tourPickerStatus = document.getElementById("tourPickerStatus");
  const tourPickerPrevBtn = document.getElementById("tourPickerPrevBtn");
  const tourPickerNextBtn = document.getElementById("tourPickerNextBtn");
  const tourPickerStartBtn = document.getElementById("tourPickerStartBtn");
  const bodySelect = document.getElementById("bodySelect");
  const tourScopeSelect = document.getElementById("tourScope");
  const tourSpeedSelect = document.getElementById("tourSpeed");

  if (tourScopeSelect) {
    tourScopeSelect.value = "grand";
  }

  if (bodySelect) {
    const sunOption = document.createElement("option");
    sunOption.value = SUN.key;
    sunOption.textContent = SUN.name;
    bodySelect.appendChild(sunOption);
    PLANETS.forEach((planet) => {
      const group = document.createElement("optgroup");
      group.label = planet.name;
      const planetOption = document.createElement("option");
      planetOption.value = planet.key;
      planetOption.textContent = planet.name;
      group.appendChild(planetOption);
      (planet.moons || (planet.moon ? [planet.moon] : [])).forEach((moon) => {
        const moonOption = document.createElement("option");
        moonOption.value = moon.key;
        moonOption.textContent = `  ${moon.name}`;
        group.appendChild(moonOption);
      });
      bodySelect.appendChild(group);
    });
    const spaceGroup = document.createElement("optgroup");
    spaceGroup.label = "Space objects";
    SPACE_OBJECTS.forEach((object) => {
      const option = document.createElement("option");
      option.value = object.key;
      option.textContent = object.name;
      spaceGroup.appendChild(option);
    });
    bodySelect.appendChild(spaceGroup);
    bodySelect.addEventListener("change", () => {
      if (bodySelect.value) selectPlanet(bodySelect.value, true);
      bodySelect.value = "";
    });
  }

  // The tour bar wraps to a variable number of rows on narrow screens, and
  // the mobile info sheet has to sit directly above it. Publish the measured
  // height as `--tourbar-h` so index.html's responsive rules can offset the
  // sheet without hardcoding a guess (see the responsive block there).
  // `--topbar-h` does the same job for the top-right info panel, which has to
  // clear a topbar that grows as the control pills wrap.
  const topbarEl = document.getElementById("topbar");
  const appEl = document.getElementById("app");
  function syncChromeHeights() {
    const root = document.documentElement.style;
    root.setProperty("--tourbar-h", `${Math.round(tourBar.offsetHeight)}px`);
    if (topbarEl) {
      root.setProperty("--topbar-h", `${Math.round(topbarEl.offsetHeight)}px`);
    }
  }
  if (typeof ResizeObserver !== "undefined") {
    const chromeObserver = new ResizeObserver(syncChromeHeights);
    chromeObserver.observe(tourBar);
    if (topbarEl) chromeObserver.observe(topbarEl);
  }
  syncChromeHeights();

  const moonBodies = PLANETS.flatMap((planet) => planet.moons || (planet.moon ? [planet.moon] : []));

  // Tour scopes determine which bodies (besides the closing "__end__" stop)
  // are visited. The standard full tour keeps its planet order and inserts
  // only featured moons; Moon Tour is the complete tour of every moon shown.
  const TOUR_SCOPES = {
    full: ["sun", ...PLANETS.flatMap((planet) => [
      planet.key,
      ...(planet.moons || (planet.moon ? [planet.moon] : []))
        .filter((moon) => moon.featured)
        .map((moon) => moon.key),
    ])],
    moons: moonBodies.map((moon) => moon.key),
    space: SPACE_OBJECTS.map((object) => object.key),
    inner: ["mercury", "venus", "earth", "mars"],
    outer: ["jupiter", "saturn", "uranus", "neptune"],
    dwarf: PLANETS.filter((p) => p.dwarf).map((p) => p.key),
  };

  const TOUR_CHOICES = [
    {
      key: "grand",
      name: "Grand Tour",
      description: "A cinematic route from the Oort Cloud through the Solar System's defining worlds.",
      image: "media/tours/grand.jpg",
      alt: "Jupiter framed during the Grand Tour",
    },
    {
      key: "full",
      name: "Full Tour",
      description: "Visit the Sun, planets, dwarf planets, and the featured moons in distance order.",
      image: "media/tours/full.jpg",
      alt: "The Solar System seen from above",
    },
    {
      key: "moons",
      name: "Moon Tour",
      description: "Explore every moon modeled in the simulator, from Phobos to Charon.",
      image: "media/tours/moons.jpg",
      alt: "Callisto beside Jupiter",
    },
    {
      key: "space",
      name: "Space Objects Tour",
      description: "Meet the observatories, station, and spacecraft that carry exploration beyond Earth.",
      image: "media/screenshot.png",
      alt: "Solar System simulator overview",
    },
    {
      key: "inner",
      name: "Inner Planets",
      description: "A focused circuit of Mercury, Venus, Earth, and Mars.",
      image: "media/tours/inner.jpg",
      alt: "Venus in the inner Solar System",
    },
    {
      key: "outer",
      name: "Outer Planets",
      description: "Travel outward through the giant planets and their distant blue horizons.",
      image: "media/tours/outer.jpg",
      alt: "Saturn and its rings",
    },
    {
      key: "dwarf",
      name: "Dwarf Planets",
      description: "Visit Ceres in the asteroid belt and Pluto beyond Neptune.",
      image: "media/tours/dwarf.jpg",
      alt: "Pluto at the edge of the Solar System",
    },
  ];
  let tourPickerIndex = Math.max(0, TOUR_CHOICES.findIndex((choice) => choice.key === tourScopeSelect?.value));

  function renderTourPicker() {
    const choice = TOUR_CHOICES[tourPickerIndex];
    if (!choice || !tourPickerImage) return;
    tourPickerImage.src = `${import.meta.env.BASE_URL}${choice.image}`;
    tourPickerImage.alt = choice.alt;
    tourPickerName.textContent = choice.name;
    tourPickerDescription.textContent = choice.description;
    tourPickerStatus.textContent = `${tourPickerIndex + 1} / ${TOUR_CHOICES.length}`;
    tourPickerPrevBtn.disabled = tourPickerIndex === 0;
    tourPickerNextBtn.disabled = tourPickerIndex === TOUR_CHOICES.length - 1;
  }

  function openTourPicker() {
    const current = TOUR_CHOICES.findIndex((choice) => choice.key === tourScopeSelect?.value);
    tourPickerIndex = current >= 0 ? current : 0;
    renderTourPicker();
    tourPickerModal.classList.add("visible");
    tourPickerCloseBtn.focus();
  }

  function closeTourPicker() {
    tourPickerModal.classList.remove("visible");
    browseToursBtn.focus();
  }

  browseToursBtn?.addEventListener("click", openTourPicker);
  tourPickerCloseBtn?.addEventListener("click", closeTourPicker);
  tourPickerModal?.addEventListener("click", (e) => {
    if (e.target === tourPickerModal) closeTourPicker();
  });
  tourPickerPrevBtn?.addEventListener("click", () => {
    if (tourPickerIndex > 0) {
      tourPickerIndex -= 1;
      renderTourPicker();
    }
  });
  tourPickerNextBtn?.addEventListener("click", () => {
    if (tourPickerIndex < TOUR_CHOICES.length - 1) {
      tourPickerIndex += 1;
      renderTourPicker();
    }
  });
  tourPickerStartBtn?.addEventListener("click", () => {
    tourScopeSelect.value = TOUR_CHOICES[tourPickerIndex].key;
    closeTourPicker();
    startTour();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tourPickerModal?.classList.contains("visible")) closeTourPicker();
  });

  // Dwell duration (ms) per stop for each speed preset. "normal" matches the
  // original hardcoded 4200ms duration.
  const TOUR_SPEEDS = {
    relaxed: 7000,
    normal: 4200,
    quick: 2400,
  };

  // ---------------------------------------------------------------------
  // The Grand Tour — a directed, cinematic scope
  //
  // The other scopes are lists of body keys: every stop is framed the same
  // generic way (keep the camera's current angle, change the radius). The
  // Grand Tour is instead a SHOT LIST — an ordered array of stop objects,
  // each of which composes its own shot. That is the whole extension: the
  // machinery below (tourStops / goToTourStop / armDwell / tourClock /
  // prev-next / pause) is shared unchanged, and `goToTourStop` simply
  // branches on whether a stop is a string (classic) or an object (directed).
  //
  // Stop fields, all optional except `label`:
  //   key        body to select + open the info panel for. Omitted = a pure
  //              camera beat (the opening, the dark run) with no panel.
  //   target     () => Vector3 the camera looks at. Defaults to `key`'s live
  //              world position, so it tracks the body as it orbits.
  //   dir        () => Vector3 offset direction target -> camera. This is
  //              what makes each body's resting viewpoint distinct; nearly
  //              all of them are built with sunRelativeDir() so the framing
  //              is defined against the sunlight, not against arbitrary
  //              world axes that the body drifts through as it orbits.
  //   distance   camera radius at the end of the move.
  //   duration   flight time in ms (real time, like every camera flight).
  //   dwell      multiplier on the user's chosen dwell pace. This is how the
  //              rhythm varies — big beats hold at 1.6-1.9x, connective
  //              beats at 0.4x — WITHOUT overriding the pace the user picked.
  //   ease       easing curve; long moves use easeInOutQuint.
  //   snap       place the camera instantly rather than flying (used once,
  //              for the very first frame of the tour).
  //
  // Structure: deep-space opening (2 beats) -> inward sweep onto the Sun ->
  // inner planets -> Ceres in the belt -> the Jupiter set piece (3 beats) ->
  // outer planets -> Pluto -> the closing pull-back.
  // ---------------------------------------------------------------------

  // The moon the Jupiter set piece is staged around. Callisto is the
  // outermost Galilean (8.9 units out), which buys the most room to sit on
  // the far side of it with Jupiter safely behind the camera.
  const JUPITER_STAGE_MOON = "Callisto";

  // Unit vector pointing from Jupiter out through the staging moon: the
  // "away from Jupiter" axis the whole set piece is built on.
  function jupiterMoonOutwardDir() {
    const moon = getMoonWorldPosition("jupiter", JUPITER_STAGE_MOON);
    const dir = moon.clone().sub(getWorldPositionForKey("jupiter"));
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    return dir.normalize();
  }

  // The dark run's two fixed staging points. The camera climbs steeply out of
  // the ecliptic just inside Callisto's orbit and stares up and outward into
  // empty sky: Jupiter ends up ~70° off the view axis and 30 units below,
  // which is what keeps it out of frame for the whole approach. (Aiming the
  // run at anything on the far side of Jupiter cannot work — to look past
  // Jupiter you have to look AT Jupiter.)
  function jupiterDarkRunTarget() {
    const out = jupiterMoonOutwardDir();
    return getWorldPositionForKey("jupiter")
      .clone()
      .addScaledVector(out, 55)
      .add(new THREE.Vector3(0, 70, 0));
  }
  function jupiterDarkRunCamera() {
    const out = jupiterMoonOutwardDir();
    return getWorldPositionForKey("jupiter")
      .clone()
      .addScaledVector(out, 11)
      .add(new THREE.Vector3(0, 18, 0));
  }

  function spaceObjectFlybyTarget(key, direction, offset) {
    return getWorldPositionForKey(key).clone().add(
      direction.clone().normalize().multiplyScalar(offset || 4)
    );
  }

  const GRAND_TOUR = [
    {
      // A deliberately compressed Oort Cloud shell, far beyond the planets.
      label: "The Oort Cloud",
      snap: true,
      target: () => new THREE.Vector3(0, 0, 0),
      dir: () => sunRelativeDir(new THREE.Vector3(), 0.9, 1.36),
      distance: OORT_CLOUD_CAMERA_DISTANCE,
      follow: false,
    },
    {
      label: "A frozen shell around the Sun",
      target: () => new THREE.Vector3(0, 0, 0),
      dir: () => sunRelativeDir(new THREE.Vector3(), 0.9, 1.34),
      distance: 1040,
      duration: 7000,
      ease: easeInOutQuint,
      dwell: 0.7,
      follow: false,
    },
    {
      // A slow, unselected pass by Voyager 1 on the way toward the system.
      label: "Approaching the inner system",
      target: () => spaceObjectFlybyTarget("voyager-1", new THREE.Vector3(-1, 0.2, 0.7), 1.8),
      dir: () => new THREE.Vector3(0.7, 0.18, -1),
      distance: 2.5,
      duration: 18000,
      ease: easeInOutQuint,
      advanceOnArrival: true,
      follow: false,
      silent: true,
    },
    {
      // The reveal: a long draw-in that also rises out of the plane, so the
      // orbits open from a single line into the whole system laid out.
      label: "Our Solar System",
      target: () => new THREE.Vector3(0, 0, 0),
      dir: () => sunRelativeDir(new THREE.Vector3(), 0.55, 0.78),
      distance: OVERVIEW_DISTANCE,
      duration: 11000,
      ease: easeInOutQuint,
      dwell: 1.5,
      follow: false,
    },
    {
      // The sweep: one continuous, very long eased move from the overview
      // down through the outer orbits and onto the Sun. No cut.
      key: "sun",
      label: "Sun",
      dir: () => sunRelativeDir(new THREE.Vector3(), 0.2, 1.32),
      distance: 22,
      duration: 12000,
      ease: easeInOutQuint,
      dwell: 1.5,
    },
    {
      key: "mercury",
      label: "Mercury",
      // Hard sidelight across a battered, airless world: the terminator runs
      // straight down the middle and the craters catch the light.
      dir: () => sunRelativeDir(getWorldPositionForKey("mercury"), -1.35, 1.28),
      distance: 4.2,
      duration: 5200,
      dwell: 0.9,
    },
    {
      key: "venus",
      label: "Venus",
      // The most intimate framing in the tour: close enough that the cloud
      // deck fills the frame, three-quarter lit so the swirls have shape.
      // (A backlit crescent was tried first and doesn't work here — Venus
      // orbits only 15 units out, so anything past ~110° puts the Sun's
      // whole disc in shot and Venus goes to unreadable silhouette. The
      // tour's backlit beat is Pluto, where the Sun is a distant spark.)
      dir: () => sunRelativeDir(getWorldPositionForKey("venus"), 0.95, 1.18),
      distance: 3.4,
      duration: 5600,
      ease: easeInOutQuint,
      dwell: 1.1,
    },
    {
      key: "earth",
      label: "Earth",
      // Dead-on terminator, from slightly above: day, night and the sweep of
      // cloud between them all in one frame. The Moon drifts through too.
      dir: () => sunRelativeDir(getWorldPositionForKey("earth"), 1.5, 1.26),
      distance: 5.0,
      duration: 5600,
      dwell: 1.4,
    },
    {
      key: "moon",
      label: "Moon",
      dir: () => sunRelativeDir(getWorldPositionForKey("moon"), 0.7, 1.16),
      distance: 3.5,
      duration: 4200,
      dwell: 1.0,
    },
    {
      key: "mars",
      label: "Mars",
      // Low and looking up at a fully lit disc — the one framing that sells
      // the colour rather than the shadow.
      dir: () => sunRelativeDir(getWorldPositionForKey("mars"), 0.3, 1.74),
      distance: 4.0,
      duration: 5200,
      dwell: 1.0,
    },
    {
      key: "ceres",
      label: "Ceres",
      // Down into the plane of the belt, so the asteroids read as a band
      // running edge-on across the frame with Ceres sitting in it.
      dir: () => sunRelativeDir(getWorldPositionForKey("ceres"), -0.9, 1.53),
      distance: 4.6,
      duration: 6000,
      dwell: 1.0,
    },
    {
      // --- Jupiter set piece, beat 1: the dark run. -------------------
      // A steep climb out of the ecliptic to a vantage just inside
      // Callisto's orbit, looking up and outward into empty sky. Jupiter is
      // below and ~170° off the view axis the whole way, so the
      // audience is carried right up to the largest thing in the system
      // without ever seeing it. (Aiming the run at a point on the FAR side
      // of Jupiter cannot work — to look past Jupiter you must look at it.)
      label: "Climbing out into the dark…",
      target: jupiterDarkRunTarget,
      camera: jupiterDarkRunCamera,
      fixedTarget: true,
      freezeMoonOrbits: true,
      avoidJupiter: false,
      duration: 8000,
      ease: easeInOutQuint,
      dwell: 0.4,
      follow: false,
    },
    {
      // --- beat 2: arrive at the moon, Jupiter still off screen. ------
      // The camera drops to a point BETWEEN Jupiter and Callisto and looks
      // OUTWARD at the moon, which puts Jupiter squarely behind it. (The
      // opposite arrangement — sitting outside the moon looking in — frames
      // Callisto against a Jupiter that fills the screen, which is exactly
      // the reveal we are saving.) `liveDir` holds that geometry through the
      // dwell. The whole Jupiter set piece freezes moon motion so this
      // deliberately precise line stays visually stable.
      key: "callisto",
      label: "Callisto",
      target: () => getMoonWorldPosition("jupiter", JUPITER_STAGE_MOON),
      dir: () => jupiterMoonOutwardDir().negate(),
      liveDir: true,
      freezeMoonOrbits: true,
      avoidJupiter: false,
      distance: 2.0,
      duration: 6500,
      ease: easeInOutQuint,
      // A bit more hold than a connective beat gets elsewhere: this is the
      // last quiet moment before the swing, and the dusk cue (see beat 3)
      // needs Callisto sitting still on screen for a beat before it starts.
      dwell: 1.6,
    },
    {
      // --- beat 3: the entrance. --------------------------------------
      // From behind Callisto the camera swings a half turn and settles
      // facing Jupiter from 9 units out: a 3.8-unit radius seen from 9 is
      // ~45° of sky, nearly the full height of the frame. Tipped below the
      // equator so we are looking UP at it.
      //
      // This is the emotional payoff of the whole set piece, so it is
      // deliberately much slower than a normal beat (15s vs ~6-7s elsewhere)
      // and paired with `onProgress` driving the scene-wide "dusk" cue
      // (setDuskAmount, declared with the lights above): ambient/sun
      // intensity dip as if the giant's mass is starting to occlude the
      // Sun, well before Jupiter is far enough round to be seen — the
      // audience *feels* it arrive before the swing brings it into frame.
      // The dip peaks at t=0.7 (Jupiter is on screen by then: the info
      // panel itself reveals at 0.78, see goToDirectedStop) and eases back
      // most of the way by t=1, so the final held frame reads as Jupiter's
      // own lit face rather than a scene stuck in shadow.
      key: "jupiter",
      label: "Jupiter",
      dir: () => {
        const out = jupiterMoonOutwardDir();
        const sph = new THREE.Spherical().setFromVector3(out);
        // keep the azimuth, drop the elevation below the equator
        return new THREE.Vector3().setFromSpherical(
          new THREE.Spherical(1, Math.min(sph.phi + 0.42, 2.6), sph.theta)
        );
      },
      // live only for the flight: the destination angle keeps tracking
      // Callisto so the pivot starts exactly where the camera already is,
      // then locks so the dwell is a steady held shot of Jupiter.
      liveDir: "flight",
      freezeMoonOrbits: true,
      avoidJupiter: false,
      distance: 9,
      duration: 15000,
      ease: easeInOutQuint,
      onProgress: (t) => {
        // Rise 0->1 across the first 70% (the "dawning awareness" while
        // Jupiter is still swinging into view), then ease back to a mild
        // residual dusk (0.15) by the end so the held reveal frame isn't
        // stuck dark.
        let amount;
        if (t < 0.7) amount = t / 0.7;
        else amount = 1 - ((t - 0.7) / 0.3) * 0.85;
        setDuskAmount(amount);
      },
      dwell: 2.2,
    },
    {
      key: "io",
      label: "Io",
      dir: () => sunRelativeDir(getWorldPositionForKey("io"), -0.85, 1.24),
      distance: 3.5,
      duration: 4400,
      dwell: 1.1,
    },
    {
      key: "europa",
      label: "Europa",
      dir: () => sunRelativeDir(getWorldPositionForKey("europa"), 0.9, 1.18),
      distance: 3.5,
      duration: 4600,
      dwell: 1.2,
    },
    {
      key: "ganymede",
      label: "Ganymede",
      dir: () => sunRelativeDir(getWorldPositionForKey("ganymede"), -0.7, 1.22),
      distance: 4.1,
      duration: 4400,
      dwell: 1.1,
    },
    {
      key: "saturn",
      label: "Saturn",
      // Thirty degrees above the plane and three-quarters lit: the only
      // angle that opens the rings into a full ellipse and throws the
      // planet's shadow across them.
      dir: () => sunRelativeDir(getWorldPositionForKey("saturn"), 0.75, 1.0),
      distance: 17,
      duration: 7000,
      ease: easeInOutQuint,
      dwell: 1.7,
    },
    {
      key: "titan",
      label: "Titan",
      dir: () => sunRelativeDir(getWorldPositionForKey("titan"), 0.9, 1.2),
      distance: 4.1,
      duration: 4800,
      dwell: 1.2,
    },
    {
      key: "enceladus",
      label: "Enceladus",
      dir: () => sunRelativeDir(getWorldPositionForKey("enceladus"), -0.8, 1.15),
      distance: 2.8,
      duration: 4300,
      dwell: 1.0,
    },
    {
      key: "uranus",
      label: "Uranus",
      // Near the plane and mostly backlit, which stands its tipped-over
      // rings up as a vertical bullseye against the dark — the one framing
      // that makes a 98° axial tilt legible on a featureless ball.
      dir: () => sunRelativeDir(getWorldPositionForKey("uranus"), 2.3, 1.16),
      distance: 11,
      duration: 6400,
      dwell: 1.2,
    },
    {
      key: "neptune",
      label: "Neptune",
      // From below and far back: a small, deep blue, fully lit disc with a
      // lot of empty space around it. Distance is the point here.
      dir: () => sunRelativeDir(getWorldPositionForKey("neptune"), -0.35, 1.9),
      distance: 13,
      duration: 6400,
      ease: easeInOutQuint,
      dwell: 1.2,
    },
    {
      key: "pluto",
      label: "Pluto",
      // The coldest framing in the tour: backlit, close, tiny, with Charon
      // swinging around it. The Sun is now just another bright star.
      dir: () => sunRelativeDir(getWorldPositionForKey("pluto"), 2.6, 1.42),
      distance: 3.6,
      duration: 6000,
      dwell: 1.3,
    },
    {
      key: "charon",
      label: "Charon",
      dir: () => sunRelativeDir(getWorldPositionForKey("charon"), 0.8, 1.18),
      distance: 2.8,
      duration: 4200,
      dwell: 1.0,
    },
    {
      // Close: rise back out of the plane to the whole system, held long.
      label: "Tour complete",
      target: () => new THREE.Vector3(0, 0, 0),
      dir: () => sunRelativeDir(new THREE.Vector3(), -0.6, 0.7),
      distance: OVERVIEW_DISTANCE,
      duration: 12000,
      ease: easeInOutQuint,
      dwell: 1.0,
      follow: false,
    },
  ];

  let tourStops = [...TOUR_SCOPES.full, "__end__"];

  // Pausable clock (ms) driving the tour's dwell / "Tour complete" timers.
  // It is advanced from animate() only while the tour is neither self-paused
  // (tour bar Pause button) nor frozen by the global simulation pause, so a
  // paused simulation also stops the tour marching on to the next planet —
  // otherwise the camera would keep touring a completely frozen system, which
  // reads as broken. Deadlines are compared against this clock instead of
  // using setTimeout precisely so "pause" needs no remaining-time bookkeeping:
  // stopping the clock stops every pending tour timer exactly where it was.
  //
  // Camera flights (updateCameraAnim) and the fact-reveal timer intentionally
  // stay on real time, so click-to-select, Reset View and an in-progress tour
  // transition still complete smoothly while paused.
  let tourClock = 0;

  const tourState = {
    active: false,
    paused: false,
    freezeMoonOrbits: false,
    index: 0,
    // Absolute deadlines on tourClock, or null when nothing is pending.
    dwellDeadline: null,
    finishDeadline: null,
    dwellDuration: TOUR_SPEEDS.normal,
  };

  function isTourClockRunning() {
    return tourState.active && !tourState.paused && !simState.paused;
  }

  function clearTourTimers() {
    tourState.dwellDeadline = null;
    tourState.finishDeadline = null;
  }

  function updateTourTimers() {
    if (!tourState.active) return;
    if (tourState.dwellDeadline !== null && tourClock >= tourState.dwellDeadline) {
      tourState.dwellDeadline = null;
      goToTourStop(tourState.index + 1);
    }
    if (tourState.finishDeadline !== null && tourClock >= tourState.finishDeadline) {
      tourState.finishDeadline = null;
      stopTour();
      hideInfoPanel();
    }
  }

  function tourStopLabel(key) {
    if (typeof key === "object" && key) return key.label;
    if (key === "__end__") return "Tour complete";
    const data = getDataByKey(key);
    return data ? data.name : key;
  }

  function renderTourTimeline() {
    if (!tourTimelineTrack) return;
    tourTimelineTrack.replaceChildren();
    tourStops.forEach((stop, index) => {
      if (typeof stop === "object" && stop.silent) return;
      const segment = document.createElement("button");
      segment.type = "button";
      segment.className = "timeline-segment";
      segment.dataset.index = String(index);
      segment.setAttribute("aria-label", `Jump to ${tourStopLabel(stop)}`);
      segment.title = `Jump to ${tourStopLabel(stop)}`;
      segment.addEventListener("click", () => goToTourStop(index));
      tourTimelineTrack.appendChild(segment);
    });
    tourTimeline.classList.add("visible");
  }

  function updateTourTimeline() {
    if (!tourTimelineTrack || !tourState.active) return;
    const segments = tourTimelineTrack.querySelectorAll(".timeline-segment");
    segments.forEach((segment) => {
      segment.classList.toggle("active", Number(segment.dataset.index) === tourState.index);
    });
  }

  function showTourNarration(label) {
    if (!tourNarration) return;
    tourNarration.textContent = label;
    tourNarration.classList.remove("visible");
    void tourNarration.offsetWidth;
    tourNarration.classList.add("visible");
  }

  function startTour() {
    const scopeName = tourScopeSelect?.value;
    if (scopeName === "grand") {
      // The Grand Tour supplies its own closing pull-back, so no "__end__".
      tourStops = GRAND_TOUR;
    } else {
      const scope = TOUR_SCOPES[scopeName] || TOUR_SCOPES.full;
      tourStops = [...scope, "__end__"];
    }
    tourState.dwellDuration =
      TOUR_SPEEDS[tourSpeedSelect?.value] || TOUR_SPEEDS.normal;
    tourState.active = true;
    tourState.paused = false;
    tourState.freezeMoonOrbits = false;
    tourState.index = 0;
    clearTourTimers();
    updateTourPauseButton();
    tourBar.classList.add("visible");
    // #topbar precedes #tourBar in the DOM, so tour-active remains available
    // for responsive chrome without disabling the active setup controls.
    appEl?.classList.add("tour-active");
    tourBtn.textContent = "▶ Start Tour";
    updateMusicMix();
    renderTourTimeline();
    goToTourStop(0);
  }

  function stopTour(showReset) {
    tourState.active = false;
    tourState.paused = false;
    tourState.freezeMoonOrbits = false;
    clearTourTimers();
    clearTimeout(tourState._revealTimer);
    updateTourPauseButton();
    tourBar.classList.remove("visible");
    appEl?.classList.remove("tour-active");
    clearFollow();
    tourNarration?.classList.remove("visible");
    tourTimeline?.classList.remove("visible");
    updateMusicMix();
    if (showReset !== false) {
      // no-op, kept for symmetry
    }
  }

  function goToTourStop(index) {
    clearTourTimers();
    if (index < 0) index = 0;
    if (index >= tourStops.length) {
      finishTour();
      return;
    }
    tourState.index = index;
    const key = tourStops[index];
    tourState.freezeMoonOrbits = typeof key === "object" && key.freezeMoonOrbits === true;
    if (!(typeof key === "object" && key.silent)) showTourNarration(tourStopLabel(key));
    updateTourTimeline();
    tourPrevBtn.disabled = index === 0;
    tourNextBtn.disabled = false;

    if (key === "__end__") {
      hideInfoPanel();
      // Pull back to a wide overview shot (fixed point, nothing to track)
      flyCameraTo(() => new THREE.Vector3(0, 0, 0), OVERVIEW_DISTANCE, 2200, () => {
        armDwell();
      }, { tourArc: true });
      return;
    }

    if (typeof key === "object") {
      goToDirectedStop(key);
      return;
    }

    hideInfoPanel();
    // flyCameraToKey wires up liveFollowFn to continuously track this body's
    // live (orbiting) position — both during the flight and, since we never
    // clear it below, for the whole dwell period that follows.
    flyCameraTo(
      () => getWorldPositionForKey(key),
      getTourViewDistance(key),
      1800 * 1.3,
      () => armDwell(),
      { tourArc: true }
    );
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

  }

  // Directed (Grand Tour) stop: compose an explicit shot rather than reusing
  // the camera's current angle. The two behavioural differences from a
  // classic stop are deliberate and are what buys the pacing:
  //   * the dwell is armed when the flight FINISHES, not when it starts, so a
  //     12-second sweep is not eaten out of the time spent looking at the
  //     thing it arrives at;
  //   * the info panel is revealed at 78% of the flight, so on the Jupiter
  //     beat the name lands as the planet swings into frame, not before.
  function goToDirectedStop(stop) {
    hideInfoPanel();
    clearTimeout(tourState._revealTimer);

    let getTarget = stop.target || (() => getWorldPositionForKey(stop.key));
    if (stop.fixedTarget) {
      // Snapshot once: this stop aims at a staging point in empty space that
      // is derived from a fast-moving moon, and chasing it live would turn a
      // straight run outward into a wide, unmotivated arc.
      const fixed = getTarget();
      getTarget = () => fixed;
    }
    // `camera` names the exact camera world position instead of an offset
    // direction + radius. Used for the staged shots whose whole point is a
    // precise geometric relationship to something off screen.
    let dir = stop.dir ? stop.dir() : null;
    let distance = stop.distance;
    if (stop.camera) {
      const offset = stop.camera().sub(getTarget());
      distance = offset.length();
      dir = offset.normalize();
    }
    const opts = {
      dir,
      ease: stop.ease,
      follow: stop.follow,
      getDir: stop.camera ? null : stop.dir,
      liveDir: stop.camera ? null : stop.liveDir,
      onProgress: stop.onProgress,
      avoidJupiter: stop.avoidJupiter,
      // The Callisto/Jupiter staging beats already provide exact camera
      // geometry, so the generic target arc would distort their path.
      tourArc: !stop.camera && !stop.liveDir,
    };

    if (stop.key) {
      const revealDelay = Math.max(400, (stop.duration || 0) * 0.78);
      tourState._revealTimer = setTimeout(() => {
        if (!tourState.active) return;
        const data = getDataByKey(stop.key);
        if (data) {
          selectedKey = stop.key;
          showInfoPanel(data);
        }
      }, revealDelay);
    }

    if (stop.snap) {
      // Only the opening beat uses this: there is no previous shot to cut
      // away from, so placing the camera instantly is a first frame, not a
      // jump cut.
      clearFollow();
      cameraAnim = null;
      controlsTarget.copy(getTarget());
      const sph = new THREE.Spherical().setFromVector3(
        (dir || new THREE.Vector3(0, 0, 1)).clone().multiplyScalar(distance)
      );
      camSpherical.copy(sph);
      updateCameraFromSpherical();
      armDwell(stop.dwell);
      return;
    }

    flyCameraTo(
      getTarget,
      distance,
      stop.duration || 4000,
      () => {
        if (stop.advanceOnArrival) goToTourStop(tourState.index + 1);
        else armDwell(stop.dwell);
      },
      opts
    );
  }


  // `scale` (Grand Tour only) multiplies the user-chosen pace for this one
  // stop, so the rhythm can vary without overriding the pace they picked.
  function armDwell(scale) {
    // No paused/remaining bookkeeping needed: tourClock itself stops while
    // the tour (or the whole simulation) is paused, so the deadline is
    // effectively frozen along with it.
    tourState.dwellDeadline = tourClock + tourState.dwellDuration * (scale || 1);
  }

  if (tourSpeedSelect) {
    tourSpeedSelect.addEventListener("change", () => {
      const previousDuration = tourState.dwellDuration;
      const nextDuration = TOUR_SPEEDS[tourSpeedSelect.value] || TOUR_SPEEDS.normal;
      tourState.dwellDuration = nextDuration;
      if (tourState.active && tourState.dwellDeadline !== null) {
        const remaining = Math.max(0, tourState.dwellDeadline - tourClock);
        const scale = previousDuration > 0 ? remaining / previousDuration : 0;
        tourState.dwellDeadline = tourClock + scale * nextDuration;
      }
    });
  }

  if (tourScopeSelect) {
    tourScopeSelect.addEventListener("change", () => {
      if (tourState.active) startTour();
    });
  }

  function finishTour() {
    tourState.index = tourStops.length - 1;
    showTourNarration("Tour complete");
    updateTourTimeline();
    tourState.dwellDeadline = null;
    tourState.finishDeadline = tourClock + 3200;
  }

  tourBtn.addEventListener("click", () => {
    startTour();
  });

  tourExitBtn.addEventListener("click", () => {
    stopTour();
  });

  // The tour bar's Pause button pauses only the tour's progression (planets
  // keep orbiting). The topbar's Play/Pause freezes the bodies themselves —
  // and, because tourClock stops with it, also holds the tour on its current
  // stop. Either one alone is enough to hold the tour, so the button's label
  // reflects whichever is in effect.
  function updateTourPauseButton() {
    const held = tourState.paused || simState.paused;
    tourPauseBtn.textContent = held ? "▶ Resume" : "⏸ Pause";
    // Pausing the whole simulation already holds the tour, so the tour's own
    // pause toggle would be a no-op in that state; disable it to say so.
    tourPauseBtn.disabled = simState.paused && !tourState.paused;
  }

  tourPauseBtn.addEventListener("click", () => {
    tourState.paused = !tourState.paused;
    updateTourPauseButton();
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
  // Background music. Playback starts only from the Music button because
  // browsers prohibit unprompted audio; tours crossfade to their own track.
  // ---------------------------------------------------------------------
  const musicBtn = document.getElementById("musicBtn");
  const MUSIC_FADE_MS = 1600;
  const MUSIC_VOLUME = 0.45;
  let musicEnabled = true;
  let musicFadeId = 0;
  const stasisMusic = new Audio(`${import.meta.env.BASE_URL}audio/547029__sondredrakensson__stasis-music-for-space.mp3`);
  const tourMusic = new Audio(`${import.meta.env.BASE_URL}audio/639495__romariogrande__space-ambient-voyage.ogg`);
  [stasisMusic, tourMusic].forEach((track) => {
    track.loop = true;
    track.preload = "metadata";
    track.volume = 0;
  });

  function fadeTrack(track, target, fadeId) {
    const start = THREE.MathUtils.clamp(track.volume, 0, 1);
    const startedAt = performance.now();
    if (target > 0) track.play().catch(() => {});
    function step(now) {
      if (fadeId !== musicFadeId) return;
      const progress = THREE.MathUtils.clamp((now - startedAt) / MUSIC_FADE_MS, 0, 1);
      track.volume = THREE.MathUtils.clamp(start + (target - start) * progress, 0, 1);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else if (target === 0) {
        track.pause();
      }
    }
    requestAnimationFrame(step);
  }

  function updateMusicMix() {
    const fadeId = ++musicFadeId;
    const useTourTrack = musicEnabled && tourState.active;
    fadeTrack(stasisMusic, musicEnabled && !useTourTrack ? MUSIC_VOLUME : 0, fadeId);
    fadeTrack(tourMusic, useTourTrack ? MUSIC_VOLUME : 0, fadeId);
  }

  if (musicBtn) {
    musicBtn.addEventListener("click", () => {
      musicEnabled = !musicEnabled;
      musicBtn.setAttribute("aria-pressed", String(musicEnabled));
      musicBtn.classList.toggle("toggled", musicEnabled);
      musicBtn.textContent = musicEnabled ? "♫ Music On" : "♫ Music";
      updateMusicMix();
    });
  }
  updateMusicMix();
  document.addEventListener("pointerdown", updateMusicMix, { once: true });
  document.addEventListener("keydown", updateMusicMix, { once: true });

  // ---------------------------------------------------------------------
  // Fullscreen toggle (prefixed fallback for older Safari; the button is
  // hidden outright where neither is supported, e.g. iPhone Safari, which
  // only allows fullscreen on <video> elements).
  // ---------------------------------------------------------------------
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const requestFs = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;

  if (!requestFs) {
    fullscreenBtn.style.display = "none";
  } else {
    const getFsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
    const exitFs = () => (document.exitFullscreen || document.webkitExitFullscreen).call(document);

    const updateFullscreenBtn = () => {
      fullscreenBtn.textContent = getFsElement() ? "⛶ Exit Fullscreen" : "⛶ Fullscreen";
    };

    fullscreenBtn.addEventListener("click", () => {
      if (getFsElement()) {
        exitFs();
      } else {
        // webkitRequestFullscreen (older Safari) doesn't return a promise
        // like the standard method does, so don't assume one to chain onto.
        Promise.resolve(requestFs.call(document.documentElement)).catch((err) => {
          console.warn("[fullscreen] request failed:", err);
        });
      }
    });
    document.addEventListener("fullscreenchange", updateFullscreenBtn);
    document.addEventListener("webkitfullscreenchange", updateFullscreenBtn);
  }

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
  const quizRoundPicker = document.getElementById("quizRoundPicker");
  const quizRounds = document.getElementById("quizRounds");
  const quizPlay = document.getElementById("quizPlay");

  const QUIZ_ROUNDS = [
    { key: "random", name: "Random Round", detail: "12 cards from across the Solar System", className: "random" },
    { key: "sun", name: "Sun", detail: "Our star and its role in the system" },
    { key: "planets", name: "Planets", detail: "Worlds, dwarf planets, and their traits" },
    { key: "moons", name: "Moons", detail: "Companions from Phobos to Charon" },
    { key: "comparisons", name: "Compare", detail: "Biggest, fastest, tilted, and more" },
  ];

  const quizState = {
    cards: [],
    allCards: [],
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

  function showQuizRoundPicker() {
    if (quizState.allCards.length === 0) {
      quizState.allCards = generateQuizQuestions(SUN, PLANETS);
    }
    quizRounds.replaceChildren();
    QUIZ_ROUNDS.forEach((round) => {
      const button = document.createElement("button");
      button.className = `quiz-round${round.className ? ` ${round.className}` : ""}`;
      button.innerHTML = `<strong>${round.name}</strong><span>${round.detail}</span>`;
      button.addEventListener("click", () => startQuizRound(round.key));
      quizRounds.appendChild(button);
    });
    quizRoundPicker.classList.remove("hidden");
    quizPlay.classList.remove("visible");
  }

  function startQuizRound(theme) {
    quizState.cards = buildQuizRound(quizState.allCards, theme, 12);
    quizState.index = 0;
    quizRoundPicker.classList.add("hidden");
    quizPlay.classList.add("visible");
    showQuizCard();
  }

  function openQuiz() {
    showQuizRoundPicker();
    quizModal.classList.add("visible");
  }

  function closeQuiz() {
    quizModal.classList.remove("visible");
    quizPlay.classList.remove("visible");
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
  quizExitBtn.addEventListener("click", showQuizRoundPicker);
  quizRevealBtn.addEventListener("click", revealQuizAnswer);
  quizNextBtn.addEventListener("click", nextQuizCard);
  quizModal.addEventListener("click", (e) => {
    if (e.target === quizModal) closeQuiz();
  });

  // ---------------------------------------------------------------------
  // Postprocessing: selective bloom for the Sun
  //
  // Two composers, the standard three.js "selective bloom" arrangement:
  //
  //   bloomComposer  scene -> UnrealBloomPass -> offscreen target
  //   finalComposer  scene -> mix(base, bloom) -> OutputPass -> screen
  //
  // The selectivity comes from BLOOM_LAYER, via the "darken everything else"
  // variant of the technique: the bloom pass renders the WHOLE scene, but
  // every object not on BLOOM_LAYER is temporarily swapped to a black stand-in
  // material (see darkenNonBloomed/restoreMaterials below). So only the Sun
  // and its corona contribute light to the blur, while planets, moons, rings
  // and asteroids still write depth and still paint black — which is what
  // makes anything passing in front of the Sun correctly occlude the halo.
  //
  // Restricting the camera to BLOOM_LAYER instead (the cheaper variant) is
  // what caused the "Sun draws on top of the planets" bug: with no occluders
  // in the bloom render, the halo was composited over every pixel near the
  // Sun regardless of depth, so a transiting planet, moon, asteroid or orbit
  // ring was painted over by the Sun. Do not go back to that.
  //
  // A single whole-scene bloom is not usable here either — the sunlight is a
  // decay-free PointLight at intensity 2.2, so lit planet faces sit above any
  // threshold that still catches the Sun, and they smear.
  // ---------------------------------------------------------------------
  const BLOOM_PARAMS = {
    // Tuned against the overview framing and a close pass on the Sun: enough
    // halo to read as a star, not enough to veil planets or the UI beneath it.
    strength: 0.85,
    radius: 0.15,
    threshold: 0.0, // everything but the Sun is blacked out, so bloom all of it
  };

  // Per-mip weights for the bloom composite. UnrealBloomPass sums five
  // progressively blurrier mips; left at its defaults the widest two paint a
  // dull brown haze over half the inner system (the planets and starfield
  // near the Sun visibly grey out). Rolling the wide mips off keeps the tight,
  // bright halo around the Sun and drops the full-screen veil.
  const BLOOM_MIP_WEIGHTS = [1.0, 0.9, 0.45, 0.2, 0.1];

  const renderPass = new RenderPass(scene, camera);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    BLOOM_PARAMS.strength,
    BLOOM_PARAMS.radius,
    BLOOM_PARAMS.threshold
  );
  bloomPass.bloomTintColors.forEach((tint, i) => {
    const w = BLOOM_MIP_WEIGHTS[i] != null ? BLOOM_MIP_WEIGHTS[i] : 1;
    tint.set(w, w, w);
  });

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(renderPass);
  bloomComposer.addPass(bloomPass);

  // Composites the bloom target back over the full-scene render with a
  // "screen" blend rather than a straight add. A straight add saturates
  // anything already bright to flat white: at close range it flattens the
  // Sun's granulation into a solid yellow disc, and it erases a planet
  // transiting in front of the Sun. Screen leaves the halo identical over
  // dark sky (where base ~= 0 the two are the same) while preserving detail
  // in the highlights. The max() guard keeps HDR values above 1.0 — lit
  // planet faces, since the sunlight is a decay-free intensity-2.2 light —
  // from being pulled down by the blend.
  const mixPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(baseTexture, vUv);
          vec3 bloom = texture2D(bloomTexture, vUv).rgb;
          vec3 screened = 1.0 - (1.0 - clamp(base.rgb, 0.0, 1.0)) * (1.0 - bloom);
          gl_FragColor = vec4(max(base.rgb, screened), base.a);
        }
      `,
      defines: {},
    }),
    "baseTexture"
  );
  mixPass.needsSwap = true;

  // EffectComposer's default target is single-sampled, which would silently
  // throw away the renderer's `antialias: true` — every planet limb and orbit
  // ring would come back jagged the moment we stopped drawing to the canvas
  // directly. Giving the final chain a multisampled target keeps the edges as
  // smooth as they were before postprocessing. (`samples` is a no-op on
  // WebGL1, where multisampled render targets don't exist.)
  const drawSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const finalTarget = new THREE.WebGLRenderTarget(drawSize.width, drawSize.height, {
    type: THREE.HalfFloatType,
    samples: renderer.capabilities.isWebGL2 ? 4 : 0,
  });

  const finalComposer = new EffectComposer(renderer, finalTarget);
  finalComposer.addPass(renderPass);
  finalComposer.addPass(mixPass);
  // Composer targets are linear; OutputPass does the tone-mapping / sRGB
  // conversion that renderer.render() would otherwise have done for us.
  finalComposer.addPass(new OutputPass());

  function setComposerSize(width, height) {
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    // The bloom chain only ever produces a blur, so it runs at half
    // resolution: same halo, a quarter of the fill cost of the extra pass.
    bloomComposer.setPixelRatio(pixelRatio * 0.5);
    finalComposer.setPixelRatio(pixelRatio);
    bloomComposer.setSize(width, height);
    finalComposer.setSize(width, height);
  }
  setComposerSize(window.innerWidth, window.innerHeight);

  // Occlusion for the bloom pass.
  //
  // Everything that is NOT on BLOOM_LAYER is swapped to a black stand-in for
  // the duration of the bloom render, then swapped back. The stand-in is a
  // clone of the object's real material with its colours forced to black, so
  // it keeps the exact silhouette that the real render produces — point size
  // and sprite alpha for the asteroid belt and starfield, alpha maps and
  // opacity for Saturn's rings and the orbit lines, double-sidedness, etc.
  // (A semi-transparent occluder therefore only partly dims the Sun behind
  // it, which is the right answer for a 45%-opacity orbit line.)
  //
  // Clones are cached by source material, so this is a pointer swap per
  // object per frame, not an allocation.
  const bloomLayerTest = new THREE.Layers();
  bloomLayerTest.set(BLOOM_LAYER);
  const darkMaterials = new Map(); // real material -> black clone
  const swappedMaterials = new Map(); // object -> real material

  function blackVersionOf(material) {
    let dark = darkMaterials.get(material);
    if (!dark) {
      dark = material.clone();
      if (dark.color) dark.color.setHex(0x000000);
      if (dark.emissive) dark.emissive.setHex(0x000000);
      if (dark.emissiveMap) dark.emissiveMap = null;
      darkMaterials.set(material, dark);
    }
    return dark;
  }

  function darkenNonBloomed(obj) {
    if (!obj.material || obj.layers.test(bloomLayerTest)) return;
    swappedMaterials.set(obj, obj.material);
    obj.material = Array.isArray(obj.material)
      ? obj.material.map(blackVersionOf)
      : blackVersionOf(obj.material);
  }

  function restoreMaterials() {
    swappedMaterials.forEach((material, obj) => {
      obj.material = material;
    });
    swappedMaterials.clear();
  }

  // Draws the frame: bloom-only pass first, then the composited full scene.
  function renderFrame() {
    if (oortCloud) {
      const distance = camera.position.length();
      const fade = THREE.MathUtils.smoothstep(
        distance,
        OORT_CLOUD_INNER_RADIUS,
        OORT_CLOUD_INNER_RADIUS + OORT_CLOUD_FADE_DISTANCE
      );
      oortCloud.material.opacity = 0.9 * fade;
      oortCloud.visible = fade > 0.001;
    }
    scene.traverse(darkenNonBloomed);
    bloomComposer.render();
    restoreMaterials();
    finalComposer.render();
  }

  // ---------------------------------------------------------------------
  // Resize handling
  // ---------------------------------------------------------------------
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    setComposerSize(window.innerWidth, window.innerHeight);
  });

  // ---------------------------------------------------------------------
  // Main animation loop
  // ---------------------------------------------------------------------
  // The original 0.25x preset is now the normal 1x pace: this lets users
  // observe orbital motion without the inner system racing past too quickly.
  const ORBIT_TIME_SCALE = 0.0625;
  // Moon sizes and distances are already strongly exaggerated for legibility;
  // a gentler visual rate keeps close-up shots readable while preserving the
  // real relative ordering within each moon system.
  const MOON_ORBIT_TIME_SCALE = 0.35;
  // Giant-planet close-ups need a calmer visual rhythm: their surfaces and
  // moon systems would otherwise sweep through a tour shot too quickly.
  const CINEMATIC_SYSTEM_MOTION_SCALES = {
    jupiter: 0.22,
    saturn: 0.22,
  };
  // Backgrounded tabs stop calling requestAnimationFrame, and a slow/software
  // renderer can drop to a handful of FPS, so a single frame's delta can be
  // huge. Clamping keeps that (and a 4x playback rate on top of it) from
  // teleporting planets around their orbits. It is deliberately applied ONLY
  // to the simulation step: tourClock below advances on unclamped real time,
  // so a "4.2 second" tour dwell is 4.2 real seconds at any frame rate.
  const MAX_FRAME_DELTA = 0.1; // seconds
  // performance.now() rather than THREE.Clock: the loop needs both a real
  // wall-clock timestamp (camera flights, tour dwell) and a delta, and
  // deriving both from one source keeps them from disagreeing.
  let lastFrameNow = performance.now();

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const realDt = now - lastFrameNow; // ms of wall clock since last frame
    lastFrameNow = now;

    // The single point where playback rate is applied. Pausing is just a
    // zero-length simulation step: the loop keeps running and rendering, so
    // camera orbit/pan/zoom and fly-to animations below stay fully alive.
    const dt = simState.paused
      ? 0
      : Math.min(realDt / 1000, MAX_FRAME_DELTA) * simState.speed;

    if (isTourClockRunning()) tourClock += realDt;
    updateTourTimers();

    planetObjects.forEach((obj) => {
      const systemMotionScale = CINEMATIC_SYSTEM_MOTION_SCALES[obj.data.key] || 1;
      obj.angle += obj.data.orbitSpeed * ORBIT_TIME_SCALE * systemMotionScale * dt;
      obj.pivot.rotation.y = obj.angle;
      // Cancel the pivot's orbital rotation so the tilted spin axis keeps
      // pointing the same way all the way round the orbit (see the axisGroup
      // comment where it's built) instead of precessing once per year.
      obj.axisGroup.rotation.y = -obj.angle;
      obj.mesh.rotation.y += (obj.data.rotationSpeed || 0.3) * systemMotionScale * dt;
      if (obj.mesh.userData.cloudMesh) {
        obj.mesh.userData.cloudMesh.rotation.y += 0.02 * systemMotionScale * dt;
      }
      if (!tourState.freezeMoonOrbits && obj.moonPivots && obj.moonPivots.length) {
        const moonDefs = obj.data.moons || (obj.data.moon ? [obj.data.moon] : []);
        obj.moonPivots.forEach((moonPivot, i) => {
          const m = moonDefs[i];
          moonPivot.rotation.y += ((m && m.orbitSpeed) || 5)
            * ORBIT_TIME_SCALE * MOON_ORBIT_TIME_SCALE * systemMotionScale * dt;
        });
      }
    });

    spaceObjects.forEach((object) => {
      const { data, root, orbit } = object;
      object.phase += (data.orbitSpeed || 0) * dt;
      if (data.placement === "low-earth-orbit") {
        orbit.rotation.y = object.phase;
        root.lookAt(0, 0, 0);
      } else if (data.placement === "sun-earth-l2") {
        const earthPosition = getWorldPositionForKey("earth");
        const awayFromSun = earthPosition.clone().normalize();
        orbit.position.copy(earthPosition).addScaledVector(awayFromSun, data.l2Distance);
        root.position.set(
          Math.cos(object.phase) * data.orbitRadius,
          Math.sin(object.phase * 2) * data.orbitRadius * 0.35,
          Math.sin(object.phase) * data.orbitRadius
        );
        root.rotation.y += 0.1 * dt;
      } else if (data.placement === "outbound") {
        root.position.addScaledVector(new THREE.Vector3().fromArray(data.drift), dt * 0.02);
        root.rotation.y += 0.08 * dt;
      }
    });

    sunMesh.rotation.y += 0.05 * dt;

    // The belt is one rigid point cloud, so "orbiting" it is a single object
    // rotation — no per-asteroid work regardless of how many particles it has.
    if (asteroidBelt) {
      asteroidBelt.rotation.y += ASTEROID_BELT.driftSpeed * ORBIT_TIME_SCALE * dt;
    }

    updateCameraAnim(now);
    applyKeyboardControls(realDt);

    // Keep the camera locked onto whatever we're following (a tour stop's
    // planet, or a manually-clicked planet) even when no flight animation is
    // in progress — this is what keeps the view centered on a moving planet
    // for the entire dwell/pause duration at a tour stop.
    if (liveFollowFn && !cameraAnim) {
      controlsTarget.copy(liveFollowFn());
      if (liveDirFn) {
        // Hold the composed framing against a moving reference frame for the
        // whole dwell, not just the flight (Grand Tour: the Callisto beat).
        const s = new THREE.Spherical().setFromVector3(liveDirFn().clone().normalize());
        camSpherical.phi = s.phi;
        camSpherical.theta = s.theta;
      }
      updateCameraFromSpherical();
    }

    renderFrame();
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
