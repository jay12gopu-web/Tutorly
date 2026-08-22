from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TopicSpec:
    subject: str
    key: str
    label: str
    direct: str
    indirect: str
    topic_signals: tuple[str, ...]
    answer_signals: tuple[str, ...]
    accepted_subjects: tuple[str, ...] = ()
    visual: str = "optional"
    expected_formats: tuple[str, ...] = ()


def T(
    key: str,
    label: str,
    direct: str,
    indirect: str,
    topic_signals: tuple[str, ...],
    answer_signals: tuple[str, ...],
    *,
    accepted: tuple[str, ...] = (),
    visual: str = "optional",
    formats: tuple[str, ...] = (),
) -> tuple:
    return key, label, direct, indirect, topic_signals, answer_signals, accepted, visual, formats


TOPICS: dict[str, tuple[tuple, ...]] = {
    "mathematics": (
        T("multiplication", "multiplication", "Calculate 37 × 24.", "There are 37 rows with 24 chairs in each row. How many chairs are there?", ("multiplication", "arithmetic"), ("888",), visual="forbidden"),
        T("linear-equation", "linear equations", "Solve 3x + 7 = 22.", "Three times a number, increased by seven, is twenty-two. Find the number.", ("linear equation", "algebra"), ("x = 5", "x=5"), visual="forbidden", formats=("math_worked_solution",)),
        T("quadratic-roots", "quadratic equations", "Solve x² - 5x + 6 = 0.", "Which two numbers have a sum of 5 and a product of 6, and how do they give the roots?", ("quadratic", "factor"), ("2", "3"), formats=("math_worked_solution",)),
        T("linear-graph", "linear graphs", "Explain what happens to y as x increases in y = 2x + 3.", "A quantity starts at 3 and rises by 2 whenever the input rises by 1. Show and explain the relationship.", ("linear", "graph", "slope"), ("slope", "2"), visual="required", formats=("math_graph",)),
        T("pythagoras", "Pythagoras' theorem", "A right triangle has legs 6 cm and 8 cm. Find the hypotenuse.", "A ladder's horizontal and vertical distances form sides of 6 m and 8 m. How long is the ladder?", ("pythag", "right triangle"), ("10",), visual="required", formats=("geometry_solution", "math_worked_solution")),
        T("percentage", "percentages", "Find 15% of 240.", "A ₹240 item has a discount equal to fifteen parts out of every hundred. How much is the discount?", ("percent",), ("36",), visual="forbidden", formats=("math_worked_solution",)),
        T("ratio", "ratios", "Divide 35 in the ratio 2:3.", "Two friends share 35 stickers so the first gets two parts for every three parts the second gets. Find both shares.", ("ratio",), ("14", "21"), formats=("math_worked_solution",)),
        T("probability", "probability", "What is the probability of rolling an even number on a fair six-sided die?", "Half of the faces on a normal die show an even value. Express the chance as a fraction.", ("probability",), ("1/2", "one-half", "0.5"), formats=("math_worked_solution", "concept_explanation")),
        T("mean", "arithmetic mean", "Find the mean of 4, 7, 9, and 10.", "Four scores total 30. What average do they have?", ("mean", "average", "statistics"), ("7.5",), formats=("math_worked_solution",)),
        T("corresponding-angles", "corresponding angles", "Explain corresponding angles formed by a transversal across parallel lines.", "Two parallel roads are crossed by another road. Why are angles in matching corners equal?", ("corresponding angle", "parallel", "transversal"), ("equal",), visual="required", formats=("geometry_solution", "concept_explanation")),
    ),
    "physics": (
        T("inertia", "inertia", "Why do passengers move forward when a bus suddenly stops?", "My body keeps going even after the vehicle brakes sharply. What causes that?", ("inertia", "newton"), ("keep moving", "continues", "resist"), formats=("why_explanation",)),
        T("newton-second-law", "Newton's second law", "A 3 kg object accelerates at 4 m/s². Find the net force.", "What push is needed to give a three-kilogram cart an acceleration of four metres per second squared?", ("newton", "force", "f = ma"), ("12", "N"), formats=("physics_numerical",)),
        T("kinetic-energy", "kinetic energy", "Find the kinetic energy of a 2 kg object moving at 3 m/s.", "How much energy of motion does a two-kilogram ball have at three metres per second?", ("kinetic energy",), ("9", "J"), formats=("physics_numerical",)),
        T("ohms-law", "Ohm's law", "A 4 Ω resistor is connected to 12 V. Find the current.", "Twelve volts pushes charge through four ohms of resistance. How many amperes flow?", ("ohm", "current", "resistance"), ("3", "A"), formats=("physics_numerical",)),
        T("series-circuit", "series circuits", "Explain current and voltage in a simple series circuit.", "Several bulbs are placed one after another in a single loop. What stays the same and what is shared?", ("series circuit", "electric circuit"), ("current", "voltage"), visual="required"),
        T("reflection", "reflection of light", "State and explain the law of reflection.", "A light ray bounces from a mirror. How is its outgoing angle related to its incoming angle?", ("reflection",), ("angle of incidence", "angle of reflection", "equal"), visual="required"),
        T("refraction", "refraction", "Why does a straw look bent in water?", "Light changes direction when it passes from air into a liquid. Explain the apparent shift.", ("refraction",), ("speed", "bend", "direction"), visual="required"),
        T("pressure", "pressure", "A 200 N force acts over 0.5 m². Find the pressure.", "Two hundred newtons is spread over half a square metre. What pressure results?", ("pressure",), ("400", "Pa"), formats=("physics_numerical",)),
        T("wave-frequency", "wave frequency", "What does frequency mean for a wave, and what is its SI unit?", "How do we describe the number of complete vibrations made each second?", ("frequency", "wave"), ("hertz", "Hz", "per second"), visual="optional"),
        T("motion-graph", "distance-time graphs", "How can a distance-time graph show whether an object is moving faster?", "On a chart of distance against time, what does a steeper line tell us?", ("distance-time", "motion graph", "speed"), ("slope", "steep"), visual="required"),
    ),
    "chemistry": (
        T("dissolution", "dissolution", "Why does salt seem to disappear in water?", "The crystals vanish from sight but the liquid tastes salty. What happened to the particles?", ("dissol", "solution"), ("water", "ion", "particle")),
        T("sublimation", "sublimation", "What is sublimation?", "How can a solid turn directly into a gas without first becoming liquid?", ("sublimation", "change of state"), ("solid", "gas"), visual="required"),
        T("atomic-structure", "atomic structure", "Describe the basic structure of an atom.", "What is found in the tiny centre of matter, and what moves around it?", ("atom", "atomic structure"), ("nucleus", "electron"), visual="required"),
        T("periodic-groups", "periodic table groups", "Why do elements in the same periodic-table group have similar properties?", "Elements in one vertical column often react alike. What feature explains this?", ("periodic", "group", "valence"), ("outer", "electron", "valence")),
        T("ionic-bond", "ionic bonding", "Explain how sodium and chlorine form an ionic bond.", "One atom gives away an electron and another accepts it. Why do the resulting particles attract?", ("ionic", "bond"), ("transfer", "electron", "opposite", "ion"), visual="required"),
        T("covalent-bond", "covalent bonding", "What happens in a covalent bond?", "Two non-metal atoms hold some electrons between them. Explain the bond.", ("covalent", "bond"), ("share", "electron"), visual="required"),
        T("balancing", "balancing chemical equations", "Balance H₂ + O₂ → H₂O.", "Choose coefficients so hydrogen and oxygen atoms are conserved when water forms.", ("balanc", "chemical equation"), ("2H", "2 H", "2H₂O", "2 H₂O"), formats=("chemistry_reaction",)),
        T("neutralization", "acid-base neutralization", "What happens when an acid reacts with a base?", "An acidic solution and an alkaline solution cancel each other's effects. What products usually form?", ("neutral", "acid", "base"), ("salt", "water")),
        T("mass-conservation", "conservation of mass", "Explain conservation of mass in a chemical reaction.", "Why should the total mass stay unchanged when atoms rearrange in a closed container?", ("conservation", "mass"), ("atom", "created", "destroyed", "same")),
        T("distillation", "distillation", "How does simple distillation separate a liquid from a solution?", "A mixture is heated, one part becomes vapour, and is cooled elsewhere. Explain the separation.", ("distillation",), ("boil", "evapor", "condens"), visual="required", formats=("process_steps",)),
    ),
    "biology": (
        T("mitochondria", "mitochondria", "What do mitochondria do?", "Why does the powerhouse of a cell need oxygen?", ("mitochond", "cellular respiration"), ("energy", "ATP", "respiration"), visual="required"),
        T("photosynthesis", "photosynthesis", "How does photosynthesis work?", "How does a green leaf use light, air, and water to make food?", ("photosynth",), ("carbon dioxide", "water", "glucose", "oxygen"), visual="required", formats=("biology_process", "process_steps")),
        T("respiration", "cellular respiration", "What is cellular respiration?", "How do cells release usable energy from food, usually with oxygen?", ("cellular respiration", "respiration"), ("glucose", "energy", "ATP"), visual="required"),
        T("circulation", "blood circulation", "Explain how blood moves through the heart, lungs, and body.", "Trace the journey of blood as it collects oxygen and delivers it to tissues.", ("circulation", "heart", "blood flow"), ("heart", "lungs", "body"), visual="required", formats=("biology_process", "process_steps")),
        T("digestion", "digestion", "How does the digestive system break down and absorb food?", "What happens to a meal from the mouth until nutrients enter the blood?", ("digest",), ("break", "absorb", "small intestine"), visual="required"),
        T("cell-membrane", "cell membrane", "What is the function of the cell membrane?", "Which thin boundary controls what enters and leaves a cell?", ("cell membrane", "plasma membrane"), ("enter", "leave", "control"), visual="required"),
        T("dna", "DNA and genes", "How do DNA and genes carry inherited information?", "Where are biological instructions stored and how can parents pass them to offspring?", ("dna", "gene", "heredity"), ("instruction", "gene", "inherit")),
        T("food-chain", "food chains", "Explain how energy moves through a food chain.", "How does energy travel from sunlight to plants and then to animals?", ("food chain", "energy flow"), ("producer", "consumer", "energy"), visual="required"),
        T("kidneys", "kidney function", "What do the kidneys do?", "Which organs filter the blood, balance water, and produce urine?", ("kidney", "renal"), ("filter", "blood", "urine"), visual="required"),
        T("xylem", "xylem transport", "How does xylem transport water through a plant?", "How does water move upward from roots to leaves through long tubes?", ("xylem", "water transport"), ("root", "leaf", "water"), visual="required"),
    ),
    "science": (
        T("scientific-method", "scientific investigation", "How does a fair scientific investigation test a hypothesis?", "A student changes one factor, measures the result, and keeps the rest constant. Explain the reasoning.", ("scientific method", "investigation", "experiment"), ("hypothesis", "variable", "evidence"), accepted=("science",)),
        T("lab-safety", "laboratory safety", "Why are goggles and careful labeling important in a science laboratory?", "How do eye protection and named containers reduce risk during an experiment?", ("lab safety", "laboratory safety"), ("protect", "chemical", "hazard"), accepted=("science", "chemistry")),
        T("measurement", "scientific measurement", "Why should scientific measurements use standard units and repeated trials?", "How do common units and taking a reading more than once make results trustworthy?", ("measurement", "accuracy", "reliability"), ("unit", "repeat", "accur"), accepted=("science", "physics")),
        T("states-of-matter", "states of matter", "Compare particles in solids, liquids, and gases.", "Why does one material keep its shape, another flow, and another fill its container?", ("states of matter", "particle"), ("solid", "liquid", "gas"), accepted=("science", "chemistry"), visual="required"),
        T("renewable-energy", "renewable energy", "What makes an energy source renewable?", "Why can sunlight and wind be used repeatedly while coal cannot?", ("renewable", "energy"), ("replenish", "sun", "wind"), accepted=("science", "physics", "geography")),
        T("water-cycle", "water cycle", "Explain the water cycle.", "How does water travel from Earth's surface to the air and return as rain?", ("water cycle",), ("evap", "condens", "precip"), accepted=("science", "geography"), visual="required"),
        T("greenhouse-effect", "greenhouse effect", "How does the greenhouse effect warm Earth?", "Why can gases in the atmosphere let sunlight in but slow heat from escaping?", ("greenhouse",), ("heat", "atmosphere", "infrared"), accepted=("science", "geography"), visual="required"),
        T("ecosystem", "ecosystems", "How do living and non-living parts interact in an ecosystem?", "Explain how organisms depend on water, soil, sunlight, and one another.", ("ecosystem",), ("biotic", "abiotic", "living", "non-living"), accepted=("science", "biology")),
        T("pollution", "pollution", "How can pollution affect air, water, soil, and living things?", "Waste enters the environment and harms organisms. Explain the connected effects.", ("pollution",), ("air", "water", "harm"), accepted=("science", "biology", "geography")),
        T("observation-inference", "observation and inference", "What is the difference between an observation and an inference in science?", "A student sees droplets outside a cold glass and concludes where they came from. Separate what was seen from what was reasoned.", ("observation", "inference"), ("see", "evidence", "conclusion"), accepted=("science",)),
    ),
    "english": (
        T("subject-verb", "subject-verb agreement", "Explain subject-verb agreement with an example.", "Why is 'The dogs run' correct but 'The dogs runs' incorrect?", ("subject-verb", "agreement"), ("singular", "plural", "verb"), formats=("english_grammar",)),
        T("tenses", "verb tenses", "Compare simple past, present, and future tense.", "How does a verb show whether an action happened before, happens now, or will happen later?", ("tense",), ("past", "present", "future"), formats=("english_grammar", "comparison_table")),
        T("active-passive", "active and passive voice", "Change 'The chef cooked the meal' into passive voice and explain.", "Rewrite the sentence so the meal receives the action rather than the chef leading it.", ("passive", "active voice"), ("meal was cooked", "was cooked"), formats=("english_grammar",)),
        T("metaphor", "metaphor and imagery", "Why might a poet call the night a blanket?", "The darkness is described as something that wraps the world. Analyze the comparison.", ("metaphor", "imagery", "poetry"), ("comfort", "cover", "dark", "metaphor"), formats=("english_literature",)),
        T("plot", "plot analysis", "How do rising action, climax, and resolution shape a story's plot?", "Explain how tension grows, reaches a turning point, and then settles at the end of a narrative.", ("plot", "climax", "rising action"), ("conflict", "climax", "resolution"), formats=("english_literature", "analysis")),
        T("character", "character analysis", "How should a student analyze a character using evidence from a story?", "A person in a novel changes after a difficult choice. How can details from the text support an interpretation?", ("character analysis", "character"), ("evidence", "action", "change"), formats=("english_literature", "analysis")),
        T("poetry-imagery", "poetic imagery", "What is imagery in poetry and what effect can it create?", "Why does a poet use details that make readers see, hear, or feel a scene?", ("imagery", "poetry"), ("sense", "picture", "reader"), formats=("english_literature",)),
        T("paragraph", "paragraph writing", "How do I write a clear paragraph with a topic sentence and supporting details?", "Show how one main idea can be introduced, supported, and concluded in a paragraph.", ("paragraph", "topic sentence"), ("topic sentence", "support", "conclud"), formats=("writing_help",)),
        T("context-clues", "context clues", "How can context clues help determine an unfamiliar word's meaning?", "If I do not know one word in a sentence, how can the surrounding words help me work it out?", ("context clue", "vocabulary"), ("surround", "clue", "meaning"), formats=("english_vocabulary", "reading_comprehension")),
        T("inference", "reading inference", "How do readers make an inference from a passage?", "The writer never states the answer directly, but leaves details. How should a reader reach a supported conclusion?", ("inference", "reading comprehension"), ("evidence", "clue", "conclusion"), formats=("english_literature", "analysis")),
    ),
    "social_science": (
        T("urbanization", "urbanization", "How does urbanization change society and people's lives?", "More families leave villages and settle in growing cities. Explain the social changes.", ("urbanization",), ("city", "migration", "service"), accepted=("social_science", "geography", "interdisciplinary")),
        T("globalization", "globalization", "What is globalization and how does it connect societies?", "Products, ideas, jobs, and media move across borders more easily than before. Explain this process.", ("globalization",), ("connect", "trade", "culture"), accepted=("social_science", "economics", "interdisciplinary")),
        T("culture", "culture", "How do language, beliefs, customs, and traditions form a culture?", "Why can groups of people have different ways of celebrating, communicating, and living?", ("culture",), ("belief", "custom", "tradition"), accepted=("social_science", "interdisciplinary")),
        T("institutions", "social institutions", "What are social institutions and why are they important?", "How do families, schools, governments, and religions organize social life?", ("social institution",), ("family", "school", "society"), accepted=("social_science", "civics", "interdisciplinary")),
        T("inequality", "social inequality", "What causes social inequality and how can it affect opportunity?", "Some groups have less access to education, income, or power than others. Explain the effects.", ("inequality",), ("opportun", "resource", "access"), accepted=("social_science", "economics", "civics")),
        T("population", "population change", "How can population growth affect jobs, housing, and public services?", "A town gains many residents quickly. What pressures and opportunities might follow?", ("population",), ("job", "housing", "service"), accepted=("social_science", "geography", "economics")),
        T("development", "human development", "Why is development measured using health and education as well as income?", "Two places earn similar amounts of money, but differ in schooling and life expectancy. Which is more developed?", ("human development", "development"), ("health", "education", "income"), accepted=("social_science", "economics", "geography")),
        T("migration", "migration", "What push and pull factors cause migration?", "Why might a family leave one place because of hardship and choose another for opportunity?", ("migration", "push", "pull"), ("push", "pull", "opportun"), accepted=("social_science", "geography")),
        T("media", "media and society", "How can media influence public opinion?", "Repeated stories and selected viewpoints can shape what people think is important. Explain.", ("media", "public opinion"), ("information", "opinion", "influence"), accepted=("social_science", "civics")),
        T("sustainability", "sustainable development", "How can development meet present needs without harming future generations?", "A community wants better lives today while preserving resources for tomorrow. Explain the balance.", ("sustainab",), ("future", "resource", "need"), accepted=("social_science", "geography", "economics", "interdisciplinary")),
    ),
    "history": (
        T("french-revolution", "French Revolution", "Why did the French Revolution begin?", "Why were ordinary people in France angry with taxes, food prices, and privilege before 1789?", ("french revolution",), ("tax", "inequal", "food", "privilege"), formats=("history_causes",)),
        T("industrial-revolution", "Industrial Revolution", "How did the Industrial Revolution change work and cities?", "Machines moved production from homes into factories and drew workers into towns. Explain the effects.", ("industrial revolution",), ("factory", "machine", "urban"), formats=("history_event",)),
        T("world-war-one", "First World War", "What were the main causes of World War I?", "How did alliances, militarism, imperial rivalry, and an assassination lead to a European war?", ("world war i", "first world war"), ("alliance", "militar", "assass"), formats=("history_causes",)),
        T("world-war-two", "Second World War", "Why did World War II begin in Europe?", "How did aggressive expansion and the invasion of Poland turn tension into war in 1939?", ("world war ii", "second world war"), ("Poland", "Germany", "1939", "aggression"), formats=("history_causes",)),
        T("indus-valley", "Indus Valley civilization", "What made Indus Valley cities advanced for their time?", "Ancient cities used planned streets, drainage, standardized bricks, and trade. Explain their importance.", ("indus", "harapp"), ("drain", "planned", "brick"), formats=("history_event",)),
        T("akbar", "Akbar's rule", "Why is Akbar remembered as an important Mughal ruler?", "How did administration, expansion, and policies toward different religions strengthen a Mughal emperor's rule?", ("akbar", "mughal"), ("administr", "relig", "empire"), formats=("history_event",)),
        T("indian-independence", "Indian independence movement", "How did non-violent mass movements contribute to Indian independence?", "Why were civil disobedience, boycotts, and public participation important in ending British rule?", ("indian independence", "freedom movement"), ("non-viol", "civil disobedience", "British"), formats=("history_event",)),
        T("renaissance", "Renaissance", "What was the Renaissance and why did it matter?", "Why did renewed interest in classical learning, art, and human potential transform Europe?", ("renaissance",), ("classical", "humanism", "art"), formats=("history_event",)),
        T("colonialism", "colonialism", "What is colonialism and how did it affect colonized societies?", "A foreign power controls another territory's government, land, and resources. Explain the consequences.", ("colonial",), ("control", "resource", "power"), formats=("history_event", "concept_explanation")),
        T("cold-war", "Cold War", "Why was the Cold War called 'cold'?", "Two superpowers competed through ideology, arms, allies, and proxy wars without fighting each other directly. Explain.", ("cold war",), ("United States", "Soviet", "direct", "proxy"), formats=("history_event",)),
    ),
    "geography": (
        T("rain-shadow", "orographic rainfall and rain shadow", "Why does one side of a mountain receive more rainfall than the other?", "Moist air rises over a mountain, cools, and leaves a dry region beyond it. Explain the process.", ("orographic", "rain shadow", "relief rainfall"), ("windward", "leeward", "cool", "condens"), visual="required"),
        T("plate-tectonics", "plate tectonics", "How does plate movement cause earthquakes and volcanoes?", "Huge pieces of Earth's outer layer collide, separate, or slide past one another. Explain the results.", ("plate tectonic",), ("plate", "boundary", "earthquake", "volcano"), visual="required"),
        T("river-processes", "river erosion and deposition", "How do rivers erode, transport, and deposit material?", "Why can fast water cut into land while slower water drops the sediment it carries?", ("river", "erosion", "deposition"), ("erosion", "transport", "deposit"), visual="required"),
        T("weather-climate", "weather and climate", "What is the difference between weather and climate?", "Compare today's atmospheric conditions with the long-term pattern of a place.", ("weather", "climate"), ("short", "long-term", "average"), formats=("comparison_table",)),
        T("population-density", "population density", "How is population density calculated and what does it show?", "What does dividing the number of people by land area tell us about a place?", ("population density",), ("people", "area", "divide")),
        T("map-scale", "map scale", "How does a map scale convert map distance to real distance?", "One centimetre on paper represents five kilometres on the ground. Explain how to use that information.", ("map scale", "scale"), ("distance", "represent"), visual="optional"),
        T("soil-formation", "soil formation", "How does soil form over time?", "Rock breaks down and mixes with decayed organic matter over many years. Explain the process.", ("soil formation", "soil"), ("weather", "organic", "humus"), visual="required"),
        T("agriculture", "factors affecting agriculture", "How do climate, soil, water, and technology affect farming?", "Why might the same crop grow well in one region but poorly in another?", ("agriculture", "farming"), ("climate", "soil", "water")),
        T("monsoon", "monsoon", "How do seasonal winds produce a monsoon?", "Why does land heating differently from the ocean reverse winds and bring a rainy season?", ("monsoon",), ("land", "sea", "wind", "rain"), visual="required"),
        T("urbanization", "urbanization geography", "How does rapid urbanization change land use and infrastructure?", "A city spreads outward as its population grows. Explain effects on housing, transport, and the environment.", ("urbanization", "urban"), ("housing", "transport", "land")),
    ),
    "civics": (
        T("bill-law", "legislative process", "How does an idea become a law?", "Trace a proposal as it is written, debated, voted on, and formally approved.", ("legislative", "bill", "law"), ("bill", "debate", "vote", "approval"), visual="required", formats=("civics_process", "process_steps")),
        T("democracy", "democracy", "What is democracy and what makes it meaningful?", "Why is electing leaders not enough unless citizens also have rights and accountable government?", ("democracy",), ("citizen", "elect", "account")),
        T("constitution", "constitution", "Why does a country need a constitution?", "How can a highest set of rules define government powers and protect people?", ("constitution",), ("power", "right", "government")),
        T("separation-powers", "separation of powers", "Why are government powers divided among different branches?", "How does preventing one institution from making, enforcing, and judging every rule protect liberty?", ("separation of powers", "checks and balances"), ("legisl", "execut", "judici", "check"), visual="required"),
        T("elections", "elections", "What makes an election free and fair?", "Why do secret ballots, real choices, equal rules, and honest counting matter?", ("election",), ("vote", "choice", "secret", "fair")),
        T("rights-duties", "rights and responsibilities", "How are citizens' rights connected to their responsibilities?", "Why should freedom be protected while people also respect laws and others' freedoms?", ("right", "responsibil", "duty"), ("freedom", "respect", "law")),
        T("local-government", "local government", "What does local government do for a community?", "Which level usually manages nearby services such as streets, waste, water, and local planning?", ("local government",), ("service", "water", "waste", "road")),
        T("judiciary", "judiciary", "What is the role of the judiciary?", "Who interprets laws, settles disputes, and checks whether government action follows the constitution?", ("judiciary", "court"), ("interpret", "law", "dispute")),
        T("federalism", "federalism", "How does federalism divide government power?", "Why might a constitution share authority between a national government and regional governments?", ("federal",), ("national", "state", "regional", "power"), visual="required"),
        T("rule-of-law", "rule of law", "What does the rule of law mean?", "Why must leaders and ordinary citizens be governed by publicly known laws rather than personal power?", ("rule of law",), ("everyone", "law", "equal")),
    ),
    "economics": (
        T("demand", "law of demand", "Why does quantity demanded usually fall when price rises?", "If a product becomes more expensive and nothing else changes, why might fewer people buy it?", ("demand",), ("price", "quantity", "fall", "decrease"), visual="required"),
        T("supply", "law of supply", "Why does quantity supplied usually rise when price rises?", "Why may producers offer more of a product when its selling price increases?", ("supply",), ("price", "quantity", "rise", "increase"), visual="required"),
        T("inflation", "inflation", "What is inflation and how does it affect purchasing power?", "Why can the same amount of money buy fewer goods after prices rise across the economy?", ("inflation",), ("price", "purchasing power", "money")),
        T("opportunity-cost", "opportunity cost", "What is opportunity cost?", "If you spend your evening studying instead of playing, what economic cost did you face?", ("opportunity cost",), ("next best", "give up", "alternative")),
        T("gdp", "gross domestic product", "What does GDP measure and what does it leave out?", "How can we total final goods and services produced inside a country without treating that as complete well-being?", ("gdp", "gross domestic product"), ("goods", "services", "country", "well-being")),
        T("unemployment", "unemployment", "What is unemployment and how can it affect an economy?", "People who want and seek work cannot find jobs. Explain personal and wider effects.", ("unemployment",), ("job", "income", "output")),
        T("market-structure", "competition and monopoly", "Compare a competitive market with a monopoly.", "How do prices and choices differ when many sellers compete versus when one seller dominates?", ("monopoly", "competition", "market structure"), ("seller", "choice", "price"), formats=("comparison_table",)),
        T("taxes", "taxation", "Why do governments collect taxes?", "How can money collected from people and businesses pay for shared services?", ("tax",), ("public", "service", "government")),
        T("interest", "interest", "How does interest work for borrowing and saving?", "Why does a borrower repay more than the amount received while a saver can earn a return?", ("interest",), ("borrow", "save", "rate")),
        T("scarcity", "scarcity", "Why is scarcity the basic economic problem?", "Human wants are large, but time, money, and resources are limited. Explain the choices this creates.", ("scarcity",), ("limited", "resource", "choice", "want")),
    ),
    "computer_science": (
        T("infinite-loop", "infinite loops", "Why does my loop never stop?", "A repetition condition never becomes false. Diagnose the problem and show a general fix.", ("infinite loop", "loop"), ("condition", "false", "update"), formats=("debugging",)),
        T("variables", "variables and data types", "What are variables and data types in programming?", "Why does a program need named places for values and rules about what kind of value each place holds?", ("variable", "data type"), ("store", "value", "type"), formats=("computer_science_concept",)),
        T("conditionals", "conditional statements", "How do if, else-if, and else control a program?", "How can code choose different actions depending on whether conditions are true or false?", ("conditional", "if statement"), ("condition", "true", "false"), formats=("computer_science_concept",)),
        T("arrays", "arrays", "What is an array and when is it useful?", "How can one ordered collection store several related values that are accessed by position?", ("array",), ("index", "element", "collection"), formats=("computer_science_concept",)),
        T("functions", "functions", "Why do programmers use functions?", "How does naming a reusable block of code reduce repetition and organize a program?", ("function",), ("reus", "parameter", "return"), formats=("computer_science_concept",)),
        T("recursion", "recursion", "How does recursion work and why does it need a base case?", "A function keeps calling itself with a smaller problem. What prevents it from continuing forever?", ("recursion", "recursive"), ("base case", "call", "stop"), formats=("computer_science_concept",)),
        T("binary-search", "binary search", "How does binary search find an item in a sorted list?", "Why can repeatedly checking the middle and discarding half of an ordered list be efficient?", ("binary search",), ("sorted", "middle", "half"), formats=("computer_science_concept", "process_steps")),
        T("syntax-logic", "syntax and logic errors", "What is the difference between a syntax error and a logic error?", "Compare code the language cannot parse with code that runs but gives the wrong result.", ("syntax", "logic error"), ("parse", "run", "wrong"), formats=("comparison_table", "debugging")),
        T("primary-key", "database primary keys", "What is a primary key in a database?", "Why should every row in a table have a unique identifier that is never duplicated?", ("primary key", "database"), ("unique", "row", "identify"), formats=("computer_science_concept",)),
        T("network-packets", "network packets and IP addresses", "How do packets and IP addresses help data travel across a network?", "A message is split into pieces and routed to a numbered destination. Explain how it arrives.", ("packet", "ip address", "network"), ("packet", "address", "route"), visual="required", formats=("computer_science_concept",)),
    ),
    "general_knowledge": (
        T("solar-system", "solar system facts", "For a general-knowledge quiz, how many planets orbit the Sun and where is Earth?", "In our star's family there are eight major worlds; identify our world's position.", ("solar system", "planet"), ("eight", "third"), accepted=("general_knowledge", "science")),
        T("continents-oceans", "continents and oceans", "For general knowledge, how many continents and oceans are commonly recognized?", "Give the usual school-level counts for Earth's largest land divisions and bodies of water.", ("continent", "ocean"), ("seven", "five"), accepted=("general_knowledge", "geography")),
        T("united-nations", "United Nations", "What is the United Nations mainly intended to do?", "Which international organization was created after World War II to support peace and cooperation?", ("united nations",), ("peace", "cooper"), accepted=("general_knowledge", "history", "civics")),
        T("printing-press", "printing press", "Who is commonly associated with developing the movable-type printing press in Europe?", "Name the fifteenth-century European inventor linked with mass printing using movable metal type.", ("printing press", "gutenberg"), ("Gutenberg",), accepted=("general_knowledge", "history")),
        T("human-heart", "human heart fact", "For a general-knowledge quiz, what is the heart's main job?", "Which organ acts as a muscular pump that keeps blood moving around the body?", ("heart", "circulation"), ("pump", "blood"), accepted=("general_knowledge", "biology")),
        T("ozone-layer", "ozone layer", "What does the ozone layer protect life from?", "Which part of the atmosphere absorbs much of the Sun's harmful ultraviolet radiation?", ("ozone",), ("ultraviolet", "UV"), accepted=("general_knowledge", "science", "geography")),
        T("world-wide-web", "World Wide Web", "Who invented the World Wide Web?", "Name the computer scientist who proposed the web while working at CERN.", ("world wide web", "web"), ("Tim Berners-Lee", "Berners-Lee"), accepted=("general_knowledge", "computer_science")),
        T("japan-currency", "currency of Japan", "What is the currency of Japan?", "For a general-knowledge quiz, name the money unit used in Japan.", ("currency", "Japan", "yen"), ("yen",), accepted=("general_knowledge", "geography", "economics")),
        T("mount-everest", "Mount Everest", "What is Earth's highest mountain above sea level?", "Name the Himalayan peak recognized as the highest when measured from sea level.", ("everest", "highest mountain"), ("Everest",), accepted=("general_knowledge", "geography")),
        T("shakespeare-hamlet", "Hamlet authorship", "Who wrote Hamlet?", "Name the English playwright who created Prince Hamlet and the kingdom of Denmark in the famous tragedy.", ("hamlet", "shakespeare"), ("William Shakespeare", "Shakespeare"), accepted=("general_knowledge", "english")),
    ),
}


BASE_VARIANTS: tuple[tuple[str, bool], ...] = (
    ("{question}", False),
    ("{indirect}", True),
    ("Explain for a Grade 8 student: {question}", False),
    ("Give the short answer first, then explain: {question}", False),
    ("Use one everyday example to help me understand this: {indirect}", True),
    ("Help me revise this for a test: {question}", False),
    ("Break the reasoning into small steps: {indirect}", True),
    ("Explain this more simply without unnecessary jargon: {question}", False),
    ("What is the key idea behind this? {indirect}", True),
    ("Treat this as a challenging exam-style question. Show every essential reasoning step: {question}", False),
    ("Why does this make sense? {indirect}", True),
    ("Solve or analyze this as a multi-step application problem, checking each conclusion: {question}", False),
    ("Answer as if I am completely new to the topic: {indirect}", True),
    ("What common mistake should I avoid here? {question}", False),
    ("Give one useful example after the explanation: {question}", False),
    ("Just give me a concise but complete answer: {question}", False),
    ("Use a visual only if it meaningfully improves this explanation: {indirect}", True),
    ("Explain the real-life importance when relevant: {question}", False),
    ("__mcq__", False),
    ("Use the idea in this harder unfamiliar situation. Connect the evidence, method, and conclusion carefully: {indirect}", True),
)


PROBE_VARIANTS: tuple[str, ...] = (
    "Try a different wording and answer carefully: {indirect}",
    "Identify the exact school topic before answering: {indirect}",
    "Explain the cause, not just the definition: {question}",
    "Give the direct answer and then justify it: {question}",
    "A student is confused about this situation: {indirect}",
    "Check the facts and explain at Grade 9 level: {question}",
    "Use the full meaning of this situation: {indirect}",
    "Correct any likely misconception while answering: {question}",
    "Explain this using different words and one concrete detail: {indirect}",
    "Give an exam-ready answer without becoming too long: {question}",
)


def topic_specs() -> dict[str, tuple[TopicSpec, ...]]:
    result: dict[str, tuple[TopicSpec, ...]] = {}
    for subject, rows in TOPICS.items():
        result[subject] = tuple(
            TopicSpec(
                subject=subject,
                key=row[0],
                label=row[1],
                direct=row[2],
                indirect=row[3],
                topic_signals=row[4],
                answer_signals=row[5],
                accepted_subjects=row[6] or (subject,),
                visual=row[7],
                expected_formats=row[8],
            )
            for row in rows
        )
    return result


def validate_corpus() -> None:
    specs = topic_specs()
    assert len(BASE_VARIANTS) == 20
    assert len(PROBE_VARIANTS) == 10
    assert len(specs) == 13
    for subject, topics in specs.items():
        assert len(topics) == 10, (subject, len(topics))
        assert len(topics) * len(BASE_VARIANTS) == 200
        assert len({topic.key for topic in topics}) == len(topics)


validate_corpus()
