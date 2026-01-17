"""API routes for the AI Orchestrator."""

import time
import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

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
from src.config import Settings
from src.core.context import ContextManager
from src.core.llm import LLMClient
from src.core.models import (
    AgentInfo,
    AgentType,
    ChatRequest,
    ChatResponse,
    CommandRequest,
    CommandResponse,
    Conversation,
    EmbedRequest,
    EmbedResponse,
    HealthResponse,
    Message,
    MessageRole,
)
from src.core.rag import RAGPipeline
from src.core.router import CommandRouter
# CQ-001: Import dependency factories from container
from src.container import (
    get_settings,
    get_llm_client,
    get_context_manager,
    get_rag_pipeline,
    get_command_router,
)

logger = structlog.get_logger(__name__)

router = APIRouter()


# Agent registry
AGENTS: dict[AgentType, type[BaseAgent]] = {
    AgentType.CHAT: ChatAgent,
    AgentType.CODE: CodeAgent,
    AgentType.FILE: FileAgent,
    AgentType.MAIL: MailAgent,
    AgentType.KEY: KeyAgent,
    AgentType.WORKFLOW: WorkflowAgent,
    AgentType.SECURITY: SecurityAgent,
    AgentType.SEARCH: SearchAgent,
}


def get_agent(agent_type: AgentType) -> BaseAgent:
    """Get agent instance by type."""
    agent_class = AGENTS.get(agent_type)
    if not agent_class:
        raise ValueError(f"Unknown agent type: {agent_type}")
    return agent_class()


@router.get("/health", response_model=HealthResponse)
async def health_check(
    settings: Settings = Depends(get_settings),
) -> HealthResponse:
    """Health check endpoint."""
    llm = await get_llm_client()
    context = await get_context_manager()

    services = {
        "ollama": await llm.check_health(),
        "redis": await context.check_redis_health(),
        "qdrant": await context.check_qdrant_health(),
    }

    status = "healthy" if all(services.values()) else "degraded"

    return HealthResponse(
        status=status,
        version=settings.app_version,
        services=services,
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    command_router: CommandRouter = Depends(get_command_router),
    context_manager: ContextManager = Depends(get_context_manager),
) -> ChatResponse:
    """Main chat endpoint for AI interaction."""
    start_time = time.time()

    # Generate session ID if not provided
    session_id = request.session_id or str(uuid.uuid4())

    # Get conversation context
    conversation = await context_manager.get_conversation(session_id)

    # Route to appropriate agent
    if request.agent:
        agent_type = request.agent
        routing_meta = {"method": "explicit", "confidence": 1.0}
    else:
        agent_type, routing_meta = await command_router.route(
            request.message,
            context=conversation.messages,
        )

    logger.info(
        "Chat request routed",
        session_id=session_id,
        agent=agent_type.value,
        routing=routing_meta,
    )

    # Get agent and execute
    agent = get_agent(agent_type)

    try:
        if request.stream:
            # For streaming, return immediately and handle separately
            raise HTTPException(
                status_code=400,
                detail="Use /chat/stream endpoint for streaming responses",
            )

        response_text, metadata = await agent.execute(
            request.message,
            context=conversation.messages,
            parameters=request.context,
        )

        # Save messages to context
        await context_manager.add_message(
            session_id,
            MessageRole.USER,
            request.message,
        )
        await context_manager.add_message(
            session_id,
            MessageRole.ASSISTANT,
            response_text,
            agent=agent_type,
            metadata=metadata,
        )

        return ChatResponse(
            message=response_text,
            session_id=session_id,
            agent_used=agent_type,
            citations=metadata.get("citations", []),
            metadata={
                **metadata,
                "routing": routing_meta,
                "execution_time": time.time() - start_time,
            },
        )

    finally:
        await agent.close()


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    command_router: CommandRouter = Depends(get_command_router),
    context_manager: ContextManager = Depends(get_context_manager),
) -> EventSourceResponse:
    """Streaming chat endpoint using Server-Sent Events."""
    session_id = request.session_id or str(uuid.uuid4())

    # Get conversation context
    conversation = await context_manager.get_conversation(session_id)

    # Route to agent
    if request.agent:
        agent_type = request.agent
    else:
        agent_type, _ = await command_router.route(
            request.message,
            context=conversation.messages,
        )

    agent = get_agent(agent_type)

    async def event_generator() -> AsyncIterator[dict[str, Any]]:
        """Generate SSE events."""
        full_response = ""

        try:
            # Send start event
            yield {
                "event": "start",
                "data": {
                    "session_id": session_id,
                    "agent": agent_type.value,
                },
            }

            # Stream content
            async for chunk in agent.stream(
                request.message,
                context=conversation.messages,
                parameters=request.context,
            ):
                full_response += chunk
                yield {
                    "event": "chunk",
                    "data": {"content": chunk},
                }

            # Save to context
            await context_manager.add_message(
                session_id,
                MessageRole.USER,
                request.message,
            )
            await context_manager.add_message(
                session_id,
                MessageRole.ASSISTANT,
                full_response,
                agent=agent_type,
            )

            # Send done event
            yield {
                "event": "done",
                "data": {
                    "session_id": session_id,
                    "total_length": len(full_response),
                },
            }

        except Exception as e:
            logger.error("Streaming error", error=str(e))
            yield {
                "event": "error",
                "data": {"error": str(e)},
            }

        finally:
            await agent.close()

    return EventSourceResponse(event_generator())


@router.post("/command", response_model=CommandResponse)
async def execute_command(
    request: CommandRequest,
    context_manager: ContextManager = Depends(get_context_manager),
) -> CommandResponse:
    """Execute a direct command on a specific agent."""
    start_time = time.time()

    agent = get_agent(request.agent)

    try:
        result = await agent.invoke(
            request.command,
            parameters=request.parameters,
        )

        # Save to context if session provided
        if request.session_id:
            await context_manager.add_message(
                request.session_id,
                MessageRole.USER,
                f"[Command] {request.command}",
            )
            await context_manager.add_message(
                request.session_id,
                MessageRole.TOOL,
                result.get("response", ""),
                agent=request.agent,
                metadata=result.get("metadata", {}),
            )

        return CommandResponse(
            success=result.get("success", False),
            result=result.get("response"),
            agent=request.agent,
            execution_time=time.time() - start_time,
            metadata=result.get("metadata", {}),
        )

    finally:
        await agent.close()


@router.post("/embed", response_model=EmbedResponse)
async def generate_embeddings(
    request: EmbedRequest,
    llm: LLMClient = Depends(get_llm_client),
    settings: Settings = Depends(get_settings),
) -> EmbedResponse:
    """Generate embeddings for texts."""
    model = request.model or settings.ollama_embed_model

    embeddings = await llm.embed(request.texts, model=model)

    return EmbedResponse(
        embeddings=embeddings,
        model=model,
        dimensions=len(embeddings[0]) if embeddings else 0,
    )


@router.get("/agents", response_model=list[AgentInfo])
async def list_agents() -> list[AgentInfo]:
    """List all available agents."""
    agents = []
    for agent_type, agent_class in AGENTS.items():
        agent = agent_class()
        agents.append(agent.get_info())
    return agents


@router.post("/agents/{agent_name}")
async def invoke_agent(
    agent_name: str,
    request: dict[str, Any],
    context_manager: ContextManager = Depends(get_context_manager),
) -> dict[str, Any]:
    """Invoke a specific agent by name."""
    try:
        agent_type = AgentType(agent_name)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_name}' not found",
        )

    message = request.get("message", "")
    parameters = request.get("parameters", {})
    session_id = request.get("session_id")

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Message is required",
        )

    agent = get_agent(agent_type)

    try:
        context = []
        if session_id:
            conversation = await context_manager.get_conversation(session_id)
            context = conversation.messages

        result = await agent.invoke(
            message,
            context=context,
            parameters=parameters,
        )

        return result

    finally:
        await agent.close()


@router.get("/context/{session_id}")
async def get_context(
    session_id: str,
    context_manager: ContextManager = Depends(get_context_manager),
) -> dict[str, Any]:
    """Get conversation context for a session."""
    conversation = await context_manager.get_conversation(session_id)

    return {
        "session_id": session_id,
        "message_count": len(conversation.messages),
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
        "messages": [
            {
                "id": str(msg.id),
                "role": msg.role.value,
                "content": msg.content[:200] + "..."
                if len(msg.content) > 200
                else msg.content,
                "timestamp": msg.timestamp.isoformat(),
                "agent": msg.agent.value if msg.agent else None,
            }
            for msg in conversation.messages
        ],
    }


@router.delete("/context/{session_id}")
async def clear_context(
    session_id: str,
    context_manager: ContextManager = Depends(get_context_manager),
) -> dict[str, Any]:
    """Clear conversation context for a session."""
    deleted = await context_manager.clear_conversation(session_id)

    if deleted:
        return {"message": f"Context cleared for session {session_id}"}
    else:
        return {"message": f"No context found for session {session_id}"}


@router.post("/index")
async def index_document(
    request: dict[str, Any],
    rag: RAGPipeline = Depends(get_rag_pipeline),
) -> dict[str, Any]:
    """Index a document for RAG search."""
    doc_id = request.get("doc_id")
    content = request.get("content")
    metadata = request.get("metadata", {})

    if not doc_id or not content:
        raise HTTPException(
            status_code=400,
            detail="doc_id and content are required",
        )

    chunks = await rag.index_document(doc_id, content, metadata)

    return {
        "doc_id": doc_id,
        "chunks_indexed": chunks,
        "status": "indexed",
    }


@router.delete("/index/{doc_id}")
async def delete_document(
    doc_id: str,
    rag: RAGPipeline = Depends(get_rag_pipeline),
) -> dict[str, Any]:
    """Delete an indexed document."""
    deleted = await rag.delete_document(doc_id)

    return {
        "doc_id": doc_id,
        "chunks_deleted": deleted,
        "status": "deleted",
    }


@router.post("/search")
async def search_documents(
    request: dict[str, Any],
    rag: RAGPipeline = Depends(get_rag_pipeline),
) -> dict[str, Any]:
    """Search indexed documents."""
    query = request.get("query")
    top_k = request.get("top_k", 5)
    doc_id = request.get("doc_id")

    if not query:
        raise HTTPException(
            status_code=400,
            detail="query is required",
        )

    documents = await rag.search(
        query,
        top_k=top_k,
        doc_id=doc_id,
    )

    return {
        "query": query,
        "results": [
            {
                "id": doc.id,
                "content": doc.content,
                "score": doc.score,
                "metadata": doc.metadata,
            }
            for doc in documents
        ],
        "count": len(documents),
    }
