"""Context manager for conversation memory."""

import json
import ssl
from datetime import datetime
from pathlib import Path
from typing import Any

import redis.asyncio as redis
import structlog
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from src.config import Settings, get_settings
from src.core.models import Conversation, Message, MessageRole

logger = structlog.get_logger(__name__)


class ContextManager:
    """Manage conversation context with Redis (short-term) and Qdrant (long-term)."""

    def __init__(self, settings: Settings | None = None) -> None:
        """Initialize the context manager."""
        self.settings = settings or get_settings()
        self._redis: redis.Redis | None = None
        self._qdrant: AsyncQdrantClient | None = None

    def _build_ssl_context(self) -> ssl.SSLContext | None:
        """Build SSL context for Redis TLS connection (SEC-008)."""
        # Check if TLS is enabled via setting or URL scheme
        tls_enabled = (
            self.settings.redis_tls or
            self.settings.redis_url.startswith("rediss://")
        )

        if not tls_enabled:
            return None

        logger.info("Redis TLS enabled")

        # Create SSL context
        ssl_context = ssl.create_default_context()

        # Configure certificate verification
        if not self.settings.redis_tls_verify:
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            logger.warning("Redis TLS certificate verification disabled (insecure)")
        else:
            ssl_context.verify_mode = ssl.CERT_REQUIRED
            ssl_context.check_hostname = True

        # Load custom CA certificate if provided
        if self.settings.redis_tls_ca_cert:
            ca_path = Path(self.settings.redis_tls_ca_cert)
            if ca_path.exists():
                ssl_context.load_verify_locations(str(ca_path))
                logger.info("Loaded Redis TLS CA certificate", path=str(ca_path))
            else:
                raise FileNotFoundError(
                    f"Redis TLS CA certificate not found: {ca_path}"
                )

        # Load client certificate for mutual TLS
        if self.settings.redis_tls_cert and self.settings.redis_tls_key:
            cert_path = Path(self.settings.redis_tls_cert)
            key_path = Path(self.settings.redis_tls_key)
            if cert_path.exists() and key_path.exists():
                ssl_context.load_cert_chain(str(cert_path), str(key_path))
                logger.info("Loaded Redis TLS client certificate for mutual TLS")
            else:
                raise FileNotFoundError(
                    f"Redis TLS client certificate or key not found: {cert_path}, {key_path}"
                )

        return ssl_context

    async def _get_redis(self) -> redis.Redis:
        """Get or create Redis connection."""
        if self._redis is None:
            password = (
                self.settings.redis_password.get_secret_value()
                if self.settings.redis_password
                else None
            )

            # Build SSL context for TLS (SEC-008)
            ssl_context = self._build_ssl_context()

            # Build connection kwargs - only include ssl if TLS is enabled
            conn_kwargs: dict[str, Any] = {
                "password": password,
                "db": self.settings.redis_db,
                "decode_responses": True,
            }

            # Only add ssl parameter if TLS is enabled (SEC-008)
            if ssl_context is not None:
                conn_kwargs["ssl"] = ssl_context

            self._redis = redis.Redis.from_url(
                self.settings.redis_url,
                **conn_kwargs,
            )
        return self._redis

    async def _get_qdrant(self) -> AsyncQdrantClient:
        """Get or create Qdrant client."""
        if self._qdrant is None:
            api_key = (
                self.settings.qdrant_api_key.get_secret_value()
                if self.settings.qdrant_api_key
                else None
            )
            self._qdrant = AsyncQdrantClient(
                url=self.settings.qdrant_url,
                api_key=api_key,
            )
            # Ensure collection exists
            await self._ensure_collection()
        return self._qdrant

    async def _ensure_collection(self) -> None:
        """Ensure the Qdrant collection exists."""
        if self._qdrant is None:
            return

        collections = await self._qdrant.get_collections()
        collection_names = [c.name for c in collections.collections]

        if self.settings.qdrant_collection not in collection_names:
            await self._qdrant.create_collection(
                collection_name=self.settings.qdrant_collection,
                vectors_config=VectorParams(
                    size=self.settings.qdrant_embedding_size,
                    distance=Distance.COSINE,
                ),
            )
            logger.info(
                "Created Qdrant collection", collection=self.settings.qdrant_collection
            )

    async def close(self) -> None:
        """Close connections."""
        if self._redis:
            await self._redis.close()
        if self._qdrant:
            await self._qdrant.close()

    def _conversation_key(self, session_id: str) -> str:
        """Get Redis key for a conversation."""
        return f"zentoria:conversation:{session_id}"

    def _user_prefs_key(self, user_id: str) -> str:
        """Get Redis key for user preferences."""
        return f"zentoria:user:{user_id}:preferences"

    async def get_conversation(self, session_id: str) -> Conversation:
        """Get conversation by session ID.

        Args:
            session_id: Session identifier

        Returns:
            Conversation object
        """
        r = await self._get_redis()
        key = self._conversation_key(session_id)

        data = await r.get(key)
        if data:
            conv_dict = json.loads(data)
            return Conversation(**conv_dict)

        # Create new conversation
        return Conversation(session_id=session_id)

    async def save_conversation(self, conversation: Conversation) -> None:
        """Save conversation to Redis.

        Args:
            conversation: Conversation to save
        """
        r = await self._get_redis()
        key = self._conversation_key(conversation.session_id)

        # Trim to max history
        if len(conversation.messages) > self.settings.redis_max_history:
            conversation.messages = conversation.messages[
                -self.settings.redis_max_history :
            ]

        conversation.updated_at = datetime.utcnow()

        await r.setex(
            key,
            self.settings.redis_conversation_ttl,
            conversation.model_dump_json(),
        )

        logger.debug(
            "Saved conversation",
            session_id=conversation.session_id,
            message_count=len(conversation.messages),
        )

    async def add_message(
        self,
        session_id: str,
        role: MessageRole,
        content: str,
        **kwargs: Any,
    ) -> Message:
        """Add a message to conversation.

        Args:
            session_id: Session identifier
            role: Message role
            content: Message content
            **kwargs: Additional message fields

        Returns:
            Created message
        """
        conversation = await self.get_conversation(session_id)
        message = Message(role=role, content=content, **kwargs)
        conversation.messages.append(message)
        await self.save_conversation(conversation)

        return message

    async def clear_conversation(self, session_id: str) -> bool:
        """Clear conversation history.

        Args:
            session_id: Session identifier

        Returns:
            True if cleared, False if not found
        """
        r = await self._get_redis()
        key = self._conversation_key(session_id)
        result = await r.delete(key)
        return result > 0

    async def get_user_preferences(self, user_id: str) -> dict[str, Any]:
        """Get user preferences.

        Args:
            user_id: User identifier

        Returns:
            User preferences dict
        """
        r = await self._get_redis()
        key = self._user_prefs_key(user_id)

        data = await r.get(key)
        if data:
            return json.loads(data)
        return {}

    async def set_user_preferences(
        self,
        user_id: str,
        preferences: dict[str, Any],
    ) -> None:
        """Set user preferences.

        Args:
            user_id: User identifier
            preferences: Preferences to set
        """
        r = await self._get_redis()
        key = self._user_prefs_key(user_id)

        # Merge with existing
        existing = await self.get_user_preferences(user_id)
        existing.update(preferences)

        await r.set(key, json.dumps(existing))

    async def store_memory(
        self,
        session_id: str,
        content: str,
        embedding: list[float],
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Store long-term memory in Qdrant.

        Args:
            session_id: Session identifier
            content: Memory content
            embedding: Embedding vector
            metadata: Additional metadata

        Returns:
            Point ID
        """
        qdrant = await self._get_qdrant()

        import uuid

        point_id = str(uuid.uuid4())

        payload = {
            "session_id": session_id,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
            **(metadata or {}),
        }

        await qdrant.upsert(
            collection_name=self.settings.qdrant_collection,
            points=[
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload=payload,
                )
            ],
        )

        logger.debug("Stored memory", point_id=point_id, session_id=session_id)

        return point_id

    async def search_memories(
        self,
        embedding: list[float],
        session_id: str | None = None,
        limit: int = 5,
        score_threshold: float = 0.7,
    ) -> list[dict[str, Any]]:
        """Search long-term memories.

        Args:
            embedding: Query embedding
            session_id: Optional session filter
            limit: Max results
            score_threshold: Minimum score

        Returns:
            List of matching memories
        """
        qdrant = await self._get_qdrant()

        filter_conditions = None
        if session_id:
            from qdrant_client.models import FieldCondition, Filter, MatchValue

            filter_conditions = Filter(
                must=[
                    FieldCondition(
                        key="session_id",
                        match=MatchValue(value=session_id),
                    )
                ]
            )

        results = await qdrant.search(
            collection_name=self.settings.qdrant_collection,
            query_vector=embedding,
            query_filter=filter_conditions,
            limit=limit,
            score_threshold=score_threshold,
        )

        memories = []
        for hit in results:
            payload = hit.payload or {}
            memories.append(
                {
                    "id": hit.id,
                    "content": payload.get("content", ""),
                    "score": hit.score,
                    "metadata": {k: v for k, v in payload.items() if k != "content"},
                }
            )

        return memories

    async def check_redis_health(self) -> bool:
        """Check Redis health."""
        try:
            r = await self._get_redis()
            await r.ping()
            return True
        except Exception as e:
            logger.warning("Redis health check failed", error=str(e))
            return False

    async def check_qdrant_health(self) -> bool:
        """Check Qdrant health."""
        try:
            qdrant = await self._get_qdrant()
            await qdrant.get_collections()
            return True
        except Exception as e:
            logger.warning("Qdrant health check failed", error=str(e))
            return False


# Global instance (DEPRECATED - CQ-001)
# Use src.container.get_context_manager() instead
_context_manager: ContextManager | None = None


async def get_context_manager() -> ContextManager:
    """
    Get the global context manager instance.

    DEPRECATED: This function uses global state. Use the DI container instead:
        from src.container import get_context_manager

    For new code, inject ContextManager via FastAPI Depends():
        @router.get("/endpoint")
        async def endpoint(context: ContextManager = Depends(get_context_manager)):
            ...
    """
    import warnings
    warnings.warn(
        "get_context_manager() is deprecated. Use src.container.get_context_manager() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    global _context_manager
    if _context_manager is None:
        _context_manager = ContextManager()
    return _context_manager
