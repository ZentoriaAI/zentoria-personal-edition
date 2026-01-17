"""WebSocket endpoints for real-time chat."""

import json
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from src.agents import ChatAgent, CodeAgent, FileAgent, MailAgent, SearchAgent
from src.core.context import ContextManager, get_context_manager
from src.core.models import AgentType, MessageRole
from src.core.router import CommandRouter, get_command_router

logger = structlog.get_logger(__name__)

ws_router = APIRouter()


class ConnectionManager:
    """Manage WebSocket connections."""

    def __init__(self) -> None:
        """Initialize connection manager."""
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        """Accept and register a connection."""
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info("WebSocket connected", session_id=session_id)

    def disconnect(self, session_id: str) -> None:
        """Remove a connection."""
        self.active_connections.pop(session_id, None)
        logger.info("WebSocket disconnected", session_id=session_id)

    async def send_message(self, session_id: str, message: dict[str, Any]) -> None:
        """Send message to a specific session."""
        websocket = self.active_connections.get(session_id)
        if websocket:
            await websocket.send_json(message)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Broadcast message to all connections."""
        for websocket in self.active_connections.values():
            await websocket.send_json(message)


manager = ConnectionManager()


# Agent map for WebSocket
AGENT_MAP = {
    AgentType.CHAT: ChatAgent,
    AgentType.CODE: CodeAgent,
    AgentType.FILE: FileAgent,
    AgentType.MAIL: MailAgent,
    AgentType.SEARCH: SearchAgent,
}


@ws_router.websocket("/ws/chat")
async def websocket_chat(
    websocket: WebSocket,
) -> None:
    """WebSocket endpoint for real-time chat."""
    session_id = str(uuid.uuid4())
    await manager.connect(websocket, session_id)

    # Get dependencies
    context_manager = await get_context_manager()
    command_router = await get_command_router()

    try:
        # Send welcome message
        await websocket.send_json(
            {
                "type": "connected",
                "session_id": session_id,
                "message": "Connected to Zentoria AI Orchestrator",
            }
        )

        while True:
            # Receive message
            data = await websocket.receive_text()

            try:
                request = json.loads(data)
            except json.JSONDecodeError:
                request = {"message": data}

            message = request.get("message", "")
            agent_name = request.get("agent")
            stream = request.get("stream", True)

            if not message:
                await websocket.send_json(
                    {
                        "type": "error",
                        "error": "Message is required",
                    }
                )
                continue

            # Route to agent
            if agent_name:
                try:
                    agent_type = AgentType(agent_name)
                except ValueError:
                    agent_type = AgentType.CHAT
            else:
                conversation = await context_manager.get_conversation(session_id)
                agent_type, _ = await command_router.route(
                    message,
                    context=conversation.messages,
                )

            # Get agent
            agent_class = AGENT_MAP.get(agent_type, ChatAgent)
            agent = agent_class()

            try:
                # Send typing indicator
                await websocket.send_json(
                    {
                        "type": "typing",
                        "agent": agent_type.value,
                    }
                )

                # Get conversation context
                conversation = await context_manager.get_conversation(session_id)

                if stream:
                    # Stream response
                    full_response = ""
                    async for chunk in agent.stream(
                        message,
                        context=conversation.messages,
                    ):
                        full_response += chunk
                        await websocket.send_json(
                            {
                                "type": "chunk",
                                "content": chunk,
                                "agent": agent_type.value,
                            }
                        )

                    # Send completion
                    await websocket.send_json(
                        {
                            "type": "complete",
                            "agent": agent_type.value,
                            "total_length": len(full_response),
                        }
                    )

                    response_text = full_response
                else:
                    # Non-streaming response
                    response_text, metadata = await agent.execute(
                        message,
                        context=conversation.messages,
                    )

                    await websocket.send_json(
                        {
                            "type": "message",
                            "content": response_text,
                            "agent": agent_type.value,
                            "metadata": metadata,
                        }
                    )

                # Save to context
                await context_manager.add_message(
                    session_id,
                    MessageRole.USER,
                    message,
                )
                await context_manager.add_message(
                    session_id,
                    MessageRole.ASSISTANT,
                    response_text,
                    agent=agent_type,
                )

            finally:
                await agent.close()

    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        logger.error("WebSocket error", error=str(e), session_id=session_id)
        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "error": str(e),
                }
            )
        except Exception:
            pass
        manager.disconnect(session_id)


@ws_router.websocket("/ws/chat/{session_id}")
async def websocket_chat_session(
    websocket: WebSocket,
    session_id: str,
) -> None:
    """WebSocket endpoint for a specific session."""
    await manager.connect(websocket, session_id)

    context_manager = await get_context_manager()
    command_router = await get_command_router()

    try:
        # Get existing context
        conversation = await context_manager.get_conversation(session_id)

        # Send session info
        await websocket.send_json(
            {
                "type": "connected",
                "session_id": session_id,
                "message_count": len(conversation.messages),
            }
        )

        while True:
            data = await websocket.receive_text()

            try:
                request = json.loads(data)
            except json.JSONDecodeError:
                request = {"message": data}

            message = request.get("message", "")
            if not message:
                continue

            # Get updated context
            conversation = await context_manager.get_conversation(session_id)

            # Route and process
            agent_type, _ = await command_router.route(
                message,
                context=conversation.messages,
            )

            agent_class = AGENT_MAP.get(agent_type, ChatAgent)
            agent = agent_class()

            try:
                await websocket.send_json({"type": "typing", "agent": agent_type.value})

                full_response = ""
                async for chunk in agent.stream(message, context=conversation.messages):
                    full_response += chunk
                    await websocket.send_json(
                        {"type": "chunk", "content": chunk, "agent": agent_type.value}
                    )

                await websocket.send_json(
                    {"type": "complete", "agent": agent_type.value}
                )

                # Save context
                await context_manager.add_message(session_id, MessageRole.USER, message)
                await context_manager.add_message(
                    session_id, MessageRole.ASSISTANT, full_response, agent=agent_type
                )

            finally:
                await agent.close()

    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        logger.error("WebSocket error", error=str(e), session_id=session_id)
        manager.disconnect(session_id)
