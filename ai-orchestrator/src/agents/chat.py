"""Chat agent for general conversation and Q&A."""

from collections.abc import AsyncIterator
from typing import Any

import structlog

from src.agents.base import BaseAgent
from src.core.models import AgentType, Message, MessageRole

logger = structlog.get_logger(__name__)


class ChatAgent(BaseAgent):
    """Agent for general conversation and Q&A."""

    agent_type = AgentType.CHAT
    description = "general conversation and question answering"
    capabilities = [
        "Answer general knowledge questions",
        "Have helpful conversations",
        "Explain concepts and topics",
        "Provide recommendations and suggestions",
        "Help with brainstorming and ideation",
    ]
    model = "llama3.2:8b"

    def _build_system_prompt(self) -> str:
        """Build the system prompt for chat agent."""
        return """You are Zentoria, a helpful and friendly AI assistant.

You are knowledgeable, clear, and concise in your responses. You help users with:
- Answering questions on various topics
- Explaining concepts in simple terms
- Providing helpful suggestions and recommendations
- Having engaging conversations

Guidelines:
- Be friendly but professional
- Give accurate and helpful information
- If you're unsure about something, say so
- Keep responses focused and relevant
- Use formatting (lists, code blocks) when helpful"""

    async def execute(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """Execute chat completion.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters (temperature, max_tokens)

        Returns:
            Tuple of (response, metadata)
        """
        llm = await self._get_llm()

        # Build messages
        messages = [
            Message(role=MessageRole.SYSTEM, content=self._build_system_prompt())
        ]

        # Add context
        if context:
            messages.extend(context)

        # Add current message
        messages.append(Message(role=MessageRole.USER, content=message))

        # Get parameters
        params = parameters or {}
        temperature = params.get("temperature", 0.7)
        max_tokens = params.get("max_tokens", self.settings.ollama_max_tokens)

        # Generate response
        response = await llm.chat(
            messages,
            model=self.model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        metadata = {
            "model": self.model,
            "temperature": temperature,
            "context_messages": len(context) if context else 0,
        }

        logger.info(
            "Chat completed",
            message_length=len(message),
            response_length=len(response),
        )

        return response, metadata

    async def stream(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        """Stream chat response.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters

        Yields:
            Response chunks
        """
        llm = await self._get_llm()

        # Build messages
        messages = [
            Message(role=MessageRole.SYSTEM, content=self._build_system_prompt())
        ]

        if context:
            messages.extend(context)

        messages.append(Message(role=MessageRole.USER, content=message))

        # Get parameters
        params = parameters or {}
        temperature = params.get("temperature", 0.7)
        max_tokens = params.get("max_tokens", self.settings.ollama_max_tokens)

        # Stream response
        async for chunk in llm.chat_stream(
            messages,
            model=self.model,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            yield chunk
