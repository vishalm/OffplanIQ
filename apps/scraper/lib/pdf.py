"""
PDF text extraction. Wraps pypdf with sensible defaults.

Returns plain UTF-8 text plus a basic metadata dict. Skips images (Phase 2:
add Tesseract / Azure Document Intelligence for scanned PDFs).
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class PdfExtraction:
    text: str
    page_count: int
    title: Optional[str]
    bytes_size: int


_WS_RE = re.compile(r"[ \t]+")
_NL_RE = re.compile(r"\n{3,}")


def extract_pdf(blob: bytes) -> PdfExtraction:
    """Extract text from a PDF byte blob.

    Returns empty text on parse failure (don't raise — the orchestrator should
    treat unreadable PDFs as a soft skip and move on to the next document).
    """
    if not blob:
        return PdfExtraction(text="", page_count=0, title=None, bytes_size=0)

    try:
        from pypdf import PdfReader   # noqa: WPS433 — optional dep
    except ImportError:
        return PdfExtraction(text="", page_count=0, title=None, bytes_size=len(blob))

    try:
        reader = PdfReader(io.BytesIO(blob))
    except Exception:
        return PdfExtraction(text="", page_count=0, title=None, bytes_size=len(blob))

    pages = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:
            pages.append("")

    text = "\n\n".join(p.strip() for p in pages if p.strip())
    text = _WS_RE.sub(" ", text)
    text = _NL_RE.sub("\n\n", text)

    title = None
    try:
        title = (reader.metadata.title or "").strip() if reader.metadata else None
    except Exception:
        title = None

    return PdfExtraction(
        text=text.strip(),
        page_count=len(reader.pages),
        title=title or None,
        bytes_size=len(blob),
    )
