"""LLM client for Ollama integration."""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import Settings, get_settings
from src.core.models import Message, MessageRole

logger = structlog.get_logger(__name__)


class LLMClient:
    """Client for interacting with Ollama LLM API."""

    def __init__(self, settings: Settings | None = None) -> None:
        """Initialize the LLM client."""
        self.settings = settings or get_settings()
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.settings.ollama_base_url,
                timeout=httpx.Timeout(self.settings.ollama_timeout),
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def _format_messages(self, messages: list[Message]) -> list[dict[str, str]]:
        """Format messages for Ollama API."""
        return [{"role": msg.role.value, "content": msg.content} for msg in messages]

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=True,
    )
    async def generate(
        self,
        prompt: str,
        *,
        model: str | None = None,
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        """Generate a completion from a prompt.

        Args:
            prompt: The user prompt
            model: Model to use (defaults to chat model)
            system_prompt: Optional system prompt
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate

        Returns:
            Generated text response
        """
        client = await self._get_client()
        model = model or self.settings.ollama_chat_model
        max_tokens = max_tokens or self.settings.ollama_max_tokens

        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }

        if system_prompt:
            payload["system"] = system_prompt

        logger.debug("Generating completion", model=model, prompt_length=len(prompt))

        response = await client.post("/api/generate", json=payload)
        response.raise_for_status()
        data = response.json()

        return str(data.get("response", ""))

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=True,
    )
    async def chat(
        self,
        messages: list[Message],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        """Generate a chat completion.

        Args:
            messages: Conversation history
            model: Model to use
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate

        Returns:
            Assistant response
        """
        client = await self._get_client()
        model = model or self.settings.ollama_chat_model
        max_tokens = max_tokens or self.settings.ollama_max_tokens

        payload: dict[str, Any] = {
            "model": model,
            "messages": self._format_messages(messages),
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }

        logger.debug("Chat completion", model=model, message_count=len(messages))

        response = await client.post("/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()

        return str(data.get("message", {}).get("content", ""))

    async def chat_stream(
        self,
        messages: list[Message],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """Stream a chat completion.

        Args:
            messages: Conversation history
            model: Model to use
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate

        Yields:
            Chunks of the response
        """
        client = await self._get_client()
        model = model or self.settings.ollama_chat_model
        max_tokens = max_tokens or self.settings.ollama_max_tokens

        payload: dict[str, Any] = {
            "model": model,
            "messages": self._format_messages(messages),
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }

        logger.debug("Streaming chat", model=model, message_count=len(messages))

        async with client.stream("POST", "/api/chat", json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line:
                    import orjson

                    data = orjson.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=True,
    )
    async def embed(
        self,
        texts: list[str],
        *,
        model: str | None = None,
    ) -> list[list[float]]:
        """Generate embeddings for texts.

        Args:
            texts: Texts to embed
            model: Embedding model to use

        Returns:
            List of embedding vectors
        """
        client = await self._get_client()
        model = model or self.settings.ollama_embed_model

        embeddings: list[list[float]] = []

        # Ollama processes one text at a time
        for text in texts:
            payload = {
                "model": model,
                "prompt": text,
            }

            response = await client.post("/api/embeddings", json=payload)
            response.raise_for_status()
            data = response.json()

            embedding = data.get("embedding", [])
            embeddings.append(embedding)

        logger.debug("Generated embeddings", model=model, count=len(embeddings))

        return embeddings

    async def check_health(self) -> bool:
        """Check if Ollama is healthy.

        Returns:
            True if healthy, False otherwise
        """
        try:
            client = await self._get_client()
            response = await client.get("/api/tags")
            return response.status_code == 200
        except Exception as e:
            logger.warning("Ollama health check failed", error=str(e))
            return False

    async def list_models(self) -> list[dict[str, Any]]:
        """List available models.

        Returns:
            List of model information
        """
        client = await self._get_client()
        response = await client.get("/api/tags")
        response.raise_for_status()
        data = response.json()
        return data.get("models", [])


# Global instance (DEPRECATED - CQ-001)
# Use src.container.get_llm_client() instead
_llm_client: LLMClient | None = None


async def get_llm_client() -> LLMClient:
    """
    Get the global LLM client instance.

    DEPRECATED: This function uses global state. Use the DI container instead:
        from src.container import get_llm_client

    For new code, inject LLMClient via FastAPI Depends():
        @router.get("/endpoint")
        async def endpoint(llm: LLMClient = Depends(get_llm_client)):
            ...
    """
    import warnings
    warnings.warn(
        "get_llm_client() is deprecated. Use src.container.get_llm_client() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client
