from typing import List, Optional
import PyPDF2
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.database import get_db
from app.db.models import WorkPermit, PermitTemplate, SafetyAudit, PermitStatus, ComplianceStatus, SeverityLevel, User
from app.schemas import AuditResult, PermitResponse, DashboardMetrics, TemplateCreate, TemplateResponse
from app.services.gemini_service import GeminiAuditService
from app.services.storage_service import StorageService
from app.core.deps import get_current_user, require_admin

router = APIRouter()
gemini_service = GeminiAuditService()
storage_service = StorageService()

@router.get("/policies/templates", response_model=list[TemplateResponse])
def get_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    templates = db.query(PermitTemplate).all()
    return [{"id": str(t.id), "title": t.title, "permit_type": t.permit_type.value, "dynamic_rules": t.dynamic_rules} for t in templates]

@router.post("/policies/templates", response_model=TemplateResponse)
def create_template(data: TemplateCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    new_template = PermitTemplate(
        org_id=current_user.org_id,
        permit_type=data.permit_type,
        title=data.title,
        dynamic_rules=data.dynamic_rules
    )
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return {"id": str(new_template.id), "title": new_template.title, "permit_type": new_template.permit_type.value, "dynamic_rules": new_template.dynamic_rules}

@router.put("/policies/templates/{template_id}", response_model=TemplateResponse)
def update_template(template_id: str, data: TemplateCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    template = db.query(PermitTemplate).filter(PermitTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    template.permit_type = data.permit_type
    template.title = data.title
    template.dynamic_rules = data.dynamic_rules
    
    db.add(template)
    db.commit()
    db.refresh(template)
    return {"id": str(template.id), "title": template.title, "permit_type": template.permit_type.value, "dynamic_rules": template.dynamic_rules}



@router.post("/policies/upload-sop", response_model=TemplateResponse)
def upload_sop_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        pdf_reader = PyPDF2.PdfReader(file.file)
        extracted_text = ""
        for page in pdf_reader.pages:
            extracted_text += page.extract_text() + "\n"
        
        # Create a new dynamic rule template from the PDF text
        new_template = PermitTemplate(
            title=f"SOP Document: {file.filename}",
            permit_type=PermitType.GENERAL,
            dynamic_rules={"extracted_text": extracted_text[:10000]} # Store up to 10k chars for demo
        )
        db.add(new_template)
        db.commit()
        db.refresh(new_template)
        
        return {"id": str(new_template.id), "title": new_template.title, "permit_type": new_template.permit_type.value, "dynamic_rules": new_template.dynamic_rules}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/permits", response_model=List[PermitResponse])
def get_permits(db: Session = Depends(get_db)):
    permits = db.query(WorkPermit).all()
    results = []
    for p in permits:
        p_dict = p.__dict__.copy()
        p_dict['dynamic_rules'] = p.template.dynamic_rules
        p_dict['worker_manifest'] = p.worker_manifest if p.worker_manifest else []
        results.append(p_dict)
    return results

from app.schemas import PermitCreate
from datetime import datetime
@router.post("/permits", response_model=PermitResponse)
def create_permit(permit_data: PermitCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    template = db.query(PermitTemplate).filter(PermitTemplate.id == permit_data.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    start_dt = datetime.fromisoformat(permit_data.start_time.replace('Z', '+00:00'))
    end_dt = datetime.fromisoformat(permit_data.end_time.replace('Z', '+00:00'))
    
    new_permit = WorkPermit(
        plant_id=current_user.plant_id if current_user.plant_id else db.query(Plant).first().id,
        template_id=template.id,
        permit_code=permit_data.permit_code,
        contractor_company=permit_data.contractor_company,
        contractor_lead_name=permit_data.contractor_lead_name,
        location_zone=permit_data.location_zone,
        start_time=start_dt,
        end_time=end_dt,
        status=PermitStatus.APPROVED,
        worker_manifest=permit_data.worker_manifest
    )
    db.add(new_permit)
    db.commit()
    db.refresh(new_permit)
    
    res_dict = new_permit.__dict__.copy()
    res_dict['dynamic_rules'] = template.dynamic_rules
    res_dict['worker_manifest'] = new_permit.worker_manifest if new_permit.worker_manifest else []
    return res_dict


@router.get("/permits/{permit_code}/context", response_model=PermitResponse)
def get_permit_context(permit_code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    permit = db.query(WorkPermit).filter(WorkPermit.permit_code == permit_code).first()
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    return {
        "id": str(permit.id),
        "permit_code": permit.permit_code,
        "contractor_company": permit.contractor_company,
        "contractor_lead_name": permit.contractor_lead_name,
        "location_zone": permit.location_zone,
        "status": permit.status.value,
        "dynamic_rules": permit.template.dynamic_rules
    }

@router.post("/permits/{permit_id}/resolve")
def resolve_suspended_permit(permit_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    permit = db.query(WorkPermit).filter(WorkPermit.id == permit_id).first()
    if not permit:
        raise HTTPException(status_code=404, detail="Work permit not found")
    if permit.status != PermitStatus.SUSPENDED:
        raise HTTPException(status_code=400, detail="Permit is not suspended")
    
    permit.status = PermitStatus.APPROVED
    db.commit()
    return {"status": "success", "message": "Permit restored to APPROVED status"}

from app.schemas import ChatRequest, ChatResponse
@router.post("/copilot/chat", response_model=ChatResponse)
def chat_with_copilot(request: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # RAG Retrieval: Ambil data context real-time dari database
    active_permits = db.query(WorkPermit).filter(WorkPermit.status == PermitStatus.APPROVED).count()
    suspended_permits = db.query(WorkPermit).filter(WorkPermit.status == PermitStatus.SUSPENDED).all()
    total_critical = db.query(SafetyAudit).filter(SafetyAudit.severity_level == SeverityLevel.CRITICAL).count()
    total_audits = db.query(SafetyAudit).count()
    
    # Sertakan dokumen SOP & Kebijakan K3 yang diunggah
    templates = db.query(PermitTemplate).all()
    policy_summaries = []
    for t in templates:
        rules = t.dynamic_rules or {}
        if "extracted_text" in rules:
            policy_summaries.append(f"Dokumen/Standar '{t.title}': {rules['extracted_text'][:1500]}")
        elif "required_ppe" in rules:
            policy_summaries.append(f"Aturan '{t.title}' (APD: {', '.join(rules.get('required_ppe', []))})")
        else:
            policy_summaries.append(f"Aturan '{t.title}'")

    context = {
        "active_approved_permits": active_permits,
        "suspended_permits_count": len(suspended_permits),
        "suspended_permit_details": [{"code": p.permit_code, "contractor": p.contractor_company} for p in suspended_permits],
        "total_critical_violations_history": total_critical,
        "total_historical_audits": total_audits,
        "company_name": current_user.organization.name if current_user.organization else "Global Manufacturing",
        "uploaded_company_policies_and_sops": policy_summaries
    }
    
    # Panggil Gemini dengan context RAG
    reply = gemini_service.chat_with_ehs_data(request.message, context, request.language)
    return {"reply": reply}

@router.post("/inspections/audit")
async def process_inspection_audit(
    permit_id: str = Form(...),
    image: UploadFile = File(...),
    sensor_temperature_c: float = Form(None),
    sensor_humidity_pct: float = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    permit = db.query(WorkPermit).filter(WorkPermit.id == permit_id).first()
    if not permit:
        raise HTTPException(status_code=404, detail="Work permit not found")
        
    rules_context = permit.template.dynamic_rules
    if sensor_temperature_c is not None or sensor_humidity_pct is not None:
        rules_context["sensor_data_fusion"] = {
            "temperature_c": sensor_temperature_c,
            "humidity_pct": sensor_humidity_pct
        }
        
    image_bytes = await image.read()
    mime_type = image.content_type or "image/jpeg"
    
    # 1. Analisis foto terlebih dahulu di memori RAM via Gemini (Zero Storage Cost Upfront)
    try:
        ai_result: AuditResult = gemini_service.analyze_permit_safety(
            image_bytes=image_bytes, mime_type=mime_type, rules_context=rules_context
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    # 2. Smart Tiered Retention Policy:
    # - Jika NON_COMPLIANT (Pelanggaran): Upload foto permanen ke GCS sebagai bukti hukum audit (Chain of Custody).
    # - Jika COMPLIANT (Aman): Auto-purge foto dari RAM (0 Byte GCS Cost & Melindungi Privasi Karyawan sesuai UU PDP).
    if ai_result.status == "NON_COMPLIANT":
        photo_url = storage_service.upload_violation_evidence(
            image_bytes=image_bytes, mime_type=mime_type, permit_code=permit.permit_code, severity=ai_result.severity
        )
        retention_mode = "PERMANENT_LEGAL_EVIDENCE (GCS)"
    else:
        storage_service.purge_compliant_photo()
        photo_url = None
        retention_mode = "AUTO_PURGED (Zero-Storage / Privacy Preserved)"

    # 3. Log Audit ke Database (Metadata & Statistik tetap tersimpan selamanya)
    audit_data = ai_result.model_dump()
    audit_data["data_retention_policy"] = retention_mode

    audit = SafetyAudit(
        work_permit_id=permit.id,
        inspector_id=str(current_user.id),
        photo_url=photo_url,
        ai_raw_json=audit_data,
        compliance_status=ComplianceStatus(ai_result.status),
        severity_level=SeverityLevel(ai_result.severity),
        auto_action_taken=(ai_result.enforcement_action == "SUSPEND_PERMIT")
    )
    db.add(audit)
    
    # 4. Enforce automated suspension:
    # Vendor/kontraktor berisiko tinggi -> SUSPEND_PERMIT jika bahaya kritis.
    # Pekerja internal pabrik (Toyota Shopfloor) -> ISSUE_WARNING (Lini produksi tetap jalan, log coaching K3 dicatat).
    is_internal = "internal" in permit.contractor_company.lower() or permit.template.permit_type.value == "GENERAL_FACTORY"
    
    if ai_result.enforcement_action == "SUSPEND_PERMIT" and not is_internal:
        permit.status = PermitStatus.SUSPENDED
        db.add(permit)
    elif is_internal and ai_result.status == "NON_COMPLIANT":
        # Paksa aksi internal menjadi ISSUE_WARNING (bukan suspend lini pabrik)
        ai_result.enforcement_action = "ISSUE_WARNING"
        audit.auto_action_taken = True
        
        # Trigger WhatsApp Notification via Fonnte
        from app.services.notification_service import NotificationService
        wa_service = NotificationService()
        
        # Extract violation details to send via WA
        violations = "\\n".join([f"- {obs.description}" for obs in ai_result.observations if obs.is_infraction])
        
        wa_service.send_whatsapp_alert(
            permit_code=permit.permit_code,
            severity=ai_result.severity,
            violations_summary=violations,
            photo_url=photo_url
        )
        
        # Trigger Telegram Alert juga
        wa_service.send_telegram_alert(
            permit_code=permit.permit_code,
            severity=ai_result.severity,
            violations_summary=violations,
            photo_url=photo_url
        )
        
    db.commit()
    return ai_result

from app.schemas import AuditHistoryPaginated
import math
@router.get("/inspections/history", response_model=AuditHistoryPaginated)
def get_audit_history(page: int = 1, limit: int = 10, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    skip = (page - 1) * limit
    total = db.query(SafetyAudit).count()
    audits = db.query(SafetyAudit).order_by(SafetyAudit.created_at.desc()).offset(skip).limit(limit).all()
    results = []
    for audit in audits:
        results.append({
            "id": str(audit.id),
            "permit_code": audit.work_permit.permit_code if audit.work_permit else "N/A",
            "contractor_company": audit.work_permit.contractor_company if audit.work_permit else "N/A",
            "inspector_id": audit.inspector_id,
            "photo_url": audit.photo_url,
            "compliance_status": audit.compliance_status.value,
            "severity_level": audit.severity_level.value,
            "auto_action_taken": audit.auto_action_taken,
            "created_at": audit.created_at.isoformat(),
            "ai_raw_json": audit.ai_raw_json or {}
        })
    
    return {
        "data": results,
        "total": total,
        "page": page,
        "total_pages": math.ceil(total / limit) if limit > 0 else 1
    }

from app.schemas import VoiceReportResult
@router.post("/mobile/voice-report", response_model=VoiceReportResult)
async def process_voice_report(audio: UploadFile = File(...), db: Session = Depends(get_db)):
    audio_bytes = await audio.read()
    mime_type = audio.content_type or "audio/mp3"
    try:
        result = gemini_service.analyze_voice_incident(audio_bytes, mime_type)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/mobile/field-guide", response_model=ChatResponse)
def field_guide_chat(request: ChatRequest, db: Session = Depends(get_db)):
    templates = db.query(PermitTemplate).all()
    t_data = [{"title": t.title, "rules": t.dynamic_rules} for t in templates]
    reply = gemini_service.chat_field_guide(request.message, t_data)
    return {"reply": reply}

from app.schemas import UserCreate, UserResponse
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@router.get("/users", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Untuk hackathon, return semua user di organisasi yang sama
    users = db.query(User).filter(User.org_id == current_user.org_id).all()
    return users

@router.post("/users", response_model=UserResponse)
def create_user(user: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Cek apakah email sudah ada
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    hashed_pw = pwd_context.hash(user.password)
    new_user = User(
        org_id=current_user.org_id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        hashed_password=hashed_pw
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/dashboard/metrics", response_model=DashboardMetrics)
def get_dashboard_metrics(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    total_permits = db.query(WorkPermit).count()
    active_permits = db.query(WorkPermit).filter(WorkPermit.status == PermitStatus.APPROVED).count()
    critical_violations = db.query(SafetyAudit).filter(SafetyAudit.severity_level == SeverityLevel.CRITICAL).count()
    
    total_audits = db.query(SafetyAudit).count()
    compliant_audits = db.query(SafetyAudit).filter(SafetyAudit.compliance_status == ComplianceStatus.COMPLIANT).count()
    compliance_rate = (compliant_audits / total_audits * 100) if total_audits > 0 else 100.0

    suspended_permits = db.query(WorkPermit).filter(WorkPermit.status == PermitStatus.SUSPENDED).all()
    
    return DashboardMetrics(
        active_permits=active_permits,
        compliance_rate=round(compliance_rate, 2),
        critical_violations=critical_violations,
        suspended_permits=[{"permit_code": p.permit_code, "contractor": p.contractor_company} for p in suspended_permits]
    )
