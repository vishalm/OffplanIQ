"""
Chunk + embed helpers for the document pipeline.

Chunking strategy:
  - Approx 800 tokens per chunk, 100-token overlap
  - Splits on paragraph boundaries when possible, never mid-word
  - Token counting uses tiktoken (cl100k_base) when available, falls back to a
    cheap len(text)/4 heuristic when not (offline / dev container without tiktoken)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from .azure_openai import embed_batch


CHUNK_TOKENS = 800
OVERLAP_TOKENS = 100
EMBED_BATCH_SIZE = 64       # Azure embeddings handle ~2048 inputs but smaller is safer

try:
    import tiktoken
    _ENC = tiktoken.get_encoding("cl100k_base")

    def count_tokens(text: str) -> int:
        return len(_ENC.encode(text or ""))
except Exception:                              # pragma: no cover — tiktoken optional
    def count_tokens(text: str) -> int:
        return max(1, len(text) // 4)


@dataclass
class Chunk:
    index: int
    text: str
    token_count: int


def _split_paragraphs(text: str) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    parts = re.split(r"\n{2,}|\r\n{2,}", text)
    return [p.strip() for p in parts if p.strip()]


def chunk_text(text: str, *, max_tokens: int = CHUNK_TOKENS, overlap: int = OVERLAP_TOKENS) -> list[Chunk]:
    """Greedy paragraph-aware chunker.

    Walks paragraphs and accumulates them until the running token count would
    exceed max_tokens. Carries the last `overlap` tokens of the previous chunk
    forward to preserve context across boundaries.
    """
    paragraphs = _split_paragraphs(text)
    if not paragraphs:
        return []

    chunks: list[Chunk] = []
    buf: list[str] = []
    buf_tokens = 0
    idx = 0

    for para in paragraphs:
        para_tokens = count_tokens(para)
        if para_tokens > max_tokens:
            # Single paragraph already too long — split on sentences.
            sentences = re.split(r"(?<=[.!?])\s+", para)
            for sent in sentences:
                stoks = count_tokens(sent)
                if buf_tokens + stoks > max_tokens and buf:
                    chunks.append(Chunk(idx, "\n\n".join(buf), buf_tokens))
                    idx += 1
                    buf = _carry_overlap(buf, overlap)
                    buf_tokens = sum(count_tokens(b) for b in buf)
                buf.append(sent)
                buf_tokens += stoks
            continue

        if buf_tokens + para_tokens > max_tokens and buf:
            chunks.append(Chunk(idx, "\n\n".join(buf), buf_tokens))
            idx += 1
            buf = _carry_overlap(buf, overlap)
            buf_tokens = sum(count_tokens(b) for b in buf)

        buf.append(para)
        buf_tokens += para_tokens

    if buf:
        chunks.append(Chunk(idx, "\n\n".join(buf), buf_tokens))
    return chunks


def _carry_overlap(buf: list[str], overlap: int) -> list[str]:
    """Keep the last paragraphs whose combined token count is <= overlap."""
    if overlap <= 0 or not buf:
        return []
    carried: list[str] = []
    running = 0
    for p in reversed(buf):
        t = count_tokens(p)
        if running + t > overlap:
            break
        carried.insert(0, p)
        running += t
    return carried


def embed_chunks(chunks: Iterable[Chunk]) -> list[tuple[Chunk, list[float]]]:
    """Embed all chunks in batches. Returns parallel list of (chunk, vector)."""
    chunk_list = list(chunks)
    if not chunk_list:
        return []
    out: list[tuple[Chunk, list[float]]] = []
    for i in range(0, len(chunk_list), EMBED_BATCH_SIZE):
        batch = chunk_list[i : i + EMBED_BATCH_SIZE]
        vectors = embed_batch([c.text for c in batch])
        out.extend(zip(batch, vectors))
    return out
