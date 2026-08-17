(function () {
  if (window.TutorlyResponseEngine) return;

  const MEMORY_KEY = "tutorly_response_engine_memory_v1";
  const MAX_RECENT_PHRASES = 80;
  const MAX_MESSAGES = 18;

  const TONE_MODES = {
    default: { depth: 2, warmth: 2, brevity: 2, emoji: 1 },
    smart: { depth: 3, warmth: 1, brevity: 2, emoji: 0 },
    friendly: { depth: 2, warmth: 3, brevity: 2, emoji: 1 },
    teacher: { depth: 3, warmth: 2, brevity: 2, emoji: 1 },
    fast: { depth: 1, warmth: 1, brevity: 4, emoji: 0 },
    deep: { depth: 4, warmth: 2, brevity: 1, emoji: 0 },
    motivational: { depth: 2, warmth: 4, brevity: 2, emoji: 1 },
    creative: { depth: 3, warmth: 3, brevity: 1, emoji: 1 }
  };

  const PHRASES = {
    openings: [
      "Alright, let's make this clean.",
      "Here is the neat way to look at it.",
      "This becomes easier once the pieces are separated.",
      "Let's solve this in a clear way.",
      "Here is the simplest path through it.",
      "Good question. Let's unpack it carefully.",
      "Let's turn this into something easy to follow.",
      "Here is the student-friendly version.",
      "Let's make the answer feel less confusing.",
      "We can handle this step by step.",
      "Here is the cleanest explanation.",
      "Let's slow it down and make it simple.",
      "This is more manageable than it first looks.",
      "Let's build the idea from the ground up.",
      "Here is a clear study-note version.",
      "Let's connect the facts properly.",
      "A good way to understand this is to start small.",
      "Here is the quick mental map.",
      "Let's break it into useful parts.",
      "This has a simple core idea.",
      "Let's keep it sharp and readable.",
      "Here is the practical way to remember it.",
      "Let's remove the extra noise first.",
      "This is easiest if we focus on the main pattern.",
      "Let's make the logic visible.",
      "Here is the polished explanation.",
      "Let's work through it without overcomplicating it.",
      "The trick is to notice the structure.",
      "Let's put the answer in a cleaner form.",
      "Here is a more confident way to approach it.",
      "Let's make this feel like a proper study note.",
      "The fastest way in is through the key idea.",
      "Let's separate what matters from what does not.",
      "This is a good one to understand properly.",
      "Let's translate the question into simpler words.",
      "Here is the calm version.",
      "Let's make it click.",
      "Here is the answer with the important parts highlighted.",
      "Let's treat it like a classroom note.",
      "The main idea is not too hard once you see the pattern.",
      "Let's build a clean answer from the question.",
      "Here is a clear, exam-friendly explanation.",
      "Let's keep this beginner-friendly.",
      "Here is a smart shortcut to understand it.",
      "Let's make the concept easier to revise.",
      "This is one of those topics where examples help a lot.",
      "Let's explain it like you are seeing it for the first time.",
      "Here is the useful version, not the confusing textbook version.",
      "Let's make it direct and readable.",
      "We can solve this with a simple plan."
    ],
    fastOpenings: [
      "Short answer:",
      "Quick version:",
      "Fast answer:",
      "In simple words:",
      "The main point:",
      "Here is the shortcut:",
      "Clean answer:",
      "Direct answer:",
      "Quick solve:",
      "Compact version:",
      "The key result:",
      "Straight to it:",
      "Fast breakdown:",
      "Tiny summary:",
      "One-line idea:"
    ],
    deepOpenings: [
      "Let's go deeper and build the full picture.",
      "Here is the detailed version with the why included.",
      "Let's understand both the surface answer and the deeper logic.",
      "This deserves a proper explanation, so let's structure it clearly.",
      "Let's treat this like a polished lesson note.",
      "Here is the complete view, from basics to the important details.",
      "Let's work from foundation to application.",
      "A deeper answer needs three parts: meaning, method, and example.",
      "Let's make this strong enough for revision and exams.",
      "Here is the expanded explanation."
    ],
    casual: [
      "Hey, I am here. What are we learning today?",
      "Hi. Send me the doubt and we will sort it out.",
      "Yo, ready when you are.",
      "Hello. Ask me anything from your work.",
      "I am good. What do you want help with?",
      "No worries, we can go slow.",
      "All good. Drop the question.",
      "Nice. Send the next one.",
      "Haha, fair enough. What topic are we attacking?",
      "Cool, I am listening.",
      "Got it. What should we do next?",
      "Anytime. Keep going.",
      "You are doing fine. Send the next doubt.",
      "Bye. Come back when you need a clean explanation.",
      "Goodnight. Study light, not stressed."
    ],
    greetings: [
      "Hey. What are we learning today?",
      "Hi. Send me your doubt whenever you are ready.",
      "Hello. I am here.",
      "Yo. What do you want help with?",
      "Hey there. Ask me anything.",
      "Hi, ready when you are.",
      "Hello. We can start with any subject.",
      "Hey. Drop the question and I will help.",
      "Hi. What topic are we opening first?",
      "Yo, what are we solving today?"
    ],
    whatsUp: [
      "Not much, I am here to help you study. What is the doubt?",
      "I am ready to help. What are we working on?",
      "Just waiting for your question. What do you want to learn?",
      "All good here. Send me the topic.",
      "Ready for study mode. What is up with your homework?",
      "I am here. Tell me what you need help with.",
      "Nothing much. What subject are we doing?",
      "I am good. What are we solving?",
      "Ready to explain. Send the doubt.",
      "Here and listening. What do you want help with?"
    ],
    apologies: [
      "No worries. We can go slowly.",
      "All good. Ask it however you can.",
      "No problem. We will keep it simple.",
      "It is okay. Send the question again if needed.",
      "Do not stress. We can fix it step by step.",
      "No worries at all.",
      "You are fine. Let us continue.",
      "That is okay. What part should we look at?",
      "No issue. I am still here.",
      "All good, bro. Send the doubt."
    ],
    farewells: [
      "Bye. Come back whenever you need help.",
      "Goodnight. Study light, not stressed.",
      "See you. Keep going.",
      "Bye, take care.",
      "Goodbye. I will be here when you return.",
      "See you later. Nice work today.",
      "Goodnight. Rest well.",
      "Bye. Bring the next doubt anytime.",
      "Later. Keep the momentum.",
      "See you. You got this."
    ],
    jokes: [
      "Haha, fair. Send the actual doubt and I will clean it up.",
      "Lol, okay. What are we solving though?",
      "Fair reaction. Now give me the question.",
      "I get you. Drop the topic.",
      "That sounded personal against the homework.",
      "Mood. Let us make the question behave.",
      "Alright, jokes aside, what is the doubt?",
      "Haha. Send the next thing.",
      "Valid. Now let us solve it.",
      "I hear you. What part is confusing?"
    ],
    thanks: [
      "Anytime. Keep going, you are building momentum.",
      "Glad it helped.",
      "You got it. Send the next doubt whenever you want.",
      "No problem. That is what I am here for.",
      "Happy to help. Small steps count.",
      "Nice work sticking with it.",
      "Of course. Want to try one more?",
      "Good stuff. Keep the flow going.",
      "Always. We can keep it simple.",
      "You are welcome."
    ],
    encouragement: [
      "You are closer than you think.",
      "Do not worry if it feels confusing at first.",
      "The goal is progress, not instant perfection.",
      "This is exactly the kind of question that gets easier with one good example.",
      "You can learn this by focusing on the pattern.",
      "Slow is fine if the idea becomes clear.",
      "Getting stuck here is normal.",
      "This is a good place to pause and connect the idea.",
      "Once this part clicks, the rest becomes much easier.",
      "You are asking the right kind of question.",
      "A small clear step beats a rushed answer.",
      "This is fixable.",
      "The confusion is useful; it shows where the concept needs light.",
      "Let the method do the work.",
      "You do not need perfect English to ask a good doubt.",
      "The answer is hidden in the structure of the question.",
      "This is a learnable pattern.",
      "Try not to memorize blindly; understand the move.",
      "You are building the skill right now.",
      "Keep the question simple and the method will stay simple."
    ],
    transitions: [
      "Now connect that to the question.",
      "The important part is this.",
      "Here is where students often get stuck.",
      "Notice the pattern.",
      "That means the next step is straightforward.",
      "From here, the idea becomes clearer.",
      "This is the part worth remembering.",
      "The shortcut is not magic; it comes from the rule.",
      "Once you know that, the result makes sense.",
      "Now compare the two sides.",
      "This tells us what to do next.",
      "The useful detail is the relationship between the parts.",
      "So the answer is not random.",
      "This is why the method works.",
      "Now we can apply it.",
      "The clean move is to simplify first.",
      "Keep this in mind while solving.",
      "That is the turning point.",
      "This removes the confusion.",
      "Now the answer becomes easier to state.",
      "The practical takeaway is simple.",
      "This gives us the direction.",
      "The rest is just careful calculation.",
      "That is the core reason.",
      "This is the exam-friendly way to say it.",
      "Now put it into words.",
      "This is where the concept meets the example.",
      "Once the cause is clear, the effect is easier.",
      "This is the clean bridge between the steps.",
      "Now we can finish confidently."
    ],
    conclusions: [
      "Final answer: keep the key rule in mind and the problem becomes simple.",
      "Final answer: the main idea is the connection between the cause and the result.",
      "Final answer: this is best understood by following the steps in order.",
      "Final answer: the pattern matters more than memorizing the sentence.",
      "Final answer: once the basic rule is clear, the rest follows naturally.",
      "Final answer: use the simple method first, then add details if needed.",
      "Final answer: focus on the important relationship and the answer becomes clear.",
      "Final answer: this topic is easier when you connect definition, example, and result.",
      "Final answer: the clean explanation is usually the strongest one.",
      "Final answer: understand the why, then the answer is easier to remember.",
      "Final answer: do the small steps carefully and the final result stays reliable.",
      "Final answer: this is a concept question, so meaning matters more than memorizing wording.",
      "Final answer: the safest approach is to identify the rule, apply it, and check the result.",
      "Final answer: the question becomes manageable when it is split into parts.",
      "Final answer: the main takeaway is simple, but the details explain why."
    ],
    followUps: [
      "Want me to turn this into a 3-line exam answer?",
      "Want a shorter version for quick revision?",
      "Want one practice question on this?",
      "Want me to explain it with a real-life example?",
      "Want the same idea in even simpler words?",
      "Want me to make a memory trick for this?",
      "Want a diagram-style explanation in words?",
      "Want me to quiz you on it?",
      "Want the advanced version too?",
      "Want me to compare it with a similar topic?",
      "Want me to show the common mistake students make here?",
      "Want this as flashcards?",
      "Want me to solve another example?",
      "Want me to check your answer if you try it?"
    ],
    clarifiers: [
      "I can help, but I need one more detail.",
      "Send the exact question and I will solve it cleanly.",
      "Tell me the subject or chapter so I can aim the explanation properly.",
      "Can you share the full sentence or problem?",
      "I get the direction, but the question is missing a key part.",
      "Send a photo or type the full problem.",
      "Do you want a short answer or a detailed explanation?",
      "Should I explain the concept, solve the problem, or make notes?",
      "What class or level is this for?",
      "Can you tell me what part confused you?"
    ],
    mistakes: [
      "A common mistake is memorizing the final line without understanding the reason.",
      "Do not skip the definition; it anchors the answer.",
      "Watch the units, signs, and keywords in the question.",
      "Students often rush the last step and lose marks there.",
      "The wording matters because one small word can change the meaning.",
      "Do not mix the cause with the effect.",
      "Avoid writing a giant paragraph when two clean points are enough.",
      "Check whether the question asks for meaning, reason, effect, or example.",
      "Do not assume the answer before reading the full question.",
      "If the result feels strange, check the setup first."
    ],
    memoryTricks: [
      "Memory trick: definition first, example second, final line last.",
      "Remember it as cause -> change -> result.",
      "Use the three-question test: what is it, why happens, what happens next?",
      "Keep the keyword in your answer; it helps the examiner see the point.",
      "If you forget the full answer, rebuild it from the main idea.",
      "Turn the topic into a small story; stories are easier to remember.",
      "Connect the word to one real example.",
      "Write the answer once in your own words before memorizing.",
      "Use one short phrase as your anchor.",
      "Revise the pattern, not just the paragraph."
    ],
    fallbacks: [
      "I could not identify the exact topic yet, but I can still help if you add one more detail.",
      "This looks incomplete. Send the full question and I will make it clear.",
      "I may be missing context here. Try adding the subject or chapter name.",
      "I can answer better if you include the exact problem statement.",
      "This seems like a mixed question. Tell me whether you want math, science, English, history, or geography help.",
      "I need a little more information to avoid guessing.",
      "Send the question in your own words; perfect English is not needed.",
      "I understand part of it, but not enough to give a reliable answer.",
      "Try sending a photo if typing the question is hard.",
      "Give me one keyword from the chapter and I will lock onto the topic."
    ],
    onboarding: [
      "You can ask in rough words; I will clean up the meaning.",
      "You can send a textbook line, a photo, or a half-written doubt.",
      "If you are unsure where to start, send the chapter name.",
      "Ask for short, detailed, simple, or exam-style answers.",
      "You can ask me to turn any answer into notes.",
      "You can ask for examples after any explanation.",
      "You can ask me to quiz you after a topic.",
      "You can ask in slang or mixed English.",
      "If typing is hard, upload the image and edit the extracted text.",
      "The more exact the question, the sharper the answer."
    ],
    recovery: [
      "Let me recover this from the part I can understand.",
      "I will avoid guessing and ask for the missing piece.",
      "The safe move is to clarify before solving.",
      "I can give a general explanation first, then refine it.",
      "If the wording is messy, I will focus on the keywords.",
      "When the question is incomplete, I will tell you exactly what is missing.",
      "I will keep the answer useful even if the input is rough.",
      "I can switch to a simpler explanation if this feels heavy.",
      "If the topic is mixed, I will separate the subjects.",
      "I will flag uncertainty instead of pretending."
    ],
    confidenceNotes: [
      "I am confident about the method; check the final value if your textbook uses a different format.",
      "This is a high-confidence explanation for the concept.",
      "The answer is reliable for a school-level explanation.",
      "I am moderately confident, but a fuller question would make it sharper.",
      "This is the safest answer based on the words provided.",
      "The reasoning is strong, but exact marks-style wording may depend on your syllabus.",
      "This should work well for revision.",
      "This is a clean conceptual answer, not a memorized textbook paragraph.",
      "This is enough for understanding; ask for exam format if needed.",
      "This explanation is built from the visible clues in your question."
    ],
    alternateModes: [
      "I can explain the same idea with an analogy.",
      "I can turn this into a formula-first explanation.",
      "I can make this answer shorter for revision.",
      "I can make it more detailed for exam preparation.",
      "I can show it as a cause-and-effect chain.",
      "I can convert it into bullet notes.",
      "I can explain it like a story.",
      "I can give a beginner version and then an advanced version.",
      "I can add a memory trick.",
      "I can compare it with a similar topic.",
      "I can make a practice question from this.",
      "I can check your answer if you try one.",
      "I can create flashcards from this answer.",
      "I can give common mistakes for this topic.",
      "I can make the answer sound more natural."
    ],
    thinkingPhrases: [
      "First I identify what kind of question this is.",
      "Then I separate the known part from the confusing part.",
      "Next I choose the simplest rule that fits.",
      "After that, I check whether the answer actually matches the question.",
      "Finally I turn the result into clean student-friendly wording.",
      "The useful move is to reduce the problem before solving.",
      "I am looking for keywords that reveal the subject.",
      "I am checking whether this needs a definition, a calculation, or an explanation.",
      "I am keeping the reasoning compact so it stays readable.",
      "I am choosing the explanation depth based on your wording."
    ],
    uiuxTips: [
      "Put the most important action where the thumb naturally reaches.",
      "Reduce visual weight before adding decoration.",
      "Spacing is part of the design, not empty space.",
      "One clear primary action beats five equal-looking actions.",
      "The interface should show state without needing explanation text.",
      "Animation should confirm an action, not distract from it.",
      "Mobile layout needs fewer competing elements.",
      "Use contrast to show hierarchy.",
      "Hide controls until they are useful.",
      "Make repeated actions feel effortless."
    ],
    businessTips: [
      "Start with the user pain, not the feature list.",
      "A product idea gets stronger when the target user is specific.",
      "The first version should prove demand, not include everything.",
      "Pricing only works when the value is obvious.",
      "A simple promise is easier to remember than a long pitch.",
      "Trust signals matter when students or parents are involved.",
      "Retention is usually more important than first-day excitement.",
      "Measure what users actually do, not only what they say.",
      "Make the first useful moment happen quickly.",
      "A smaller focused product can feel more premium than a crowded one."
    ],
    reactions: [
      "That is a solid question.",
      "I see what you are trying to ask.",
      "Good, this is a useful doubt to clear.",
      "Nice, this is the kind of thing that becomes easy after one clean explanation.",
      "I get the confusion.",
      "That wording is rough, but the idea is clear enough to work with.",
      "This is worth understanding, not just memorizing.",
      "Good catch; this detail matters.",
      "You are thinking in the right direction.",
      "Let us make it more readable.",
      "This is a common student doubt.",
      "That is a practical question.",
      "I can work with that.",
      "This can be made much simpler.",
      "The idea is hiding under the wording."
    ],
    emotionalSupport: [
      "Take a breath; the topic is not judging you.",
      "Being confused does not mean you are bad at the subject.",
      "We can make the answer smaller until it becomes manageable.",
      "You do not have to understand everything at once.",
      "Let us solve the next tiny part, not the whole mountain.",
      "If the textbook made it sound heavy, we can translate it.",
      "A messy question is still a valid question.",
      "You are allowed to ask it simply.",
      "This is exactly where a tutor should slow down.",
      "Once the first step is clear, your brain has something to hold.",
      "The goal is clarity, not pressure.",
      "You are not behind; you are just at the confusing part.",
      "This can be untangled.",
      "Let the explanation do the heavy lifting.",
      "We will make it less scary."
    ],
    humorLight: [
      "No drama, just one clean idea at a time.",
      "The textbook made it wear a suit; we will put it in normal clothes.",
      "This topic looks bigger than it actually is.",
      "The trick is to not let the question act smarter than us.",
      "We will not let one confusing line ruin the whole chapter.",
      "This is not a monster, just a sentence with too much confidence.",
      "Let us remove the fog and keep the useful part.",
      "The answer is doing hide-and-seek, but not very well.",
      "We can make this behave.",
      "This is a small puzzle wearing a big jacket."
    ],
    miniSummaryIntros: [
      "In one clean line:",
      "The tiny summary:",
      "Keep this version in your head:",
      "Revision version:",
      "If you remember only one thing:",
      "The pocket note:",
      "The compressed idea:",
      "Exam memory line:",
      "The core takeaway:",
      "The simple version:"
    ],
    proTips: [
      "Use keywords from the question in your answer.",
      "If the answer is long, start with the definition first.",
      "When stuck, write what changes and why it changes.",
      "For exams, clarity usually beats fancy wording.",
      "Always check whether the question asks for a reason, result, or example.",
      "If a topic has a process, write it in order.",
      "If a topic has causes, group them instead of listing randomly.",
      "Use one example to make abstract ideas easier.",
      "Underline the final result in your notes.",
      "Make your first sentence direct.",
      "Do not use five lines when three strong lines work.",
      "When comparing two ideas, use the same order for both.",
      "In math, check signs before checking arithmetic.",
      "In geography, locate continent first, then region, then country.",
      "In science, connect structure to function."
    ],
    warningNotes: [
      "Do not mix up the definition with the example.",
      "Do not copy the question back as the answer.",
      "Avoid vague words like 'thing' when a subject keyword exists.",
      "Do not skip the final answer line.",
      "Be careful with words like always, never, increase, and decrease.",
      "If units are involved, write them clearly.",
      "If the question says explain, do not give only a one-word answer.",
      "If the question says define, keep it short and exact.",
      "If the question says compare, mention both sides.",
      "If the question asks where, answer location first before extra details."
    ],
    analogyFrames: [
      "Think of it like a map: first find the big area, then the exact point.",
      "Think of it like a recipe: ingredients matter, but order also matters.",
      "Think of it like a chain: each link causes the next one.",
      "Think of it like a machine: input goes in, a process happens, output comes out.",
      "Think of it like sorting a messy desk: group similar things first.",
      "Think of it like a story: setting, action, result.",
      "Think of it like a rulebook: the rule tells you what move is allowed.",
      "Think of it like a phone contact: name alone is not enough; the details locate it.",
      "Think of it like a staircase: skipping steps makes the answer unstable.",
      "Think of it like a signal: the keyword tells you what type of answer is needed."
    ],
    beginnerBridges: [
      "Beginner version: start with the meaning before the details.",
      "Beginner version: ignore the hard wording and look for the main action.",
      "Beginner version: ask, 'what is changing here?'",
      "Beginner version: one idea, one example, one final line.",
      "Beginner version: use simple words first, then add textbook words.",
      "Beginner version: if you can explain it to a friend, you understand it.",
      "Beginner version: do not memorize until the idea feels sensible.",
      "Beginner version: split the question into smaller questions.",
      "Beginner version: look for the keyword that tells you the subject.",
      "Beginner version: write the answer in plain English, then polish it."
    ],
    expertBridges: [
      "Advanced angle: connect the concept to its cause and consequence.",
      "Advanced angle: notice the relationship between structure and function.",
      "Advanced angle: compare the rule with a nearby exception.",
      "Advanced angle: explain why the simple answer is true.",
      "Advanced angle: add conditions where the idea changes.",
      "Advanced angle: mention the mechanism, not only the result.",
      "Advanced angle: show the pattern behind the example.",
      "Advanced angle: connect the topic to a larger system.",
      "Advanced angle: include limitations if the question needs precision.",
      "Advanced angle: explain what would happen if one part changed."
    ],
    lessonShapes: [
      "definition -> reason -> example -> final answer",
      "known information -> rule -> steps -> check",
      "cause -> process -> result -> importance",
      "problem -> method -> solution -> mistake to avoid",
      "keyword -> meaning -> application -> summary",
      "simple version -> detailed version -> memory trick",
      "what it is -> why it matters -> how to remember it",
      "input -> change -> output -> real example",
      "concept -> example -> common confusion -> takeaway",
      "question type -> answer format -> final line"
    ],
    answerClosers: [
      "That is the clean version.",
      "That is the part worth remembering.",
      "That is enough to answer it confidently.",
      "That is the exam-friendly shape.",
      "That gives you both the meaning and the reason.",
      "That is the safest way to write it.",
      "That is the short path through the topic.",
      "That is the reliable method.",
      "That keeps the answer clear without overloading it.",
      "That is the version I would revise from."
    ],
    confidenceHigh: [
      "Confidence: high. The wording points clearly to this answer.",
      "Confidence: high. The concept and method are straightforward here.",
      "Confidence: high. This is a standard school-level explanation.",
      "Confidence: high. The clues in the question are clear.",
      "Confidence: high. This answer should work well for revision."
    ],
    confidenceMedium: [
      "Confidence: medium. A fuller question could make the answer sharper.",
      "Confidence: medium. I am using the strongest clue from your message.",
      "Confidence: medium. This is likely right, but syllabus wording may vary.",
      "Confidence: medium. Send the exact question if you want a more precise answer.",
      "Confidence: medium. The concept is clear, but the prompt is a little open."
    ],
    confidenceLow: [
      "Confidence: low. I need the full question to avoid guessing.",
      "Confidence: low. There is not enough context yet.",
      "Confidence: low. Send the chapter or subject and I will tighten it.",
      "Confidence: low. I can help better with one more keyword.",
      "Confidence: low. The input looks incomplete."
    ],
    continuationBridges: [
      "Send the exact part you want explained, and I will answer it directly.",
      "Share the line, step, or idea that is confusing, and I will make it clearer.",
      "Paste the part you mean, and I will simplify it.",
      "Tell me which sentence or step you want unpacked.",
      "Drop the exact question again, and I will focus only on that."
    ]
  };

  const TYPO_CORRECTIONS = {
    accelaration: "acceleration",
    alredy: "already",
    ans: "answer",
    asnwer: "answer",
    becuase: "because",
    concetration: "concentration",
    concpet: "concept",
    conecpt: "concept",
    defination: "definition",
    diffrence: "difference",
    dissapering: "disappearing",
    doesnt: "does not",
    dont: "do not",
    englishh: "english",
    eqn: "equation",
    equaton: "equation",
    explaiin: "explain",
    explaination: "explanation",
    explian: "explain",
    fave: "favourite",
    frm: "from",
    gonna: "going to",
    goverment: "government",
    grammer: "grammar",
    hieght: "height",
    histroy: "history",
    hw: "homework",
    imporant: "important",
    inteligent: "intelligent",
    isnt: "is not",
    lenght: "length",
    lession: "lesson",
    mathamatics: "mathematics",
    maths: "math",
    becuz: "because",
    pls: "please",
    plz: "please",
    probelm: "problem",
    quetsion: "question",
    shld: "should",
    shoud: "should",
    smthing: "something",
    teachr: "teacher",
    tution: "tuition",
    u: "you",
    ur: "your",
    wht: "what",
    wld: "would",
    wrk: "work",
    xplain: "explain",
    y: "why"
  };

  function readMemory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}");
      return {
        recentPhrases: Array.isArray(parsed.recentPhrases) ? parsed.recentPhrases.slice(-MAX_RECENT_PHRASES) : [],
        messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-MAX_MESSAGES) : [],
        lastSubject: parsed.lastSubject || "",
        lastType: parsed.lastType || ""
      };
    } catch (error) {
      return { recentPhrases: [], messages: [], lastSubject: "", lastType: "" };
    }
  }

  function writeMemory(memory) {
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify({
        recentPhrases: memory.recentPhrases.slice(-MAX_RECENT_PHRASES),
        messages: memory.messages.slice(-MAX_MESSAGES),
        lastSubject: memory.lastSubject,
        lastType: memory.lastType
      }));
    } catch (error) {
      // Memory is helpful, but the chatbot should still work if storage is blocked.
    }
  }

  function normalize(text) {
    let value = String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9#+=/%*().,\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    Object.entries(TYPO_CORRECTIONS).forEach(([wrong, right]) => {
      value = value.replace(new RegExp(`\\b${wrong}\\b`, "g"), right);
    });

    return value;
  }

  function scoreKeywords(value, words) {
    return words.reduce((score, word) => score + (value.includes(word) ? 1 : 0), 0);
  }

  function analyzeMessage(message, subject, context) {
    const value = normalize(message);
    const wordCount = value ? value.split(/\s+/).length : 0;
    const uiScore = scoreKeywords(value, ["ui", "ux", "design", "layout", "button", "mobile", "responsive", "navbar", "sidebar", "animation"]);
    const businessScore = scoreKeywords(value, ["startup", "business", "pricing", "market", "users", "revenue", "launch", "product"]);
    const frustrated = /\b(stuck|confused|hard|difficult|angry|annoying|frustrated|hate|cant|cannot|not working|broken)\b/.test(value);
    const greeting = /^(hi|hello|hey|yo|sup|wassup|whats up|what s up|namaste|good morning|good evening)\b/.test(value);
    const thanks = /\b(thanks|thank you|thx|ty|appreciate)\b/.test(value);
    const farewell = /\b(bye|goodbye|good night|goodnight|see you)\b/.test(value);
    const apology = /\b(sorry|my bad|apologies)\b/.test(value);
    const joking = /\b(lol|haha|lmao|bruh|bro what|jk)\b/.test(value);
    const askingStatus = /\b(how are you|how r you|how you doing|you good|what about you)\b/.test(value);
    const continuation = /^(continue|explain more|more|go on|again|make it simpler)\b/.test(value) || /^(why|how so)\??$/.test(value);
    const detailed = wordCount > 18 || /\b(detail|deep|full|complete|explain properly|step by step|long)\b/.test(value);
    const explanationIntent = /\b(explain|concept|why|how|teach|understand|solve)\b/.test(value);
    const short = !detailed && !explanationIntent && (wordCount <= 5 || /\b(short|quick|fast|brief|one line)\b/.test(value));
    const factual = /^(what|where|when|who|which|define|meaning)\b/.test(value) && wordCount <= 12;
    const brainstorming = /\b(idea|brainstorm|suggest|plan|strategy|improve|features|options)\b/.test(value);
    const homework = /\b(homework|worksheet|textbook|question|exercise|assignment|doubt|solve|answer)\b/.test(value) || !!context?.hasImage;
    const image = !!context?.hasImage;

    let type = "educational";
    if (greeting || thanks || farewell || apology || joking || askingStatus) type = "casual";
    else if (uiScore > 0) type = "uiux";
    else if (businessScore > 0) type = "business";
    else if (brainstorming) type = "brainstorming";
    else if (frustrated) type = "frustrated";
    else if (factual) type = "factual";
    else if (continuation) type = "continuation";
    else if (subject === "general" && wordCount < 3) type = "clarify";

    return {
      value,
      wordCount,
      type,
      detailed,
      short,
      factual,
      frustrated,
      homework,
      image,
      subject,
      wantsBeginner: /\b(simple|easy|beginner|basic|class [1-7]|kid|explain like)\b/.test(value),
      wantsAdvanced: /\b(advanced|deep|expert|detailed|properly|why exactly|mechanism)\b/.test(value),
      wantsExam: /\b(exam|marks|school answer|board|test|revision)\b/.test(value),
      casualIntent: thanks ? "thanks"
        : farewell ? "farewell"
          : apology ? "apology"
            : joking ? "joke"
              : askingStatus || /\b(wassup|whats up|what s up)\b/.test(value) ? "whatsUp"
                : greeting ? "greeting"
                  : "casual"
    };
  }

  function hash(text) {
    let value = 0;
    for (let i = 0; i < text.length; i += 1) {
      value = ((value << 5) - value + text.charCodeAt(i)) | 0;
    }
    return Math.abs(value);
  }

  function pick(bank, memory, seed = "") {
    const list = Array.isArray(bank) ? bank : [];
    if (!list.length) return "";
    const available = list.filter((phrase) => !memory.recentPhrases.includes(phrase));
    const pool = available.length ? available : list;
    const index = (hash(seed + Date.now().toString()) + memory.recentPhrases.length) % pool.length;
    const phrase = pool[index];
    memory.recentPhrases.push(phrase);
    memory.recentPhrases = memory.recentPhrases.slice(-MAX_RECENT_PHRASES);
    return phrase;
  }

  function pickMany(bank, memory, seed, count) {
    const items = [];
    for (let index = 0; index < count; index += 1) {
      items.push(pick(bank, memory, `${seed}:${index}`));
    }
    return items;
  }

  function getPreferredTone() {
    try {
      const stored = localStorage.getItem("tutorly_ai_tone_mode");
      return TONE_MODES[stored] ? stored : "";
    } catch (error) {
      return "";
    }
  }

  function inferDifficulty(profile) {
    if (profile.wantsBeginner || profile.wordCount <= 7) return "beginner";
    if (profile.wantsAdvanced || profile.detailed) return "advanced";
    if (profile.wantsExam || profile.homework) return "school";
    return "balanced";
  }

  function confidenceScore(profile, baseReply) {
    let score = 0.55;
    if (baseReply && baseReply.length > 120) score += 0.2;
    if (profile.subject && profile.subject !== "general") score += 0.15;
    if (profile.image) score += 0.05;
    if (profile.type === "clarify") score -= 0.25;
    if (profile.wordCount < 3) score -= 0.18;
    if (profile.value.includes("maybe") || profile.value.includes("idk")) score -= 0.08;
    return Math.max(0.1, Math.min(0.98, score));
  }

  function confidenceNote(score, memory, seed) {
    if (score >= 0.78) return pick(PHRASES.confidenceHigh, memory, seed);
    if (score >= 0.48) return pick(PHRASES.confidenceMedium, memory, seed);
    return pick(PHRASES.confidenceLow, memory, seed);
  }

  function toneFor(profile, modelId) {
    const preferred = getPreferredTone();
    if (preferred) return preferred;
    if (modelId === "spark") return "fast";
    if (modelId === "lens") return "teacher";
    if (profile.type === "frustrated") return "motivational";
    if (profile.type === "brainstorming" || profile.type === "uiux" || profile.type === "business") return "smart";
    if (profile.detailed) return "deep";
    if (profile.short || profile.factual) return "fast";
    return "teacher";
  }

  function casualReply(profile, memory, message) {
    if (profile.casualIntent === "thanks") return pick(PHRASES.thanks, memory, message);
    if (profile.casualIntent === "farewell") return pick(PHRASES.farewells, memory, message);
    if (profile.casualIntent === "apology") return pick(PHRASES.apologies, memory, message);
    if (profile.casualIntent === "joke") return pick(PHRASES.jokes, memory, message);
    if (profile.casualIntent === "whatsUp") return pick(PHRASES.whatsUp, memory, message);
    if (profile.casualIntent === "greeting") return pick(PHRASES.greetings, memory, message);
    return pick(PHRASES.greetings, memory, message);
  }

  function clarifyReply(memory, message) {
    return [
      pick(PHRASES.clarifiers, memory, message),
      "",
      `_${pick(PHRASES.onboarding, memory, message + "onboard")}_`,
      "",
      "You can type it casually, upload a photo, or say something like:",
      "",
      "- `explain germination`",
      "- `solve x + 5 = 10`",
      "- `where is India located`",
      "",
      "_I will adapt to the words you know._"
    ].join("\n");
  }

  function advisoryReply(profile, memory, message) {
    const isUi = profile.type === "uiux";
    const isBusiness = profile.type === "business";
    const bank = isUi ? PHRASES.uiuxTips : isBusiness ? PHRASES.businessTips : PHRASES.transitions;
    const title = isUi ? "UI/UX Direction" : isBusiness ? "Product Thinking" : "Idea Plan";
    const moves = pickMany(bank, memory, message + "moves", 4);

    return [
      `# ${title}`,
      "",
      pick(PHRASES.reactions, memory, message + "react"),
      "",
      pick(PHRASES.openings, memory, message),
      "",
      "### Recommended direction",
      "",
      `_${moves[0]}_`,
      "",
      "### Practical moves",
      "",
      `1. ${moves[1]}`,
      `2. ${moves[2]}`,
      `3. ${moves[3]}`,
      "",
      "### Cleaner decision rule",
      "",
      "Choose the option that makes the user's next action more obvious.",
      "",
      "### Watch out",
      "",
      pick(isUi ? PHRASES.warningNotes : PHRASES.proTips, memory, message + "warning"),
      "",
      `> **${pick(PHRASES.followUps, memory, message + "follow")}**`
    ].join("\n");
  }

  function continuationReply(baseReply, profile, memory, message) {
    const bridge = pick(PHRASES.continuationBridges, memory, message + "continue");

    return [
      "# Follow-up Help",
      "",
      bridge,
      "",
      baseReply && baseReply.trim() ? baseReply : pick(PHRASES.clarifiers, memory, message + "clarify"),
    ].join("\n");
  }

  function factualPolish(baseReply, profile, memory, message) {
    if (!baseReply || !baseReply.trim()) return clarifyReply(memory, message);
    if (!profile.short) return baseReply;
    const lines = baseReply.split(/\r?\n/).filter((line) => line.trim());
    const finalLine = lines.find((line) => line.trim().startsWith(">"));
    const heading = lines.find((line) => line.startsWith("#")) || "# Quick Answer";
    const firstText = lines.find((line) => !line.startsWith("#") && !line.startsWith(">") && !line.startsWith("###") && !/^\d+\./.test(line));

    return [
      heading,
      "",
      firstText || pick(PHRASES.fastOpenings, memory, message),
      "",
      finalLine || `> **${pick(PHRASES.conclusions, memory, message)}**`
    ].join("\n");
  }

  function enrichEducational(baseReply, profile, memory, message, modelId) {
    if (!baseReply || !baseReply.trim()) return clarifyReply(memory, message);
    if (modelId === "spark" || profile.short || profile.factual) {
      return factualPolish(baseReply, profile, memory, message);
    }
    return baseReply;
  }

  function createReply({ message, modelId = "prime", subject = "general", context = {}, baseReply = "" }) {
    const memory = readMemory();
    const profile = analyzeMessage(message, subject, context);
    const tone = toneFor(profile, modelId);
    const toneSettings = TONE_MODES[tone] || TONE_MODES.default;
    profile.tone = tone;
    profile.toneSettings = toneSettings;

    let reply;
    if (profile.type === "casual") reply = casualReply(profile, memory, message);
    else if (profile.type === "clarify") reply = clarifyReply(memory, message);
    else if (profile.type === "continuation") reply = continuationReply(baseReply, profile, memory, message);
    else if (profile.type === "uiux" || profile.type === "business" || profile.type === "brainstorming") reply = advisoryReply(profile, memory, message);
    else reply = enrichEducational(baseReply, profile, memory, message, modelId);

    memory.messages.push({
      at: Date.now(),
      message: String(message || "").slice(0, 240),
      subject,
      type: profile.type,
      tone,
      difficulty: inferDifficulty(profile),
      confidence: Math.round(confidenceScore(profile, baseReply) * 100) / 100
    });
    memory.lastSubject = subject;
    memory.lastType = profile.type;
    writeMemory(memory);

    return reply;
  }

  window.TutorlyResponseEngine = {
    createReply,
    analyzeMessage,
    toneFor,
    phraseCount: Object.values(PHRASES).reduce((sum, list) => sum + list.length, 0),
    toneModes: Object.keys(TONE_MODES)
  };
})();
