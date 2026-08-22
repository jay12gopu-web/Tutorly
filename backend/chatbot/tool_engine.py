from __future__ import annotations

import ast
import operator
import re
from typing import Any, Dict, List

from .knowledge_router import QuestionClassification, SmartKnowledgeRouter
from .schemas import ToolCall


class SafeCalculator(ast.NodeVisitor):
    OPERATORS = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
    }

    def visit_Expression(self, node: ast.Expression) -> float:
        return self.visit(node.body)

    def visit_BinOp(self, node: ast.BinOp) -> float:
        op_type = type(node.op)
        if op_type not in self.OPERATORS:
            raise ValueError("unsupported operator")
        return self.OPERATORS[op_type](self.visit(node.left), self.visit(node.right))

    def visit_UnaryOp(self, node: ast.UnaryOp) -> float:
        op_type = type(node.op)
        if op_type not in self.OPERATORS:
            raise ValueError("unsupported operator")
        return self.OPERATORS[op_type](self.visit(node.operand))

    def visit_Constant(self, node: ast.Constant) -> float:
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError("unsupported value")

    def generic_visit(self, node: ast.AST) -> float:
        raise ValueError(f"unsupported expression: {type(node).__name__}")


class ToolEngine:
    def __init__(self) -> None:
        self.knowledge_router = SmartKnowledgeRouter()

    def choose_tools_from_semantic(self, decision: Dict[str, Any], has_attachments: bool) -> List[str]:
        """Select tools only from the validated semantic-router decision."""
        mapping = (
            ("calculator", "calculator"),
            ("graph_engine", "graph_engine"),
            ("geometry_renderer", "geometry_renderer"),
            ("diagram_renderer", "diagram_renderer"),
            ("web_search", "research"),
            ("code_runner", "code"),
        )
        tools = [tool for field, tool in mapping if decision.get(field) is True]
        if has_attachments:
            tools.append("ocr")
        return list(dict.fromkeys(tools))

    def run_tools(self, tool_names: List[str], message: str) -> List[ToolCall]:
        calls: List[ToolCall] = []
        for name in tool_names:
            if name == "calculator":
                calls.append(self._calculator(message))
            elif name == "quiz":
                calls.append(self._quiz_tool(message))
            elif name == "flashcard":
                calls.append(self._flashcard_tool(message))
            elif name == "research":
                calls.append(self._research_tool(message))
            elif name == "code":
                calls.append(self._code_tool(message))
            elif name in {"graph_engine", "geometry_renderer", "diagram_renderer"}:
                calls.append(ToolCall(
                    name=name,
                    reason="Selected by the semantic router because the visual materially supports understanding.",
                    input={"question": message[:500]},
                    output={"status": "frontend_renderer_selected"},
                    confidence=0.9,
                ))
            elif name == "ocr":
                calls.append(ToolCall(name="ocr", reason="Image or Lens mode is active.", input={}, output={"status": "client_ocr_context_expected"}, confidence=0.65))
        return calls

    def _calculator(self, message: str) -> ToolCall:
        expression = self._extract_expression(message)
        output: Dict[str, Any] = {"expression": expression}
        confidence = 0.55
        if expression:
            try:
                tree = ast.parse(expression, mode="eval")
                output["result"] = SafeCalculator().visit(tree)
                confidence = 0.86
            except Exception as error:
                output["error"] = str(error)
        return ToolCall(name="calculator", reason="Selected by the validated semantic tool decision.", input={"message": message}, output=output, confidence=confidence)

    def _quiz_tool(self, message: str) -> ToolCall:
        return ToolCall(
            name="quiz",
            reason="The student may benefit from active recall.",
            input={"topic": message[:120]},
            output={"items": [
                {"question": "Can you explain the main idea in one sentence?", "type": "short_answer"},
                {"question": "What is one example connected to this topic?", "type": "short_answer"},
            ]},
            confidence=0.78,
        )

    def _flashcard_tool(self, message: str) -> ToolCall:
        return ToolCall(
            name="flashcard",
            reason="Flashcards improve memory retention for study mode.",
            input={"topic": message[:120]},
            output={"cards": [{"front": "Key idea", "back": "Write the concept in your own words after reading the answer."}]},
            confidence=0.75,
        )

    def _research_tool(self, message: str) -> ToolCall:
        summary = self.knowledge_router.search(
            message,
            QuestionClassification(
                requires_search=True,
                category="semantic_router",
                confidence=0.9,
                reason="The validated semantic route requested current external knowledge.",
            ),
            max_results=5,
        )
        results = [
            {
                "title": item.title,
                "url": item.url,
                "snippet": item.snippet,
                "source": item.source,
                "published_at": item.published_at,
            }
            for item in summary.results[:5]
        ]
        return ToolCall(
            name="research",
            reason="Selected by the validated semantic tool decision.",
            input={"query": message[:240]},
            output={
                "status": "completed" if results else "unavailable",
                "provider": summary.provider,
                "summary": summary.summary if results else "",
                "results": results,
            },
            confidence=0.86 if results else 0.35,
        )

    def _code_tool(self, message: str) -> ToolCall:
        return ToolCall(
            name="code",
            reason="Selected by the validated semantic tool decision.",
            input={"prompt": message[:240]},
            output={"status": "static_analysis_selected", "checks": ["syntax", "data flow", "edge cases", "tests"]},
            confidence=0.72,
        )

    def _extract_expression(self, message: str) -> str:
        matches = re.findall(r"[-+*/().\d\s]{3,}", message)
        for match in matches:
            cleaned = match.strip()
            if re.search(r"\d\s*[-+*/]\s*\d", cleaned):
                return cleaned
        return ""
