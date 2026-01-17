"""Search agent for RAG-powered document search."""

from typing import Any

import structlog

from src.agents.base import BaseAgent
from src.core.models import AgentType, Message
from src.core.rag import RAGPipeline, get_rag_pipeline

logger = structlog.get_logger(__name__)


class SearchAgent(BaseAgent):
    """Agent for RAG-powered document search."""

    agent_type = AgentType.SEARCH
    description = "document search and information retrieval"
    capabilities = [
        "Search indexed documents",
        "Answer questions from knowledge base",
        "Find relevant information",
        "Provide citations for sources",
        "Index new documents",
        "Delete indexed documents",
    ]
    model = "llama3.2:8b"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        """Initialize search agent."""
        super().__init__(*args, **kwargs)
        self._rag: RAGPipeline | None = None

    async def _get_rag(self) -> RAGPipeline:
        """Get RAG pipeline."""
        if self._rag is None:
            self._rag = await get_rag_pipeline()
        return self._rag

    def _build_system_prompt(self) -> str:
        """Build the system prompt for search agent."""
        return """You are a knowledge assistant that helps users find information in indexed documents.

You can:
- Search for relevant documents
- Answer questions using the knowledge base
- Provide citations for your answers
- Index new documents
- Explain what information is available

When answering questions:
- Use only information from the retrieved documents
- Always cite your sources
- If information isn't available, say so clearly
- Be accurate and concise"""

    async def _parse_search_intent(
        self,
        message: str,
    ) -> dict[str, Any]:
        """Parse user message to extract search intent.

        Args:
            message: User message

        Returns:
            Dict with action and parameters
        """
        llm = await self._get_llm()

        prompt = f"""Analyze this search/knowledge request and extract:
1. action: one of [search, question, index, delete, list]
2. query: the search query or question
3. doc_id: document ID (if indexing or deleting)
4. content: document content (if indexing)
5. top_k: number of results (if specified)

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

        # Default to question/search
        return {"action": "question", "query": message}

    async def execute(
        self,
        message: str,
        *,
        context: list[Message] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """Execute search operation.

        Args:
            message: User message
            context: Conversation context
            parameters: Additional parameters

        Returns:
            Tuple of (response, metadata)
        """
        params = parameters or {}

        if "action" not in params:
            intent = await self._parse_search_intent(message)
            params.update(intent)

        action = params.get("action", "question")
        query = params.get("query", message)
        logger.info("Search action", action=action, query=query[:50])

        try:
            if action == "search":
                result = await self._search_documents(query, params)
            elif action == "question":
                result = await self._answer_question(query, params)
            elif action == "index":
                result = await self._index_document(params)
            elif action == "delete":
                result = await self._delete_document(params)
            elif action == "list":
                result = await self._list_documents()
            else:
                result = await self._answer_question(query, params)

        except Exception as e:
            result = {"error": str(e)}

        if "error" in result:
            response = f"Error: {result['error']}"
            citations = []
        else:
            response = result.get("message", "Search completed.")
            citations = result.get("citations", [])

        metadata = {
            "action": action,
            "query": query,
            "success": "error" not in result,
            "citations": citations,
            "documents_found": result.get("count", 0),
        }

        return response, metadata

    async def _search_documents(
        self,
        query: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """Search for documents.

        Args:
            query: Search query
            params: Search parameters

        Returns:
            Result dict
        """
        rag = await self._get_rag()
        top_k = params.get("top_k", self.settings.rag_top_k)

        documents = await rag.search(query, top_k=top_k)

        if not documents:
            return {
                "message": f"No documents found matching '{query}'.",
                "count": 0,
                "citations": [],
            }

        doc_list = []
        citations = []
        for i, doc in enumerate(documents, 1):
            score_pct = int((doc.score or 0) * 100)
            doc_id = doc.metadata.get("doc_id", "unknown")
            preview = doc.content[:150] + "..." if len(doc.content) > 150 else doc.content

            doc_list.append(f"{i}. **{doc_id}** (relevance: {score_pct}%)\n   {preview}")
            citations.append({
                "index": i,
                "doc_id": doc_id,
                "content": doc.content,
                "score": doc.score,
            })

        return {
            "message": f"**Search Results for '{query}':**\n\n" + "\n\n".join(doc_list),
            "count": len(documents),
            "citations": citations,
        }

    async def _answer_question(
        self,
        query: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """Answer a question using RAG.

        Args:
            query: User question
            params: Query parameters

        Returns:
            Result dict
        """
        rag = await self._get_rag()

        system_instructions = (
            "You are a helpful assistant answering questions based on the provided context. "
            "If the context doesn't contain relevant information, say so and provide a general answer if possible. "
            "Always be accurate and cite your sources."
        )

        try:
            response, citations = await rag.query(
                query,
                system_instructions=system_instructions,
                top_k=params.get("top_k"),
            )

            # Format citations
            if citations:
                citation_text = "\n\n**Sources:**\n" + "\n".join(
                    f"[{i+1}] {c['source']}" for i, c in enumerate(citations)
                )
                response = response + citation_text

            return {
                "message": response,
                "citations": citations,
                "count": len(citations),
            }

        except Exception as e:
            # Fallback to direct LLM without RAG
            logger.warning("RAG query failed, falling back to LLM", error=str(e))
            llm = await self._get_llm()
            response = await llm.generate(
                f"Answer this question: {query}",
                system_prompt=system_instructions,
            )
            return {
                "message": response + "\n\n*Note: Answered without document context.*",
                "citations": [],
                "count": 0,
            }

    async def _index_document(self, params: dict[str, Any]) -> dict[str, Any]:
        """Index a new document.

        Args:
            params: Document parameters

        Returns:
            Result dict
        """
        doc_id = params.get("doc_id")
        content = params.get("content")

        if not doc_id:
            return {"error": "Please specify a document ID"}
        if not content:
            return {"error": "Please provide document content to index"}

        rag = await self._get_rag()

        try:
            chunks = await rag.index_document(doc_id, content)
            return {
                "message": f"**Document Indexed**\n\n"
                f"- Document ID: {doc_id}\n"
                f"- Chunks created: {chunks}\n"
                f"- Status: Indexed and searchable",
                "count": chunks,
            }
        except Exception as e:
            return {"error": f"Failed to index document: {str(e)}"}

    async def _delete_document(self, params: dict[str, Any]) -> dict[str, Any]:
        """Delete an indexed document.

        Args:
            params: Document parameters

        Returns:
            Result dict
        """
        doc_id = params.get("doc_id")

        if not doc_id:
            return {"error": "Please specify a document ID to delete"}

        rag = await self._get_rag()

        try:
            deleted = await rag.delete_document(doc_id)
            return {
                "message": f"**Document Deleted**\n\n"
                f"- Document ID: {doc_id}\n"
                f"- Chunks removed: {deleted}",
                "count": deleted,
            }
        except Exception as e:
            return {"error": f"Failed to delete document: {str(e)}"}

    async def _list_documents(self) -> dict[str, Any]:
        """List indexed documents.

        Returns:
            Result dict
        """
        # This would need a separate implementation to track document metadata
        # For now, return a placeholder
        return {
            "message": "**Indexed Documents:**\n\n"
            "Document listing requires metadata tracking.\n"
            "Use search to find specific content.",
            "count": 0,
        }
