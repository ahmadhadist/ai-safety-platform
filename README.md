# 🛡️ EHS Safety Platform — Enterprise AI Co-Pilot

[![Hackathon](https://img.shields.io/badge/Status-Hackathon%20MVP-success?style=for-the-badge&logo=rocket)](https://github.com)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Web-Next.js%2014-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![SwiftUI](https://img.shields.io/badge/Mobile-SwiftUI%20(iOS)-F05138?style=for-the-badge&logo=swift)](https://developer.apple.com/xcode/swiftui/)
[![Google Gemini](https://img.shields.io/badge/AI%20Engine-Gemini%201.5%20Flash-4285F4?style=for-the-badge&logo=google)](https://deepmind.google/technologies/gemini/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2015-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org)

> **Languages:** 🇬🇧 **English** | 🇮🇩 [Bahasa Indonesia](README_ID.md)

---

## 📌 Executive Summary

**EHS Safety Platform** is an enterprise-grade Environmental Health, and Safety (EHS / K3) intelligence ecosystem. It addresses critical safety blind spots in manufacturing plants and heavy construction worksites by combining:
1. **Real-time Multimodal AI Vision & Audio analysis** (powered by Google Gemini 1.5 Flash).
2. **Digital Work Permit (E-Permit) & Worker Manifest tracking** (*Denwacho* roll-call).
3. **Instant Dual-Channel Escalation** (Telegram Bot & WhatsApp).
4. **An interactive on-site AI Co-Pilot / Field Guide** for dynamic safety standard inquiries.

---

## 🚨 Problem Statement: The 3 Critical Gaps in Industrial Safety

| # | The Real-World Bottleneck | Industry Impact | Our AI Solution |
|---|---------------------------|-----------------|-----------------|
| **1** | **Inspector Blind Spots** | Safety officers cannot be present at every high-risk zone (hot work, confined spaces) 24/7. | **Dynamic AI Vision Sandbox** continuously monitors CCTV feeds with dynamic, non-hardcoded rules. |
| **2** | **Paper-Based Permits & Vendor Swapping** | Contractors submit paper permits once and silently swap uncertified workers daily (*"Kucing-kucingan"*). | **Digital E-Permit & Worker Manifest (JSONB)** with daily presence verification (*Denwacho* concept). |
| **3** | **Emergency Reporting Latency** | When an incident strikes, workers panic, lack literacy to type forms, and delay critical response. | **AI Voice SOS (Mobile)** — speak naturally in panic, and AI parses structured hazard tickets in 2 seconds. |

---

## 💡 Core Architecture & System Flow

```mermaid
graph TD
    subgraph Field Layer [On-Site Field Operations]
        Worker[Workers / Contractors] -->|Voice / Emergency| MobileApp[iOS Native App - SwiftUI]
        Inspector[Safety Inspector / Mandor] -->|Monitor & Audit| MobileApp
        CCTV[CCTV / Field Cameras] -->|RTSP / Snapshots| WebDashboard[Next.js Web Dashboard]
    end

    subgraph Core Engine [Dockerized Backend]
        MobileApp -->|HTTP REST / Audio Upload| FastAPI[FastAPI Backend :8000]
        WebDashboard -->|REST / Webhooks| FastAPI
        FastAPI -->|Relational & JSONB Data| Postgres[(PostgreSQL 15)]
    end

    subgraph Intelligence & Alerting [AI & Notification Service]
        FastAPI -->|Multimodal Audio & Vision| Gemini[Google Gemini 1.5 Flash]
        FastAPI -->|Critical Infraction Alert| Telegram[Telegram Bot API]
        FastAPI -->|Automated Escalation| WhatsApp[WhatsApp Gateway]
    end
```

---

## 🌟 Key Features (The "Killer" Capabilities)

### 1. 🎙️ Multimodal AI Voice SOS (Native iOS)
* **Zero-Friction Emergency Reporting:** Workers do not need to fill out complex digital forms. Simply press and hold the mic button and speak freely (e.g., *"There is a gas hiss and chemical smell near Valve C, workers are feeling dizzy"*).
* **Gemini Multimodal Processing:** Audio is processed via Gemini 1.5 Flash, extracting:
  * `incident_title`: Short summary.
  * `hazard_level`: Automated risk classification (`NONE`, `LOW`, `MEDIUM`, `CRITICAL`).
  * `identified_location`: Spatial tag detected from audio context.
  * `immediate_action_required`: Instant first-responder directives.
* **Built-in Mock Fallback:** Seamlessly operates in zero-key demonstration mode during pitch reviews.

### 2. 📄 Digital E-Permits with Group-Level Worker Manifest (*Denwacho*)
* **Frictionless Contractor Architecture:** Low-level temporary workers **do not need accounts or app downloads**.
* The Admin or Contractor Lead registers the shift manifest (`worker_manifest` stored as flexible PostgreSQL `JSONB`).
* Mandor / Field Inspector validates daily crew presence on-site directly from their phone.
* Automated status lifecycle: `PENDING` ➔ `APPROVED` ➔ `SUSPENDED` (auto-frozen if severe violations occur) ➔ `RESOLVED`.

### 3. 🧠 Dynamic AI Vision Sandbox (Web Dashboard)
* **Zero Hardcoding:** Safety rules are not static if-else statements.
* Safety Officers can create, adjust, and deploy custom inspection prompts on the fly through the web UI (e.g., *"Ensure workers within 5 meters of the welding tank wear tinted face shields and fire-retardant aprons"*).
* Camera snapshots are audited against the active permit’s dynamic rules in real-time.

### 4. ⚡ Instant Dual-Channel Notification Engine
* **Telegram Bot Integration:** Immediate dispatch of markdown-formatted alerts with photo evidence, violation breakdown, and contractor details.
* **WhatsApp Gateway:** Parallel alerts sent to plant safety superintendents.
* **Automatic Stop-Work Order:** When a `CRITICAL` severity violation is detected, the associated permit is automatically transitioned to `SUSPENDED`, triggering on-site lockdown protocols.

### 5. 🤖 EHS AI Co-Pilot & Field Guide
* **Dual-Knowledge Architecture:**
  1. *General Safety Intelligence:* Pre-trained on global OSHA, ISO 45001, Hazmat protocols, and First-Aid medical standards.
  2. *Company-Specific RAG:* Directly queries live internal work permits, active zone hazards, and safety manual templates stored in the database.
  2. *Instant PDF Knowledge Extraction:* Drag-and-drop enterprise PDF safety manuals directly into the dashboard. The system automatically reads and ingests the raw document into Gemini's context window for immediate safety querying.
* Available via **Web Dashboard Copilot** and **Mobile iOS Chat Interface**.

---

## 👥 Persona & Workflow Mapping

```mermaid
sequenceDiagram
    autonumber
    actor Admin as HSE Admin (Web)
    actor Lead as Contractor Lead / Inspector (iOS)
    actor Worker as Field Worker
    participant System as Platform Backend & AI
    participant Alert as Telegram / WhatsApp

    Admin->>System: 1. Create Permit (e.g., Hot Work Tank B) + Worker Manifest
    System-->>Admin: Permit Generated (Code: HW-4122)
    Lead->>System: 2. Login on iOS & Inspect Active Permits
    Worker->>Lead: 3. Reports gas smell verbally on-site
    Lead->>System: 4. Record Voice SOS on iOS
    System->>System: 5. Gemini parses audio ➔ CRITICAL Hazard
    System->>Alert: 6. Push Emergency Alert with Action Steps
    System->>System: 7. Auto-suspend Permit HW-4122
    Lead-->>Worker: 8. Execute instant evacuation protocol
```

---

## 💻 Technology Stack

| Layer | Technology | Key Libraries / Frameworks |
|-------|------------|----------------------------|
| **AI / Machine Learning** | Google Gemini 1.5 Flash | `google-genai`, Multimodal Vision & Audio API |
| **Backend API** | Python 3.11 + FastAPI | Uvicorn, SQLAlchemy ORM, Pydantic v2, PyJWT, Passlib (bcrypt) |
| **Database** | PostgreSQL 15 | Native `JSONB`, pg8000 driver |
| **Web Dashboard** | Next.js 14 (App Router) | React, TypeScript, Tailwind CSS, Lucide Icons |
| **Mobile Client** | iOS Native | Swift 5.9, SwiftUI, AVFoundation (Audio), Combine |
| **Notifications** | Telegram & WhatsApp | Telegram Bot API, Fonnte WA Gateway |
| **DevOps & Containers** | Docker & Docker Compose | Multi-stage Dockerfiles, Linux Alpine runtime |

---

## 📂 Project Directory Structure

```text
ai-safety-platform/
├── backend/                  # FastAPI Application
│   ├── app/
│   │   ├── api/              # API Endpoints (v1/auth, v1/permits, mobile, copilot)
│   │   ├── core/             # JWT Security, Password hashing, Configs
│   │   ├── db/               # SQLAlchemy Models & PostgreSQL session engine
│   │   ├── schemas.py        # Pydantic validation schemas
│   │   └── services/         # Gemini AI Service, Storage Service, Telegram Service
│   ├── requirements.txt      # Python dependencies
│   └── seed.py               # Database seeder (Default policies & demo permits)
├── docker/                   # Container Orchestration
│   ├── docker-compose.yml    # Multi-service stack (Backend, Web, PostgreSQL)
│   ├── Dockerfile.backend    # Python 3.11-slim container
│   └── Dockerfile.web        # Next.js standalone container
├── mobile-ios/               # Native iOS Client
│   └── EHSSafetyPlatform/    # Xcode SwiftUI Project
│       ├── EHSSafetyPlatformApp.swift  # Main App Lifecycle
│       └── ContentView.swift           # Auth, TabView, SOS Voice, E-Permits, AI Guide
├── web-dashboard/            # Next.js Enterprise Dashboard
│   ├── app/                  # App Router pages (Permits, Policies, AI Sandbox, Team)
│   ├── components/           # Reusable UI cards, tables, modal dialogs
│   └── public/               # Static assets
├── README.md                 # English Documentation (This file)
└── README_ID.md              # Indonesian Documentation
```

---

## ⚡ Quick Start & Deployment Guide

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24+)
* [Xcode](https://developer.apple.com/xcode/) (v15+) for iOS deployment
* Python 3.11+ (optional, for local testing without Docker)

---

### Step 1: Clone and Configure Environment

In `backend/.env`:
```env
DATABASE_URL=postgresql+pg8000://admin:admin123@postgres:5432/ehs_safety
JWT_SECRET=your_super_secret_jwt_key_hackathon_2026
GEMINI_API_KEY=your_gemini_api_key_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
WA_TARGET_PHONE=085722323411
```
*(Note: If `GEMINI_API_KEY` is left as dummy, the backend automatically switches to Simulation/Mock mode so demos never crash).*

---

### Step 2: Spin Up Full Stack via Docker

From the project root:
```bash
cd docker
docker-compose up -d --build
```

Verify services:
* **Web Dashboard:** [http://localhost:3000](http://localhost:3000)
* **Backend API Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
* **PostgreSQL:** Port `5432` (`user: admin`, `password: admin123`, `db: ehs_safety`)

---

### Step 3: Run the Native iOS App

1. Open Xcode:
   ```bash
   open mobile-ios/EHSSafetyPlatform/EHSSafetyPlatform.xcodeproj
   ```
2. Check your Mac's LAN IP address (`ipconfig getifaddr en0`). By default, it is configured for `192.168.0.14`.
3. In `ContentView.swift`, ensure the base URL matches your Mac’s local IP:
   ```swift
   guard let url = URL(string: "http://<YOUR_MAC_IP>:8000/api/v1/...")
   ```
4. Connect your physical iPhone or select an iOS Simulator.
5. Press **`Cmd + R`** (or Play button) to build and run.

#### Default Demo Credentials
* **Email:** `admin@globalmfg.com`
* **Password:** `admin123`

---

## 📡 Key API Endpoints Reference

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/api/v1/auth/login` | Authenticate user & issue JWT Bearer token | No |
| `GET`  | `/api/v1/permits` | Fetch all work permits & active manifest | No (Open for field) |
| `POST` | `/api/v1/permits` | Create new permit with worker manifest JSON | Yes (Admin/Lead) |
| `POST` | `/api/v1/mobile/voice-report` | Upload `.m4a` audio for Gemini AI analysis | No (SOS emergency) |
| `POST` | `/api/v1/mobile/field-guide` | Interactive RAG chat query for safety standards | No |
| `POST` | `/api/v1/inspections/audit` | Trigger AI Vision audit on image with active rules | Yes |
| `GET`  | `/api/v1/dashboard/metrics` | Fetch aggregated safety compliance score | Yes (Admin) |

---

## 🔮 Phase 2 Roadmap
* [ ] **Geofenced Check-In:** PIC smartphone GPS auto-activates permits only when physically present inside designated work radii.
* [ ] **On-Device Edge Vision:** Real-time on-device PPE detection using CoreML/TF-Lite for zero-connectivity zones.

---

## 🏆 Hackathon Team
Developed with passion for **AI Builder Cup 2026**. Built to save lives and transform industrial safety compliance.
