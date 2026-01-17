"""Tests for the command router."""

import pytest
from unittest.mock import AsyncMock, patch

from src.core.models import AgentType, Message, MessageRole
from src.core.router import CommandRouter, INTENT_PATTERNS


class TestCommandRouter:
    """Tests for CommandRouter."""

    @pytest.fixture
    def router(self) -> CommandRouter:
        """Create router instance."""
        return CommandRouter()

    def test_pattern_match_file_operations(self, router: CommandRouter) -> None:
        """Test pattern matching for file operations."""
        test_cases = [
            ("read the file contents", AgentType.FILE),
            ("create a new folder", AgentType.FILE),
            ("delete file.txt", AgentType.FILE),
            ("list files in directory", AgentType.FILE),
        ]

        for text, expected in test_cases:
            scores = router._pattern_match(text)
            assert AgentType.FILE in scores, f"Expected FILE for: {text}"

    def test_pattern_match_email_operations(self, router: CommandRouter) -> None:
        """Test pattern matching for email operations."""
        test_cases = [
            ("send an email to john", AgentType.MAIL),
            ("check my inbox", AgentType.MAIL),
            ("compose a message", AgentType.MAIL),
            ("email test@example.com", AgentType.MAIL),
        ]

        for text, expected in test_cases:
            scores = router._pattern_match(text)
            assert AgentType.MAIL in scores, f"Expected MAIL for: {text}"

    def test_pattern_match_code_operations(self, router: CommandRouter) -> None:
        """Test pattern matching for code operations."""
        test_cases = [
            ("write python code", AgentType.CODE),
            ("debug this function", AgentType.CODE),
            ("review the javascript", AgentType.CODE),
            ("```python\nprint('hello')```", AgentType.CODE),
        ]

        for text, expected in test_cases:
            scores = router._pattern_match(text)
            assert AgentType.CODE in scores, f"Expected CODE for: {text}"

    def test_pattern_match_key_operations(self, router: CommandRouter) -> None:
        """Test pattern matching for key operations."""
        test_cases = [
            ("generate api key", AgentType.KEY),
            ("create new token", AgentType.KEY),
            ("rotate my secret", AgentType.KEY),
        ]

        for text, expected in test_cases:
            scores = router._pattern_match(text)
            assert AgentType.KEY in scores, f"Expected KEY for: {text}"

    def test_pattern_match_workflow_operations(self, router: CommandRouter) -> None:
        """Test pattern matching for workflow operations."""
        test_cases = [
            ("trigger the workflow", AgentType.WORKFLOW),
            ("run the n8n automation", AgentType.WORKFLOW),
            ("schedule a job", AgentType.WORKFLOW),
        ]

        for text, expected in test_cases:
            scores = router._pattern_match(text)
            assert AgentType.WORKFLOW in scores, f"Expected WORKFLOW for: {text}"

    def test_pattern_match_security_operations(self, router: CommandRouter) -> None:
        """Test pattern matching for security operations."""
        test_cases = [
            ("check permissions", AgentType.SECURITY),
            ("audit the access log", AgentType.SECURITY),
            ("grant admin role", AgentType.SECURITY),
        ]

        for text, expected in test_cases:
            scores = router._pattern_match(text)
            assert AgentType.SECURITY in scores, f"Expected SECURITY for: {text}"

    def test_pattern_match_search_operations(self, router: CommandRouter) -> None:
        """Test pattern matching for search operations."""
        test_cases = [
            ("search for documents", AgentType.SEARCH),
            ("find information about", AgentType.SEARCH),
            ("what is machine learning?", AgentType.SEARCH),
        ]

        for text, expected in test_cases:
            scores = router._pattern_match(text)
            assert AgentType.SEARCH in scores, f"Expected SEARCH for: {text}"

    def test_resolve_conflicts_with_priorities(self, router: CommandRouter) -> None:
        """Test conflict resolution with priorities."""
        # CODE has higher priority than SEARCH
        scores = {AgentType.CODE: 2, AgentType.SEARCH: 2}
        result = router._resolve_conflicts(scores)
        assert result == AgentType.CODE

        # FILE has higher priority than CHAT
        scores = {AgentType.FILE: 1, AgentType.CHAT: 1}
        result = router._resolve_conflicts(scores)
        assert result == AgentType.FILE

    def test_resolve_conflicts_empty(self, router: CommandRouter) -> None:
        """Test conflict resolution with empty scores."""
        result = router._resolve_conflicts({})
        assert result == AgentType.CHAT

    @pytest.mark.asyncio
    async def test_route_with_force_agent(self, router: CommandRouter) -> None:
        """Test routing with forced agent."""
        agent, meta = await router.route(
            "any message",
            force_agent=AgentType.CODE,
        )
        assert agent == AgentType.CODE
        assert meta["method"] == "forced"
        assert meta["confidence"] == 1.0

    @pytest.mark.asyncio
    async def test_route_with_clear_pattern(self, router: CommandRouter) -> None:
        """Test routing with clear pattern match."""
        agent, meta = await router.route("read the file contents.txt")
        assert agent == AgentType.FILE
        assert meta["method"] in ["pattern", "priority_weighted"]

    @pytest.mark.asyncio
    async def test_route_defaults_to_chat(self, router: CommandRouter) -> None:
        """Test routing defaults to chat for ambiguous input."""
        with patch.object(router, "_llm_classify", return_value=None):
            agent, meta = await router.route("xyz123 random gibberish")
            assert agent == AgentType.CHAT
            assert meta["method"] in ["default", "llm", "pattern"]

    def test_extract_entities_emails(self, router: CommandRouter) -> None:
        """Test email extraction."""
        text = "Send to john@example.com and jane@test.org"
        entities = router.extract_entities(text)
        assert "john@example.com" in entities["emails"]
        assert "jane@test.org" in entities["emails"]

    def test_extract_entities_urls(self, router: CommandRouter) -> None:
        """Test URL extraction."""
        text = "Visit https://example.com and http://test.org/path"
        entities = router.extract_entities(text)
        assert "https://example.com" in entities["urls"]
        assert "http://test.org/path" in entities["urls"]

    def test_extract_entities_file_paths(self, router: CommandRouter) -> None:
        """Test file path extraction."""
        text = "Open /home/user/file.txt or C:\\Users\\test.doc"
        entities = router.extract_entities(text)
        assert len(entities["file_paths"]) >= 1

    def test_extract_entities_numbers(self, router: CommandRouter) -> None:
        """Test number extraction."""
        text = "The value is 42 and 3.14"
        entities = router.extract_entities(text)
        assert "42" in entities["numbers"]
        assert "3.14" in entities["numbers"]
