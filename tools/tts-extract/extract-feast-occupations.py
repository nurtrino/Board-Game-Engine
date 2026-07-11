#!/usr/bin/env python3
"""Extract A Feast for Odin's 190 occupations from the official appendix.

The official English appendix contains the complete occupation index as ruled
tables on pages 2 through 12.  This helper deliberately reads those tables from
the PDF rather than maintaining a second, hand-transcribed card list.

The JSON output is a number-sorted array.  Each item contains the official card
number, deck and starting-card status, name, points, type/category,
clarification, and its deterministic TTS sheet/back/cell mapping.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    import pdfplumber
except ImportError as exc:  # pragma: no cover - exercised only on missing tooling
    raise SystemExit(
        "pdfplumber is required; install it with `python -m pip install pdfplumber`."
    ) from exc


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PDF = REPO_ROOT / "tmp" / "pdfs" / "odin-appendix.pdf"

# PDF page numbers are one-based here, matching the printed appendix.
OCCUPATION_PAGE_RANGES = {
    2: (1, 12),
    3: (13, 30),
    4: (31, 52),
    5: (53, 72),
    6: (73, 90),
    7: (91, 107),
    8: (108, 126),
    9: (127, 145),
    10: (146, 164),
    11: (165, 184),
    12: (185, 190),
}

# Fixed settings make pdfplumber follow the appendix's printed ruling lines.
TABLE_SETTINGS = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "snap_tolerance": 3,
    "join_tolerance": 3,
    "intersection_tolerance": 3,
}

EXPECTED_GROUP_COUNTS = {
    ("A", False): 57,
    ("A", True): 15,
    ("B", False): 44,
    ("B", True): 15,
    ("C", False): 44,
    ("C", True): 15,
}

# These are the CustomDeck keys in workshop save 790490875.  All starting
# occupations share sheet 6: a occupies cells 0-14, b 15-29, and c 30-44.
DARK_SHEETS = {"A": 5, "B": 3, "C": 4}
STARTING_SHEET = 6
STARTING_CELL_OFFSETS = {"A": 0, "B": 15, "C": 30}
TTS_DECK_GUIDS = {
    ("A", False): "fa2877",
    ("A", True): "8fd527",
    ("B", False): "8d76cb",
    ("B", True): "114b22",
    ("C", False): "deaab0",
    ("C", True): "aa2575",
}

TYPE_TO_CATEGORY = {
    "IMMEDIATE CARD": "immediate",
    "ANYTIME CARD": "anytime",
    "EACH TIME CARD": "each-time",
    "AS SOON AS CARD": "as-soon-as",
}

# The appendix embeds the two arrow icons in a custom font whose ToUnicode map
# exposes these codepoints.  Page renders confirm their actual printed glyphs.
PDF_GLYPH_TRANSLATION = str.maketrans({"ñ": "↑", "õ": "↖"})


class ExtractionError(RuntimeError):
    """Raised when the appendix does not match the expected official layout."""


def _normalise_wrapped_text(value: str) -> str:
    """Collapse visual line wrapping without dropping any source text."""

    return re.sub(r"\s+", " ", value.translate(PDF_GLYPH_TRANSLATION)).strip()


def _normalise_name(value: str) -> str:
    # Three narrow name cells wrap a printed hyphen onto the next line
    # (Dragon-slayer, Quarter-master, and Grain Delivery-man).
    value = re.sub(r"-\s*\n\s*", "-", value)
    return _normalise_wrapped_text(value)


def _compact_row(row: list[str | None]) -> list[str]:
    """Remove only structural empty cells introduced by merged table columns."""

    compact: list[str] = []
    for cell in row:
        if cell is None:
            continue
        cell = cell.strip()
        if cell:
            compact.append(cell)
    return compact


def _card_type_and_category(raw_type: str, *, number: int) -> tuple[str, str]:
    printed_type = _normalise_wrapped_text(raw_type).upper()

    # Card 25 is printed as "IMMEDIATE CARDS" in the official appendix.  It is
    # the same immediate timing category as every other yellow occupation, but
    # retain the source label in `type` for lossless appendix provenance.
    category_type = "IMMEDIATE CARD" if printed_type == "IMMEDIATE CARDS" else printed_type

    try:
        category = TYPE_TO_CATEGORY[category_type]
    except KeyError as exc:
        expected = ", ".join(sorted(TYPE_TO_CATEGORY))
        raise ExtractionError(
            f"occupation {number}: unexpected type {raw_type!r}; expected one of {expected}"
        ) from exc
    return printed_type, category


def _parse_occupation_row(
    row: list[str | None], *, page_number: int, table_index: int, row_index: int
) -> dict[str, Any] | None:
    cells = _compact_row(row)
    if not cells or not re.fullmatch(r"\d{1,3}", cells[0]):
        return None
    # Page 2 also contains a sample card illustration whose tiny internal grid
    # yields a one-cell row containing "1".  A real index row always has its
    # deck mark immediately after the number.
    if len(cells) < 2 or cells[1] not in {"A", "B", "C", "a", "b", "c"}:
        return None
    if len(cells) != 6:
        raise ExtractionError(
            f"page {page_number}, table {table_index}, row {row_index}: "
            f"expected 6 populated cells, found {len(cells)}: {cells!r}"
        )

    number_text, deck_mark, name_text, points_text, clarification_text, type_text = cells
    number = int(number_text)
    if deck_mark not in {"A", "B", "C", "a", "b", "c"}:
        raise ExtractionError(
            f"occupation {number}: invalid deck mark {deck_mark!r} on page {page_number}"
        )
    try:
        points = int(points_text)
    except ValueError as exc:
        raise ExtractionError(
            f"occupation {number}: invalid point value {points_text!r} on page {page_number}"
        ) from exc

    card_type, category = _card_type_and_category(type_text, number=number)
    return {
        "number": number,
        "id": f"occupation-{number}",
        "deck": deck_mark.upper(),
        "deckMark": deck_mark,
        "starting": deck_mark.islower(),
        "name": _normalise_name(name_text),
        "points": points,
        "type": card_type,
        "category": category,
        "clarification": _normalise_wrapped_text(clarification_text),
    }


def _assign_art_mapping(records: list[dict[str, Any]]) -> None:
    """Map ascending numbers in each deck/back group to the TTS sheet cells."""

    for deck in ("A", "B", "C"):
        for starting in (False, True):
            group = sorted(
                (
                    record
                    for record in records
                    if record["deck"] == deck and record["starting"] is starting
                ),
                key=lambda record: record["number"],
            )
            expected = EXPECTED_GROUP_COUNTS[(deck, starting)]
            if len(group) != expected:
                back = "starting" if starting else "dark"
                raise ExtractionError(
                    f"deck {deck} {back}: expected {expected} occupations, found {len(group)}"
                )

            sheet = STARTING_SHEET if starting else DARK_SHEETS[deck]
            offset = STARTING_CELL_OFFSETS[deck] if starting else 0
            back = "starting" if starting else "dark"
            for group_index, record in enumerate(group):
                cell = offset + group_index
                guid = TTS_DECK_GUIDS[(deck, starting)]
                card_id = sheet * 100 + cell
                record["sheet"] = sheet
                record["back"] = back
                record["cell"] = cell
                record["tts"] = {
                    "sheet": sheet,
                    "cell": cell,
                    "back": back,
                    "guid": guid,
                    "cardId": card_id,
                }


def _validate_records(records: list[dict[str, Any]]) -> None:
    if len(records) != 190:
        raise ExtractionError(f"expected 190 occupations, found {len(records)}")

    numbers = [record["number"] for record in records]
    duplicates = sorted(number for number, count in collections.Counter(numbers).items() if count > 1)
    missing = sorted(set(range(1, 191)) - set(numbers))
    extra = sorted(set(numbers) - set(range(1, 191)))
    if duplicates or missing or extra:
        raise ExtractionError(
            "occupation number coverage failed: "
            f"duplicates={duplicates or 'none'}, missing={missing or 'none'}, extra={extra or 'none'}"
        )
    if numbers != list(range(1, 191)):
        raise ExtractionError("occupations are not sorted in exact ascending number order")

    for record in records:
        number = record["number"]
        for field in (
            "id",
            "deckMark",
            "name",
            "type",
            "category",
            "clarification",
            "back",
        ):
            if not isinstance(record.get(field), str) or not record[field].strip():
                raise ExtractionError(f"occupation {number}: required field {field!r} is empty")
        if record["id"] != f"occupation-{number}":
            raise ExtractionError(f"occupation {number}: invalid id {record['id']!r}")
        if record["deck"] not in {"A", "B", "C"}:
            raise ExtractionError(f"occupation {number}: invalid normalized deck {record['deck']!r}")
        if not isinstance(record["starting"], bool):
            raise ExtractionError(f"occupation {number}: starting must be a boolean")
        expected_mark = record["deck"].lower() if record["starting"] else record["deck"]
        if record["deckMark"] != expected_mark:
            raise ExtractionError(
                f"occupation {number}: deckMark {record['deckMark']!r} disagrees with "
                f"deck={record['deck']!r}, starting={record['starting']!r}"
            )
        if not isinstance(record["points"], int):
            raise ExtractionError(f"occupation {number}: points must be an integer")
        if any(glyph in record["clarification"] for glyph in ("ñ", "õ", "�")):
            raise ExtractionError(f"occupation {number}: unresolved PDF encoding glyph in clarification")

        expected_tts = {
            "sheet": record["sheet"],
            "cell": record["cell"],
            "back": record["back"],
            "guid": TTS_DECK_GUIDS[(record["deck"], record["starting"])],
            "cardId": record["sheet"] * 100 + record["cell"],
        }
        if record.get("tts") != expected_tts:
            raise ExtractionError(
                f"occupation {number}: TTS mapping differs: "
                f"expected {expected_tts}, found {record.get('tts')!r}"
            )

    group_counts = collections.Counter(
        (record["deck"], record["starting"]) for record in records
    )
    if dict(group_counts) != EXPECTED_GROUP_COUNTS:
        raise ExtractionError(
            f"deck/back counts differ: expected {EXPECTED_GROUP_COUNTS}, found {dict(group_counts)}"
        )

    art_cells = [(record["sheet"], record["cell"]) for record in records]
    duplicate_cells = sorted(
        cell for cell, count in collections.Counter(art_cells).items() if count > 1
    )
    if duplicate_cells:
        raise ExtractionError(f"duplicate TTS sheet/cell mappings: {duplicate_cells}")

    tts_cards = [(record["tts"]["guid"], record["tts"]["cardId"]) for record in records]
    duplicate_tts_cards = sorted(
        card for card, count in collections.Counter(tts_cards).items() if count > 1
    )
    if duplicate_tts_cards:
        raise ExtractionError(f"duplicate TTS GUID/CardID mappings: {duplicate_tts_cards}")

    expected_cells = {
        3: set(range(44)),
        4: set(range(44)),
        5: set(range(57)),
        6: set(range(45)),
    }
    actual_cells: dict[int, set[int]] = collections.defaultdict(set)
    for record in records:
        actual_cells[record["sheet"]].add(record["cell"])
    if dict(actual_cells) != expected_cells:
        raise ExtractionError(
            f"sheet cell coverage differs: expected {expected_cells}, found {dict(actual_cells)}"
        )


def extract_occupations(pdf_path: Path) -> list[dict[str, Any]]:
    """Extract and validate all occupation records from an official appendix PDF."""

    pdf_path = pdf_path.resolve()
    if not pdf_path.is_file():
        raise ExtractionError(f"appendix PDF does not exist: {pdf_path}")

    records: list[dict[str, Any]] = []
    try:
        with pdfplumber.open(pdf_path) as appendix:
            if len(appendix.pages) != 16:
                raise ExtractionError(
                    f"expected the 16-page official appendix, found {len(appendix.pages)} pages"
                )

            for page_number, (first_number, last_number) in OCCUPATION_PAGE_RANGES.items():
                page = appendix.pages[page_number - 1]
                page_records: list[dict[str, Any]] = []
                tables = page.find_tables(table_settings=TABLE_SETTINGS)
                for table_index, table in enumerate(tables, start=1):
                    for row_index, row in enumerate(table.extract(), start=1):
                        record = _parse_occupation_row(
                            row,
                            page_number=page_number,
                            table_index=table_index,
                            row_index=row_index,
                        )
                        if record is not None:
                            page_records.append(record)

                actual_page_numbers = [record["number"] for record in page_records]
                expected_page_numbers = list(range(first_number, last_number + 1))
                if actual_page_numbers != expected_page_numbers:
                    raise ExtractionError(
                        f"page {page_number}: expected occupation numbers "
                        f"{first_number}-{last_number}, found {actual_page_numbers or 'none'}"
                    )
                records.extend(page_records)
    except ExtractionError:
        raise
    except Exception as exc:
        raise ExtractionError(f"could not parse appendix PDF {pdf_path}: {exc}") from exc

    records.sort(key=lambda record: record["number"])
    _assign_art_mapping(records)
    _validate_records(records)
    return records


def _json_bytes(records: list[dict[str, Any]], *, compact: bool) -> bytes:
    if compact:
        rendered = json.dumps(records, ensure_ascii=False, separators=(",", ":"))
    else:
        rendered = json.dumps(records, ensure_ascii=False, indent=2)
    return (rendered + "\n").encode("utf-8")


def _diagnostics(records: list[dict[str, Any]], pdf_path: Path, data: bytes) -> str:
    counts = collections.Counter((record["deck"], record["starting"]) for record in records)
    categories = collections.Counter(record["category"] for record in records)
    count_text = ", ".join(
        f"{deck}={counts[(deck, False)]} dark/{counts[(deck, True)]} starting"
        for deck in ("A", "B", "C")
    )
    category_text = ", ".join(f"{key}={categories[key]}" for key in sorted(categories))
    pdf_hash = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    data_hash = hashlib.sha256(data).hexdigest()
    return (
        f"Validated {len(records)} occupations from {pdf_path}\n"
        f"Deck/back counts: {count_text}\n"
        f"Categories: {category_text}\n"
        f"PDF SHA-256: {pdf_hash}\n"
        f"JSON SHA-256: {data_hash}"
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Extract and validate all 190 Feast for Odin occupations from the official appendix."
    )
    parser.add_argument(
        "--pdf",
        type=Path,
        default=DEFAULT_PDF,
        help=f"official 16-page English appendix (default: {DEFAULT_PDF})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="write the JSON array to this file instead of standard output",
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="emit compact JSON rather than indented JSON",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="validate the appendix without emitting JSON",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="suppress validation diagnostics on standard error",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    pdf_path: Path = args.pdf.resolve()
    try:
        records = extract_occupations(pdf_path)
        data = _json_bytes(records, compact=args.compact)
    except ExtractionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if not args.validate_only:
        if args.output is None:
            sys.stdout.buffer.write(data)
        else:
            output_path: Path = args.output.resolve()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(data)

    if not args.quiet:
        print(_diagnostics(records, pdf_path, data), file=sys.stderr)
        if args.output is not None and not args.validate_only:
            print(f"Wrote {args.output.resolve()}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
