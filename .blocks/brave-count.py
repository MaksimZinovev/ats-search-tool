#!/usr/bin/env python3
# /// block
# name = "brave-count"
# summary = "Brave result count for a site: query — paged, exact up to 60, else capped. One JSON line."
# effects = "network"  # api.search.brave.com; reads BRAVE_API_KEY from repo .env or environment
# example = ["--q", "site:jobs.lever.co \"qa engineer\" remote"]
# matches = ['api\.search\.brave\.com', 'braveSearch\(']
#
# [returns]
# keys = ["count", "capped", "error"]
# doc = "count = results found (up to 60); capped = true means Brave had more pages beyond 3; on failure exit 1 with error string"
#
# [params]
# q = { type = "str", required = true, help = "Full search query including site:" }
#
# [provenance]
# created = "2026-10-19"
# source = "hand: Python twin of lib.mjs braveSearch (v0 blocks are Python)"
#
# [stamp]
# state = "quarantined"
# ///
import argparse, json, os, sys, time
import urllib.error, urllib.parse, urllib.request

MAX_PAGES = 3

def brave_page(query, key, offset, attempt=0):
    url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode({"q": query, "count": 20, "offset": offset})
    req = urllib.request.Request(url, headers={"X-Subscription-Token": key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 429 and attempt == 0:  # ponytail: one retry, 1.2s backoff
            time.sleep(1.2)
            return brave_page(query, key, offset, 1)
        raise
    results = j.get("web", {}).get("results") or []
    more = bool(j.get("query", {}).get("more_results_available"))
    return results, more

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--q", required=True, help="Full search query including site:")
    a = ap.parse_args()
    out = lambda o, code: (print(json.dumps(o)), sys.exit(code))
    key = os.environ.get("BRAVE_API_KEY", "")
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    if not key and os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("BRAVE_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("\"'")
    if not key:
        out({"error": "BRAVE_API_KEY missing (repo .env or environment)"}, 1)
    count, more = 0, True
    try:
        for offset in range(MAX_PAGES):
            if not more:
                break
            results, more = brave_page(a.q, key, offset)
            count += len(results)
            more = more and len(results) == 20
            if more and offset < MAX_PAGES - 1:
                time.sleep(0.35)  # free tier ~1 qps
        out({"count": count, "capped": more}, 0)
    except Exception as e:
        out({"error": str(e)[:120]}, 1)

main()