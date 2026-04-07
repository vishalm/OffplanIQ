"""
OffplanIQ — Scraper Parsers
============================
Pure parsing utilities shared across all scrapers.
No Playwright or network calls here — input is raw strings, output is clean data.

Import in any scraper:
    from parsers.price import parse_aed, parse_psf
    from parsers.date import parse_handover_date
"""
