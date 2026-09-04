from typing import List, Optional, Literal, Any
from pydantic import BaseModel, Field

class Observation(BaseModel):
    category: Literal["PPE", "UNSAFE_ACTION", "UNSAFE_CONDITION", "FIRE_HAZARD"]
    description: str
    is_infraction: bool
    confidence: float = Field(..., ge=0.0, le=1.0)

class AuditResult(BaseModel):
    status: Literal["COMPLIANT", "NON_COMPLIANT"]
    severity: Literal["NONE", "LOW", "MEDIUM", "CRITICAL"]
    summary_headline: str
    observations: List[Observation]
    enforcement_action: Literal["NO_ACTION", "ISSUE_WARNING", "SUSPEND_PERMIT"]
    recommendation: str

class PermitResponse(BaseModel):
    id: Any
    permit_code: str
    contractor_company: str
    contractor_lead_name: str
    location_zone: str
    status: str
    dynamic_rules: dict
    worker_manifest: List[dict] = []

    class Config:
        from_attributes = True

class PermitCreate(BaseModel):
    template_id: str
    permit_code: str
    contractor_company: str
    contractor_lead_name: str
    location_zone: str
    start_time: str
    end_time: str
    worker_manifest: List[dict]

class TemplateCreate(BaseModel):
    title: str
    permit_type: str
    dynamic_rules: dict

class TemplateResponse(BaseModel):
    id: str
    title: str
    permit_type: str
    dynamic_rules: dict

    class Config:
        from_attributes = True

class DashboardMetrics(BaseModel):
    active_permits: int
    compliance_rate: float
    critical_violations: int
    suspended_permits: List[dict]

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

class VoiceReportResult(BaseModel):
    title: str
    hazard_level: Literal["NONE", "LOW", "MEDIUM", "CRITICAL"]
    identified_location: Optional[str]
    incident_description: str
    immediate_action_required: str

class UserCreate(BaseModel):
    full_name: str
    email: str
    password: str
    role: Literal["ADMIN", "PLANT_MANAGER", "INSPECTOR"]

class UserResponse(BaseModel):
    id: Any
    full_name: str
    email: str
    role: str

    class Config:
        from_attributes = True

class AuditHistoryItem(BaseModel):
    id: str
    permit_code: str
    contractor_company: str
    inspector_id: str
    photo_url: Optional[str]
    compliance_status: str
    severity_level: str
    auto_action_taken: bool
    created_at: str
    ai_raw_json: dict

    class Config:
        from_attributes = True

class AuditHistoryPaginated(BaseModel):
    data: List[AuditHistoryItem]
    total: int
    page: int
    total_pages: int

