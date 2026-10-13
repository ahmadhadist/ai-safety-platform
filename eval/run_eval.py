"""Measure SafeSight's photo inspector on the labelled test set in eval/dataset.

Runs the exact production code path (GeminiAuditService.analyze_permit_safety with policy auto-detection) and reports
violation-detection accuracy, precision, recall and risk-category agreement.

Usage (from repo root):
  GOOGLE_GENAI_USE_VERTEXAI=true GOOGLE_CLOUD_PROJECT=... python eval/run_eval.py
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "backend"))
os.environ.setdefault("DATABASE_URL", "postgresql+pg8000://unused@localhost/unused")  # importing app modules needs a URL

from app.services.gemini_service import GeminiAuditService  # noqa: E402


def available_policies() -> list:
    with open(os.path.join(ROOT, "backend", "seed_data", "policies.json")) as f:
        policies = json.load(f)
    keep = ("required_ppe", "environmental_prerequisites", "forbidden_hazards", "max_temperature_c", "min_lux")
    return [{"title": p["title"], "category": p["permit_type"], **{k: v for k, v in p["dynamic_rules"].items() if k in keep}} for p in policies]


def main():
    labels = json.load(open(os.path.join(HERE, "dataset", "labels.json")))
    labels = [l for l in labels if os.path.exists(os.path.join(HERE, "dataset", l["file"])) and not l.get("exclude")]
    service = GeminiAuditService()
    context = {"inspection_context": {"location": "Evaluation"}, "available_policies": available_policies()}

    rows = []
    for item in labels:
        with open(os.path.join(HERE, "dataset", item["file"]), "rb") as f:
            image = f.read()
        started = time.monotonic()
        result = service.analyze_permit_safety(image, "image/jpeg", context)
        rows.append({
            "id": item["id"],
            "expected_status": item["expected_status"],
            "predicted_status": result.status,
            "expected_risk": item["expected_risk_category"],
            "predicted_risk": result.risk_category,
            "severity": result.severity,
            "applied_policy": result.applied_policy,
            "findings": [o.description for o in result.observations if o.is_infraction],
            "model": result.model_used,
            "seconds": round(time.monotonic() - started, 1),
        })
        print(f"{item['id']:32s} expected={item['expected_status']:13s} got={result.status:13s} risk={result.risk_category}", file=sys.stderr)

    pos = "NON_COMPLIANT"
    tp = sum(r["expected_status"] == pos and r["predicted_status"] == pos for r in rows)
    tn = sum(r["expected_status"] != pos and r["predicted_status"] != pos for r in rows)
    fp = sum(r["expected_status"] != pos and r["predicted_status"] == pos for r in rows)
    fn = sum(r["expected_status"] == pos and r["predicted_status"] != pos for r in rows)
    violations = [r for r in rows if r["expected_status"] == pos]
    summary = {
        "images": len(rows),
        "accuracy": round((tp + tn) / len(rows), 3) if rows else None,
        "precision": round(tp / (tp + fp), 3) if tp + fp else None,
        "recall": round(tp / (tp + fn), 3) if tp + fn else None,
        "confusion": {"tp": tp, "tn": tn, "fp": fp, "fn": fn},
        "risk_category_agreement_on_violations": round(sum(r["expected_risk"] == r["predicted_risk"] for r in violations) / len(violations), 3) if violations else None,
        "median_seconds": sorted(r["seconds"] for r in rows)[len(rows) // 2] if rows else None,
        "models": sorted({r["model"] for r in rows}),
    }
    with open(os.path.join(HERE, "results.json"), "w") as f:
        json.dump({"summary": summary, "rows": rows}, f, indent=2)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
