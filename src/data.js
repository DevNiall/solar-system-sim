// Planet & Sun data for the Solar System Simulator.
// Numeric astronomical facts (diameter, day length, year length, moons) are
// real published values (NASA/JPL, rounded for readability).
// Visual scale fields (size, distance, speed) are DELIBERATELY compressed /
// exaggerated for legibility — see the "About" panel in index.html.
//
// Moons live in a `moons: [...]` array on a planet (a legacy singular `moon`
// object is still accepted by app.js). Each entry needs
// { name, color, radius, distance, orbitSpeed } and may add a `texture`.
// `distance` is measured from the planet's center in the same visual units as
// `radius`, so it must exceed the planet's radius (and any ring outerRadius)
// to avoid clipping; keep the outermost moon inside the gap to the next
// planet's orbit so moons never appear to cross a neighbouring orbit ring.
// Only the largest/most famous moons are modelled, and their
// sizes/distances/speeds are exaggerated far more than the planets' —
// real moons are far too small and close to see at this scale. Relative
// ordering within a planet's moon system (which moon is biggest, which orbits
// fastest) is kept true to life. Moon pivots hang off the planet mesh, which
// now carries the planet's real axial tilt, so moons circle in their planet's
// tilted equatorial plane — true for the regular satellites modelled here
// (Phobos/Deimos, the Galileans, Titan/Enceladus, Charon), and only a small
// stretch for our own Moon, which really tracks closer to the ecliptic.
//
// ---------------------------------------------------------------------------
// THE VISUAL DISTANCE SCALE (`distance`, and ASTEROID_BELT's radii)
// ---------------------------------------------------------------------------
// One hand-tuned, monotonically-compressing scale covers everything from
// Mercury to Pluto. The rule it follows: the further out you go, the harder a
// given number of AU is squeezed, so the ordering and the *relative* size of
// the gaps stay believable while the whole system still fits on one screen.
//
//   body            real AU   visual   gap from previous   visual-per-AU
//   Mercury           0.39       11          —                  —
//   Venus             0.72       15         4.0                11.9
//   Earth             1.00       20         5.0                18.1  (near 1:1)
//   Mars              1.52       27         7.0                13.4
//   asteroid belt   2.06–3.28  32–44         5.0                 8.4
//   Ceres             2.77       39      (inside the belt)
//   Jupiter           5.20       57        13.0                 8.4
//   Saturn            9.58       73        16.0                 3.7
//   Uranus           19.20       88        15.0                 1.6
//   Neptune          30.05      101        13.0                 1.2
//   Pluto            39.48      112        11.0                 1.2
//
// Mercury is the one deliberate outlier: at a true 0.39 AU it would sit inside
// the Sun's corona and bloom halo (sphere radius 6.5, corona 1.35x), so it is
// pushed out to 11.
//
// Two hard constraints this table has to satisfy, and any future edit must
// preserve:
//   1. A planet's outermost moon distance must be smaller than the gap to the
//      neighbouring orbit (Jupiter's Callisto at 8.9 and Saturn's Titan at 8.8
//      are the binding cases — hence the 13+ unit gaps around them).
//   2. The asteroid belt's outer edge (44) must clear Jupiter's moon system
//      (57 - 8.9 = 48.1), and its inner edge (32) must clear Mars' moons
//      (27 + 2.6 = 29.6).
//
// Body `radius` values follow a separate compressed law of roughly
// r ~= 1.4 x (diameter / Earth's diameter)^0.42, which is where Ceres (0.40)
// and Pluto (0.65) come from. Moons are on their own, even more exaggerated
// scale, so a big moon can out-size a dwarf planet on screen — see the About
// panel.
//
// Dwarf planets are ordinary PLANETS entries flagged `dwarf: true`. That flag
// only affects wording elsewhere (quiz.js excludes them from "which *planet*
// is..." superlatives); everything else — orbit ring, click-to-select, tour,
// info panel, deep links — comes for free from being in this array.
//
// ---------------------------------------------------------------------------
// AXIAL TILT AND ORBITAL INCLINATION — REAL, UNEXAGGERATED VALUES
// ---------------------------------------------------------------------------
// Unlike size/distance/speed, the three orientation fields below are NOT
// compressed or exaggerated. They are the real published angles, in DEGREES,
// and app.js applies them at full strength. They cost nothing to render
// truthfully (an angle doesn't need to fit on screen the way a distance does),
// so this is one place the simulation is exactly right.
//
//   axialTilt            Obliquity of the body's spin axis to ITS OWN orbital
//                        plane. app.js holds the axis fixed in the orbital
//                        frame while the body goes round, so the same pole
//                        keeps pointing the same way all year — the geometry
//                        that causes seasons. Values >90° mean the body is
//                        upside-down, i.e. it spins retrograde: Venus (177.4°)
//                        and Pluto (122.5°) are the cases here. Because the
//                        flipped axis ALREADY makes them look retrograde,
//                        their `rotationSpeed` must stay POSITIVE — negating
//                        it as well would cancel the flip and wrongly show
//                        them spinning prograde.
//   orbitalInclination   Tilt of the orbital plane relative to the ecliptic
//                        (Earth's orbital plane), so Earth is 0 by definition.
//   ascendingNode        Longitude of the ascending node: which way round the
//                        Sun the orbit tips up. Real values, and worth having:
//                        without them every inclined orbit would hinge about
//                        the same line and the system would look like a
//                        folded fan rather than a set of independent planes.
//
// At this compressed distance scale the real angles are still clearly visible
// where it matters — Pluto's 17.2° lifts it ~33 visual units out of the
// ecliptic, Mercury's 7.0° about 1.3 units (over a planet-radius), and
// Uranus' 97.8° axial tilt reads immediately as "rolling on its side" — so
// nothing needs faking. The eight planets' inclinations are genuinely small
// (0.8–3.4°) and are drawn that way: subtle, but real and visible edge-on.

// Real diffuse texture maps (CC-BY 4.0, Solar System Scope) committed locally
// under assets/textures/ so the app doesn't depend on a third-party image
// host staying up. If a texture fails to load, materials fall back to solid
// colors (see app.js loadTexture()).
const BASE = import.meta.env.BASE_URL;

const TEXTURES = {
  sun: `${BASE}textures/2k_sun.jpg`,
  mercury: `${BASE}textures/2k_mercury.jpg`,
  venus: `${BASE}textures/2k_venus_surface.jpg`,
  earthDay: `${BASE}textures/2k_earth_daymap.jpg`,
  earthClouds: `${BASE}textures/2k_earth_clouds.jpg`,
  earthSpecular: `${BASE}textures/2k_earth_specular_map.jpg`,
  mars: `${BASE}textures/2k_mars.jpg`,
  jupiter: `${BASE}textures/2k_jupiter.jpg`,
  saturn: `${BASE}textures/2k_saturn.jpg`,
  saturnRing: `${BASE}textures/2k_saturn_ring_alpha.png`,
  uranus: `${BASE}textures/2k_uranus.jpg`,
  neptune: `${BASE}textures/2k_neptune.jpg`,
  moon: `${BASE}textures/2k_moon.jpg`,
  starsMilkyWay: `${BASE}textures/2k_stars_milky_way.jpg`,
};

const SUN = {
  key: "sun",
  name: "Sun",
  color: 0xffdd66,
  emissive: 0xffaa22,
  texture: TEXTURES.sun,
  radius: 6.5, // visual units
  axialTilt: 7.25, // degrees, to the ecliptic — the Sun is slightly tilted too
  tagline: "The star at the center of it all.",
  stats: {
    "Diameter": "1,392,700 km (109× Earth)",
    "Surface temp": "~5,500°C",
    "Age": "~4.6 billion years",
    "Axial tilt": "7.25° to the ecliptic",
  },
  facts: [
    "The Sun contains about 99.86% of the mass of the entire solar system.",
    "It's a giant ball of plasma powered by nuclear fusion, converting hydrogen into helium.",
    "Light from the Sun takes about 8 minutes and 20 seconds to reach Earth.",
    "The Sun is about halfway through its ~10 billion year lifespan as a main-sequence star.",
  ],
};

// The asteroid belt: a purely decorative particle field, not a set of
// individually simulated bodies. app.js renders it as ONE THREE.Points cloud
// of `count` particles scattered in a flat annulus and slowly rotates that
// single object, which keeps it to one draw call no matter how dense it looks.
//
// Radii place it between Mars (27) and Jupiter (57) on the scale documented at
// the top of this file; the real belt spans roughly 2.06–3.28 AU. `thickness`
// is the vertical half-spread — the real belt is a flattened torus, not a
// razor-thin disc, but it is far thinner than it is wide. At the belt's mid
// radius (38) a thickness of 2.6 works out to about 4° of inclination spread;
// real belt asteroids are spread over rather more than that (Ceres itself is
// inclined 10.6°), so this is still a conservative, flattened depiction —
// it just no longer looks like a razor-thin washer that Ceres' real inclined
// orbit has escaped from.
const ASTEROID_BELT = {
  innerRadius: 32,
  outerRadius: 44,
  thickness: 2.6,
  count: 1200,
  // Rocky greys/browns, picked randomly per particle for a bit of texture.
  colors: [0x8d8378, 0xa79885, 0x6d655b, 0xb3a591],
  particleSize: 0.28,
  // Radians/sec before ORBIT_TIME_SCALE. Close to Ceres' orbitSpeed so the
  // field drifts at about the pace of the real objects inside it.
  driftSpeed: 0.22,
};

// Order matters — also defines tour order, so entries are kept in order of
// increasing distance from the Sun (which puts Ceres in the belt between Mars
// and Jupiter, and Pluto last).
const PLANETS = [
  {
    key: "mercury",
    name: "Mercury",
    color: 0x9c9186,
    texture: TEXTURES.mercury,
    radius: 0.9,
    distance: 11,
    orbitSpeed: 4.15, // relative to Earth = 1 (real ratio, preserved ordering)
    rotationSpeed: 0.017,
    axialTilt: 0.03, // essentially bolt upright — the least tilted planet
    orbitalInclination: 7.0, // the most inclined of the eight planets
    ascendingNode: 48.3,
    tagline: "The swift, scorched innermost world.",
    stats: {
      "Diameter": "4,879 km",
      "Day length": "59 Earth days",
      "Year length": "88 Earth days",
      "Moons": "0",
      "Axial tilt": "0.03° (almost perfectly upright)",
    },
    facts: [
      "Mercury has almost no atmosphere, so temperatures swing from 430°C in daytime to -180°C at night.",
      "It's the smallest planet and the closest to the Sun, orbiting once every 88 Earth days.",
      "Despite being closest to the Sun, it is not the hottest planet — that title goes to Venus.",
      "Mercury's orbit is tilted 7° out of the plane the other planets share — the biggest tilt of the eight — and it stands almost perfectly upright, so it has no seasons at all.",
    ],
  },
  {
    key: "venus",
    name: "Venus",
    color: 0xe8c27a,
    texture: TEXTURES.venus,
    radius: 1.3,
    distance: 15,
    orbitSpeed: 1.62,
    // POSITIVE on purpose: Venus' retrograde spin is produced by its 177.4°
    // axial tilt (it is effectively upside-down), not by a negative speed.
    rotationSpeed: 0.004,
    axialTilt: 177.4, // flipped almost completely over — hence retrograde
    orbitalInclination: 3.4,
    ascendingNode: 76.7,
    tagline: "Earth's toxic, cloud-shrouded twin.",
    stats: {
      "Diameter": "12,104 km",
      "Day length": "243 Earth days",
      "Year length": "225 Earth days",
      "Moons": "0",
      "Axial tilt": "177.4° (upside-down, so it spins backwards)",
    },
    facts: [
      "Venus rotates backwards (retrograde) compared to most planets, and its day is longer than its year.",
      "A thick CO₂ atmosphere traps heat, making it the hottest planet at ~465°C — hotter than Mercury.",
      "Venus is the brightest natural object in our night sky after the Moon.",
    ],
  },
  {
    key: "earth",
    name: "Earth",
    color: 0x3a7bd5,
    texture: TEXTURES.earthDay,
    cloudsTexture: TEXTURES.earthClouds,
    specularTexture: TEXTURES.earthSpecular,
    radius: 1.4,
    distance: 20,
    orbitSpeed: 1.0,
    rotationSpeed: 0.9,
    axialTilt: 23.44, // the tilt that gives us seasons
    orbitalInclination: 0, // by definition: Earth's orbit IS the ecliptic
    ascendingNode: 0,
    tagline: "Our home — the only known world with life.",
    stats: {
      "Diameter": "12,742 km",
      "Day length": "24 hours",
      "Year length": "365.25 days",
      "Moons": "1 (the Moon)",
      "Axial tilt": "23.4° (this is what gives us seasons)",
    },
    facts: [
      "Earth is the only known planet with liquid water on its surface and life of any kind.",
      "Its single large Moon stabilizes Earth's axial tilt, helping keep our climate relatively stable.",
      "About 71% of Earth's surface is covered by oceans.",
      "Earth leans over by 23.4°, and always leans the same way as it goes round, so each hemisphere gets more sunlight for half the year — that lean is the entire reason we have summer and winter.",
      "Earth's orbit is the flat 'reference' plane astronomers measure every other orbit against, which is why its own inclination is exactly zero.",
    ],
    moons: [
      {
        name: "Moon",
        color: 0xbfbfbf,
        texture: TEXTURES.moon,
        radius: 0.35,
        distance: 2.4,
        orbitSpeed: 12,
      },
    ],
  },
  {
    key: "mars",
    name: "Mars",
    color: 0xc1440e,
    texture: TEXTURES.mars,
    radius: 1.0,
    distance: 27,
    orbitSpeed: 0.53,
    rotationSpeed: 0.88,
    axialTilt: 25.19, // almost the same lean as Earth, hence Martian seasons
    orbitalInclination: 1.85,
    ascendingNode: 49.6,
    tagline: "The dusty, rust-red desert planet.",
    stats: {
      "Diameter": "6,779 km",
      "Day length": "24.6 hours",
      "Year length": "687 Earth days",
      "Moons": "2 (Phobos & Deimos)",
      "Axial tilt": "25.2° (almost the same as Earth's)",
    },
    facts: [
      "Mars is home to Olympus Mons, the largest volcano in the solar system — nearly 3x the height of Mount Everest.",
      "Its red color comes from iron oxide (rust) covering its surface.",
      "Mars has seasons similar to Earth's because its axial tilt is nearly the same.",
      "Its two moons, Phobos and Deimos, are tiny lumpy rocks — probably captured asteroids — only about 22 km and 12 km across.",
      "Phobos circles Mars in just 7.6 hours, faster than Mars itself spins, so from the surface it rises in the west and sets in the east.",
    ],
    // Phobos and Deimos are really only a few km across; drawn much larger
    // here (but still by far the smallest moons in the sim) so they're visible.
    moons: [
      { name: "Phobos", color: 0x7d7266, radius: 0.16, distance: 1.7, orbitSpeed: 9 },
      { name: "Deimos", color: 0x968a7c, radius: 0.11, distance: 2.6, orbitSpeed: 3.2 },
    ],
  },
  {
    key: "ceres",
    name: "Ceres",
    color: 0x8f8880,
    // No public-domain 2k texture is committed for Ceres, so it renders with
    // its solid fallback colour — a pale, heavily cratered grey.
    dwarf: true,
    radius: 0.4,
    distance: 39, // inside ASTEROID_BELT (32–44), matching its real 2.77 AU
    orbitSpeed: 0.217, // 4.6 Earth years
    rotationSpeed: 2.4, // 9-hour day — one of the faster spinners
    axialTilt: 4,
    orbitalInclination: 10.6, // real value; steep enough to carry it out of the belt's plane
    ascendingNode: 80.3,
    tagline: "The biggest world in the asteroid belt.",
    stats: {
      "Diameter": "940 km (about 1/13th of Earth)",
      "Day length": "9.1 hours",
      "Year length": "4.6 Earth years",
      "Moons": "0",
      "Type": "Dwarf planet",
      "Axial tilt": "4°",
    },
    facts: [
      "Ceres is the largest object in the asteroid belt — on its own it holds about a quarter of the belt's total mass.",
      "When it was discovered in 1801 it was called a planet; it was later demoted to an asteroid, then reclassified again as a dwarf planet in 2006.",
      "It is made partly of water ice: there may be more fresh water locked inside Ceres than in all of Earth's rivers and lakes.",
      "NASA's Dawn spacecraft found bright white patches in its craters — salt left behind after briny water seeped up and froze.",
      "Ceres is the only dwarf planet in the inner solar system; all the others orbit out beyond Neptune.",
      "Its orbit is tilted 10.6°, so twice each circuit it climbs right up out of the flat band of asteroids it lives in.",
    ],
  },
  {
    key: "jupiter",
    name: "Jupiter",
    color: 0xd8ac7c,
    texture: TEXTURES.jupiter,
    radius: 3.8,
    distance: 57,
    orbitSpeed: 0.084,
    rotationSpeed: 2.2,
    axialTilt: 3.13, // barely leans, so Jupiter has essentially no seasons
    orbitalInclination: 1.3,
    ascendingNode: 100.5,
    tagline: "The giant king of the planets.",
    stats: {
      "Diameter": "139,820 km (11× Earth)",
      "Day length": "9.9 hours",
      "Year length": "12 Earth years",
      "Moons": "95 known (Io, Europa, Ganymede, Callisto notable)",
      "Axial tilt": "3.1° (barely any lean, so no real seasons)",
    },
    facts: [
      "Jupiter is so massive that its gravity helps shield the inner solar system from many comets and asteroids.",
      "The Great Red Spot is a giant storm larger than Earth that has raged for centuries.",
      "Jupiter has the shortest day of any planet, spinning once every ~10 hours despite its huge size.",
      "Its four biggest moons — Io, Europa, Ganymede and Callisto — were spotted by Galileo in 1610 and proved not everything orbits Earth.",
      "Io is the most volcanically active world we know of, while Europa hides a salty ocean under its ice shell — one of the best places to look for life.",
      "Ganymede is the largest moon in the solar system: bigger than the planet Mercury, and the only moon with its own magnetic field.",
    ],
    // The Galilean moons. Real size order is preserved
    // (Ganymede > Callisto > Io > Europa) but every moon is drawn far larger
    // and far closer in than reality so all four read clearly next to Jupiter.
    moons: [
      { name: "Io", color: 0xe6cf72, radius: 0.30, distance: 5.0, orbitSpeed: 6 },
      { name: "Europa", color: 0xdcd3c4, radius: 0.26, distance: 6.2, orbitSpeed: 4 },
      { name: "Ganymede", color: 0xa2988a, radius: 0.42, distance: 7.5, orbitSpeed: 2.4 },
      { name: "Callisto", color: 0x736958, radius: 0.38, distance: 8.9, orbitSpeed: 1.4 },
    ],
  },
  {
    key: "saturn",
    name: "Saturn",
    color: 0xe3cf9c,
    texture: TEXTURES.saturn,
    radius: 3.3,
    distance: 73,
    orbitSpeed: 0.034,
    rotationSpeed: 2.0,
    axialTilt: 26.73, // why the rings open and close over its 29-year orbit
    orbitalInclination: 2.49,
    ascendingNode: 113.7,
    tagline: "The jewel of the solar system, famous for its rings.",
    stats: {
      "Diameter": "116,460 km (9.4× Earth)",
      "Day length": "10.7 hours",
      "Year length": "29.4 Earth years",
      "Moons": "146 known (Titan is largest)",
      "Axial tilt": "26.7° (tips its rings towards and away from us)",
    },
    facts: [
      "Saturn's rings are made mostly of ice particles, with some rock and dust, ranging from tiny grains to house-sized chunks.",
      "Saturn is the least dense planet — it would float in water if you had a bathtub big enough.",
      "Titan, its largest moon, is bigger than the planet Mercury and the only moon with a thick atmosphere — denser than Earth's, with rain and lakes of liquid methane.",
      "Tiny Enceladus shoots geysers of salty water hundreds of kilometres into space from an ocean beneath its icy crust.",
      "Saturn leans 26.7°, and its rings sit around its equator, so as it orbits we see them wide open and then edge-on — vanishing to a thin line — every 15 years or so.",
    ],
    rings: { innerRadius: 4.2, outerRadius: 7.2, color: 0xc9b98a, texture: TEXTURES.saturnRing },
    // Both moons orbit outside the ring system (as they really do) so they
    // never clip through the ring disc. Titan is genuinely huge — bigger than
    // Mercury — while Enceladus is a small ice ball, kept just visible here.
    moons: [
      { name: "Enceladus", color: 0xeef3f5, radius: 0.20, distance: 7.7, orbitSpeed: 4 },
      { name: "Titan", color: 0xd9a04a, radius: 0.55, distance: 8.8, orbitSpeed: 1.6 },
    ],
  },
  {
    key: "uranus",
    name: "Uranus",
    color: 0x9fe3e8,
    texture: TEXTURES.uranus,
    radius: 2.2,
    distance: 88,
    orbitSpeed: 0.012,
    rotationSpeed: 1.4,
    axialTilt: 97.77, // the extreme case: it rolls around the Sun on its side
    orbitalInclination: 0.77,
    ascendingNode: 74.0,
    tagline: "The tilted ice giant that spins on its side.",
    stats: {
      "Diameter": "50,724 km (4× Earth)",
      "Day length": "17.2 hours",
      "Year length": "84 Earth years",
      "Moons": "27 known (Titania, Oberon notable)",
      "Axial tilt": "97.8° (tipped right over — it rolls on its side)",
    },
    facts: [
      "Uranus is tilted almost 98° on its axis — it essentially rolls around the Sun on its side.",
      "It's an 'ice giant' made largely of water, ammonia, and methane ices around a rocky core.",
      "Uranus appears pale cyan because methane in its atmosphere absorbs red light.",
      "Because it lies on its side, each pole spends about 42 years in continuous sunlight and then 42 years in total darkness — the most extreme seasons in the solar system.",
      "Astronomers think something roughly Earth-sized smashed into Uranus long ago and knocked it over.",
      "Uranus has rings too — 13 of them, far darker and thinner than Saturn's. Because they circle its tipped-over equator, we see them standing up almost vertically, like a bullseye.",
    ],
    // Uranus really does have a ring system: narrow, very dark, and much
    // closer in than Saturn's. Radii here are real-ish in planet-radius terms
    // (the main rings span roughly 1.5–2.0 R against Uranus' visual 2.2), and
    // because rings sit in a planet's equatorial plane its 97.8° obliquity
    // stands them almost on end — which is what makes that extreme tilt
    // readable at a glance on an otherwise featureless pale-cyan ball. That
    // legibility is the reason they are drawn much brighter than the real
    // rings, which are among the darkest objects in the solar system; the
    // About panel says so.
    rings: { innerRadius: 3.4, outerRadius: 4.4, color: 0x6f838f, opacity: 0.45 },
  },
  {
    key: "neptune",
    name: "Neptune",
    color: 0x3a5fcd,
    texture: TEXTURES.neptune,
    radius: 2.1,
    distance: 101,
    orbitSpeed: 0.006,
    rotationSpeed: 1.5,
    axialTilt: 28.32, // a bit more of a lean than Earth's
    orbitalInclination: 1.77,
    ascendingNode: 131.8,
    tagline: "The distant, windy blue ice giant.",
    stats: {
      "Diameter": "49,244 km (3.9× Earth)",
      "Day length": "16.1 hours",
      "Year length": "165 Earth years",
      "Moons": "16 known (Triton is largest)",
      "Axial tilt": "28.3° (a little more than Earth's)",
    },
    facts: [
      "Neptune has the fastest winds in the solar system, reaching up to 2,100 km/h (1,300 mph).",
      "It was the first planet located through mathematical prediction rather than direct observation.",
      "Triton, its largest moon, orbits backwards and is likely a captured Kuiper Belt object.",
    ],
  },
  {
    key: "pluto",
    name: "Pluto",
    color: 0xc7a17a,
    dwarf: true,
    radius: 0.65,
    distance: 112,
    orbitSpeed: 0.004, // 248 Earth years — the slowest body in the sim
    // POSITIVE on purpose (see the orientation notes at the top of this file):
    // Pluto's backwards spin comes from its 122.5° axial tilt, so a negative
    // rotationSpeed here would cancel that out and make it look prograde.
    rotationSpeed: 0.14, // 6.4-day day
    axialTilt: 122.53, // tipped past sideways, so it spins on its side, backwards
    // The real 17.2°, drawn at full strength — this steep tilt (and the way it
    // lifts Pluto clear of Neptune's orbit) is one of the headline facts
    // about Pluto, and it is unmissable at this scale.
    orbitalInclination: 17.2,
    ascendingNode: 110.3,
    tagline: "The famous dwarf planet at the edge of the planets.",
    stats: {
      "Diameter": "2,377 km (smaller than our Moon)",
      "Day length": "6.4 Earth days",
      "Year length": "248 Earth years",
      "Moons": "5 known (Charon is by far the largest)",
      "Type": "Dwarf planet",
      "Axial tilt": "122.5° (on its side, and spinning backwards)",
    },
    facts: [
      "Pluto was called the ninth planet from its discovery in 1930 until 2006, when astronomers reclassified it as a dwarf planet.",
      "It lost planet status because it hasn't 'cleared its neighbourhood' — it shares the Kuiper Belt with thousands of other icy worlds.",
      "Pluto has 5 known moons. Charon is so big — half Pluto's width — that the two orbit a point in empty space between them, like a double world.",
      "Its orbit is tilted 17° out of the flat plane the eight planets share, and is so stretched (eccentric) that for 20 years of every 248 it is closer to the Sun than Neptune.",
      "NASA's New Horizons flew past in 2015 and found nitrogen-ice glaciers and mountains of frozen water in a heart-shaped plain.",
    ],
    // Charon really is about half Pluto's diameter — no exaggeration needed to
    // make the point that this is nearly a double planet.
    moons: [
      { name: "Charon", color: 0x9d9188, radius: 0.3, distance: 1.7, orbitSpeed: 3 },
    ],
  },
];

export { TEXTURES, SUN, PLANETS, ASTEROID_BELT };
