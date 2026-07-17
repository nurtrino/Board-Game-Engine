"""Recognize fixed-position Politik card symbols with rejectable templates.

This is deliberately not an end-to-end OCR model. The 412 ordinary Politik
cards use one exact 680x950 layout, so fixed-region, real-art templates are more
accurate and easier to audit than a neural model trained on synthetic data.

The output is a candidate artifact until it is compared with a separately
reviewed label file. Nothing produced by this script becomes rules authority
merely because its score is high.

Run from the repository root:

  python tools/tts-extract/recognize-politik-symbols.py \
    --review-dir tmp/politik-recognition/focus-review

  python tools/tts-extract/recognize-politik-symbols.py \
    --labels games/politik/recognition/focus-labels.json --require-perfect
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
MODS = Path(r"C:\Users\chase\Documents\My Games\Tabletop Simulator\Mods")
SAVE = MODS / "Workshop" / "3460664356.json"
CARDS = ROOT / "games" / "politik" / "golden" / "cards.json"
CATALOG = ROOT / "games" / "politik" / "golden" / "card-catalog.json"
DEFAULT_OUTPUT = ROOT / "tmp" / "politik-recognition" / "focus-candidates.json"

ARENAS = ("military", "political", "corporate")
FOCUS_BOXES = {
    "military": (100, 220, 145, 270),
    "political": (100, 300, 145, 350),
    "corporate": (100, 385, 145, 435),
}

# Each prototype is an authentic printed digit, not a synthetic font rendering.
# Sheet-isolated review still decides whether the recognizer is acceptable.
FOCUS_TEMPLATES: dict[str, dict[int, tuple[int, int]]] = {
    "military": {
        0: (10417, 1),
        1: (10417, 2),
        2: (10417, 3),
        3: (10417, 0),
        4: (10421, 21),
    },
    "political": {
        0: (10417, 0),
        1: (10417, 1),
        2: (10417, 2),
        3: (10418, 13),
        4: (10419, 19),
    },
    "corporate": {
        0: (10417, 3),
        1: (10417, 9),
        2: (10417, 0),
        3: (10417, 2),
        4: (10418, 15),
    },
}


def munge(url: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", url)


def cached_image(url: str) -> Path:
    stem = MODS / "Images" / munge(url)
    for suffix in (".png", ".jpg", ".jpeg"):
        candidate = Path(f"{stem}{suffix}")
        if candidate.exists():
            return candidate
    raise FileNotFoundError(url)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass
class Sheet:
    image: Image.Image
    card_width: int
    card_height: int
    source: Path


class CardSource:
    def __init__(self) -> None:
        save = json.loads(SAVE.read_text(encoding="utf-8"))
        deck = next(obj for obj in save["ObjectStates"] if obj.get("GUID") == "d2135c")
        self.definitions = deck["CustomDeck"]
        self.cache: dict[int, Sheet] = {}

    def sheet(self, sheet_id: int) -> Sheet:
        if sheet_id not in self.cache:
            definition = self.definitions[str(sheet_id)]
            source = cached_image(definition["FaceURL"])
            image = Image.open(source).convert("RGB")
            cols = int(definition["NumWidth"])
            rows = int(definition["NumHeight"])
            card_width = image.width // cols
            card_height = image.height // rows
            if (card_width, card_height) != (680, 950):
                raise ValueError(
                    f"sheet {sheet_id} has {card_width}x{card_height} cards, expected 680x950"
                )
            self.cache[sheet_id] = Sheet(image, card_width, card_height, source)
        return self.cache[sheet_id]

    def card(self, sheet_id: int, cell: int) -> Image.Image:
        sheet = self.sheet(sheet_id)
        col, row = cell % 6, cell // 6
        return sheet.image.crop(
            (
                col * sheet.card_width,
                row * sheet.card_height,
                (col + 1) * sheet.card_width,
                (row + 1) * sheet.card_height,
            )
        )


def focus_feature(card: Image.Image, arena: str) -> np.ndarray:
    """Normalize the digit while discarding parchment texture and underlines."""
    crop = card.crop(FOCUS_BOXES[arena]).resize((63, 70), Image.Resampling.LANCZOS)
    gray = np.asarray(crop.convert("L"), dtype=np.float32)
    background = cv2.GaussianBlur(gray, (0, 0), 7)
    ink = np.maximum(background - gray, 0)
    return (ink - ink.mean()) / (ink.std() + 1e-6)


def focus_templates(source: CardSource) -> dict[str, dict[int, np.ndarray]]:
    return {
        arena: {
            value: focus_feature(source.card(sheet, cell), arena)
            for value, (sheet, cell) in references.items()
        }
        for arena, references in FOCUS_TEMPLATES.items()
    }


def predict_focus(
    card: Image.Image,
    arena: str,
    templates: dict[str, dict[int, np.ndarray]],
) -> dict[str, Any]:
    feature = focus_feature(card, arena)
    scores = {
        value: float(np.mean(feature * template))
        for value, template in templates[arena].items()
    }
    ordered = sorted(scores, key=scores.get, reverse=True)
    best, runner_up = ordered[0], ordered[1]
    return {
        "value": best,
        "score": round(scores[best], 6),
        "margin": round(scores[best] - scores[runner_up], 6),
        "scores": {str(value): round(score, 6) for value, score in scores.items()},
        "status": "candidate",
    }


def render_review(
    path: Path,
    sheet_id: int,
    refs: list[dict[str, Any]],
    source: CardSource,
    predictions: dict[str, Any],
    catalog: dict[str, Any],
) -> None:
    canvas = Image.new("RGB", (1860, 1000), (238, 233, 217))
    draw = ImageDraw.Draw(canvas)
    for ref in sorted(refs, key=lambda item: int(item["cell"])):
        card_id = str(ref["id"])
        cell = int(ref["cell"])
        card = source.card(sheet_id, cell)
        x, y = (cell % 6) * 310, (cell // 6) * 250
        draw.rectangle((x + 3, y + 3, x + 305, y + 245), outline=(45, 50, 47), width=2)
        name = str(catalog.get(card_id, {}).get("name", card_id))
        draw.text((x + 10, y + 8), f"{cell:02d} {name[:30]}", fill=(10, 12, 11))
        for index, arena in enumerate(ARENAS):
            result = predictions[card_id]["focus"][arena]
            crop = card.crop(FOCUS_BOXES[arena]).resize((90, 100), Image.Resampling.NEAREST)
            yy = y + 42 + index * 66
            canvas.paste(crop, (x + 68, yy))
            draw.text((x + 12, yy + 26), arena[0].upper(), fill=(10, 12, 11))
            draw.text((x + 172, yy + 25), f"PRED {result['value']}", fill=(10, 12, 11))
            draw.text((x + 235, yy + 25), f"D {result['margin']:.2f}", fill=(70, 75, 72))
    canvas.save(path)


def evaluate(predictions: dict[str, Any], label_path: Path) -> tuple[int, int]:
    labels = json.loads(label_path.read_text(encoding="utf-8"))
    expected_cards = labels.get("cards", {})
    checked = 0
    wrong: list[str] = []
    for card_id, label in expected_cards.items():
        if card_id not in predictions:
            wrong.append(f"{card_id}: missing prediction")
            continue
        for arena in ARENAS:
            expected = int(label["focus"][arena])
            actual = int(predictions[card_id]["focus"][arena]["value"])
            checked += 1
            if actual != expected:
                wrong.append(f"{card_id} {arena}: predicted {actual}, expected {expected}")
    print(f"focus evaluation: {checked - len(wrong)}/{checked} exact")
    for mismatch in wrong:
        print(f"  {mismatch}")
    return checked, len(wrong)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--review-dir", type=Path)
    parser.add_argument("--labels", type=Path)
    parser.add_argument("--require-perfect", action="store_true")
    args = parser.parse_args()

    source = CardSource()
    card_refs = json.loads(CARDS.read_text(encoding="utf-8"))["politics"]
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))["cards"]
    templates = focus_templates(source)
    predictions: dict[str, Any] = {}
    by_sheet: dict[int, list[dict[str, Any]]] = {}

    for ref in card_refs:
        card_id = str(ref["id"])
        sheet_id = int(ref["sheet"])
        cell = int(ref["cell"])
        card = source.card(sheet_id, cell)
        by_sheet.setdefault(sheet_id, []).append(ref)
        predictions[card_id] = {
            "sheet": sheet_id,
            "cell": cell,
            "focus": {
                arena: predict_focus(card, arena, templates)
                for arena in ARENAS
            },
        }

    if len(predictions) != 412:
        raise ValueError(f"expected 412 ordinary cards, got {len(predictions)}")

    payload = {
        "version": 1,
        "method": "fixed ROI high-pass normalized authentic-template correlation",
        "authority": "candidate only until compared with independently reviewed labels",
        "cardSize": [680, 950],
        "templates": FOCUS_TEMPLATES,
        "sourceSheets": {
            str(sheet_id): {
                "sha256": sha256(source.sheet(sheet_id).source),
                "cards": len(refs),
            }
            for sheet_id, refs in sorted(by_sheet.items())
        },
        "cards": predictions,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.output}: {len(predictions)} candidate cards")

    if args.review_dir:
        args.review_dir.mkdir(parents=True, exist_ok=True)
        for sheet_id, refs in sorted(by_sheet.items()):
            render_review(
                args.review_dir / f"focus-{sheet_id}.png",
                sheet_id,
                refs,
                source,
                predictions,
                catalog,
            )
        print(f"wrote {len(by_sheet)} review sheets to {args.review_dir}")

    if args.labels:
        checked, wrong = evaluate(predictions, args.labels)
        if checked == 0:
            raise ValueError("label file contains no Focus fields")
        if args.require_perfect and wrong:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
