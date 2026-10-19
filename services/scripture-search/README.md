# Scripture search service

Natural-language verse lookup for Scriptura's **Ask Scripture** panel, running on [Modal](https://modal.com).

You type *"what to do when I'm afraid"*; the service returns the verses closest in meaning. It is
**retrieval, not generation**: a public-domain Bible (KJV) is embedded once, a query is embedded at
request time and matched against it, and the best candidates are re-ranked by a cross-encoder. Each
verse is embedded twice: on its own (so a quoted line finds its exact verse) and together with the two
verses either side (so a description of a story finds it, even though no single verse names everyone
in it). Every reference it returns is a real verse, so it can't invent or misquote one. The
desktop app only receives references (`book`, `chapter`, `verse`) and shows the text from *your* Bible
module.

| | |
|---|---|
| Embedding model | [`Qwen/Qwen3-Embedding-4B`](https://huggingface.co/Qwen/Qwen3-Embedding-4B) (Apache-2.0) |
| Re-ranker | [`BAAI/bge-reranker-v2-m3`](https://huggingface.co/BAAI/bge-reranker-v2-m3) (Apache-2.0) |
| Claude helpers | Claude Haiku 5.5 through the Anthropic API: names the likely passage, then checks every result (optional, see below) |
| Index source | King James Version 1769 (public domain), 31,102 verses |
| GPU | `L4` (set `GPU` in `modal_app.py`) |

## Accuracy: nothing is shown unless it was checked against the real text

A wrong verse on a screen in front of a congregation is worse than no verse, so every search ends with a
**verification pass**. Claude reads the actual KJV text of each shortlisted passage (up to 15) next to what
the person asked for, and rules each one:

- **match**: it is the story, teaching or quotation they described. For a quotation, the verse that really
  contains it.
- **related**: the same subject, but not what they described.
- **no**: dropped, never shown.

Results come back as matches first, then related, each carrying a `confidence` label that the app displays.
The judge is told to be strict, to prefer the lower verdict when unsure, and to treat the person's words as
data rather than instructions. If nothing passes, the app says "No confident match" instead of guessing. If
the check itself can't run (API down, timeout, refusal), results are returned marked **unchecked**, with a
warning in the panel, rather than being passed off as verified.

What this does and doesn't guarantee: every verse is real, the text shown is always from the person's own
module, and nothing is vouched for without Claude having read it. It can't make relevance objective, so
measure it (see *Measuring quality*) and read the "wrong matches" line. Cost is a few hundredths of a cent
per search, and a few seconds of extra time. `VERIFY_MODEL` can be raised to `claude-sonnet-5-5` if the
measured precision isn't high enough. `VERIFY = False` turns the check off.

## The Claude helper (names the story)

Embeddings match wording, not knowledge. "He and his wife lied in the presence of the Lord and died" shares
no words with "Ananias", so on its own the search can miss Acts 5. A small Claude model (Haiku 5.5) reads the
question first and names the passages it most likely means, plus a KJV-style rewrite of the question.

It only **nominates**. Every suggested passage is looked up in the index (a book or chapter that doesn't
exist is dropped, verse numbers are clamped to the real chapter), then scored by the same re-ranker as every
other candidate, with a small bonus because the helper knows stories the embeddings can't. Everything
returned is still a real verse. If the call fails, times out (6 s) or is refused, the search just runs
without it.

**Set it up before you deploy.** Create a key in the [Anthropic Console](https://console.anthropic.com),
then store it as a Modal secret:

```bash
modal secret create scriptura-anthropic ANTHROPIC_API_KEY="sk-ant-..."
```

**Cost.** Each search sends about 400 tokens and gets about 100 back. At Haiku 5.5's listed rates
($0.10 / $0.50 per million tokens, check current pricing) that is roughly **a hundredth of a cent per
search**. It is the only per-search cost besides GPU time, and the daily limits in the Supabase gateway
bound it.

**Privacy.** The text of each question is sent to Anthropic. It is not stored by Scriptura. Say so in your
privacy policy, and check Anthropic's data terms for the API.

**To run without it**, set `LLM_HINTS = False` in `modal_app.py` and redeploy. That turns off the passage
helper *and* the accuracy check (they share the key). No secret is needed and no question leaves Modal,
but results will all be marked unchecked. If hints aren't working, the Modal app's logs show a line starting `[hints] skipped:`
with the reason.

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
This token belongs to *you*: it goes into the Supabase gateway's secrets (see `supabase/README.md`), never
into the app.

1. Open the Modal dashboard → **Settings → Proxy Auth Tokens** → create a token.
2. Copy the **Token ID** (`wk-…`) and **Token Secret** (`ws-…`). The secret is shown once.

## Connect the app

**For everyone else's copy of Scriptura**, set up the account gateway in `supabase/README.md`. People sign
in with their email, and the gateway calls this service for them.

**To use this service directly** (for yourself, or if you're self-hosting): in Scriptura (Presentation
workspace → Live Show), click **Ask** (or press `Ctrl/Cmd+Shift+K`), choose "Use my own search server
instead", then paste the endpoint URL, Token ID and Token Secret. They're stored in
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

## Measuring quality

`eval/queries.json` holds 30 searches with the passages that should come back (stories, quotations,
feelings). Run it before and after any change and compare the numbers instead of judging by a few
examples:

```bash
export ENDPOINT="https://…modal.run" TOKEN_ID="wk-…" TOKEN_SECRET="ws-…"
python eval/eval.py            # hit@1, hit@3, hit@5, hit@10 and MRR; misses are listed
python eval/eval.py -v         # also lists every query's top results
python eval/eval.py --no-hints # the same run without the Claude helper, to see what it adds
python eval/eval.py --no-verify # without the accuracy check, to see how many wrong results it removes
```

The summary line reports **wrong matches**: for every query with a definite answer, the share of results the
service vouched for that fall outside the expected passages. Look at the listed ones before trusting the
number, because a query can have valid answers the file doesn't list. Queries marked `"open": true` (topics
and feelings, which have many right answers) are left out of that count.

Add your own queries to the file as you find ones that fail. The first run after a quiet spell is slow
because of the cold start.

## Changing things

- **Context window.** `WINDOW` in `modal_app.py` is how many verses either side are embedded with each
  verse (default 2). Larger helps long stories and hurts short quotes. Changing it needs a rebuild:
  `modal run modal_app.py`, then `modal deploy modal_app.py`. The service refuses to start on an index
  built with a different window and says so in its logs.
- **Different Bible text for the index.** Edit `BIBLE_URL` / `_load_verses` and re-run
  `modal run modal_app.py`. Use a public-domain or properly licensed text.
- **Different models.** Change `EMBED_MODEL` / `RERANK_MODEL`, re-run the index build (vectors from one
  embedding model aren't compatible with another) and redeploy. The service checks the index against the
  code at start-up and refuses to run on a mismatch, with a message telling you to rebuild.
  `Qwen/Qwen3-Embedding-4B` is the default; `Qwen/Qwen3-Embedding-0.6B` is lighter and `-8B` needs most of
  the L4's memory.
- **Book names.** `BOOKS` in `modal_app.py` must stay in step with `BIBLE_BOOKS` in `src/data/books.ts`;
  the app discards hits whose book name it doesn't recognise.
