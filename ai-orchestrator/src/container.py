"""
Dependency Injection Container - CQ-001

Replaces global singletons with a proper DI pattern.
Uses FastAPI's Depends() for route-level injection.

This module provides:
- A centralized container for all service instances
- Factory functions for FastAPI dependency injection
- Proper lifecycle management (startup/shutdown)
- Type-safe dependency resolution
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, TypeVar, Generic, Callable, Any
import structlog

if TYPE_CHECKING:
    from src.config import Settings
    from src.core.llm import LLMClient
    from src.core.context import ContextManager
    from src.core.rag import RAGPipeline
    from src.core.router import CommandRouter

logger = structlog.get_logger(__name__)


# ============================================================================
# Container State
# ============================================================================


@dataclass
class Container:
    """
    Dependency injection container for the AI Orchestrator.

    Holds all service instances and manages their lifecycle.
    Services are lazily initialized on first access.
    """

    _settings: Settings | None = None
    _llm_client: LLMClient | None = None
    _context_manager: ContextManager | None = None
    _rag_pipeline: RAGPipeline | None = None
    _command_router: CommandRouter | None = None

    _initialized: bool = False
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @property
    def settings(self) -> Settings:
        """Get settings instance."""
        if self._settings is None:
            from src.config import Settings
            self._settings = Settings()
        return self._settings

    async def get_llm_client(self) -> LLMClient:
        """Get or create LLM client."""
        if self._llm_client is None:
            from src.core.llm import LLMClient
            self._llm_client = LLMClient(settings=self.settings)
            logger.debug("Created LLMClient instance")
        return self._llm_client

    async def get_context_manager(self) -> ContextManager:
        """Get or create context manager."""
        if self._context_manager is None:
            from src.core.context import ContextManager
            self._context_manager = ContextManager(settings=self.settings)
            logger.debug("Created ContextManager instance")
        return self._context_manager

    async def get_rag_pipeline(self) -> RAGPipeline:
        """Get or create RAG pipeline."""
        if self._rag_pipeline is None:
            from src.core.rag import RAGPipeline
            llm = await self.get_llm_client()
            self._rag_pipeline = RAGPipeline(settings=self.settings, llm_client=llm)
            logger.debug("Created RAGPipeline instance")
        return self._rag_pipeline

    async def get_command_router(self) -> CommandRouter:
        """Get or create command router."""
        if self._command_router is None:
            from src.core.router import CommandRouter
            llm = await self.get_llm_client()
            self._command_router = CommandRouter(settings=self.settings, llm_client=llm)
            logger.debug("Created CommandRouter instance")
        return self._command_router

    async def initialize(self) -> None:
        """
        Initialize all services.

        Called during application startup to eagerly create all services
        and verify connectivity.
        """
        async with self._lock:
            if self._initialized:
                logger.warning("Container already initialized")
                return

            logger.info("Initializing dependency container")

            # Create all services
            llm = await self.get_llm_client()
            context = await self.get_context_manager()
            rag = await self.get_rag_pipeline()
            router = await self.get_command_router()

            # Health checks
            health_results = {
                "ollama": await llm.check_health(),
                "redis": await context.check_redis_health(),
                "qdrant": await context.check_qdrant_health(),
            }

            for service, healthy in health_results.items():
                if healthy:
                    logger.info(f"{service.capitalize()} connection established")
                else:
                    logger.warning(f"{service.capitalize()} not available")

            self._initialized = True
            logger.info("Dependency container initialized")

    async def shutdown(self) -> None:
        """
        Shutdown all services.

        Called during application shutdown to cleanly close all connections.
        """
        async with self._lock:
            logger.info("Shutting down dependency container")

            # Close services in reverse order of creation
            if self._rag_pipeline:
                await self._rag_pipeline.close()
                self._rag_pipeline = None
                logger.debug("RAGPipeline closed")

            if self._context_manager:
                await self._context_manager.close()
                self._context_manager = None
                logger.debug("ContextManager closed")

            if self._llm_client:
                await self._llm_client.close()
                self._llm_client = None
                logger.debug("LLMClient closed")

            self._command_router = None
            self._initialized = False

            logger.info("Dependency container shut down")

    def reset(self) -> None:
        """Reset container (for testing)."""
        self._settings = None
        self._llm_client = None
        self._context_manager = None
        self._rag_pipeline = None
        self._command_router = None
        self._initialized = False


# ============================================================================
# Global Container Instance
# ============================================================================

# Single global container instance
_container: Container | None = None


def get_container() -> Container:
    """Get the global container instance."""
    global _container
    if _container is None:
        _container = Container()
    return _container


def set_container(container: Container) -> None:
    """Set the global container (for testing)."""
    global _container
    _container = container


def reset_container() -> None:
    """Reset the global container (for testing)."""
    global _container
    if _container:
        _container.reset()
    _container = None


# ============================================================================
# FastAPI Dependency Functions
# ============================================================================


def get_settings() -> Settings:
    """
    FastAPI dependency for settings.

    Usage:
        @router.get("/endpoint")
        async def endpoint(settings: Settings = Depends(get_settings)):
            ...
    """
    return get_container().settings


async def get_llm_client() -> LLMClient:
    """
    FastAPI dependency for LLM client.

    Usage:
        @router.get("/endpoint")
        async def endpoint(llm: LLMClient = Depends(get_llm_client)):
            ...
    """
    return await get_container().get_llm_client()


async def get_context_manager() -> ContextManager:
    """
    FastAPI dependency for context manager.

    Usage:
        @router.get("/endpoint")
        async def endpoint(context: ContextManager = Depends(get_context_manager)):
            ...
    """
    return await get_container().get_context_manager()


async def get_rag_pipeline() -> RAGPipeline:
    """
    FastAPI dependency for RAG pipeline.

    Usage:
        @router.get("/endpoint")
        async def endpoint(rag: RAGPipeline = Depends(get_rag_pipeline)):
            ...
    """
    return await get_container().get_rag_pipeline()


async def get_command_router() -> CommandRouter:
    """
    FastAPI dependency for command router.

    Usage:
        @router.get("/endpoint")
        async def endpoint(router: CommandRouter = Depends(get_command_router)):
            ...
    """
    return await get_container().get_command_router()


# ============================================================================
# Type Hints for Imports
# ============================================================================

# Re-export types for convenience
# This allows routes to import from container instead of individual modules
__all__ = [
    "Container",
    "get_container",
    "set_container",
    "reset_container",
    "get_settings",
    "get_llm_client",
    "get_context_manager",
    "get_rag_pipeline",
    "get_command_router",
]
