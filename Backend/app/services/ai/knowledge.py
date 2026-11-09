"""Approved-document retrieval for the Legal AI (RAG without an embeddings service).

Thai has no spaces between words, so documents and queries are compared as character 3-gram TF-IDF vectors,
which needs no Thai word segmenter and works for mixed Thai/English text.
"""

import math
import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parents[2] / "knowledge"
N = 3


@dataclass(frozen=True)
class Source:
    id: str
    title: str
    text: str
    kind: str  # "policy" | "contract"


def _grams(text: str) -> Counter:
    t = re.sub(r"\s+", " ", text.lower()).strip()
    return Counter(t[i:i + N] for i in range(max(0, len(t) - N + 1)))


@lru_cache
def corpus() -> list[Source]:
    out = []
    for path in sorted(KNOWLEDGE_DIR.glob("*.md")):
        doc_title = ""
        section, buf, n = "", [], 0

        def flush():
            nonlocal n
            body = " ".join(buf).strip()
            if section and body:
                n += 1
                out.append(Source(f"{path.stem}#{n}", f"{doc_title} — {section}", body, "policy"))

        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("# "):
                doc_title = line[2:].strip()
            elif line.startswith("## "):
                flush()
                section, buf = line[3:].strip(), []
            elif line.strip():
                buf.append(line.strip())
        flush()
    return out


@lru_cache
def _index() -> tuple[list[Counter], dict[str, float]]:
    vectors = [_grams(s.title + " " + s.text) for s in corpus()]
    df = Counter(g for v in vectors for g in v)
    idf = {g: math.log((1 + len(vectors)) / (1 + c)) + 1 for g, c in df.items()}
    return vectors, idf


def _cosine(a: Counter, b: Counter, idf: dict[str, float]) -> float:
    dot = sum(a[g] * b[g] * idf.get(g, 1.0) ** 2 for g in a.keys() & b.keys())
    na = math.sqrt(sum((c * idf.get(g, 1.0)) ** 2 for g, c in a.items()))
    nb = math.sqrt(sum((c * idf.get(g, 1.0)) ** 2 for g, c in b.items()))
    return dot / (na * nb) if na and nb else 0.0


def search(query: str, k: int = 5) -> list[Source]:
    vectors, idf = _index()
    q = _grams(query)
    scored = sorted(zip(corpus(), (_cosine(q, v, idf) for v in vectors)), key=lambda x: x[1], reverse=True)
    return [s for s, score in scored[:k] if score > 0]
