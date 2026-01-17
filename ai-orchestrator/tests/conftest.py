"""Test fixtures and configuration."""

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from src.config import Settings
from src.core.models import AgentType, Message, MessageRole
from src.main import create_app


@pytest.fixture
def settings() -> Settings:
    """Create test settings."""
    return Settings(
        debug=True,
        environment="development",
        ollama_base_url="http://localhost:11434",
        qdrant_url="http://localhost:6333",
        redis_url="redis://localhost:6379",
        mcp_base_url="http://localhost:4000",
    )


@pytest.fixture
def mock_llm_client() -> AsyncMock:
    """Create a mock LLM client."""
    mock = AsyncMock()
    mock.generate.return_value = "This is a test response."
    mock.chat.return_value = "This is a chat response."
    mock.embed.return_value = [[0.1] * 768]
    mock.check_health.return_value = True
    mock.close.return_value = None

    async def mock_stream(*args: Any, **kwargs: Any) -> AsyncIterator[str]:
        for chunk in ["This ", "is ", "a ", "streamed ", "response."]:
            yield chunk

    mock.chat_stream = mock_stream
    return mock


@pytest.fixture
def mock_context_manager() -> AsyncMock:
    """Create a mock context manager."""
    from src.core.models import Conversation

    mock = AsyncMock()
    mock.get_conversation.return_value = Conversation(
        session_id="test-session",
        messages=[],
    )
    mock.save_conversation.return_value = None
    mock.add_message.return_value = Message(
        role=MessageRole.USER,
        content="Test message",
    )
    mock.clear_conversation.return_value = True
    mock.check_redis_health.return_value = True
    mock.check_qdrant_health.return_value = True
    mock.close.return_value = None
    return mock


@pytest.fixture
def mock_rag_pipeline() -> AsyncMock:
    """Create a mock RAG pipeline."""
    from src.core.models import Document

    mock = AsyncMock()
    mock.search.return_value = [
        Document(
            id="doc-1",
            content="Test document content",
            metadata={"doc_id": "test"},
            score=0.95,
        )
    ]
    mock.query.return_value = ("RAG response", [{"source": "test", "score": 0.95}])
    mock.index_document.return_value = 5
    mock.delete_document.return_value = 5
    mock.close.return_value = None
    return mock


@pytest.fixture
def mock_command_router(mock_llm_client: AsyncMock) -> AsyncMock:
    """Create a mock command router."""
    mock = AsyncMock()
    mock.route.return_value = (
        AgentType.CHAT,
        {"method": "pattern", "confidence": 0.9},
    )
    mock.parse_command.return_value = {
        "action": "test",
        "target": "target",
        "parameters": {},
    }
    return mock


@pytest.fixture
def app(
    settings: Settings,
    mock_llm_client: AsyncMock,
    mock_context_manager: AsyncMock,
    mock_rag_pipeline: AsyncMock,
) -> Any:
    """Create test application with mocked dependencies."""
    with patch("src.main.get_settings", return_value=settings):
        with patch("src.main.get_llm_client", return_value=mock_llm_client):
            with patch("src.main.get_context_manager", return_value=mock_context_manager):
                with patch("src.main.get_rag_pipeline", return_value=mock_rag_pipeline):
                    yield create_app(settings)


@pytest.fixture
def client(app: Any) -> TestClient:
    """Create test client."""
    return TestClient(app)


@pytest.fixture
async def async_client(app: Any) -> AsyncIterator[AsyncClient]:
    """Create async test client."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def sample_messages() -> list[Message]:
    """Create sample messages for testing."""
    return [
        Message(role=MessageRole.USER, content="Hello"),
        Message(role=MessageRole.ASSISTANT, content="Hi there!"),
        Message(role=MessageRole.USER, content="How are you?"),
    ]
