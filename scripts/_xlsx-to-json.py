#!/usr/bin/env python3
"""Reads the UAE developers master DB sheet and emits one JSON record per
numbered developer row to stdout. Called by seed-developers-from-excel.mjs."""

import json
import sys

import openpyxl


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("usage: _xlsx-to-json.py <path-to-xlsx>\n")
        return 2
    path = sys.argv[1]
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["UAE Developers – Master DB"]
    rows = list(ws.iter_rows(values_only=True))

    # Header row: first row whose first cell is the literal '#' (index column).
    try:
        hdr_idx = next(i for i, r in enumerate(rows) if r and r[0] == "#")
    except StopIteration:
        sys.stderr.write("could not find header row (cell '#')\n")
        return 1

    header = rows[hdr_idx]
    out = []
    for r in rows[hdr_idx + 1 :]:
        if not r or not isinstance(r[0], int) or not r[1]:
            continue
        record = {h: (r[i] if i < len(r) else None) for i, h in enumerate(header)}
        out.append(record)

    sys.stdout.write(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
