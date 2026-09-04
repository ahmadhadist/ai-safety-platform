# 📄 PROPOSAL & ESTIMASI BIAYA IMPLEMENTASI: EHS AI SAFETY PLATFORM
## Paket Pilot Project: 10 Titik Kamera CCTV Pintar + RAG Co-Pilot
**Prepared for:** Manajemen Pabrik & Divisi Environment, Health, and Safety (EHS)  
**Platform Stack:** Google Cloud Platform (GCP), Google Gemini 3.6/3.5 Flash, PostgreSQL  
**Mata Uang:** IDR (Estimasi Kurs USD 1 = Rp 16.000)

---

## 🎯 1. Executive Summary (Ringkasan Eksekutif)

Implementasi **EHS AI Safety Platform** dirancang untuk mentransformasi sistem CCTV pasif konvensional pabrik menjadi **Pengawas K3 Otonom 24/7**. Sistem ini secara proaktif:
1. Mendeteksi kelengkapan APD (Helm, Rompi, Kacamata, Harness) dan bahaya lingkungan (Percikan Las, Tabung Gas, Jalur Forklift).
2. Membedakan penegakan otonom: **Teguran K3 Karyawan Internal** (*Lini Pabrik Tetap Berjalan*) vs **Pembekuan Izin Vendor Berisiko Tinggi** (*Stop-Work Order*).
3. Melindungi privasi pekerja & memangkas biaya penyimpanan hingga 99% via **Privacy-First Auto-Purge**.
4. Menyediakan **Dual-Brain RAG AI Co-Pilot** untuk menjawab SOP darurat, standar ISO 45001, dan status kepatuhan secara instan.

---

## 🏗️ 2. Lingkup Implementasi (Scope of Work: 10 Titik Kamera)

| No | Lokasi Kamera CCTV (Contoh Area Pabrik) | Objek Deteksi Utama | Aksi Penegakan AI |
|:--:|:---|:---|:---|
| 1 | Area Hot Work / Pengelasan (Welding Booth) | Kedekatan Tabung Gas, Tabir Api, Face Shield | `SUSPEND_PERMIT` (Jika Bahaya Kritis) |
| 2 | Area Ketinggian / Scaffolding (Working at Height) | Full Body Harness, Double Lanyard, Chin Strap | `SUSPEND_PERMIT` (Jika Tanpa Harness) |
| 3 | Lini Perakitan Utama (Main Assembly Line) | Helm Safety, Rompi Visibilitas, Sepatu Safety | `ISSUE_WARNING` (Lini Tetap Jalan) |
| 4 | Area Press & Stamping Shop | Sarung Tangan Tahan Potong, Kacamata Pelindung | `ISSUE_WARNING` (Teguran Supervisor) |
| 5 | Gudang B3 / Chemical & Ammonia Storage | Masker Gas / Respirator, Rambu Bahaya, Spill Kit | `ISSUE_WARNING` + Alert Darurat |
| 6 | Jalur Logistik Forklift & Pejalan Kaki | Pelanggaran Jalur Hijau, Jarak Aman Forklift | `ISSUE_WARNING` |
| 7 | Area Bongkar Muat (Loading Dock) | Sepatu Safety, Barikade Pengaman, Rompi | `ISSUE_WARNING` |
| 8 | Ruang Boiler / Ruang Mesin Bertekanan | APAR Siaga, Sarung Tangan Tahan Panas | `ISSUE_WARNING` |
| 9 | Pintu Masuk Shopfloor / Gate Inspeksi | Verifikasi Izin Kerja Aktif (PTW) & APD Awal | Akses Kerja Masuk |
| 10| Area Fabrikasi / Pemotongan Logam | Kacamata Pelindung, Pelindung Telinga (Earplug) | `ISSUE_WARNING` |

---

## 💰 3. Rincian Biaya Operasional Cloud & AI (COGS)

Perhitungan menggunakan asumsi kerja **Shift 1 (8 Jam Kerja/Hari, 22 Hari Kerja/Bulan)** dengan interval pengambilan gambar cerdas (*Smart Event Sampling* tiap 15-20 detik saat ada pekerja).

### A. Biaya AI Vision Inference (Gemini Flash)
* **Frekuensi:** 1 frame tiap 20 detik per kamera saat ada aktivitas kerja.
* **Volume per Kamera:** 3 frame/menit × 60 menit × 8 jam = **1.440 frame/hari**.
* **Total 10 Kamera:** 14.400 frame/hari × 22 hari = **316.800 frame/bulan**.
* **Token Google AI:** 1 frame ≈ 258 token $\rightarrow$ Total: **81,7 Juta Token/bulan**.
* **Tarif Gemini Flash:** \$0,10 per 1 Juta Token.
* **Subtotal Biaya Vision AI:** **\$8,17 / bulan** $\approx$ **Rp 130.700 / bulan**

### B. Biaya RAG AI Co-Pilot & Manajemen Dokumen SOP
* **Aktivitas Chat Manajer & Supervisor:** Estimasi 100 query mendalam/hari (tanya SOP, status permit, langkah P3K darurat).
* **Volume Token RAG:** 2.200 query × 3.500 token input/output = **7,7 Juta Token/bulan**.
* **Subtotal Biaya RAG Co-Pilot:** **\$1,15 / bulan** $\approx$ **Rp 18.400 / bulan**

### C. Biaya Cloud Storage (Google Cloud Storage) - *Smart Retention Mode*
* **Foto Aman (98%):** Di-purge otomatis dari RAM (**Biaya Rp 0**).
* **Foto Pelanggaran (2%):** Disimpan permanen sebagai barang bukti audit hukum ($\approx$ 6.300 foto @300KB = 1,9 GB/bulan).
* **Tarif GCS Nearline/Archive:** \$0,02 per GB/bulan.
* **Subtotal Biaya Storage:** **\$0,04 / bulan** $\approx$ **Rp 700 / bulan**

### D. Biaya Server & Database (Cloud Run & Cloud SQL)
* **Backend API & Web Dashboard (Google Cloud Run Serverless):** Auto-scaling sesuai kebutuhan operasional pabrik.
* **Database (Cloud SQL PostgreSQL for Enterprise):** Penyimpanan aman data izin kerja, audit history, dan manifest pekerja.
* **Subtotal Server & Database:** **\$25,00 / bulan** $\approx$ **Rp 400.000 / bulan**

### E. Notifikasi WhatsApp Gateway (Alert Darurat Supervisor)
* **Paket API WhatsApp (Fonnte / Meta Cloud API):** Kuota alert pesan teks & foto insiden langsung ke HP supervisor.
* **Subtotal Notifikasi:** **\$6,25 / bulan** $\approx$ **Rp 100.000 / bulan**

---

### 📊 Rekapitulasi Biaya Riil Infrastruktur Cloud (10 Kamera)

| Komponen Layanan | Biaya per Bulan (USD) | Biaya per Bulan (IDR) |
|:---|:---:|:---:|
| 1. Gemini Vision AI Inference (10 Kamera) | \$8,17 | Rp 130.700 |
| 2. Dual-Brain RAG AI Co-Pilot & SOP Ingestion | \$1,15 | Rp 18.400 |
| 3. Google Cloud Storage (Smart Retention Evidence) | \$0,04 | Rp 700 |
| 4. Server Compute & PostgreSQL Database (Cloud Run) | \$25,00 | Rp 400.000 |
| 5. Notifikasi WhatsApp Alerting Gateway | \$6,25 | Rp 100.000 |
| **TOTAL BIAYA CLOUD INFRASTRUCTURE (COGS)** | **\$40,61** | **Rp 649.800 / bulan** |

> 💡 **Fakta Menarik:** Biaya infrastruktur AI murni hanya sekitar **Rp 65.000 per kamera per bulan**!

---

## 💼 4. Rekomendasi Skema Penawaran Harga ke Client (SaaS Pricing Model)

Untuk diajukan ke klien korporat (Pabrik / Manufaktur), Anda disarankan menawarkan dalam bentuk paket langganan solusi (*Software-as-a-Service*):

### 🏷️ Paket: "Pilot Project 10 Smart Cameras - Zero Incident"
* **Durasi Kontrak Pilot:** 3 Bulan
* **Harga Langganan (SaaS Subscription):** **Rp 4.500.000 – Rp 6.000.000 / bulan**  
  *(Sudah termasuk lisensi platform web, akses aplikasi mobile iOS, pemeliharaan AI, dan kuota cloud)*.
* **One-Time Setup & Onboarding Fee (Sekali di Awal):** **Rp 5.000.000 – Rp 10.000.000**  
  *(Jasa integrasi RTSP CCTV lokal ke gateway, konfigurasi SOP unik pabrik, pembuatan akun user, dan training mandor/supervisor)*.
* **Margin Keuntungan Anda:** **> 85% Gross Margin** (karena biaya modal cloud hanya ~Rp 650.000/bulan).

---

## 📈 5. Perbandingan ROI (Return on Investment) untuk Meyakinkan Klien

Gunakan tabel perbandingan ini saat presentasi di depan Direktur Pabrik / GM EHS:

| Parameter Evaluasi | Metode Manual Konvensional | EHS AI Safety Platform (10 Kamera) |
|:---|:---|:---|
| **Cakupan Pengawasan** | Terbatas (Safety officer hanya bisa patroli di 1 titik pada satu waktu) | **10 Titik Berbahaya diawasi serentak 24/7 tanpa jeda** |
| **Kecepatan Tindakan** | Lambat (Laporan kertas baru direkap sore/minggu depan) | **Detik itu juga (Real-Time Warning & Izin Dibekukan)** |
| **Biaya Tenaga Patroli** | Gaji 2 Safety Officer: Rp 12.000.000 – Rp 16.000.000/bulan | **Hanya Rp 4.500.000/bulan (Hemat > 60%)** |
| **Risiko Downtime Pabrik** | Kebakaran / Ledakan: Kerugian **Miliaran Rupiah** | **Zero-Accident Early Warning System** |
| **Validitas Bukti Hukum** | Sering debat kusir dengan kontraktor vendor | **Bukti Foto Digital ber-timestamp tak terbantahkan** |

---

## 🗓️ 6. Timeline Implementasi Pilot (Hanya 2 Minggu)

* **Minggu 1: Integrasi & Konfigurasi**
  * Penarikan RTSP feed 10 kamera ke gateway lokal.
  * Ingesti dokumen SOP internal pabrik & Lembar MSDS Kimia ke sistem RAG AI.
* **Minggu 2: Kalibrasi & Uji Coba Lapangan**
  * Fine-tuning aturan keselamatan spesifik zona (Toyota Assembly, Hot Work, dll).
  * Pelatihan singkat penggunaan Dashboard Manajer dan Aplikasi iOS mandor.
  * *Go-Live!*

---
*Dokumen ini disusun untuk mendukung proses negosiasi dan pengajuan proposal komersial EHS AI Safety Platform.*
