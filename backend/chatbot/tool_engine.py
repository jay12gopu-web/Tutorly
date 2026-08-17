from __future__ import annotations

import ast
import operator
import re
from typing import Any, Dict, List

from .schemas import ChatMode, SubjectArea, ToolCall


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
    def choose_tools(self, message: str, subject: SubjectArea, mode: ChatMode, has_attachments: bool) -> List[str]:
        text = message.lower()
        tools: List[str] = []
        if subject == SubjectArea.mathematics or re.search(r"\d+\s*[-+*/]\s*\d+", text):
            tools.append("calculator")
        if "quiz" in text or mode == ChatMode.study:
            tools.append("quiz")
        if "flashcard" in text or mode == ChatMode.study:
            tools.append("flashcard")
        if mode == ChatMode.research or "source" in text or "citation" in text:
            tools.append("research")
        if subject == SubjectArea.computer_science or mode == ChatMode.coding:
            tools.append("code")
        if has_attachments or mode == ChatMode.lens:
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
        return ToolCall(name="calculator", reason="Numerical or algebra-like expression detected.", input={"message": message}, output=output, confidence=confidence)

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
        return ToolCall(
            name="research",
            reason="Research mode or citation intent detected.",
            input={"query": message[:240]},
            output={"note": "Local knowledge retrieval is available; external web retrieval should be added server-side with trusted sources."},
            confidence=0.66,
        )

    def _code_tool(self, message: str) -> ToolCall:
        return ToolCall(
            name="code",
            reason="Coding intent detected.",
            input={"prompt": message[:240]},
            output={"checks": ["syntax", "data flow", "edge cases", "tests"]},
            confidence=0.72,
        )

    def _extract_expression(self, message: str) -> str:
        matches = re.findall(r"[-+*/().\d\s]{3,}", message)
        for match in matches:
            cleaned = match.strip()
            if re.search(r"\d\s*[-+*/]\s*\d", cleaned):
                return cleaned
        return ""
