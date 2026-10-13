# 🛡️ EHS Safety Platform — Enterprise AI Co-Pilot

[![Hackathon](https://img.shields.io/badge/Status-Hackathon%20MVP-success?style=for-the-badge&logo=rocket)](https://github.com)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Web-Next.js%2014-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![SwiftUI](https://img.shields.io/badge/Mobile-SwiftUI%20(iOS)-F05138?style=for-the-badge&logo=swift)](https://developer.apple.com/xcode/swiftui/)
[![Google Gemini](https://img.shields.io/badge/AI%20Engine-Gemini%203.6%20Flash-4285F4?style=for-the-badge&logo=google)](https://deepmind.google/technologies/gemini/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2015-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org)

> **Pilihan Bahasa:** [English](README.md) | 🇮🇩 **Bahasa Indonesia**

---

## 📌 Ringkasan Eksekutif

**EHS Safety Platform** adalah ekosistem keselamatan kerja (K3 / *Environment, Health, and Safety*) tingkat *Enterprise* bertenaga kecerdasan buatan (AI). Platform ini dirancang untuk menyelesaikan celah buta (*blind spots*) pengawasan keselamatan kerja di pabrik manufaktur dan proyek konstruksi berat melalui kombinasi:
1. **Analisis Multimodal AI (Suara & Penglihatan Komputer)** menggunakan Google Gemini 3.x Flash secara *real-time*.
2. **Digital Work Permit (E-Permit) & Pelacakan Manifest Pekerja** (Konsep apel presensi harian *Denwacho*).
3. **Sistem Eskalasi Ganda Instan** (*Dual-Alert*) melalui Bot Telegram dan WhatsApp.
4. **AI Co-Pilot & Buku Saku Lapangan Interaktif** untuk tanya jawab SOP dan pertolongan pertama secara dinamis.

---

## 🚨 Masalah Nyata: 3 Celah Fatal K3 di Industri

| # | Masalah Nyata di Lapangan | Dampak Industri | Solusi Cerdas Kami |
|---|---------------------------|-----------------|--------------------|
| **1** | **Titik Buta Pengawas (Blind Spots)** | Petugas K3 manusia tidak bisa berada di seluruh area kerja berbahaya (ruang terbatas, pengelasan) 24 jam nonstop. | **Dynamic AI Vision Sandbox** memantau rekaman kamera secara otomatis berdasarkan aturan dinamis tanpa *hardcode*. |
| **2** | **Izin Kerja Kertas & Kucing-kucingan Pekerja** | Kontraktor mengajukan izin kertas di awal, lalu mengganti pekerja tidak bersertifikat di hari-hari berikutnya tanpa melapor. | **Digital E-Permit & Worker Manifest (JSONB)** mencatat daftar pekerja harian dan divalidasi langsung via aplikasi mobile (*Denwacho*). |
| **3** | **Keterlambatan Laporan Darurat** | Saat kecelakaan terjadi, pekerja panik dan tidak punya waktu/literasi untuk mengisi formulir teks yang rumit. | **AI Voice SOS (Mobile)** — pekerja cukup berbicara bebas dalam keadaan panik, AI merangkum tiket insiden dalam 2 detik. |

---

## 💡 Arsitektur Sistem & Alur Data

```mermaid
graph TD
    subgraph Lapisan Lapangan [Operasional Lapangan]
        Worker[Pekerja / Vendor] -->|Laporan Suara / Darurat| MobileApp[Aplikasi Native iOS - SwiftUI]
        Inspector[Safety Inspector / Mandor] -->|Pantau & Audit| MobileApp
        CCTV[Kamera / CCTV Lapangan] -->|RTSP / Snapshot| WebDashboard[Web Dashboard Next.js]
    end

    subgraph Mesin Inti [Backend Dockerized]
        MobileApp -->|HTTP REST / Upload Audio| FastAPI[FastAPI Backend :8000]
        WebDashboard -->|REST / Webhooks| FastAPI
        FastAPI -->|Data Relasional & JSONB| Postgres[(PostgreSQL 15)]
    end

    subgraph Kecerdasan & Notifikasi [Layanan AI & Notifikasi]
        FastAPI -->|Audio & Vision Multimodal| Gemini[Google Gemini 3.x Flash]
        FastAPI -->|Peringatan Pelanggaran Kritis| Telegram[Telegram Bot API]
        FastAPI -->|Eskalasi Otomatis| WhatsApp[Gateway WhatsApp]
    end
```

---

## 🌟 Fitur Unggulan (Killer Features)

### 1. 🎙️ Multimodal AI Voice SOS (Aplikasi iOS Native)
* **Pelaporan Tanpa Hambatan (Zero-Friction):** Pekerja tidak perlu mengetik. Cukup tekan dan tahan tombol rekam, lalu laporkan insiden secara lisan (Contoh: *"Ada desisan gas dan bau menyengat di dekat Valve C, pekerja mulai pusing"*).
* **Pemrosesan Suara oleh Gemini 3.x Flash:**
  * `incident_title`: Judul ringkas insiden.
  * `hazard_level`: Penentuan tingkat bahaya otomatis (`NONE`, `LOW`, `MEDIUM`, `CRITICAL`).
  * `identified_location`: Deteksi lokasi dari konteks pembicaraan.
  * `immediate_action_required`: Tindakan darurat pertama yang wajib dilakukan saat itu juga.
* **Mode Simulasi Otomatis (Mock Fallback):** Jika API key kosong saat demo juri, sistem tetap merespons mulus dengan simulasi realistik tanpa *crash*.

### 2. 📄 Digital E-Permit & Worker Manifest (*Denwacho*)
* **Arsitektur Tanpa Beban bagi Vendor:** Pekerja lapangan tingkat bawah **TIDAK PERLU membuat akun atau mengunduh aplikasi**.
* Admin atau PIC Kontraktor mendaftarkan daftar pekerja timnya (`worker_manifest` disimpan dalam skema PostgreSQL `JSONB` yang fleksibel).
* Mandor atau Safety Inspector memvalidasi kehadiran pekerja di lapangan langsung dari HP mereka setiap pagi sebelum pekerjaan dimulai.
* Siklus Izin Kerja Otomatis: `PENDING` ➔ `APPROVED` ➔ `SUSPENDED` (otomatis dibekukan jika ada bahaya kritis) ➔ `RESOLVED`.

### 3. 🧠 Dynamic AI Vision Sandbox (Web Dashboard)
* **Aturan K3 Fleksibel Tanpa Koding:** Aturan tidak dikunci dengan kode if-else kaku.
* Tim K3 dapat menulis perintah deteksi baru menggunakan bahasa manusia biasa lewat Web UI (Contoh: *"Pastikan semua orang dalam radius 5 meter dari tangki las memakai pelindung wajah gelap dan apron tahan api"*).
* AI akan langsung menyesuaikan logika inspeksi terhadap foto/CCTV secara dinamis.

### 4. ⚡ Instant Dual-Channel Notification Engine
* **Integrasi Bot Telegram:** Notifikasi darurat berformat Markdown dikirim seketika lengkap dengan foto bukti pelanggaran, analisis bahaya, dan identitas vendor.
* **Integrasi WhatsApp:** Notifikasi paralel dikirim ke nomor pimpinan K3 pabrik.
* **Perintah Berhenti Kerja Otomatis (Stop-Work Order):** Jika pelanggaran berstatus `CRITICAL` terdeteksi, izin kerja (Permit) terkait langsung diubah menjadi `SUSPENDED`, menghentikan pekerjaan berisiko sebelum memakan korban.

### 5. 🤖 EHS AI Co-Pilot & Buku Saku Digital (Field Guide)
* **Kecerdasan Ganda (Dual-Knowledge):**
  1. *Pengetahuan K3 Umum:* Gemini menguasai standar OSHA, ISO 45001, tata kelola Hazmat, dan panduan medis P3K global.
  2. *RAG Spesifik Perusahaan:* AI dapat membaca langsung data izin kerja aktif dan SOP internal yang tersimpan di database.
  2. *Upload Dokumen PDF Instan:* Admin dapat mengunggah file PDF buku panduan K3 (SOP) langsung dari Dashboard Web. Sistem otomatis menyedot seluruh teks di dalamnya dan menjadikannya memori cerdas tambahan bagi AI untuk sesi tanya-jawab di lapangan.
* Dapat diakses lewat **Chatbot Web Dashboard** maupun **Fitur Chat di Aplikasi Mobile iOS**.

---

## 👥 Alur Pengguna (User Persona Workflow)

```mermaid
sequenceDiagram
    autonumber
    actor Admin as HSE Admin (Web)
    actor Lead as Mandor / Safety Inspector (iOS)
    actor Worker as Pekerja Lapangan
    participant System as Platform Backend & AI
    participant Alert as Telegram / WhatsApp

    Admin->>System: 1. Buat Izin Kerja (Hot Work Tangki B) + Daftar Pekerja (Manifest)
    System-->>Admin: Izin Terbit (Kode: HW-4122)
    Lead->>System: 2. Login di Aplikasi iOS & Cek E-Permit Aktif
    Worker->>Lead: 3. Lapor secara lisan: "Ada pipa bocor!"
    Lead->>System: 4. Rekam Laporan Voice SOS di iPhone
    System->>System: 5. Gemini AI menganalisis audio ➔ Bahaya CRITICAL
    System->>Alert: 6. Tembakkan Peringatan Darurat ke Telegram & WA
    System->>System: 7. Otomatis Bekukan Izin Kerja HW-4122 (SUSPENDED)
    Lead-->>Worker: 8. Evakuasi pekerja dari area bahaya
```

---

## 💻 Rincian Teknologi (Tech Stack)

| Lapisan | Teknologi | Pustaka / Komponen Kunci |
|---------|-----------|--------------------------|
| **AI / Machine Learning** | Google Gemini 3.x Flash | `google-genai`, Multimodal Vision & Audio API |
| **Backend API** | Python 3.11 + FastAPI | Uvicorn, SQLAlchemy ORM, Pydantic v2, PyJWT, Passlib (bcrypt) |
| **Database** | PostgreSQL 15 | Native `JSONB`, pg8000 driver |
| **Web Dashboard** | Next.js 14 (App Router) | React, TypeScript, Tailwind CSS, Lucide Icons |
| **Mobile Client** | iOS Native | Swift 5.9, SwiftUI, AVFoundation (Audio), Combine |
| **Notifikasi** | Telegram & WhatsApp | Telegram Bot API, Fonnte WA Gateway |
| **DevOps & Kontainer** | Docker & Docker Compose | Multi-stage Dockerfiles, Linux Alpine runtime |

---

## 📂 Struktur Direktori Proyek

```text
ai-safety-platform/
├── backend/                  # Aplikasi Backend FastAPI
│   ├── app/
│   │   ├── api/              # Rute API (v1/auth, v1/permits, mobile, copilot)
│   │   ├── core/             # Keamanan JWT, Hashing password, Konfigurasi
│   │   ├── db/               # Model SQLAlchemy & Koneksi PostgreSQL
│   │   ├── schemas.py        # Skema validasi Pydantic
│   │   └── services/         # Layanan Gemini AI, Storage, & Notifikasi Telegram
│   ├── requirements.txt      # Dependensi Python
│   └── seed.py               # Seeder database (Template SOP & izin demo)
├── docker/                   # Konfigurasi Kontainer
│   ├── docker-compose.yml    # Orkestrasi multi-layanan (Backend, Web, Postgres)
│   ├── Dockerfile.backend    # Kontainer Python 3.11-slim
│   └── Dockerfile.web        # Kontainer Next.js standalone
├── mobile-ios/               # Klien Mobile iOS Native
│   └── EHSSafetyPlatform/    # Proyek Xcode SwiftUI
│       ├── EHSSafetyPlatformApp.swift  # Entry point aplikasi
│       └── ContentView.swift           # Auth, Tab Bar, Voice SOS, E-Permits, AI Guide
├── web-dashboard/            # Web Dashboard Enterprise Next.js
│   ├── app/                  # Halaman App Router (Permits, Policies, AI Sandbox, Team)
│   ├── components/           # Komponen UI kartu, tabel, dan modal
│   └── public/               # Asset statis
├── README.md                 # Dokumentasi Bahasa Inggris
└── README_ID.md              # Dokumentasi Bahasa Indonesia (File ini)
```

---

## ⚙️ Panduan Menjalankan Proyek (Local Development)

### Prasyarat
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24+)
* [Xcode](https://developer.apple.com/xcode/) (v15+) untuk menjalankan aplikasi iOS
* Python 3.11+ (opsional, jika ingin menjalankan tanpa Docker)

---

### Langkah 1: Pengaturan Environment

Buka file `backend/.env` dan pastikan variabel berikut terisi:
```env
DATABASE_URL=postgresql+pg8000://admin:admin123@postgres:5432/ehs_safety
JWT_SECRET=your_super_secret_jwt_key_hackathon_2026
GEMINI_API_KEY=masukkan_api_key_gemini_anda
TELEGRAM_BOT_TOKEN=8890195285:AAGAW8sG_bljOWCH-Hia4Ds7M1FLYe3I9uw
TELEGRAM_CHAT_ID=169533971
WA_TARGET_PHONE=085722323411
```
*(Catatan: Jika `GEMINI_API_KEY` belum diisi, Backend otomatis beralih ke Mode Simulasi pintar agar alur demo tidak pernah macet).*

---

### Langkah 2: Jalankan Layanan Server via Docker

Dari direktori proyek, jalankan:
```bash
cd docker
docker-compose up -d --build
```

Akses layanan melalui peramban:
* **Web Dashboard:** [http://localhost:3000](http://localhost:3000)
* **Dokumentasi Interaktif API (Swagger UI):** [http://localhost:8000/docs](http://localhost:8000/docs)
* **PostgreSQL:** Port `5432` (`user: admin`, `password: admin123`, `db: ehs_safety`)

---

### Langkah 3: Menjalankan Aplikasi Mobile iOS

1. Buka proyek di Xcode:
   ```bash
   open mobile-ios/EHSSafetyPlatform/EHSSafetyPlatform.xcodeproj
   ```
2. Cek IP lokal MacBook Anda di terminal (`ipconfig getifaddr en0`). Secara bawaan terkonfigurasi ke `192.168.0.14`.
3. Di dalam file `ContentView.swift`, pastikan URL menunjuk ke IP MacBook Anda:
   ```swift
   guard let url = URL(string: "http://<IP_MAC_ANDA>:8000/api/v1/...")
   ```
4. Hubungkan iPhone fisik atau pilih iOS Simulator.
5. Tekan tombol **Play (▶)** atau **Command + R** di Xcode.

#### Kredensial Login Demo Default
* **Email:** `admin@globalmfg.com`
* **Password:** `admin123`

---

## 📡 Referensi Endpoint API Utama

| Metode | Endpoint | Deskripsi | Autentikasi |
|--------|----------|-----------|-------------|
| `POST` | `/api/v1/auth/login` | Login pengguna & mendapatkan JWT token | Tidak |
| `GET`  | `/api/v1/permits` | Mengambil seluruh izin kerja & manifest pekerja | Terbuka untuk lapangan |
| `POST` | `/api/v1/permits` | Membuat izin kerja baru lengkap dengan daftar pekerja | Ya (Admin/Lead) |
| `POST` | `/api/v1/mobile/voice-report` | Mengunggah audio `.m4a` untuk dianalisis Gemini AI | Terbuka (Mode Darurat) |
| `POST` | `/api/v1/mobile/field-guide` | Tanya jawab cerdas SOP K3 lewat AI Co-Pilot | Tidak |
| `POST` | `/api/v1/inspections/audit` | Menjalankan audit AI Vision pada foto terhadap aturan aktif | Ya |
| `GET`  | `/api/v1/dashboard/metrics` | Mengambil statistik skor kepatuhan K3 pabrik | Ya (Admin) |

---

## 🔮 Rencana Pengembangan Lanjutan (Roadmap Fase 2)
* [ ] **Geofenced Check-In:** GPS ponsel Mandor secara otomatis mengaktifkan izin kerja hanya jika mereka benar-benar berada di radius koordinat fisik yang diizinkan.
* [ ] **Edge Computer Vision:** Deteksi APD secara instan langsung di perangkat (on-device) menggunakan CoreML/TF-Lite untuk area kerja tambang/bawah tanah tanpa koneksi sinyal.

---

## 🏆 Tim Pengembang
Dikembangkan dengan penuh dedikasi untuk **AI Builder Cup 2026**. Dibangun untuk menyelamatkan nyawa dan mendigitalisasi kepatuhan keselamatan industri.
