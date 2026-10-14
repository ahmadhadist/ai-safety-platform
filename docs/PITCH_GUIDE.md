# SafeSight — Pitch, Demo Script & Judge Q&A

> **Languages:** 🇬🇧 English | 🇮🇩 [Bahasa Indonesia](PITCH_GUIDE_ID.md)

## 1. Thirty-second pitch

> "Most serious workplace injuries are preceded by something a camera could have seen: a missing harness, a pedestrian
> in a forklift lane, sparks next to gas cylinders. Sites already have the cameras, but nobody is watching.
>
> **SafeSight** turns any CCTV feed or phone into a safety inspector. Gemini on Vertex AI recognises the work being done,
> applies the right company policy, boxes every hazard on the image and stops the work in seconds, while blurring faces
> and discarding footage of safe work. On our test set it caught every violation."

## 2. Three-minute demo video (shot list)

Record at 1440×900, browser zoom 100 %, logged in as admin. Do one dry run first so models are warm.

| Time | Screen | Action | Voice-over |
|---|---|---|---|
| 0:00–0:15 | Slide or dashboard | — | "395 million workers are injured every year. Most incidents start as something visible. Cameras record it; nobody watches." |
| 0:15–0:35 | **Overview** | Hover the trend bars, point at hotspot list | "This is SafeSight. Every inspection lands here: compliance rate, stop-work orders, and which areas are most dangerous: Scaffold Zone and Welding Bay." |
| 0:35–1:15 | **AI Inspection → Photo** | Keep *Auto-detect*, click sample **Hot work**, run | "I don't tell it what to look for. Gemini recognises angle grinding, picks our Hot Work policy, and finds two hazards: no PPE, and sparks flying at gas cylinders. Each one is boxed. It's critical, so a stop-work order is issued and the supervisor gets this on WhatsApp (show phone). Notice the face is blurred in the stored evidence." |
| 1:15–1:50 | **AI Inspection → CCTV video** | Sample **Forklift aisle**, run, click the timeline event | "Photos are one thing; sites have hours of CCTV. Here's a clip. Gemini watches it and returns a timeline. Click, and we jump to the second the worker on his phone walks into the forklift lane." |
| 1:50–2:15 | **Inspection History → View → Generate incident report** | Scroll to 5 Whys and actions table | "One click turns the finding into an investigation report: five whys, root cause, and corrective actions ranked by the hierarchy of controls, engineering before PPE. Print, sign, done." |
| 2:15–2:40 | **EHS Co-Pilot** | Click *Which location is our biggest risk…* | "Managers can just ask. The agent decides which database tools to call, here risk trends and recent violations, and answers with real numbers. You can see exactly what it queried." |
| 2:40–2:55 | **Safety Policies** | Click *Upload Safety Standard / PDF* (pre-picked SOP) | "New rule? Upload the SOP PDF. Gemini compiles it into an enforceable policy: PPE, prerequisites, limits." |
| 2:55–3:00 | Dashboard | — | "SafeSight: AI that sees hazards before they become incidents. Built on Gemini, Vertex AI and Cloud Run." |

**Before recording:** have WhatsApp open on a phone next to the screen, prepare a short SOP PDF, and run each sample
once so you know the timings (photo ~10–15 s, video ~10 s on Vertex AI).

## 3. Why it stands out

1. **Grounded, not just generated.** Every claim is boxed on the image or timestamped in the video.
2. **Policy-aware.** It enforces *your* rules, compiled from your own PDFs, not a fixed list of PPE classes.
3. **Video-native.** Reviews CCTV clips directly; no frame-sampling pipeline to build.
4. **Responsible by design.** Fail-safe (never invents a verdict), face blurring, auto-purge of safe footage, human sign-off.
5. **Measured.** 100 % recall on the evaluation set, with every false positive explained ([EVALUATION.md](EVALUATION.md)).
6. **Production-shaped on Google Cloud.** Cloud Run, Vertex AI, private Cloud Storage, Secret Manager, one-command deploy.

## 4. Judge Q&A

**Why not a classic object detector like YOLO?**
A detector needs labelled training data for every class and still can't read a policy. Gemini understands context
(a harness that isn't clipped on, sparks *aimed at* cylinders) and new rules are just text or a PDF. Bounding boxes
keep the output verifiable.

**What about false alarms?**
On our test set it missed nothing; the extra flags were mostly strict policy requirements (e.g. hard hat on the
factory floor). Thresholds are per policy, and every flag comes with visual evidence a supervisor can dismiss in seconds.

**What if Gemini is down or slow?**
A fallback chain across four Gemini models. If none answers, the API returns an error and records nothing; it never
guesses a violation or stops work on a hunch.

**Privacy and worker surveillance?**
Faces are blurred before storage, safe footage is never stored, and the bucket is private with no public access.
The goal is to fix conditions, and the incident report steers toward engineering controls, not blaming individuals.

**Cost at scale?**
Inspection is pay-per-call on Vertex AI and Cloud Run scales to zero, so an idle site costs almost nothing. Only
violation evidence is stored.

**Is it real-time?**
Today: photos and clips in seconds. Next: continuous RTSP stream monitoring, which uses the same inspection pipeline.

**How do you know it works?**
[docs/EVALUATION.md](EVALUATION.md): 16 human-reviewed images, production code path, 100 % recall, 87.5 % accuracy
after adjudication. We are honest that it is a small, synthetic set; real-site footage is the next step.
