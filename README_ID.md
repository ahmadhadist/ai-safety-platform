# SafeSight — AI yang melihat bahaya kerja sebelum menjadi kecelakaan

> **Bahasa:** 🇬🇧 [English](README.md) | 🇮🇩 Bahasa Indonesia

**Demo langsung:** https://ehs-web-6hw2nfb45q-uc.a.run.app · login `admin@globalmfg.com` / `admin123`

SafeSight mengubah kamera CCTV atau ponsel menjadi inspektur K3. Gemini melihat foto atau klip CCTV, mengenali jenis
pekerjaan, menerapkan policy K3 perusahaan yang sesuai, menandai setiap bahaya dengan kotak di gambar, dan melakukan
eskalasi dalam hitungan detik. Wajah diblur dan rekaman pekerjaan yang aman tidak disimpan.

## Masalah

- **Petugas K3 tidak bisa ada di semua tempat.** Satu petugas mengawasi puluhan area kerja; kebanyakan pelanggaran tidak pernah terlihat.
- **CCTV merekam, tapi tidak ada yang menonton.** Rekaman baru dibuka setelah kecelakaan terjadi.
- **Aturan tersimpan di PDF.** SOP berupa dokumen panjang, bukan sesuatu yang bisa diperiksa kamera.

## Fitur

| Kemampuan | Apa yang terjadi | Fitur Gemini |
|---|---|---|
| **Inspeksi foto dengan bukti visual** | Setiap temuan digambar sebagai kotak berlabel di foto | Spatial understanding, structured output |
| **Live Monitor + pengeras suara** | Kamera dipantau terus (respons ±4 detik), bahaya ditandai langsung, dan peringatan diucapkan dalam bahasa pekerja | Vision cepat + Gemini TTS |
| **Review video CCTV** | Upload klip, dapatkan timeline pelanggaran dengan timestamp | Native video understanding |
| **Auto-detect policy** | Gemini mengenali aktivitas dan memilih policy yang cocok | Reasoning |
| **SOP PDF → aturan** | Upload SOP, Gemini menyusun aturan APD, prasyarat, dan bahaya terlarang | Native PDF |
| **Eskalasi instan** | Stop work / peringatan, alert WhatsApp dengan foto bukti | — |
| **Laporan insiden 1 klik** | Analisis 5-Why dan tindakan korektif sesuai hierarki kontrol, bisa dicetak PDF | Structured generation |
| **EHS Co-Pilot (agent)** | Tanya "area mana paling berisiko?"; agent menelusuri database dan menunjukkan tool yang dipakai | Function calling |
| **Dashboard risiko** | Jumlah inspeksi, tingkat kepatuhan, tren 14 hari, kategori risiko fatal, lokasi rawan | — |

## AI yang bertanggung jawab

- **Tidak pernah mengarang putusan.** Jika AI tidak tersedia, sistem mengembalikan error dan tidak mencatat apa pun.
- **Privasi.** Wajah diblur sebelum bukti disimpan atau dikirim; foto pekerjaan yang aman tidak disimpan (sejalan dengan UU PDP).
- **Guardrail deterministik.** Temuan CRITICAL selalu menjadi stop work.
- **Manusia tetap memutuskan.** Laporan insiden ditandai sebagai draf AI dengan kolom tanda tangan.
- **Diukur, bukan diklaim.** Lihat [evaluasi](docs/EVALUATION.md): 100 % pelanggaran terdeteksi di set uji.

## Menjalankan

```bash
# Lokal
cp backend/.env.example backend/.env    # isi GEMINI_API_KEY atau GOOGLE_GENAI_USE_VERTEXAI=true
cd docker && docker compose up -d --build

# Google Cloud (Cloud Run + Vertex AI)
PROJECT_ID=project-anda ./deploy/deploy-cloudrun.sh
```

Arsitektur, API, dan detail teknis lengkap ada di [README.md](README.md).
