"""Evaluate the Ask Scripture search gateway with the 30 benchmark queries.

Usage:
    export GATEWAY_URL=https://...supabase.co/functions/v1/search
    export AUTH_TOKEN=eyJhbGciOi...

    python services/scripture-search/eval/eval_gateway.py
    python services/scripture-search/eval/eval_gateway.py --top-k 10 -v
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

REF = re.compile(r"^(?P<book>.+?) (?P<chapter>\d+)(?::(?P<start>\d+)(?:-(?P<end>\d+))?)?$")


def parse_expected(text: str):
    """'Acts 5:1-11' → (book, chapter, first, last); 'John 3:16' → one verse; 'Psalms 23' → whole chapter."""
    m = REF.match(text.strip())
    if not m:
        raise ValueError(f"can't read expected passage: {text!r}")
    start = int(m["start"]) if m["start"] else 1
    end = int(m["end"]) if m["end"] else (start if m["start"] else 10_000)
    return m["book"], int(m["chapter"]), start, end


def is_hit(result: dict, expected: list[str]) -> bool:
    for text in expected:
        book, chapter, start, end = parse_expected(text)
        if result["book"] == book and result["chapter"] == chapter and start <= result["verse"] <= end:
            return True
    return False


def first_hit_rank(results: list[dict], expected: list[str]):
    """1-based rank of the first result inside an expected passage, or None."""
    for rank, r in enumerate(results, start=1):
        if is_hit(r, expected):
            return rank
    return None


def vouched(results: list[dict]) -> list[dict]:
    return [r for r in results if r.get("confidence", "match") == "match"]


def search_gateway(url: str, token: str, query: str, top_k: int) -> list[dict]:
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": query, "top_k": top_k}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)["results"]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument("-v", "--verbose", action="store_true", help="show every query's results")
    ap.add_argument("--queries", default=os.path.join(os.path.dirname(__file__), "queries.json"))
    args = ap.parse_args()

    url = os.environ.get("GATEWAY_URL")
    token = os.environ.get("AUTH_TOKEN")

    if not url or not token:
        print("Please set GATEWAY_URL and AUTH_TOKEN environment variables.", file=sys.stderr)
        print("Example: export GATEWAY_URL=https://<project-ref>.supabase.co/functions/v1/search AUTH_TOKEN=ey...", file=sys.stderr)
        return 2

    with open(args.queries) as f:
        cases = json.load(f)

    ranks = []
    wrong = judged = empty = 0

    print(f"Evaluating {len(cases)} queries against gateway at {url} (top_k={args.top_k})...\n")

    for case in cases:
        try:
            results = search_gateway(url, token, case["query"], args.top_k)
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"Request failed for {case['query']!r}: {e}", file=sys.stderr)
            return 1

        rank = first_hit_rank(results, case["expect"])
        ranks.append(rank)
        if not results:
            empty += 1

        bad = []
        if not case.get("open", False):
            vouched_hits = vouched(results)
            judged += len(vouched_hits)
            for r in vouched_hits:
                if not is_hit(r, case["expect"]):
                    wrong += 1
                    bad.append(r)

        if args.verbose:
            tag = f"hit @ {rank}" if rank else "miss"
            print(f"{case['query']!r}: {tag}")
            for r in results:
                ref = f"{r['book']} {r['chapter']}:{r['verse']}"
                if r.get("end_verse"):
                    ref += f"-{r['end_verse']}"
                conf = f" [{r['confidence']}]" if "confidence" in r else ""
                mark = " (WRONG)" if r in bad else ""
                print(f"  {r['score']:.3f}  {ref:<18}{conf}{mark}")
            print()

    # Metrics
    for k in (1, 3, 5, 10):
        hits = sum(1 for r in ranks if r is not None and r <= k)
        print(f"hit@{k:<2} = {hits / len(cases):.1%}  ({hits}/{len(cases)})")

    mrr = sum((1.0 / r) for r in ranks if r is not None) / len(cases)
    print(f"MRR    = {mrr:.3f}")
    if empty:
        print(f"empty  = {empty}/{len(cases)}")
    if judged:
        print(f"wrong matches = {wrong / judged:.1%}  ({wrong}/{judged} vouched results)")
    else:
        print("wrong matches = n/a (no vouched results on closed queries)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
