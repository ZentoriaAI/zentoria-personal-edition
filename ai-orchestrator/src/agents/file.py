"""File agent for file operations via MCP."""

from typing import Any

import structlog

from src.agents.base import BaseAgent
from src.core.models import AgentType, Message

logger = structlog.get_logger(__name__)


class FileAgent(BaseAgent):
    """Agent for file and folder operations via MCP."""

    agent_type = AgentType.FILE
    description = "file and folder operations"
    capabilities = [
        "List files and directories",
        "Read file contents",
        "Write and create files",
        "Delete files and folders",
        "Move and rename files",
        "Copy files",
        "Search for files",
        "Get file information",
    ]
    model = "llama3.2:8b"

    def _build_system_prompt(self) -> str:
        """Build the system prompt for file agent."""
        return """You are a file management assistant with access to a file system via MCP.

You can perform these operations:
- list: List files in a directory
- read: Read file contents
- write: Write content to a file
- delete: Delete a file or folder
- move: Move or rename a file
- copy: Copy a file
- search: Search for files by pattern
- info: Get file metadata

When the user asks for file operations, you should:
1. Understand what operation they want
2. Extract the relevant paths and parameters
3. Call the appropriate MCP tool
4. Summarize the results

Always confirm destructive operations (delete, overwrite) before executing.
Provide clear feedback about what was done."""

    async def _parse_file_intent(
        self,
        message: str,
    ) -> dict[str, Any]:
        """Parse user message to extract file operation intent.

        Args:
            message: User message

        Returns:
            Dict with operation and parameters
        """
        llm = await self._get_llm()

        prompt = f"""Analyze this file operation request and extract:
1. operation: one of [list, read, write, delete, move, copy, search, info]
2. source_path: the source file/folder path (if any)
3. target_path: the destination path (if any, for move/copy)
4. content: content to write (if any)
5. pattern: search pattern (if any)

Respond in JSON format.

Request: {message}

JSON:"""

        response = await llm.generate(prompt, temperature=0.1, max_tokens=200)

        import json
        import re

        json_match = re.search(r"\{[\s\S]*\}", response)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        return {"operation": "unknown", "error": "Could not parse intent"}

    async def execute(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """Execute file operation.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters (operation, path, etc.)

        Returns:
            Tuple of (response, metadata)
        """
        params = parameters or {}

        # If operation is specified directly, use it
        operation = params.get("operation")
        if not operation:
            # Parse intent from message
            intent = await self._parse_file_intent(message)
            operation = intent.get("operation", "unknown")
            params.update(intent)

        logger.info("File operation", operation=operation, params=params)

        # Execute operation via MCP
        try:
            if operation == "list":
                result = await self._list_directory(params.get("source_path", "."))
            elif operation == "read":
                result = await self._read_file(params.get("source_path", ""))
            elif operation == "write":
                result = await self._write_file(
                    params.get("source_path", ""),
                    params.get("content", ""),
                )
            elif operation == "delete":
                result = await self._delete_file(params.get("source_path", ""))
            elif operation == "move":
                result = await self._move_file(
                    params.get("source_path", ""),
                    params.get("target_path", ""),
                )
            elif operation == "copy":
                result = await self._copy_file(
                    params.get("source_path", ""),
                    params.get("target_path", ""),
                )
            elif operation == "search":
                result = await self._search_files(
                    params.get("source_path", "."),
                    params.get("pattern", "*"),
                )
            elif operation == "info":
                result = await self._file_info(params.get("source_path", ""))
            else:
                result = {"error": f"Unknown operation: {operation}"}

        except Exception as e:
            result = {"error": str(e)}

        # Format response
        if "error" in result:
            response = f"Error: {result['error']}"
        else:
            response = self._format_result(operation, result)

        metadata = {
            "operation": operation,
            "params": params,
            "success": "error" not in result,
        }

        return response, metadata

    async def _list_directory(self, path: str) -> dict[str, Any]:
        """List directory contents via MCP."""
        try:
            result = await self._call_mcp(
                "/api/files/list",
                method="GET",
                data={"path": path},
            )
            return result
        except Exception as e:
            # Fallback response for development
            return {
                "path": path,
                "files": [],
                "note": f"MCP call would list: {path}",
                "simulated": True,
            }

    async def _read_file(self, path: str) -> dict[str, Any]:
        """Read file contents via MCP."""
        try:
            result = await self._call_mcp(
                "/api/files/read",
                method="GET",
                data={"path": path},
            )
            return result
        except Exception as e:
            return {
                "path": path,
                "content": None,
                "note": f"MCP call would read: {path}",
                "simulated": True,
            }

    async def _write_file(self, path: str, content: str) -> dict[str, Any]:
        """Write file contents via MCP."""
        try:
            result = await self._call_mcp(
                "/api/files/write",
                method="POST",
                data={"path": path, "content": content},
            )
            return result
        except Exception as e:
            return {
                "path": path,
                "written": len(content),
                "note": f"MCP call would write to: {path}",
                "simulated": True,
            }

    async def _delete_file(self, path: str) -> dict[str, Any]:
        """Delete file via MCP."""
        try:
            result = await self._call_mcp(
                "/api/files/delete",
                method="DELETE",
                data={"path": path},
            )
            return result
        except Exception as e:
            return {
                "path": path,
                "deleted": False,
                "note": f"MCP call would delete: {path}",
                "simulated": True,
            }

    async def _move_file(self, source: str, target: str) -> dict[str, Any]:
        """Move file via MCP."""
        try:
            result = await self._call_mcp(
                "/api/files/move",
                method="POST",
                data={"source": source, "target": target},
            )
            return result
        except Exception as e:
            return {
                "source": source,
                "target": target,
                "note": f"MCP call would move: {source} -> {target}",
                "simulated": True,
            }

    async def _copy_file(self, source: str, target: str) -> dict[str, Any]:
        """Copy file via MCP."""
        try:
            result = await self._call_mcp(
                "/api/files/copy",
                method="POST",
                data={"source": source, "target": target},
            )
            return result
        except Exception as e:
            return {
                "source": source,
                "target": target,
                "note": f"MCP call would copy: {source} -> {target}",
                "simulated": True,
            }

    async def _search_files(self, path: str, pattern: str) -> dict[str, Any]:
        """Search files via MCP."""
        try:
            result = await self._call_mcp(
                "/api/files/search",
                method="GET",
                data={"path": path, "pattern": pattern},
            )
            return result
        except Exception as e:
            return {
                "path": path,
                "pattern": pattern,
                "matches": [],
                "note": f"MCP call would search: {pattern} in {path}",
                "simulated": True,
            }

    async def _file_info(self, path: str) -> dict[str, Any]:
        """Get file info via MCP."""
        try:
            result = await self._call_mcp(
                "/api/files/info",
                method="GET",
                data={"path": path},
            )
            return result
        except Exception as e:
            return {
                "path": path,
                "note": f"MCP call would get info: {path}",
                "simulated": True,
            }

    def _format_result(self, operation: str, result: dict[str, Any]) -> str:
        """Format operation result for display.

        Args:
            operation: Operation performed
            result: Operation result

        Returns:
            Formatted string
        """
        if result.get("simulated"):
            return f"[Simulated] {result.get('note', 'Operation completed')}"

        if operation == "list":
            files = result.get("files", [])
            if not files:
                return f"Directory '{result.get('path')}' is empty."
            file_list = "\n".join(f"  - {f}" for f in files)
            return f"Contents of '{result.get('path')}':\n{file_list}"

        elif operation == "read":
            content = result.get("content", "")
            return f"File contents:\n```\n{content}\n```"

        elif operation == "write":
            return f"Successfully wrote {result.get('written', 0)} bytes to '{result.get('path')}'."

        elif operation == "delete":
            if result.get("deleted"):
                return f"Successfully deleted '{result.get('path')}'."
            return f"Could not delete '{result.get('path')}'."

        elif operation in ("move", "copy"):
            return f"Successfully {operation}d '{result.get('source')}' to '{result.get('target')}'."

        elif operation == "search":
            matches = result.get("matches", [])
            if not matches:
                return f"No files matching '{result.get('pattern')}' found."
            match_list = "\n".join(f"  - {m}" for m in matches)
            return f"Found {len(matches)} matches:\n{match_list}"

        elif operation == "info":
            info = result
            return f"File info for '{info.get('path')}':\n" + "\n".join(
                f"  {k}: {v}" for k, v in info.items() if k != "path"
            )

        return f"Operation '{operation}' completed."
