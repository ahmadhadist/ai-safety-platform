import copy
import io
import math
import mimetypes
import os
import re
from collections import Counter
from datetime import datetime, timedelta
from typing import List, Optional

import PyPDF2
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.database import get_db
from app.db.models import (
    ComplianceStatus, PermitStatus, PermitTemplate, PermitType, Plant, SafetyAudit, SeverityLevel, User, WorkPermit,
)
from app.schemas import (
    AuditHistoryPaginated, AuditResult, ChatRequest, ChatResponse, DashboardMetrics, IncidentReport, Observation, PermitCreate,
    PermitResponse, TemplateCreate, TemplateResponse, UserCreate, UserResponse, VideoAuditResult, VoiceReportResult,
)
from app.services.privacy import blur_faces
from app.services.copilot_tools import build_copilot_tools
from app.services.gemini_service import AIUnavailableError, GeminiAuditService
from app.services.notification_service import NotificationService
from app.services.storage_service import StorageService

router = APIRouter()
gemini_service = GeminiAuditService()
storage_service = StorageService()
notification_service = NotificationService()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SEVERITY_ORDER = ["NONE", "LOW", "MEDIUM", "CRITICAL"]


def _template_dict(t: PermitTemplate) -> dict:
    return {"id": str(t.id), "title": t.title, "permit_type": t.permit_type.value, "dynamic_rules": t.dynamic_rules}


def _permit_dict(p: WorkPermit) -> dict:
    return {
        "id": str(p.id),
        "permit_code": p.permit_code,
        "contractor_company": p.contractor_company,
        "contractor_lead_name": p.contractor_lead_name,
        "location_zone": p.location_zone,
        "status": p.status.value,
        "dynamic_rules": p.template.dynamic_rules,
        "worker_manifest": p.worker_manifest or [],
    }


# ---------------------------------------------------------------- System
@router.get("/system/ai-status")
def ai_status(current_user: User = Depends(get_current_user)):
    return {
        "available": gemini_service.available,
        "backend": gemini_service.backend_name,
        "model_chain": gemini_service.models,
        "evidence_storage": "Google Cloud Storage" if storage_service.enabled else "Local disk",
        "alert_channels": notification_service.configured_channels(),
    }


# ---------------------------------------------------------------- Policies
@router.get("/policies/templates", response_model=list[TemplateResponse])
def get_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [_template_dict(t) for t in db.query(PermitTemplate).all()]


@router.post("/policies/templates", response_model=TemplateResponse)
def create_template(data: TemplateCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    new_template = PermitTemplate(
        org_id=current_user.org_id, permit_type=data.permit_type, title=data.title, dynamic_rules=data.dynamic_rules
    )
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return _template_dict(new_template)


@router.put("/policies/templates/{template_id}", response_model=TemplateResponse)
def update_template(template_id: str, data: TemplateCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    template = db.query(PermitTemplate).filter(PermitTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    template.permit_type = data.permit_type
    template.title = data.title
    template.dynamic_rules = data.dynamic_rules
    db.commit()
    db.refresh(template)
    return _template_dict(template)


@router.post("/policies/upload-sop", response_model=TemplateResponse)
async def upload_sop_pdf(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """SOP-to-Policy compiler: Gemini reads the PDF natively and turns prose into enforceable vision rules."""
    pdf_bytes = await file.read()
    if not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="File is not a PDF")

    try:
        extracted_text = "\n".join((page.extract_text() or "") for page in PyPDF2.PdfReader(io.BytesIO(pdf_bytes)).pages)
    except Exception:
        extracted_text = ""

    dynamic_rules = {"extracted_text": extracted_text[:10000], "source_document": file.filename}
    permit_type = PermitType.GENERAL
    title = f"SOP Document: {file.filename}"
    try:
        compiled = await run_in_threadpool(gemini_service.compile_sop_pdf, pdf_bytes)
        permit_type = PermitType(compiled.permit_type)
        title = f"{compiled.title} (from {file.filename})"
        dynamic_rules.update(compiled.model_dump(exclude={"title", "permit_type"}, exclude_none=True))
        dynamic_rules["compiled_by_ai"] = True
    except AIUnavailableError as e:
        # Still keep the raw text so the Co-Pilot can search it; rules can be edited manually.
        print(f"SOP compile skipped: {e}")

    new_template = PermitTemplate(org_id=current_user.org_id, title=title, permit_type=permit_type, dynamic_rules=dynamic_rules)
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return _template_dict(new_template)


# ---------------------------------------------------------------- Permits
@router.get("/permits", response_model=List[PermitResponse])
def get_permits(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [_permit_dict(p) for p in db.query(WorkPermit).all()]


@router.post("/permits", response_model=PermitResponse)
def create_permit(permit_data: PermitCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    template = db.query(PermitTemplate).filter(PermitTemplate.id == permit_data.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if db.query(WorkPermit).filter(WorkPermit.permit_code == permit_data.permit_code).first():
        raise HTTPException(status_code=400, detail="Permit code already exists")

    plant_id = current_user.plant_id
    if not plant_id:
        plant = db.query(Plant).filter(Plant.org_id == current_user.org_id).first()
        if not plant:
            raise HTTPException(status_code=400, detail="No plant configured for this organization")
        plant_id = plant.id

    new_permit = WorkPermit(
        plant_id=plant_id,
        template_id=template.id,
        permit_code=permit_data.permit_code,
        contractor_company=permit_data.contractor_company,
        contractor_lead_name=permit_data.contractor_lead_name,
        location_zone=permit_data.location_zone,
        start_time=datetime.fromisoformat(permit_data.start_time.replace("Z", "+00:00")),
        end_time=datetime.fromisoformat(permit_data.end_time.replace("Z", "+00:00")),
        status=PermitStatus.APPROVED,
        worker_manifest=permit_data.worker_manifest,
    )
    db.add(new_permit)
    db.commit()
    db.refresh(new_permit)
    return _permit_dict(new_permit)


@router.get("/permits/{permit_code}/context", response_model=PermitResponse)
def get_permit_context(permit_code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    permit = db.query(WorkPermit).filter(WorkPermit.permit_code == permit_code).first()
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    return _permit_dict(permit)


@router.post("/permits/{permit_id}/resolve")
def resolve_suspended_permit(permit_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    permit = db.query(WorkPermit).filter(WorkPermit.id == permit_id).first()
    if not permit:
        raise HTTPException(status_code=404, detail="Work permit not found")
    if permit.status != PermitStatus.SUSPENDED:
        raise HTTPException(status_code=400, detail="Permit is not suspended")
    permit.status = PermitStatus.APPROVED
    db.commit()
    return {"status": "success", "message": "Permit restored to APPROVED status"}


# ---------------------------------------------------------------- Agentic Co-Pilot
@router.post("/copilot/chat", response_model=ChatResponse)
def chat_with_copilot(request: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tools = build_copilot_tools(db)
    try:
        return gemini_service.run_copilot_agent(request.message, tools, request.language or "id")
    except AIUnavailableError as e:
        print(f"Copilot unavailable: {e}")
        # Degrade honestly: show real live numbers instead of an invented answer.
        overview = tools[0]()
        return {
            "reply": (
                "### ⚠️ AI temporarily unavailable — live data snapshot\n"
                f"- AI inspections recorded: {overview['total_ai_inspections']} "
                f"(compliance {overview['compliance_rate_pct']}%)\n"
                f"- Critical violations: {overview['critical_violations']}\n"
                f"- Stop-work orders: {overview['stop_work_orders']}\n\n"
                "Please retry in a moment."
            ),
            "tool_calls": [{"name": "get_safety_overview", "args": {}}],
        }


# ---------------------------------------------------------------- Vision audit
def _reconcile_headcount(result: AuditResult, manifest: list) -> None:
    """Denwacho check: more people on camera than on the approved manifest = unregistered worker on site."""
    result.manifest_worker_count = len(manifest)
    detected = result.worker_count_detected
    if not manifest or detected is None or detected <= len(manifest):
        return
    result.headcount_mismatch = True
    extra = detected - len(manifest)
    result.observations.append(Observation(
        category="UNSAFE_CONDITION",
        description=(
            f"{extra} pekerja tidak terdaftar di manifest izin ({detected} terdeteksi vs {len(manifest)} terdaftar). / "
            f"{extra} unregistered worker(s) on site ({detected} detected vs {len(manifest)} on the permit manifest)."
        ),
        is_infraction=True,
        confidence=0.9,
    ))
    result.status = "NON_COMPLIANT"
    if SEVERITY_ORDER.index(result.severity) < SEVERITY_ORDER.index("MEDIUM"):
        result.severity = "MEDIUM"
    if result.enforcement_action == "NO_ACTION":
        result.enforcement_action = "ISSUE_WARNING"


AUTO_POLICY = "auto"
MAX_VIDEO_BYTES = 25 * 1024 * 1024


def _policy_context(db: Session, policy_id: Optional[str], location: str):
    """Return (policy or None when auto-detecting, rules_context for Gemini)."""
    if policy_id and policy_id != AUTO_POLICY:
        policy = db.query(PermitTemplate).filter(PermitTemplate.id == policy_id).first()
        if not policy:
            raise HTTPException(status_code=404, detail="Safety policy not found")
        rules = copy.deepcopy(policy.dynamic_rules or {})  # never mutate the policy's JSONB in the session
        rules.pop("extracted_text", None)
        rules["safety_policy"] = policy.title
        rules["inspection_context"] = {"category": policy.permit_type.value, "location": location}
        return policy, rules
    policies = db.query(PermitTemplate).all()
    return None, {
        "inspection_context": {"location": location},
        "available_policies": [
            {
                "title": t.title,
                "category": t.permit_type.value,
                **{k: v for k, v in (t.dynamic_rules or {}).items() if k in ("required_ppe", "environmental_prerequisites", "forbidden_hazards", "max_temperature_c", "min_lux")},
            }
            for t in policies
        ],
    }


def _match_policy(db: Session, applied_title: str) -> Optional[PermitTemplate]:
    policies = db.query(PermitTemplate).all()
    title = (applied_title or "").strip().lower()
    return (
        next((t for t in policies if t.title.lower() == title), None)
        or next((t for t in policies if title and (title in t.title.lower() or t.title.lower() in title)), None)
        or next((t for t in policies if t.permit_type == PermitType.GENERAL), None)
    )


def _normalize_enforcement(result) -> None:
    """Deterministic policy on top of the model: any violation gets at least a warning, CRITICAL always stops work."""
    if result.status == "NON_COMPLIANT" and result.enforcement_action == "NO_ACTION":
        result.enforcement_action = "ISSUE_WARNING"
    if result.severity == "CRITICAL":
        result.status = "NON_COMPLIANT"
        result.enforcement_action = "STOP_WORK"


def _evidence_key(location: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", location).strip("-") or "area"


# ---------------------------------------------------------------- Demo media library (GCS library/)
@router.get("/media/library")
def list_media_library(current_user: User = Depends(get_current_user)):
    return storage_service.list_library()


@router.post("/media/library")
async def add_media_to_library(file: UploadFile = File(...), current_user: User = Depends(require_admin)):
    data = await file.read()
    mime_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if not mime_type.startswith(("image/", "video/")):
        mime_type = mimetypes.guess_type(file.filename or "")[0] or ""
    if not mime_type.startswith(("image/", "video/")):
        raise HTTPException(status_code=400, detail="Only images and videos can be added")
    if len(data) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 25 MB)")
    return storage_service.add_to_library(data, file.filename or "media", mime_type)


@router.delete("/media/library/{name}")
def delete_media_from_library(name: str, current_user: User = Depends(require_admin)):
    if not storage_service.delete_from_library(name):
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "deleted"}


async def _read_media(upload: Optional[UploadFile], library_object: Optional[str], kind: str):
    """Bytes + MIME from an upload, or straight from the demo library in Cloud Storage (no browser round trip)."""
    if library_object:
        found = await run_in_threadpool(storage_service.read_library, library_object)
        if not found:
            raise HTTPException(status_code=404, detail="Library item not found")
        data, mime_type = found
    elif upload is not None:
        data = await upload.read()
        mime_type = upload.content_type or ""
        if not mime_type.startswith(f"{kind}/"):
            mime_type = mimetypes.guess_type(upload.filename or "")[0] or ""
    else:
        raise HTTPException(status_code=400, detail=f"Upload a {kind} or pick one from the library")
    if not mime_type.startswith(f"{kind}/"):
        raise HTTPException(status_code=400, detail=f"Expected an {kind} file" if kind == "image" else "Upload a video file (MP4, WebM or MOV)")
    return data, mime_type


@router.post("/inspections/audit", response_model=AuditResult)
async def process_inspection_audit(
    background_tasks: BackgroundTasks,
    image: Optional[UploadFile] = File(None),
    library_object: Optional[str] = Form(None),
    policy_id: Optional[str] = Form(AUTO_POLICY),
    location: Optional[str] = Form(None),
    permit_id: Optional[str] = Form(None),
    sensor_temperature_c: float = Form(None),
    sensor_humidity_pct: float = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Inspect a photo against a safety policy (or let Gemini pick one) at a location. Work permits are optional."""
    permit = db.query(WorkPermit).filter(WorkPermit.id == permit_id).first() if permit_id else None
    if permit_id and not permit:
        raise HTTPException(status_code=404, detail="Work permit not found")
    location = (location or (permit.location_zone if permit else "") or "Unspecified area").strip()[:120]
    policy, rules_context = _policy_context(db, str(permit.template_id) if permit else policy_id, location)
    if sensor_temperature_c is not None or sensor_humidity_pct is not None:
        rules_context["sensor_data_fusion"] = {"temperature_c": sensor_temperature_c, "humidity_pct": sensor_humidity_pct}

    image_bytes, mime_type = await _read_media(image, library_object, "image")

    # 1. Analyse in memory first (no storage cost until we know it is evidence).
    try:
        result = await run_in_threadpool(gemini_service.analyze_permit_safety, image_bytes, mime_type, rules_context)
    except AIUnavailableError as e:
        # Never fabricate a verdict for a safety decision: fail loudly and record nothing.
        raise HTTPException(status_code=503, detail=f"AI inspector unavailable, no verdict recorded. {e}")

    if policy is None:
        policy = _match_policy(db, result.applied_policy)
        result.policy_auto_detected = True
    result.location = location
    result.policy_title = policy.title if policy else result.applied_policy
    if permit:
        _reconcile_headcount(result, permit.worker_manifest or [])
    _normalize_enforcement(result)
    if permit and result.enforcement_action == "STOP_WORK":
        permit.status = PermitStatus.SUSPENDED

    # 2. Smart tiered retention: violations are kept as evidence (faces blurred), compliant photos are purged.
    evidence_bytes = image_bytes
    if result.status == "NON_COMPLIANT":
        evidence_bytes, result.faces_blurred = await run_in_threadpool(blur_faces, image_bytes, result.faces_2d, mime_type)
        result.photo_url = storage_service.upload_violation_evidence(
            image_bytes=evidence_bytes, mime_type=mime_type, permit_code=permit.permit_code if permit else _evidence_key(location), severity=result.severity
        )
        result.data_retention_policy = "EVIDENCE KEPT · FACES BLURRED (" + ("GCS" if storage_service.enabled else "LOCAL") + ")"
    else:
        storage_service.purge_compliant_photo()
        result.data_retention_policy = "AUTO-PURGED (privacy preserved)"

    # 3. Real-time escalation for every violation, sent in the background.
    if result.status == "NON_COMPLIANT":
        result.alerts_dispatched = notification_service.configured_channels()
        violations = "\n".join(f"- {o.description}" for o in result.observations if o.is_infraction) or result.summary_headline
        background_tasks.add_task(
            notification_service.dispatch_violation_alerts,
            location, result.severity, result.enforcement_action, violations, result.photo_url, evidence_bytes,
        )

    audit = SafetyAudit(
        work_permit_id=permit.id if permit else None,
        template_id=policy.id if policy else None,
        location=location,
        inspector_id=str(current_user.id),
        photo_url=result.photo_url,
        compliance_status=ComplianceStatus(result.status),
        severity_level=SeverityLevel(result.severity),
        auto_action_taken=result.enforcement_action != "NO_ACTION",
    )
    db.add(audit)
    db.flush()
    result.audit_id = str(audit.id)
    audit.ai_raw_json = {**result.model_dump(exclude={"faces_2d"}), "media_type": "image"}
    db.commit()
    return result


@router.post("/inspections/video", response_model=VideoAuditResult)
async def process_video_audit(
    background_tasks: BackgroundTasks,
    video: Optional[UploadFile] = File(None),
    library_object: Optional[str] = Form(None),
    policy_id: Optional[str] = Form(AUTO_POLICY),
    location: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """CCTV clip review: Gemini watches the video and returns a timestamped violation timeline."""
    video_bytes, mime_type = await _read_media(video, library_object, "video")
    if len(video_bytes) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail="Clip too large: keep it under 25 MB (about 30-60 s of 720p).")
    location = (location or "Unspecified area").strip()[:120]
    policy, rules_context = _policy_context(db, policy_id, location)

    try:
        result = await run_in_threadpool(gemini_service.analyze_video, video_bytes, mime_type, rules_context)
    except AIUnavailableError as e:
        raise HTTPException(status_code=503, detail=f"AI inspector unavailable, no verdict recorded. {e}")

    if policy is None:
        policy = _match_policy(db, result.applied_policy)
        result.policy_auto_detected = True
    result.location = location
    result.policy_title = policy.title if policy else result.applied_policy
    _normalize_enforcement(result)

    retention = "AUTO-PURGED (privacy preserved)"
    if result.status == "NON_COMPLIANT":
        result.video_url = (
            storage_service.library_url(library_object) if library_object
            else storage_service.upload_violation_evidence(
                image_bytes=video_bytes, mime_type=mime_type, permit_code=_evidence_key(location), severity=result.severity
            )
        )
        retention = "VIDEO EVIDENCE KEPT (" + ("GCS" if storage_service.enabled else "LOCAL") + ")"
        result.alerts_dispatched = notification_service.configured_channels()
        timeline = "\n".join(f"- [{int(e.start_seconds // 60):02d}:{int(e.start_seconds % 60):02d}] {e.description}" for e in result.events) or result.summary_headline
        background_tasks.add_task(
            notification_service.dispatch_violation_alerts,
            location, result.severity, result.enforcement_action, timeline, result.video_url, None,
        )

    audit = SafetyAudit(
        template_id=policy.id if policy else None,
        location=location,
        inspector_id=str(current_user.id),
        photo_url=result.video_url,
        compliance_status=ComplianceStatus(result.status),
        severity_level=SeverityLevel(result.severity),
        auto_action_taken=result.enforcement_action != "NO_ACTION",
    )
    db.add(audit)
    db.flush()
    result.audit_id = str(audit.id)
    audit.ai_raw_json = {**result.model_dump(), "media_type": "video", "data_retention_policy": retention, "observations": [
        {"category": e.category, "description": f"[{int(e.start_seconds // 60):02d}:{int(e.start_seconds % 60):02d}] {e.description}", "is_infraction": True, "confidence": 0.9}
        for e in result.events
    ]}
    db.commit()
    return result


@router.post("/inspections/{audit_id}/report", response_model=IncidentReport)
def incident_report(audit_id: str, regenerate: bool = False, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """One-click incident investigation report (5 Whys + hierarchy of controls), cached on the audit."""
    audit = db.query(SafetyAudit).filter(SafetyAudit.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Inspection not found")
    raw = audit.ai_raw_json or {}
    if raw.get("incident_report") and not regenerate:
        return raw["incident_report"]
    if audit.compliance_status == ComplianceStatus.COMPLIANT:
        raise HTTPException(status_code=400, detail="No violation to report on this inspection")
    try:
        report = gemini_service.generate_incident_report(raw, audit.location or "Unspecified area", audit.template.title if audit.template else "General")
    except AIUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    audit.ai_raw_json = {**raw, "incident_report": report.model_dump()}  # reassign so SQLAlchemy persists the JSONB change
    db.commit()
    return report


@router.get("/inspections/history", response_model=AuditHistoryPaginated)
def get_audit_history(page: int = 1, limit: int = 10, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    limit = max(1, min(limit, 100))
    total = db.query(SafetyAudit).count()
    audits = db.query(SafetyAudit).order_by(SafetyAudit.created_at.desc()).offset((max(page, 1) - 1) * limit).limit(limit).all()
    return {
        "data": [
            {
                "id": str(a.id),
                "location": a.location or (a.work_permit.location_zone if a.work_permit else None),
                "policy_title": a.template.title if a.template else (a.work_permit.template.title if a.work_permit else None),
                "inspector_id": a.inspector_id,
                "photo_url": a.photo_url,
                "compliance_status": a.compliance_status.value,
                "severity_level": a.severity_level.value,
                "auto_action_taken": a.auto_action_taken,
                "created_at": a.created_at.isoformat(),
                "ai_raw_json": a.ai_raw_json or {},
            }
            for a in audits
        ],
        "total": total,
        "page": page,
        "total_pages": math.ceil(total / limit),
    }


# ---------------------------------------------------------------- Mobile
@router.post("/mobile/voice-report", response_model=VoiceReportResult)
async def process_voice_report(audio: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    audio_bytes = await audio.read()
    try:
        return await run_in_threadpool(gemini_service.analyze_voice_incident, audio_bytes, audio.content_type or "audio/mp4")
    except AIUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/mobile/field-guide", response_model=ChatResponse)
def field_guide_chat(request: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    t_data = [{"title": t.title, "rules": t.dynamic_rules} for t in db.query(PermitTemplate).all()]
    return {"reply": gemini_service.chat_field_guide(request.message, t_data)}


# ---------------------------------------------------------------- Team
@router.get("/users", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(User).filter(User.org_id == current_user.org_id).all()


@router.post("/users", response_model=UserResponse)
def create_user(user: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    new_user = User(
        org_id=current_user.org_id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        hashed_password=pwd_context.hash(user.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


# ---------------------------------------------------------------- Dashboard
@router.get("/dashboard/metrics", response_model=DashboardMetrics)
def get_dashboard_metrics(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    audits = db.query(SafetyAudit).order_by(SafetyAudit.created_at.desc()).all()
    violations = [a for a in audits if a.compliance_status == ComplianceStatus.NON_COMPLIANT]
    action = lambda a: (a.ai_raw_json or {}).get("enforcement_action")
    risk = lambda a: (a.ai_raw_json or {}).get("risk_category") or (a.ai_raw_json or {}).get("stop6_category") or "GENERAL"

    today = datetime.utcnow().date()
    days = [today - timedelta(days=i) for i in range(13, -1, -1)]
    per_day = Counter(a.created_at.date() for a in audits)
    bad_per_day = Counter(a.created_at.date() for a in violations)

    return DashboardMetrics(
        total_inspections=len(audits),
        compliance_rate=round((len(audits) - len(violations)) / len(audits) * 100, 1) if audits else 100.0,
        critical_violations=sum(a.severity_level == SeverityLevel.CRITICAL for a in audits),
        stop_work_orders=sum(action(a) in ("STOP_WORK", "SUSPEND_PERMIT") for a in audits),
        daily_trend=[{"date": d.isoformat(), "inspections": per_day[d], "violations": bad_per_day[d]} for d in days],
        risk_breakdown=[{"risk_category": k, "count": v} for k, v in Counter(risk(a) for a in violations).most_common()],
        location_hotspots=[{"location": k, "violations": v} for k, v in Counter(a.location or "Unspecified" for a in violations).most_common(5)],
        recent_incidents=[
            {
                "id": str(a.id),
                "at": a.created_at.isoformat(),
                "location": a.location,
                "severity": a.severity_level.value,
                "risk_category": risk(a),
                "action": action(a),
                "headline": (a.ai_raw_json or {}).get("summary_headline"),
                "photo_url": a.photo_url,
            }
            for a in violations[:6]
        ],
    )
