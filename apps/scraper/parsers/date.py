"""
OffplanIQ — Date Parser
========================
Parses fuzzy handover date strings from Property Finder and developer sites
into ISO date strings (YYYY-MM-DD) or ISO year-month (YYYY-MM).

Real-world examples from PF/developer sites:
    "Q4 2026"                    → "2026-12-01"
    "Q1 2027"                    → "2027-03-01"
    "December 2026"              → "2026-12-01"
    "Dec 2026"                   → "2026-12-01"
    "2026"                       → "2026-06-01"  (mid-year estimate)
    "Expected handover: Q2 2027" → "2027-06-01"
    "Ready"                      → None  (already handed over)
    "TBD"                        → None
    "2025-12-01"                 → "2025-12-01"  (already ISO)
"""

import re
from typing import Optional
from datetime import date


MONTH_NAMES = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

# Q1=Mar, Q2=Jun, Q3=Sep, Q4=Dec (end of quarter = conservative estimate)
QUARTER_MONTH = {1: 3, 2: 6, 3: 9, 4: 12}


def parse_handover_date(text: str) -> Optional[str]:
    """
    Parse a handover date string to ISO YYYY-MM-DD.
    Returns None if text is empty, already passed, or unparseable.
    """
    if not text or not isinstance(text, str):
        return None

    text = text.strip().lower()

    # Already handed over
    if any(w in text for w in ("ready", "completed", "handed over", "tbd", "tbc", "coming soon")):
        return None

    # Already ISO format: YYYY-MM-DD
    iso = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", text)
    if iso:
        return text

    # Quarter format: Q1 2027, Q4 2026, 2026 Q3
    q_match = re.search(r"q([1-4])\s*(\d{4})|(\d{4})\s*q([1-4])", text)
    if q_match:
        if q_match.group(1):
            q, yr = int(q_match.group(1)), int(q_match.group(2))
        else:
            yr, q = int(q_match.group(3)), int(q_match.group(4))
        month = QUARTER_MONTH[q]
        return f"{yr}-{month:02d}-01"

    # Month Year: "December 2026", "Dec 2026", "december 2026"
    for name, month in MONTH_NAMES.items():
        m = re.search(rf"\b{name}\b\s+(\d{{4}})", text)
        if m:
            yr = int(m.group(1))
            return f"{yr}-{month:02d}-01"

    # Year only: "2026", "in 2027"
    yr_match = re.search(r"\b(202[5-9]|203\d)\b", text)
    if yr_match:
        yr = int(yr_match.group(1))
        return f"{yr}-06-01"  # mid-year conservative estimate

    return None


def delay_days(original: Optional[str], current: Optional[str]) -> int:
    """
    Compute number of delay days between original and current handover dates.
    Returns 0 if no delay or dates are unparseable.
    """
    if not original or not current:
        return 0
    try:
        d_orig = date.fromisoformat(original)
        d_curr = date.fromisoformat(current)
        diff   = (d_curr - d_orig).days
        return max(0, diff)
    except ValueError:
        return 0


def is_past_date(iso_date: str) -> bool:
    """Return True if the ISO date has already passed."""
    try:
        return date.fromisoformat(iso_date) < date.today()
    except ValueError:
        return False
