"""
RAG Service — semantic similarity search over TaskTemplate records.

Stack:
  - Embeddings : HuggingFaceEmbeddings (sentence-transformers/all-MiniLM-L6-v2)
  - Vector store: Qdrant (remote when QDRANT_URL is set, in-memory otherwise)
  - LangChain   : QdrantVectorStore for unified index/search API

Collection name: "task_templates"

Usage:
    service = RAGService()
    await service.index_templates(templates)           # rebuild index
    results = await service.search_similar_tasks(query, k=5)
"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from app.core.config import settings

if TYPE_CHECKING:
    from app.db.models import TaskTemplate

logger = logging.getLogger(__name__)

_COLLECTION = "task_templates"
_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
_VECTOR_SIZE = 384  # all-MiniLM-L6-v2 output dimension


class RAGService:
    """
    Singleton-friendly service.  Build once at startup; share across requests.

    Attributes
    ----------
    _embeddings : HuggingFaceEmbeddings
        Local CPU-friendly transformer model (~80 MB download on first use).
    _client : QdrantClient
        Remote client when QDRANT_URL is configured; in-memory otherwise.
    _store : QdrantVectorStore | None
        Lazily initialised after the first call to `index_templates`.
    """

    def __init__(self) -> None:
        self._embeddings = HuggingFaceEmbeddings(
            model_name=_EMBED_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )

        if settings.qdrant_url:
            self._client = QdrantClient(
                url=settings.qdrant_url,
                api_key=settings.qdrant_api_key or None,
            )
            logger.info("RAGService: connected to remote Qdrant at %s", settings.qdrant_url)
        else:
            self._client = QdrantClient(":memory:")
            logger.warning(
                "RAGService: QDRANT_URL not set — using in-memory store. "
                "Index will be lost on restart."
            )

        self._store: QdrantVectorStore | None = None
        self._ensure_collection()

    # ── Collection bootstrap ──────────────────────────────────────────────────

    def _ensure_collection(self) -> None:
        """Create the Qdrant collection if it does not exist yet."""
        existing = {c.name for c in self._client.get_collections().collections}
        if _COLLECTION not in existing:
            self._client.create_collection(
                collection_name=_COLLECTION,
                vectors_config=VectorParams(size=_VECTOR_SIZE, distance=Distance.COSINE),
            )
            logger.info("RAGService: created Qdrant collection '%s'", _COLLECTION)

    # ── Indexing ──────────────────────────────────────────────────────────────

    async def index_templates(self, templates: list["TaskTemplate"]) -> int:
        """
        (Re-)index a list of TaskTemplate ORM records into Qdrant.

        Each template is represented as a LangChain Document whose:
          - page_content = "<title_ru>. <topic>. <text_ru>"
          - metadata     = {"template_id": "<uuid>", "difficulty": "easy|medium|hard"}

        Existing points with the same IDs are upserted (overwritten).

        Returns
        -------
        int
            Number of templates successfully indexed.
        """
        if not templates:
            return 0

        docs: list[Document] = []
        for tmpl in templates:
            title = tmpl.title_translations.get("ru") or tmpl.title_translations.get("en", "")
            topic = tmpl.template_json.get("topic", "")
            text_ru = (tmpl.template_json.get("texts") or {}).get("ru", "")
            content = f"{title}. {topic}. {text_ru}".strip()

            docs.append(
                Document(
                    page_content=content,
                    metadata={
                        "template_id": str(tmpl.id),
                        "difficulty": tmpl.difficulty,
                        "category_id": str(tmpl.category_id),
                    },
                )
            )

        # QdrantVectorStore.from_documents recreates the store with upsert semantics
        self._store = await QdrantVectorStore.afrom_documents(
            documents=docs,
            embedding=self._embeddings,
            collection_name=_COLLECTION,
            url=settings.qdrant_url or None,
            api_key=settings.qdrant_api_key or None,
            # For in-memory: pass client directly
            **({"client": self._client} if not settings.qdrant_url else {}),
        )

        logger.info("RAGService: indexed %d templates into Qdrant", len(docs))
        return len(docs)

    # ── Search ────────────────────────────────────────────────────────────────

    async def search_similar_tasks(
        self,
        query: str,
        k: int = 5,
        difficulty: str | None = None,
    ) -> list[dict]:
        """
        Find the `k` most semantically similar templates for a free-text `query`.

        Parameters
        ----------
        query      : natural-language description of the desired task type
        k          : max results to return
        difficulty : optional filter — 'easy' | 'medium' | 'hard'

        Returns
        -------
        list of dicts with keys: template_id, difficulty, category_id, score, snippet
        """
        if self._store is None:
            # Store not yet initialised — return empty rather than crash
            logger.warning("RAGService.search called before index_templates was run")
            return []

        filter_kwargs: dict = {}
        if difficulty:
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            filter_kwargs["filter"] = Filter(
                must=[FieldCondition(key="metadata.difficulty", match=MatchValue(value=difficulty))]
            )

        results = await self._store.asimilarity_search_with_score(
            query, k=k, **filter_kwargs
        )

        return [
            {
                "template_id": doc.metadata["template_id"],
                "difficulty": doc.metadata.get("difficulty"),
                "category_id": doc.metadata.get("category_id"),
                "score": round(float(score), 4),
                "snippet": doc.page_content[:120],
            }
            for doc, score in results
        ]


# ── Module-level singleton (imported by the router) ───────────────────────────

rag_service = RAGService()
