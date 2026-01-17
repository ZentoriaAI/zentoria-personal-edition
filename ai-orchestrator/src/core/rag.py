"""RAG (Retrieval Augmented Generation) pipeline."""

from typing import Any

import structlog
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from src.config import Settings, get_settings
from src.core.llm import LLMClient, get_llm_client
from src.core.models import Document

logger = structlog.get_logger(__name__)


class RAGPipeline:
    """RAG pipeline for document retrieval and augmented generation."""

    def __init__(
        self,
        settings: Settings | None = None,
        llm_client: LLMClient | None = None,
    ) -> None:
        """Initialize the RAG pipeline."""
        self.settings = settings or get_settings()
        self._llm: LLMClient | None = llm_client
        self._qdrant: AsyncQdrantClient | None = None
        self._text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.settings.rag_chunk_size,
            chunk_overlap=self.settings.rag_chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    async def _get_llm(self) -> LLMClient:
        """Get LLM client."""
        if self._llm is None:
            self._llm = await get_llm_client()
        return self._llm

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
                "Created Qdrant collection",
                collection=self.settings.qdrant_collection,
            )

    async def close(self) -> None:
        """Close connections."""
        if self._qdrant:
            await self._qdrant.close()

    async def index_document(
        self,
        doc_id: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> int:
        """Index a document by splitting and embedding chunks.

        Args:
            doc_id: Document identifier
            content: Document content
            metadata: Additional metadata

        Returns:
            Number of chunks indexed
        """
        llm = await self._get_llm()
        qdrant = await self._get_qdrant()

        # Split into chunks
        chunks = self._text_splitter.split_text(content)
        logger.debug("Split document", doc_id=doc_id, chunk_count=len(chunks))

        if not chunks:
            return 0

        # Generate embeddings
        embeddings = await llm.embed(chunks)

        # Prepare points
        import uuid

        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = str(uuid.uuid4())
            payload = {
                "doc_id": doc_id,
                "content": chunk,
                "chunk_index": i,
                "total_chunks": len(chunks),
                **(metadata or {}),
            }
            points.append(PointStruct(id=point_id, vector=embedding, payload=payload))

        # Upsert to Qdrant
        await qdrant.upsert(
            collection_name=self.settings.qdrant_collection,
            points=points,
        )

        logger.info(
            "Indexed document",
            doc_id=doc_id,
            chunks=len(chunks),
        )

        return len(chunks)

    async def search(
        self,
        query: str,
        *,
        top_k: int | None = None,
        score_threshold: float | None = None,
        doc_id: str | None = None,
        metadata_filter: dict[str, Any] | None = None,
    ) -> list[Document]:
        """Search for relevant documents.

        Args:
            query: Search query
            top_k: Number of results
            score_threshold: Minimum score
            doc_id: Filter by document ID
            metadata_filter: Additional metadata filters

        Returns:
            List of relevant documents
        """
        llm = await self._get_llm()
        qdrant = await self._get_qdrant()

        top_k = top_k or self.settings.rag_top_k
        score_threshold = score_threshold or self.settings.rag_score_threshold

        # Generate query embedding
        embeddings = await llm.embed([query])
        query_embedding = embeddings[0]

        # Build filters
        filter_conditions = []
        if doc_id:
            filter_conditions.append(
                FieldCondition(key="doc_id", match=MatchValue(value=doc_id))
            )
        if metadata_filter:
            for key, value in metadata_filter.items():
                filter_conditions.append(
                    FieldCondition(key=key, match=MatchValue(value=value))
                )

        query_filter = Filter(must=filter_conditions) if filter_conditions else None

        # Search
        results = await qdrant.search(
            collection_name=self.settings.qdrant_collection,
            query_vector=query_embedding,
            query_filter=query_filter,
            limit=top_k,
            score_threshold=score_threshold,
        )

        # Convert to documents
        documents = []
        for hit in results:
            payload = hit.payload or {}
            doc = Document(
                id=str(hit.id),
                content=payload.get("content", ""),
                metadata={k: v for k, v in payload.items() if k != "content"},
                score=hit.score,
            )
            documents.append(doc)

        logger.debug("Search results", query=query[:50], count=len(documents))

        return documents

    def format_context(self, documents: list[Document]) -> str:
        """Format retrieved documents as context.

        Args:
            documents: Retrieved documents

        Returns:
            Formatted context string
        """
        if not documents:
            return ""

        context_parts = []
        for i, doc in enumerate(documents, 1):
            source = doc.metadata.get("doc_id", "unknown")
            context_parts.append(
                f"[Source {i}: {source}]\n{doc.content}"
            )

        return "\n\n---\n\n".join(context_parts)

    def build_rag_prompt(
        self,
        query: str,
        context: str,
        system_instructions: str | None = None,
    ) -> str:
        """Build a RAG-augmented prompt.

        Args:
            query: User query
            context: Retrieved context
            system_instructions: Optional additional instructions

        Returns:
            Augmented prompt
        """
        parts = []

        if system_instructions:
            parts.append(system_instructions)

        if context:
            parts.append(
                "Use the following context to answer the question. "
                "If the context doesn't contain relevant information, "
                "say so and answer based on your general knowledge.\n\n"
                f"Context:\n{context}"
            )

        parts.append(f"Question: {query}")

        return "\n\n".join(parts)

    async def query(
        self,
        query: str,
        *,
        system_instructions: str | None = None,
        top_k: int | None = None,
        include_citations: bool = True,
    ) -> tuple[str, list[dict[str, Any]]]:
        """Query with RAG augmentation.

        Args:
            query: User query
            system_instructions: Optional system instructions
            top_k: Number of documents to retrieve
            include_citations: Whether to return citations

        Returns:
            Tuple of (response, citations)
        """
        # Retrieve relevant documents
        documents = await self.search(query, top_k=top_k)

        # Format context
        context = self.format_context(documents)

        # Build prompt
        prompt = self.build_rag_prompt(query, context, system_instructions)

        # Generate response
        llm = await self._get_llm()
        response = await llm.generate(prompt)

        # Build citations
        citations = []
        if include_citations:
            for doc in documents:
                citations.append(
                    {
                        "id": doc.id,
                        "source": doc.metadata.get("doc_id", "unknown"),
                        "content": doc.content[:200] + "..."
                        if len(doc.content) > 200
                        else doc.content,
                        "score": doc.score,
                    }
                )

        return response, citations

    async def delete_document(self, doc_id: str) -> int:
        """Delete all chunks of a document.

        Args:
            doc_id: Document identifier

        Returns:
            Number of points deleted
        """
        qdrant = await self._get_qdrant()

        # Get points matching doc_id
        from qdrant_client.models import ScrollRequest

        result = await qdrant.scroll(
            collection_name=self.settings.qdrant_collection,
            scroll_filter=Filter(
                must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))]
            ),
            limit=1000,
            with_payload=False,
            with_vectors=False,
        )

        points, _ = result
        point_ids = [p.id for p in points]

        if point_ids:
            await qdrant.delete(
                collection_name=self.settings.qdrant_collection,
                points_selector=point_ids,
            )
            logger.info("Deleted document", doc_id=doc_id, points=len(point_ids))

        return len(point_ids)


# Global instance (DEPRECATED - CQ-001)
# Use src.container.get_rag_pipeline() instead
_rag_pipeline: RAGPipeline | None = None


async def get_rag_pipeline() -> RAGPipeline:
    """
    Get the global RAG pipeline instance.

    DEPRECATED: This function uses global state. Use the DI container instead:
        from src.container import get_rag_pipeline

    For new code, inject RAGPipeline via FastAPI Depends():
        @router.get("/endpoint")
        async def endpoint(rag: RAGPipeline = Depends(get_rag_pipeline)):
            ...
    """
    import warnings
    warnings.warn(
        "get_rag_pipeline() is deprecated. Use src.container.get_rag_pipeline() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    global _rag_pipeline
    if _rag_pipeline is None:
        _rag_pipeline = RAGPipeline()
    return _rag_pipeline
