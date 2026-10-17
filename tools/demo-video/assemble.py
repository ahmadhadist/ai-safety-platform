"""Assemble the recorded screencast frames, Gemini TTS narration and live loudspeaker audio into one MP4.

Run after record.js and cards_shot.js:  python assemble.py
Needs ffmpeg on PATH (or the static-ffmpeg package).
"""
import json
import math
import os
import shutil
import struct
import subprocess
import wave

try:
    import static_ffmpeg

    static_ffmpeg.add_paths()
except ImportError:
    pass

FF = shutil.which("ffmpeg")
D = os.path.dirname(os.path.abspath(__file__))
os.chdir(D)

t = json.load(open("timeline.json"))
fr, t0, end = t["frames"], t["t0"], t["endTs"]
marks = {m["id"]: m["t"] for m in t["marks"]}

# Intro/outro cards are replaced by clean renders (no cursor overlay).
switch = t0 + marks["intro"] + 10.9
overview = t0 + marks["overview"]
outro = t0 + marks["outro"] - 0.4


def pick(fm):
    if fm["ts"] < overview:
        return f"{D}/card_intro_a.jpg" if fm["ts"] < switch else f"{D}/card_intro_b.jpg"
    if fm["ts"] >= outro:
        return f"{D}/card_outro.jpg"
    return fm["file"]


with open("frames.txt", "w") as f:
    for i, fm in enumerate(fr):
        nxt = fr[i + 1]["ts"] if i + 1 < len(fr) else end
        f.write(f"file '{pick(fm)}'\nduration {max(0.001, nxt - fm['ts']):.4f}\n")
    f.write(f"file '{pick(fr[-1])}'\n")
lead = max(0.0, fr[0]["ts"] - t0)

# The app's WebAudio siren (square wave 880/660 Hz, 4 x 0.22 s) is not captured by the screencast; recreate it.
rate = 24000
with wave.open("siren.wav", "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    buf = bytearray()
    for i in range(int(rate * 0.88)):
        freq = 880 if (i // int(rate * 0.22)) % 2 == 0 else 660
        v = 0.22 if math.sin(2 * math.pi * freq * i / rate) >= 0 else -0.22
        buf += struct.pack("<h", int(v * 32767))
    w.writeframes(bytes(buf))

inputs = [(f"vo/{k}.wav", v, 1.0) for k, v in marks.items()]
inputs += [("siren.wav", s, 0.6) for s in t["live"]["siren"]]
inputs += [(v["file"], v["t"] + 0.2, 0.6) for v in t["live"]["voice"]]
start = max(0.0, marks["intro"] - 0.4)

cmd = [FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "frames.txt"]
for path, _, _ in inputs:
    cmd += ["-i", path]
parts, labels = [], []
for i, (path, off, vol) in enumerate(inputs, start=1):
    ms = int(max(0, off - lead) * 1000)
    parts.append(f"[{i}:a]aresample=48000,volume={vol},adelay={ms}|{ms}[a{i}]")
    labels.append(f"[a{i}]")
parts.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0:dropout_transition=0,alimiter=limit=0.95[aout]")
parts.append("[0:v]fps=30,scale=1728:1080:flags=lanczos,pad=1920:1080:96:0:color=0x14181F,format=yuv420p[vout]")
cmd += ["-filter_complex", ";".join(parts), "-map", "[vout]", "-map", "[aout]", "-ss", f"{max(0, start - lead):.2f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", "-shortest", "SafeSight_demo.mp4"]
subprocess.run(cmd, check=True)
print(subprocess.run([shutil.which("ffprobe"), "-v", "error", "-show_entries", "format=duration,size", "-of", "default=nw=1",
                      "SafeSight_demo.mp4"], capture_output=True, text=True).stdout)
