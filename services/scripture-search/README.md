# Scripture search service

Natural-language verse lookup for Scriptura's **Ask Scripture** panel, running on [Modal](https://modal.com).

You type *"what to do when I'm afraid"*; the service returns the verses closest in meaning. It is
**retrieval, not generation**: every verse of a public-domain Bible (KJV) is embedded once, a query is
embedded at request time and matched against them, and the best candidates are re-ranked by a
cross-encoder. Every reference it returns is a real verse, so it can't invent or misquote one. The
desktop app only receives references (`book`, `chapter`, `verse`) and shows the text from *your* Bible
module.

| | |
|---|---|
| Embedding model | [`Qwen/Qwen3-Embedding-0.6B`](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) (Apache-2.0) |
| Re-ranker | [`BAAI/bge-reranker-v2-m3`](https://huggingface.co/BAAI/bge-reranker-v2-m3) (Apache-2.0) |
| Index source | King James Version 1769 (public domain), 31,102 verses |
| GPU | `L4` (set `GPU` in `modal_app.py`) |

## Deploy

You need a Modal account and Python 3.10+.

```bash
pip install modal
modal setup                       # one-time login
cd services/scripture-search
modal run modal_app.py            # build the verse index onto a Modal Volume (~2 min)
modal deploy modal_app.py         # publish the endpoint
```

`modal deploy` prints the endpoint URL, which looks like
`https://<workspace>--scriptura-scripture-search-scripturesearch-search.modal.run`.

## Protect it

The endpoint uses Modal **proxy auth**, so anyone without a token gets a 401 and can't run up your bill.

1. Open the Modal dashboard → **Settings → Proxy Auth Tokens** → create a token.
2. Copy the **Token ID** (`wk-…`) and **Token Secret** (`ws-…`). The secret is shown once.

## Connect the app

In Scriptura (Presentation workspace → Live Show), click **Ask** (or press `Ctrl/Cmd+Shift+K`), then
paste the endpoint URL, Token ID and Token Secret into the setup form. They're stored in
`ai_search.json` in the app's data folder, readable only by your user account. The secret never enters
the web view; the request is made by the Rust side of the app.

Check it from a terminal:

```bash
curl -X POST "$ENDPOINT" \
  -H "Modal-Key: $TOKEN_ID" -H "Modal-Secret: $TOKEN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"query": "Jesus calms the storm", "top_k": 5}'
```

## Cost and cold starts

Modal bills GPUs per second, only while a container is running. An L4 is about $0.80 per hour of
running time, so a search-only workload that sits idle most of the week costs very little.

- **Scale to zero (default).** The container shuts down 5 minutes after the last query. The first
  query after that waits for the GPU container to boot and load both models, which can take up to a
  minute. The app sends a silent warm-up ping when you open the panel, so by the time you type, the
  container is usually ready.
- **Always warm for a service.** Set `min_containers=1` in `modal_app.py` and redeploy before a
  service, then set it back to `0` afterwards. Two warm hours on an L4 is roughly $1.60.
- **Cheaper GPU.** Change `GPU = "L4"` to `"T4"` (about 25% less per second). It works for these
  models but is an older architecture; L4 is the better default.

## Changing things

- **Different Bible text for the index.** Edit `BIBLE_URL` / `_load_verses` and re-run
  `modal run modal_app.py`. Use a public-domain or properly licensed text.
- **Different models.** Change `EMBED_MODEL` / `RERANK_MODEL`, re-run the index build (vectors from one
  embedding model aren't compatible with another) and redeploy.
- **Book names.** `BOOKS` in `modal_app.py` must stay in step with `BIBLE_BOOKS` in `src/data/books.ts`;
  the app discards hits whose book name it doesn't recognise.
