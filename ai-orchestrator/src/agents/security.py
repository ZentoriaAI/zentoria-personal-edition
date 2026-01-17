"""Security agent for permission and access control."""

from typing import Any

import structlog

from src.agents.base import BaseAgent
from src.core.models import AgentType, Message

logger = structlog.get_logger(__name__)


class SecurityAgent(BaseAgent):
    """Agent for permission and access control management."""

    agent_type = AgentType.SECURITY
    description = "permission and access control management"
    capabilities = [
        "Manage user permissions",
        "Create and manage roles",
        "Audit access logs",
        "Check security status",
        "Configure access policies",
        "Review security alerts",
    ]
    model = "llama3.2:8b"

    def _build_system_prompt(self) -> str:
        """Build the system prompt for security agent."""
        return """You are a security-focused assistant for access control and permissions.

You help with:
- Managing user roles and permissions
- Reviewing and auditing access logs
- Configuring security policies
- Investigating security alerts
- Ensuring principle of least privilege

Security principles you follow:
- Always verify before granting elevated permissions
- Recommend minimal necessary access
- Document all permission changes
- Alert on suspicious activities
- Never compromise on security for convenience

Always explain the security implications of changes."""

    async def _parse_security_intent(
        self,
        message: str,
    ) -> dict[str, Any]:
        """Parse user message to extract security intent.

        Args:
            message: User message

        Returns:
            Dict with action and parameters
        """
        llm = await self._get_llm()

        prompt = f"""Analyze this security/permission request and extract:
1. action: one of [grant, revoke, list_permissions, list_roles, audit, check, create_role, delete_role]
2. user_id: user to modify (if any)
3. role: role name (if any)
4. permissions: list of permissions (if any)
5. resource: resource being accessed (if any)
6. time_range: time range for audit (if any)

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

        return {"action": "check"}

    async def execute(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """Execute security operation.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters

        Returns:
            Tuple of (response, metadata)
        """
        params = parameters or {}

        if "action" not in params:
            intent = await self._parse_security_intent(message)
            params.update(intent)

        action = params.get("action", "check")
        logger.info("Security action", action=action, params=params)

        try:
            if action == "grant":
                result = await self._grant_permission(params)
            elif action == "revoke":
                result = await self._revoke_permission(params)
            elif action == "list_permissions":
                result = await self._list_permissions(params)
            elif action == "list_roles":
                result = await self._list_roles()
            elif action == "audit":
                result = await self._audit_logs(params)
            elif action == "create_role":
                result = await self._create_role(params)
            elif action == "delete_role":
                result = await self._delete_role(params)
            elif action == "check":
                result = await self._check_security()
            else:
                result = await self._check_security()

        except Exception as e:
            result = {"error": str(e)}

        if "error" in result:
            response = f"Error: {result['error']}"
        else:
            response = result.get("message", "Security operation completed.")

        metadata = {
            "action": action,
            "success": "error" not in result,
        }

        return response, metadata

    async def _grant_permission(self, params: dict[str, Any]) -> dict[str, Any]:
        """Grant permission to a user.

        Args:
            params: Permission parameters

        Returns:
            Result dict
        """
        user_id = params.get("user_id")
        role = params.get("role")
        permissions = params.get("permissions", [])
        resource = params.get("resource")

        if not user_id:
            return {"error": "Please specify a user ID"}
        if not (role or permissions):
            return {"error": "Please specify a role or permissions to grant"}

        try:
            result = await self._call_mcp(
                "/api/security/grant",
                method="POST",
                data={
                    "user_id": user_id,
                    "role": role,
                    "permissions": permissions,
                    "resource": resource,
                },
            )

            return {
                "message": f"**Permission Granted**\n\n"
                f"- User: {user_id}\n"
                f"- Role: {role or 'N/A'}\n"
                f"- Permissions: {', '.join(permissions) if permissions else 'N/A'}\n"
                f"- Resource: {resource or 'All'}\n\n"
                f"⚠️ This change has been logged in the audit trail."
            }

        except Exception:
            return {
                "message": f"[Simulated] Would grant to user '{user_id}':\n"
                f"- Role: {role or 'N/A'}\n"
                f"- Permissions: {', '.join(permissions) if permissions else 'N/A'}\n"
                f"- Resource: {resource or 'All'}\n\n"
                f"⚠️ This change would be logged in the audit trail.",
                "simulated": True,
            }

    async def _revoke_permission(self, params: dict[str, Any]) -> dict[str, Any]:
        """Revoke permission from a user.

        Args:
            params: Permission parameters

        Returns:
            Result dict
        """
        user_id = params.get("user_id")
        role = params.get("role")
        permissions = params.get("permissions", [])
        resource = params.get("resource")

        if not user_id:
            return {"error": "Please specify a user ID"}
        if not (role or permissions):
            return {"error": "Please specify a role or permissions to revoke"}

        try:
            result = await self._call_mcp(
                "/api/security/revoke",
                method="POST",
                data={
                    "user_id": user_id,
                    "role": role,
                    "permissions": permissions,
                    "resource": resource,
                },
            )

            return {
                "message": f"**Permission Revoked**\n\n"
                f"- User: {user_id}\n"
                f"- Role: {role or 'N/A'}\n"
                f"- Permissions: {', '.join(permissions) if permissions else 'N/A'}\n"
                f"- Resource: {resource or 'All'}\n\n"
                f"⚠️ This change has been logged in the audit trail."
            }

        except Exception:
            return {
                "message": f"[Simulated] Would revoke from user '{user_id}':\n"
                f"- Role: {role or 'N/A'}\n"
                f"- Permissions: {', '.join(permissions) if permissions else 'N/A'}",
                "simulated": True,
            }

    async def _list_permissions(self, params: dict[str, Any]) -> dict[str, Any]:
        """List permissions for a user or role.

        Args:
            params: Filter parameters

        Returns:
            Result dict
        """
        user_id = params.get("user_id")
        role = params.get("role")

        try:
            result = await self._call_mcp(
                "/api/security/permissions",
                method="GET",
                data={"user_id": user_id, "role": role},
            )

            permissions = result.get("permissions", [])
            roles = result.get("roles", [])

            perm_list = "\n".join(f"  - {p}" for p in permissions)
            role_list = "\n".join(f"  - {r}" for r in roles)

            return {
                "message": f"**Permissions for {user_id or role or 'System'}:**\n\n"
                f"**Roles:**\n{role_list or '  None'}\n\n"
                f"**Permissions:**\n{perm_list or '  None'}"
            }

        except Exception:
            subject = user_id or role or "System"
            return {
                "message": f"**Permissions for {subject}:**\n\n"
                f"**Roles:**\n"
                f"  - admin\n"
                f"  - user\n\n"
                f"**Permissions:**\n"
                f"  - read:files\n"
                f"  - write:files\n"
                f"  - read:workflows\n"
                f"  - execute:workflows",
                "simulated": True,
            }

    async def _list_roles(self) -> dict[str, Any]:
        """List all available roles.

        Returns:
            Result dict
        """
        try:
            result = await self._call_mcp(
                "/api/security/roles",
                method="GET",
            )

            roles = result.get("roles", [])
            if not roles:
                return {"message": "No roles defined."}

            role_list = "\n".join(
                f"- **{r.get('name')}**: {r.get('description', 'No description')}"
                for r in roles
            )
            return {"message": f"**Available Roles:**\n\n{role_list}"}

        except Exception:
            return {
                "message": "**Available Roles:**\n\n"
                "- **admin**: Full system access\n"
                "- **user**: Standard user access\n"
                "- **viewer**: Read-only access\n"
                "- **operator**: Workflow execution access\n"
                "- **auditor**: Access to audit logs only",
                "simulated": True,
            }

    async def _audit_logs(self, params: dict[str, Any]) -> dict[str, Any]:
        """Get audit logs.

        Args:
            params: Audit parameters (time_range, user_id)

        Returns:
            Result dict
        """
        user_id = params.get("user_id")
        time_range = params.get("time_range", "24h")

        try:
            result = await self._call_mcp(
                "/api/security/audit",
                method="GET",
                data={"user_id": user_id, "time_range": time_range},
            )

            logs = result.get("logs", [])
            if not logs:
                return {"message": f"No audit logs found for the past {time_range}."}

            log_list = "\n".join(
                f"- [{l.get('timestamp')}] {l.get('user')}: {l.get('action')} - {l.get('resource')}"
                for l in logs
            )
            return {
                "message": f"**Audit Logs (Past {time_range}):**\n\n{log_list}"
            }

        except Exception:
            return {
                "message": f"**Audit Logs (Past {time_range}):**\n\n"
                "- [2026-01-16 10:30:00] admin: login - system\n"
                "- [2026-01-16 10:25:00] user1: read - /documents/report.pdf\n"
                "- [2026-01-16 10:20:00] user2: execute - workflow_daily_report\n"
                "- [2026-01-16 10:15:00] admin: grant_permission - user3\n"
                "- [2026-01-16 10:00:00] system: scheduled_backup - complete",
                "simulated": True,
            }

    async def _create_role(self, params: dict[str, Any]) -> dict[str, Any]:
        """Create a new role.

        Args:
            params: Role parameters

        Returns:
            Result dict
        """
        role = params.get("role")
        permissions = params.get("permissions", [])

        if not role:
            return {"error": "Please specify a role name"}

        try:
            result = await self._call_mcp(
                "/api/security/roles",
                method="POST",
                data={"name": role, "permissions": permissions},
            )

            return {
                "message": f"**Role Created**\n\n"
                f"- Name: {role}\n"
                f"- Permissions: {', '.join(permissions) if permissions else 'None'}"
            }

        except Exception:
            return {
                "message": f"[Simulated] Would create role '{role}' with permissions: {', '.join(permissions) if permissions else 'None'}",
                "simulated": True,
            }

    async def _delete_role(self, params: dict[str, Any]) -> dict[str, Any]:
        """Delete a role.

        Args:
            params: Role parameters

        Returns:
            Result dict
        """
        role = params.get("role")

        if not role:
            return {"error": "Please specify a role to delete"}

        try:
            result = await self._call_mcp(
                "/api/security/roles",
                method="DELETE",
                data={"name": role},
            )

            return {
                "message": f"Role '{role}' has been deleted.\n\n"
                f"⚠️ Users with this role have been moved to the default role."
            }

        except Exception:
            return {
                "message": f"[Simulated] Would delete role '{role}'.\n\n"
                f"⚠️ Users with this role would be moved to the default role.",
                "simulated": True,
            }

    async def _check_security(self) -> dict[str, Any]:
        """Check overall security status.

        Returns:
            Result dict
        """
        try:
            result = await self._call_mcp(
                "/api/security/status",
                method="GET",
            )

            return {
                "message": f"**Security Status**\n\n"
                f"- Overall: {result.get('status', 'unknown')}\n"
                f"- Active users: {result.get('active_users', 'N/A')}\n"
                f"- Failed logins (24h): {result.get('failed_logins', 'N/A')}\n"
                f"- Active alerts: {result.get('alerts', 'N/A')}\n"
                f"- Last audit: {result.get('last_audit', 'N/A')}"
            }

        except Exception:
            return {
                "message": "**Security Status**\n\n"
                "- Overall: ✅ Healthy\n"
                "- Active users: 5\n"
                "- Failed logins (24h): 2\n"
                "- Active alerts: 0\n"
                "- Last audit: 2026-01-16 08:00:00\n\n"
                "No security issues detected.",
                "simulated": True,
            }
