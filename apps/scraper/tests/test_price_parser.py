"""Tests for apps/scraper/parsers/price.py"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from parsers.price import parse_aed, parse_psf, compute_psf, parse_price_range


class TestParseAed:
    """Test AED price parsing from messy real-world strings."""

    # Millions
    def test_aed_millions_m(self):
        assert parse_aed("AED 1.2M") == 1_200_000

    def test_aed_millions_million(self):
        assert parse_aed("AED 3.5 MILLION") == 3_500_000

    def test_aed_millions_no_decimal(self):
        assert parse_aed("AED 2M") == 2_000_000

    # Thousands
    def test_aed_thousands_k(self):
        assert parse_aed("AED 850K") == 850_000

    def test_from_prefix(self):
        assert parse_aed("From AED 850K") == 850_000

    # Plain numbers
    def test_plain_with_commas(self):
        assert parse_aed("AED 1,200,000") == 1_200_000

    def test_plain_no_prefix(self):
        assert parse_aed("1,200,000") == 1_200_000

    # Edge cases
    def test_starting_from(self):
        assert parse_aed("Starting from AED 1.5M") == 1_500_000

    def test_empty_string(self):
        assert parse_aed("") is None

    def test_none(self):
        assert parse_aed(None) is None

    def test_tbd(self):
        assert parse_aed("TBD") is None

    def test_poa(self):
        assert parse_aed("POA") is None

    def test_call(self):
        assert parse_aed("CALL") is None

    def test_too_small(self):
        # Below 100K sanity check
        assert parse_aed("500") is None

    def test_too_large(self):
        # Above 500M sanity check — plain number "999999999" > 500M
        assert parse_aed("999,999,999") is None


class TestParsePsf:
    """Test PSF parsing."""

    def test_aed_per_sqft(self):
        assert parse_psf("AED 2,340 per sqft") == 2340

    def test_slash_sqft(self):
        assert parse_psf("2,340/sqft") == 2340

    def test_psf_suffix(self):
        assert parse_psf("2340 PSF") == 2340

    def test_plain_number_in_range(self):
        assert parse_psf("2340") == 2340

    def test_below_range(self):
        assert parse_psf("100") is None  # Below 500

    def test_above_range(self):
        assert parse_psf("15000") is None  # Above 10,000

    def test_empty(self):
        assert parse_psf("") is None

    def test_none(self):
        assert parse_psf(None) is None


class TestComputePsf:
    """Test PSF computation from transaction data."""

    def test_normal_computation(self):
        assert compute_psf(1_500_000, 750) == 2000

    def test_returns_rounded_int(self):
        result = compute_psf(1_500_000, 700)
        assert isinstance(result, int)

    def test_zero_area(self):
        assert compute_psf(1_500_000, 0) is None

    def test_tiny_area(self):
        assert compute_psf(1_500_000, 30) is None  # < 50 sqft

    def test_zero_value(self):
        assert compute_psf(0, 750) is None

    def test_psf_out_of_range_low(self):
        # 100 / 750 = 0.13 → out of range
        assert compute_psf(100, 750) is None

    def test_psf_out_of_range_high(self):
        # 15,000,000 / 750 = 20,000 → out of range
        assert compute_psf(15_000_000, 750) is None

    def test_normal_range(self):
        result = compute_psf(2_000_000, 800)
        assert result == 2500
        assert 300 <= result <= 15_000


class TestParsePriceRange:
    """Test price range parsing."""

    def test_hyphen_range(self):
        lo, hi = parse_price_range("AED 1.2M - AED 4.5M")
        assert lo == 1_200_000
        assert hi == 4_500_000

    def test_en_dash_range(self):
        lo, hi = parse_price_range("AED 850K – AED 2.1M")
        assert lo == 850_000
        assert hi == 2_100_000

    def test_to_range(self):
        lo, hi = parse_price_range("from AED 850K to AED 2.1M")
        assert lo == 850_000
        assert hi == 2_100_000

    def test_single_value(self):
        lo, hi = parse_price_range("AED 1.5M")
        assert lo == 1_500_000
        assert hi is None

    def test_empty(self):
        lo, hi = parse_price_range("")
        assert lo is None
        assert hi is None

    def test_none(self):
        lo, hi = parse_price_range(None)
        assert lo is None
        assert hi is None
