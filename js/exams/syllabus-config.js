(function () {
  const DEFAULT_SUBJECTS = [
    { id: "mathematics", name: "Mathematics", accent: "blue" },
    { id: "science", name: "Science", accent: "green" },
    { id: "social-studies", name: "Social Studies", accent: "amber" },
    { id: "english", name: "English", accent: "violet" },
    { id: "hindi", name: "Hindi", accent: "rose" }
  ];

  const CBSE_GRADE_9 = {
    subjects: DEFAULT_SUBJECTS,
    chapters: {
      mathematics: [
        { id: "number-systems", name: "Number Systems", concepts: ["Rational Numbers", "Irrational Numbers", "Real Numbers", "Decimal Expansions", "Number Line Representation"] },
        { id: "polynomials", name: "Polynomials", concepts: ["Zeros of Polynomials", "Remainder Theorem", "Factor Theorem", "Algebraic Identities"] },
        { id: "coordinate-geometry", name: "Coordinate Geometry", concepts: ["Cartesian Plane", "Coordinates", "Quadrants", "Plotting Points"] },
        { id: "linear-equations-two-variables", name: "Linear Equations in Two Variables", concepts: ["Solutions", "Graph of Linear Equation", "Intercepts", "Word Problems"] },
        { id: "euclids-geometry", name: "Introduction to Euclid's Geometry", concepts: ["Axioms", "Postulates", "Definitions", "Logical Reasoning"] },
        { id: "lines-and-angles", name: "Lines and Angles", concepts: ["Parallel Lines", "Transversal", "Angle Pairs", "Angle Sum Property"] },
        { id: "triangles", name: "Triangles", concepts: ["Congruence", "Inequalities", "Median", "Altitude"] },
        { id: "quadrilaterals", name: "Quadrilaterals", concepts: ["Parallelogram", "Diagonals", "Midpoint Theorem", "Angle Properties"] },
        { id: "areas-parallelograms-triangles", name: "Areas of Parallelograms and Triangles", concepts: ["Same Base", "Same Parallels", "Area Relations", "Triangle Area"] },
        { id: "circles", name: "Circles", concepts: ["Chord", "Arc", "Cyclic Quadrilateral", "Angles in a Circle"] },
        { id: "constructions", name: "Constructions", concepts: ["Angle Bisector", "Perpendicular Bisector", "Triangle Construction", "Geometric Steps"] },
        { id: "herons-formula", name: "Heron's Formula", concepts: ["Semi-perimeter", "Triangle Area", "Applications", "Composite Figures"] },
        { id: "surface-areas-volumes", name: "Surface Areas and Volumes", concepts: ["Cube", "Cuboid", "Cylinder", "Cone", "Sphere"] },
        { id: "statistics", name: "Statistics", concepts: ["Mean", "Median", "Mode", "Frequency Distribution", "Bar Graph"] },
        { id: "probability", name: "Probability", concepts: ["Experiment", "Outcome", "Event", "Empirical Probability"] }
      ],
      science: [
        { id: "matter-surroundings", name: "Matter in Our Surroundings", concepts: ["States of Matter", "Evaporation", "Latent Heat", "Diffusion"] },
        { id: "is-matter-around-us-pure", name: "Is Matter Around Us Pure", concepts: ["Mixtures", "Solutions", "Suspensions", "Separation Techniques"] },
        { id: "atoms-and-molecules", name: "Atoms and Molecules", concepts: ["Atoms", "Molecules", "Mole Concept", "Chemical Formulae"] },
        { id: "structure-of-atom", name: "Structure of the Atom", concepts: ["Electrons", "Protons", "Neutrons", "Valency"] },
        { id: "cell", name: "The Fundamental Unit of Life", concepts: ["Cell Organelles", "Plasma Membrane", "Nucleus", "Osmosis"] },
        { id: "tissues", name: "Tissues", concepts: ["Plant Tissues", "Animal Tissues", "Epithelial Tissue", "Muscular Tissue"] },
        { id: "motion", name: "Motion", concepts: ["Speed", "Velocity", "Acceleration", "Graphs"] },
        { id: "force-laws-motion", name: "Force and Laws of Motion", concepts: ["Inertia", "Momentum", "Newton's Laws", "Conservation"] },
        { id: "gravitation", name: "Gravitation", concepts: ["Universal Law", "Free Fall", "Mass and Weight", "Thrust and Pressure"] },
        { id: "work-energy", name: "Work and Energy", concepts: ["Work", "Kinetic Energy", "Potential Energy", "Power"] },
        { id: "sound", name: "Sound", concepts: ["Waves", "Frequency", "Amplitude", "Echo"] },
        { id: "improvement-food-resources", name: "Improvement in Food Resources", concepts: ["Crop Variety", "Manure", "Irrigation", "Animal Husbandry"] }
      ],
      "social-studies": [
        { id: "french-revolution", name: "The French Revolution", concepts: ["Estate System", "National Assembly", "Reign of Terror", "Napoleon"] },
        { id: "socialism-europe-russian-revolution", name: "Socialism in Europe and the Russian Revolution", concepts: ["Socialism", "Russian Revolution", "Lenin", "Collectivisation"] },
        { id: "india-size-location", name: "India - Size and Location", concepts: ["Latitude", "Longitude", "Standard Meridian", "Neighbors"] },
        { id: "physical-features-india", name: "Physical Features of India", concepts: ["Himalayas", "Plains", "Plateaus", "Coastal Plains"] },
        { id: "democratic-politics", name: "What is Democracy? Why Democracy?", concepts: ["Democracy", "Rights", "Elections", "Accountability"] },
        { id: "people-as-resource", name: "People as Resource", concepts: ["Human Capital", "Education", "Health", "Unemployment"] }
      ],
      english: [
        { id: "beehive-prose", name: "Beehive Prose", concepts: ["Theme", "Character", "Inference", "Vocabulary"] },
        { id: "beehive-poetry", name: "Beehive Poetry", concepts: ["Imagery", "Tone", "Rhyme", "Poetic Devices"] },
        { id: "moments", name: "Moments Supplementary Reader", concepts: ["Plot", "Narration", "Character Motivation", "Moral"] },
        { id: "grammar", name: "Grammar", concepts: ["Tenses", "Modals", "Reported Speech", "Subject Verb Agreement"] },
        { id: "writing", name: "Writing Skills", concepts: ["Diary Entry", "Story Writing", "Descriptive Paragraph", "Letter"] }
      ],
      hindi: [
        { id: "kshitij", name: "Kshitij", concepts: ["Gadya", "Padya", "Bhavarth", "Sahityik Vishleshan"] },
        { id: "kritika", name: "Kritika", concepts: ["Kahani", "Patra", "Sankshipt Uttar", "Mool Sandesh"] },
        { id: "vyakaran", name: "Vyakaran", concepts: ["Sandhi", "Samas", "Upsarg", "Pratyay"] },
        { id: "lekhan", name: "Lekhan", concepts: ["Anuchhed", "Patra", "Suchna", "Samvad"] }
      ]
    }
  };

  const GENERIC_BOARD = {
    subjects: DEFAULT_SUBJECTS,
    chapters: CBSE_GRADE_9.chapters
  };

  const SYLLABUS = {
    CBSE: {
      "9": CBSE_GRADE_9,
      default: GENERIC_BOARD
    },
    ICSE: {
      default: GENERIC_BOARD
    },
    "STATE BOARD": {
      default: GENERIC_BOARD
    },
    IB: {
      default: GENERIC_BOARD
    },
    CAMBRIDGE: {
      default: GENERIC_BOARD
    },
    default: GENERIC_BOARD
  };

  function normalizeBoard(board) {
    return String(board || "CBSE").trim().toUpperCase();
  }

  function normalizeGrade(grade) {
    const match = String(grade || "9").match(/\d+/);
    return match ? match[0] : "9";
  }

  function getSyllabus(grade, board) {
    const boardConfig = SYLLABUS[normalizeBoard(board)] || SYLLABUS.default;
    return boardConfig[normalizeGrade(grade)] || boardConfig.default || SYLLABUS.default;
  }

  function getSubjects(grade, board) {
    return getSyllabus(grade, board).subjects || DEFAULT_SUBJECTS;
  }

  function getChapters(grade, board, subjectId) {
    return (getSyllabus(grade, board).chapters || {})[subjectId] || [];
  }

  window.TutorlySyllabus = {
    getSubjects,
    getChapters,
    getSyllabus,
    normalizeBoard,
    normalizeGrade
  };
})();
