# Tutorly Adaptive Answer System

Tutorly selects answer structure semantically in the same validated LLM response that classifies the question.

The structured route includes:

- `subject`, `topic`, `intent`, and `difficulty`
- `response_type`
- `answer_format` such as `direct_answer`, `why_explanation`, `math_worked_solution`, `english_literature`, or `comparison_table`
- `response_length`: `very_short`, `short`, `medium`, or `detailed`
- a validated visual decision and placement
- explicit tool flags

The answer generator then writes student-facing Markdown appropriate to those semantic decisions. Short factual questions remain one line. Processes use ordered steps. Maths solutions show the necessary working and final result. Comparisons prefer tables. Literature separates meaning from analysis. Follow-ups use recent turns and answer the requested clarification without restarting the lesson.

Internal routing metadata is returned for application logic but is never inserted into the student-facing answer.

The active system does not use keyword lists to choose a subject, topic, intent, format, or visual. Legacy browser answer engines are not loaded on the live Tutorly chat page.
