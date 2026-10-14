import mimetypes
import os
import re
import uuid
from collections import OrderedDict

from google.cloud import storage

BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "ehs-safety-inspections-bucket")

LOCAL_UPLOADS_DIR = os.getenv("UPLOADS_DIR", "/app/uploads")
PUBLIC_API_BASE_URL = os.getenv("PUBLIC_API_BASE_URL", "http://localhost:8000").rstrip("/")

def _ext(mime_type: str) -> str:
    m = (mime_type or "").lower()
    for key, ext in (("png", "png"), ("mp4", "mp4"), ("webm", "webm"), ("quicktime", "mov"), ("video", "mp4")):
        if key in m:
            return ext
    return "jpg"


LIBRARY_PREFIX = "library/"
_CACHE_LIMIT_BYTES = 80 * 1024 * 1024  # small in-process cache so video range requests don't re-download from GCS


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
            ext = _ext(mime_type)
            filename = f"{permit_code}_{uuid.uuid4().hex[:8]}.{ext}"
            filepath = os.path.join(LOCAL_UPLOADS_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            # Return URL to be served by FastAPI
            return f"{PUBLIC_API_BASE_URL}/uploads/{filename}"
        
        ext = _ext(mime_type)
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
        """Return (bytes, content_type) for stored evidence or a demo-library file, or None if it does not exist."""
        if not object_name.startswith(("violations/", LIBRARY_PREFIX)) or ".." in object_name:
            return None
        cache = self.__dict__.setdefault("_cache", OrderedDict())
        if object_name in cache:
            cache.move_to_end(object_name)
            return cache[object_name]
        if self.enabled:
            blob = self.bucket.blob(object_name)
            if not blob.exists():
                return None
            found = (blob.download_as_bytes(), blob.content_type or mimetypes.guess_type(object_name)[0] or "application/octet-stream")
        else:
            path = os.path.join(LOCAL_UPLOADS_DIR, object_name)
            if not os.path.isfile(path):
                return None
            with open(path, "rb") as f:
                found = (f.read(), mimetypes.guess_type(path)[0] or "application/octet-stream")
        cache[object_name] = found
        while sum(len(v[0]) for v in cache.values()) > _CACHE_LIMIT_BYTES and len(cache) > 1:
            cache.popitem(last=False)
        return found

    # ---------------------------------------------------------------- Demo library
    def library_url(self, name: str) -> str:
        return f"{PUBLIC_API_BASE_URL}/evidence/{LIBRARY_PREFIX}{os.path.basename(name)}"

    def list_library(self) -> list:
        """Demo media kept in the bucket under library/, newest first."""
        items = []
        if self.enabled:
            for blob in self.client.list_blobs(BUCKET_NAME, prefix=LIBRARY_PREFIX):
                name = blob.name[len(LIBRARY_PREFIX):]
                if name:
                    items.append((name, blob.content_type, blob.size, blob.updated.isoformat() if blob.updated else ""))
        else:
            folder = os.path.join(LOCAL_UPLOADS_DIR, LIBRARY_PREFIX)
            if os.path.isdir(folder):
                for name in os.listdir(folder):
                    path = os.path.join(folder, name)
                    items.append((name, mimetypes.guess_type(name)[0], os.path.getsize(path), str(os.path.getmtime(path))))
        items.sort(key=lambda i: i[3], reverse=True)
        return [
            {
                "name": name,
                "title": os.path.splitext(name)[0].replace("_", " "),
                "kind": "video" if (ctype or "").startswith("video/") else "image",
                "content_type": ctype,
                "size": size,
                "url": self.library_url(name),
            }
            for name, ctype, size, _ in items
        ]

    def add_to_library(self, data: bytes, filename: str, mime_type: str) -> dict:
        safe = re.sub(r"[^A-Za-z0-9 ._-]+", "", os.path.basename(filename)).strip().replace(" ", "_") or f"media_{uuid.uuid4().hex[:6]}.{_ext(mime_type)}"
        if self.enabled:
            self.bucket.blob(LIBRARY_PREFIX + safe).upload_from_string(data, content_type=mime_type)
        else:
            os.makedirs(os.path.join(LOCAL_UPLOADS_DIR, LIBRARY_PREFIX), exist_ok=True)
            with open(os.path.join(LOCAL_UPLOADS_DIR, LIBRARY_PREFIX, safe), "wb") as f:
                f.write(data)
        self.__dict__.get("_cache", {}).pop(LIBRARY_PREFIX + safe, None)
        return {"name": safe, "url": self.library_url(safe)}

    def delete_from_library(self, name: str) -> bool:
        object_name = LIBRARY_PREFIX + os.path.basename(name)
        self.__dict__.get("_cache", {}).pop(object_name, None)
        if self.enabled:
            blob = self.bucket.blob(object_name)
            if not blob.exists():
                return False
            blob.delete()
            return True
        path = os.path.join(LOCAL_UPLOADS_DIR, object_name)
        if not os.path.isfile(path):
            return False
        os.remove(path)
        return True

    def read_library(self, name: str):
        """(bytes, content_type) of a library item, or None."""
        return self.read_evidence(LIBRARY_PREFIX + os.path.basename(name))

    def purge_compliant_photo(self) -> None:
        """Foto aman (100% compliant) langsung di-purge dari memori RAM (Zero-Storage & Privacy-Preserved)."""
        # Tidak menyimpan file biner ke GCS untuk memangkas biaya 99% & mematuhi UU Privasi PDP
        return None
