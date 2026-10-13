import os
import json
import time
from typing import Callable, List, Literal, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.schemas import AuditResult, GeminiAuditOutput, VoiceReportResult

# Ordered fallback chain. The first model that answers wins; 429/503 "high demand" errors fall through to the next one.
DEFAULT_MODELS = "gemini-3.6-flash,gemini-3.8-flash,gemini-3.5-flash,gemini-flash-latest,gemini-3.5-flash-lite,gemini-3.1-flash-lite"
RETRY_ROUNDS = int(os.environ.get("GEMINI_RETRY_ROUNDS", "2"))
QUOTA_COOLDOWN_S = 15 * 60
# Fail fast per model (no SDK-internal retries); our own model chain is the retry strategy.
HTTP_OPTIONS = types.HttpOptions(timeout=45_000, retry_options=types.HttpRetryOptions(attempts=1))


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
        self.models = [m.strip() for m in os.environ.get("GEMINI_MODELS", DEFAULT_MODELS).split(",") if m.strip()]
        use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true", "yes")
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

    def _generate(self, contents, config: types.GenerateContentConfig):
        """Try each model in the fallback chain; return (response, model_name, latency_ms)."""
        if not self.available:
            raise AIUnavailableError("Gemini is not configured (set GEMINI_API_KEY or GOOGLE_GENAI_USE_VERTEXAI).")
        last_error = None
        for round_no in range(RETRY_ROUNDS):
            if round_no:
                time.sleep(2 * round_no)  # back off before sweeping the chain again
            for model_name in self.models:
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
    def analyze_permit_safety(self, image_bytes: bytes, mime_type: str, rules_context: dict) -> AuditResult:
        system_instruction = (
            "You are an expert Environmental Health and Safety (EHS) Inspector for a global manufacturing company. "
            "Your job is to strictly enforce safety compliance based on the specific permit rules provided. "
            "Evaluate the provided image against the 'dynamic_rules'. Only report what is actually visible; never guess. "
            "IMPORTANT: All notes, descriptions, recommendations, and headlines MUST be written bilingually in Indonesian and English (e.g. 'Pekerja aman. / Worker is safe.'). "
            "Additionally, whenever mentioning 5S or STOP 6 terminology, always include its authentic Japanese Kanji and reading (e.g., 整理 Seiri, 整頓 Seiton, 清掃 Seiso, トヨタ ストップ6)."
        )

        prompt = f"""
        Analyze the following inspection photo against this specific permit's dynamic rules:

        DYNAMIC PERMIT RULES (JSON):
        {json.dumps(rules_context, indent=2)}

        Identify any missing required PPE, environmental hazards, forbidden hazards, and industrial hygiene factors.

        VISUAL GROUNDING:
        - For EVERY observation, set "box_2d" = [ymin, xmin, ymax, xmax] normalized to 0-1000, tightly enclosing the worker or object the observation is about.
        - Count every visible person in "worker_count_detected" (used to reconcile against the permit's worker manifest).

        OCCUPATIONAL HEALTH & INDUSTRIAL HYGIENE (PERMENAKER 5/2018):
        - AI Sensor Fusion (IoT): If 'sensor_data_fusion' exists in the rules JSON, compare its 'temperature_c' and 'humidity_pct' against the permit's 'max_temperature_c' and 'max_humidity_pct' rules. If the actual IoT sensor temperature exceeds the maximum allowed, you MUST add a "HEALTH_HAZARD" observation for Heat Stress and set enforcement to "ISSUE_WARNING" or "SUSPEND_PERMIT".
        - Visual Lighting Assessment: Check if the work area is well-lit or dangerously dark/shadowed for high-risk work based on min_lux requirement.
        - Ergonomics & Posture: Check if any worker is bending severely (>30 degrees) at the spine or using improper manual lifting posture that risks musculoskeletal injury.

        SAFETY PERIMETER & TOYOTA 5S (HOUSEKEEPING):
        - 5S Housekeeping (Seiri/Seiton/Seiso): Check for clutter, tripping hazards, spills, or unorganized tools in the immediate work zone.
        - Safety Perimeter: Check if appropriate barricades, safety cones, warning signs, or fire extinguishers (APAR for Hot Work) are visibly present when required by the rules.

        TOYOTA STOP 6 MAPPING (stop6_category):
        - STOP_6_1_APPARATUS (moving machinery, pinch points, LOTO)
        - STOP_6_2_HEAVY_OBJECTS (overhead crane, dropped items, falling parts)
        - STOP_6_3_VEHICLES (forklifts, tow tractors, pedestrian walkways)
        - STOP_6_4_DROP_FALL (working at height, scaffolding, ladders, roof)
        - STOP_6_5_ELECTRIC_SHOCK (high-voltage electrical, live panels)
        - STOP_6_6_HEAT_HAZARDS (welding hot work, fires, chemicals, molten metal)
        - STOP_6_GENERAL (standard shopfloor safety)

        ENFORCEMENT RULES:
        - For VENDOR / CONTRACTOR high-risk work (Hot Work, Working at Height): if critical danger is detected, set enforcement_action "SUSPEND_PERMIT".
        - For INTERNAL FACTORY SHOPFLOOR / DAILY WORKERS: do not suspend the line for standard PPE omissions; use "ISSUE_WARNING" (supervisor coaching).
        - For 100% compliant conditions, use "NO_ACTION".
        """

        response, model_name, latency_ms = self._generate(
            contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime_type), prompt],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=GeminiAuditOutput,
                temperature=0.1,
            ),
        )
        parsed: GeminiAuditOutput = response.parsed
        if parsed is None:
            parsed = GeminiAuditOutput.model_validate_json(response.text)

        result = AuditResult.model_validate(parsed.model_dump())
        result.model_used = model_name
        result.latency_ms = latency_ms
        return result

    # ------------------------------------------------------------------ Agentic Co-Pilot
    def run_copilot_agent(self, user_message: str, tools: List[Callable], language: str = "id") -> dict:
        """Gemini function-calling agent: it decides which live-database tools to call before answering.

        Each tool is a plain Python function (typed + docstring); the SDK turns it into a function declaration
        and executes it automatically.
        """
        lang_instruction = {"en": "professional English", "ja": "professional Japanese (日本語)"}.get(language, "professional Indonesian")
        system_instruction = f"""You are an expert EHS (Environment, Health, and Safety) Senior Manager acting as an autonomous AI Co-Pilot.
You have TOOLS that query the company's LIVE safety database (work permits, worker manifests, AI audit history, uploaded SOPs).
1. GROUND TRUTH FIRST: for any question about this company's permits, contractors, violations, trends or internal rules, CALL THE TOOLS — never invent permit codes, numbers, names or statistics. Cite permit codes and figures exactly as the tools return them.
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
