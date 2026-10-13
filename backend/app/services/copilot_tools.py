"""Live-database tools exposed to the Gemini Co-Pilot agent via function calling.

Every tool is a plain function with type hints and a docstring: the google-genai SDK converts those into
function declarations, lets Gemini decide which to call, executes them, and feeds the results back.
"""
import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Callable, List

from sqlalchemy.orm import Session

from app.db.models import ComplianceStatus, PermitTemplate, SafetyAudit, SeverityLevel


def _risk(a: SafetyAudit) -> str:
    raw = a.ai_raw_json or {}
    return raw.get("risk_category") or raw.get("stop6_category") or "GENERAL"


def _audit_summary(a: SafetyAudit) -> dict:
    raw = a.ai_raw_json or {}
    return {
        "at_utc": a.created_at.isoformat(timespec="minutes"),
        "location": a.location,
        "policy": a.template.title if a.template else None,
        "status": a.compliance_status.value,
        "severity": a.severity_level.value,
        "risk_category": _risk(a),
        "action": raw.get("enforcement_action"),
        "headline": raw.get("summary_headline"),
        "infractions": [o.get("description") for o in raw.get("observations", []) if o.get("is_infraction")],
    }


def build_copilot_tools(db: Session) -> List[Callable]:
    def get_safety_overview() -> dict:
        """Get a live snapshot of site safety: total AI inspections, compliance rate, critical violations, stop-work orders and monitored locations."""
        audits = db.query(SafetyAudit).all()
        compliant = sum(a.compliance_status == ComplianceStatus.COMPLIANT for a in audits)
        return {
            "total_ai_inspections": len(audits),
            "compliance_rate_pct": round(compliant / len(audits) * 100, 1) if audits else None,
            "critical_violations": sum(a.severity_level == SeverityLevel.CRITICAL for a in audits),
            "stop_work_orders": sum((a.ai_raw_json or {}).get("enforcement_action") in ("STOP_WORK", "SUSPEND_PERMIT") for a in audits),
            "monitored_locations": sorted({a.location for a in audits if a.location}),
            "as_of_utc": datetime.utcnow().isoformat(timespec="minutes"),
        }

    def list_safety_policies() -> list:
        """List the safety policies (rule sets) the AI inspector enforces, with their required PPE and forbidden hazards."""
        return [
            {
                "title": t.title,
                "category": t.permit_type.value,
                "required_ppe": (t.dynamic_rules or {}).get("required_ppe", []),
                "prerequisites": (t.dynamic_rules or {}).get("environmental_prerequisites", []),
                "forbidden_hazards": (t.dynamic_rules or {}).get("forbidden_hazards", []),
                "from_uploaded_sop": bool((t.dynamic_rules or {}).get("extracted_text")),
            }
            for t in db.query(PermitTemplate).all()
        ]

    def get_recent_violations(limit: int = 10, min_severity: str = "LOW", location: str = "") -> list:
        """List the most recent NON_COMPLIANT AI inspections, newest first. min_severity: LOW, MEDIUM or CRITICAL. location: optional substring filter, e.g. 'Welding'."""
        order = ["LOW", "MEDIUM", "CRITICAL"]
        allowed = order[order.index(min_severity.upper()):] if min_severity.upper() in order else order
        q = (
            db.query(SafetyAudit)
            .filter(SafetyAudit.compliance_status == ComplianceStatus.NON_COMPLIANT)
            .filter(SafetyAudit.severity_level.in_([SeverityLevel(s) for s in allowed]))
        )
        if location:
            q = q.filter(SafetyAudit.location.ilike(f"%{location}%"))
        return [_audit_summary(a) for a in q.order_by(SafetyAudit.created_at.desc()).limit(max(1, min(limit, 50))).all()]

    def get_risk_trends(days: int = 30) -> dict:
        """Analyse violation patterns over the last N days: counts by fatal-risk category, by location, by policy, by observation type and by day."""
        since = datetime.utcnow() - timedelta(days=max(1, min(days, 365)))
        audits = db.query(SafetyAudit).filter(SafetyAudit.created_at >= since).all()
        bad = [a for a in audits if a.compliance_status == ComplianceStatus.NON_COMPLIANT]
        return {
            "window_days": days,
            "inspections": len(audits),
            "violations": len(bad),
            "by_risk_category": dict(Counter(_risk(a) for a in bad)),
            "by_location": dict(Counter(a.location or "Unspecified" for a in bad)),
            "by_policy": dict(Counter(a.template.title for a in bad if a.template)),
            "by_observation_type": dict(Counter(
                o.get("category") for a in bad for o in (a.ai_raw_json or {}).get("observations", []) if o.get("is_infraction")
            )),
            "by_day": dict(Counter(a.created_at.date().isoformat() for a in bad)),
        }

    def search_company_sops(query: str) -> list:
        """Search the company's uploaded SOP documents and safety policies for passages relevant to the query. Returns the best matching excerpts."""
        terms = [t for t in re.findall(r"\w+", query.lower()) if len(t) > 2]
        hits = []
        for t in db.query(PermitTemplate).all():
            rules = t.dynamic_rules or {}
            text = rules.get("extracted_text") or ""
            structured = {k: v for k, v in rules.items() if k != "extracted_text"}
            chunks = [c for c in re.split(r"\n\s*\n|(?<=\.)\s{2,}", text) if c.strip()] or [""]
            for chunk in chunks:
                haystack = f"{t.title} {chunk} {structured}".lower()
                score = sum(haystack.count(term) for term in terms)
                if score:
                    hits.append({"score": score, "document": t.title, "excerpt": chunk.strip()[:800], "rules": structured})
        hits.sort(key=lambda h: h["score"], reverse=True)
        return [{k: v for k, v in h.items() if k != "score"} for h in hits[:5]] or [{"result": "No matching internal SOP found."}]

    return [get_safety_overview, list_safety_policies, get_recent_violations, get_risk_trends, search_company_sops]
