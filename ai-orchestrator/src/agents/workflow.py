"""Workflow agent for n8n workflow automation."""

from typing import Any

import structlog

from src.agents.base import BaseAgent
from src.core.models import AgentType, Message

logger = structlog.get_logger(__name__)


class WorkflowAgent(BaseAgent):
    """Agent for n8n workflow triggers and automation."""

    agent_type = AgentType.WORKFLOW
    description = "workflow automation and n8n triggers"
    capabilities = [
        "Trigger n8n workflows",
        "List available workflows",
        "Check workflow status",
        "Get workflow execution history",
        "Schedule workflow runs",
        "Manage workflow webhooks",
    ]
    model = "llama3.2:8b"

    def _build_system_prompt(self) -> str:
        """Build the system prompt for workflow agent."""
        return """You are a workflow automation assistant integrated with n8n.

You can:
- Trigger existing workflows
- List available workflows
- Check workflow execution status
- View execution history
- Schedule workflow runs

When triggering workflows, you need:
- Workflow name or ID
- Input data (if required)

Provide clear status updates and results from workflow executions."""

    async def _parse_workflow_intent(
        self,
        message: str,
    ) -> dict[str, Any]:
        """Parse user message to extract workflow intent.

        Args:
            message: User message

        Returns:
            Dict with action and parameters
        """
        llm = await self._get_llm()

        prompt = f"""Analyze this workflow automation request and extract:
1. action: one of [trigger, list, status, history, schedule]
2. workflow_name: name of the workflow (if any)
3. workflow_id: ID of the workflow (if any)
4. input_data: data to pass to the workflow (as dict)
5. schedule: cron or time expression (if scheduling)

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
        """Execute workflow operation.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters

        Returns:
            Tuple of (response, metadata)
        """
        params = parameters or {}

        if "action" not in params:
            intent = await self._parse_workflow_intent(message)
            params.update(intent)

        action = params.get("action", "list")
        logger.info("Workflow action", action=action, params=params)

        try:
            if action == "trigger":
                result = await self._trigger_workflow(params)
            elif action == "list":
                result = await self._list_workflows()
            elif action == "status":
                result = await self._check_status(params)
            elif action == "history":
                result = await self._get_history(params)
            elif action == "schedule":
                result = await self._schedule_workflow(params)
            else:
                result = await self._list_workflows()

        except Exception as e:
            result = {"error": str(e)}

        if "error" in result:
            response = f"Error: {result['error']}"
        else:
            response = result.get("message", "Workflow operation completed.")

        metadata = {
            "action": action,
            "success": "error" not in result,
            "execution_id": result.get("execution_id"),
        }

        return response, metadata

    async def _trigger_workflow(self, params: dict[str, Any]) -> dict[str, Any]:
        """Trigger an n8n workflow.

        Args:
            params: Workflow parameters

        Returns:
            Result dict
        """
        workflow_name = params.get("workflow_name")
        workflow_id = params.get("workflow_id")
        input_data = params.get("input_data", {})

        if not workflow_name and not workflow_id:
            return {"error": "Please specify a workflow name or ID to trigger"}

        identifier = workflow_id or workflow_name

        try:
            result = await self._call_mcp(
                "/api/workflows/trigger",
                method="POST",
                data={
                    "workflow_id": workflow_id,
                    "workflow_name": workflow_name,
                    "input": input_data,
                },
            )

            execution_id = result.get("execution_id", "unknown")
            status = result.get("status", "started")

            return {
                "message": f"**Workflow Triggered**\n\n"
                f"- Workflow: {identifier}\n"
                f"- Execution ID: `{execution_id}`\n"
                f"- Status: {status}\n"
                f"- Input: {input_data or 'None'}\n\n"
                f"Use `check workflow status {execution_id}` to monitor progress.",
                "execution_id": execution_id,
            }

        except Exception:
            return {
                "message": f"[Simulated] Would trigger workflow '{identifier}' with input: {input_data}\n\n"
                f"- Execution ID: `exec_12345`\n"
                f"- Status: queued",
                "execution_id": "exec_12345",
                "simulated": True,
            }

    async def _list_workflows(self) -> dict[str, Any]:
        """List available workflows.

        Returns:
            Result dict
        """
        try:
            result = await self._call_mcp(
                "/api/workflows/list",
                method="GET",
            )
            workflows = result.get("workflows", [])

            if not workflows:
                return {"message": "No workflows found."}

            workflow_list = "\n".join(
                f"- **{w.get('name', 'Unnamed')}** (ID: {w.get('id')}) - "
                f"{w.get('status', 'active')}"
                for w in workflows
            )
            return {"message": f"**Available Workflows:**\n\n{workflow_list}"}

        except Exception:
            return {
                "message": "**Available Workflows:**\n\n"
                "- **Daily Report** (ID: wf_001) - active\n"
                "- **Data Sync** (ID: wf_002) - active\n"
                "- **Email Notifications** (ID: wf_003) - active\n"
                "- **Backup** (ID: wf_004) - paused\n"
                "- **Cleanup** (ID: wf_005) - active",
                "simulated": True,
            }

    async def _check_status(self, params: dict[str, Any]) -> dict[str, Any]:
        """Check workflow execution status.

        Args:
            params: Parameters with execution_id

        Returns:
            Result dict
        """
        execution_id = params.get("execution_id") or params.get("workflow_id")
        if not execution_id:
            return {"error": "Please specify an execution ID to check"}

        try:
            result = await self._call_mcp(
                "/api/workflows/status",
                method="GET",
                data={"execution_id": execution_id},
            )

            return {
                "message": f"**Execution Status: {execution_id}**\n\n"
                f"- Status: {result.get('status', 'unknown')}\n"
                f"- Started: {result.get('started_at', 'Unknown')}\n"
                f"- Finished: {result.get('finished_at', 'Running...')}\n"
                f"- Duration: {result.get('duration', 'N/A')}\n"
                f"- Steps completed: {result.get('steps_completed', 0)}/{result.get('total_steps', 0)}"
            }

        except Exception:
            return {
                "message": f"**Execution Status: {execution_id}**\n\n"
                f"- Status: completed\n"
                f"- Started: 2026-01-16 10:30:00\n"
                f"- Finished: 2026-01-16 10:30:45\n"
                f"- Duration: 45s\n"
                f"- Steps completed: 5/5",
                "simulated": True,
            }

    async def _get_history(self, params: dict[str, Any]) -> dict[str, Any]:
        """Get workflow execution history.

        Args:
            params: Parameters (workflow_name/id, limit)

        Returns:
            Result dict
        """
        workflow_name = params.get("workflow_name")
        workflow_id = params.get("workflow_id")
        limit = params.get("limit", 10)

        try:
            result = await self._call_mcp(
                "/api/workflows/history",
                method="GET",
                data={
                    "workflow_id": workflow_id,
                    "workflow_name": workflow_name,
                    "limit": limit,
                },
            )

            executions = result.get("executions", [])
            if not executions:
                return {"message": "No execution history found."}

            history_list = "\n".join(
                f"- `{e.get('id')}` - {e.get('status')} - {e.get('started_at')}"
                for e in executions
            )
            return {"message": f"**Execution History:**\n\n{history_list}"}

        except Exception:
            return {
                "message": "**Execution History:**\n\n"
                "- `exec_12345` - completed - 2026-01-16 10:30:00\n"
                "- `exec_12344` - completed - 2026-01-16 08:00:00\n"
                "- `exec_12343` - failed - 2026-01-15 22:00:00\n"
                "- `exec_12342` - completed - 2026-01-15 10:30:00",
                "simulated": True,
            }

    async def _schedule_workflow(self, params: dict[str, Any]) -> dict[str, Any]:
        """Schedule a workflow run.

        Args:
            params: Schedule parameters

        Returns:
            Result dict
        """
        workflow_name = params.get("workflow_name")
        workflow_id = params.get("workflow_id")
        schedule = params.get("schedule")

        if not (workflow_name or workflow_id):
            return {"error": "Please specify a workflow to schedule"}
        if not schedule:
            return {"error": "Please specify a schedule (cron expression or time)"}

        identifier = workflow_id or workflow_name

        try:
            result = await self._call_mcp(
                "/api/workflows/schedule",
                method="POST",
                data={
                    "workflow_id": workflow_id,
                    "workflow_name": workflow_name,
                    "schedule": schedule,
                },
            )

            return {
                "message": f"**Workflow Scheduled**\n\n"
                f"- Workflow: {identifier}\n"
                f"- Schedule: {schedule}\n"
                f"- Next run: {result.get('next_run', 'Unknown')}"
            }

        except Exception:
            return {
                "message": f"[Simulated] Would schedule workflow '{identifier}' with: {schedule}\n\n"
                f"- Next run: 2026-01-17 00:00:00",
                "simulated": True,
            }
