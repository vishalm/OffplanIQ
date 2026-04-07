"""Tests for apps/scraper/parsers/date.py"""
import pytest
import sys
import os

# Add parent dir to path so we can import parsers
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from parsers.date import parse_handover_date, delay_days, is_past_date


class TestParseHandoverDate:
    """Test fuzzy date parsing from property listings."""

    # Quarter formats
    def test_q4_2026(self):
        assert parse_handover_date("Q4 2026") == "2026-12-01"

    def test_q1_2027(self):
        assert parse_handover_date("Q1 2027") == "2027-03-01"

    def test_q2_2027(self):
        assert parse_handover_date("Q2 2027") == "2027-06-01"

    def test_q3_2026(self):
        assert parse_handover_date("Q3 2026") == "2026-09-01"

    def test_year_first_quarter(self):
        assert parse_handover_date("2026 Q3") == "2026-09-01"

    # Month Year formats
    def test_full_month_name(self):
        assert parse_handover_date("December 2026") == "2026-12-01"

    def test_abbreviated_month(self):
        assert parse_handover_date("Dec 2026") == "2026-12-01"

    def test_lowercase_month(self):
        assert parse_handover_date("december 2026") == "2026-12-01"

    def test_january(self):
        assert parse_handover_date("January 2027") == "2027-01-01"

    def test_sept_abbreviation(self):
        assert parse_handover_date("Sept 2026") == "2026-09-01"

    # Year only
    def test_year_only(self):
        assert parse_handover_date("2026") == "2026-06-01"

    def test_year_in_sentence(self):
        assert parse_handover_date("Expected handover: 2027") == "2027-06-01"

    # ISO passthrough
    def test_iso_format(self):
        assert parse_handover_date("2025-12-01") == "2025-12-01"

    # Special values → None
    def test_ready(self):
        assert parse_handover_date("Ready") is None

    def test_completed(self):
        assert parse_handover_date("Completed") is None

    def test_tbd(self):
        assert parse_handover_date("TBD") is None

    def test_tbc(self):
        assert parse_handover_date("tbc") is None

    def test_coming_soon(self):
        assert parse_handover_date("Coming Soon") is None

    def test_handed_over(self):
        assert parse_handover_date("Handed Over") is None

    # Edge cases
    def test_empty_string(self):
        assert parse_handover_date("") is None

    def test_none_input(self):
        assert parse_handover_date(None) is None

    def test_non_string(self):
        assert parse_handover_date(12345) is None

    def test_garbage(self):
        assert parse_handover_date("foobar") is None

    def test_with_prefix_text(self):
        assert parse_handover_date("Expected handover: Q2 2027") == "2027-06-01"


class TestDelayDays:
    """Test handover delay computation."""

    def test_positive_delay(self):
        assert delay_days("2026-06-01", "2026-09-01") == 92

    def test_no_delay(self):
        assert delay_days("2026-06-01", "2026-06-01") == 0

    def test_early_delivery(self):
        # Current before original → no delay (clamped to 0)
        assert delay_days("2026-06-01", "2026-03-01") == 0

    def test_null_original(self):
        assert delay_days(None, "2026-09-01") == 0

    def test_null_current(self):
        assert delay_days("2026-06-01", None) == 0

    def test_both_null(self):
        assert delay_days(None, None) == 0

    def test_invalid_dates(self):
        assert delay_days("not-a-date", "also-not") == 0


class TestIsPastDate:
    """Test date comparison."""

    def test_past_date(self):
        assert is_past_date("2020-01-01") is True

    def test_future_date(self):
        assert is_past_date("2030-01-01") is False

    def test_invalid_date(self):
        assert is_past_date("not-a-date") is False
