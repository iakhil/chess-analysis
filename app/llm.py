import json
import logging
import os
import time
from typing import Any

from openai import OpenAI


logger = logging.getLogger(__name__)


def build_coaching_report(analysis: dict[str, Any]) -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise ValueError("OPENAI_API_KEY is missing")

    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    client = OpenAI(api_key=api_key)

    prompt = (
        "You are a chess coach. Use the engine findings to produce a clear, practical report. "
        "Prioritize recurring patterns, not just one-off move critiques. "
        "Return markdown with sections: Overview, Key Mistakes, Themes, Practice Plan.\n\n"
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
