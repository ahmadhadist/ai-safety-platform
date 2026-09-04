import uuid
from datetime import datetime, timedelta
from app.db.database import engine, Base, SessionLocal
from app.db.models import (
    Organization, Plant, PermitTemplate, WorkPermit, SafetyAudit, CorrectiveAction, User,
    PlanTier, PermitType, PermitStatus, ComplianceStatus, SeverityLevel, ActionStatus, UserRole
)
from app.core.security import get_password_hash

def reset_and_seed_db():
    print("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    
    print("Seeding data...")
    # 1. Organization
    org = Organization(name="Global Manufacturing Inc.", slug="global-mfg", plan_tier=PlanTier.ENTERPRISE)
    db.add(org)
    db.commit()
    db.refresh(org)

    # 2. Plants
    plant_tokyo = Plant(org_id=org.id, name="Tokyo Assembly Plant", plant_code="TK-01", country_code="JP", timezone="Asia/Tokyo")
    plant_texas = Plant(org_id=org.id, name="Texas Refinery", plant_code="TX-01", country_code="US", timezone="America/Chicago")
    db.add_all([plant_tokyo, plant_texas])
    db.commit()

    # 3. Users (Auth Seed)
    admin_user = User(
        org_id=org.id,
        email="admin@globalmfg.com",
        hashed_password=get_password_hash("admin123"),
        full_name="Global Safety Director",
        role=UserRole.ADMIN
    )
    inspector_user = User(
        org_id=org.id,
        plant_id=plant_texas.id,
        email="inspector@globalmfg.com",
        hashed_password=get_password_hash("inspector123"),
        full_name="Texas Lead Inspector",
        role=UserRole.INSPECTOR
    )
    db.add_all([admin_user, inspector_user])
    db.commit()

    # 4. Permit Templates
    hot_work_rules = {
        "required_ppe": ["Flame_Resistant_Clothing", "Welding_Helmet", "Leather_Gloves"],
        "environmental_prerequisites": ["Fire_Extinguisher_Present", "Combustibles_Cleared_10m"],
        "forbidden_hazards": ["Unattended_Torch", "Missing_Fire_Watcher"],
        "severity_action": {"CRITICAL": "SUSPEND_PERMIT", "MEDIUM": "ISSUE_WARNING"}
    }
    wah_rules = {
        "required_ppe": ["Full_Body_Harness", "Hard_Hat_With_Chin_Strap"],
        "environmental_prerequisites": ["Double_Lanyard_Attached"],
        "forbidden_hazards": ["Unanchored_Lanyard"],
        "severity_action": {"CRITICAL": "SUSPEND_PERMIT", "MEDIUM": "ISSUE_WARNING"}
    }
    template_hw = PermitTemplate(org_id=org.id, permit_type=PermitType.HOT_WORK, title="Standard Hot Work", dynamic_rules=hot_work_rules)
    template_wah = PermitTemplate(org_id=org.id, permit_type=PermitType.WORKING_AT_HEIGHT, title="Working at Height", dynamic_rules=wah_rules)
    db.add_all([template_hw, template_wah])
    db.commit()

    # 5. Work Permits
    now = datetime.utcnow()
    permit_1 = WorkPermit(plant_id=plant_tokyo.id, template_id=template_hw.id, permit_code="HW-2026-0891", contractor_company="Fuji Welders Ltd", contractor_lead_name="Kenji Sato", location_zone="Zone A", start_time=now - timedelta(hours=1), end_time=now + timedelta(hours=7), status=PermitStatus.APPROVED)
    permit_2 = WorkPermit(plant_id=plant_texas.id, template_id=template_wah.id, permit_code="WAH-2026-0102", contractor_company="Lone Star Scaffolding", contractor_lead_name="Mike Johnson", location_zone="Unit 4 Reactor", start_time=now - timedelta(hours=2), end_time=now + timedelta(hours=6), status=PermitStatus.SUSPENDED)
    db.add_all([permit_1, permit_2])
    db.commit()

    # 6. Safety Audits
    audit_1 = SafetyAudit(
        work_permit_id=permit_2.id, inspector_id=str(inspector_user.id),
        photo_url="https://storage.googleapis.com/ehs-demo/audit_photos/tx-001.jpg",
        ai_raw_json={"status": "NON_COMPLIANT", "severity": "CRITICAL", "summary_headline": "Worker identified without safety harness attachment.", "observations": [{"category": "UNSAFE_ACTION", "description": "Lanyard not attached.", "is_infraction": True, "confidence": 0.98}], "enforcement_action": "SUSPEND_PERMIT", "recommendation": "Immediately halt work"},
        compliance_status=ComplianceStatus.NON_COMPLIANT, severity_level=SeverityLevel.CRITICAL, auto_action_taken=True
    )
    db.add(audit_1)
    db.commit()

    print("Seed complete! Added 'admin@globalmfg.com' and 'inspector@globalmfg.com'.")
    db.close()

if __name__ == "__main__":
    reset_and_seed_db()
