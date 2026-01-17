"""Data models for the AI Orchestrator."""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    """Role of a message in conversation."""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class AgentType(str, Enum):
    """Available agent types."""

    FILE = "file"
    MAIL = "mail"
    KEY = "key"
    WORKFLOW = "workflow"
    SECURITY = "security"
    CHAT = "chat"
    CODE = "code"
    SEARCH = "search"


class Message(BaseModel):
    """A single message in a conversation."""

    id: UUID = Field(default_factory=uuid4)
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)
    agent: AgentType | None = None
    citations: list[dict[str, Any]] = Field(default_factory=list)


class Conversation(BaseModel):
    """A conversation session with history."""

    session_id: str
    messages: list[Message] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    user_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChatRequest(BaseModel):
    """Request for chat endpoint."""

    message: str = Field(..., min_length=1, max_length=10000)
    session_id: str | None = None
    user_id: str | None = None
    stream: bool = False
    use_rag: bool = True
    agent: AgentType | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    """Response from chat endpoint."""

    message: str
    session_id: str
    agent_used: AgentType
    citations: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class CommandRequest(BaseModel):
    """Request for direct command execution."""

    command: str = Field(..., min_length=1)
    agent: AgentType
    parameters: dict[str, Any] = Field(default_factory=dict)
    session_id: str | None = None


class CommandResponse(BaseModel):
    """Response from command execution."""

    success: bool
    result: Any
    agent: AgentType
    execution_time: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class EmbedRequest(BaseModel):
    """Request to generate embeddings."""

    texts: list[str] = Field(..., min_length=1, max_length=100)
    model: str | None = None


class EmbedResponse(BaseModel):
    """Response with generated embeddings."""

    embeddings: list[list[float]]
    model: str
    dimensions: int


class Document(BaseModel):
    """A document for RAG."""

    id: str
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    embedding: list[float] | None = None
    score: float | None = None


class AgentInfo(BaseModel):
    """Information about an agent."""

    name: AgentType
    description: str
    capabilities: list[str]
    model: str
    active: bool = True


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    version: str
    services: dict[str, bool]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
