# SafeSight — Panduan Pitch, Naskah Demo & Jawaban untuk Juri

> **Bahasa:** 🇬🇧 [English](PITCH_GUIDE.md) | 🇮🇩 Bahasa Indonesia
>
> Rekam video dan presentasikan dalam **bahasa Inggris** (naskah lengkap ada di versi English). Dokumen ini
> menjelaskan alurnya dalam bahasa Indonesia untuk persiapan.

## 1. Pitch 30 detik (inti pesannya)

Kebanyakan kecelakaan kerja serius didahului sesuatu yang bisa dilihat kamera: harness tidak dikaitkan, pejalan kaki
di jalur forklift, percikan api dekat tabung gas. CCTV-nya sudah ada, tapi tidak ada yang menonton. **SafeSight**
mengubah CCTV atau ponsel menjadi inspektur K3: mengenali pekerjaan, menerapkan policy perusahaan, menandai setiap
bahaya, dan menghentikan pekerjaan dalam hitungan detik, sambil memblur wajah dan tidak menyimpan rekaman yang aman.

## 2. Urutan demo 3 menit

| Waktu | Halaman | Yang dilakukan |
|---|---|---|
| 0:00–0:15 | Slide / Overview | Buka dengan masalah: 395 juta pekerja cedera per tahun, CCTV tidak ditonton |
| 0:15–0:35 | **Overview** | Tunjukkan tren, stop-work orders, lokasi paling rawan |
| 0:35–1:15 | **AI Inspection → Photo** | Biarkan *Auto-detect*, klik contoh **Hot work**, jalankan. Tunjukkan kotak bahaya, Stop Work, notifikasi Telegram di HP, dan wajah yang diblur |
| 1:15–1:50 | **AI Inspection → CCTV video** | Contoh **Forklift aisle**, jalankan, klik event di timeline untuk loncat ke detiknya |
| 1:50–2:15 | **Inspection History → View → Generate incident report** | Tunjukkan 5-Why, akar masalah, tabel tindakan korektif |
| 2:15–2:40 | **EHS Co-Pilot** | Klik pertanyaan "biggest risk"; tunjukkan jejak tool yang dipanggil agent |
| 2:40–2:55 | **Safety Policies** | Upload PDF SOP, tunjukkan aturan yang terbentuk |
| 2:55–3:00 | Overview | Penutup: *"AI that sees hazards before they become incidents."* |

**Persiapan:** HP dengan Telegram terbuka di samping layar, satu PDF SOP pendek, dan uji coba sekali sebelum
merekam (foto ±10–15 detik, video ±10 detik di Vertex AI).

## 3. Nilai jual utama

1. **Bukti visual:** setiap temuan ada kotaknya di foto atau timestamp-nya di video.
2. **Mengikuti policy perusahaan:** aturan berasal dari PDF SOP Anda sendiri.
3. **Bisa membaca video CCTV langsung.**
4. **AI yang bertanggung jawab:** tidak mengarang putusan, blur wajah, foto aman tidak disimpan, ada tanda tangan manusia.
5. **Terukur:** recall 100 % di set uji, setiap false positive dijelaskan ([EVALUATION.md](EVALUATION.md)).
6. **Siap produksi di Google Cloud:** Cloud Run, Vertex AI, Cloud Storage privat, Secret Manager, deploy satu perintah.

## 4. Pertanyaan juri yang mungkin muncul

- **Kenapa tidak pakai YOLO?** Detektor klasik butuh data latih per kelas dan tidak bisa membaca policy. Gemini paham konteks dan aturan baru cukup berupa teks/PDF.
- **Bagaimana dengan alarm palsu?** Di set uji tidak ada pelanggaran yang terlewat; kelebihan flag kebanyakan karena policy yang ketat (misal wajib helm). Setiap flag disertai bukti visual.
- **Kalau Gemini sedang down?** Ada rantai cadangan 4 model; jika semua gagal, sistem mengembalikan error dan tidak mencatat apa pun.
- **Privasi pekerja?** Wajah diblur, rekaman aman tidak disimpan, bucket privat.
- **Biaya?** Bayar per pemanggilan di Vertex AI dan Cloud Run bisa turun ke nol saat tidak dipakai.
- **Real-time?** Saat ini foto dan klip dalam hitungan detik; berikutnya streaming RTSP terus-menerus dengan pipeline yang sama.
