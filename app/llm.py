import json
import logging
import os
import time
from typing import Any

from openai import OpenAI


logger = logging.getLogger(__name__)


def build_coaching_report(analysis: dict[str, Any], played_as: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise ValueError("OpenAI API key is missing")
    played_as = played_as.strip()
    if played_as not in {"White", "Black"}:
        raise ValueError("Played side must be White or Black")

    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip()
    client = OpenAI(api_key=api_key)

    prompt = (
        "You are a practical chess coach. "
        "You are given Stockfish-based analysis from the server and should use it heavily. "
        f"The user played as {played_as}. Focus your coaching on that side's decisions, mistakes, plans, and improvements. "
        f"Do not spend equal time coaching the other side unless it directly explains what {played_as} should learn. "
        "Return JSON only. "
        "Base your coaching primarily on the engine findings, emphasizing recurring patterns and actionable fixes. "
        'Return this shape exactly: {"report":"string","coachNotes":[{"ply":number|null,"mover":"White|Black|Unknown","played":"string","theme":"string","explanation":"string"}]}. '
        "The report should be markdown with sections: Overview, Key Mistakes, Themes, Practice Plan. "
        "coachNotes should contain at most 8 concrete moments grounded in the analysis.top_mistakes or analysis.all_reviews data.\n\n"
        f"User played as: {played_as}\n\n"
        f"Engine analysis JSON:\n{json.dumps(analysis, indent=2)}"
    )

    started = time.perf_counter()
    logger.info("OpenAI report generation started (model=%s)", model)
    resp = client.responses.create(
        model=model,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                ],
            }
        ],
        temperature=0.3,
    )

    logger.info("OpenAI report generation completed in %.2fs", time.perf_counter() - started)
    return resp.output_text.strip()
