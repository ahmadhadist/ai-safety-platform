import html
import os
from typing import Optional

import requests

TIMEOUT_S = 10


class NotificationService:
    def __init__(self):
        self.fonnte_token = os.environ.get("FONNTE_TOKEN")
        self.target_phone = os.environ.get("WA_TARGET_PHONE")
        self.telegram_token = os.environ.get("TELEGRAM_BOT_TOKEN")
        self.telegram_chat_id = os.environ.get("TELEGRAM_CHAT_ID")

    @staticmethod
    def _status_line(enforcement_action: str) -> str:
        if enforcement_action in ("STOP_WORK", "SUSPEND_PERMIT"):
            return "⛔ STOP WORK ORDER"
        return "⚠️ WARNING ISSUED"

    def send_whatsapp_alert(self, permit_code: str, severity: str, enforcement_action: str, violations_summary: str, photo_url: Optional[str] = None) -> bool:
        if not self.fonnte_token or not self.target_phone or "your_" in self.fonnte_token:
            print("FONNTE_TOKEN / WA_TARGET_PHONE not set. Skipping WhatsApp alert.")
            return False

        message = (
            f"🚨 *[K3 ALERT] {severity}* 🚨\n\n"
            f"Lokasi / Location: *{permit_code}*\n"
            f"Status: *{self._status_line(enforcement_action)}*\n\n"
            f"*Temuan AI Gemini:*\n{violations_summary}\n\n"
            f"Harap segera tindak lanjuti ke lokasi."
        )
        payload = {"target": self.target_phone, "message": message, "countryCode": "62"}
        if photo_url and photo_url.startswith("https://"):
            payload["url"] = photo_url

        try:
            response = requests.post("https://api.fonnte.com/send", data=payload, headers={"Authorization": self.fonnte_token}, timeout=TIMEOUT_S)
            print(f"WA Alert Status: {response.status_code}")
            return response.ok
        except Exception as e:
            print(f"Failed to send WhatsApp alert via Fonnte: {e}")
            return False

    def send_telegram_alert(self, permit_code: str, severity: str, enforcement_action: str, violations_summary: str, image_bytes: Optional[bytes] = None) -> bool:
        if not self.telegram_token or not self.telegram_chat_id or "your_" in self.telegram_token:
            print("Telegram credentials not set. Skipping Telegram alert.")
            return False

        # HTML parse mode + escaping: AI text with '_' or '*' would break Telegram's legacy Markdown parser.
        message = (
            f"🚨 <b>[K3 ALERT] {html.escape(severity)}</b>\n\n"
            f"📍 <b>Location:</b> {html.escape(permit_code)}\n"
            f"<b>Status:</b> {self._status_line(enforcement_action)}\n\n"
            f"<b>🔍 Temuan AI / AI Findings:</b>\n{html.escape(violations_summary)}"
        )
        base = f"https://api.telegram.org/bot{self.telegram_token}"
        try:
            if image_bytes:
                # Upload the evidence bytes directly so it works even when the backend is not publicly reachable.
                response = requests.post(
                    f"{base}/sendPhoto",
                    data={"chat_id": self.telegram_chat_id, "caption": message[:1024], "parse_mode": "HTML"},
                    files={"photo": ("evidence.jpg", image_bytes)},
                    timeout=TIMEOUT_S,
                )
            else:
                response = requests.post(
                    f"{base}/sendMessage",
                    json={"chat_id": self.telegram_chat_id, "text": message, "parse_mode": "HTML"},
                    timeout=TIMEOUT_S,
                )
            print(f"Telegram Alert Status: {response.status_code}")
            return response.ok
        except Exception as e:
            print(f"Failed to send Telegram alert: {e}")
            return False

    def dispatch_violation_alerts(self, permit_code: str, severity: str, enforcement_action: str, violations_summary: str, photo_url: Optional[str], image_bytes: Optional[bytes]) -> None:
        """Fan out to every configured channel. Runs as a FastAPI background task so the inspector isn't kept waiting."""
        self.send_telegram_alert(permit_code, severity, enforcement_action, violations_summary, image_bytes)
        self.send_whatsapp_alert(permit_code, severity, enforcement_action, violations_summary, photo_url)

    def configured_channels(self) -> list:
        channels = []
        if self.telegram_token and self.telegram_chat_id and "your_" not in self.telegram_token:
            channels.append("TELEGRAM")
        if self.fonnte_token and self.target_phone and "your_" not in self.fonnte_token:
            channels.append("WHATSAPP")
        return channels
