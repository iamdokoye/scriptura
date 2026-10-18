"""Scriptura scripture search — natural-language verse lookup, deployed on Modal.

This is *retrieval*, not generation. The service embeds every verse of a public-domain
Bible once, and at query time finds the verses closest in meaning to what was typed,
then re-ranks the best candidates with a cross-encoder. Every reference it returns is a
real verse that exists in the index, so it cannot invent or misquote a reference the way
a chat model reciting from memory can. The desktop app resolves the returned references
against the user's own Bible module, so the text shown is always the translation in use.

    modal run   modal_app.py             # build the verse index (once, ~2 min on an L4)
    modal serve modal_app.py             # hot-reloading dev endpoint
    modal deploy modal_app.py            # production endpoint

See README.md for the full setup, including creating the proxy auth token.
"""

import json
import urllib.request

import modal

APP_NAME = "scriptura-scripture-search"

# Bi-encoder that turns verses and queries into vectors (Apache-2.0).
EMBED_MODEL = "Qwen/Qwen3-Embedding-0.6B"
# Cross-encoder that re-scores the top candidates against the query (Apache-2.0).
RERANK_MODEL = "BAAI/bge-reranker-v2-m3"

# The 1769 King James Version is public domain, so the index can live on your own volume
# without any licensing question. Its archaic English matches modern questions a little
# less well than a modern translation would; the re-ranker makes up much of the gap.
BIBLE_URL = "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJV.json"

# L4: 24 GB, bf16/fp16-capable, and roughly a third cheaper per second than an A10.
# Both models together need ~3 GB, so anything bigger is wasted money.
GPU = "L4"

DATA_DIR = "/data"
INDEX_DIR = f"{DATA_DIR}/index"

QUERY_TASK = "Given a topic, question or description, retrieve Bible verses that speak to it"
MAX_QUERY_CHARS = 500
MAX_TOP_K = 25
CANDIDATES = 60  # how many embedding hits get re-ranked

# Keep in step with BIBLE_BOOKS in src/data/books.ts: the app matches results by name.
BOOKS = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
    "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
    "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
    "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
    "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
    "Haggai", "Zechariah", "Malachi",
    "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
    "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
    "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
    "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews",
    "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
    "Jude", "Revelation",
]

app = modal.App(APP_NAME)
volume = modal.Volume.from_name("scriptura-search-data", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch==2.7.1",
        "transformers>=4.51.0",
        "sentence-transformers>=3.4.0",
        "numpy",
        "fastapi[standard]",
    )
    .env({"HF_HOME": f"{DATA_DIR}/hf"})  # model weights are cached on the volume
)


def _load_verses() -> list[dict]:
    """Download the KJV and flatten it to [{book, chapter, verse, text}, ...]."""
    with urllib.request.urlopen(BIBLE_URL, timeout=60) as resp:
        data = json.load(resp)

    books = data["books"]
    if len(books) != len(BOOKS):
        raise RuntimeError(f"expected {len(BOOKS)} books, source has {len(books)}")

    verses = []
    for name, book in zip(BOOKS, books):  # both are in canonical order
        for chapter in book["chapters"]:
            for v in chapter["verses"]:
                # The KJV marks translator-supplied words as [word]; drop the brackets.
                text = " ".join(v["text"].replace("[", "").replace("]", "").split())
                if text:
                    verses.append(
                        {"book": name, "chapter": chapter["chapter"], "verse": v["verse"], "text": text}
                    )
    return verses


@app.function(image=image, gpu=GPU, volumes={DATA_DIR: volume}, timeout=30 * 60)
def build_index():
    """Embed every verse and write the index to the volume. Re-run to rebuild."""
    import os

    import numpy as np
    import torch
    from sentence_transformers import SentenceTransformer

    verses = _load_verses()
    print(f"embedding {len(verses)} verses with {EMBED_MODEL}")

    model = SentenceTransformer(
        EMBED_MODEL, device="cuda", model_kwargs={"torch_dtype": torch.float16}
    )
    vectors = model.encode(
        [v["text"] for v in verses],
        batch_size=128,
        normalize_embeddings=True,
        show_progress_bar=True,
    )

    os.makedirs(INDEX_DIR, exist_ok=True)
    np.save(f"{INDEX_DIR}/vectors.npy", vectors.astype("float16"))
    with open(f"{INDEX_DIR}/verses.json", "w") as f:
        json.dump(verses, f)
    volume.commit()
    print(f"wrote index: {vectors.shape}")


@app.local_entrypoint()
def main():
    build_index.remote()


@app.cls(
    image=image,
    gpu=GPU,
    volumes={DATA_DIR: volume},
    # Scale to zero between services; a container stays up 5 minutes after the last
    # query so a burst of searches during a sermon only pays one cold start. For a
    # live service, raise min_containers to 1 for the hours you need it (see README).
    scaledown_window=300,
    min_containers=0,
    # Hard ceiling on spend: one L4 running all day is about $19, however much traffic
    # arrives. Raise it if searches start queueing at peak times.
    max_containers=1,
)
@modal.concurrent(max_inputs=8)
class ScriptureSearch:
    @modal.enter()
    def load(self):
        import numpy as np
        import torch
        from sentence_transformers import CrossEncoder, SentenceTransformer

        self.embedder = SentenceTransformer(
            EMBED_MODEL, device="cuda", model_kwargs={"torch_dtype": torch.float16}
        )
        self.reranker = CrossEncoder(
            RERANK_MODEL,
            device="cuda",
            max_length=512,
            model_kwargs={"torch_dtype": torch.float16},
        )
        self.vectors = np.load(f"{INDEX_DIR}/vectors.npy").astype("float32")
        with open(f"{INDEX_DIR}/verses.json") as f:
            self.verses = json.load(f)
        if len(self.verses) != len(self.vectors):
            raise RuntimeError("index is corrupt: verse and vector counts differ; rebuild it")

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def search(self, body: dict):
        import numpy as np
        from fastapi import HTTPException

        query = body.get("query")
        if not isinstance(query, str):
            raise HTTPException(status_code=422, detail="'query' must be a string")
        query = " ".join(query.split())[:MAX_QUERY_CHARS]

        # An empty query is the app's warm-up ping: it waits for @modal.enter to finish,
        # so by the time the user types, the container is ready.
        if not query:
            return {"results": []}

        top_k = body.get("top_k", 10)
        if not isinstance(top_k, int) or isinstance(top_k, bool):
            raise HTTPException(status_code=422, detail="'top_k' must be an integer")
        top_k = max(1, min(top_k, MAX_TOP_K))

        q = self.embedder.encode(
            [query], prompt=f"Instruct: {QUERY_TASK}\nQuery:", normalize_embeddings=True
        )[0].astype("float32")
        sims = self.vectors @ q
        n = min(CANDIDATES, len(sims))
        cand = np.argpartition(-sims, n - 1)[:n]

        pairs = [(query, self.verses[i]["text"]) for i in cand]
        scores = self.reranker.predict(pairs, batch_size=32)
        order = np.argsort(-np.asarray(scores))[:top_k]

        results = []
        for rank in order:
            v = self.verses[int(cand[rank])]
            results.append(
                {
                    "book": v["book"],
                    "chapter": v["chapter"],
                    "verse": v["verse"],
                    "score": round(float(scores[rank]), 4),
                }
            )
        return {"results": results}
