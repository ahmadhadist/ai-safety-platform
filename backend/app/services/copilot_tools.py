"""Live-database tools exposed to the Gemini Co-Pilot agent via function calling.

Every tool is a plain function with type hints and a docstring: the google-genai SDK converts those into
function declarations, lets Gemini decide which to call, executes them, and feeds the results back.
"""
import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Callable, List

from sqlalchemy.orm import Session

from app.db.models import ComplianceStatus, PermitStatus, PermitTemplate, SafetyAudit, SeverityLevel, WorkPermit


def build_copilot_tools(db: Session) -> List[Callable]:
    def get_safety_overview() -> dict:
        """Get a live snapshot of plant safety: permit counts by status, total AI audits, compliance rate and critical violation count."""
        total_audits = db.query(SafetyAudit).count()
        compliant = db.query(SafetyAudit).filter(SafetyAudit.compliance_status == ComplianceStatus.COMPLIANT).count()
        return {
            "permits_by_status": {s.value: db.query(WorkPermit).filter(WorkPermit.status == s).count() for s in PermitStatus},
            "total_ai_audits": total_audits,
            "compliance_rate_pct": round(compliant / total_audits * 100, 1) if total_audits else None,
            "critical_violations": db.query(SafetyAudit).filter(SafetyAudit.severity_level == SeverityLevel.CRITICAL).count(),
            "as_of_utc": datetime.utcnow().isoformat(timespec="minutes"),
        }

    def list_work_permits(status: str = "ALL") -> list:
        """List work permits. status: one of ALL, APPROVED, SUSPENDED, COMPLETED."""
        q = db.query(WorkPermit)
        if status.upper() in PermitStatus.__members__:
            q = q.filter(WorkPermit.status == PermitStatus(status.upper()))
        return [
            {
                "permit_code": p.permit_code,
                "type": p.template.permit_type.value,
                "contractor": p.contractor_company,
                "lead": p.contractor_lead_name,
                "zone": p.location_zone,
                "status": p.status.value,
                "workers_on_manifest": len(p.worker_manifest or []),
                "valid_until_utc": p.end_time.isoformat(timespec="minutes") if p.end_time else None,
            }
            for p in q.all()
        ]

    def get_permit_details(permit_code: str) -> dict:
        """Get full details of one work permit by its code (e.g. HW-2026-0891): rules, worker manifest and its 5 most recent AI audits."""
        p = db.query(WorkPermit).filter(WorkPermit.permit_code == permit_code.strip()).first()
        if not p:
            return {"error": f"No permit with code {permit_code}"}
        audits = sorted(p.safety_audits, key=lambda a: a.created_at, reverse=True)[:5]
        return {
            "permit_code": p.permit_code,
            "status": p.status.value,
            "contractor": p.contractor_company,
            "lead": p.contractor_lead_name,
            "zone": p.location_zone,
            "template": p.template.title,
            "rules": p.template.dynamic_rules,
            "worker_manifest": p.worker_manifest or [],
            "recent_audits": [
                {
                    "at_utc": a.created_at.isoformat(timespec="minutes"),
                    "status": a.compliance_status.value,
                    "severity": a.severity_level.value,
                    "headline": (a.ai_raw_json or {}).get("summary_headline"),
                    "action": (a.ai_raw_json or {}).get("enforcement_action"),
                }
                for a in audits
            ],
        }

    def get_recent_violations(limit: int = 10, min_severity: str = "LOW") -> list:
        """List the most recent NON_COMPLIANT AI audits, newest first. min_severity: LOW, MEDIUM or CRITICAL."""
        order = ["LOW", "MEDIUM", "CRITICAL"]
        allowed = order[order.index(min_severity.upper()):] if min_severity.upper() in order else order
        audits = (
            db.query(SafetyAudit)
            .filter(SafetyAudit.compliance_status == ComplianceStatus.NON_COMPLIANT)
            .filter(SafetyAudit.severity_level.in_([SeverityLevel(s) for s in allowed]))
            .order_by(SafetyAudit.created_at.desc())
            .limit(max(1, min(limit, 50)))
            .all()
        )
        return [
            {
                "at_utc": a.created_at.isoformat(timespec="minutes"),
                "permit_code": a.work_permit.permit_code if a.work_permit else None,
                "contractor": a.work_permit.contractor_company if a.work_permit else None,
                "severity": a.severity_level.value,
                "stop6": (a.ai_raw_json or {}).get("stop6_category"),
                "headline": (a.ai_raw_json or {}).get("summary_headline"),
                "infractions": [o.get("description") for o in (a.ai_raw_json or {}).get("observations", []) if o.get("is_infraction")],
            }
            for a in audits
        ]

    def get_risk_trends(days: int = 30) -> dict:
        """Analyse violation patterns over the last N days: counts by Toyota STOP 6 category, by contractor, by observation category, and by day."""
        since = datetime.utcnow() - timedelta(days=max(1, min(days, 365)))
        audits = db.query(SafetyAudit).filter(SafetyAudit.created_at >= since).all()
        bad = [a for a in audits if a.compliance_status == ComplianceStatus.NON_COMPLIANT]
        return {
            "window_days": days,
            "audits": len(audits),
            "violations": len(bad),
            "by_stop6": dict(Counter((a.ai_raw_json or {}).get("stop6_category", "UNKNOWN") for a in bad)),
            "by_contractor": dict(Counter(a.work_permit.contractor_company for a in bad if a.work_permit)),
            "by_observation_category": dict(Counter(
                o.get("category") for a in bad for o in (a.ai_raw_json or {}).get("observations", []) if o.get("is_infraction")
            )),
            "by_day": dict(Counter(a.created_at.date().isoformat() for a in bad)),
        }

    def search_company_sops(query: str) -> list:
        """Search the company's uploaded SOP documents and permit rule templates for passages relevant to the query. Returns the best matching excerpts."""
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

    return [get_safety_overview, list_work_permits, get_permit_details, get_recent_violations, get_risk_trends, search_company_sops]
