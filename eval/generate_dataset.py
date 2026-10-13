"""Generate a labelled synthetic test set of workplace scenes with Gemini image generation on Vertex AI.

Each scene is described with an explicit ground-truth label. Generators do not always follow prompts exactly, so
every image is reviewed by a human afterwards and labels corrected in labels.json before running run_eval.py.

Usage:  GOOGLE_CLOUD_PROJECT=... python eval/generate_dataset.py
"""
import io
import json
import os
import sys
import time

from google import genai
from google.genai import types
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "dataset")
STYLE = "Photorealistic still from a fixed workplace CCTV camera, natural lighting. "

SCENES = [
    # (id, expected_status, expected_risk_category, scene)
    ("v01_welding_no_shield", "NON_COMPLIANT", "FIRE_HEAT_CHEMICAL", "A welder arc-welding a steel beam wearing only a t-shirt and no welding helmet or face shield, bright sparks, cardboard boxes stacked nearby."),
    ("v02_ladder_no_harness", "NON_COMPLIANT", "WORKING_AT_HEIGHT", "A worker standing on the top step of a tall A-frame ladder next to a roof edge about 4 meters high, no harness, no hard hat."),
    ("v03_live_panel_bare_hands", "NON_COMPLIANT", "ELECTRICAL", "An electrician without gloves or safety glasses working inside an open electrical cabinet full of cables, panel door open, no lockout tag."),
    ("v04_forklift_pedestrian", "NON_COMPLIANT", "VEHICLES", "A pedestrian in plain clothes, no hard hat, walking directly in front of a moving forklift inside a warehouse aisle."),
    ("v05_suspended_load", "NON_COMPLIANT", "FALLING_OBJECTS", "Construction workers without hard hats standing directly underneath a steel beam suspended from a crane."),
    ("v06_manhole_no_gas_detector", "NON_COMPLIANT", "CONFINED_SPACE", "A worker climbing down into an open sewer manhole alone, no harness, no tripod, no gas detector, no attendant."),
    ("v07_spill_clutter", "NON_COMPLIANT", "GENERAL", "A factory walkway with a large oil spill, tangled extension cords across the floor and scattered tools, a worker walking through it."),
    ("v08_bad_lifting", "NON_COMPLIANT", "GENERAL", "A warehouse worker bending forward at the waist with straight legs and a rounded back to lift a heavy box from the floor, no gloves."),
    ("c01_welding_full_ppe", "COMPLIANT", "FIRE_HEAT_CHEMICAL", "A welder wearing a welding helmet, leather gloves and flame-resistant jacket welding a pipe, a fire extinguisher and welding screen beside him, clean floor."),
    ("c02_scaffold_tied_off", "COMPLIANT", "WORKING_AT_HEIGHT", "A worker on a scaffold platform with full guardrails and toe boards, wearing a hard hat, hi-vis vest and harness with lanyard clipped to the guardrail."),
    ("c03_panel_loto", "COMPLIANT", "ELECTRICAL", "An electrician in arc-flash face shield, insulated gloves and FR clothing next to a de-energized electrical panel with a red lockout padlock and tag on the breaker."),
    ("c04_forklift_segregated", "COMPLIANT", "VEHICLES", "A warehouse with a forklift in a marked lane and a pedestrian in hi-vis vest and hard hat walking behind a yellow steel barrier in a separate walkway."),
    ("c05_site_full_ppe", "COMPLIANT", "GENERAL", "Two construction workers wearing hard hats, hi-vis vests, safety glasses, gloves and safety boots reviewing drawings on a tidy site."),
    ("c06_confined_space_proper", "COMPLIANT", "CONFINED_SPACE", "A confined-space entry at a manhole with a rescue tripod and winch, an attendant holding a gas detector, the entrant wearing a harness, respirator and hard hat."),
    ("c07_clean_factory", "COMPLIANT", "GENERAL", "A clean organised factory floor with painted walkways, tools on shadow boards, an operator in safety glasses, ear protection and safety shoes at a machine with guards in place."),
    ("c08_good_lifting", "COMPLIANT", "GENERAL", "A warehouse worker in gloves and safety boots squatting with a straight back, bending the knees to lift a small box close to the body."),
]


def main():
    client = genai.Client(vertexai=True, project=os.environ["GOOGLE_CLOUD_PROJECT"], location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"))
    os.makedirs(OUT, exist_ok=True)
    labels = []
    for scene_id, status, risk, scene in SCENES:
        path = os.path.join(OUT, f"{scene_id}.jpg")
        if not os.path.exists(path):
            for attempt in range(6):
                try:
                    response = client.models.generate_content(
                        model=os.environ.get("IMAGE_MODEL", "gemini-2.5-flash-image"),
                        contents=STYLE + scene,
                        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
                    )
                    break
                except Exception as e:  # per-minute quota on new projects is small; back off and retry
                    if "429" not in str(e) or attempt == 5:
                        raise
                    time.sleep(30 * (attempt + 1))
            parts = (response.candidates[0].content.parts or []) if response.candidates and response.candidates[0].content else []
            part = next((p for p in parts if p.inline_data), None)
            if part is None:
                reason = response.candidates[0].finish_reason if response.candidates else response.prompt_feedback
                print("skipped (generator refused):", scene_id, reason, file=sys.stderr)
                continue
            img = Image.open(io.BytesIO(part.inline_data.data)).convert("RGB")
            img.thumbnail((1280, 1280))
            img.save(path, quality=85)
            print("generated", scene_id, file=sys.stderr)
        labels.append({"id": scene_id, "file": f"{scene_id}.jpg", "expected_status": status, "expected_risk_category": risk, "scene": scene})
    with open(os.path.join(OUT, "labels.json"), "w") as f:
        json.dump(labels, f, indent=2)


if __name__ == "__main__":
    main()
