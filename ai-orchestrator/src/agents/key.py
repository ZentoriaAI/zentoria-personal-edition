"""Key agent for API key and credential management."""

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Any

import structlog

from src.agents.base import BaseAgent
from src.core.models import AgentType, Message

logger = structlog.get_logger(__name__)


class KeyAgent(BaseAgent):
    """Agent for API key creation and management."""

    agent_type = AgentType.KEY
    description = "API key and credential management"
    capabilities = [
        "Generate API keys",
        "List existing keys",
        "Revoke keys",
        "Rotate keys",
        "Set key permissions",
        "Set key expiration",
        "Check key status",
    ]
    model = "llama3.2:8b"

    def _build_system_prompt(self) -> str:
        """Build the system prompt for key agent."""
        return """You are a security-focused API key management assistant.

You help users:
- Generate new API keys with appropriate permissions
- List and review existing keys
- Revoke compromised or unused keys
- Rotate keys for security
- Set proper permissions and expiration dates

Security best practices you follow:
- Generate cryptographically secure keys
- Recommend short expiration periods
- Encourage minimal permissions (principle of least privilege)
- Warn about key exposure risks
- Never display full keys after initial creation

Always confirm destructive operations (revoke, delete) before executing."""

    def _generate_api_key(
        self,
        prefix: str = "zk",
        length: int = 32,
    ) -> str:
        """Generate a secure API key.

        Args:
            prefix: Key prefix
            length: Key length (excluding prefix)

        Returns:
            Generated API key
        """
        random_bytes = secrets.token_bytes(length)
        key_hash = hashlib.sha256(random_bytes).hexdigest()[:length]
        return f"{prefix}_{key_hash}"

    def _mask_key(self, key: str) -> str:
        """Mask an API key for display.

        Args:
            key: Full API key

        Returns:
            Masked key (e.g., zk_abc...xyz)
        """
        if len(key) < 10:
            return key[:2] + "..." + key[-2:]
        return key[:6] + "..." + key[-4:]

    async def _parse_key_intent(
        self,
        message: str,
    ) -> dict[str, Any]:
        """Parse user message to extract key management intent.

        Args:
            message: User message

        Returns:
            Dict with action and parameters
        """
        llm = await self._get_llm()

        prompt = f"""Analyze this API key management request and extract:
1. action: one of [generate, list, revoke, rotate, check, permissions]
2. key_name: name/label for the key (if any)
3. key_id: existing key ID (if any)
4. permissions: list of permissions (if any)
5. expiration: expiration period (if any, e.g., "30d", "1y")

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

        return {"action": "unknown"}

    async def execute(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """Execute key management operation.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters

        Returns:
            Tuple of (response, metadata)
        """
        params = parameters or {}

        if "action" not in params:
            intent = await self._parse_key_intent(message)
            params.update(intent)

        action = params.get("action", "unknown")
        logger.info("Key action", action=action, params=params)

        try:
            if action == "generate":
                result = await self._generate_key(params)
            elif action == "list":
                result = await self._list_keys(params)
            elif action == "revoke":
                result = await self._revoke_key(params)
            elif action == "rotate":
                result = await self._rotate_key(params)
            elif action == "check":
                result = await self._check_key(params)
            elif action == "permissions":
                result = await self._update_permissions(params)
            else:
                result = {
                    "message": "I can help you with API key management. What would you like to do?\n\n"
                    "- **Generate** a new API key\n"
                    "- **List** existing keys\n"
                    "- **Revoke** a key\n"
                    "- **Rotate** a key\n"
                    "- **Check** key status"
                }

        except Exception as e:
            result = {"error": str(e)}

        if "error" in result:
            response = f"Error: {result['error']}"
        else:
            response = result.get("message", "Key operation completed.")

        metadata = {
            "action": action,
            "success": "error" not in result,
        }

        return response, metadata

    async def _generate_key(self, params: dict[str, Any]) -> dict[str, Any]:
        """Generate a new API key.

        Args:
            params: Key parameters (name, permissions, expiration)

        Returns:
            Result dict
        """
        key_name = params.get("key_name", "default")
        permissions = params.get("permissions", ["read"])
        expiration = params.get("expiration", "90d")

        # Parse expiration
        exp_days = 90
        if expiration:
            if expiration.endswith("d"):
                exp_days = int(expiration[:-1])
            elif expiration.endswith("y"):
                exp_days = int(expiration[:-1]) * 365

        expires_at = datetime.utcnow() + timedelta(days=exp_days)

        # Generate key
        api_key = self._generate_api_key()

        try:
            # Store via MCP
            result = await self._call_mcp(
                "/api/keys/create",
                method="POST",
                data={
                    "name": key_name,
                    "key": api_key,
                    "permissions": permissions,
                    "expires_at": expires_at.isoformat(),
                },
            )
            stored = True
        except Exception:
            stored = False

        return {
            "message": f"**New API Key Generated**\n\n"
            f"**Name:** {key_name}\n"
            f"**Key:** `{api_key}`\n"
            f"**Permissions:** {', '.join(permissions)}\n"
            f"**Expires:** {expires_at.strftime('%Y-%m-%d')}\n\n"
            f"{'Key stored successfully.' if stored else '[Simulated] Key would be stored in vault.'}\n\n"
            f"⚠️ **Important:** Save this key now. It will not be shown again.",
            "key": api_key,
            "masked_key": self._mask_key(api_key),
            "stored": stored,
        }

    async def _list_keys(self, params: dict[str, Any]) -> dict[str, Any]:
        """List existing API keys.

        Args:
            params: List parameters

        Returns:
            Result dict
        """
        try:
            result = await self._call_mcp(
                "/api/keys/list",
                method="GET",
            )
            keys = result.get("keys", [])

            if not keys:
                return {"message": "No API keys found."}

            key_list = "\n".join(
                f"- **{k.get('name', 'Unnamed')}** ({self._mask_key(k.get('key', ''))}) - "
                f"{k.get('status', 'active')} - Expires: {k.get('expires_at', 'Never')}"
                for k in keys
            )
            return {"message": f"**Your API Keys:**\n\n{key_list}"}

        except Exception:
            return {
                "message": "[Simulated] Would list your API keys:\n\n"
                "- **production** (zk_abc...def) - active - Expires: 2026-04-15\n"
                "- **development** (zk_123...789) - active - Expires: 2026-02-01\n"
                "- **testing** (zk_xyz...uvw) - revoked",
                "simulated": True,
            }

    async def _revoke_key(self, params: dict[str, Any]) -> dict[str, Any]:
        """Revoke an API key.

        Args:
            params: Key parameters (key_id or key_name)

        Returns:
            Result dict
        """
        key_id = params.get("key_id") or params.get("key_name")
        if not key_id:
            return {"error": "Please specify which key to revoke (by name or ID)"}

        try:
            result = await self._call_mcp(
                "/api/keys/revoke",
                method="POST",
                data={"key_id": key_id},
            )
            return {"message": f"API key '{key_id}' has been revoked."}
        except Exception:
            return {
                "message": f"[Simulated] Would revoke API key '{key_id}'.\n\n"
                "⚠️ This action is irreversible. Any applications using this key will stop working.",
                "simulated": True,
            }

    async def _rotate_key(self, params: dict[str, Any]) -> dict[str, Any]:
        """Rotate an API key.

        Args:
            params: Key parameters

        Returns:
            Result dict with new key
        """
        key_id = params.get("key_id") or params.get("key_name")
        if not key_id:
            return {"error": "Please specify which key to rotate (by name or ID)"}

        new_key = self._generate_api_key()

        try:
            result = await self._call_mcp(
                "/api/keys/rotate",
                method="POST",
                data={"key_id": key_id, "new_key": new_key},
            )
            rotated = True
        except Exception:
            rotated = False

        return {
            "message": f"**Key Rotated**\n\n"
            f"**Name:** {key_id}\n"
            f"**New Key:** `{new_key}`\n\n"
            f"{'Key rotated successfully.' if rotated else '[Simulated] Key would be rotated.'}\n\n"
            f"⚠️ **Important:** Update your applications with the new key. "
            f"The old key will be revoked.",
            "key": new_key,
            "masked_key": self._mask_key(new_key),
        }

    async def _check_key(self, params: dict[str, Any]) -> dict[str, Any]:
        """Check API key status.

        Args:
            params: Key parameters

        Returns:
            Result dict
        """
        key_id = params.get("key_id") or params.get("key_name")
        if not key_id:
            return {"error": "Please specify which key to check"}

        try:
            result = await self._call_mcp(
                "/api/keys/check",
                method="GET",
                data={"key_id": key_id},
            )
            key_info = result

            return {
                "message": f"**Key Status: {key_id}**\n\n"
                f"- Status: {key_info.get('status', 'unknown')}\n"
                f"- Created: {key_info.get('created_at', 'Unknown')}\n"
                f"- Expires: {key_info.get('expires_at', 'Never')}\n"
                f"- Last used: {key_info.get('last_used', 'Never')}\n"
                f"- Permissions: {', '.join(key_info.get('permissions', []))}"
            }
        except Exception:
            return {
                "message": f"[Simulated] Key '{key_id}' status:\n\n"
                f"- Status: active\n"
                f"- Created: 2026-01-01\n"
                f"- Expires: 2026-04-01\n"
                f"- Last used: 2026-01-15\n"
                f"- Permissions: read, write",
                "simulated": True,
            }

    async def _update_permissions(self, params: dict[str, Any]) -> dict[str, Any]:
        """Update key permissions.

        Args:
            params: Key parameters with new permissions

        Returns:
            Result dict
        """
        key_id = params.get("key_id") or params.get("key_name")
        permissions = params.get("permissions", [])

        if not key_id:
            return {"error": "Please specify which key to update"}
        if not permissions:
            return {"error": "Please specify the new permissions"}

        try:
            result = await self._call_mcp(
                "/api/keys/permissions",
                method="PUT",
                data={"key_id": key_id, "permissions": permissions},
            )
            return {
                "message": f"Permissions updated for '{key_id}':\n"
                f"New permissions: {', '.join(permissions)}"
            }
        except Exception:
            return {
                "message": f"[Simulated] Would update permissions for '{key_id}' to: {', '.join(permissions)}",
                "simulated": True,
            }
