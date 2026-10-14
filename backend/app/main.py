import os
import re

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import auth, endpoints
from sqlalchemy import text

from app.db.database import Base, SessionLocal, engine
from app.db.models import Organization

app = FastAPI(
    title="EHS Safety Platform API",
    description="Backend for Gemini-powered EHS Work Permit compliance system",
    version="2.0.0",
)

UPLOADS_DIR = os.getenv("UPLOADS_DIR", "/app/uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Auth uses Bearer tokens (not cookies), so credentials are not needed cross-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(endpoints.router, prefix="/api/v1", tags=["Inspections & Permits"])


@app.on_event("startup")
def init_database():
    """Create tables and load demo data on an empty database (first boot on Cloud Run / Cloud SQL)."""
    Base.metadata.create_all(bind=engine)
    # Lightweight in-place migration for databases created before audits became policy/location based.
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE safety_audits ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES permit_templates(id)"))
        conn.execute(text("ALTER TABLE safety_audits ADD COLUMN IF NOT EXISTS location VARCHAR"))
        conn.execute(text("ALTER TABLE safety_audits ALTER COLUMN work_permit_id DROP NOT NULL"))
    if os.getenv("AUTO_SEED", "true").lower() != "true":
        return
    db = SessionLocal()
    try:
        empty = db.query(Organization).first() is None
    finally:
        db.close()
    if empty or os.getenv("FORCE_RESEED", "").lower() == "true":
        from seed import reset_and_seed_db
        reset_and_seed_db()


@app.get("/evidence/{object_name:path}")
def get_evidence(object_name: str, request: Request):
    found = endpoints.storage_service.read_evidence(object_name)
    if not found:
        raise HTTPException(status_code=404, detail="Evidence not found")
    data, content_type = found
    headers = {"Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes"}
    # Byte ranges let <video> seek (e.g. jumping to a violation on the timeline).
    match = re.match(r"bytes=(\d*)-(\d*)", request.headers.get("range", ""))
    if match and (match.group(1) or match.group(2)):
        size = len(data)
        if match.group(1):
            start = int(match.group(1))
            end = min(int(match.group(2)), size - 1) if match.group(2) else size - 1
        else:
            start, end = max(0, size - int(match.group(2))), size - 1
        if start >= size or start > end:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        return Response(content=data[start:end + 1], status_code=206, media_type=content_type, headers=headers)
    return Response(content=data, media_type=content_type, headers=headers)


@app.get("/health")
def health_check():
    return {"status": "healthy"}
