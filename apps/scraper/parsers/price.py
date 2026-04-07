"""
OffplanIQ — Price Parser
=========================
Parses AED price strings from DLD, Property Finder, and developer sites
into clean integers. Handles all the messy real-world formats found in the wild.

Examples:
    "AED 1,200,000"      → 1200000
    "AED 1.2M"           → 1200000
    "From AED 850K"      → 850000
    "1,980 per sqft"     → 1980  (PSF)
    "Starting at 2,340"  → 2340  (PSF context)
    "AED 3.5 million"    → 3500000
    ""                   → None
    "TBD"                → None
"""

import re
from typing import Optional


def parse_aed(text: str) -> Optional[int]:
    """
    Parse any AED price string into an integer (whole AED, no fils/cents).
    Returns None if text is empty, unparseable, or clearly not a price.
    """
    if not text or not isinstance(text, str):
        return None

    text = text.upper().strip()

    # Remove known non-numeric prefixes
    text = re.sub(r"(STARTING\s+(?:FROM|AT|PRICE)?|FROM|AED|STARTING|PRICE|:|\*)", " ", text)
    text = text.strip()

    if not text or text in ("TBD", "TBC", "COMING SOON", "CALL", "POA", "-", "—"):
        return None

    # Handle "1.2M", "3.5 MILLION", "850K", "1,200,000"
    try:
        # Millions: "1.2M" or "1.2 MILLION"
        m = re.search(r"([\d,]+(?:\.\d+)?)\s*(?:M(?:ILLION)?)\b", text)
        if m:
            return round(float(m.group(1).replace(",", "")) * 1_000_000)

        # Thousands: "850K"
        k = re.search(r"([\d,]+(?:\.\d+)?)\s*K\b", text)
        if k:
            return round(float(k.group(1).replace(",", "")) * 1_000)

        # Plain number (possibly with commas): "1,200,000" or "2340"
        plain = re.sub(r"[^\d.]", "", text.replace(",", ""))
        if plain:
            val = float(plain)
            # Sanity check: AED prices should be between AED 100K and AED 500M
            if 100_000 <= val <= 500_000_000:
                return round(val)

    except (ValueError, AttributeError):
        pass

    return None


def parse_psf(text: str) -> Optional[int]:
    """
    Parse a price-per-sqft string into an integer (AED per sqft).
    Handles: "AED 2,340 per sqft", "2,340/sqft", "2340 psf", "2,340"
    Returns None if unparseable.

    PSF sanity range: AED 500–10,000 (anything outside is likely wrong)
    """
    if not text or not isinstance(text, str):
        return None

    text = text.upper().strip()
    text = re.sub(r"(AED|PER\s+SQFT?|/\s*SQFT?|PSF|SQ\.?\s*FT\.?|:)", " ", text)

    plain = re.sub(r"[^\d.]", "", text.replace(",", ""))
    if not plain:
        return None

    try:
        val = float(plain)
        if 500 <= val <= 10_000:
            return round(val)
    except ValueError:
        pass

    return None


def compute_psf(transaction_value: int, area_sqft: float) -> Optional[int]:
    """
    Compute PSF from a DLD transaction.
    Returns None if inputs are invalid or PSF is out of plausible range.
    """
    if not transaction_value or not area_sqft or area_sqft < 50:
        return None
    psf = transaction_value / area_sqft
    if 300 <= psf <= 15_000:
        return round(psf)
    return None


def parse_price_range(text: str) -> tuple[Optional[int], Optional[int]]:
    """
    Parse a price range string: "AED 1.2M – AED 4.5M" → (1200000, 4500000)
    Also handles: "from AED 850K to AED 2.1M"
    """
    if not text:
        return None, None

    # Split on common range separators
    # Use word boundary for "to" to avoid matching 't' and 'o' individually
    parts = re.split(r"\s*[-–—]\s*|\s+to\s+", text, maxsplit=1)

    if len(parts) == 2:
        return parse_aed(parts[0]), parse_aed(parts[1])
    elif len(parts) == 1:
        val = parse_aed(parts[0])
        return val, None

    return None, None
