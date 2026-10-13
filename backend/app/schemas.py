from typing import List, Optional, Literal, Any
from pydantic import BaseModel, Field

class Observation(BaseModel):
    category: Literal["PPE", "UNSAFE_ACTION", "UNSAFE_CONDITION", "FIRE_HAZARD", "HEALTH_HAZARD", "ERGONOMICS"]
    description: str
    is_infraction: bool
    confidence: float = Field(..., ge=0.0, le=1.0)
    box_2d: Optional[List[int]] = Field(
        None, description="Bounding box [ymin, xmin, ymax, xmax] normalized to 0-1000 locating the person/object this observation refers to."
    )

class HealthEvaluation(BaseModel):
    lighting_condition: Literal["ADEQUATE", "MARGINAL", "INSUFFICIENT_LIGHTING"]
    lighting_notes: str
    ergonomics_status: Literal["SAFE_POSTURE", "ERGONOMIC_STRAIN_RISK", "NOT_APPLICABLE"]
    ergonomics_notes: str

class SafetyPerimeterEvaluation(BaseModel):
    housekeeping_5s_status: Literal["CLEAN_AND_SAFE", "CLUTTERED_TRIPPING_HAZARD", "NOT_APPLICABLE"]
    housekeeping_notes: str
    barrier_and_apar_status: Literal["SECURE_PERIMETER", "MISSING_BARRIERS", "NOT_APPLICABLE"]
    perimeter_notes: str

# Industry-standard fatal-risk families (aligned with common "life-saving rules" frameworks).
RiskCategory = Literal[
    "MACHINERY", "FALLING_OBJECTS", "VEHICLES", "WORKING_AT_HEIGHT",
    "ELECTRICAL", "FIRE_HEAT_CHEMICAL", "CONFINED_SPACE", "GENERAL",
]
EnforcementAction = Literal["NO_ACTION", "ISSUE_WARNING", "STOP_WORK"]

class GeminiAuditOutput(BaseModel):
    """Exact schema Gemini is constrained to via response_schema (structured output)."""
    status: Literal["COMPLIANT", "NON_COMPLIANT"]
    severity: Literal["NONE", "LOW", "MEDIUM", "CRITICAL"]
    summary_headline: str
    worker_count_detected: int = Field(..., ge=0, description="Number of people visible in the image.")
    risk_category: RiskCategory
    health_evaluation: HealthEvaluation
    safety_perimeter_evaluation: SafetyPerimeterEvaluation
    observations: List[Observation]
    enforcement_action: EnforcementAction
    recommendation: str

class AuditResult(GeminiAuditOutput):
    """Gemini output enriched with server-side facts (model provenance, manifest reconciliation, actions taken)."""
    risk_category: Optional[str] = "GENERAL"
    location: Optional[str] = None
    policy_title: Optional[str] = None
    worker_count_detected: Optional[int] = None
    health_evaluation: Optional[dict] = None
    safety_perimeter_evaluation: Optional[dict] = None
    manifest_worker_count: Optional[int] = None
    headcount_mismatch: bool = False
    model_used: Optional[str] = None
    latency_ms: Optional[int] = None
    data_retention_policy: Optional[str] = None
    photo_url: Optional[str] = None
    alerts_dispatched: List[str] = []

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
    total_inspections: int
    compliance_rate: float
    critical_violations: int
    stop_work_orders: int
    daily_trend: List[dict]          # [{date, inspections, violations}] for the last 14 days
    risk_breakdown: List[dict]       # [{risk_category, count}]
    location_hotspots: List[dict]    # [{location, violations}]
    recent_incidents: List[dict]

class ChatRequest(BaseModel):
    message: str
    language: Optional[str] = "id"

class ToolCallTrace(BaseModel):
    name: str
    args: dict = {}

class ChatResponse(BaseModel):
    reply: str
    tool_calls: List[ToolCallTrace] = []
    model_used: Optional[str] = None

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
    location: Optional[str]
    policy_title: Optional[str]
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

