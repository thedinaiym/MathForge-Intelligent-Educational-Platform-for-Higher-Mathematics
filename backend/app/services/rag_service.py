"""
RAG Service — semantic similarity search over TaskTemplate records.

Stack:
  - Embeddings : fastembed BAAI/bge-small-en-v1.5 (ONNX, no torch, ~30 MB)
  - Vector store: Qdrant (remote when QDRANT_URL is set, in-memory otherwise)
  - LangChain   : QdrantVectorStore for unified index/search API

The module-level singleton is created with a failsafe try/except so that a
missing fastembed model, unreachable Qdrant, or any other transient error
NEVER prevents the app from starting (and therefore never blocks the DB seeder).
RAG endpoints return HTTP 503 when the service is unavailable.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, List, Optional

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings as LCEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from app.core.config import settings

if TYPE_CHECKING:
    from app.db.models import TaskTemplate

logger = logging.getLogger(__name__)

_COLLECTION  = "task_templates"
_EMBED_MODEL = "BAAI/bge-small-en-v1.5"
_VECTOR_SIZE = 384   # bge-small-en-v1.5 output dimension


# ── Lightweight embedding wrapper (fastembed, no torch) ───────────────────────

class _FastEmbeddings(LCEmbeddings):
    """
    Minimal LangChain Embeddings wrapper around fastembed.

    The underlying ONNX model is created lazily on first embed call so that
    __init__ never blocks app startup (model download is ~30 MB on first use).
    """

    def __init__(self, model_name: str) -> None:
        self._model_name = model_name
        self._model: Optional[object] = None   # lazy; created on first use

    def _get_model(self):
        if self._model is None:
            from fastembed import TextEmbedding  # noqa: PLC0415
            self._model = TextEmbedding(model_name=self._model_name)
        return self._model

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [v.tolist() for v in self._get_model().embed(texts)]

    def embed_query(self, text: str) -> List[float]:
        return next(self._get_model().embed([text])).tolist()


# ── RAGService ────────────────────────────────────────────────────────────────

class RAGService:
    """
    Singleton RAG service.  Build once at startup; share across requests.

    __init__ is kept cheap — Qdrant collection bootstrap is also failsafe.
    Heavy work (model download, vector upsert) is deferred to the first call
    to index_templates() / search_similar_tasks().
    """

    def __init__(self) -> None:
        self._embeddings = _FastEmbeddings(model_name=_EMBED_MODEL)

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
        try:
            self._ensure_collection()
        except Exception as exc:
            # Qdrant might be starting up — collection will be created on first index.
            logger.warning("RAGService: collection bootstrap skipped: %s", exc)

    # ── Collection bootstrap ──────────────────────────────────────────────────

    def _ensure_collection(self) -> None:
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
        Returns the number of templates indexed.
        """
        if not templates:
            return 0

        docs: list[Document] = []
        for tmpl in templates:
            title   = tmpl.title_translations.get("ru") or tmpl.title_translations.get("en", "")
            topic   = tmpl.template_json.get("topic", "")
            text_ru = (tmpl.template_json.get("texts") or {}).get("ru", "")
            content = f"{title}. {topic}. {text_ru}".strip()

            docs.append(
                Document(
                    page_content=content,
                    metadata={
                        "template_id": str(tmpl.id),
                        "difficulty":  tmpl.difficulty,
                        "category_id": str(tmpl.category_id),
                    },
                )
            )

        self._store = await QdrantVectorStore.afrom_documents(
            documents=docs,
            embedding=self._embeddings,
            collection_name=_COLLECTION,
            url=settings.qdrant_url or None,
            api_key=settings.qdrant_api_key or None,
            **({"client": self._client} if not settings.qdrant_url else {}),
        )

        logger.info("RAGService: indexed %d templates", len(docs))
        return len(docs)

    # ── Search ────────────────────────────────────────────────────────────────

    async def search_similar_tasks(
        self,
        query: str,
        k: int = 5,
        difficulty: str | None = None,
    ) -> list[dict]:
        """Return the k most semantically similar templates for query."""
        if self._store is None:
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
                "difficulty":  doc.metadata.get("difficulty"),
                "category_id": doc.metadata.get("category_id"),
                "score":       round(float(score), 4),
                "snippet":     doc.page_content[:120],
            }
            for doc, score in results
        ]


# ── Module-level singleton ────────────────────────────────────────────────────
# Wrapped in try/except so a transient init error (Qdrant down, model fetch
# failure) NEVER crashes the app on startup.  Routes return HTTP 503 if None.

try:
    rag_service: RAGService | None = RAGService()
    logger.info("RAGService initialised successfully.")
except Exception as _init_exc:
    logger.warning(
        "RAGService init failed — RAG features disabled until restart: %s", _init_exc
    )
    rag_service = None  # type: ignore[assignment]
