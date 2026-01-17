"""Base agent class with common functionality."""

import time
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any

import httpx
import structlog

from src.config import Settings, get_settings
from src.core.llm import LLMClient, get_llm_client
from src.core.models import AgentInfo, AgentType, Message, MessageRole

logger = structlog.get_logger(__name__)


class BaseAgent(ABC):
    """Base class for all agents."""

    agent_type: AgentType
    description: str = "Base agent"
    capabilities: list[str] = []
    model: str = "default"

    def __init__(
        self,
        settings: Settings | None = None,
        llm_client: LLMClient | None = None,
    ) -> None:
        """Initialize the agent."""
        self.settings = settings or get_settings()
        self._llm: LLMClient | None = llm_client
        self._http_client: httpx.AsyncClient | None = None

    async def _get_llm(self) -> LLMClient:
        """Get LLM client."""
        if self._llm is None:
            self._llm = await get_llm_client()
        return self._llm

    async def _get_http_client(self) -> httpx.AsyncClient:
        """Get HTTP client for external calls."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.settings.agent_timeout)
            )
        return self._http_client

    async def close(self) -> None:
        """Close resources."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()

    def get_info(self) -> AgentInfo:
        """Get agent information."""
        return AgentInfo(
            name=self.agent_type,
            description=self.description,
            capabilities=self.capabilities,
            model=self.model,
            active=True,
        )

    def _build_system_prompt(self) -> str:
        """Build the system prompt for this agent."""
        return f"""You are a helpful AI assistant specialized in {self.description}.

Your capabilities include:
{chr(10).join(f"- {cap}" for cap in self.capabilities)}

Always be helpful, accurate, and concise. If you cannot perform a requested action,
explain why and suggest alternatives."""

    async def _call_mcp(
        self,
        endpoint: str,
        method: str = "POST",
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Call the Backend MCP server.

        Args:
            endpoint: API endpoint
            method: HTTP method
            data: Request data

        Returns:
            Response data
        """
        client = await self._get_http_client()
        url = f"{self.settings.mcp_base_url}{endpoint}"

        headers = {}
        if self.settings.mcp_api_key:
            headers["Authorization"] = (
                f"Bearer {self.settings.mcp_api_key.get_secret_value()}"
            )

        try:
            if method.upper() == "GET":
                response = await client.get(url, headers=headers, params=data)
            else:
                response = await client.request(
                    method, url, headers=headers, json=data
                )

            response.raise_for_status()
            return response.json()

        except httpx.HTTPStatusError as e:
            logger.error(
                "MCP call failed",
                endpoint=endpoint,
                status=e.response.status_code,
                error=str(e),
            )
            raise
        except Exception as e:
            logger.error("MCP call error", endpoint=endpoint, error=str(e))
            raise

    @abstractmethod
    async def execute(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """Execute the agent's main function.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters

        Returns:
            Tuple of (response, metadata)
        """
        pass

    async def stream(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        """Stream the agent's response.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters

        Yields:
            Response chunks
        """
        # Default implementation - override for true streaming
        response, _ = await self.execute(
            message, context=context, parameters=parameters
        )
        yield response

    async def invoke(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Invoke the agent and return structured result.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters

        Returns:
            Structured result dict
        """
        start_time = time.time()

        try:
            response, metadata = await self.execute(
                message, context=context, parameters=parameters
            )

            return {
                "success": True,
                "response": response,
                "agent": self.agent_type.value,
                "execution_time": time.time() - start_time,
                "metadata": metadata,
            }

        except Exception as e:
            logger.error(
                "Agent execution failed",
                agent=self.agent_type.value,
                error=str(e),
            )
            return {
                "success": False,
                "response": f"Error: {str(e)}",
                "agent": self.agent_type.value,
                "execution_time": time.time() - start_time,
                "metadata": {"error": str(e)},
            }
