#!/usr/bin/env python3
"""Probe the live OpenAlex API and diff it against what the parser expects.

Written because SCHOLARDOCX-0183's parser was built from published documentation
rather than a captured response — the agent environment had no outbound network
access. Run this once on a machine that does, before trusting the enrichment.

    cd backend && python3 scripts/probe_openalex.py "Yann LeCun" "New York University"

It reports three things:
  1. whether the API key in .env is working and what tier it grants,
  2. whether every field the parser reads is actually present, and
  3. what the parser produces from the real payload.

Prints only field names and metric values — never the API key.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass

from app.services.advisor_atlas.openalex import (  # noqa: E402
    OpenAlexClient,
    summarise_activity,
)

# Every field the parser reads. If one is missing from a live response, the
# dossier silently loses it — that is the failure mode this probe exists to catch.
EXPECTED_TOP_LEVEL = (
    "id",
    "orcid",
    "display_name",
    "display_name_alternatives",
    "works_count",
    "cited_by_count",
    "summary_stats",
    "affiliations",
    "last_known_institutions",
    "topics",
    "counts_by_year",
    "ids",
    "works_api_url",
)
EXPECTED_SUMMARY_STATS = ("h_index", "i10_index", "2yr_mean_citedness")


async def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else "Yann LeCun"
    institution = sys.argv[2] if len(sys.argv) > 2 else ""

    key = os.getenv("OPENALEX_API_KEY", "").strip()
    print(f"API key: {'configured (%d chars)' % len(key) if key else 'NOT configured — $0.10/day tier'}")
    print(f"Probing: {name!r} @ {institution!r}\n")

    client = OpenAlexClient(
        api_key=key,
        base_url=os.getenv("OPENALEX_BASE_URL", "https://api.openalex.org"),
    )

    raw = await client._get(
        "authors", {"search": name, "per-page": "3", "select": ",".join(EXPECTED_TOP_LEVEL)}
    )
    if raw is None:
        print("FAILED: no usable response. Check the key, the daily budget, or connectivity.")
        return 1

    results = raw.get("results") or []
    print(f"Results returned: {len(results)}")
    if not results:
        print("No authors matched — try a better-known name to validate the schema.")
        return 1

    author = results[0]
    print(f"Top result: {author.get('display_name')!r}\n")

    print("--- Schema check (top level) ---")
    missing = [field for field in EXPECTED_TOP_LEVEL if field not in author]
    for field in EXPECTED_TOP_LEVEL:
        print(f"  {'OK     ' if field in author else 'MISSING'} {field}")
    stats = author.get("summary_stats")
    if isinstance(stats, dict):
        print("--- Schema check (summary_stats) ---")
        for field in EXPECTED_SUMMARY_STATS:
            print(f"  {'OK     ' if field in stats else 'MISSING'} {field}")
            if field not in stats:
                missing.append(f"summary_stats.{field}")
    unexpected = [field for field in author if field not in EXPECTED_TOP_LEVEL]
    if unexpected:
        print(f"\nFields present but unread by the parser: {unexpected}")

    print("\n--- Parser output ---")
    record = OpenAlexClient.to_scholarly_record(author)
    if not record:
        print("  parser returned None — investigate before enabling enrichment")
        return 1
    for field in (
        "author_id", "display_name", "orcid", "works_count",
        "cited_by_count", "h_index", "i10_index",
    ):
        print(f"  {field:18} {record.get(field)!r}")
    print(f"  topics             {[topic['name'] for topic in record['topics'][:5]]}")
    print(f"  cadence            {record['publication_cadence'][:3]}")
    print(f"  affiliations       {record['affiliation_history'][:3]}")
    print(f"  activity           {summarise_activity(record)!r}")

    print("\n--- Identity resolution (the metered path) ---")
    resolved = await client.resolve_author(name, institution)
    if resolved:
        print(f"  resolved with confidence {resolved.get('match_confidence')}")
    else:
        print("  declined to resolve (below confidence floor or ambiguous)")
        print("  If this is clearly the right person, MIN_MATCH_CONFIDENCE or the")
        print("  institution scoring in openalex.py needs tuning against real data.")

    if missing:
        print(f"\nRESULT: schema drift detected — {missing}")
        print("Update openalex.py's parser to match before relying on enrichment.")
        return 1
    print("\nRESULT: live schema matches the parser's expectations.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
