"""Mail agent for email operations."""

import re
from typing import Any

import structlog

from src.agents.base import BaseAgent
from src.core.models import AgentType, Message

logger = structlog.get_logger(__name__)


class MailAgent(BaseAgent):
    """Agent for email sending and management."""

    agent_type = AgentType.MAIL
    description = "email sending and management"
    capabilities = [
        "Send emails",
        "Compose email drafts",
        "List inbox messages",
        "Search emails",
        "Format email content",
        "Add attachments",
    ]
    model = "llama3.2:8b"

    def _build_system_prompt(self) -> str:
        """Build the system prompt for mail agent."""
        return """You are an email assistant that helps compose and send emails.

You can:
- Compose professional emails
- Send emails to specified recipients
- Help format email content
- Suggest subject lines
- Review and improve draft emails

When composing emails:
- Be professional and clear
- Use appropriate greeting and closing
- Structure content logically
- Keep it concise but complete

When the user wants to send an email, extract:
1. Recipients (to, cc, bcc)
2. Subject
3. Body content

Always confirm before sending."""

    def _extract_email_addresses(self, text: str) -> list[str]:
        """Extract email addresses from text.

        Args:
            text: Text to search

        Returns:
            List of email addresses
        """
        pattern = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
        return re.findall(pattern, text)

    async def _parse_email_intent(
        self,
        message: str,
    ) -> dict[str, Any]:
        """Parse user message to extract email intent.

        Args:
            message: User message

        Returns:
            Dict with email parameters
        """
        llm = await self._get_llm()

        prompt = f"""Analyze this email request and extract:
1. action: one of [send, compose, list, search, draft]
2. to: list of recipient email addresses
3. cc: list of CC addresses (if any)
4. subject: email subject
5. body: email body content
6. query: search query (if searching)

Respond in JSON format.

Request: {message}

JSON:"""

        response = await llm.generate(prompt, temperature=0.1, max_tokens=500)

        import json

        json_match = re.search(r"\{[\s\S]*\}", response)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        # Fallback: try to extract emails from message
        emails = self._extract_email_addresses(message)
        return {
            "action": "compose" if emails else "unknown",
            "to": emails,
            "subject": "",
            "body": message,
        }

    async def execute(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """Execute email operation.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters (to, subject, body, etc.)

        Returns:
            Tuple of (response, metadata)
        """
        params = parameters or {}

        # If not directly specified, parse from message
        if "action" not in params:
            intent = await self._parse_email_intent(message)
            params.update(intent)

        action = params.get("action", "compose")
        logger.info("Mail action", action=action, params=params)

        try:
            if action == "send":
                result = await self._send_email(params)
            elif action in ("compose", "draft"):
                result = await self._compose_email(message, params)
            elif action == "list":
                result = await self._list_emails(params)
            elif action == "search":
                result = await self._search_emails(params)
            else:
                # Default to composing help
                result = await self._compose_email(message, params)

        except Exception as e:
            result = {"error": str(e)}

        if "error" in result:
            response = f"Error: {result['error']}"
        else:
            response = result.get("message", "Email operation completed.")

        metadata = {
            "action": action,
            "params": {k: v for k, v in params.items() if k != "body"},
            "success": "error" not in result,
        }

        return response, metadata

    async def _send_email(self, params: dict[str, Any]) -> dict[str, Any]:
        """Send email via MCP.

        Args:
            params: Email parameters

        Returns:
            Result dict
        """
        to = params.get("to", [])
        subject = params.get("subject", "")
        body = params.get("body", "")

        if not to:
            return {"error": "No recipients specified"}
        if not subject:
            return {"error": "No subject specified"}
        if not body:
            return {"error": "No email body specified"}

        try:
            result = await self._call_mcp(
                "/api/mail/send",
                method="POST",
                data={
                    "to": to if isinstance(to, list) else [to],
                    "cc": params.get("cc", []),
                    "bcc": params.get("bcc", []),
                    "subject": subject,
                    "body": body,
                    "html": params.get("html", False),
                },
            )
            return {
                "message": f"Email sent successfully to {', '.join(to)}",
                "result": result,
            }
        except Exception as e:
            # Simulated response for development
            return {
                "message": f"[Simulated] Would send email:\nTo: {', '.join(to)}\nSubject: {subject}\n\n{body[:200]}...",
                "simulated": True,
            }

    async def _compose_email(
        self,
        user_request: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """Compose an email using LLM.

        Args:
            user_request: User's request
            params: Extracted parameters

        Returns:
            Composed email dict
        """
        llm = await self._get_llm()

        to = params.get("to", [])
        subject = params.get("subject", "")
        body = params.get("body", "")

        prompt = f"""Compose a professional email based on this request:

Request: {user_request}

{f"To: {', '.join(to)}" if to else ""}
{f"Subject: {subject}" if subject else ""}
{f"Content hint: {body}" if body else ""}

Write the complete email including:
- Subject line (if not provided)
- Greeting
- Body content
- Professional closing

Format as:
Subject: [subject]
---
[email body]"""

        response = await llm.generate(prompt, temperature=0.7)

        # Parse the response
        lines = response.strip().split("\n")
        composed_subject = subject
        composed_body = response

        for i, line in enumerate(lines):
            if line.lower().startswith("subject:"):
                composed_subject = line[8:].strip()
                # Body is everything after "---" or the subject line
                body_start = i + 1
                if body_start < len(lines) and lines[body_start].strip() == "---":
                    body_start += 1
                composed_body = "\n".join(lines[body_start:])
                break

        return {
            "message": f"Email composed:\n\n**To:** {', '.join(to) if to else '[specify recipient]'}\n**Subject:** {composed_subject}\n\n{composed_body}",
            "email": {
                "to": to,
                "subject": composed_subject,
                "body": composed_body,
            },
        }

    async def _list_emails(self, params: dict[str, Any]) -> dict[str, Any]:
        """List inbox emails via MCP.

        Args:
            params: List parameters (folder, limit)

        Returns:
            Result dict
        """
        try:
            result = await self._call_mcp(
                "/api/mail/list",
                method="GET",
                data={
                    "folder": params.get("folder", "inbox"),
                    "limit": params.get("limit", 10),
                },
            )
            emails = result.get("emails", [])
            if not emails:
                return {"message": "No emails found."}

            email_list = "\n".join(
                f"- **{e.get('subject', 'No subject')}** from {e.get('from', 'Unknown')}"
                for e in emails
            )
            return {"message": f"Recent emails:\n{email_list}"}
        except Exception as e:
            return {
                "message": "[Simulated] Would list inbox emails",
                "simulated": True,
            }

    async def _search_emails(self, params: dict[str, Any]) -> dict[str, Any]:
        """Search emails via MCP.

        Args:
            params: Search parameters

        Returns:
            Result dict
        """
        query = params.get("query", "")
        if not query:
            return {"error": "No search query specified"}

        try:
            result = await self._call_mcp(
                "/api/mail/search",
                method="GET",
                data={"query": query},
            )
            emails = result.get("emails", [])
            if not emails:
                return {"message": f"No emails found matching '{query}'."}

            email_list = "\n".join(
                f"- **{e.get('subject', 'No subject')}** from {e.get('from', 'Unknown')}"
                for e in emails
            )
            return {"message": f"Search results for '{query}':\n{email_list}"}
        except Exception as e:
            return {
                "message": f"[Simulated] Would search for: {query}",
                "simulated": True,
            }
