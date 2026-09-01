// Data-driven flashcard quiz generation.
// Builds simple question/answer pairs from the `stats`/`facts`/`tagline`
// fields already present on SUN and each entry in PLANETS (src/data.js).
// Adding a new stat field or fact to data.js automatically produces more
// flashcards — no per-planet question authoring required.

function parseFirstNumber(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/,/g, "");
  const match = cleaned.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

// Normalize a "Day length" stat string to hours for comparison purposes.
function dayLengthToHours(str) {
  const n = parseFirstNumber(str);
  if (n === null) return null;
  return /day/i.test(str) ? n * 24 : n;
}

// Normalize a "Year length" stat string to Earth days for comparison purposes.
function yearLengthToDays(str) {
  const n = parseFirstNumber(str);
  if (n === null) return null;
  return /year/i.test(str) ? n * 365.25 : n;
}

const STAT_TEMPLATES = [
  {
    key: "Diameter",
    question: (name) => `How big across (diameter) is ${name}?`,
  },
  {
    key: "Day length",
    question: (name) => `How long is one day on ${name}?`,
  },
  {
    key: "Year length",
    question: (name) => `How long is one year on ${name} (its orbit around the Sun)?`,
  },
  {
    key: "Moons",
    question: (name) => `How many known moons does ${name} have?`,
  },
];

/**
 * Generate a flat, shuffle-able list of { question, answer } flashcards
 * from the Sun and planet data objects.
 */
function generateQuizQuestions(sun, planets) {
  const cards = [];
  const bodies = [sun, ...planets];

  for (const body of bodies) {
    const stats = body.stats || {};

    for (const tmpl of STAT_TEMPLATES) {
      const value = stats[tmpl.key];
      if (value) {
        cards.push({ question: tmpl.question(body.name), answer: value });
      }
    }

    if (body.tagline) {
      cards.push({
        question: `What is ${body.name} known for?`,
        answer: body.tagline,
      });
    }

    if (Array.isArray(body.facts) && body.facts.length > 0) {
      const fact = body.facts[0];
      cards.push({
        question: `Tell me an interesting fact about ${body.name}.`,
        answer: fact,
      });
    }
  }

  // Comparison questions computed across all planets (Sun excluded — these
  // are planet-to-planet comparisons).
  const withMoons = planets
    .map((p) => ({ name: p.name, moons: parseFirstNumber(p.stats?.Moons) }))
    .filter((p) => p.moons !== null);
  if (withMoons.length > 0) {
    const most = withMoons.reduce((a, b) => (b.moons > a.moons ? b : a));
    cards.push({
      question: "Which planet has the most known moons?",
      answer: `${most.name} (${most.moons} known moons)`,
    });
  }

  const withDiameter = planets
    .map((p) => ({ name: p.name, diameter: parseFirstNumber(p.stats?.Diameter) }))
    .filter((p) => p.diameter !== null);
  if (withDiameter.length > 0) {
    const biggest = withDiameter.reduce((a, b) => (b.diameter > a.diameter ? b : a));
    const smallest = withDiameter.reduce((a, b) => (b.diameter < a.diameter ? b : a));
    cards.push({
      question: "Which planet is the largest (biggest diameter)?",
      answer: biggest.name,
    });
    cards.push({
      question: "Which planet is the smallest?",
      answer: smallest.name,
    });
  }

  const withYear = planets
    .map((p) => ({ name: p.name, days: yearLengthToDays(p.stats?.["Year length"]) }))
    .filter((p) => p.days !== null);
  if (withYear.length > 0) {
    const longest = withYear.reduce((a, b) => (b.days > a.days ? b : a));
    const shortest = withYear.reduce((a, b) => (b.days < a.days ? b : a));
    cards.push({
      question: "Which planet takes the longest to orbit the Sun?",
      answer: longest.name,
    });
    cards.push({
      question: "Which planet orbits the Sun the fastest (shortest year)?",
      answer: shortest.name,
    });
  }

  const withDay = planets
    .map((p) => ({ name: p.name, hours: dayLengthToHours(p.stats?.["Day length"]) }))
    .filter((p) => p.hours !== null);
  if (withDay.length > 0) {
    const spinsFastest = withDay.reduce((a, b) => (b.hours < a.hours ? b : a));
    const spinsSlowest = withDay.reduce((a, b) => (b.hours > a.hours ? b : a));
    cards.push({
      question: "Which planet spins fastest (shortest day)?",
      answer: spinsFastest.name,
    });
    cards.push({
      question: "Which planet has the longest day?",
      answer: spinsSlowest.name,
    });
  }

  return cards;
}

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export { generateQuizQuestions, shuffle };
