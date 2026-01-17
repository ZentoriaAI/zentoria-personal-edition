"""Tests for the agents."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from src.agents import (
    BaseAgent,
    ChatAgent,
    CodeAgent,
    FileAgent,
    KeyAgent,
    MailAgent,
    SearchAgent,
    SecurityAgent,
    WorkflowAgent,
)
from src.core.models import AgentType, Message, MessageRole


class TestChatAgent:
    """Tests for ChatAgent."""

    @pytest.fixture
    def agent(self) -> ChatAgent:
        """Create agent instance."""
        return ChatAgent()

    def test_agent_type(self, agent: ChatAgent) -> None:
        """Test agent type."""
        assert agent.agent_type == AgentType.CHAT

    def test_get_info(self, agent: ChatAgent) -> None:
        """Test get_info method."""
        info = agent.get_info()
        assert info.name == AgentType.CHAT
        assert info.active is True
        assert len(info.capabilities) > 0

    @pytest.mark.asyncio
    async def test_execute(self, agent: ChatAgent) -> None:
        """Test execute method."""
        with patch.object(agent, "_get_llm") as mock_get_llm:
            mock_llm = AsyncMock()
            mock_llm.chat.return_value = "Hello! How can I help you?"
            mock_get_llm.return_value = mock_llm

            response, metadata = await agent.execute("Hello")

            assert response == "Hello! How can I help you?"
            assert "model" in metadata

    @pytest.mark.asyncio
    async def test_invoke(self, agent: ChatAgent) -> None:
        """Test invoke method."""
        with patch.object(agent, "execute") as mock_execute:
            mock_execute.return_value = ("Response", {"key": "value"})

            result = await agent.invoke("Test message")

            assert result["success"] is True
            assert result["response"] == "Response"
            assert result["agent"] == AgentType.CHAT.value


class TestCodeAgent:
    """Tests for CodeAgent."""

    @pytest.fixture
    def agent(self) -> CodeAgent:
        """Create agent instance."""
        return CodeAgent()

    def test_agent_type(self, agent: CodeAgent) -> None:
        """Test agent type."""
        assert agent.agent_type == AgentType.CODE

    def test_extract_language_python(self, agent: CodeAgent) -> None:
        """Test Python language detection."""
        assert agent._extract_language("write python code") == "python"
        assert agent._extract_language("create a py script") == "python"

    def test_extract_language_javascript(self, agent: CodeAgent) -> None:
        """Test JavaScript language detection."""
        assert agent._extract_language("write javascript") == "javascript"
        assert agent._extract_language("create js function") == "javascript"

    def test_extract_language_none(self, agent: CodeAgent) -> None:
        """Test no language detection."""
        assert agent._extract_language("write some code") is None

    def test_extract_code_blocks(self, agent: CodeAgent) -> None:
        """Test code block extraction."""
        text = """Here is some code:
```python
print("hello")
```
And more:
```javascript
console.log("world");
```"""
        blocks = agent._extract_code_blocks(text)
        assert len(blocks) == 2
        assert blocks[0]["language"] == "python"
        assert blocks[1]["language"] == "javascript"


class TestFileAgent:
    """Tests for FileAgent."""

    @pytest.fixture
    def agent(self) -> FileAgent:
        """Create agent instance."""
        return FileAgent()

    def test_agent_type(self, agent: FileAgent) -> None:
        """Test agent type."""
        assert agent.agent_type == AgentType.FILE

    def test_format_result_list(self, agent: FileAgent) -> None:
        """Test format result for list operation."""
        result = {
            "path": "/home/user",
            "files": ["file1.txt", "file2.txt"],
        }
        output = agent._format_result("list", result)
        assert "file1.txt" in output
        assert "file2.txt" in output

    def test_format_result_simulated(self, agent: FileAgent) -> None:
        """Test format result for simulated operation."""
        result = {
            "simulated": True,
            "note": "MCP call would read: /test.txt",
        }
        output = agent._format_result("read", result)
        assert "[Simulated]" in output


class TestKeyAgent:
    """Tests for KeyAgent."""

    @pytest.fixture
    def agent(self) -> KeyAgent:
        """Create agent instance."""
        return KeyAgent()

    def test_agent_type(self, agent: KeyAgent) -> None:
        """Test agent type."""
        assert agent.agent_type == AgentType.KEY

    def test_generate_api_key(self, agent: KeyAgent) -> None:
        """Test API key generation."""
        key = agent._generate_api_key(prefix="test", length=16)
        assert key.startswith("test_")
        assert len(key) == len("test_") + 16

    def test_mask_key(self, agent: KeyAgent) -> None:
        """Test key masking."""
        key = "zk_abcdefghijklmnop"
        masked = agent._mask_key(key)
        assert masked.startswith("zk_abc")
        assert masked.endswith("mnop")
        assert "..." in masked


class TestMailAgent:
    """Tests for MailAgent."""

    @pytest.fixture
    def agent(self) -> MailAgent:
        """Create agent instance."""
        return MailAgent()

    def test_agent_type(self, agent: MailAgent) -> None:
        """Test agent type."""
        assert agent.agent_type == AgentType.MAIL

    def test_extract_email_addresses(self, agent: MailAgent) -> None:
        """Test email extraction."""
        text = "Send to john@example.com and cc jane@test.org"
        emails = agent._extract_email_addresses(text)
        assert "john@example.com" in emails
        assert "jane@test.org" in emails


class TestWorkflowAgent:
    """Tests for WorkflowAgent."""

    @pytest.fixture
    def agent(self) -> WorkflowAgent:
        """Create agent instance."""
        return WorkflowAgent()

    def test_agent_type(self, agent: WorkflowAgent) -> None:
        """Test agent type."""
        assert agent.agent_type == AgentType.WORKFLOW


class TestSecurityAgent:
    """Tests for SecurityAgent."""

    @pytest.fixture
    def agent(self) -> SecurityAgent:
        """Create agent instance."""
        return SecurityAgent()

    def test_agent_type(self, agent: SecurityAgent) -> None:
        """Test agent type."""
        assert agent.agent_type == AgentType.SECURITY


class TestSearchAgent:
    """Tests for SearchAgent."""

    @pytest.fixture
    def agent(self) -> SearchAgent:
        """Create agent instance."""
        return SearchAgent()

    def test_agent_type(self, agent: SearchAgent) -> None:
        """Test agent type."""
        assert agent.agent_type == AgentType.SEARCH
