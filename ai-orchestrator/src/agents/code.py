"""Code agent for code generation and review."""

import re
from collections.abc import AsyncIterator
from typing import Any

import structlog

from src.agents.base import BaseAgent
from src.core.models import AgentType, Message, MessageRole

logger = structlog.get_logger(__name__)


class CodeAgent(BaseAgent):
    """Agent for code generation, review, and debugging."""

    agent_type = AgentType.CODE
    description = "code generation, review, and debugging"
    capabilities = [
        "Generate code in multiple programming languages",
        "Review and improve existing code",
        "Debug and fix code issues",
        "Explain code functionality",
        "Suggest code optimizations",
        "Write unit tests",
        "Refactor code for better structure",
    ]
    model = "codellama:7b"

    def _build_system_prompt(self) -> str:
        """Build the system prompt for code agent."""
        return """You are an expert software developer and code assistant.

You excel at:
- Writing clean, efficient, and well-documented code
- Debugging and fixing code issues
- Reviewing code for best practices and improvements
- Explaining complex code in simple terms
- Suggesting optimizations and refactoring

Guidelines:
- Always provide complete, working code when generating
- Include comments for complex logic
- Follow language-specific best practices and conventions
- When reviewing, be constructive and specific
- Consider edge cases and error handling
- Suggest tests when appropriate

When generating code, always wrap it in appropriate markdown code blocks with language specification."""

    def _extract_language(self, message: str) -> str | None:
        """Extract programming language from message.

        Args:
            message: User message

        Returns:
            Detected language or None
        """
        language_patterns = {
            "python": r"\b(python|py)\b",
            "javascript": r"\b(javascript|js|node)\b",
            "typescript": r"\b(typescript|ts)\b",
            "rust": r"\brust\b",
            "go": r"\b(golang|go)\b",
            "java": r"\bjava\b",
            "c++": r"\b(c\+\+|cpp)\b",
            "c#": r"\b(c#|csharp)\b",
            "ruby": r"\bruby\b",
            "php": r"\bphp\b",
            "swift": r"\bswift\b",
            "kotlin": r"\bkotlin\b",
            "sql": r"\bsql\b",
            "bash": r"\b(bash|shell|sh)\b",
        }

        for lang, pattern in language_patterns.items():
            if re.search(pattern, message, re.IGNORECASE):
                return lang

        return None

    def _extract_code_blocks(self, text: str) -> list[dict[str, str]]:
        """Extract code blocks from text.

        Args:
            text: Text containing code blocks

        Returns:
            List of code blocks with language and content
        """
        pattern = r"```(\w*)\n([\s\S]*?)```"
        matches = re.findall(pattern, text)

        blocks = []
        for lang, code in matches:
            blocks.append({"language": lang or "text", "code": code.strip()})

        return blocks

    async def execute(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """Execute code-related task.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters (language, task_type)

        Returns:
            Tuple of (response, metadata)
        """
        llm = await self._get_llm()

        # Detect language
        params = parameters or {}
        language = params.get("language") or self._extract_language(message)

        # Build system prompt with language hint
        system_prompt = self._build_system_prompt()
        if language:
            system_prompt += f"\n\nThe user is working with {language}. Use {language} conventions and best practices."

        # Build messages
        messages = [Message(role=MessageRole.SYSTEM, content=system_prompt)]

        if context:
            messages.extend(context)

        messages.append(Message(role=MessageRole.USER, content=message))

        # Generate response
        response = await llm.chat(
            messages,
            model=self.settings.ollama_code_model,
            temperature=params.get("temperature", 0.3),  # Lower temp for code
            max_tokens=params.get("max_tokens", self.settings.ollama_max_tokens),
        )

        # Extract code blocks for metadata
        code_blocks = self._extract_code_blocks(response)

        metadata = {
            "model": self.settings.ollama_code_model,
            "detected_language": language,
            "code_blocks": len(code_blocks),
            "languages_in_response": list(
                set(b["language"] for b in code_blocks if b["language"] != "text")
            ),
        }

        logger.info(
            "Code task completed",
            language=language,
            code_blocks=len(code_blocks),
        )

        return response, metadata

    async def stream(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        """Stream code response.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters

        Yields:
            Response chunks
        """
        llm = await self._get_llm()

        params = parameters or {}
        language = params.get("language") or self._extract_language(message)

        system_prompt = self._build_system_prompt()
        if language:
            system_prompt += f"\n\nThe user is working with {language}."

        messages = [Message(role=MessageRole.SYSTEM, content=system_prompt)]

        if context:
            messages.extend(context)

        messages.append(Message(role=MessageRole.USER, content=message))

        async for chunk in llm.chat_stream(
            messages,
            model=self.settings.ollama_code_model,
            temperature=params.get("temperature", 0.3),
            max_tokens=params.get("max_tokens", self.settings.ollama_max_tokens),
        ):
            yield chunk

    async def review_code(
        self,
        code: str,
        language: str | None = None,
    ) -> dict[str, Any]:
        """Review code and provide feedback.

        Args:
            code: Code to review
            language: Programming language

        Returns:
            Review results
        """
        prompt = f"""Please review the following code and provide:
1. A brief summary of what it does
2. Potential issues or bugs
3. Suggestions for improvement
4. Security considerations (if any)
5. Performance considerations (if any)

```{language or ''}
{code}
```"""

        response, metadata = await self.execute(
            prompt, parameters={"language": language}
        )

        return {
            "review": response,
            **metadata,
        }

    async def generate_tests(
        self,
        code: str,
        language: str | None = None,
        framework: str | None = None,
    ) -> dict[str, Any]:
        """Generate unit tests for code.

        Args:
            code: Code to test
            language: Programming language
            framework: Test framework (pytest, jest, etc.)

        Returns:
            Generated tests
        """
        framework_hint = f" using {framework}" if framework else ""

        prompt = f"""Generate comprehensive unit tests{framework_hint} for the following code.
Include edge cases and error scenarios.

```{language or ''}
{code}
```"""

        response, metadata = await self.execute(
            prompt, parameters={"language": language}
        )

        return {
            "tests": response,
            "framework": framework,
            **metadata,
        }
