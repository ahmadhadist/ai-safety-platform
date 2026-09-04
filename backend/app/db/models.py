import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.database import Base

class PlanTier(str, enum.Enum):
    FREE = "FREE"
    PRO = "PRO"
    ENTERPRISE = "ENTERPRISE"

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    PLANT_MANAGER = "PLANT_MANAGER"
    INSPECTOR = "INSPECTOR"

class PermitType(str, enum.Enum):
    HOT_WORK = "HOT_WORK"
    WORKING_AT_HEIGHT = "WORKING_AT_HEIGHT"
    CONFINED_SPACE = "CONFINED_SPACE"
    ELECTRICAL_LOTO = "ELECTRICAL_LOTO"
    GENERAL = "GENERAL"

class PermitStatus(str, enum.Enum):
    APPROVED = "APPROVED"
    SUSPENDED = "SUSPENDED"
    COMPLETED = "COMPLETED"

class ComplianceStatus(str, enum.Enum):
    COMPLIANT = "COMPLIANT"
    NON_COMPLIANT = "NON_COMPLIANT"

class SeverityLevel(str, enum.Enum):
    NONE = "NONE"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    CRITICAL = "CRITICAL"

class ActionStatus(str, enum.Enum):
    OPEN = "OPEN"
    UNDER_REVIEW = "UNDER_REVIEW"
    RESOLVED = "RESOLVED"

class Organization(Base):
    __tablename__ = "organizations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True)
    plan_tier = Column(Enum(PlanTier), default=PlanTier.ENTERPRISE)
    created_at = Column(DateTime, default=datetime.utcnow)

    plants = relationship("Plant", back_populates="organization")
    permit_templates = relationship("PermitTemplate", back_populates="organization")
    users = relationship("User", back_populates="organization")

class Plant(Base):
    __tablename__ = "plants"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name = Column(String, nullable=False)
    plant_code = Column(String, unique=True, index=True)
    country_code = Column(String(2))
    timezone = Column(String)

    organization = relationship("Organization", back_populates="plants")
    work_permits = relationship("WorkPermit", back_populates="plant")
    users = relationship("User", back_populates="plant")

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    plant_id = Column(UUID(as_uuid=True), ForeignKey("plants.id"), nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.INSPECTOR)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="users")
    plant = relationship("Plant", back_populates="users")

class PermitTemplate(Base):
    __tablename__ = "permit_templates"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    permit_type = Column(Enum(PermitType), nullable=False)
    title = Column(String, nullable=False)
    dynamic_rules = Column(JSONB, nullable=False)

    organization = relationship("Organization", back_populates="permit_templates")
    work_permits = relationship("WorkPermit", back_populates="template")

class WorkPermit(Base):
    __tablename__ = "work_permits"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plant_id = Column(UUID(as_uuid=True), ForeignKey("plants.id"), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("permit_templates.id"), nullable=False)
    permit_code = Column(String, unique=True, index=True)
    contractor_company = Column(String)
    contractor_lead_name = Column(String)
    location_zone = Column(String)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(Enum(PermitStatus), default=PermitStatus.APPROVED)
    worker_manifest = Column(JSONB, default=list)

    plant = relationship("Plant", back_populates="work_permits")
    template = relationship("PermitTemplate", back_populates="work_permits")
    safety_audits = relationship("SafetyAudit", back_populates="work_permit")

class SafetyAudit(Base):
    __tablename__ = "safety_audits"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_permit_id = Column(UUID(as_uuid=True), ForeignKey("work_permits.id"), nullable=False)
    inspector_id = Column(String, nullable=False)
    photo_url = Column(String)
    ai_raw_json = Column(JSONB)
    compliance_status = Column(Enum(ComplianceStatus), nullable=False)
    severity_level = Column(Enum(SeverityLevel), nullable=False)
    auto_action_taken = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    work_permit = relationship("WorkPermit", back_populates="safety_audits")
    corrective_actions = relationship("CorrectiveAction", back_populates="safety_audit")

class CorrectiveAction(Base):
    __tablename__ = "corrective_actions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    safety_audit_id = Column(UUID(as_uuid=True), ForeignKey("safety_audits.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(String)
    assigned_to_contractor = Column(String)
    status = Column(Enum(ActionStatus), default=ActionStatus.OPEN)
    evidence_photo_url = Column(String)
    
    safety_audit = relationship("SafetyAudit", back_populates="corrective_actions")
