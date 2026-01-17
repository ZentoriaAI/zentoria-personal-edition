"""Tests for API endpoints."""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from src.core.models import AgentType


class TestHealthEndpoint:
    """Tests for health endpoint."""

    def test_health_check(self, client: TestClient) -> None:
        """Test health check returns status."""
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "version" in data
        assert "services" in data


class TestAgentsEndpoint:
    """Tests for agents endpoint."""

    def test_list_agents(self, client: TestClient) -> None:
        """Test listing all agents."""
        response = client.get("/api/v1/agents")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 8  # 8 agents

        agent_names = [a["name"] for a in data]
        assert "chat" in agent_names
        assert "code" in agent_names
        assert "file" in agent_names


class TestChatEndpoint:
    """Tests for chat endpoint."""

    def test_chat_basic(
        self,
        client: TestClient,
        mock_llm_client: AsyncMock,
        mock_context_manager: AsyncMock,
        mock_command_router: AsyncMock,
    ) -> None:
        """Test basic chat request."""
        with patch("src.api.routes.get_command_router", return_value=mock_command_router):
            with patch("src.api.routes.get_context_manager", return_value=mock_context_manager):
                with patch("src.api.routes.get_agent") as mock_get_agent:
                    mock_agent = AsyncMock()
                    mock_agent.execute.return_value = ("Test response", {})
                    mock_agent.close.return_value = None
                    mock_get_agent.return_value = mock_agent

                    response = client.post(
                        "/api/v1/chat",
                        json={"message": "Hello", "stream": False},
                    )

                    assert response.status_code == 200
                    data = response.json()
                    assert "message" in data
                    assert "session_id" in data

    def test_chat_with_agent(
        self,
        client: TestClient,
        mock_context_manager: AsyncMock,
    ) -> None:
        """Test chat with specific agent."""
        with patch("src.api.routes.get_context_manager", return_value=mock_context_manager):
            with patch("src.api.routes.get_agent") as mock_get_agent:
                mock_agent = AsyncMock()
                mock_agent.execute.return_value = ("Code response", {"model": "codellama"})
                mock_agent.close.return_value = None
                mock_get_agent.return_value = mock_agent

                response = client.post(
                    "/api/v1/chat",
                    json={
                        "message": "Write Python code",
                        "agent": "code",
                        "stream": False,
                    },
                )

                assert response.status_code == 200
                data = response.json()
                assert data["agent_used"] == "code"

    def test_chat_stream_redirect(
        self,
        client: TestClient,
        mock_command_router: AsyncMock,
        mock_context_manager: AsyncMock,
    ) -> None:
        """Test that streaming redirects to stream endpoint."""
        with patch("src.api.routes.get_command_router", return_value=mock_command_router):
            with patch("src.api.routes.get_context_manager", return_value=mock_context_manager):
                response = client.post(
                    "/api/v1/chat",
                    json={"message": "Hello", "stream": True},
                )
                # Should return error directing to stream endpoint
                assert response.status_code == 400


class TestCommandEndpoint:
    """Tests for command endpoint."""

    def test_execute_command(
        self,
        client: TestClient,
        mock_context_manager: AsyncMock,
    ) -> None:
        """Test direct command execution."""
        with patch("src.api.routes.get_context_manager", return_value=mock_context_manager):
            with patch("src.api.routes.get_agent") as mock_get_agent:
                mock_agent = AsyncMock()
                mock_agent.invoke.return_value = {
                    "success": True,
                    "response": "Command executed",
                    "agent": "file",
                    "metadata": {},
                }
                mock_agent.close.return_value = None
                mock_get_agent.return_value = mock_agent

                response = client.post(
                    "/api/v1/command",
                    json={
                        "command": "list files",
                        "agent": "file",
                    },
                )

                assert response.status_code == 200
                data = response.json()
                assert data["success"] is True


class TestEmbedEndpoint:
    """Tests for embed endpoint."""

    def test_generate_embeddings(
        self,
        client: TestClient,
        mock_llm_client: AsyncMock,
    ) -> None:
        """Test embedding generation."""
        with patch("src.api.routes.get_llm_client", return_value=mock_llm_client):
            response = client.post(
                "/api/v1/embed",
                json={"texts": ["Hello world", "Test text"]},
            )

            assert response.status_code == 200
            data = response.json()
            assert "embeddings" in data
            assert "model" in data


class TestContextEndpoint:
    """Tests for context endpoint."""

    def test_get_context(
        self,
        client: TestClient,
        mock_context_manager: AsyncMock,
    ) -> None:
        """Test getting conversation context."""
        with patch("src.api.routes.get_context_manager", return_value=mock_context_manager):
            response = client.get("/api/v1/context/test-session")

            assert response.status_code == 200
            data = response.json()
            assert data["session_id"] == "test-session"

    def test_clear_context(
        self,
        client: TestClient,
        mock_context_manager: AsyncMock,
    ) -> None:
        """Test clearing conversation context."""
        with patch("src.api.routes.get_context_manager", return_value=mock_context_manager):
            response = client.delete("/api/v1/context/test-session")

            assert response.status_code == 200
            data = response.json()
            assert "cleared" in data["message"].lower()


class TestSearchEndpoint:
    """Tests for search endpoint."""

    def test_search_documents(
        self,
        client: TestClient,
        mock_rag_pipeline: AsyncMock,
    ) -> None:
        """Test document search."""
        with patch("src.api.routes.get_rag_pipeline", return_value=mock_rag_pipeline):
            response = client.post(
                "/api/v1/search",
                json={"query": "test query"},
            )

            assert response.status_code == 200
            data = response.json()
            assert "results" in data
            assert "count" in data

    def test_search_requires_query(
        self,
        client: TestClient,
        mock_rag_pipeline: AsyncMock,
    ) -> None:
        """Test search requires query."""
        with patch("src.api.routes.get_rag_pipeline", return_value=mock_rag_pipeline):
            response = client.post(
                "/api/v1/search",
                json={},
            )

            assert response.status_code == 400


class TestIndexEndpoint:
    """Tests for index endpoint."""

    def test_index_document(
        self,
        client: TestClient,
        mock_rag_pipeline: AsyncMock,
    ) -> None:
        """Test document indexing."""
        with patch("src.api.routes.get_rag_pipeline", return_value=mock_rag_pipeline):
            response = client.post(
                "/api/v1/index",
                json={
                    "doc_id": "test-doc",
                    "content": "This is test content.",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert data["doc_id"] == "test-doc"
            assert data["status"] == "indexed"

    def test_delete_document(
        self,
        client: TestClient,
        mock_rag_pipeline: AsyncMock,
    ) -> None:
        """Test document deletion."""
        with patch("src.api.routes.get_rag_pipeline", return_value=mock_rag_pipeline):
            response = client.delete("/api/v1/index/test-doc")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "deleted"


class TestRootEndpoint:
    """Tests for root endpoint."""

    def test_root(self, client: TestClient) -> None:
        """Test root endpoint."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data
        assert "endpoints" in data
