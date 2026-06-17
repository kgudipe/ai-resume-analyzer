from __future__ import annotations

import io
import re
import unicodedata

import structlog

log = structlog.get_logger(__name__)
_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_SECTION_HEADERS = {
    "summary",
    "professional summary",
    "experience",
    "work experience",
    "education",
    "skills",
    "technical skills",
    "projects",
    "certifications",
}

# ── Extraction ────────────────────────────────────────────────────────────────

def extract_text_from_pdf(content: bytes) -> str:
    """Extract all text from a PDF byte string using pypdf."""
    import pypdf  # lazy import — not needed for DOCX paths

    reader = pypdf.PdfReader(io.BytesIO(content))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)
    raw = "\n\n".join(pages)
    log.info("parser.pdf", pages=len(reader.pages), chars=len(raw))
    return raw


def extract_text_from_docx(content: bytes) -> str:
    """Extract paragraph text from a DOCX byte string using python-docx."""
    import docx  # lazy import

    doc = docx.Document(io.BytesIO(content))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    raw = "\n\n".join(paragraphs)
    log.info("parser.docx", paragraphs=len(paragraphs), chars=len(raw))
    return raw


def extract_text(filename: str, content: bytes) -> str:
    """
    Dispatch to the right parser based on filename extension.
    Raises ValueError for unsupported types — the router turns this into a 400.
    """
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        raw = extract_text_from_pdf(content)
    elif ext in ("docx", "doc"):
        raw = extract_text_from_docx(content)
    elif ext == "txt":
        raw = content.decode("utf-8", errors="replace")
    else:
        raise ValueError(f"Unsupported file type: .{ext}. Upload PDF, DOCX, or TXT.")

    cleaned = _clean(raw)
    if len(cleaned) < 50:
        raise ValueError("Could not extract meaningful text from this file.")
    return cleaned


def extract_contact_info(text: str) -> tuple[str | None, str | None]:
    """Best-effort extraction of candidate name and email from resume text."""
    email_match = _EMAIL_RE.search(text)
    email = email_match.group(0).lower() if email_match else None

    name = None
    for raw_line in text.splitlines()[:12]:
        line = raw_line.strip(" \t-|•")
        if not line:
            continue
        if _EMAIL_RE.search(line) or any(char.isdigit() for char in line):
            continue
        if line.lower().strip(":") in _SECTION_HEADERS:
            continue
        words = [word for word in re.split(r"\s+", line) if word]
        if 2 <= len(words) <= 5 and all(_looks_like_name_part(word) for word in words):
            name = " ".join(word.capitalize() for word in words)
            break

    return name, email


# ── Cleaning ──────────────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    """Normalise unicode, collapse whitespace, strip junk characters."""
    # NFC normalisation handles ligatures (ﬁ → fi) and smart quotes
    text = unicodedata.normalize("NFC", text)
    # collapse runs of whitespace/newlines to single newlines
    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    # strip null bytes and other control characters (common in PDF extraction)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text.strip()


def _looks_like_name_part(word: str) -> bool:
    cleaned = re.sub(r"[^A-Za-z'-]", "", word)
    return len(cleaned) >= 2 and cleaned.replace("'", "").replace("-", "").isalpha()


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunk_text(
    text: str,
    chunk_size: int = 400,
    overlap: int = 80,
) -> list[str]:
    """
    Split text into overlapping word-boundary chunks.

    chunk_size=400 words keeps each chunk well under the 512-token limit of
    all-MiniLM-L6-v2 while fitting 5 chunks comfortably in the Groq prompt.
    overlap=80 words ensures sentences that straddle a boundary are captured
    in at least one chunk.
    """
    words = text.split()
    if not words:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start += chunk_size - overlap  # slide forward by (size - overlap)

    log.debug("chunker", total_words=len(words), chunks=len(chunks),
              chunk_size=chunk_size, overlap=overlap)
    return chunks
