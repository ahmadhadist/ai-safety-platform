from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import endpoints, auth

from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(
    title="EHS Safety Platform API",
    description="Backend for Gemini-powered EHS Work Permit compliance system",
    version="1.0.0"
)

# Ensure uploads directory exists
os.makedirs("/app/uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(endpoints.router, prefix="/api/v1", tags=["Inspections & Permits"])

@app.get("/health")
def health_check():
    return {"status": "healthy"}
