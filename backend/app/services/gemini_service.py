import io
import os
import json
import re
import time
import wave
from collections import OrderedDict
from typing import Callable, List, Literal, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.schemas import AuditResult, GeminiAuditOutput, GeminiVideoOutput, IncidentReport, VideoAuditResult, VoiceReportResult

# Ordered fallback chain. The first model that answers wins; 429/503 "high demand" errors fall through to the next one.
DEFAULT_MODELS = "gemini-3.6-flash,gemini-3.8-flash,gemini-3.5-flash,gemini-flash-latest,gemini-3.5-flash-lite,gemini-3.1-flash-lite"
VERTEX_MODELS = "gemini-3.6-flash,gemini-3.8-flash,gemini-3.5-flash,gemini-2.5-flash"
RETRY_ROUNDS = int(os.environ.get("GEMINI_RETRY_ROUNDS", "2"))
QUOTA_COOLDOWN_S = 15 * 60
# Fail fast per model (no SDK-internal retries); our own model chain is the retry strategy.
HTTP_OPTIONS = types.HttpOptions(timeout=45_000, retry_options=types.HttpRetryOptions(attempts=1))


POLICY_SELECTION_RULES = """
        POLICY SELECTION:
        - If "available_policies" is present, first identify the work activity in "detected_activity", then choose the
          single most relevant policy from that list, set "applied_policy" to its exact title and evaluate against it.
          If none fits, use the most general policy.
        - Otherwise set "applied_policy" to the title in "safety_policy".
"""


def _rate(mime_type: Optional[str]) -> int:
    match = re.search(r"rate=(\d+)", mime_type or "")
    return int(match.group(1)) if match else 24000


def _pcm_to_wav(pcm: bytes, rate: int) -> bytes:
    """Wrap raw 16-bit mono PCM (Gemini TTS output) in a WAV container browsers can play."""
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return out.getvalue()


class AIUnavailableError(RuntimeError):
    """Raised when no Gemini model could produce a verdict. Callers must NOT invent a result."""


class CompiledSopRules(BaseModel):
    """Machine-enforceable rule set distilled from a free-text SOP PDF."""
    title: str = Field(..., description="Short title for this SOP / permit template.")
    permit_type: Literal["HOT_WORK", "WORKING_AT_HEIGHT", "CONFINED_SPACE", "ELECTRICAL_LOTO", "GENERAL"]
    required_ppe: List[str] = Field(..., description="PPE items in Snake_Case, e.g. Full_Body_Harness.")
    environmental_prerequisites: List[str] = Field(..., description="Conditions that must be visibly true, Snake_Case.")
    forbidden_hazards: List[str] = Field(..., description="Hazards that trigger a violation, Snake_Case.")
    max_temperature_c: Optional[float] = Field(None, description="Heat-stress limit if the SOP states one.")
    max_humidity_pct: Optional[float] = None
    min_lux: Optional[int] = Field(None, description="Minimum illumination if the SOP states one.")
    summary: str = Field(..., description="2-3 sentence summary of the SOP.")


class GeminiAuditService:
    def __init__(self):
        use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true", "yes")
        default_chain = VERTEX_MODELS if use_vertex else DEFAULT_MODELS
        self.models = [m.strip() for m in os.environ.get("GEMINI_MODELS", default_chain).split(",") if m.strip()]
        api_key = os.environ.get("GEMINI_API_KEY", "")
        self.available = use_vertex or (bool(api_key) and "your_" not in api_key and "masukkan" not in api_key)
        if use_vertex:
            # Vertex AI on Google Cloud: auth via the Cloud Run service account (ADC), no API key needed.
            self.client = genai.Client(
                vertexai=True,
                project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
                location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"),
                http_options=HTTP_OPTIONS,
            )
        else:
            self.client = genai.Client(api_key=api_key or "missing-key", http_options=HTTP_OPTIONS)
        self._cooldown_until: dict = {}  # model -> monotonic time; set when its quota is exhausted (429)
        self.backend_name = "Vertex AI" if use_vertex else "Gemini API"
        # Models that support thinking_level=LOW (3.x Flash); used for live monitoring.
        self.fast_models = [m for m in self.models if m.startswith("gemini-3")] or self.models
        self.tts_models = [m.strip() for m in os.environ.get(
            "GEMINI_TTS_MODELS", "gemini-3.8-flash-tts,gemini-2.5-flash-tts" if use_vertex else "gemini-3.8-flash-tts,gemini-2.5-flash-preview-tts"
        ).split(",") if m.strip()]
        self._tts_cache: "OrderedDict[tuple, bytes]" = OrderedDict()

    def _generate(self, contents, config: types.GenerateContentConfig, models: Optional[List[str]] = None):
        """Try each model in the fallback chain; return (response, model_name, latency_ms)."""
        if not self.available:
            raise AIUnavailableError("Gemini is not configured (set GEMINI_API_KEY or GOOGLE_GENAI_USE_VERTEXAI).")
        last_error = None
        for round_no in range(RETRY_ROUNDS):
            if round_no:
                time.sleep(2 * round_no)  # back off before sweeping the chain again
            for model_name in models or self.models:
                if self._cooldown_until.get(model_name, 0) > time.monotonic():
                    continue
                started = time.monotonic()
                try:
                    response = self.client.models.generate_content(model=model_name, contents=contents, config=config)
                    return response, model_name, int((time.monotonic() - started) * 1000)
                except Exception as e:
                    print(f"Gemini fallback warning ({model_name}): {str(e)[:160]}")
                    if getattr(e, "code", None) == 429:
                        self._cooldown_until[model_name] = time.monotonic() + QUOTA_COOLDOWN_S
                    last_error = e
        raise AIUnavailableError(f"All Gemini models failed: {last_error}")

    # ------------------------------------------------------------------ Vision audit
    def analyze_permit_safety(self, image_bytes: bytes, mime_type: str, rules_context: dict, fast: bool = False) -> AuditResult:
        """fast=True (live monitoring) uses a low thinking level: ~2-4 s per frame instead of ~10 s."""
        system_instruction = (
            "You are an expert Environmental Health and Safety (EHS) inspector. "
            "Evaluate the workplace image strictly against the safety policy provided. "
            "Only report what is actually visible; never guess. Write all text in clear, concise English."
        )

        prompt = f"""
        Inspect this workplace photo against the following safety policy and context:

        SAFETY POLICY & CONTEXT (JSON):
        {json.dumps(rules_context, indent=2)}
{POLICY_SELECTION_RULES}
        PRIVACY: put the bounding box of EVERY visible human face in "faces_2d" (they will be blurred before storage).
        LOUDSPEAKER: if NON_COMPLIANT, write "spoken_warning" in {rules_context.get("voice_language", "English")}: one short, firm,
        respectful sentence addressed to the worker(s) saying exactly what to do now (e.g. put on the welding helmet, clip on the lanyard).

        Identify missing required PPE, unsafe acts, unsafe conditions, forbidden hazards and industrial-hygiene risks.

        VISUAL GROUNDING:
        - For EVERY observation, set "box_2d" = [ymin, xmin, ymax, xmax] normalized to 0-1000, tightly enclosing the person or object it refers to.
        - Count every visible person in "worker_count_detected".

        OCCUPATIONAL HEALTH & HYGIENE:
        - Sensor fusion: if 'sensor_data_fusion' is present, compare temperature_c / humidity_pct with the policy's max_temperature_c / max_humidity_pct (default heat-stress limit 35 C). If exceeded, add a HEALTH_HAZARD observation for heat stress.
        - Lighting: judge whether the work area is adequately lit for the task (consider min_lux if given).
        - Ergonomics: flag severe spine flexion (>30 degrees) or unsafe manual lifting.

        HOUSEKEEPING (5S) & PERIMETER:
        - Clutter, tripping hazards, spills or disorganised tools in the work zone.
        - Barricades, cones, warning signs and fire extinguishers where the work requires them.

        RISK CATEGORY (risk_category) - the most serious fatal-risk family present:
        MACHINERY (moving parts, pinch points, lockout/tagout), FALLING_OBJECTS (suspended loads, dropped objects),
        VEHICLES (forklifts, traffic, pedestrian routes), WORKING_AT_HEIGHT (ladders, scaffolds, edges),
        ELECTRICAL (live panels, cables), FIRE_HEAT_CHEMICAL (hot work, flammables, chemicals),
        CONFINED_SPACE (tanks, pits, manholes), GENERAL (routine workplace safety).

        ENFORCEMENT (enforcement_action):
        - STOP_WORK: imminent danger of serious injury or fatality (e.g. no fall protection at height, sparks near flammables).
        - ISSUE_WARNING: a violation that must be corrected but is not immediately life-threatening.
        - NO_ACTION: fully compliant.
        """

        response, model_name, latency_ms = self._generate(
            contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime_type), prompt],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=GeminiAuditOutput,
                temperature=0.1,
                thinking_config=types.ThinkingConfig(thinking_level="LOW") if fast else None,
            ),
            models=self.fast_models if fast else None,
        )
        parsed: GeminiAuditOutput = response.parsed
        if parsed is None:
            parsed = GeminiAuditOutput.model_validate_json(response.text)

        result = AuditResult.model_validate(parsed.model_dump())
        result.model_used = model_name
        result.latency_ms = latency_ms
        return result

    # ------------------------------------------------------------------ Loudspeaker voice (TTS)
    def synthesize_warning(self, text: str, language: str = "English") -> bytes:
        """Gemini TTS -> WAV bytes for an on-site loudspeaker warning. Identical warnings are served from a cache."""
        key = (text.strip(), language)
        if key in self._tts_cache:
            self._tts_cache.move_to_end(key)
            return self._tts_cache[key]
        response, _, _ = self._generate(
            contents=f"Read this safety announcement in {language}, in an urgent, firm but calm loudspeaker voice: {text}",
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore"))
                ),
            ),
            models=self.tts_models,
        )
        part = response.candidates[0].content.parts[0].inline_data
        audio = part.data if "wav" in (part.mime_type or "") else _pcm_to_wav(part.data, _rate(part.mime_type))
        self._tts_cache[key] = audio
        while len(self._tts_cache) > 64:
            self._tts_cache.popitem(last=False)
        return audio

    # ------------------------------------------------------------------ CCTV video audit
    def analyze_video(self, video_bytes: bytes, mime_type: str, rules_context: dict) -> VideoAuditResult:
        """Gemini watches the clip natively (frames + time) and returns a timestamped violation timeline."""
        prompt = f"""
        You are reviewing a workplace CCTV clip for safety compliance.

        SAFETY POLICY & CONTEXT (JSON):
        {json.dumps(rules_context, indent=2)}
{POLICY_SELECTION_RULES}
        For EVERY distinct violation, add an event with start_seconds / end_seconds measured from the start of the clip,
        a category, a severity and a one-sentence description of who does what. Merge continuous occurrences into one event.
        Only report what is visible. Then give an overall verdict, risk_category (MACHINERY, FALLING_OBJECTS, VEHICLES,
        WORKING_AT_HEIGHT, ELECTRICAL, FIRE_HEAT_CHEMICAL, CONFINED_SPACE, GENERAL) and enforcement_action
        (STOP_WORK for imminent danger, ISSUE_WARNING for other violations, NO_ACTION if compliant). Write in English.
        """
        response, model_name, latency_ms = self._generate(
            contents=[types.Part.from_bytes(data=video_bytes, mime_type=mime_type), prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_schema=GeminiVideoOutput, temperature=0.1
            ),
        )
        parsed = response.parsed or GeminiVideoOutput.model_validate_json(response.text)
        result = VideoAuditResult.model_validate(parsed.model_dump())
        result.events.sort(key=lambda e: e.start_seconds)
        result.model_used = model_name
        result.latency_ms = latency_ms
        return result

    # ------------------------------------------------------------------ Incident report
    def generate_incident_report(self, audit: dict, location: str, policy_title: str) -> IncidentReport:
        prompt = f"""
        You are a senior EHS incident investigator. Write a formal incident investigation report for this AI-detected
        safety violation, suitable for a plant manager. Use a 5-Whys root-cause analysis and the hierarchy of controls
        (prefer elimination/engineering over PPE). Be specific to the findings; do not invent injuries or names.

        LOCATION: {location}
        POLICY: {policy_title}
        AI FINDINGS (JSON):
        {json.dumps({k: audit.get(k) for k in ("summary_headline", "severity", "risk_category", "enforcement_action", "observations", "events", "recommendation", "detected_activity")}, indent=2, default=str)}
        """
        response, _, _ = self._generate(
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json", response_schema=IncidentReport, temperature=0.2),
        )
        return response.parsed or IncidentReport.model_validate_json(response.text)

    # ------------------------------------------------------------------ Agentic Co-Pilot
    def run_copilot_agent(self, user_message: str, tools: List[Callable], language: str = "id") -> dict:
        """Gemini function-calling agent: it decides which live-database tools to call before answering.

        Each tool is a plain Python function (typed + docstring); the SDK turns it into a function declaration
        and executes it automatically.
        """
        lang_instruction = {"en": "professional English", "ja": "professional Japanese (日本語)"}.get(language, "professional Indonesian")
        system_instruction = f"""You are an expert EHS (Environment, Health, and Safety) Senior Manager acting as an autonomous AI Co-Pilot.
You have TOOLS that query the company's LIVE safety database (AI inspection history by location and risk category, safety policies, uploaded SOPs).
1. GROUND TRUTH FIRST: for any question about this company's locations, violations, trends, policies or internal rules, CALL THE TOOLS — never invent locations, numbers or statistics. Cite figures exactly as the tools return them.
2. GLOBAL SAFETY INTELLIGENCE: for emergency response (chemical spills, ammonia, fire, toxic gas), first aid, OSHA, ISO 45001 or technical guidance not covered by internal SOPs, give authoritative step-by-step guidance from global best practice, and say it is general guidance.
Do NOT use LaTeX (write NH3, not $NH_3$). Be analytical, concise and structured with Markdown. Answer in {lang_instruction}."""

        response, model_name, _ = self._generate(
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=tools,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(maximum_remote_calls=8),
                temperature=0.3,
            ),
        )
        # The SDK keeps the full tool-use transcript of the successful attempt; surface it as the agent's reasoning trail.
        trace = [
            {"name": part.function_call.name, "args": dict(part.function_call.args or {})}
            for content in (response.automatic_function_calling_history or [])
            for part in (content.parts or [])
            if part.function_call
        ]
        return {"reply": response.text or "", "tool_calls": trace, "model_used": model_name}

    # ------------------------------------------------------------------ SOP compiler
    def compile_sop_pdf(self, pdf_bytes: bytes) -> CompiledSopRules:
        """Read an SOP PDF natively (layout, tables, scans) and distill it into enforceable vision rules."""
        prompt = (
            "You are an EHS policy engineer. Read this Standard Operating Procedure and convert it into a "
            "machine-enforceable rule set that a computer-vision safety inspector can check from a single photo. "
            "Only include requirements that are visually verifiable. Use Snake_Case identifiers."
        )
        response, _, _ = self._generate(
            contents=[types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"), prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_schema=CompiledSopRules, temperature=0.1
            ),
        )
        return response.parsed or CompiledSopRules.model_validate_json(response.text)

    # ------------------------------------------------------------------ Voice SOS
    def analyze_voice_incident(self, audio_bytes: bytes, mime_type: str) -> VoiceReportResult:
        system_instruction = (
            "You are an expert EHS Incident Analyst. Listen to the field worker's audio report (any language, often Indonesian). "
            "Extract the key safety information. Write the fields in the same language the worker spoke."
        )
        response, _, _ = self._generate(
            contents=[types.Part.from_bytes(data=audio_bytes, mime_type=mime_type), "Extract incident details from this audio report."],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=VoiceReportResult,
                temperature=0.1,
            ),
        )
        return response.parsed or VoiceReportResult.model_validate_json(response.text)

    # ------------------------------------------------------------------ Mobile field guide
    def chat_field_guide(self, user_message: str, active_templates: list) -> str:
        system_instruction = (
            "You are an expert EHS & K3 Safety Co-Pilot for industrial factory and construction workers. "
            "You possess dual-brain intelligence:\n"
            "1. Priority Ground Truth: First, answer based on the provided factory-specific context, uploaded standards/documents, and active safety rules.\n"
            "2. General Safety Intelligence: If the specific question or details are NOT found in the provided context, use your general knowledge of industrial K3 safety, OSHA standards, ISO 45001, first-aid (P3K), and hazardous materials handling.\n"
            "Always answer in concise, professional Indonesian with bullet points for immediate actions."
        )

        context_items = []
        for t in active_templates:
            rules = t.get("rules", {})
            if "extracted_text" in rules:
                context_items.append(f"- Dokumen/Standar '{t['title']}':\n{rules['extracted_text'][:2000]}")
            elif "required_ppe" in rules:
                context_items.append(f"- Aturan '{t['title']}' (Wajib: {', '.join(rules['required_ppe'])})")
            else:
                context_items.append(f"- Aturan '{t['title']}'")

        prompt = f"Konteks Dokumen & Standar Perusahaan Saat Ini:\n{chr(10).join(context_items)}\n\nPertanyaan Pekerja: {user_message}"
        try:
            response, _, _ = self._generate(contents=prompt, config=types.GenerateContentConfig(system_instruction=system_instruction))
            return response.text
        except AIUnavailableError as e:
            print(f"Chat Field Guide Error: {e}")
            return "Maaf, AI sedang tidak tersedia. Untuk keadaan darurat: hentikan pekerjaan, evakuasi ke titik kumpul, dan hubungi Pengawas HSE."
