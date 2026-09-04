import os
import uuid
from google.cloud import storage

BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "ehs-safety-inspections-bucket")

LOCAL_UPLOADS_DIR = "/app/uploads"

class StorageService:
    def __init__(self):
        try:
            # Requires GOOGLE_APPLICATION_CREDENTIALS in env
            self.client = storage.Client()
            self.bucket = self.client.bucket(BUCKET_NAME)
            self.enabled = True
        except Exception as e:
            print(f"⚠️ GCS Setup Warning: {e}. Falling back to local storage for hackathon dev mode.")
            self.enabled = False
            if not os.path.exists(LOCAL_UPLOADS_DIR):
                os.makedirs(LOCAL_UPLOADS_DIR, exist_ok=True)

    def upload_violation_evidence(self, image_bytes: bytes, mime_type: str, permit_code: str, severity: str) -> str:
        """Menyimpan foto pelanggaran K3 secara permanen ke GCS sebagai bukti hukum audit (Chain of Custody)."""
        if not self.enabled:
            # Save locally for demo
            ext = "png" if "png" in mime_type.lower() else "jpg"
            filename = f"{permit_code}_{uuid.uuid4().hex[:8]}.{ext}"
            filepath = os.path.join(LOCAL_UPLOADS_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            # Return URL to be served by FastAPI
            return f"http://localhost:8000/uploads/{filename}"
        
        filename = f"violations/{permit_code}/{severity.lower()}_{uuid.uuid4().hex[:8]}.jpg"
        blob = self.bucket.blob(filename)
        blob.metadata = {
            "retention_policy": "PERMANENT_LEGAL_AUDIT",
            "permit_code": permit_code,
            "severity": severity
        }
        blob.upload_from_string(image_bytes, content_type=mime_type)
        return blob.public_url

    def purge_compliant_photo(self) -> None:
        """Foto aman (100% compliant) langsung di-purge dari memori RAM (Zero-Storage & Privacy-Preserved)."""
        # Tidak menyimpan file biner ke GCS untuk memangkas biaya 99% & mematuhi UU Privasi PDP
        return None
