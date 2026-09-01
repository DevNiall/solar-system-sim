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
// fastest) is kept true to life.

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
  tagline: "The star at the center of it all.",
  stats: {
    "Diameter": "1,392,700 km (109× Earth)",
    "Surface temp": "~5,500°C",
    "Age": "~4.6 billion years",
  },
  facts: [
    "The Sun contains about 99.86% of the mass of the entire solar system.",
    "It's a giant ball of plasma powered by nuclear fusion, converting hydrogen into helium.",
    "Light from the Sun takes about 8 minutes and 20 seconds to reach Earth.",
    "The Sun is about halfway through its ~10 billion year lifespan as a main-sequence star.",
  ],
};

// Order matters — also defines tour order.
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
    tagline: "The swift, scorched innermost world.",
    stats: {
      "Diameter": "4,879 km",
      "Day length": "59 Earth days",
      "Year length": "88 Earth days",
      "Moons": "0",
    },
    facts: [
      "Mercury has almost no atmosphere, so temperatures swing from 430°C in daytime to -180°C at night.",
      "It's the smallest planet and the closest to the Sun, orbiting once every 88 Earth days.",
      "Despite being closest to the Sun, it is not the hottest planet — that title goes to Venus.",
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
    rotationSpeed: -0.004, // retrograde rotation
    tagline: "Earth's toxic, cloud-shrouded twin.",
    stats: {
      "Diameter": "12,104 km",
      "Day length": "243 Earth days",
      "Year length": "225 Earth days",
      "Moons": "0",
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
    tagline: "Our home — the only known world with life.",
    stats: {
      "Diameter": "12,742 km",
      "Day length": "24 hours",
      "Year length": "365.25 days",
      "Moons": "1 (the Moon)",
    },
    facts: [
      "Earth is the only known planet with liquid water on its surface and life of any kind.",
      "Its single large Moon stabilizes Earth's axial tilt, helping keep our climate relatively stable.",
      "About 71% of Earth's surface is covered by oceans.",
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
    distance: 26,
    orbitSpeed: 0.53,
    rotationSpeed: 0.88,
    tagline: "The dusty, rust-red desert planet.",
    stats: {
      "Diameter": "6,779 km",
      "Day length": "24.6 hours",
      "Year length": "687 Earth days",
      "Moons": "2 (Phobos & Deimos)",
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
    key: "jupiter",
    name: "Jupiter",
    color: 0xd8ac7c,
    texture: TEXTURES.jupiter,
    radius: 3.8,
    distance: 36,
    orbitSpeed: 0.084,
    rotationSpeed: 2.2,
    tagline: "The giant king of the planets.",
    stats: {
      "Diameter": "139,820 km (11× Earth)",
      "Day length": "9.9 hours",
      "Year length": "12 Earth years",
      "Moons": "95 known (Io, Europa, Ganymede, Callisto notable)",
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
    distance: 46,
    orbitSpeed: 0.034,
    rotationSpeed: 2.0,
    tagline: "The jewel of the solar system, famous for its rings.",
    stats: {
      "Diameter": "116,460 km (9.4× Earth)",
      "Day length": "10.7 hours",
      "Year length": "29.4 Earth years",
      "Moons": "146 known (Titan is largest)",
    },
    facts: [
      "Saturn's rings are made mostly of ice particles, with some rock and dust, ranging from tiny grains to house-sized chunks.",
      "Saturn is the least dense planet — it would float in water if you had a bathtub big enough.",
      "Titan, its largest moon, is bigger than the planet Mercury and the only moon with a thick atmosphere — denser than Earth's, with rain and lakes of liquid methane.",
      "Tiny Enceladus shoots geysers of salty water hundreds of kilometres into space from an ocean beneath its icy crust.",
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
    distance: 55,
    orbitSpeed: 0.012,
    rotationSpeed: 1.4,
    tagline: "The tilted ice giant that spins on its side.",
    stats: {
      "Diameter": "50,724 km (4× Earth)",
      "Day length": "17.2 hours",
      "Year length": "84 Earth years",
      "Moons": "27 known (Titania, Oberon notable)",
    },
    facts: [
      "Uranus is tilted almost 98° on its axis — it essentially rolls around the Sun on its side.",
      "It's an 'ice giant' made largely of water, ammonia, and methane ices around a rocky core.",
      "Uranus appears pale cyan because methane in its atmosphere absorbs red light.",
    ],
  },
  {
    key: "neptune",
    name: "Neptune",
    color: 0x3a5fcd,
    texture: TEXTURES.neptune,
    radius: 2.1,
    distance: 64,
    orbitSpeed: 0.006,
    rotationSpeed: 1.5,
    tagline: "The distant, windy blue ice giant.",
    stats: {
      "Diameter": "49,244 km (3.9× Earth)",
      "Day length": "16.1 hours",
      "Year length": "165 Earth years",
      "Moons": "16 known (Triton is largest)",
    },
    facts: [
      "Neptune has the fastest winds in the solar system, reaching up to 2,100 km/h (1,300 mph).",
      "It was the first planet located through mathematical prediction rather than direct observation.",
      "Triton, its largest moon, orbits backwards and is likely a captured Kuiper Belt object.",
    ],
  },
];

export { TEXTURES, SUN, PLANETS };
