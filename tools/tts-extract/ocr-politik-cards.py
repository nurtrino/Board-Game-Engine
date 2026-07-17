"""Build a searchable, machine-assisted catalog from Politik's card art.

The TTS save deliberately leaves all 412 Politik card nicknames blank. The
printed sheets are therefore the only source for titles, type labels, Focus
values, cost text, and rules text. This script reads the original cached sheets
at full resolution and writes an OCR audit artifact. The card art remains the
authority: uncertain text is retained as OCR text and the UI always shows the
real card beside it.

Dependency: python -m pip install rapidocr_onnxruntime
Run from the repository root: python tools/tts-extract/ocr-politik-cards.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR


ROOT = Path(__file__).resolve().parents[2]
MODS = Path(r"C:\Users\chase\Documents\My Games\Tabletop Simulator\Mods")
SAVE = MODS / "Workshop" / "3460664356.json"
CARDS = ROOT / "games" / "politik" / "golden" / "cards.json"
OUTPUT = ROOT / "games" / "politik" / "golden" / "card-catalog.json"
FOCUS_LABELS = ROOT / "games" / "politik" / "recognition" / "focus-labels.json"
DECLARATION_LABELS = ROOT / "games" / "politik" / "recognition" / "card-declarations.json"
STRUCTURE_LABELS = ROOT / "games" / "politik" / "recognition" / "card-structures.json"
TITLE_LABELS = ROOT / "games" / "politik" / "recognition" / "card-titles.json"


def munge(url: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", url)


def cached_image(url: str) -> Path:
    stem = MODS / "Images" / munge(url)
    for suffix in (".png", ".jpg", ".jpeg"):
        candidate = Path(f"{stem}{suffix}")
        if candidate.exists():
            return candidate
    raise FileNotFoundError(url)


def center(box: list[list[float]]) -> tuple[float, float]:
    return sum(point[0] for point in box) / 4, sum(point[1] for point in box) / 4


def clean_title(text: str) -> str:
    # The detector sometimes joins the top-right cost to a long title box.
    # Politik titles do not contain digits, so everything from the first
    # trailing digit is cost noise rather than part of the title.
    text = re.sub(r"\s*\d.*$", "", text.strip())
    text = re.sub(r"\s+", " ", text)
    return text.title() if text.isupper() else text


def recognize_single(recognizer: RapidOCR, image: Image.Image) -> tuple[str, float]:
    enlarged = image.resize((180, 240), Image.Resampling.LANCZOS)
    result, _ = recognizer(np.asarray(enlarged))
    if not result:
        return "", 0.0
    return str(result[0][1]).strip(), float(result[0][2])


def digit(recognizer: RapidOCR, card: Image.Image, box: tuple[int, int, int, int]) -> tuple[int | None, float]:
    text, score = recognize_single(recognizer, card.crop(box))
    match = re.search(r"[0-4]", text)
    # Recognition failure is never a printed zero. Politik prints zero in a
    # deliberately faint tint, so a verified symbol label must distinguish the
    # two before the value can become rules authority.
    return (int(match.group(0)) if match else None), score


def main() -> None:
    save = json.loads(SAVE.read_text(encoding="utf-8"))
    cards = json.loads(CARDS.read_text(encoding="utf-8"))["politics"]
    deck = next(obj for obj in save["ObjectStates"] if obj.get("GUID") == "d2135c")
    sheet_defs = deck["CustomDeck"]

    detector = RapidOCR(use_angle_cls=False)
    recognizer = RapidOCR(use_text_det=False, use_angle_cls=False, text_score=0.03)
    catalog: dict[str, dict[str, object]] = {}
    focus_labels = (
        json.loads(FOCUS_LABELS.read_text(encoding="utf-8")).get("cards", {})
        if FOCUS_LABELS.exists()
        else {}
    )
    declaration_labels = (
        json.loads(DECLARATION_LABELS.read_text(encoding="utf-8")).get("cards", {})
        if DECLARATION_LABELS.exists()
        else {}
    )
    structure_labels = (
        json.loads(STRUCTURE_LABELS.read_text(encoding="utf-8")).get("cards", {})
        if STRUCTURE_LABELS.exists()
        else {}
    )
    title_labels = (
        json.loads(TITLE_LABELS.read_text(encoding="utf-8")).get("cards", {})
        if TITLE_LABELS.exists()
        else {}
    )

    by_sheet: dict[int, list[dict[str, object]]] = {}
    for card in cards:
        by_sheet.setdefault(int(card["sheet"]), []).append(card)

    for sheet_id in sorted(by_sheet):
        definition = sheet_defs[str(sheet_id)]
        cols, rows = int(definition["NumWidth"]), int(definition["NumHeight"])
        sheet = Image.open(cached_image(definition["FaceURL"])).convert("RGB")
        cell_w, cell_h = sheet.width // cols, sheet.height // rows

        for ref in sorted(by_sheet[sheet_id], key=lambda item: int(item["cell"])):
            cell = int(ref["cell"])
            col, row = cell % cols, cell // cols
            card = sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))

            detected, _ = detector(np.asarray(card), box_thresh=0.34, text_score=0.22)
            lines = []
            for box, text, score in detected or []:
                cx, cy = center(box)
                lines.append({"x": round(cx), "y": round(cy), "text": text.strip(), "score": round(float(score), 3)})
            lines.sort(key=lambda item: (item["y"], item["x"]))

            title_parts = [
                item["text"] for item in lines
                if item["y"] < 132 and item["x"] < 510
                and re.search(r"[A-Za-z]{2}", item["text"])
            ]
            title_ocr = clean_title(" ".join(title_parts)) if title_parts else f"Politik {sheet_id}:{cell}"
            verified_title = title_labels.get(str(ref["id"]), {}).get("name")
            title = verified_title or title_ocr

            type_text = next((
                item["text"] for item in lines
                if 130 <= item["y"] <= 190 and item["x"] < 350
            ), "")
            normalized_type = re.sub(r"[^a-z]", "", type_text.lower())
            card_type = next((kind for kind in ("asset", "company", "propaganda", "event")
                              if normalized_type.startswith(kind[:4])), "unknown")
            verified_structure = structure_labels.get(str(ref["id"]))
            if verified_structure:
                card_type = verified_structure["type"]

            military_ocr, military_score = digit(recognizer, card, (100, 220, 145, 285))
            political_ocr, political_score = digit(recognizer, card, (100, 300, 145, 370))
            corporate_ocr, corporate_score = digit(recognizer, card, (100, 385, 145, 455))
            verified_focus = focus_labels.get(str(ref["id"]), {}).get("focus")
            verified_declaration = declaration_labels.get(str(ref["id"]))
            focus = verified_focus or {
                "military": military_ocr,
                "political": political_ocr,
                "corporate": corporate_ocr,
            }
            margin_ocr = None
            margin_score = 0.0
            if card_type in {"asset", "company"}:
                margin_ocr, margin_score = digit(recognizer, card, (205, 385, 250, 455))

            cost_text, cost_score = recognize_single(recognizer, card.crop((500, 45, 660, 155)))
            rules_text = " | ".join(item["text"] for item in lines if 188 <= item["y"] <= 525)
            keywords_text = " | ".join(item["text"] for item in lines if 410 <= item["y"] <= 610)

            catalog[str(ref["id"])] = {
                "id": ref["id"],
                "sheet": sheet_id,
                "cell": cell,
                "name": title,
                "titleVerified": bool(verified_title),
                "type": card_type,
                "costText": cost_text,
                "focus": focus,
                "focusVerified": bool(verified_focus),
                "capitalCost": verified_declaration.get("capitalCost") if verified_declaration else None,
                "carbonCost": verified_declaration.get("carbonCost") if verified_declaration else None,
                "corruptionRequirement": verified_declaration.get("corruptionRequirement") if verified_declaration else None,
                "supportCost": verified_declaration.get("supportCost") if verified_declaration else None,
                "bases": verified_declaration.get("bases", []) if verified_declaration else [],
                "declarationVerified": bool(verified_declaration),
                "margin": verified_structure.get("margin") if verified_structure else margin_ocr,
                "industries": verified_structure.get("industries", []) if verified_structure else [],
                "corruption": bool(verified_structure.get("corruption")) if verified_structure else False,
                "negotiation": bool(verified_structure.get("negotiation")) if verified_structure else False,
                "edgeTimings": verified_structure.get("edgeTimings", []) if verified_structure else [],
                "edgeTriggerText": verified_structure.get("edgeTriggerText", []) if verified_structure else [],
                "structureVerified": bool(verified_structure),
                "rulesText": rules_text,
                "keywordsText": keywords_text,
                "ocr": {
                    "costScore": round(cost_score, 3),
                    "titleValue": title_ocr,
                    "focusScores": [round(military_score, 3), round(political_score, 3), round(corporate_score, 3)],
                    "focusValues": {
                        "military": military_ocr,
                        "political": political_ocr,
                        "corporate": corporate_ocr,
                    },
                    "marginScore": round(margin_score, 3),
                    "marginValue": margin_ocr,
                    "lines": lines,
                },
            }

        known = sum(1 for ref in by_sheet[sheet_id] if catalog[str(ref["id"])]["type"] != "unknown")
        print(f"sheet {sheet_id}: {len(by_sheet[sheet_id])} cards, {known} typed", flush=True)

    payload = {
        "source": "OCR from the TTS mod's original 4080x3800 card sheets; authentic art remains authoritative",
        "count": len(catalog),
        "cards": catalog,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    unknown = [card for card in catalog.values() if card["type"] == "unknown"]
    missing_focus = [card for card in catalog.values() if None in card["focus"].values()]
    verified_focus_count = sum(1 for card in catalog.values() if card["focusVerified"])
    verified_declaration_count = sum(1 for card in catalog.values() if card["declarationVerified"])
    verified_structure_count = sum(1 for card in catalog.values() if card["structureVerified"])
    print(
        f"wrote {OUTPUT}: {len(catalog)} cards, {len(unknown)} unknown types, "
        f"{len(missing_focus)} missing focus, {verified_focus_count} verified focus, "
        f"{verified_declaration_count} verified declarations, {verified_structure_count} verified structures",
        flush=True,
    )


if __name__ == "__main__":
    main()
