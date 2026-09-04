import os
import requests

class NotificationService:
    def __init__(self):
        # Fallback ke konfigurasi sistem jika .env belum diisi
        self.fonnte_token = os.environ.get("FONNTE_TOKEN")
        self.target_phone = os.environ.get("WA_TARGET_PHONE")

    def send_whatsapp_alert(self, permit_code: str, severity: str, violations_summary: str, photo_url: str = None):
        if not self.fonnte_token or not self.target_phone:
            print("Peringatan: FONNTE_TOKEN atau WA_TARGET_PHONE kosong. Lewati notifikasi WA.")
            return False

        message = (
            f"🚨 *[URGENT] PELANGGARAN K3 KRITIKAL* 🚨\n\n"
            f"Izin Kerja: *{permit_code}*\n"
            f"Status K3: ⛔ *{severity} (IZIN KERJA DIBEKUKAN)*\n\n"
            f"*Detail Temuan AI Gemini:*\n{violations_summary}\n\n"
            f"Harap segera tindak lanjuti ke lokasi lantai pabrik."
        )
        
        payload = {
            'target': self.target_phone,
            'message': message,
            'countryCode': '62'
        }
        
        if photo_url:
            payload['url'] = photo_url

        headers = {
            'Authorization': self.fonnte_token
        }

        try:
            response = requests.post("https://api.fonnte.com/send", data=payload, headers=headers)
            print(f"WA Alert Status: {response.status_code} - {response.text}")
            return True
        except Exception as e:
            print(f"Gagal mengirim notifikasi WA via Fonnte: {e}")
            return False

    def send_telegram_alert(self, permit_code: str, severity: str, violations_summary: str, photo_url: str = None):
        bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
        chat_id = os.environ.get("TELEGRAM_CHAT_ID")
        
        if not bot_token or not chat_id or "masukkan" in bot_token:
            print("Peringatan: Kredensial Telegram kosong. Lewati notifikasi Telegram.")
            return False

        message = (
            f"🚨 *[URGENT] PELANGGARAN K3 KRITIKAL* 🚨\n\n"
            f"📝 *Izin Kerja:* `{permit_code}`\n"
            f"⛔ *Status:* {severity} (IZIN DIBEKUKAN)\n\n"
            f"*🔍 Detail Temuan AI:*\n{violations_summary}\n\n"
            f"⚠️ Harap segera buka Dashboard K3."
        )

        try:
            if photo_url and photo_url.startswith("http"):
                # Kirim foto dengan caption
                url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
                payload = {"chat_id": chat_id, "photo": photo_url, "caption": message, "parse_mode": "Markdown"}
            else:
                # Kirim pesan teks saja
                url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                payload = {"chat_id": chat_id, "text": message, "parse_mode": "Markdown"}
                
            response = requests.post(url, json=payload)
            print(f"Telegram Alert Status: {response.status_code} - {response.text}")
            return True
        except Exception as e:
            print(f"Gagal mengirim notifikasi Telegram: {e}")
            return False
