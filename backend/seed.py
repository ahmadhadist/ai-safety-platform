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
        "severity_action": {"CRITICAL": "STOP_WORK", "MEDIUM": "ISSUE_WARNING"}
    }
    wah_rules = {
        "required_ppe": ["Full_Body_Harness", "Hard_Hat_With_Chin_Strap"],
        "environmental_prerequisites": ["Double_Lanyard_Attached"],
        "forbidden_hazards": ["Unanchored_Lanyard"],
        "severity_action": {"CRITICAL": "STOP_WORK", "MEDIUM": "ISSUE_WARNING"}
    }
    template_hw = PermitTemplate(org_id=org.id, permit_type=PermitType.HOT_WORK, title="Standard Hot Work", dynamic_rules=hot_work_rules)
    template_wah = PermitTemplate(org_id=org.id, permit_type=PermitType.WORKING_AT_HEIGHT, title="Working at Height", dynamic_rules=wah_rules)
    db.add_all([template_hw, template_wah])
    db.commit()

    # Remaining company policies (exported from the original development database).
    import json, os
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data", "policies.json")) as f:
        exported = {t["title"]: t for t in json.load(f)}
    for t in (template_hw, template_wah):
        extra = exported.get(t.title) or exported.get("Working at Height (WAH)" if t.permit_type == PermitType.WORKING_AT_HEIGHT else "")
        if extra:
            t.dynamic_rules = {**t.dynamic_rules, "required_ppe": list(dict.fromkeys(t.dynamic_rules["required_ppe"] + extra["dynamic_rules"]["required_ppe"]))}
    template_wah.title = "Working at Height (WAH)"
    templates_by_title = {"Standard Hot Work": template_hw, "Working at Height (WAH)": template_wah}
    for title, t in exported.items():
        if title not in templates_by_title:
            templates_by_title[title] = PermitTemplate(org_id=org.id, permit_type=PermitType(t["permit_type"]), title=title, dynamic_rules=t["dynamic_rules"])
            db.add(templates_by_title[title])
    db.commit()

    # 5. Work Permits
    now = datetime.utcnow()
    permit_1 = WorkPermit(plant_id=plant_tokyo.id, template_id=template_hw.id, permit_code="HW-2026-0891", contractor_company="Fuji Welders Ltd", contractor_lead_name="Kenji Sato", location_zone="Zone A", start_time=now - timedelta(hours=1), end_time=now + timedelta(hours=7), status=PermitStatus.APPROVED,
                          worker_manifest=[{"name": "Kenji Sato", "role": "Lead Welder", "cert": "AWS-D1.1"}, {"name": "Hiro Tanaka", "role": "Fire Watcher", "cert": "FW-JP-22"}])
    permit_2 = WorkPermit(plant_id=plant_texas.id, template_id=template_wah.id, permit_code="WAH-2026-0102", contractor_company="Lone Star Scaffolding", contractor_lead_name="Mike Johnson", location_zone="Unit 4 Reactor", start_time=now - timedelta(hours=2), end_time=now + timedelta(hours=6), status=PermitStatus.SUSPENDED)
    permit_int = WorkPermit(plant_id=plant_tokyo.id, template_id=templates_by_title["General Factory Floor"].id, permit_code="INT-TOYOTA-SHOPFLOOR",
                            contractor_company="Internal Plant Operations (Toyota/TMMIN)", contractor_lead_name="Budi Santoso (Supervisor Line 1)",
                            location_zone="Plant 1 - Stamping & Assembly Line", start_time=now - timedelta(days=1), end_time=now + timedelta(days=90),
                            status=PermitStatus.APPROVED, worker_manifest=[{"name": "Agus Setiawan", "badge_id": "T-8821"}, {"name": "Dedi Pratama", "badge_id": "T-8822"}])
    db.add_all([permit_1, permit_2, permit_int])
    db.commit()

    
    # 7. Two weeks of AI audit history so dashboards and the Co-Pilot's trend tools have something to analyse.
    T = templates_by_title
    history = [
        (13, "Welding Bay A", T["Standard Hot Work"], "NON_COMPLIANT", "MEDIUM", "FIRE_HEAT_CHEMICAL", "FIRE_HAZARD", "Combustible cardboard stored within 10 m of welding sparks."),
        (12, "Welding Bay A", T["Standard Hot Work"], "COMPLIANT", "NONE", "FIRE_HEAT_CHEMICAL", None, None),
        (11, "Scaffold Zone - Unit 4", T["Working at Height (WAH)"], "NON_COMPLIANT", "CRITICAL", "WORKING_AT_HEIGHT", "PPE", "Worker at 6 m height without a full body harness."),
        (10, "Assembly Line 1", T["General Factory Floor"], "COMPLIANT", "NONE", "GENERAL", None, None),
        (9, "Scaffold Zone - Unit 4", T["Working at Height (WAH)"], "NON_COMPLIANT", "MEDIUM", "WORKING_AT_HEIGHT", "UNSAFE_CONDITION", "Scaffold platform missing toe board on upper deck."),
        (8, "Warehouse Dock 2", T["General Factory Floor"], "NON_COMPLIANT", "MEDIUM", "VEHICLES", "UNSAFE_ACTION", "Pedestrian walking inside marked forklift lane."),
        (7, "Welding Bay A", T["Standard Hot Work"], "NON_COMPLIANT", "LOW", "FIRE_HEAT_CHEMICAL", "PPE", "Fire watcher not wearing safety glasses."),
        (6, "Substation B", T["Electrical Work & LOTO"], "COMPLIANT", "NONE", "ELECTRICAL", None, None),
        (5, "Welding Bay A", T["Standard Hot Work"], "NON_COMPLIANT", "CRITICAL", "FIRE_HEAT_CHEMICAL", "FIRE_HAZARD", "No fire extinguisher within reach of active hot work."),
        (4, "Scaffold Zone - Unit 4", T["Working at Height (WAH)"], "NON_COMPLIANT", "MEDIUM", "WORKING_AT_HEIGHT", "PPE", "Hard hat chin strap not fastened at height."),
        (4, "Assembly Line 1", T["General Factory Floor"], "NON_COMPLIANT", "LOW", "MACHINERY", "ERGONOMICS", "Operator bending >30 degrees to lift parts from floor bin."),
        (3, "Tank Farm - T3", T["Confined Space Entry"], "COMPLIANT", "NONE", "CONFINED_SPACE", None, None),
        (2, "Scaffold Zone - Unit 4", T["Working at Height (WAH)"], "NON_COMPLIANT", "CRITICAL", "WORKING_AT_HEIGHT", "UNSAFE_ACTION", "Lanyard unhooked while moving between scaffold bays."),
        (1, "Warehouse Dock 2", T["General Factory Floor"], "COMPLIANT", "NONE", "VEHICLES", None, None),
        (1, "Assembly Line 1", T["General Factory Floor"], "COMPLIANT", "NONE", "GENERAL", None, None),
        (0, "Substation B", T["Electrical Work & LOTO"], "NON_COMPLIANT", "MEDIUM", "ELECTRICAL", "UNSAFE_CONDITION", "Electrical panel door left open without lockout tag."),
    ]
    for days_ago, location, policy, status, severity, risk, category, finding in history:
        bad = status == "NON_COMPLIANT"
        action = "STOP_WORK" if severity == "CRITICAL" else ("ISSUE_WARNING" if bad else "NO_ACTION")
        db.add(SafetyAudit(
            template_id=policy.id, location=location, inspector_id=str(inspector_user.id), photo_url=None,
            compliance_status=ComplianceStatus(status), severity_level=SeverityLevel(severity), auto_action_taken=bad,
            created_at=now - timedelta(days=days_ago, hours=(days_ago * 7) % 9 + 1),
            ai_raw_json={
                "status": status, "severity": severity, "risk_category": risk, "enforcement_action": action,
                "location": location, "policy_title": policy.title,
                "summary_headline": finding or "All required PPE and controls in place.",
                "observations": [{"category": category, "description": finding, "is_infraction": True, "confidence": 0.93}] if bad else [],
                "recommendation": "Stop work and correct the finding before resuming." if bad else "Continue work.",
                "model_used": "seed-data",
            },
        ))
    db.commit()

    print("Seed complete! Added 'admin@globalmfg.com' and 'inspector@globalmfg.com'.")
    db.close()

if __name__ == "__main__":
    reset_and_seed_db()
