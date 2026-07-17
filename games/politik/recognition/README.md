# Politik card recognition

The ordinary Politik deck contains 412 unique cards on 18 authentic 4080x3800
source sheets. Every card is a fixed 680x950 crop. That makes deterministic
region recognition a better fit than an end-to-end neural model.

## Authority boundary

- Authentic printed card art is the source of truth.
- OCR text is useful for search and review, never for rules enforcement.
- A recognizer output remains `candidate` until an independent art review has
  produced a label and the recognizer matches the complete reviewed set.
- Failure and a printed zero are different states. A recognizer must reject an
  uncertain field rather than silently turning it into zero.
- Recognizing icons does not infer unique effect semantics. Timing, targets,
  optional payments, cancellation, and choices require a reviewed declarative
  card definition.

## Evaluation protocol

1. Keep whole source sheets together when training, calibrating, or testing.
   Never random-split crops from the same sheet across both sides of a test.
2. Preserve a reviewed label for every gameplay-critical field: type, costs,
   requirements, Focus, Margin, Industries, Bases, Corruption, Negotiation, and
   Edge timing.
3. Report field exact match, whole-card exact match, coverage, and false
   auto-accept rate. Average OCR confidence is not an accuracy metric.
4. Require 100% exact match for Focus and legality-critical categorical fields
   before those fields may be authoritative. Cost token recognition must have no
   false auto-accepts; anything rejected stays manual.
5. Validate every novel layout or symbol against authentic art before adding its
   template. Special families such as Nations, Startups, Starting Propaganda,
   Obligations, Landscapes, and Broadcast Stations keep their existing reviewed
   structured data.

## Current recognizer

`tools/tts-extract/recognize-politik-symbols.py` recognizes the three fixed Focus
digits with high-pass normalized correlation against real printed templates. It
can render one review image per source sheet and compare predictions against a
reviewed label file. Additional fixed symbol families should be added only with
the same label-and-reject discipline.

`card-effects-candidates.json` is a separate, independently reviewed visual
transcription of the 98 cards with an at-any-time or named Clash-window Edge.
It is intentionally marked unsafe for automatic resolution until each operation
has a tested engine implementation. Two icon-only declarations remain explicitly
ambiguous rather than being guessed: Outwit's Use qualifiers and two of At Any
Cost's payment types.
