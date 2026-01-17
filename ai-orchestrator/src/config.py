"""Configuration settings for the AI Orchestrator."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = "Zentoria AI Orchestrator"
    app_version: str = "1.0.0"
    debug: bool = False
    environment: Literal["development", "staging", "production"] = "development"

    # Server
    host: str = "0.0.0.0"
    port: int = 8080
    workers: int = 1
    reload: bool = False

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3.2:8b"
    ollama_code_model: str = "codellama:7b"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_timeout: float = 120.0
    ollama_max_tokens: int = 4096

    # Qdrant
    qdrant_url: str = "http://10.10.40.119:6333"
    qdrant_api_key: SecretStr | None = None
    qdrant_collection: str = "zentoria_docs"
    qdrant_embedding_size: int = 768

    # Redis
    redis_url: str = "redis://10.10.40.110:6379"
    redis_password: SecretStr | None = None
    redis_db: int = 0
    redis_conversation_ttl: int = 3600  # 1 hour
    redis_max_history: int = 50

    # SEC-008: Redis TLS Configuration
    redis_tls: bool = False  # Set to True or use rediss:// URL
    redis_tls_ca_cert: str | None = None  # Path to CA certificate
    redis_tls_cert: str | None = None  # Path to client certificate (mutual TLS)
    redis_tls_key: str | None = None  # Path to client key (mutual TLS)
    redis_tls_verify: bool = True  # Verify server certificate

    # Backend MCP
    mcp_base_url: str = "http://10.10.40.101:4000"
    mcp_api_key: SecretStr | None = None
    mcp_timeout: float = 30.0

    # RAG
    rag_top_k: int = 5
    rag_score_threshold: float = 0.7
    rag_chunk_size: int = 512
    rag_chunk_overlap: int = 50

    # Agents
    agent_timeout: float = 60.0
    agent_max_retries: int = 3
    agent_retry_delay: float = 1.0

    # Security
    api_key: SecretStr | None = Field(default=None, alias="ORCHESTRATOR_API_KEY")
    cors_origins: list[str] = ["*"]
    rate_limit_requests: int = 100
    rate_limit_window: int = 60  # seconds

    # Logging
    log_level: str = "INFO"
    log_format: Literal["json", "console"] = "console"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
