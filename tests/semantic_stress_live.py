from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
from collections import Counter, defaultdict, deque
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
load_dotenv(ROOT / "backend" / ".env")

from backend.chatbot.ai import GroqProvider, SemanticTutorService
from backend.chatbot.schemas import LearnerProfile
from tests.subject_stress_corpus import BASE_VARIANTS, PROBE_VARIANTS, TopicSpec, topic_specs


DEFAULT_OUTPUT = ROOT / ".tutorly-evals" / "semantic-stress.jsonl"
INTERNAL_METADATA = re.compile(
    r"(?:^|\n)\s*(?:subject|intent|difficulty|response_type|answer_format|visual_needed|tools)\s*:",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class StressCase:
    case_id: str
    subject: str
    topic_key: str
    topic_label: str
    question: str
    kind: str
    variant_index: int
    topic_signals: tuple[str, ...]
    answer_signals: tuple[str, ...]
    accepted_subjects: tuple[str, ...]
    visual: str
    expected_formats: tuple[str, ...]


def normalized(value: str) -> str:
    return " ".join(value.casefold().replace("²", "2").split())


def render_variant(template: str, spec: TopicSpec) -> str:
    return template.format(question=spec.direct, indirect=spec.indirect)


def render_mcq(spec: TopicSpec, subject_topics: tuple[TopicSpec, ...]) -> str:
    current_index = subject_topics.index(spec)
    distractors = [
        "; ".join(subject_topics[(current_index + offset) % len(subject_topics)].answer_signals)
        for offset in (1, 2, 3)
    ]
    correct = "; ".join(spec.answer_signals)
    return (
        f"Multiple-choice question:\n{spec.direct}\n\n"
        f"A. {correct}\nB. {distractors[0]}\nC. {distractors[1]}\nD. {distractors[2]}\n\n"
        "Choose the best option, then briefly justify it instead of only writing the letter."
    )


def make_base_cases(subjects: Iterable[str], questions_per_subject: int) -> list[StressCase]:
    specs = topic_specs()
    per_subject: list[list[StressCase]] = []
    for subject in subjects:
        candidates: list[StressCase] = []
        for topic in specs[subject]:
            for index, (template, _is_indirect) in enumerate(BASE_VARIANTS):
                question = (
                    render_mcq(topic, specs[subject])
                    if template == "__mcq__"
                    else render_variant(template, topic)
                )
                candidates.append(
                    StressCase(
                        case_id=f"{subject}/{topic.key}/base-{index:02d}",
                        subject=subject,
                        topic_key=topic.key,
                        topic_label=topic.label,
                        question=question,
                        kind="base",
                        variant_index=index,
                        topic_signals=topic.topic_signals,
                        answer_signals=topic.answer_signals,
                        accepted_subjects=topic.accepted_subjects,
                        visual=topic.visual,
                        expected_formats=topic.expected_formats,
                    )
                )
        if questions_per_subject >= len(candidates):
            per_subject.append(candidates)
            continue

        # Round-robin topics so smaller smoke runs still cover the whole subject.
        selected: list[StressCase] = []
        for variant_index in range(len(BASE_VARIANTS)):
            for topic_index in range(len(specs[subject])):
                candidate_index = topic_index * len(BASE_VARIANTS) + variant_index
                selected.append(candidates[candidate_index])
                if len(selected) == questions_per_subject:
                    break
            if len(selected) == questions_per_subject:
                break
        per_subject.append(selected)

    # Interleave subjects so capped/free-tier runs test broad coverage first.
    return [
        subject_cases[index]
        for index in range(questions_per_subject)
        for subject_cases in per_subject
    ]


def make_probe_cases(spec: TopicSpec) -> list[StressCase]:
    return [
        StressCase(
            case_id=f"{spec.subject}/{spec.key}/probe-{index:02d}",
            subject=spec.subject,
            topic_key=spec.key,
            topic_label=spec.label,
            question=render_variant(template, spec),
            kind="probe",
            variant_index=index,
            topic_signals=spec.topic_signals,
            answer_signals=spec.answer_signals,
            accepted_subjects=spec.accepted_subjects,
            visual=spec.visual,
            expected_formats=spec.expected_formats,
        )
        for index, template in enumerate(PROBE_VARIANTS)
    ]


def score(case: StressCase, result) -> list[str]:
    route = result.output.classification
    answer = result.output.answer.strip()
    answer_text = normalized(answer)
    topic_text = normalized(route.topic)
    failures: list[str] = []

    if route.subject.value not in case.accepted_subjects:
        failures.append(f"subject:{route.subject.value}")
    if not any(normalized(signal) in topic_text for signal in case.topic_signals):
        failures.append(f"topic:{route.topic}")
    if not any(normalized(signal) in answer_text for signal in case.answer_signals):
        failures.append("missing_expected_fact")
    if len(answer.split()) < 3:
        failures.append("answer_too_short")
    if len(answer.split()) > 650:
        failures.append("answer_too_long")
    if INTERNAL_METADATA.search(answer):
        failures.append("internal_metadata_exposed")
    if any(len(paragraph.split()) > 220 for paragraph in re.split(r"\n\s*\n", answer)):
        failures.append("text_wall")
    if case.visual == "required" and not route.visual.needed:
        failures.append("visual_missing")
    if case.visual == "forbidden" and route.visual.needed:
        failures.append(f"unnecessary_visual:{route.visual.type.value}")
    if case.expected_formats and case.kind == "base" and case.variant_index in {0, 1}:
        if route.answer_format.value not in case.expected_formats:
            failures.append(f"format:{route.answer_format.value}")
    if route.visual.needed and route.visual.type.value == "none":
        failures.append("visual_inconsistent")
    if not route.visual.needed and route.visual.type.value != "none":
        failures.append("visual_inconsistent")
    return failures


def read_records(path: Path) -> dict[str, dict]:
    records: dict[str, dict] = {}
    if not path.exists():
        return records
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        case_id = str(record.get("case_id", ""))
        if case_id:
            records[case_id] = record
    return records


def append_record(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def build_summary(records: dict[str, dict], selected_subjects: list[str], requested: int) -> dict:
    per_subject: dict[str, dict] = {}
    failure_reasons: Counter[str] = Counter()
    failed_topics: dict[str, set[str]] = defaultdict(set)
    for subject in selected_subjects:
        subject_records = [record for record in records.values() if record.get("subject") == subject]
        base = [record for record in subject_records if record.get("kind") == "base"]
        probes = [record for record in subject_records if record.get("kind") == "probe"]
        passed = sum(bool(record.get("passed")) for record in base)
        for record in subject_records:
            if not record.get("passed"):
                failed_topics[subject].add(str(record.get("topic_key")))
                failure_reasons.update(record.get("failures", []))
        per_subject[subject] = {
            "requested_base_questions": requested,
            "completed_base_questions": len(base),
            "passed_base_questions": passed,
            "failed_base_questions": len(base) - passed,
            "base_pass_rate": round((passed / len(base) * 100), 2) if base else 0.0,
            "completed_probe_questions": len(probes),
            "failed_topics": sorted(failed_topics[subject]),
        }
    completed_base = sum(item["completed_base_questions"] for item in per_subject.values())
    passed_base = sum(item["passed_base_questions"] for item in per_subject.values())
    return {
        "subjects": selected_subjects,
        "requested_questions_per_subject": requested,
        "requested_base_total": requested * len(selected_subjects),
        "completed_base_total": completed_base,
        "passed_base_total": passed_base,
        "failed_base_total": completed_base - passed_base,
        "overall_base_pass_rate": round((passed_base / completed_base * 100), 2) if completed_base else 0.0,
        "total_probe_questions": sum(item["completed_probe_questions"] for item in per_subject.values()),
        "failure_reasons": dict(failure_reasons.most_common()),
        "per_subject": per_subject,
    }


async def ask_with_retries(service, case: StressCase, profile: LearnerProfile, retries: int):
    last_result = None
    for attempt in range(retries + 1):
        last_result = await service.route_and_answer(
            student_question=case.question,
            conversation_context=[],
            profile=profile,
            mode="prime",
        )
        if last_result.provider_used:
            return last_result, attempt
        if last_result.status not in {"timeout", "provider_error"}:
            return last_result, attempt
        await asyncio.sleep(min(2 ** attempt, 8))
    return last_result, retries


async def run(arguments: argparse.Namespace) -> int:
    specs_by_subject = topic_specs()
    selected_subjects = list(specs_by_subject) if arguments.subjects == "all" else [
        value.strip() for value in arguments.subjects.split(",") if value.strip()
    ]
    unknown = sorted(set(selected_subjects) - set(specs_by_subject))
    if unknown:
        raise ValueError(f"Unknown subjects: {', '.join(unknown)}")
    if not 1 <= arguments.questions_per_subject <= 200:
        raise ValueError("--questions-per-subject must be between 1 and 200")

    output = Path(arguments.output).resolve()
    if arguments.reset and output.exists():
        output.unlink()
    completed = read_records(output)
    if arguments.dry_run:
        cases = make_base_cases(selected_subjects, arguments.questions_per_subject)
        print(json.dumps({
            "subjects": selected_subjects,
            "questions_per_subject": arguments.questions_per_subject,
            "base_total": len(cases),
            "possible_probes_per_failed_topic": 10,
        }, indent=2))
        return 0

    provider = GroqProvider(timeout_seconds=45)
    if not provider.configured:
        print("GROQ_API_KEY is not configured in backend/.env", file=sys.stderr)
        return 2
    service = SemanticTutorService(provider)
    profile = LearnerProfile(user_id="stress-test", grade=arguments.grade)
    base_cases = make_base_cases(selected_subjects, arguments.questions_per_subject)
    queue = deque(case for case in base_cases if case.case_id not in completed)
    topics = {
        (spec.subject, spec.key): spec
        for subject in selected_subjects
        for spec in specs_by_subject[subject]
    }
    probed_topics = {
        (record.get("subject"), record.get("topic_key"))
        for record in completed.values()
        if record.get("kind") == "probe"
    }
    for record in completed.values():
        if record.get("kind") == "base" and not record.get("passed"):
            topic_id = (record.get("subject"), record.get("topic_key"))
            if topic_id not in probed_topics and topic_id in topics:
                for probe in reversed(make_probe_cases(topics[topic_id])):
                    if probe.case_id not in completed:
                        queue.appendleft(probe)
                probed_topics.add(topic_id)

    requests_this_run = 0
    provider_stop = ""
    provider_retry_after_seconds: float | None = None
    consecutive_rate_limits = 0
    while queue:
        if arguments.max_requests and requests_this_run >= arguments.max_requests:
            provider_stop = "max_requests"
            break
        case = queue.popleft()
        started = time.monotonic()
        result, retry_count = await ask_with_retries(service, case, profile, arguments.retries)
        elapsed_ms = round((time.monotonic() - started) * 1000)
        requests_this_run += retry_count + 1
        if not result.provider_used:
            print(json.dumps({"case_id": case.case_id, "provider_status": result.status}))
            if result.status == "rate_limited" and consecutive_rate_limits < arguments.rate_limit_pauses:
                requested_wait = result.retry_after_seconds or arguments.rate_limit_wait_seconds
                if requested_wait > arguments.max_rate_limit_wait_seconds:
                    provider_stop = result.status
                    provider_retry_after_seconds = requested_wait
                    break
                consecutive_rate_limits += 1
                queue.appendleft(case)
                print(
                    f"Groq rate limit reached; preserving progress and retrying in "
                    f"{requested_wait:.0f}s "
                    f"({consecutive_rate_limits}/{arguments.rate_limit_pauses}).",
                    flush=True,
                )
                await asyncio.sleep(requested_wait)
                continue
            if result.status in {"rate_limited", "authentication_failed", "not_configured"}:
                provider_stop = result.status
                break
            record = {
                **asdict(case),
                "passed": False,
                "failures": [f"provider:{result.status}"],
                "provider_status": result.status,
                "elapsed_ms": elapsed_ms,
                "retry_count": retry_count,
            }
        else:
            consecutive_rate_limits = 0
            route = result.output.classification
            failures = score(case, result)
            record = {
                **asdict(case),
                "passed": not failures,
                "failures": failures,
                "provider_status": result.status,
                "route": route.model_dump(mode="json"),
                "answer": result.output.answer,
                "elapsed_ms": elapsed_ms,
                "retry_count": retry_count,
            }
        append_record(output, record)
        completed[case.case_id] = record
        status = "PASS" if record["passed"] else "FAIL"
        print(json.dumps({
            "status": status,
            "case_id": case.case_id,
            "failures": record["failures"],
            "elapsed_ms": elapsed_ms,
        }, ensure_ascii=False), flush=True)
        if arguments.show_answers and "answer" in record:
            print(record["answer"], flush=True)

        topic_id = (case.subject, case.topic_key)
        if not record["passed"] and case.kind == "base" and topic_id not in probed_topics:
            probes = [probe for probe in make_probe_cases(topics[topic_id]) if probe.case_id not in completed]
            for probe in reversed(probes):
                queue.appendleft(probe)
            probed_topics.add(topic_id)
            print(f"Scheduled 10 focused probes for {case.subject}/{case.topic_key}.", flush=True)
        if arguments.delay_seconds > 0 and queue:
            await asyncio.sleep(arguments.delay_seconds)

    summary = build_summary(completed, selected_subjects, arguments.questions_per_subject)
    summary["provider_stop"] = provider_stop or None
    summary["provider_retry_after_seconds"] = provider_retry_after_seconds
    summary["requests_this_run"] = requests_this_run
    summary_path = output.with_suffix(".summary.json")
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Results: {output}")
    print(f"Summary: {summary_path}")

    if provider_stop in {"rate_limited", "authentication_failed", "not_configured"}:
        return 75
    if summary["completed_base_total"] < summary["requested_base_total"]:
        return 3
    return 1 if summary["failed_base_total"] else 0


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Stress-test Tutorly with 200 semantic questions per subject and 10 probes per failed topic."
    )
    parser.add_argument("--subjects", default="all", help="Comma-separated subjects, or all.")
    parser.add_argument("--questions-per-subject", type=int, default=200)
    parser.add_argument("--grade", default="grade_9")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--delay-seconds", type=float, default=2.1)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--rate-limit-wait-seconds", type=float, default=65.0)
    parser.add_argument("--rate-limit-pauses", type=int, default=2)
    parser.add_argument("--max-rate-limit-wait-seconds", type=float, default=300.0)
    parser.add_argument("--max-requests", type=int, default=0, help="Zero means no runner-side cap.")
    parser.add_argument("--show-answers", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reset", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parse_arguments())))
