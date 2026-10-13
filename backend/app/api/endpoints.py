import copy
import io
import math
from datetime import datetime
from typing import List

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
    AuditHistoryPaginated, AuditResult, ChatRequest, ChatResponse, DashboardMetrics, Observation, PermitCreate,
    PermitResponse, TemplateCreate, TemplateResponse, UserCreate, UserResponse, VoiceReportResult,
)
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


def _is_internal(permit: WorkPermit) -> bool:
    return "internal" in (permit.contractor_company or "").lower() or permit.template.permit_type == PermitType.GENERAL


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
                f"- Permits by status: {overview['permits_by_status']}\n"
                f"- AI audits recorded: {overview['total_ai_audits']} "
                f"(compliance {overview['compliance_rate_pct']}%)\n"
                f"- Critical violations: {overview['critical_violations']}\n\n"
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


@router.post("/inspections/audit", response_model=AuditResult)
async def process_inspection_audit(
    background_tasks: BackgroundTasks,
    permit_id: str = Form(...),
    image: UploadFile = File(...),
    sensor_temperature_c: float = Form(None),
    sensor_humidity_pct: float = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    permit = db.query(WorkPermit).filter(WorkPermit.id == permit_id).first()
    if not permit:
        raise HTTPException(status_code=404, detail="Work permit not found")

    # Deep-copy: never mutate the template's JSONB in the session.
    rules_context = copy.deepcopy(permit.template.dynamic_rules or {})
    rules_context.pop("extracted_text", None)
    is_internal = _is_internal(permit)
    rules_context["permit_context"] = {
        "permit_type": permit.template.permit_type.value,
        "workforce": "INTERNAL_FACTORY_SHOPFLOOR" if is_internal else "EXTERNAL_VENDOR_CONTRACTOR",
        "location_zone": permit.location_zone,
    }
    if sensor_temperature_c is not None or sensor_humidity_pct is not None:
        rules_context["sensor_data_fusion"] = {"temperature_c": sensor_temperature_c, "humidity_pct": sensor_humidity_pct}

    image_bytes = await image.read()
    mime_type = image.content_type or "image/jpeg"

    # 1. Analyse in memory first (no storage cost until we know it is evidence).
    try:
        result = await run_in_threadpool(gemini_service.analyze_permit_safety, image_bytes, mime_type, rules_context)
    except AIUnavailableError as e:
        # Never fabricate a verdict for a safety decision: fail loudly, record nothing, suspend nothing.
        raise HTTPException(status_code=503, detail=f"AI inspector unavailable, no verdict recorded. {e}")

    _reconcile_headcount(result, permit.worker_manifest or [])

    # 2. Enforcement policy: vendors get suspended on critical danger; internal lines keep running with coaching.
    if is_internal and result.enforcement_action == "SUSPEND_PERMIT":
        result.enforcement_action = "ISSUE_WARNING"
    if result.status == "NON_COMPLIANT" and result.enforcement_action == "NO_ACTION":
        result.enforcement_action = "ISSUE_WARNING"
    if result.enforcement_action == "SUSPEND_PERMIT":
        permit.status = PermitStatus.SUSPENDED

    # 3. Smart tiered retention: violations are kept as legal evidence, compliant photos are purged (privacy by design).
    if result.status == "NON_COMPLIANT":
        result.photo_url = storage_service.upload_violation_evidence(
            image_bytes=image_bytes, mime_type=mime_type, permit_code=permit.permit_code, severity=result.severity
        )
        result.data_retention_policy = "PERMANENT_LEGAL_EVIDENCE (" + ("GCS" if storage_service.enabled else "LOCAL") + ")"
    else:
        storage_service.purge_compliant_photo()
        result.data_retention_policy = "AUTO_PURGED (Zero-Storage / Privacy Preserved)"

    # 4. Real-time escalation for every violation, sent in the background.
    if result.status == "NON_COMPLIANT":
        result.alerts_dispatched = notification_service.configured_channels()
        violations = "\n".join(f"- {o.description}" for o in result.observations if o.is_infraction) or result.summary_headline
        background_tasks.add_task(
            notification_service.dispatch_violation_alerts,
            permit.permit_code, result.severity, result.enforcement_action, violations, result.photo_url, image_bytes,
        )

    db.add(SafetyAudit(
        work_permit_id=permit.id,
        inspector_id=str(current_user.id),
        photo_url=result.photo_url,
        ai_raw_json=result.model_dump(),
        compliance_status=ComplianceStatus(result.status),
        severity_level=SeverityLevel(result.severity),
        auto_action_taken=result.enforcement_action != "NO_ACTION",
    ))
    db.commit()
    return result


@router.get("/inspections/history", response_model=AuditHistoryPaginated)
def get_audit_history(page: int = 1, limit: int = 10, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    limit = max(1, min(limit, 100))
    total = db.query(SafetyAudit).count()
    audits = db.query(SafetyAudit).order_by(SafetyAudit.created_at.desc()).offset((max(page, 1) - 1) * limit).limit(limit).all()
    return {
        "data": [
            {
                "id": str(a.id),
                "permit_code": a.work_permit.permit_code if a.work_permit else "N/A",
                "contractor_company": a.work_permit.contractor_company if a.work_permit else "N/A",
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
def get_dashboard_metrics(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    total_audits = db.query(SafetyAudit).count()
    compliant_audits = db.query(SafetyAudit).filter(SafetyAudit.compliance_status == ComplianceStatus.COMPLIANT).count()
    suspended = db.query(WorkPermit).filter(WorkPermit.status == PermitStatus.SUSPENDED).all()
    return DashboardMetrics(
        active_permits=db.query(WorkPermit).filter(WorkPermit.status == PermitStatus.APPROVED).count(),
        compliance_rate=round(compliant_audits / total_audits * 100, 2) if total_audits else 100.0,
        critical_violations=db.query(SafetyAudit).filter(SafetyAudit.severity_level == SeverityLevel.CRITICAL).count(),
        suspended_permits=[{"permit_code": p.permit_code, "contractor": p.contractor_company} for p in suspended],
    )
