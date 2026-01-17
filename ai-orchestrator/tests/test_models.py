"""Tests for data models."""

import pytest
from datetime import datetime
from uuid import UUID

from src.core.models import (
    AgentInfo,
    AgentType,
    ChatRequest,
    ChatResponse,
    CommandRequest,
    CommandResponse,
    Conversation,
    Document,
    EmbedRequest,
    EmbedResponse,
    HealthResponse,
    Message,
    MessageRole,
)


class TestMessage:
    """Tests for Message model."""

    def test_create_message(self) -> None:
        """Test creating a message."""
        msg = Message(role=MessageRole.USER, content="Hello")
        assert msg.role == MessageRole.USER
        assert msg.content == "Hello"
        assert isinstance(msg.id, UUID)
        assert isinstance(msg.timestamp, datetime)

    def test_message_with_agent(self) -> None:
        """Test message with agent."""
        msg = Message(
            role=MessageRole.ASSISTANT,
            content="Response",
            agent=AgentType.CHAT,
        )
        assert msg.agent == AgentType.CHAT

    def test_message_with_citations(self) -> None:
        """Test message with citations."""
        citations = [{"source": "doc1", "score": 0.9}]
        msg = Message(
            role=MessageRole.ASSISTANT,
            content="Response",
            citations=citations,
        )
        assert len(msg.citations) == 1
        assert msg.citations[0]["source"] == "doc1"


class TestConversation:
    """Tests for Conversation model."""

    def test_create_conversation(self) -> None:
        """Test creating a conversation."""
        conv = Conversation(session_id="test-123")
        assert conv.session_id == "test-123"
        assert conv.messages == []
        assert isinstance(conv.created_at, datetime)

    def test_conversation_with_messages(self) -> None:
        """Test conversation with messages."""
        messages = [
            Message(role=MessageRole.USER, content="Hi"),
            Message(role=MessageRole.ASSISTANT, content="Hello"),
        ]
        conv = Conversation(session_id="test-123", messages=messages)
        assert len(conv.messages) == 2


class TestChatRequest:
    """Tests for ChatRequest model."""

    def test_create_request(self) -> None:
        """Test creating a chat request."""
        req = ChatRequest(message="Hello")
        assert req.message == "Hello"
        assert req.stream is False
        assert req.use_rag is True

    def test_request_with_agent(self) -> None:
        """Test request with specific agent."""
        req = ChatRequest(message="Write code", agent=AgentType.CODE)
        assert req.agent == AgentType.CODE

    def test_request_validation(self) -> None:
        """Test request validation."""
        with pytest.raises(ValueError):
            ChatRequest(message="")  # Empty message should fail


class TestChatResponse:
    """Tests for ChatResponse model."""

    def test_create_response(self) -> None:
        """Test creating a chat response."""
        resp = ChatResponse(
            message="Hello!",
            session_id="test-123",
            agent_used=AgentType.CHAT,
        )
        assert resp.message == "Hello!"
        assert resp.agent_used == AgentType.CHAT


class TestCommandRequest:
    """Tests for CommandRequest model."""

    def test_create_request(self) -> None:
        """Test creating a command request."""
        req = CommandRequest(
            command="list files",
            agent=AgentType.FILE,
        )
        assert req.command == "list files"
        assert req.agent == AgentType.FILE


class TestCommandResponse:
    """Tests for CommandResponse model."""

    def test_create_response(self) -> None:
        """Test creating a command response."""
        resp = CommandResponse(
            success=True,
            result="Files listed",
            agent=AgentType.FILE,
            execution_time=0.5,
        )
        assert resp.success is True
        assert resp.execution_time == 0.5


class TestDocument:
    """Tests for Document model."""

    def test_create_document(self) -> None:
        """Test creating a document."""
        doc = Document(
            id="doc-1",
            content="Test content",
            metadata={"source": "test"},
        )
        assert doc.id == "doc-1"
        assert doc.content == "Test content"

    def test_document_with_score(self) -> None:
        """Test document with score."""
        doc = Document(
            id="doc-1",
            content="Content",
            score=0.95,
        )
        assert doc.score == 0.95


class TestAgentInfo:
    """Tests for AgentInfo model."""

    def test_create_agent_info(self) -> None:
        """Test creating agent info."""
        info = AgentInfo(
            name=AgentType.CHAT,
            description="Chat agent",
            capabilities=["Conversation", "Q&A"],
            model="llama3.2",
        )
        assert info.name == AgentType.CHAT
        assert info.active is True


class TestHealthResponse:
    """Tests for HealthResponse model."""

    def test_create_health_response(self) -> None:
        """Test creating health response."""
        resp = HealthResponse(
            status="healthy",
            version="1.0.0",
            services={"ollama": True, "redis": True},
        )
        assert resp.status == "healthy"
        assert resp.services["ollama"] is True


class TestEmbedRequest:
    """Tests for EmbedRequest model."""

    def test_create_embed_request(self) -> None:
        """Test creating embed request."""
        req = EmbedRequest(texts=["Hello", "World"])
        assert len(req.texts) == 2

    def test_embed_request_validation(self) -> None:
        """Test embed request validation."""
        with pytest.raises(ValueError):
            EmbedRequest(texts=[])  # Empty list should fail


class TestEmbedResponse:
    """Tests for EmbedResponse model."""

    def test_create_embed_response(self) -> None:
        """Test creating embed response."""
        resp = EmbedResponse(
            embeddings=[[0.1, 0.2], [0.3, 0.4]],
            model="nomic-embed-text",
            dimensions=2,
        )
        assert len(resp.embeddings) == 2
        assert resp.dimensions == 2
