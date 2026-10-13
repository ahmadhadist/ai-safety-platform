# SafeSight — Inspector Evaluation

How well does the AI inspector separate unsafe scenes from safe ones? This page reports a small, reproducible test
run of the **exact production code path** (`GeminiAuditService.analyze_permit_safety` with policy auto-detection).

## Setup

| Item | Value |
|---|---|
| Test set | 16 synthetic CCTV-style images: 8 violations, 8 compliant, covering hot work, height, electrical, vehicles, falling objects, confined space, housekeeping, ergonomics |
| Image source | Generated with `gemini-2.5-flash-image` on Vertex AI from scene descriptions (`eval/generate_dataset.py`), then **reviewed by a human** against their labels |
| Model under test | `gemini-3.6-flash` on Vertex AI, temperature 0.1, structured output |
| Policy mode | Auto-detect: the model picks the matching company policy from the 5 seeded policies |
| Run date | 14 Oct 2026 |

Reproduce: `python eval/generate_dataset.py` (cached images are reused), then `python eval/run_eval.py`.
Raw per-image output: [`eval/results.json`](../eval/results.json).

## Results

| Metric | Raw labels | After adjudication* |
|---|---|---|
| Accuracy | **75.0 %** (12/16) | **87.5 %** (14/16) |
| Recall — violations caught | **100 %** (8/8) | **100 %** (10/10) |
| Precision — flags that were real | 66.7 % (8/12) | 83.3 % (10/12) |
| Missed violations (false negatives) | **0** | **0** |
| Correct fatal-risk category on violations | 87.5 % (7/8) | — |
| Median time per image | 12.9 s | — |

\* **Adjudication.** All four disagreements were images labelled "compliant" that the inspector flagged. They were
re-checked against the company policy the model applied:

| Image | Inspector finding | Verdict |
|---|---|---|
| `c07_clean_factory` | No hard hat (required by *General Factory Floor*) | **Inspector correct** — the operator wears no hard hat |
| `c08_good_lifting` | No hard hat / safety glasses (required by *General Factory Floor*) | **Inspector correct** — no hard hat visible |
| `c02_scaffold_tied_off` | Chin strap not fastened; lanyard anchor not approved | Not verifiable at this resolution — counted as false positive |
| `c06_confined_space_proper` | Entrant not in protective coverall; no barricade around manhole | Borderline — counted as false positive |

The one risk-category miss (`v07_spill_clutter`, an oil spill with tangled extension cords) was classified as
*Electrical* instead of *General*; both hazards are present in the image.

## Reading the numbers

- **The inspector never missed a violation.** For a safety tool this is the error that matters most: a missed hazard
  can injure someone, while an extra flag costs a supervisor a minute to review.
- **It enforces the written policy strictly.** Most extra flags come from policy requirements (hard hat, chin strap,
  coverall) that the scene description did not mention. That is the intended behaviour, and policies can be relaxed per area.
- **Limits.** 16 images is a smoke test, not a benchmark, and synthetic images are cleaner than real CCTV
  (lighting, occlusion, distance). The next step is a few hundred labelled frames from a real site.
