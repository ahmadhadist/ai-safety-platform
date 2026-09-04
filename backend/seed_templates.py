import os
import sys

# Tambahkan path aplikasi agar bisa import module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import SessionLocal
from app.db.models import PermitTemplate, PermitType, Organization

def seed_master_templates():
    db = SessionLocal()
    org = db.query(Organization).first()
    if not org:
        print("Error: Organisasi belum ada, jalankan seed.py utama dulu.")
        return

    templates_data = [
        {
            "permit_type": PermitType.WORKING_AT_HEIGHT,
            "title": "Working at Height (WAH)",
            "rules": {
                "required_ppe": ["Full_Body_Harness", "Hard_Hat_With_Chin_Strap", "Safety_Lanyard", "High_Visibility_Vest"],
                "severity_mapping": {"CRITICAL": "SUSPEND_PERMIT", "MEDIUM": "ISSUE_WARNING"}
            }
        },
        {
            "permit_type": PermitType.CONFINED_SPACE,
            "title": "Confined Space Entry",
            "rules": {
                "required_ppe": ["Gas_Detector", "Respirator_Mask", "Protective_Coverall", "Safety_Boots"],
                "severity_mapping": {"CRITICAL": "SUSPEND_PERMIT", "MEDIUM": "ISSUE_WARNING"}
            }
        },
        {
            "permit_type": PermitType.ELECTRICAL_LOTO,
            "title": "Electrical Work & LOTO",
            "rules": {
                "required_ppe": ["Dielectric_Boots", "Insulated_Gloves", "Arc_Flash_Face_Shield", "LOTO_Padlock"],
                "severity_mapping": {"CRITICAL": "SUSPEND_PERMIT", "MEDIUM": "ISSUE_WARNING"}
            }
        },
        {
            "permit_type": PermitType.GENERAL,
            "title": "General Factory Floor",
            "rules": {
                "required_ppe": ["Hard_Hat", "Safety_Glasses", "High_Visibility_Vest", "Steel_Toe_Boots"],
                "severity_mapping": {"CRITICAL": "SUSPEND_PERMIT", "MEDIUM": "ISSUE_WARNING"}
            }
        }
    ]

    count = 0
    for data in templates_data:
        exists = db.query(PermitTemplate).filter(PermitTemplate.title == data["title"]).first()
        if not exists:
            new_temp = PermitTemplate(
                org_id=org.id,
                permit_type=data["permit_type"],
                title=data["title"],
                dynamic_rules=data["rules"]
            )
            db.add(new_temp)
            count += 1
    
    db.commit()
    db.close()
    print(f"Berhasil menambahkan {count} Master Templates K3!")

if __name__ == "__main__":
    seed_master_templates()
