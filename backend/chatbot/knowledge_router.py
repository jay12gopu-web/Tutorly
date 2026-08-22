from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
import hashlib
import json
import os
import re
import time
from typing import Dict, Iterable, List, Optional, Protocol
from urllib import parse, request
from urllib.error import URLError, HTTPError


@dataclass(frozen=True)
class QuestionClassification:
    requires_search: bool
    category: str
    confidence: float
    reason: str = ""

    def as_dict(self) -> Dict[str, object]:
        return {
            "requiresSearch": self.requires_search,
            "category": self.category,
            "confidence": round(self.confidence, 3),
            "reason": self.reason,
        }


@dataclass(frozen=True)
class SearchResult:
    title: str
    url: str
    snippet: str
    source: str = ""
    published_at: str = ""


@dataclass
class SearchSummary:
    query: str
    provider: str
    results: List[SearchResult] = field(default_factory=list)
    summary: str = ""
    searched_at: datetime = field(default_factory=datetime.utcnow)
    search_time_ms: int = 0
    warning: str = ""

    @property
    def has_results(self) -> bool:
        return bool(self.results)

    def sources_markdown(self) -> str:
        if not self.results:
            return "No live sources were available."
        lines = []
        for index, item in enumerate(self.results[:5], start=1):
            title = item.title or item.source or item.url
            lines.append(f"{index}. {title} - {item.url}")
        return "\n".join(lines)


class SearchProvider(Protocol):
    name: str

    def search(self, query: str, *, max_results: int = 5) -> List[SearchResult]:
        ...


class SearchProviderError(RuntimeError):
    pass


def _read_json_url(url: str, *, headers: Optional[Dict[str, str]] = None, timeout: int = 8) -> Dict[str, object]:
    req = request.Request(url, headers=headers or {})
    try:
        with request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise SearchProviderError(str(error)) from error


class GoogleSearchProvider:
    name = "google"

    def __init__(self, api_key: str, search_engine_id: str):
        self.api_key = api_key
        self.search_engine_id = search_engine_id

    def search(self, query: str, *, max_results: int = 5) -> List[SearchResult]:
        params = parse.urlencode({
            "key": self.api_key,
            "cx": self.search_engine_id,
            "q": query,
            "num": str(max(1, min(max_results, 10))),
        })
        data = _read_json_url(f"https://www.googleapis.com/customsearch/v1?{params}", timeout=10)
        results = []
        for item in data.get("items", [])[:max_results]:
            results.append(SearchResult(
                title=str(item.get("title") or ""),
                url=str(item.get("link") or ""),
                snippet=str(item.get("snippet") or ""),
                source="Google Search",
                published_at="",
            ))
        return [result for result in results if result.snippet or result.url]


class TavilySearchProvider:
    name = "tavily"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def search(self, query: str, *, max_results: int = 5) -> List[SearchResult]:
        payload = parse.urlencode({
            "api_key": self.api_key,
            "query": query,
            "search_depth": "basic",
            "max_results": str(max_results),
            "include_answer": "true",
        })
        data = _read_json_url(f"https://api.tavily.com/search?{payload}", timeout=10)
        results = []
        for item in data.get("results", [])[:max_results]:
            results.append(SearchResult(
                title=str(item.get("title") or ""),
                url=str(item.get("url") or ""),
                snippet=str(item.get("content") or item.get("snippet") or ""),
                source="Tavily",
                published_at=str(item.get("published_date") or ""),
            ))
        if data.get("answer"):
            results.insert(0, SearchResult(
                title="Search answer summary",
                url="",
                snippet=str(data["answer"]),
                source="Tavily",
            ))
        return [result for result in results if result.snippet or result.url]


class BraveSearchProvider:
    name = "brave"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def search(self, query: str, *, max_results: int = 5) -> List[SearchResult]:
        params = parse.urlencode({"q": query, "count": str(max_results)})
        data = _read_json_url(
            f"https://api.search.brave.com/res/v1/web/search?{params}",
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": self.api_key,
            },
            timeout=10,
        )
        web = data.get("web", {}) if isinstance(data.get("web"), dict) else {}
        results = []
        for item in web.get("results", [])[:max_results]:
            results.append(SearchResult(
                title=str(item.get("title") or ""),
                url=str(item.get("url") or ""),
                snippet=str(item.get("description") or ""),
                source="Brave Search",
                published_at=str(item.get("age") or ""),
            ))
        return [result for result in results if result.snippet or result.url]


class BingSearchProvider:
    name = "bing"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def search(self, query: str, *, max_results: int = 5) -> List[SearchResult]:
        params = parse.urlencode({"q": query, "count": str(max_results), "textDecorations": "false"})
        data = _read_json_url(
            f"https://api.bing.microsoft.com/v7.0/search?{params}",
            headers={"Ocp-Apim-Subscription-Key": self.api_key},
            timeout=10,
        )
        web = data.get("webPages", {}) if isinstance(data.get("webPages"), dict) else {}
        results = []
        for item in web.get("value", [])[:max_results]:
            results.append(SearchResult(
                title=str(item.get("name") or ""),
                url=str(item.get("url") or ""),
                snippet=str(item.get("snippet") or ""),
                source="Bing Search",
                published_at=str(item.get("dateLastCrawled") or ""),
            ))
        return [result for result in results if result.snippet or result.url]


class DisabledSearchProvider:
    name = "disabled"

    def search(self, query: str, *, max_results: int = 5) -> List[SearchResult]:
        raise SearchProviderError(
            "No search provider is configured. Set TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, "
            "GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID, or BING_SEARCH_API_KEY."
        )


class SearchCache:
    def __init__(self, ttl_seconds: int = 900):
        self.ttl_seconds = ttl_seconds
        self._store: Dict[str, tuple[float, SearchSummary]] = {}

    def _key(self, query: str, provider: str) -> str:
        digest = hashlib.sha256(f"{provider}:{query.strip().lower()}".encode("utf-8")).hexdigest()
        return digest

    def get(self, query: str, provider: str) -> Optional[SearchSummary]:
        key = self._key(query, provider)
        cached = self._store.get(key)
        if not cached:
            return None
        created, summary = cached
        if time.time() - created > self.ttl_seconds:
            self._store.pop(key, None)
            return None
        return summary

    def set(self, query: str, provider: str, summary: SearchSummary) -> None:
        self._store[self._key(query, provider)] = (time.time(), summary)


class QuestionClassifier:
    current_patterns = [
        r"\btoday\b", r"\byesterday\b", r"\btonight\b", r"\bthis (?:week|month|year)\b",
        r"\blatest\b", r"\brecent\b", r"\bcurrently\b", r"\bcurrent\b", r"\blive\b",
        r"\bbreaking news\b", r"\bheadlines?\b", r"\bnow\b", r"\bupdate\b", r"\bnew policy\b",
        r"\bweather\b", r"\bstock price\b", r"\bshare price\b", r"\bcrypto\b", r"\bexchange rate\b",
        r"\bwho won\b", r"\bmatch result\b", r"\bscore\b", r"\brankings?\b", r"\bipl\b",
        r"\bnasa mission\b", r"\bscientific discover(?:y|ies)\b", r"\bAI developments?\b",
    ]

    academic_patterns = {
        "Mathematics": [
            r"\bsolve\b", r"\bcalculate\b", r"\bfactor\b", r"\bsimplify\b", r"\bequation\b",
            r"\balgebra\b", r"\bgeometry\b", r"\btrigonometry\b", r"\bcalculus\b",
            r"\bprobability\b", r"\bstatistics\b", r"\bword problem\b", r"\b\d+\s*[\+\-\*/^=]\s*\d+\b",
            r"\b(differentiate|integrate|derivative|integral|log base|logarithm|determinant|matrix|lcm|hcf|square root|compound interest|pythagoras)\b",
            r"\b(train|car|boat)\b.*\btravels?\b.*\bfind\b.*\bspeed\b",
        ],
        "Science": [
            r"\bphotosynthesis\b", r"\bnewton'?s law\b", r"\bgravity\b", r"\bforce\b", r"\batom\b",
            r"\bchemical\b", r"\bbiology\b", r"\bphysics\b", r"\bchemistry\b", r"\bgermination\b",
            r"\bcell\b", r"\bformula\b", r"\bexplain\b.*\b(?:law|concept|process)\b",
            r"\b(reaction rate|activation energy|collision theory|catalyst|equilibrium)\b",
            r"\b(astronaut|astronauts|spacecraft|orbit|orbiting|weightless|weightlessness|microgravity|centripetal)\b",
            r"\b(voltage|resistance|ohms?|ohm'?s law|buoyancy|momentum|conduct heat|mass and weight|pressure|sound waves?|light bends?|electrolysis|oxidation|reduction|chromosomes?|ecosystems?)\b",
            r"\bbalance (?:the )?equation\b|\b(?:h2|o2|h2o|co2|nacl|hcl|naoh)\b.*(?:->|=|\+)",
        ],
        "English": [
            r"\bnoun\b", r"\bverb\b", r"\bgrammar\b", r"\bessay\b", r"\bsummary\b", r"\btheme\b",
            r"\bcharacter sketch\b", r"\bpoem\b", r"\bliterature\b", r"\bvocabulary\b", r"\btense\b",
            r"\bformal letter\b", r"\binformal letter\b",
            r"\b(use a or an|preposition|punctuation|idiom|homophones?|synonym|antonym|metaphor|simile|poetry|direct speech|indirect speech|passive voice|adjective|adverb)\b",
            r"\bdifference between\s+(?:affect|effect|their|there|they'?re|its|it's|adjective|adverb)\b",
        ],
        "Social Studies": [
            r"\bworld war\b", r"\bfrench revolution\b", r"\bhistory\b", r"\bgeography\b", r"\bcivics\b",
            r"\beconomics\b", r"\bconstitution\b", r"\bwhere is\b", r"\blocated\b", r"\bcontinent\b",
            r"\bcapital of\b", r"\briver\b", r"\bmountain\b",
            r"\b(earthquake|earthquakes|tectonic|plate|plates|plate boundary|plate boundaries|fault line|volcano|tsunami|seismic|geology)\b",
            r"\b(ashoka|nationalism|colonialism|harappan|industrial revolution|non-cooperation|mughal|monsoon|water cycle|rivers?|settlements?|climate change|latitude|longitude)\b",
        ],
        "Coding": [
            r"\bpython\b", r"\bjava\b", r"\bc\+\+\b", r"\bjavascript\b", r"\bhtml\b", r"\bcss\b",
            r"\balgorithm\b", r"\bdebug\b", r"\bcode\b",
        ],
        "General Education": [
            r"\bdefine\b", r"\bmeaning of\b", r"\bexplain\b", r"\bwhat is\b", r"\bwhy\b", r"\bhow\b",
        ],
    }

    def classify(self, question: str) -> QuestionClassification:
        text = (question or "").strip().lower()
        if not text:
            return QuestionClassification(False, "General Education", 0.4, "Empty or unclear question.")

        if re.search(r"\b(current electricity|electric current|current in (?:a )?circuit|alternating current|direct current|find current|calculate current|current when voltage|current when resistance|ohm'?s law)\b", text, re.I):
            return QuestionClassification(False, "Science", 0.94, "Academic science use of the word current.")

        current_score = self._score(text, self.current_patterns)
        academic_category, academic_score = self._best_academic_match(text)

        # Current/recent wording wins only when it is genuinely time-sensitive.
        if current_score >= 1:
            if academic_score >= 2 and not self._has_strong_current_intent(text):
                return QuestionClassification(False, academic_category, min(0.98, 0.72 + academic_score * 0.08), "Academic question with stable knowledge.")
            category = self._current_category(text)
            return QuestionClassification(True, category, min(0.98, 0.78 + current_score * 0.08), "Question needs current or real-time information.")

        if academic_score > 0:
            return QuestionClassification(False, academic_category, min(0.98, 0.72 + academic_score * 0.08), "Question can be answered from tutor knowledge.")

        if re.search(r"\b(2025|2026|2027)\b", text) and re.search(r"\b(policy|ranking|price|winner|news|released|launched)\b", text):
            return QuestionClassification(True, "Recent Information", 0.86, "Recent year plus changing topic.")

        return QuestionClassification(False, "General Education", 0.68, "No strong current-information signal.")

    def _score(self, text: str, patterns: Iterable[str]) -> int:
        return sum(1 for pattern in patterns if re.search(pattern, text, re.I))

    def _best_academic_match(self, text: str) -> tuple[str, int]:
        best_category = "General Education"
        best_score = 0
        for category, patterns in self.academic_patterns.items():
            score = self._score(text, patterns)
            if score > best_score:
                best_category, best_score = category, score
        return best_category, best_score

    def _has_strong_current_intent(self, text: str) -> bool:
        return bool(re.search(
            r"\b(today|latest|recent|currently|current|live|breaking|headlines|weather|stock price|who won|score|rankings|this week|this month)\b",
            text,
            re.I,
        ))

    def _current_category(self, text: str) -> str:
        if re.search(r"\b(weather|stock price|share price|crypto|exchange rate)\b", text, re.I):
            return "Real-Time Data"
        if re.search(r"\b(match|score|ipl|who won|rankings?)\b", text, re.I):
            return "Live Sports Results"
        if re.search(r"\bpolicy|government|election\b", text, re.I):
            return "Current Government Information"
        if re.search(r"\bnasa|scientific|discovery|ai developments?\b", text, re.I):
            return "Recent Science and Technology"
        return "Current Events"


def build_search_provider() -> SearchProvider:
    preferred = os.getenv("TUTORLY_SEARCH_PROVIDER", "").strip().lower()
    google_key = os.getenv("GOOGLE_SEARCH_API_KEY")
    google_cx = os.getenv("GOOGLE_SEARCH_ENGINE_ID") or os.getenv("GOOGLE_CSE_ID")
    tavily_key = os.getenv("TAVILY_API_KEY")
    brave_key = os.getenv("BRAVE_SEARCH_API_KEY")
    bing_key = os.getenv("BING_SEARCH_API_KEY")

    configured = {
        "tavily": TavilySearchProvider(tavily_key) if tavily_key else None,
        "brave": BraveSearchProvider(brave_key) if brave_key else None,
        "google": GoogleSearchProvider(google_key, google_cx) if google_key and google_cx else None,
        "bing": BingSearchProvider(bing_key) if bing_key else None,
    }
    if preferred and configured.get(preferred):
        return configured[preferred]  # type: ignore[return-value]
    for name in ("tavily", "brave", "google", "bing"):
        provider = configured.get(name)
        if provider:
            return provider
    return DisabledSearchProvider()


class SmartKnowledgeRouter:
    def __init__(self, provider: Optional[SearchProvider] = None, cache: Optional[SearchCache] = None):
        self.provider = provider or build_search_provider()
        self.cache = cache or SearchCache(ttl_seconds=int(os.getenv("TUTORLY_SEARCH_CACHE_SECONDS", "900")))

    def classify(self, question: str) -> QuestionClassification:
        raise RuntimeError("Keyword freshness classification is disabled; use the validated semantic route.")

    def search(self, question: str, classification: QuestionClassification, *, max_results: int = 5) -> SearchSummary:
        if not classification.requires_search:
            return SearchSummary(query=question, provider=self.provider.name, results=[], summary="")

        cached = self.cache.get(question, self.provider.name)
        if cached:
            return cached

        started = time.perf_counter()
        raw_results: List[SearchResult] = []
        provider_error = ""
        retries = max(1, int(os.getenv("TUTORLY_SEARCH_RETRIES", "2")))
        for attempt in range(1, retries + 1):
            try:
                raw_results = self.provider.search(question, max_results=max_results)
                provider_error = ""
                break
            except SearchProviderError as error:
                provider_error = str(error)
                print(
                    "[Tutorly][search] Provider failure "
                    f"provider={self.provider.name} attempt={attempt}/{retries} error={provider_error}"
                )
                if self.provider.name == "disabled":
                    break

        results = self._dedupe(self._validate_sources(raw_results))
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        warning = ""
        if not results:
            warning = provider_error or f"{self.provider.name} returned no usable results."
            print(
                "[Tutorly][search] Structured warning "
                f"provider={self.provider.name} query={question!r} warning={warning}"
            )
        summary = SearchSummary(
            query=question,
            provider=self.provider.name,
            results=results,
            summary=self._summarize(question, results, provider_error=provider_error),
            search_time_ms=elapsed_ms,
            warning=warning,
        )
        self.cache.set(question, self.provider.name, summary)
        return summary

    def _validate_sources(self, results: List[SearchResult]) -> List[SearchResult]:
        valid: List[SearchResult] = []
        for result in results:
            url = (result.url or "").strip()
            title = (result.title or "").strip()
            snippet = (result.snippet or "").strip()
            if url and not re.match(r"^https?://", url, re.I):
                continue
            if not snippet and not title:
                continue
            valid.append(SearchResult(
                title=title,
                url=url,
                snippet=re.sub(r"\s+", " ", snippet),
                source=(result.source or self.provider.name).strip(),
                published_at=(result.published_at or "").strip(),
            ))
        return valid

    def _dedupe(self, results: List[SearchResult]) -> List[SearchResult]:
        seen = set()
        clean = []
        for result in results:
            key = (result.url or result.title or result.snippet).strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            clean.append(result)
        return clean[:6]

    def _summarize(self, question: str, results: List[SearchResult], *, provider_error: str = "") -> str:
        if not results:
            detail = f" Provider error: {provider_error}" if provider_error else ""
            return (
                "No live Google/search results were available. Do not answer from memory for this current-information question."
                f"{detail}"
            )

        lines = [f"Question: {question}", "Relevant live knowledge:"]
        for index, result in enumerate(results[:5], start=1):
            title = result.title or "Untitled source"
            snippet = re.sub(r"\s+", " ", result.snippet or "").strip()
            if len(snippet) > 420:
                snippet = snippet[:417].rstrip() + "..."
            lines.append(f"{index}. {title}: {snippet}")
            if result.url:
                lines.append(f"   Source: {result.url}")
        return "\n".join(lines)
