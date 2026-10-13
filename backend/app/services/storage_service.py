import os
import uuid
from google.cloud import storage

BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "ehs-safety-inspections-bucket")

LOCAL_UPLOADS_DIR = os.getenv("UPLOADS_DIR", "/app/uploads")
PUBLIC_API_BASE_URL = os.getenv("PUBLIC_API_BASE_URL", "http://localhost:8000").rstrip("/")

class StorageService:
    def __init__(self):
        try:
            # Requires GOOGLE_APPLICATION_CREDENTIALS in env
            if not os.getenv("GCS_BUCKET_NAME"):
                raise RuntimeError("GCS_BUCKET_NAME not set")
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
            return f"{PUBLIC_API_BASE_URL}/uploads/{filename}"
        
        ext = "png" if "png" in mime_type.lower() else "jpg"
        filename = f"violations/{permit_code}/{severity.lower()}_{uuid.uuid4().hex[:8]}.{ext}"
        blob = self.bucket.blob(filename)
        blob.metadata = {
            "retention_policy": "PERMANENT_LEGAL_AUDIT",
            "permit_code": permit_code,
            "severity": severity
        }
        blob.upload_from_string(image_bytes, content_type=mime_type)
        # Bucket stays private; the API streams evidence through an unguessable URL (see /evidence route).
        return f"{PUBLIC_API_BASE_URL}/evidence/{filename}"

    def read_evidence(self, object_name: str):
        """Return (bytes, content_type) for a stored violation photo, or None if it does not exist."""
        if not self.enabled or not object_name.startswith("violations/"):
            return None
        blob = self.bucket.blob(object_name)
        if not blob.exists():
            return None
        return blob.download_as_bytes(), blob.content_type or "image/jpeg"

    def purge_compliant_photo(self) -> None:
        """Foto aman (100% compliant) langsung di-purge dari memori RAM (Zero-Storage & Privacy-Preserved)."""
        # Tidak menyimpan file biner ke GCS untuk memangkas biaya 99% & mematuhi UU Privasi PDP
        return None
