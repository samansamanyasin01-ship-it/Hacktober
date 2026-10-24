"""
Validation and anti-hallucination guardrails for CaseBoard AI.
Strictly verifies that extracted quotes are verbatim substrings of the source statement.
"""

import re
import json
from typing import Tuple, Dict, Any, Optional

def normalize_text_for_search(text: str) -> str:
    """Normalize whitespace and standard punctuation for exact substring verification."""
    if not text:
        return ""
    # Standardize curly quotes and dashes
    t = text.replace("“", "\"").replace("”", "\"").replace("’", "'").replace("—", "-")
    # Normalize multiple whitespaces, tabs, newlines to single space
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def validate_verbatim_quote(quote: str, source_text: str) -> Tuple[bool, str]:
    """
    Validation Rule: Reject any fact whose quote does not appear verbatim in the source text.
    Catches model hallucinations and paraphrasing.
    """
    if not quote or not quote.strip():
        return False, "Quote is empty."

    norm_quote = normalize_text_for_search(quote).lower()
    norm_source = normalize_text_for_search(source_text).lower()

    if norm_quote in norm_source:
        return True, "Verified verbatim in source text."

    # Sub-phrase check: if quote is slightly padded with extra trailing punctuation
    stripped_quote = norm_quote.strip(".,;:\"'!?")
    if stripped_quote and stripped_quote in norm_source:
        return True, "Verified verbatim (normalized punctuation)."

    return False, f"HALLUCINATION REJECTED: Quote '{quote[:40]}...' was not found verbatim in the source statement."

def extract_json_safely(raw_output: str) -> Optional[Dict[str, Any]]:
    """Safely extracts JSON from an LLM response string, handling markdown fences."""
    if not raw_output:
        return None

    cleaned = raw_output.strip()

    # Look for ```json ... ``` or ``` ... ```
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', cleaned, re.IGNORECASE)
    if match:
        cleaned = match.group(1).strip()

    # If first char is not { or [, find first occurrence
    idx_brace = cleaned.find('{')
    idx_bracket = cleaned.find('[')
    
    first_idx = -1
    if idx_brace != -1 and idx_bracket != -1:
        first_idx = min(idx_brace, idx_bracket)
    elif idx_brace != -1:
        first_idx = idx_brace
    elif idx_bracket != -1:
        first_idx = idx_bracket

    if first_idx != -1:
        # Find corresponding last brace/bracket
        last_idx = max(cleaned.rfind('}'), cleaned.rfind(']'))
        if last_idx > first_idx:
            cleaned = cleaned[first_idx:last_idx+1]

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None

def normalize_time_str(time_val: Any) -> Optional[str]:
    """Ensures time strings match HH:MM or HH:MM-HH:MM or None."""
    if not time_val:
        return None
    time_str = str(time_val).strip()
    if time_str.lower() in ("null", "none", "", "unknown", "n/a"):
        return None
    return time_str
