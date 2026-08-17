from __future__ import annotations

import re
from typing import Dict, Iterable, List, Tuple

from .schemas import DifficultyLevel, GradeBand, QuestionAnalysis, QuestionType, SubjectArea


class QuestionAnalyzer:
    """Classifies a student question before the tutor decides how to answer.

    This service is deterministic and fast. It does not replace the model; it
    gives the rest of the system stable metadata for routing, memory retrieval,
    search decisions, and teaching style.
    """

    SUBJECT_RULES: Dict[SubjectArea, Tuple[int, Tuple[str, ...]]] = {
        SubjectArea.mathematics: (4, (
            r"\b(math|maths|algebra|equation|fraction|decimal|percentage|ratio|proportion)\b",
            r"\b(geometry|area|perimeter|volume|surface area|circle|triangle|rectangle|rectangular)\b",
            r"\b(trigonometry|calculus|differentiate|integrate|derivative|integral|probability|statistics|mean|median|mode)\b",
            r"\b(lcm|hcf|square root|compound interest|pythagoras|log base|logarithm|determinant|matrix)\b",
            r"\b(solve|calculate|evaluate|simplify|factor|find)\b.*(?:\d|x|y|equation|area|ratio|speed|distance)",
            r"\d+\s*(?:\+|-|\*|/|=|\^|×|÷)\s*\d+",
            r"\b(together they have|twice as many|three times as many|older than|younger than|sum of|shared equally|work together|mixture|profit|loss)\b",
            r"\bdifference between\s+\d+(?:\.\d+)?\s+and\s+\d+(?:\.\d+)?\b",
            r"\b[a-z]\s*(?:\^2|²|2)\s*[+\-−]\s*\d*[a-z]\s*[+\-−]\s*\d+\s*=\s*0\b",
        )),
        SubjectArea.physics: (3, (
            r"\b(physics|force|motion|velocity|acceleration|gravity|newton|energy|power|work done|momentum|buoyancy)\b",
            r"\b(electricity|current electricity|magnet|magnetic|light|sound|pressure|density|friction|voltage|resistance|ohms?)\b",
            r"\b(sound waves?|light bends?|refraction|conduct heat|heat well|mass and weight|ohm'?s law)\b",
            r"\bdifference between\s+speed\s+and\s+velocity\b",
            r"\b(astronaut|astronauts|spacecraft|spaceship|orbit|orbiting|weightless|weightlessness|microgravity|centripetal)\b",
        )),
        SubjectArea.chemistry: (3, (
            r"\b(chemistry|atom|molecule|compound|acid|base|salt|reaction|periodic|bond|valency)\b",
            r"\b(electron|proton|neutron|ion|solution|mixture|element|chemical)\b",
            r"\b(reaction rate|rate of (?:a )?chemical reaction|activation energy|collision theory|catalyst|equilibrium|ph|mole|stoichiometry|electrolysis|oxidation|reduction)\b",
            r"\bbalance (?:the )?equation\b|\b(?:h2|o2|h2o|co2|nacl|hcl|naoh)\b.*(?:->|=|\+)",
        )),
        SubjectArea.biology: (3, (
            r"\b(biology|cell|photosynthesis|germination|respiration|digestion|blood|heart|organ)\b",
            r"\b(mitochondria|mitochondrion|powerhouse|atp|cellular respiration)\b",
            r"\b(plant|animal|ecosystem|ecosystems|chromosome|chromosomes|reproduction|tissue|root|stem|leaf|chlorophyll)\b",
        )),
        SubjectArea.english: (3, (
            r"\b(english|grammar|noun|verb|adjective|adverb|preposition|conjunction|article)\b",
            r"\b(tense|active voice|passive voice|direct speech|indirect speech|essay|letter|email|punctuation)\b",
            r"\b(poem|poetry|theme|summary|summarize|character sketch|plot|metaphor|simile|vocabulary|synonym|antonym|idiom|homophone|homophones)\b",
            r"\bdifference between\s+(?:affect|effect|their|there|they'?re|its|it's|adjective|adverb)\b",
        )),
        SubjectArea.history: (3, (
            r"\b(history|war|revolution|empire|civilization|independence|dynasty|ancient|medieval|colonialism|nationalism)\b",
            r"\b(treaty|king|queen|movement|freedom struggle|world war|french revolution|ashoka|harappan|industrial revolution|non-cooperation|mughal)\b",
        )),
        SubjectArea.geography: (3, (
            r"\b(geography|country|state|city|continent|ocean|sea|river|rivers|mountain|desert|lake|monsoon|settlements?)\b",
            r"\b(climate|climate change|water cycle|rainfall|latitude|longitude|map|capital|located|location|where is|landmark)\b",
            r"\b(earthquake|earthquakes|tectonic|plate|plates|plate boundary|plate boundaries|fault|fault line|volcano|volcanoes)\b",
            r"\b(magma|lava|continental drift|earth science|geology|rock cycle|erosion|weathering|tsunami|mountain formation|seismic|richter scale)\b",
        )),
        SubjectArea.civics: (3, (
            r"\b(civics|constitution|democracy|government|parliament|rights|duties|citizen|election|law)\b",
            r"\b(judiciary|executive|legislature|fundamental rights|directive principles)\b",
        )),
        SubjectArea.economics: (3, (
            r"\b(economics|demand|supply|market|inflation|gdp|income|consumer|producer|budget|tax)\b",
            r"\b(profit|loss|cost price|selling price|investment|interest|loan)\b",
        )),
        SubjectArea.computer_science: (2, (
            r"\b(computer science|algorithm|programming|python|java\b|javascript|html|css|database)\b",
            r"\b(code|debug|function|variable|loop|array|object|api|runtime error)\b",
        )),
        SubjectArea.general_knowledge: (1, (
            r"\b(general knowledge|famous|world|country|president|prime minister|who is)\b",
        )),
    }

    TYPE_RULES: Dict[QuestionType, Tuple[str, ...]] = {
        QuestionType.current_events: (
            r"\b(today|tonight|latest|current|currently|live|breaking|recent|this week|this month|now)\b",
            r"\b(who won|score|weather|stock price|share price|ranking|launched today|announced)\b",
        ),
        QuestionType.numerical: (r"\d", r"\b(calculate|find|how many|how much|evaluate)\b"),
        QuestionType.problem_solving: (r"\b(solve|work out|prove|derive|word problem|find)\b",),
        QuestionType.essay: (r"\b(essay|article|debate|letter|email|report|notice|diary)\b",),
        QuestionType.literature: (r"\b(poem|poetry|theme|character|plot|author|metaphor|simile|imagery|irony|extract)\b",),
        QuestionType.grammar: (r"\b(grammar|tense|noun|verb|adjective|adverb|preposition|article|punctuation|voice|speech)\b",),
        QuestionType.coding: (r"\b(code|debug|program|algorithm|loop|api|variable)\b",),
        QuestionType.conceptual: (r"\b(what is|define|meaning|principle|law|rule|concept)\b",),
        QuestionType.explanation: (r"\b(explain|why|how does|how do|teach|understand)\b",),
    }

    TOPIC_RULES: Tuple[Tuple[str, str, Tuple[str, ...]], ...] = (
        ("Algebra", "Equations and Relationships", (r"\b(algebra|equation|solve for|linear|quadratic|x\s*=|times as many|together they have)\b",)),
        ("Geometry", "Area, Perimeter, and Shapes", (r"\b(area|perimeter|rectangle|rectangular|triangle|circle|radius|diameter|volume|surface area)\b",)),
        ("Rates", "Speed, Distance, Time, and Work", (r"\b(speed|distance|time|train|car|km/h|m/s|work together|rate)\b",)),
        ("Ratio and Proportion", "Ratios, Sharing, and Percentages", (r"\b(ratio|proportion|shared equally|divide among|percent|percentage)\b",)),
        ("Photosynthesis", "Plant Nutrition", (r"\bphotosynthesis\b",)),
        ("Germination", "Plant Growth", (r"\bgermination\b",)),
        ("Grammar", "Sentence Rules", (r"\b(grammar|tense|article|preposition|voice|speech|punctuation)\b",)),
        ("Literature", "Text Analysis", (r"\b(theme|summary|character|plot|poem|author|extract|literary device)\b",)),
        ("Location", "Map Skills and Place Hierarchy", (r"\b(where is|located|location|capital|continent|map|state|city)\b",)),
        ("History", "Context, Sequence, Cause and Effect", (r"\b(war|revolution|independence|civilization|empire|movement)\b",)),
        ("Civics", "Government and Citizenship", (r"\b(constitution|democracy|government|rights|duties|parliament|election)\b",)),
        ("Economics", "Markets and Money", (r"\b(demand|supply|market|inflation|gdp|profit|loss|interest|budget)\b",)),
    )

    FRESHNESS_PATTERNS = (
        r"\b(today|tonight|latest|current|currently|live|breaking|recent|this week|this month|now)\b",
        r"\b(weather|stock price|share price|who won|score|ranking|released|launched|announced)\b",
    )

    WORD_PROBLEM_SIGNALS = (
        r"\b(together they have|twice as many|three times as many|times as many|older than|younger than)\b",
        r"\b(sum of|shared equally|ratio|mixture|profit|loss|speed|distance|work together)\b",
        r"\bdifference between\s+\d+(?:\.\d+)?\s+and\s+\d+(?:\.\d+)?\b",
        r"\b(area|perimeter|length|width|rectangular|garden|train|car|boat|pipe|tank)\b",
    )

    ENGLISH_OVERRIDE_PATTERNS = (
        r"\bdifference between\s+(?:affect|effect|their|there|they'?re|its|it's|noun|verb|adjective|adverb)\b",
        r"\b(use a or an|correct preposition|fill (?:the )?correct preposition|identify the noun|identify the tense|passive voice|direct speech|indirect speech|punctuation)\b",
        r"\b(homophone|homophones|synonym|antonym|vocabulary|grammar|metaphor|simile|poetry|literature|idiom|character sketch|summarize)\b",
    )

    PRIORITY_OVERRIDES: Tuple[Tuple[SubjectArea, int, Tuple[str, ...]], ...] = (
        (SubjectArea.physics, 12, (
            r"\b(force|newton|friction|conservation of energy|power|work done|sound waves?|light bends?|refraction)\b",
            r"\b(ohm'?s law|voltage|resistance|ohms?|find current|calculate current|current when voltage|pressure|buoyancy|momentum)\b",
            r"\b(conduct heat|metals conduct|mass and weight|speed and velocity|centripetal|density)\b",
            r"\b(astronaut|astronauts|spacecraft|spaceship|orbit|orbiting|weightless|microgravity|nasa mission)\b",
        )),
        (SubjectArea.chemistry, 12, (
            r"\b(catalyst|chemical reaction|reaction rate|activation energy|collision theory|electrolysis|oxidation|reduction|pH scale|mole in chemistry|acid and base)\b",
            r"\bbalance (?:the )?equation\b|\b(?:h2|o2|h2o|co2|nacl|hcl|naoh)\b.*(?:->|=|\+)",
        )),
        (SubjectArea.biology, 11, (
            r"\b(photosynthesis|germination|cellular respiration|mitochondria|mitochondrion|powerhouse|atp|digestion|heart|plant and animal cells|ecosystem|ecosystems|chromosome|chromosomes)\b",
        )),
        (SubjectArea.english, 11, ENGLISH_OVERRIDE_PATTERNS),
        (SubjectArea.history, 10, (
            r"\b(ashoka|nationalism|colonialism|harappan|industrial revolution|non-cooperation|mughal|world war|french revolution)\b",
        )),
        (SubjectArea.geography, 10, (
            r"\b(monsoon|water cycle|rivers?|settlements?|climate change|latitude|longitude)\b",
            r"\b(earthquake|earthquakes|tectonic|plate boundaries?|volcanoes?|erosion|weathering|seismic)\b",
            r"\b(where is|located|capital of)\b",
        )),
        (SubjectArea.mathematics, 8, (
            r"\b(differentiate|integrate|derivative|integral|calculus|log base|logarithm|determinant|matrix|lcm|hcf|square root|compound interest|pythagoras)\b",
            r"\b(train|car|boat)\b.*\btravels?\b.*\bfind\b.*\bspeed\b",
        )),
    )

    GENERAL_CURRENT_PATTERNS = (
        r"\b(latest|current|today|live|recent)\b.*\b(election result|election results|government result|poll result)\b",
    )

    def analyze(self, message: str, subject_hint: SubjectArea | None = None) -> QuestionAnalysis:
        text = self._clean(message)
        subject, subject_score, subject_signals = self._subject(text, subject_hint)
        topic, sub_topic = self._topic(text, subject)
        question_type = self._question_type(text, subject)
        grade_level = self._grade_level(text)
        difficulty = self._difficulty(text, question_type, grade_level)
        keywords = self._keywords(text)
        freshness = self._matches_any(text, self.FRESHNESS_PATTERNS)
        if subject == SubjectArea.physics and re.search(r"\b(current electricity|electric current|current when|find current|calculate current|voltage|resistance|ohms?|ohm'?s law)\b", text, re.I):
            freshness = False

        confidence = 0.36 + min(0.42, subject_score * 0.08)
        if topic != "General Study":
            confidence += 0.1
        if keywords:
            confidence += min(0.08, len(keywords) * 0.01)
        if freshness:
            confidence -= 0.16
        confidence = max(0.25, min(0.99, confidence))

        return QuestionAnalysis(
            subject=subject,
            topic=topic,
            sub_topic=sub_topic,
            grade_level=grade_level,
            difficulty=difficulty,
            question_type=question_type,
            confidence=round(confidence, 3),
            keywords=keywords,
            requires_freshness_check=freshness,
            reasoning_signals=subject_signals[:8],
        )

    def _subject(self, text: str, hint: SubjectArea | None) -> tuple[SubjectArea, int, List[str]]:
        scores: Dict[SubjectArea, int] = {}
        signals: Dict[SubjectArea, List[str]] = {}
        for subject, (weight, patterns) in self.SUBJECT_RULES.items():
            hits = [pattern for pattern in patterns if re.search(pattern, text, re.I)]
            scores[subject] = len(hits) * weight
            signals[subject] = hits

        if hint:
            scores[hint] = scores.get(hint, 0) + 4

        if self._matches_any(text, self.GENERAL_CURRENT_PATTERNS):
            return SubjectArea.general, 8, ["current public information"]

        for subject, boost, patterns in self.PRIORITY_OVERRIDES:
            if self._matches_any(text, patterns):
                scores[subject] = scores.get(subject, 0) + boost

        # Word problems must win before loose keywords like "square".
        if self._matches_any(text, self.WORD_PROBLEM_SIGNALS):
            scores[SubjectArea.mathematics] = scores.get(SubjectArea.mathematics, 0) + 6

        subject, score = max(scores.items(), key=lambda item: item[1])
        if score <= 0:
            return SubjectArea.general, 0, []
        return subject, score, signals.get(subject, [])

    def _topic(self, text: str, subject: SubjectArea) -> tuple[str, str]:
        if subject == SubjectArea.general and self._matches_any(text, self.GENERAL_CURRENT_PATTERNS):
            return "General", "Current Information"
        if subject == SubjectArea.physics:
            return "Physics", self._physics_subtopic(text)
        if subject == SubjectArea.mathematics and re.search(r"\bquadratic\b|[a-z]\s*(?:\^2|²|2)\s*[+\-−]\s*\d*[a-z]\s*[+\-−]\s*\d+\s*=\s*0", text, re.I):
            return "Quadratic Equations", "Factoring and Roots"
        if subject == SubjectArea.mathematics and re.search(r"\b(differentiate|integrate|derivative|integral|calculus|log base|logarithm|determinant|matrix|lcm|hcf|square root|compound interest|pythagoras)\b", text, re.I):
            return "Mathematics", "Advanced and Core Operations"
        if subject == SubjectArea.chemistry:
            if re.search(r"\bbalance (?:the )?equation\b|\b(?:h2|o2|h2o|co2|nacl|hcl|naoh)\b.*(?:->|=|\+)", text, re.I):
                return "Chemistry", "Chemical Equations"
            if re.search(r"\b(reaction rate|rate of (?:a )?chemical reaction|activation energy|collision theory|catalyst|temperature.*reaction|reaction.*temperature)\b", text, re.I):
                return "Reaction Rates", "Collision Theory and Activation Energy"
            if re.search(r"\b(acid|base|ph)\b", text, re.I):
                return "Acids and Bases", "pH and Neutralisation"
            if re.search(r"\b(mole|stoichiometry)\b", text, re.I):
                return "Stoichiometry", "Moles and Balanced Equations"
            if re.search(r"\b(electrolysis|oxidation|reduction)\b", text, re.I):
                return "Redox and Electrochemistry", "Electron Transfer"
            return "Chemistry", "Core Concept"
        if subject == SubjectArea.biology:
            if re.search(r"\b(mitochondria|mitochondrion|powerhouse|atp|cellular respiration)\b", text, re.I):
                return "Cell Biology", "Mitochondria and ATP"
            if re.search(r"\bphotosynthesis\b", text, re.I):
                return "Photosynthesis", "Plant Nutrition"
            if re.search(r"\bgermination\b", text, re.I):
                return "Germination", "Plant Growth"
            return "Biology", "Core Concept"
        if subject == SubjectArea.geography:
            if re.search(r"\b(earthquake|earthquakes|tectonic|plate|plates|plate boundary|plate boundaries|fault|fault line|seismic|richter scale|continental drift|volcano|volcanoes|magma|lava|tsunami|mountain formation)\b", text, re.I):
                return "Earth Science", "Plate Tectonics"
            if re.search(r"\b(erosion|weathering|rock cycle|geology)\b", text, re.I):
                return "Earth Science", "Rocks, Weathering, and Erosion"
            if re.search(r"\b(where is|located|location|capital of|latitude|longitude)\b", text, re.I):
                return "Location", "Map Skills and Place Hierarchy"
            return "Geography", "Physical and Human Geography"
        if subject == SubjectArea.english:
            if re.search(r"\b(noun|verb|adjective|adverb|tense|article|use a or an|preposition|passive voice|active voice|direct speech|indirect speech|punctuation)\b", text, re.I):
                return "Grammar", "Sentence Rules"
            if re.search(r"\b(metaphor|simile|theme|character sketch|plot|poem|poetry|literature|summarize|summary|short story|story)\b", text, re.I):
                return "Literature", "Text Analysis"
            if re.search(r"\b(affect|effect|their|there|they'?re|its|it's|synonym|antonym|homophone|homophones|idiom|vocabulary|word choice)\b", text, re.I):
                return "Vocabulary", "Commonly Confused Words"
        if subject == SubjectArea.history:
            return "History", "Context, Sequence, Cause and Effect"

        for topic, sub_topic, patterns in self.TOPIC_RULES:
            if self._matches_any(text, patterns):
                if subject == SubjectArea.mathematics and topic == "Geometry" and re.search(r"\barea\b.*\b(length|width|rectangular|garden)\b|\b(length|width|rectangular|garden)\b.*\barea\b", text):
                    return "Geometry Word Problem", "Quadratic Equation from Area"
                return topic, sub_topic
        if subject == SubjectArea.general:
            return "General Study", "Concept Explanation"
        return subject.value.replace("_", " ").title(), "Core Concept"

    def _question_type(self, text: str, subject: SubjectArea) -> QuestionType:
        if subject == SubjectArea.physics and re.search(r"\b(current when voltage|find current|calculate current|voltage|resistance|ohms?)\b", text, re.I):
            return QuestionType.numerical if re.search(r"\d", text) else QuestionType.conceptual
        if self._matches_any(text, self.FRESHNESS_PATTERNS):
            return QuestionType.current_events
        if subject == SubjectArea.mathematics and (re.search(r"\d+\s*(?:\+|-|\*|/|=|\^|x)\s*\d+", text, re.I) or re.search(r"\b(calculate|find|evaluate|solve)\b.*\d", text, re.I)):
            return QuestionType.numerical
        if subject == SubjectArea.english and re.search(r"\b(noun|tense|preposition|article|use a or an|punctuation|passive voice|active voice|direct speech|indirect speech|adjective|adverb)\b", text, re.I):
            return QuestionType.grammar
        if subject == SubjectArea.english and re.search(r"\b(metaphor|simile|theme|character sketch|plot|poem|poetry|literature)\b", text, re.I):
            return QuestionType.literature
        if re.search(r"\bdifference between\b", text, re.I) and subject != SubjectArea.mathematics:
            return QuestionType.conceptual
        if re.search(r"^\s*(what is|what are|what was|what were|who is|who was|define)\b", text, re.I):
            if subject == SubjectArea.english and re.search(r"\b(metaphor|simile|poem|poetry|literature)\b", text, re.I):
                return QuestionType.literature
            return QuestionType.conceptual
        if re.search(r"^\s*(explain|why|how does|how do)\b|\bwhat happens during\b", text, re.I):
            if subject == SubjectArea.english and re.search(r"\b(theme|metaphor|simile|poem|poetry|character|plot|story|literature)\b", text, re.I):
                return QuestionType.literature
            return QuestionType.explanation
        if subject == SubjectArea.english:
            if re.search(r"\b(noun|tense|preposition|article|use a or an|punctuation|passive voice|active voice|direct speech|indirect speech|adjective|adverb)\b", text, re.I):
                return QuestionType.grammar
            if re.search(r"\b(metaphor|simile|theme|character sketch|plot|poem|poetry|literature)\b", text, re.I):
                return QuestionType.literature
        if subject == SubjectArea.mathematics and self._matches_any(text, self.WORD_PROBLEM_SIGNALS):
            if re.search(r"\b(area of|triangle with base|height|radius|diameter)\b", text, re.I):
                return QuestionType.numerical
            return QuestionType.problem_solving
        for question_type, patterns in self.TYPE_RULES.items():
            if self._matches_any(text, patterns):
                return question_type
        return QuestionType.conceptual if "?" in text else QuestionType.explanation

    def _physics_subtopic(self, text: str) -> str:
        if re.search(r"\b(ohm'?s law|current|voltage|resistance|ohms?|electricity)\b", text, re.I):
            return "Electricity and Circuits"
        if re.search(r"\b(force|motion|velocity|acceleration|friction|momentum|centripetal|newton)\b", text, re.I):
            return "Force, Motion, and Mechanics"
        if re.search(r"\b(pressure|buoyancy|density)\b", text, re.I):
            return "Pressure, Fluids, and Density"
        if re.search(r"\b(light|sound|waves?|refraction)\b", text, re.I):
            return "Light, Sound, and Waves"
        if re.search(r"\b(heat|conduct)\b", text, re.I):
            return "Heat Transfer"
        if re.search(r"\b(gravity|weightless|orbit|spacecraft|mass and weight|astronaut|nasa)\b", text, re.I):
            return "Gravity, Orbit, and Weight"
        return "Core Concept"

    def _grade_level(self, text: str) -> GradeBand:
        match = re.search(r"\b(?:grade|class)\s*(\d{1,2})\b", text)
        if match:
            grade = int(match.group(1))
            if grade <= 5:
                return GradeBand.grade_1_5
            if grade <= 8:
                return GradeBand.grade_6_8
            if grade <= 12:
                return GradeBand.grade_9_12
            return GradeBand.college
        if re.search(r"\b(derivative|integral|eigenvalue|laplace|university|college|abstract algebra|topology)\b", text):
            return GradeBand.college
        if re.search(r"\b(board exam|quadratic|trigonometry|organic chemistry|world war|constitution)\b", text):
            return GradeBand.grade_9_12
        return GradeBand.grade_6_8

    def _difficulty(self, text: str, question_type: QuestionType, grade_level: GradeBand) -> DifficultyLevel:
        if grade_level == GradeBand.grade_1_5 or re.search(r"\b(simple|easy|basic|beginner|explain like)\b", text):
            return DifficultyLevel.beginner
        if grade_level == GradeBand.college or re.search(r"\b(advanced|hard|prove|derive|deep|university)\b", text):
            return DifficultyLevel.advanced
        if re.search(r"\b(exam|board|marks|test)\b", text):
            return DifficultyLevel.exam
        if question_type in {QuestionType.numerical, QuestionType.problem_solving}:
            return DifficultyLevel.school
        return DifficultyLevel.balanced

    def _keywords(self, text: str) -> List[str]:
        stop = {"the", "and", "for", "with", "that", "this", "what", "where", "when", "why", "how", "please", "does", "from", "into", "your"}
        words = re.findall(r"[a-z0-9]+", text.lower())
        unique: List[str] = []
        for word in words:
            if len(word) < 3 or word in stop or word in unique:
                continue
            unique.append(word)
        return unique[:14]

    def _matches_any(self, text: str, patterns: Iterable[str]) -> bool:
        return any(re.search(pattern, text, re.I) for pattern in patterns)

    def _clean(self, message: str) -> str:
        return re.sub(r"\s+", " ", (message or "").replace("\x00", "")).strip().lower()
