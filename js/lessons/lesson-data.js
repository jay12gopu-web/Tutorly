(function () {
  const subjects = [
    {
      id: "mathematics",
      name: "Mathematics",
      icon: "M",
      color: "blue",
      chapters: [
        { id: "real-numbers", title: "Real Numbers", minutes: 38, difficulty: "Medium", concepts: ["number systems", "rational numbers", "irrational numbers", "decimal expansion", "number line"], applications: ["measurement", "finance", "science calculations"] },
        { id: "polynomials", title: "Polynomials", minutes: 42, difficulty: "Medium", concepts: ["terms", "degree", "zeros", "factorisation", "identities"], applications: ["area models", "motion graphs", "pattern prediction"] },
        { id: "linear-equations", title: "Linear Equations", minutes: 40, difficulty: "Medium", concepts: ["variables", "solutions", "graphs", "intercepts", "word models"], applications: ["pricing", "speed and time", "budget planning"] },
        { id: "trigonometry", title: "Trigonometry", minutes: 45, difficulty: "Hard", concepts: ["right triangle", "sine", "cosine", "tangent", "angles of elevation"], applications: ["height measurement", "surveying", "navigation"] },
        { id: "circles", title: "Circles", minutes: 36, difficulty: "Medium", concepts: ["radius", "diameter", "chord", "arc", "tangent"], applications: ["wheels", "clocks", "design"] },
        { id: "statistics", title: "Statistics", minutes: 34, difficulty: "Easy", concepts: ["data", "mean", "median", "mode", "frequency"], applications: ["sports analysis", "marks analysis", "weather data"] }
      ]
    },
    {
      id: "science",
      name: "Science",
      icon: "S",
      color: "green",
      chapters: [
        { id: "matter", title: "Matter in Our Surroundings", minutes: 35, difficulty: "Easy", concepts: ["particles", "solid", "liquid", "gas", "change of state"], applications: ["cooking", "weather", "cooling"] },
        { id: "cell", title: "The Fundamental Unit of Life", minutes: 44, difficulty: "Medium", concepts: ["cell membrane", "nucleus", "cytoplasm", "mitochondria", "vacuole"], applications: ["medicine", "growth", "health"] },
        { id: "motion", title: "Motion", minutes: 40, difficulty: "Medium", concepts: ["distance", "displacement", "speed", "velocity", "acceleration"], applications: ["transport", "sports", "safety"] },
        { id: "work-energy", title: "Work and Energy", minutes: 42, difficulty: "Medium", concepts: ["work", "energy", "power", "kinetic energy", "potential energy"], applications: ["machines", "electricity", "daily activities"] },
        { id: "sound", title: "Sound", minutes: 36, difficulty: "Easy", concepts: ["vibration", "wave", "frequency", "amplitude", "echo"], applications: ["music", "ultrasound", "communication"] }
      ]
    },
    {
      id: "english",
      name: "English",
      icon: "E",
      color: "violet",
      chapters: [
        { id: "story-structure", title: "Story Structure", minutes: 28, difficulty: "Easy", concepts: ["setting", "character", "conflict", "climax", "resolution"], applications: ["reading comprehension", "creative writing", "film analysis"] },
        { id: "grammar-tenses", title: "Grammar: Tenses", minutes: 32, difficulty: "Medium", concepts: ["present", "past", "future", "aspect", "time markers"], applications: ["clear writing", "speaking", "exam answers"] },
        { id: "poetry-devices", title: "Poetic Devices", minutes: 30, difficulty: "Medium", concepts: ["imagery", "simile", "metaphor", "rhyme", "tone"], applications: ["poetry reading", "lyrics", "literary analysis"] },
        { id: "essay-writing", title: "Essay Writing", minutes: 36, difficulty: "Medium", concepts: ["thesis", "paragraph", "evidence", "coherence", "conclusion"], applications: ["school assignments", "debates", "reports"] }
      ]
    },
    {
      id: "social-studies",
      name: "Social Studies",
      icon: "SS",
      color: "amber",
      chapters: [
        { id: "french-revolution", title: "The French Revolution", minutes: 46, difficulty: "Medium", concepts: ["estate system", "liberty", "national assembly", "reign of terror", "napoleon"], applications: ["citizenship", "rights", "modern democracy"] },
        { id: "india-physical-features", title: "Physical Features of India", minutes: 40, difficulty: "Medium", concepts: ["himalayas", "plains", "plateaus", "deserts", "coastal plains"], applications: ["climate", "agriculture", "settlement"] },
        { id: "democracy", title: "What is Democracy?", minutes: 34, difficulty: "Easy", concepts: ["elections", "rights", "representation", "accountability", "constitution"], applications: ["citizenship", "governance", "public life"] },
        { id: "people-as-resource", title: "People as Resource", minutes: 32, difficulty: "Easy", concepts: ["human capital", "education", "health", "employment", "productivity"], applications: ["career planning", "economy", "public policy"] }
      ]
    },
    {
      id: "computer-science",
      name: "Computer Science",
      icon: "CS",
      color: "slate",
      chapters: [
        { id: "algorithms", title: "Algorithms and Flowcharts", minutes: 35, difficulty: "Easy", concepts: ["algorithm", "sequence", "decision", "loop", "flowchart"], applications: ["programming", "problem solving", "automation"] },
        { id: "internet", title: "Internet and Web", minutes: 30, difficulty: "Easy", concepts: ["browser", "server", "website", "URL", "data packets"], applications: ["research", "communication", "online learning"] },
        { id: "databases", title: "Introduction to Databases", minutes: 38, difficulty: "Medium", concepts: ["table", "record", "field", "key", "query"], applications: ["school records", "banking", "apps"] },
        { id: "cyber-safety", title: "Cyber Safety", minutes: 28, difficulty: "Easy", concepts: ["password", "privacy", "phishing", "malware", "digital footprint"], applications: ["safe browsing", "online accounts", "responsible sharing"] }
      ]
    }
  ];

  function getSubject(subjectId) {
    return subjects.find((subject) => subject.id === subjectId) || subjects[0];
  }

  function getChapter(subjectId, chapterId) {
    const subject = getSubject(subjectId);
    return subject.chapters.find((chapter) => chapter.id === chapterId) || subject.chapters[0];
  }

  window.TutorlyLessonsData = {
    subjects,
    getSubject,
    getChapter
  };
})();
