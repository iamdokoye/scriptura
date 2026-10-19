"""Measure how well the deployed search finds the right passages.

    export ENDPOINT=https://...modal.run TOKEN_ID=wk-... TOKEN_SECRET=ws-...
    python eval/eval.py                 # run every query in queries.json
    python eval/eval.py --top-k 10 -v   # list each query's top results too
    python eval/eval.py --no-hints      # skip the Claude helper, to see what it adds

A query counts as a hit at rank k if one of its first k results falls inside any of the
expected passages. It also measures *wrong* results, which matter as much for a tool shown
to a congregation: for every query that has a definite answer (not marked "open" in
queries.json), the share of results the service vouched for ("match") that fall outside the
expected passages. Run it before and after a change (a rebuilt index, a new model) and
compare the numbers instead of trusting a handful of examples. Standard library only.
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
    """The results the service stands behind. An older service without a confidence field
    vouches for everything it returns."""
    return [r for r in results if r.get("confidence", "match") == "match"]


def search(endpoint: str, key: str, secret: str, query: str, top_k: int, hints: bool = True, verify: bool = True) -> list[dict]:
    req = urllib.request.Request(
        endpoint,
        data=json.dumps({"query": query, "top_k": top_k, "hints": hints, "verify": verify}).encode(),
        headers={"Content-Type": "application/json", "Modal-Key": key, "Modal-Secret": secret},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.load(resp)["results"]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument("-v", "--verbose", action="store_true", help="show every query's results")
    ap.add_argument("--no-hints", action="store_true", help="turn the Claude passage helper off for this run")
    ap.add_argument("--no-verify", action="store_true", help="turn the Claude accuracy check off for this run")
    ap.add_argument("--queries", default=os.path.join(os.path.dirname(__file__), "queries.json"))
    args = ap.parse_args()

    try:
        endpoint, key, secret = (os.environ[n] for n in ("ENDPOINT", "TOKEN_ID", "TOKEN_SECRET"))
    except KeyError as e:
        print(f"Set {e.args[0]} (see the top of this file).", file=sys.stderr)
        return 2

    with open(args.queries) as f:
        cases = json.load(f)

    ranks = []
    wrong = judged = empty = 0
    for case in cases:
        try:
            results = search(endpoint, key, secret, case["query"], args.top_k, hints=not args.no_hints, verify=not args.no_verify)
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"request failed for {case['query']!r}: {e}", file=sys.stderr)
            return 1
        rank = first_hit_rank(results, case["expect"])
        ranks.append(rank)
        if not results:
            empty += 1

        bad = []
        if not case.get("open"):
            vouched_results = vouched(results)
            judged += len(vouched_results)
            bad = [r for r in vouched_results if not is_hit(r, case["expect"])]
            wrong += len(bad)

        mark = f"#{rank}" if rank else "MISS"
        note = f"  !! {len(bad)} wrong match(es)" if bad else ""
        print(f"{mark:>5}  {case['query']}{note}")
        if args.verbose or rank is None or bad:
            for r in results:
                tag = "*" if is_hit(r, case["expect"]) else " "
                conf = r.get("confidence", "")
                print(f"         {tag} {r['book']} {r['chapter']}:{r['verse']}  {conf:<10} ({r['score']})")

    n = len(ranks)
    def at(k): return sum(1 for r in ranks if r is not None and r <= k)
    mrr = sum(1 / r for r in ranks if r) / n
    print(f"\n{n} queries   hit@1 {at(1)}/{n}   hit@3 {at(3)}/{n}   hit@5 {at(5)}/{n}   hit@{args.top_k} {at(args.top_k)}/{n}   MRR {mrr:.3f}")
    if judged:
        print(f"wrong matches: {wrong} of {judged} vouched-for results ({100 * wrong / judged:.1f}%)   no results at all: {empty} queries")
        print("(a 'wrong' match is one outside the passages in queries.json; check the listed ones before trusting this number,")
        print(" since a query can have valid answers the file doesn't list)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
