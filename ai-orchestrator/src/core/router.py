"""Command router for intent detection and agent routing."""

import re
from typing import Any

import structlog

from src.config import Settings, get_settings
from src.core.llm import LLMClient, get_llm_client
from src.core.models import AgentType, Message, MessageRole

logger = structlog.get_logger(__name__)


# Intent patterns for rule-based routing
INTENT_PATTERNS: dict[AgentType, list[re.Pattern[str]]] = {
    AgentType.FILE: [
        re.compile(r"\b(file|folder|directory|read|write|create|delete|move|copy|list)\b", re.I),
        re.compile(r"\b(upload|download|save|open)\b", re.I),
        re.compile(r"\.(txt|pdf|doc|json|csv|xml|yaml|md)\b", re.I),
    ],
    AgentType.MAIL: [
        re.compile(r"\b(email|mail|send|inbox|compose|draft|reply)\b", re.I),
        re.compile(r"\b(newsletter|notification|message)\b", re.I),
        re.compile(r"@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", re.I),  # Email addresses
    ],
    AgentType.KEY: [
        re.compile(r"\b(api.?key|secret|token|credential|password)\b", re.I),
        re.compile(r"\b(generate|create|rotate|revoke)\s+(key|token|secret)\b", re.I),
        re.compile(r"\b(authentication|authorization|auth)\b", re.I),
    ],
    AgentType.WORKFLOW: [
        re.compile(r"\b(workflow|automation|n8n|trigger|pipeline)\b", re.I),
        re.compile(r"\b(schedule|cron|job|task)\b", re.I),
        re.compile(r"\b(webhook|integrate|connect)\b", re.I),
    ],
    AgentType.SECURITY: [
        re.compile(r"\b(permission|access|role|privilege)\b", re.I),
        re.compile(r"\b(security|firewall|encrypt|decrypt)\b", re.I),
        re.compile(r"\b(audit|log|monitor|alert)\b", re.I),
    ],
    AgentType.CODE: [
        re.compile(r"\b(code|program|function|class|method)\b", re.I),
        re.compile(r"\b(python|javascript|typescript|rust|go|java)\b", re.I),
        re.compile(r"\b(debug|fix|refactor|optimize|review)\s+code\b", re.I),
        re.compile(r"```[\s\S]*```", re.I),  # Code blocks
    ],
    AgentType.SEARCH: [
        re.compile(r"\b(search|find|look\s+for|query)\b", re.I),
        re.compile(r"\b(document|docs|knowledge|information)\b", re.I),
        re.compile(r"\?\s*$"),  # Questions
    ],
    AgentType.CHAT: [
        re.compile(r"\b(hello|hi|hey|how\s+are\s+you|thanks|bye)\b", re.I),
        re.compile(r"\b(explain|tell\s+me|what\s+is|help)\b", re.I),
    ],
}

# Agent priorities for conflict resolution
AGENT_PRIORITIES: dict[AgentType, int] = {
    AgentType.CODE: 10,
    AgentType.FILE: 9,
    AgentType.MAIL: 8,
    AgentType.KEY: 8,
    AgentType.WORKFLOW: 7,
    AgentType.SECURITY: 7,
    AgentType.SEARCH: 5,
    AgentType.CHAT: 1,
}


class CommandRouter:
    """Route commands to appropriate agents based on intent."""

    def __init__(
        self,
        settings: Settings | None = None,
        llm_client: LLMClient | None = None,
    ) -> None:
        """Initialize the command router."""
        self.settings = settings or get_settings()
        self._llm: LLMClient | None = llm_client

    async def _get_llm(self) -> LLMClient:
        """Get LLM client."""
        if self._llm is None:
            self._llm = await get_llm_client()
        return self._llm

    def _pattern_match(self, text: str) -> dict[AgentType, int]:
        """Match text against intent patterns.

        Args:
            text: Input text

        Returns:
            Dict of agent types to match scores
        """
        scores: dict[AgentType, int] = {}

        for agent_type, patterns in INTENT_PATTERNS.items():
            score = 0
            for pattern in patterns:
                matches = pattern.findall(text)
                score += len(matches)
            if score > 0:
                scores[agent_type] = score

        return scores

    def _resolve_conflicts(self, scores: dict[AgentType, int]) -> AgentType:
        """Resolve conflicts when multiple agents match.

        Args:
            scores: Dict of agent types to match scores

        Returns:
            Selected agent type
        """
        if not scores:
            return AgentType.CHAT

        # Weight by priority
        weighted_scores = {
            agent: score * AGENT_PRIORITIES.get(agent, 1)
            for agent, score in scores.items()
        }

        # Return highest weighted score
        return max(weighted_scores, key=lambda x: weighted_scores[x])

    async def _llm_classify(
        self,
        text: str,
        context: list[Message] | None = None,
    ) -> AgentType | None:
        """Use LLM to classify intent when pattern matching is ambiguous.

        Args:
            text: Input text
            context: Optional conversation context

        Returns:
            Classified agent type or None
        """
        llm = await self._get_llm()

        agent_descriptions = """
Available agents:
- file: File and folder operations (read, write, create, delete, list files)
- mail: Email operations (send, compose, manage inbox)
- key: API key and credential management (generate, rotate, revoke keys)
- workflow: Workflow automation and n8n triggers
- security: Permission and access control
- code: Code generation, review, and debugging
- search: Document search and information retrieval
- chat: General conversation and Q&A
"""

        prompt = f"""Classify the following user request into one of the available agents.
Reply with ONLY the agent name (lowercase, one word).

{agent_descriptions}

User request: {text}

Agent:"""

        try:
            response = await llm.generate(
                prompt,
                temperature=0.1,
                max_tokens=20,
            )

            agent_name = response.strip().lower().replace(":", "").replace(" ", "")

            # Map to AgentType
            agent_map = {
                "file": AgentType.FILE,
                "mail": AgentType.MAIL,
                "email": AgentType.MAIL,
                "key": AgentType.KEY,
                "workflow": AgentType.WORKFLOW,
                "security": AgentType.SECURITY,
                "code": AgentType.CODE,
                "search": AgentType.SEARCH,
                "chat": AgentType.CHAT,
            }

            return agent_map.get(agent_name)

        except Exception as e:
            logger.warning("LLM classification failed", error=str(e))
            return None

    async def route(
        self,
        text: str,
        *,
        context: list[Message] | None = None,
        force_agent: AgentType | None = None,
    ) -> tuple[AgentType, dict[str, Any]]:
        """Route a command to the appropriate agent.

        Args:
            text: User input text
            context: Optional conversation context
            force_agent: Force routing to specific agent

        Returns:
            Tuple of (selected agent, routing metadata)
        """
        if force_agent:
            return force_agent, {"method": "forced", "confidence": 1.0}

        # Pattern-based matching
        scores = self._pattern_match(text)
        logger.debug("Pattern match scores", scores=scores)

        metadata: dict[str, Any] = {
            "method": "pattern",
            "scores": scores,
        }

        if not scores:
            # No patterns matched, try LLM classification
            llm_result = await self._llm_classify(text, context)
            if llm_result:
                metadata["method"] = "llm"
                metadata["confidence"] = 0.8
                return llm_result, metadata
            else:
                metadata["method"] = "default"
                metadata["confidence"] = 0.5
                return AgentType.CHAT, metadata

        # Single match
        if len(scores) == 1:
            agent = next(iter(scores.keys()))
            metadata["confidence"] = min(scores[agent] * 0.3, 1.0)
            return agent, metadata

        # Multiple matches - check if significantly different
        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top_score = sorted_scores[0][1]
        second_score = sorted_scores[1][1] if len(sorted_scores) > 1 else 0

        if top_score > second_score * 2:
            # Clear winner
            agent = sorted_scores[0][0]
            metadata["confidence"] = 0.9
            return agent, metadata

        # Ambiguous - use priority-weighted resolution
        agent = self._resolve_conflicts(scores)
        metadata["confidence"] = 0.7
        metadata["method"] = "priority_weighted"

        return agent, metadata

    async def parse_command(
        self,
        text: str,
    ) -> dict[str, Any]:
        """Parse command to extract parameters.

        Args:
            text: User input text

        Returns:
            Parsed command dict with action and parameters
        """
        llm = await self._get_llm()

        prompt = f"""Parse the following command and extract:
1. The main action (verb)
2. The target/object
3. Any parameters or options

Reply in JSON format with keys: action, target, parameters

Command: {text}

JSON:"""

        try:
            response = await llm.generate(
                prompt,
                temperature=0.1,
                max_tokens=200,
            )

            # Extract JSON from response
            import json

            # Try to find JSON in response
            json_match = re.search(r"\{[\s\S]*\}", response)
            if json_match:
                return json.loads(json_match.group())

        except Exception as e:
            logger.warning("Command parsing failed", error=str(e))

        # Fallback: simple extraction
        words = text.split()
        return {
            "action": words[0] if words else "unknown",
            "target": words[1] if len(words) > 1 else None,
            "parameters": {},
            "raw": text,
        }

    def extract_entities(self, text: str) -> dict[str, list[str]]:
        """Extract named entities from text.

        Args:
            text: Input text

        Returns:
            Dict of entity types to values
        """
        entities: dict[str, list[str]] = {
            "emails": [],
            "urls": [],
            "file_paths": [],
            "numbers": [],
        }

        # Email addresses
        email_pattern = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
        entities["emails"] = re.findall(email_pattern, text)

        # URLs
        url_pattern = r"https?://[^\s<>\"{}|\\^`\[\]]+"
        entities["urls"] = re.findall(url_pattern, text)

        # File paths (Unix and Windows)
        path_pattern = r"(?:[/~][\w./-]+|[A-Z]:\\[\w.\\/-]+)"
        entities["file_paths"] = re.findall(path_pattern, text)

        # Numbers (including decimals)
        number_pattern = r"\b\d+(?:\.\d+)?\b"
        entities["numbers"] = re.findall(number_pattern, text)

        return entities


# Global instance (DEPRECATED - CQ-001)
# Use src.container.get_command_router() instead
_command_router: CommandRouter | None = None


async def get_command_router() -> CommandRouter:
    """
    Get the global command router instance.

    DEPRECATED: This function uses global state. Use the DI container instead:
        from src.container import get_command_router

    For new code, inject CommandRouter via FastAPI Depends():
        @router.get("/endpoint")
        async def endpoint(router: CommandRouter = Depends(get_command_router)):
            ...
    """
    import warnings
    warnings.warn(
        "get_command_router() is deprecated. Use src.container.get_command_router() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    global _command_router
    if _command_router is None:
        _command_router = CommandRouter()
    return _command_router
