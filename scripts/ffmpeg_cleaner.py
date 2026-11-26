#!/usr/bin/env python3
"""
Cloud Python FFmpeg Wrapper & Strict Frame-by-Frame Filter Pipeline
Engineered for Anti-SynthID Disruption, Zero-SEI Bitstream Scrubbing,
Hardware OEM Stamping, Deep MP4 Binary Sanitization, and Live Progress Reporting.
"""

import sys
import os
import re
import time
import shutil
import subprocess
import json
import argparse
import tempfile
import random
import threading
from datetime import datetime, timezone

def _map_node_arch(machine: str) -> str:
    m = machine.lower()
    if m in ("x86_64", "amd64"):
        return "x64"
    if m in ("aarch64", "arm64"):
        return "arm64"
    if m in ("i386", "i686", "x86"):
        return "ia32"
    return m

def find_binary(name: str) -> str:
    """Locate executable binary across env overrides, static modules, standalone roots, and linux paths."""
    env_override = os.environ.get("FFMPEG_BIN" if name == "ffmpeg" else "FFPROBE_BIN")
    script_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    arch = _map_node_arch(os.uname().machine)
    plat = "linux" if sys.platform.startswith("linux") else sys.platform

    candidates = []
    if env_override:
        candidates.append(env_override)

    roots = [
        os.getcwd(),
        script_root,
        os.path.join(os.getcwd(), ".next", "standalone"),
        "/workspace",
        "/app/applet",
    ]
    for root in roots:
        if name == "ffmpeg":
            candidates.append(os.path.join(root, "node_modules", "ffmpeg-static", "ffmpeg"))
        else:
            candidates.append(os.path.join(root, "node_modules", "ffprobe-static", "bin", plat, arch, "ffprobe"))
            candidates.append(os.path.join(root, "node_modules", "ffprobe-static", "bin", "linux", "x64", "ffprobe"))

    candidates.extend([
        f"/usr/bin/{name}",
        f"/usr/local/bin/{name}",
        f"/bin/{name}",
    ])

    for c in candidates:
        if c and os.path.isfile(c):
            if not os.access(c, os.X_OK):
                try:
                    os.chmod(c, 0o755)
                except Exception:
                    pass
            if os.access(c, os.X_OK):
                return c

    system_path = shutil.which(name)
    if system_path:
        return system_path
    return name

FFMPEG_BIN = find_binary("ffmpeg")
FFPROBE_BIN = find_binary("ffprobe")

def _compute_target_dimensions(width: int, height: int, upscale_1080p: bool = True) -> tuple[int, int]:
    if width < 64 or height < 64:
        return 0, 0
    even_w = (width // 2) * 2
    even_h = (height // 2) * 2
    if not upscale_1080p:
        return even_w, even_h
    short_side = min(even_w, even_h)
    if short_side < 1080:
        scale_factor = 1080.0 / float(short_side)
        target_w = (int(round(even_w * scale_factor)) // 2) * 2
        target_h = (int(round(even_h * scale_factor)) // 2) * 2
        return target_w, target_h
    return even_w, even_h


def generate_organic_job_profile(
    synthid_scramble: str = "aggressive",
    humanization_preset: str = "full_human",
) -> dict:
    """Per-job randomized organic camera/ISP parameters, compact x264 entropy & SynthID weights."""
    rng = random.SystemRandom()
    rot_sign = rng.choice((-1.0, 1.0))
    speed_pts = (
        round(rng.uniform(0.968, 0.985), 4)
        if rng.random() < 0.65
        else round(rng.uniform(1.014, 1.028), 4)
    )
    pitch_choice = (
        round(rng.uniform(0.976, 0.986), 4)
        if rng.random() < 0.60
        else round(rng.uniform(1.014, 1.024), 4)
    )
    is_agg = synthid_scramble == "aggressive"
    has_grain = humanization_preset in ("grain", "full_human")
    has_handheld = humanization_preset in ("handheld", "full_human")
    has_warmth = humanization_preset in ("warmth", "full_human")

    noise_y = (
        round(rng.uniform(2.15, 2.55), 2)
        if has_grain
        else (round(rng.uniform(1.75, 2.05), 2) if is_agg else round(rng.uniform(1.45, 1.75), 2))
    )
    noise_c = round(rng.uniform(0.60, 0.85), 2) if has_grain else round(rng.uniform(0.45, 0.65), 2)
    post_noise_y = round(rng.uniform(1.45, 1.75), 2) if has_grain else round(rng.uniform(1.25, 1.50), 2)

    keyint = rng.randint(52, 88)
    min_keyint = rng.randint(14, 24)
    bframes = rng.choice((2, 3))
    refs = rng.choice((2, 3))
    aq_mode = rng.choice((2, 3))
    crf_val = str(rng.choice((21, 22)))

    return {
        "trim_start": round(rng.uniform(0.04, 0.09), 3),
        "speed_pts": speed_pts,
        "lens_cx": round(rng.uniform(0.488, 0.512), 3),
        "lens_cy": round(rng.uniform(0.488, 0.512), 3),
        "lens_k1": round(rng.uniform(-0.046, -0.032), 4),
        "lens_k2": round(rng.uniform(0.009, 0.016), 4),
        "rot_bias": round(rot_sign * rng.uniform(0.0068, 0.0108), 4),
        "rot_a1": round(rng.uniform(0.0052, 0.0072) if has_handheld else rng.uniform(0.0038, 0.0052), 4),
        "rot_a2": round(rng.uniform(0.0022, 0.0034), 4),
        "rot_a3": round(rng.uniform(0.0010, 0.0017), 4),
        "freq1": round(rng.uniform(1.03, 1.39), 2),
        "freq2": round(rng.uniform(2.43, 2.97), 2),
        "freq3": round(rng.uniform(4.11, 4.89), 2),
        "crop_ratio": round(rng.uniform(0.918, 0.928) if is_agg else rng.uniform(0.926, 0.936), 3),
        "cas_strength": round(rng.uniform(0.16, 0.22), 2),
        "noise_y": noise_y,
        "noise_c": noise_c,
        "post_noise_y": post_noise_y,
        "hue_amp1": round(rot_sign * rng.uniform(0.38, 0.62), 3),
        "hue_amp2": round(-rot_sign * rng.uniform(0.28, 0.48), 3),
        "contrast": round(rng.uniform(1.012, 1.024), 3),
        "saturation": round(rng.uniform(1.022, 1.038) if has_warmth else rng.uniform(1.010, 1.022), 3),
        "gamma": round(rng.uniform(1.004, 1.012), 3),
        "wb_r": round(rng.uniform(1.014, 1.024) if has_warmth else rng.uniform(1.006, 1.012), 3),
        "wb_g": round(rng.uniform(1.005, 1.010), 3),
        "wb_b": round(rng.uniform(0.990, 0.999) if has_warmth else rng.uniform(1.004, 1.010), 3),
        "psy_rd": f"{round(rng.uniform(0.95, 1.15), 2)},{round(rng.uniform(0.08, 0.14), 2)}",
        "aq_mode": aq_mode,
        "aq_strength": str(round(rng.uniform(1.00, 1.18), 2)),
        "deblock": f"{rng.choice((-2, -1))},{rng.choice((-2, -1))}",
        "keyint": keyint,
        "min_keyint": min_keyint,
        "bframes": bframes,
        "refs": refs,
        "crf": crf_val,
        "pitch_ratio": pitch_choice,
        "seed_l": rng.randint(100000, 999999),
        "seed_r": rng.randint(100000, 999999),
        "seed_b": rng.randint(100000, 999999),
        "seed_air": rng.randint(100000, 999999),
    }


def _build_cadence_prep(pulldown_detected: bool, effective_fps: float) -> str:
    """Strips pre-existing 24->30 pulldown duplicates before trim/setpts timing."""
    if pulldown_detected and effective_fps >= 12.0:
        return f"mpdecimate=hi=64*6:lo=64*3:frac=0.33,setpts=N/({effective_fps:.4f}*TB)"
    return ""


def _build_cadence_finish(src_fps: float, pulldown_detected: bool) -> str:
    """Applies motion-aware 30fps synthesis AFTER trim/setpts so -r 30 -fps_mode cfr has 0 drops & 0 dups."""
    if pulldown_detected or (0.0 < src_fps < 28.5):
        return "framerate=fps=30:interp_start=15:interp_end=240:scene=8.2"
    return "fps=30"


def build_safe_mode_video_filter(
    width: int = 0,
    height: int = 0,
    upscale_1080p: bool = True,
    src_fps: float = 0.0,
    pulldown_detected: bool = False,
    effective_fps: float = 0.0,
    job_profile: dict | None = None,
) -> str:
    """
    Safe Mode Temporal Re-Encoding Filtergraph V 2.3:
    Zero-pulldown 30fps cadence + 180-deg shutter blend + hqdn3d neural residual scrub + asymmetric optical warp + calibrated Bayer CMOS grain.
    """
    p = job_profile or generate_organic_job_profile()
    target_w, target_h = _compute_target_dimensions(width, height, upscale_1080p)
    scale_expr = (
        f"scale={target_w}:{target_h}:flags=bicubic+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv,"
        if target_w >= 64 and target_h >= 64
        else "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=bicubic+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv,"
    )
    prep = _build_cadence_prep(pulldown_detected, effective_fps)
    finish = _build_cadence_finish(src_fps, pulldown_detected)
    prefix = f"{prep}," if prep else ""

    return (
        f"{prefix}"
        "setpts=PTS-STARTPTS,"
        f"{finish},"
        "format=yuv420p,"
        "tmix=frames=2:weights='0.86 0.14',"
        "hqdn3d=1.0:0.8:1.5:1.1,"
        f"lenscorrection=cx={p['lens_cx']}:cy={p['lens_cy']}:k1={round(p['lens_k1']*0.85, 4)}:k2={p['lens_k2']},"
        f"rotate=a='{round(p['rot_bias']*0.85, 4)}+{p['rot_a1']*0.85:.4f}*sin(t*{p['freq1']})+{p['rot_a2']*0.85:.4f}*cos(t*{p['freq2']})+{p['rot_a3']*0.85:.4f}*sin(t*{p['freq3']})':bilinear=1:ow=iw:oh=ih,"
        f"crop=w=trunc(iw*{round(p['crop_ratio']+0.004, 3)}/2)*2:h=trunc(ih*{round(p['crop_ratio']+0.004, 3)}/2)*2:"
        f"x='(iw-ow)/2+iw*({p['rot_a1']*0.65:.4f}*sin(t*{p['freq1']})+{p['rot_a2']*0.65:.4f}*cos(t*{p['freq2']}))':"
        f"y='(ih-oh)*0.54+ih*({p['rot_a1']*0.55:.4f}*cos(t*0.89)+{p['rot_a2']*0.55:.4f}*sin(t*2.11))',"
        f"noise=c0s={p['noise_y']}:c1s={p['noise_c']}:c2s={p['noise_c']}:allf=t,"
        f"{scale_expr}"
        "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,"
        f"colorchannelmixer=rr={p['wb_r']}:rg=-0.005:rb=-0.002:gr=-0.003:gg={p['wb_g']}:gb=-0.002:br=-0.002:bg=-0.003:bb={p['wb_b']},"
        f"eq=contrast={p['contrast']}:brightness='0.0014*sin(t*0.79)+0.0009*cos(t*1.81)':saturation={p['saturation']}:gamma={p['gamma']}:eval=frame,"
        f"cas=strength={p['cas_strength']},"
        f"noise=c0s={p['post_noise_y']}:c1s=0:c2s=0:allf=t,"
        "setsar=1"
    )


def build_unified_video_filter(
    width: int = 0,
    height: int = 0,
    duration_sec: float = 0.0,
    upscale_1080p: bool = True,
    src_fps: float = 0.0,
    pulldown_detected: bool = False,
    effective_fps: float = 0.0,
    job_profile: dict | None = None,
) -> str:
    """
    Unified All-in-One Pipeline V 2.3 (Zero-Pulldown Organic Mobile Capture):
    - Strips duplicate frames + temporal cadence shift (1.5-3.0%) + 30fps synthesis
    - 180-deg shutter temporal blend (tmix) + hqdn3d diffusion residual scrub prior to optical warp
    - Randomized asymmetric tilt + barrel lens distortion + ~6% dynamic crop (0.54 vertical bias)
    - Calibrated Bayer CMOS grain + micro post-scale luma dither (clean size, passes grain forensics)
    """
    p = job_profile or generate_organic_job_profile()
    prep = _build_cadence_prep(pulldown_detected, effective_fps)
    finish = _build_cadence_finish(src_fps, pulldown_detected)
    prefix = f"{prep}," if prep else ""
    trim_step = (
        f"trim=start={p['trim_start']},setpts={p['speed_pts']}*(PTS-STARTPTS),"
        if duration_sec > 2.0
        else f"setpts={p['speed_pts']}*(PTS-STARTPTS),"
    )
    target_w, target_h = _compute_target_dimensions(width, height, upscale_1080p)
    scale_step = (
        f"scale={target_w}:{target_h}:flags=bicubic+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv,"
        if target_w >= 64 and target_h >= 64
        else "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=bicubic+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv,"
    )

    return (
        f"{prefix}"
        f"{trim_step}"
        f"{finish},"
        "format=yuv420p,"
        "tmix=frames=2:weights='0.83 0.17',"
        "hqdn3d=1.3:1.0:1.9:1.3,"
        f"lenscorrection=cx={p['lens_cx']}:cy={p['lens_cy']}:k1={p['lens_k1']}:k2={p['lens_k2']},"
        f"rotate=a='{p['rot_bias']}+{p['rot_a1']}*sin(t*{p['freq1']})+{p['rot_a2']}*cos(t*{p['freq2']})+{p['rot_a3']}*sin(t*{p['freq3']})':bilinear=1:ow=iw:oh=ih,"
        f"crop=w=trunc(iw*{p['crop_ratio']}/2)*2:h=trunc(ih*{p['crop_ratio']}/2)*2:"
        f"x='(iw-ow)/2+iw*({p['rot_a1']*0.75:.4f}*sin(t*{p['freq1']})+{p['rot_a2']*0.72:.4f}*cos(t*{p['freq2']})+{p['rot_a3']*0.72:.4f}*sin(t*{p['freq3']}))':"
        f"y='(ih-oh)*0.54+ih*({p['rot_a1']*0.62:.4f}*cos(t*0.93)+{p['rot_a2']*0.62:.4f}*sin(t*2.41)+{p['rot_a3']*0.62:.4f}*cos(t*3.97))',"
        "vignette=angle=0.14:eval=init,"
        f"noise=c0s={p['noise_y']}:c1s={p['noise_c']}:c2s={p['noise_c']}:allf=t,"
        f"{scale_step}"
        "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,"
        f"colorchannelmixer=rr={p['wb_r']}:rg=-0.006:rb=-0.002:gr=-0.003:gg={p['wb_g']}:gb=-0.002:br=-0.003:bg=-0.004:bb={p['wb_b']},"
        f"eq=contrast={p['contrast']}:brightness='0.0020*sin(t*0.85)+0.0012*cos(t*2.01)':saturation={p['saturation']}:gamma={p['gamma']}:eval=frame,"
        f"cas=strength={p['cas_strength']},"
        f"noise=c0s={p['post_noise_y']}:c1s=0:c2s=0:allf=t,"
        "setsar=1"
    )


def _build_organic_room_and_voice_chain(
    voice_prefix: str,
    out_label: str,
    p: dict,
    atempo_val: float,
    apad_filter: str,
    extrastereo_m: float = 1.55,
    speech_gain_db: float = 0.0,
) -> str:
    gain_step = f"volume={speech_gain_db:.2f}dB," if abs(speech_gain_db) >= 0.4 else ""
    return (
        f"anoisesrc=color=pink:amplitude=0.00065:sample_rate=48000:seed={p['seed_l']}[pL];"
        f"anoisesrc=color=pink:amplitude=0.00065:sample_rate=48000:seed={p['seed_r']}[pR];"
        f"anoisesrc=color=brown:amplitude=0.00035:sample_rate=48000:seed={p['seed_b']}[bRoom];"
        f"anoisesrc=color=white:amplitude=0.0062:sample_rate=48000:seed={p['seed_air']}[wAirL];"
        f"anoisesrc=color=white:amplitude=0.0062:sample_rate=48000:seed={p['seed_air'] + 731}[wAirR];"
        "[bRoom]lowpass=f=300,pan=stereo|c0=c0|c1=c0[bSt];"
        "[wAirL][wAirR]amerge=inputs=2,highpass=f=9000:poles=1,lowpass=f=21600:poles=1,"
        "equalizer=f=15000:t=q:w=0.65:g=2.5,equalizer=f=18800:t=q:w=0.75:g=7.0,adelay=0|3[airSt];"
        "[pL][pR]amerge=inputs=2,highpass=f=65,lowpass=f=19500,equalizer=f=450:t=q:w=0.8:g=-2.5[pinkSt];"
        "[pinkSt][bSt][airSt]amix=inputs=3:normalize=0,atrim=start=0.10,asetpts=PTS-STARTPTS,tremolo=f=0.27:d=0.12[room];"
        f"{voice_prefix}aresample=48000:async=1:first_pts=0,"
        "aformat=channel_layouts=stereo,"
        f"{gain_step}"
        f"asetrate=48000*{p['pitch_ratio']},aresample=48000,atempo={atempo_val},"
        "highpass=f=75,"
        "equalizer=f=210:t=q:w=1.0:g=0.9,"
        "equalizer=f=3100:t=q:w=1.4:g=-0.7,"
        "aexciter=level_in=1:level_out=1:amount=1.35:drive=2.2:blend=0.8:freq=6800:ceil=19900,"
        "asplit=2[vDry][vRef];"
        "[vRef]highpass=f=260,lowpass=f=11500,equalizer=f=2200:t=q:w=1.1:g=1.4,"
        "pan=stereo|c0=0.45*c0|c1=-0.45*c1,adelay=0|5[vSide];"
        "[vDry][vSide]amix=inputs=2:duration=first:normalize=0,"
        "aecho=0.94:0.90:8:0.055,"
        f"extrastereo=m={extrastereo_m},"
        "acompressor=threshold=-14dB:ratio=1.35:attack=12:release=150:makeup=0dB,"
        f"{apad_filter}[voice];"
        f"[voice][room]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,"
        f"alimiter=limit=0.89,atrim=start=0.02,asetpts=PTS-STARTPTS{out_label}"
    )


def build_safe_mode_audio_filter_complex(
    voice_label: str = "[0:a]",
    out_label: str = "[aout]",
    job_profile: dict | None = None,
    pad_target_dur: float = 0.0,
    speech_gain_db: float = 0.0,
) -> str:
    """
    Safe Mode Temporal-Locked Audio Filtergraph V 2.3:
    True stereo room reflection + 15.8-20.8kHz thermal mic air + phase dispersion + 0.89 anti-clipping limiter.
    """
    p = job_profile or generate_organic_job_profile()
    atempo_val = round(1.0 / p["pitch_ratio"], 5)
    apad_filter = f"apad=whole_dur={max(pad_target_dur + 0.35, 1.0):.3f}" if pad_target_dur > 0.2 else "apad=pad_dur=0.35"
    return _build_organic_room_and_voice_chain(
        f"{voice_label}asetpts=PTS-STARTPTS,", out_label, p, atempo_val, apad_filter, 1.26, speech_gain_db
    )


def build_unified_audio_filter_complex(
    voice_label: str = "[0:a]",
    out_label: str = "[aout]",
    duration_sec: float = 0.0,
    job_profile: dict | None = None,
    audio_duration_sec: float = 0.0,
    pad_target_dur: float = 0.0,
    speech_gain_db: float = 0.0,
) -> str:
    """
    Unified Anti-TTS Audio Filtergraph V 2.3:
    - Normalized speech bed + true L/R acoustic room reflection (zero pseudo-stereo mono duplicate)
    - Randomized per-job pink/brown/air-band mic thermal bed (zero 16kHz brickwall cutoff)
    - Nonlinear all-pass phase dispersion (aphaser) + dual-tap early reflections + 0.89 peak ceiling
    """
    p = job_profile or generate_organic_job_profile()
    pre_trim = max(0.0, round(p["trim_start"] - 0.02, 3))
    can_trim_audio = (
        duration_sec > 2.0
        and pre_trim > 0
        and (audio_duration_sec <= 0.0 or audio_duration_sec > pre_trim + 0.15)
    )
    atrim_prefix = f"atrim=start={pre_trim},asetpts=PTS-STARTPTS," if can_trim_audio else "asetpts=PTS-STARTPTS,"
    atempo_val = round((1.0 / p["speed_pts"]) / p["pitch_ratio"], 5)
    apad_filter = f"apad=whole_dur={max(pad_target_dur + 0.35, 1.0):.3f}" if pad_target_dur > 0.2 else "apad=pad_dur=0.35"
    return _build_organic_room_and_voice_chain(
        f"{voice_label}{atrim_prefix}", out_label, p, atempo_val, apad_filter, 1.30, speech_gain_db
    )

class ProgressTracker:
    def __init__(self, progress_file: str | None, job_id: str = ""):
        self.progress_file = progress_file
        self.job_id = job_id
        self.last_write_ts = 0.0
        self.max_percent = 4
        self._lock = threading.Lock()
        self.state = {
            "jobId": job_id,
            "stage": "probing",
            "message": "Menganalisis stream video via ffprobe...",
            "percent": 4,
            "frame": 0,
            "totalFrames": 0,
            "fps": 0.0,
            "speed": "0x",
            "outTimeSec": 0.0,
            "durationSec": 0.0,
            "engine": "Cloud Python FFmpeg Wrapper",
            "logs": [],
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }

    def load_existing_if_present(self):
        if not self.progress_file or not os.path.isfile(self.progress_file):
            return
        try:
            with self._lock:
                with open(self.progress_file, "r", encoding="utf-8") as f:
                    existing = json.load(f)
                if isinstance(existing, dict):
                    self.state.update(existing)
                    self.max_percent = max(self.max_percent, int(existing.get("percent") or 0))
        except Exception:
            pass

    def update(self, force: bool = False, **kwargs):
        with self._lock:
            if "percent" in kwargs and kwargs["percent"] is not None:
                requested_pct = int(kwargs["percent"])
                if requested_pct < self.max_percent and self.state.get("stage") != "failed":
                    kwargs["percent"] = self.max_percent
                else:
                    self.max_percent = max(self.max_percent, requested_pct)
            self.state.update(kwargs)
            self.state["updatedAt"] = datetime.now(timezone.utc).isoformat()
            if not self.progress_file:
                return
            now = time.monotonic()
            if not force and (now - self.last_write_ts) < 0.20:
                return
            self.last_write_ts = now
            tmp_path = f"{self.progress_file}.tmp.{os.getpid()}.{threading.get_ident()}"
            try:
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(self.state, f)
                os.replace(tmp_path, self.progress_file)
            except Exception:
                try:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)
                except Exception:
                    pass

    def push_log(self, msg: str, force: bool = True):
        with self._lock:
            logs = self.state.get("logs", [])
            if not logs or logs[-1] != msg:
                logs.append(msg)
                self.state["logs"] = logs[-24:]
        self.update(force=force)

def parse_time_to_sec(time_str: str) -> float:
    try:
        parts = time_str.strip().split(":")
        if len(parts) == 3:
            return float(parts[0]) * 3600.0 + float(parts[1]) * 60.0 + float(parts[2])
    except Exception:
        pass
    return 0.0

def _parse_fps(rate_str: str) -> float:
    if not rate_str:
        return 0.0
    if "/" in rate_str:
        parts = rate_str.split("/")
        if len(parts) == 2:
            try:
                num = float(parts[0])
                den = float(parts[1])
                if num > 0 and den > 0:
                    return num / den
            except Exception:
                return 0.0
    try:
        return float(rate_str)
    except Exception:
        return 0.0


def probe_stream_metrics(input_file: str) -> dict:
    info = {
        "has_audio": False,
        "audio_duration_sec": 0.0,
        "speech_gain_db": 0.0,
        "codec": "h264",
        "width": 0,
        "height": 0,
        "duration_sec": 0.0,
        "total_frames": 0,
        "src_fps": 0.0,
        "src_bitrate": 0,
        "pulldown_detected": False,
        "effective_fps": 0.0,
    }
    try:
        cmd = [
            FFPROBE_BIN,
            "-v", "error",
            "-show_format",
            "-show_streams",
            "-of", "json",
            input_file,
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=12)
        if res.returncode == 0 and res.stdout.strip():
            data = json.loads(res.stdout)
            fmt = data.get("format") or {}
            info["duration_sec"] = float(fmt.get("duration") or 0.0)
            info["src_bitrate"] = int(float(fmt.get("bit_rate") or 0))
            streams = data.get("streams") or []
            for st in streams:
                ctype = st.get("codec_type")
                if ctype == "audio":
                    info["has_audio"] = True
                    try:
                        adur = float(st.get("duration") or 0.0)
                        if adur > info["audio_duration_sec"]:
                            info["audio_duration_sec"] = adur
                    except Exception:
                        pass
                elif ctype == "video" and info["width"] == 0:
                    info["codec"] = str(st.get("codec_name") or "h264").lower()
                    w = int(st.get("width") or 0)
                    h = int(st.get("height") or 0)
                    info["width"] = (w // 2) * 2
                    info["height"] = (h // 2) * 2
                    if info["src_bitrate"] <= 0:
                        try:
                            info["src_bitrate"] = int(float(st.get("bit_rate") or 0))
                        except Exception:
                            pass
                    fps_avg = _parse_fps(str(st.get("avg_frame_rate") or ""))
                    fps_r = _parse_fps(str(st.get("r_frame_rate") or ""))
                    info["src_fps"] = round(fps_avg or fps_r, 3)
                    nb_frames = int(st.get("nb_frames") or 0)
                    if nb_frames > 0:
                        info["total_frames"] = nb_frames
                    elif info["duration_sec"] > 0:
                        info["total_frames"] = max(1, int(info["duration_sec"] * 30.0))

            if info["has_audio"]:
                try:
                    vd = subprocess.run(
                        [FFMPEG_BIN, "-hide_banner", "-t", "8", "-i", input_file, "-vn", "-af", "volumedetect", "-f", "null", "-"],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=6
                    )
                    vm = re.search(r"mean_volume:\s*([-\d.]+)\s*dB", vd.stderr)
                    if vm:
                        mean_db = float(vm.group(1))
                        if -45.0 <= mean_db <= -3.0:
                            info["speech_gain_db"] = round(max(-8.0, min(18.0, -20.5 - mean_db)), 2)
                except Exception:
                    pass

            # Fast 2s pulldown duplicate probe when src_fps >= 28 (catches already-reencoded 24->30 pulldown inputs)
            if info["src_fps"] >= 28.0 and info["duration_sec"] >= 1.5:
                try:
                    scan_dur = min(2.0, max(1.2, info["duration_sec"] * 0.75))
                    dp = subprocess.run(
                        [
                            FFMPEG_BIN, "-hide_banner", "-t", f"{scan_dur:.2f}",
                            "-i", input_file,
                            "-vf", "mpdecimate=hi=64*6:lo=64*3:frac=0.33,showinfo",
                            "-an", "-f", "null", "-"
                        ],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=8
                    )
                    kept = dp.stderr.count("pts_time:")
                    expected_in_window = info["src_fps"] * scan_dur
                    if 8 <= kept < expected_in_window * 0.90:
                        info["pulldown_detected"] = True
                        info["effective_fps"] = round(kept / scan_dur, 3)
                except Exception:
                    pass
            return info
    except Exception:
        pass

    # Fallback check
    try:
        res = subprocess.run([FFMPEG_BIN, "-i", input_file], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
        out = res.stderr + res.stdout
        info["has_audio"] = "Audio:" in out
    except Exception:
        pass
    return info

def _with_stats_period(cmd: list[str]) -> list[str]:
    if "-stats_period" in cmd:
        return cmd
    if len(cmd) >= 2 and cmd[1] == "-y":
        return [cmd[0], "-y", "-stats_period", "0.25", *cmd[2:]]
    return [cmd[0], "-stats_period", "0.25", *cmd[1:]]


def run_ffmpeg_streaming(
    cmd: list[str],
    tracker: ProgressTracker,
    stage: str,
    stage_label: str,
    start_pct: int,
    end_pct: int,
    expected_duration: float,
    expected_frames: int,
    prefix: str,
) -> tuple[int, str]:
    """Run FFmpeg via Popen, streaming stderr telemetry + anti-stall lookahead/remux heartbeat into ProgressTracker."""
    tracker.update(
        force=True,
        stage=stage,
        message=stage_label,
        percent=start_pct,
    )

    final_cmd = _with_stats_period(cmd)
    proc = subprocess.Popen(
        final_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
    )

    stderr_chunks = []
    line_buf = b""
    frame_re = re.compile(r"frame=\s*(\d+)")
    fps_re = re.compile(r"fps=\s*([\d.]+)")
    time_re = re.compile(r"time=\s*(\d+:\d+:\d+(?:\.\d+)?)")
    speed_re = re.compile(r"speed=\s*([^\s]+)")

    last_telemetry_ts = [time.monotonic()]
    stop_heartbeat = threading.Event()

    def _heartbeat_loop():
        while not stop_heartbeat.wait(0.65):
            if proc.poll() is not None:
                break
            idle_sec = time.monotonic() - last_telemetry_ts[0]
            if idle_sec < 0.75:
                continue
            cur_pct = tracker.max_percent
            if cur_pct < end_pct - 1:
                cur_stage = tracker.state.get("stage") or stage
                if cur_stage == "pass2_remux":
                    hb_msg = "Relokasi atom MOOV (+faststart) & sinkronisasi muxing MP4..."
                elif tracker.state.get("frame", 0) > 0:
                    hb_msg = f"{stage_label} — flushing B-frame buffer ({tracker.state.get('frame', 0)}/{expected_frames or '?'})..."
                else:
                    hb_msg = f"{stage_label} — inisialisasi filtergraph & encoder..."
                tracker.update(
                    force=True,
                    stage=cur_stage,
                    message=hb_msg,
                    percent=min(end_pct - 1, cur_pct + 1),
                )
                last_telemetry_ts[0] = time.monotonic()

    hb_thread = threading.Thread(target=_heartbeat_loop, daemon=True)
    hb_thread.start()

    try:
        while True:
            byte = proc.stderr.read(1) if proc.stderr else b""
            if not byte:
                break
            stderr_chunks.append(byte)
            if byte in (b"\r", b"\n"):
                line = line_buf.decode("utf-8", errors="replace").strip()
                line_buf = b""
                if not line:
                    continue

                if line.startswith("frame="):
                    last_telemetry_ts[0] = time.monotonic()
                    fm = frame_re.search(line)
                    fpm = fps_re.search(line)
                    tm = time_re.search(line)
                    sm = speed_re.search(line)

                    cur_frame = int(fm.group(1)) if fm else tracker.state["frame"]
                    cur_fps = float(fpm.group(1)) if fpm else tracker.state["fps"]
                    cur_time = parse_time_to_sec(tm.group(1)) if tm else tracker.state["outTimeSec"]
                    cur_speed = sm.group(1) if sm else tracker.state["speed"]

                    time_ratio = min(1.0, cur_time / expected_duration) if (expected_duration > 0.1 and cur_time > 0) else 0.0
                    frame_ratio = min(1.0, cur_frame / float(expected_frames)) if (expected_frames > 0 and cur_frame > 0) else 0.0
                    ratio = max(time_ratio, frame_ratio)

                    encode_cap = max(start_pct, end_pct - 2)
                    pct = min(encode_cap, max(start_pct, int(start_pct + ratio * (encode_cap - start_pct))))
                    tracker.update(
                        force=False,
                        stage=stage,
                        message=f"{stage_label} (frame {cur_frame}{'/' + str(expected_frames) if expected_frames > 0 else ''} • {cur_speed})",
                        percent=pct,
                        frame=cur_frame,
                        totalFrames=expected_frames,
                        fps=cur_fps,
                        speed=cur_speed,
                        outTimeSec=round(cur_time, 2),
                    )
                elif "Starting second pass" in line:
                    last_telemetry_ts[0] = time.monotonic()
                    tracker.update(
                        force=True,
                        stage="pass2_remux",
                        message="Remuxing atom MOOV (+faststart) & Zero-SEI Container...",
                        percent=max(tracker.max_percent, max(start_pct, end_pct - 1)),
                    )
            else:
                line_buf += byte

        if proc.stdout:
            proc.stdout.read()
        returncode = proc.wait()
    finally:
        stop_heartbeat.set()
        hb_thread.join(timeout=1.0)

    full_stderr = b"".join(stderr_chunks).decode("utf-8", errors="replace")
    if returncode == 0:
        tracker.update(force=True, percent=end_pct)
    return returncode, full_stderr

def extract_ffmpeg_telemetry(stderr_text: str, prefix: str) -> list:
    if not stderr_text:
        return []
    normalized = stderr_text.replace("\r", "\n")
    relevant = []
    frame_lines = []
    for raw_line in normalized.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("frame="):
            frame_lines.append(f"[{prefix}] {line}")
        elif (
            "Input #0" in line
            or "Output #0" in line
            or "Stream #0" in line
            or "video:" in line
            or "muxing overhead:" in line
        ):
            relevant.append(f"[{prefix}] {line}")
    selected_frames = frame_lines[-2:] if len(frame_lines) > 2 else frame_lines
    combined = relevant[:4] + selected_frames + [l for l in relevant[4:] if "video:" in l or "muxing overhead:" in l]
    return combined[-8:]

def compact_mp4_remove_free_boxes(data: bytes) -> bytes:
    """
    Physically excises 'free' and 'skip' boxes at top-level and inside 'moov' containers,
    recomputes parent box sizes, and shifts stco/co64 chunk offsets so zero metadata-strip tombstones remain.
    """
    import struct
    container_types = {b"moov", b"trak", b"mdia", b"minf", b"stbl", b"edts", b"dinf", b"udta", b"ilst"}
    removed_ranges: list[tuple[int, int]] = []

    def rebuild_range(buf: bytes, start: int, end: int, depth: int) -> bytearray:
        out = bytearray()
        pos = start
        while pos + 8 <= end:
            sz = struct.unpack(">I", buf[pos:pos + 4])[0]
            tp = buf[pos + 4:pos + 8]
            hdr = 8
            if sz == 1:
                if pos + 16 > end:
                    out.extend(buf[pos:end])
                    break
                sz = struct.unpack(">Q", buf[pos + 8:pos + 16])[0]
                hdr = 16
            elif sz == 0:
                sz = end - pos
            if sz < hdr or pos + sz > end:
                out.extend(buf[pos:end])
                break

            if tp in (b"free", b"skip"):
                removed_ranges.append((pos, sz))
                pos += sz
                continue

            if tp == b"meta":
                inner_start = pos + hdr + 4
                if inner_start <= pos + sz:
                    child_bytes = rebuild_range(buf, inner_start, pos + sz, depth + 1)
                    body = buf[pos + hdr:inner_start] + child_bytes
                    out.extend(struct.pack(">I", 8 + len(body)) + tp + body)
                else:
                    out.extend(buf[pos:pos + sz])
            elif tp in container_types and depth < 6:
                child_bytes = rebuild_range(buf, pos + hdr, pos + sz, depth + 1)
                out.extend(struct.pack(">I", 8 + len(child_bytes)) + tp + child_bytes)
            else:
                out.extend(buf[pos:pos + sz])

            pos += sz
        return out

    rebuilt = rebuild_range(data, 0, len(data), 0)
    if not removed_ranges:
        return bytes(rebuilt)

    def shift_for_offset(orig_off: int) -> int:
        return sum(r_sz for r_pos, r_sz in removed_ranges if r_pos < orig_off)

    def fix_offsets(buf: bytearray, start: int, end: int, depth: int):
        if depth > 7:
            return
        pos = start
        while pos + 8 <= end:
            sz = struct.unpack(">I", buf[pos:pos + 4])[0]
            tp = bytes(buf[pos + 4:pos + 8])
            hdr = 8
            if sz == 1:
                if pos + 16 > end:
                    break
                sz = struct.unpack(">Q", buf[pos + 8:pos + 16])[0]
                hdr = 16
            elif sz == 0:
                sz = end - pos
            if sz < hdr or pos + sz > end:
                break

            if tp == b"stco" and pos + hdr + 8 <= pos + sz:
                cnt = struct.unpack(">I", buf[pos + hdr + 4:pos + hdr + 8])[0]
                for i in range(cnt):
                    off_pos = pos + hdr + 8 + i * 4
                    if off_pos + 4 > pos + sz:
                        break
                    val = struct.unpack(">I", buf[off_pos:off_pos + 4])[0]
                    delta = shift_for_offset(val)
                    if delta > 0 and val > delta:
                        buf[off_pos:off_pos + 4] = struct.pack(">I", val - delta)
            elif tp == b"co64" and pos + hdr + 8 <= pos + sz:
                cnt = struct.unpack(">I", buf[pos + hdr + 4:pos + hdr + 8])[0]
                for i in range(cnt):
                    off_pos = pos + hdr + 8 + i * 8
                    if off_pos + 8 > pos + sz:
                        break
                    val = struct.unpack(">Q", buf[off_pos:off_pos + 8])[0]
                    delta = shift_for_offset(val)
                    if delta > 0 and val > delta:
                        buf[off_pos:off_pos + 8] = struct.pack(">Q", val - delta)
            elif tp in container_types:
                fix_offsets(buf, pos + hdr, pos + sz, depth + 1)
            pos += sz

    fix_offsets(rebuilt, 0, len(rebuilt), 0)
    return bytes(rebuilt)


def sanitize_binary_boxes_in_place(file_path: str) -> int:
    sanitized_count = 0
    bad_markers = (
        "c2pa",
        "jumb",
        "synthid",
        "watermark",
        "adobe",
        "google",
        "iso media file produced by",
        "created on:",
        "mdta",
        "lavf",
        "lavc",
        "ffmpeg",
        "libav",
        "x264",
        "shopee",
        "s264",
        "garena",
        "live-tech",
        "sora",
        "veo",
        "kling",
        "runway",
        "seedance",
        "elevenlabs",
    )
    container_boxes = ("moov", "trak", "mdia", "minf", "stbl", "edts", "dinf")
    mac_epoch_ctime = int(time.time()) + 2082844800 - random.SystemRandom().randint(900, 86400)
    mac_epoch_mtime = mac_epoch_ctime + 1
    ctime_32 = mac_epoch_ctime.to_bytes(4, byteorder="big")
    mtime_32 = mac_epoch_mtime.to_bytes(4, byteorder="big")
    ctime_64 = mac_epoch_ctime.to_bytes(8, byteorder="big")
    mtime_64 = mac_epoch_mtime.to_bytes(8, byteorder="big")
    try:
        with open(file_path, "r+b") as f:
            data = bytearray(f.read())
            length = len(data)

            def walk_and_clean(start: int, end: int, depth: int):
                nonlocal sanitized_count
                if depth > 8:
                    return
                offset = start
                while offset + 8 <= end:
                    size = int.from_bytes(data[offset:offset+4], byteorder='big')
                    box_type = data[offset+4:offset+8].decode('ascii', errors='ignore')
                    hdr = 8
                    if size == 1:
                        if offset + 16 > end:
                            break
                        size = int.from_bytes(data[offset+8:offset+16], byteorder='big')
                        hdr = 16
                    elif size == 0:
                        size = end - offset

                    if size < hdr or offset + size > end:
                        break

                    if box_type == "ftyp" and offset + size >= offset + 16:
                        data[offset+12:offset+16] = b"\x00\x00\x00\x00"
                        bpos = offset + 16
                        while bpos + 4 <= offset + size:
                            if data[bpos:bpos+4] == b"iso2":
                                data[bpos:bpos+4] = b"isom"
                            bpos += 4
                    elif box_type in ("mvhd", "tkhd", "mdhd") and offset + hdr + 12 <= offset + size:
                        ver = data[offset + hdr]
                        if ver == 0 and offset + hdr + 12 <= offset + size:
                            data[offset+hdr+4:offset+hdr+8] = ctime_32
                            data[offset+hdr+8:offset+hdr+12] = mtime_32
                        elif ver == 1 and offset + hdr + 20 <= offset + size:
                            data[offset+hdr+4:offset+hdr+12] = ctime_64
                            data[offset+hdr+12:offset+hdr+20] = mtime_64
                    elif box_type == "stsd" and offset + hdr + 8 < offset + size:
                        walk_and_clean(offset + hdr + 8, offset + size, depth + 1)
                    elif box_type in ("avc1", "avc3", "hev1", "hvc1", "mp4v") and size >= 86:
                        comp_slice = data[offset+50:offset+82]
                        if any(comp_slice):
                            data[offset+50:offset+82] = b"\x00" * 32
                            sanitized_count += 1
                        if any(data[offset+20:offset+24]):
                            data[offset+20:offset+24] = b"\x00\x00\x00\x00"
                    elif box_type in (
                        "uuid", "c2pa", "jumb", "c2ma", "c2cl", "XMP_",
                        "©too", "©enc", "tmcd", "udta", "meta", "ilst",
                        "keys", "cprt", "xml ", "bxml", "auth", "titl",
                        "dscp", "loci", "albm", "kywd",
                    ):
                        data[offset+4:offset+8] = b"free"
                        data[offset+hdr:offset+size] = os.urandom(size - hdr)
                        sanitized_count += 1
                    elif box_type in container_boxes:
                        walk_and_clean(offset + hdr, offset + size, depth + 1)

                    offset += size

            walk_and_clean(0, length, 0)
            compacted = compact_mp4_remove_free_boxes(bytes(data))
            if len(compacted) < length:
                sanitized_count += 1
            f.seek(0)
            f.write(compacted)
            f.truncate()
    except Exception as e:
        sys.stderr.write(f"Binary sanitize warning: {e}\n")
    return sanitized_count


def scramble_input_bitstream_watermarks(src_path: str, dst_path: str, codec_hint: str = "h264") -> dict:
    """
    Creates a pre-scrambled copy of src_path at dst_path where:
    1) Provenance/watermark atoms (uuid, c2pa, jumb, udta, meta, XMP_) & avc1/hev1 compressor tags are overwritten with CSPRNG entropy;
    2) H.264 SEI (NAL Type 6) & HEVC SEI (NAL Type 39/40) watermark payloads inside exact video sample ranges are randomized in-place prior to decoding.
    """
    import struct
    shutil.copyfile(src_path, dst_path)
    stats = {
        "sei_detected": 0,
        "sei_scrambled": 0,
        "atoms_scrambled": 0,
        "bytes_scrambled": 0,
        "samples_scanned": 0,
        "markers": [],
    }
    marker_hits: set[str] = set()
    markers = (
        "synthid", "c2pa", "jumb", "trainedalgorithmicmedia", "google", "deepmind",
        "veo", "sora", "kling", "runway", "pika", "luma", "hailuo", "midjourney",
        "seedance", "elevenlabs", "lavf", "lavc", "x264", "ffmpeg", "shopee", "s264",
    )
    container_types = {"moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "udta", "meta", "ilst"}

    try:
        with open(dst_path, "r+b") as f:
            data = bytearray(f.read())
            length = len(data)
            if length < 64:
                return stats

            is_hevc = "hevc" in codec_hint.lower() or "h265" in codec_hint.lower()
            moov_range: tuple[int, int] | None = None

            def scramble_containers(start: int, end: int, depth: int):
                nonlocal is_hevc, moov_range
                if depth > 8:
                    return
                pos = start
                while pos + 8 <= end:
                    sz = struct.unpack(">I", data[pos:pos + 4])[0]
                    tp = data[pos + 4:pos + 8].decode("latin-1", errors="ignore")
                    hdr = 8
                    if sz == 1 and pos + 16 <= end:
                        sz = struct.unpack(">Q", data[pos + 8:pos + 16])[0]
                        hdr = 16
                    elif sz == 0:
                        sz = end - pos
                    if sz < hdr or pos + sz > end:
                        break
                    if depth == 0 and tp == "moov":
                        moov_range = (pos + hdr, pos + sz)
                    if tp in ("hev1", "hvc1"):
                        is_hevc = True
                    if tp == "stsd" and pos + hdr + 8 < pos + sz:
                        scramble_containers(pos + hdr + 8, pos + sz, depth + 1)
                    elif tp in ("avc1", "avc3", "hev1", "hvc1", "mp4v") and sz >= 86:
                        if any(data[pos + 50:pos + 82]):
                            data[pos + 50:pos + 82] = b"\x00" * 32
                            stats["bytes_scrambled"] += 32
                        if any(data[pos + 20:pos + 24]):
                            data[pos + 20:pos + 24] = b"\x00\x00\x00\x00"
                            stats["bytes_scrambled"] += 4
                    elif tp in ("uuid", "c2pa", "jumb", "c2ma", "c2cl", "XMP_", "©too", "©enc", "tmcd"):
                        sample = data[pos + hdr:min(pos + sz, pos + 2048)].decode("ascii", errors="ignore").lower()
                        for mk in markers:
                            if mk in sample:
                                marker_hits.add(mk)
                        marker_hits.add(tp)
                        data[pos + 4:pos + 8] = b"free"
                        data[pos + hdr:pos + sz] = os.urandom(sz - hdr)
                        stats["atoms_scrambled"] += 1
                        stats["bytes_scrambled"] += sz - hdr
                    elif tp in ("udta", "meta", "ilst"):
                        sample = data[pos + hdr:min(pos + sz, pos + 2048)].decode("ascii", errors="ignore").lower()
                        hits = [mk for mk in markers if mk in sample]
                        if hits:
                            marker_hits.update(hits)
                            data[pos + 4:pos + 8] = b"free"
                            data[pos + hdr:pos + sz] = os.urandom(sz - hdr)
                            stats["atoms_scrambled"] += 1
                            stats["bytes_scrambled"] += sz - hdr
                        else:
                            nxt = pos + hdr + 4 if tp == "meta" else pos + hdr
                            if nxt < pos + sz:
                                scramble_containers(nxt, pos + sz, depth + 1)
                    elif tp in container_types:
                        nxt = pos + hdr + 4 if tp == "meta" else pos + hdr
                        if nxt < pos + sz:
                            scramble_containers(nxt, pos + sz, depth + 1)
                    pos += sz

            scramble_containers(0, length, 0)

            # Extract video sample ranges from moov
            video_ranges: list[tuple[int, int]] = []
            if moov_range is not None:
                m_start, m_end = moov_range
                m_off = m_start
                while m_off + 8 <= m_end:
                    m_sz = struct.unpack(">I", data[m_off:m_off + 4])[0]
                    m_tp = data[m_off + 4:m_off + 8].decode("latin-1", errors="ignore")
                    if m_sz < 8 or m_off + m_sz > m_end:
                        break
                    if m_tp == "trak":
                        is_vide = False
                        stco: list[int] = []
                        stsc: list[tuple[int, int]] = []
                        stsz: list[int] = []

                        def walk_trak(s: int, e: int, d: int):
                            nonlocal is_vide
                            if d > 6:
                                return
                            p = s
                            while p + 8 <= e:
                                sz = struct.unpack(">I", data[p:p + 4])[0]
                                tp = data[p + 4:p + 8].decode("latin-1", errors="ignore")
                                hdr = 8
                                if sz == 1 and p + 16 <= e:
                                    sz = struct.unpack(">Q", data[p + 8:p + 16])[0]
                                    hdr = 16
                                elif sz == 0:
                                    sz = e - p
                                if sz < hdr or p + sz > e:
                                    break
                                if tp == "hdlr" and p + hdr + 12 <= p + sz:
                                    if data[p + hdr + 8:p + hdr + 12] == b"vide":
                                        is_vide = True
                                elif tp == "stco" and p + hdr + 8 <= p + sz:
                                    cnt = struct.unpack(">I", data[p + hdr + 4:p + hdr + 8])[0]
                                    for i in range(cnt):
                                        op = p + hdr + 8 + i * 4
                                        if op + 4 > p + sz:
                                            break
                                        stco.append(struct.unpack(">I", data[op:op + 4])[0])
                                elif tp == "co64" and p + hdr + 8 <= p + sz:
                                    cnt = struct.unpack(">I", data[p + hdr + 4:p + hdr + 8])[0]
                                    for i in range(cnt):
                                        op = p + hdr + 8 + i * 8
                                        if op + 8 > p + sz:
                                            break
                                        stco.append(struct.unpack(">Q", data[op:op + 8])[0])
                                elif tp == "stsc" and p + hdr + 8 <= p + sz:
                                    cnt = struct.unpack(">I", data[p + hdr + 4:p + hdr + 8])[0]
                                    for i in range(cnt):
                                        op = p + hdr + 8 + i * 12
                                        if op + 12 > p + sz:
                                            break
                                        fc, spc = struct.unpack(">II", data[op:op + 8])
                                        stsc.append((fc, spc))
                                elif tp == "stsz" and p + hdr + 12 <= p + sz:
                                    fixed_sz, cnt = struct.unpack(">II", data[p + hdr + 4:p + hdr + 12])
                                    if fixed_sz > 0:
                                        stsz.extend([fixed_sz] * min(cnt, 200000))
                                    else:
                                        for i in range(cnt):
                                            op = p + hdr + 12 + i * 4
                                            if op + 4 > p + sz:
                                                break
                                            stsz.append(struct.unpack(">I", data[op:op + 4])[0])
                                elif tp in container_types:
                                    walk_trak(p + hdr, p + sz, d + 1)
                                p += sz

                        walk_trak(m_off + 8, m_off + m_sz, 0)
                        if is_vide and stco and stsz:
                            s_idx = 0
                            for c_idx, c_off in enumerate(stco):
                                if s_idx >= len(stsz):
                                    break
                                c_num = c_idx + 1
                                spc = 1
                                for fc, s_per_c in reversed(stsc):
                                    if c_num >= fc:
                                        spc = s_per_c
                                        break
                                cur = c_off
                                for _ in range(spc):
                                    if s_idx >= len(stsz):
                                        break
                                    sl = stsz[s_idx]
                                    s_idx += 1
                                    if 0 <= cur and cur + sl <= length:
                                        video_ranges.append((cur, cur + sl))
                                    cur += sl
                            break
                    m_off += m_sz

            stats["samples_scanned"] = len(video_ranges)
            for s_start, s_end in video_ranges:
                pos = s_start
                while pos + 6 <= s_end:
                    nal_len = struct.unpack(">I", data[pos:pos + 4])[0]
                    if nal_len < 2 or pos + 4 + nal_len > s_end:
                        break
                    nal_start = pos + 4
                    nal_end = nal_start + nal_len
                    hdr0 = data[nal_start]
                    forbidden = (hdr0 & 0x80) != 0
                    is_sei = False
                    cursor = nal_start + 1
                    if not is_hevc:
                        if not forbidden and (hdr0 & 0x1F) == 6 and ((hdr0 >> 5) & 0x03) == 0:
                            is_sei = True
                    else:
                        if not forbidden and ((hdr0 >> 1) & 0x3F) in (39, 40) and nal_start + 3 < nal_end:
                            is_sei = True
                            cursor = nal_start + 2

                    if is_sei and cursor + 2 < nal_end:
                        p_type = 0
                        while cursor < nal_end - 1 and data[cursor] == 0xFF:
                            p_type += 255
                            cursor += 1
                        if cursor < nal_end:
                            p_type += data[cursor]
                            cursor += 1
                        while cursor < nal_end - 1 and data[cursor] == 0xFF:
                            cursor += 1
                        if cursor < nal_end:
                            cursor += 1
                        stats["sei_detected"] += 1
                        p_text = data[nal_start:min(nal_end, nal_start + 512)].decode("ascii", errors="ignore").lower()
                        for mk in markers:
                            if mk in p_text:
                                marker_hits.add(mk)
                        sc_start = min(cursor, nal_end - 1)
                        sc_end = nal_end - 1 if data[nal_end - 1] == 0x80 else nal_end
                        if sc_end > sc_start and (p_type in (0, 1, 4, 5) or marker_hits):
                            rnd = os.urandom(sc_end - sc_start)
                            safe_bytes = bytes(0x04 + (b % 250) for b in rnd)
                            data[sc_start:sc_end] = safe_bytes
                            stats["sei_scrambled"] += 1
                            stats["bytes_scrambled"] += sc_end - sc_start

                    pos = nal_end

            f.seek(0)
            f.write(data)
            f.truncate()
        stats["markers"] = sorted(marker_hits)
    except Exception as e:
        sys.stderr.write(f"Pre-decode bitstream scramble warning: {e}\n")
    return stats


def verify_cleaned_output(output_path: str, expect_audio: bool = False) -> dict:
    """Quickly verify MP4 atom integrity, zero residual provenance boxes, and playable streams before completion."""
    import struct
    if not os.path.isfile(output_path) or os.path.getsize(output_path) < 16384:
        raise RuntimeError("Output MP4 gagal verifikasi ukuran minimal.")

    bad_boxes = {
        "uuid", "c2pa", "jumb", "c2ma", "c2cl", "XMP_",
        "©too", "©enc", "tmcd", "free", "skip", "udta",
        "meta", "ilst", "keys", "cprt", "xml ", "bxml",
        "auth", "titl", "dscp", "loci", "albm", "kywd",
    }
    found_bad: list[str] = []
    has_ftyp = False
    has_moov = False
    has_mdat = False

    with open(output_path, "rb") as f:
        data = f.read()

    def _scan_boxes(start: int, end: int, depth: int):
        nonlocal has_ftyp, has_moov, has_mdat
        if depth > 6:
            return
        pos = start
        while pos + 8 <= end:
            sz = struct.unpack(">I", data[pos:pos + 4])[0]
            tp = data[pos + 4:pos + 8].decode("latin-1", errors="replace")
            hdr = 8
            if sz == 1 and pos + 16 <= end:
                sz = struct.unpack(">Q", data[pos + 8:pos + 16])[0]
                hdr = 16
            elif sz == 0:
                sz = end - pos
            if sz < hdr or pos + sz > end:
                break
            if depth == 0:
                if tp == "ftyp":
                    has_ftyp = True
                elif tp == "moov":
                    has_moov = True
                elif tp == "mdat":
                    has_mdat = True
            if tp in bad_boxes and tp not in found_bad:
                found_bad.append(tp)
            if tp in ("moov", "trak", "mdia", "minf", "stbl"):
                _scan_boxes(pos + hdr, pos + sz, depth + 1)
            pos += sz

    _scan_boxes(0, len(data), 0)
    if not (has_ftyp and has_moov and has_mdat):
        raise RuntimeError("Container MP4 tidak memiliki struktur ftyp/moov/mdat yang valid.")
    if found_bad:
        raise RuntimeError(f"Masih ditemukan sisa atom container AI/tombstone: {','.join(found_bad)}")

    res = subprocess.run(
        [FFPROBE_BIN, "-v", "error", "-show_format", "-show_streams", "-of", "json", output_path],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10
    )
    if res.returncode != 0 or not res.stdout.strip():
        raise RuntimeError("Verifikasi ffprobe gagal membaca stream output.")
    pdata = json.loads(res.stdout)
    streams = pdata.get("streams") or []
    has_v = any(st.get("codec_type") == "video" and int(st.get("width") or 0) >= 64 for st in streams)
    if not has_v:
        raise RuntimeError("Stream video tidak valid setelah remuxing.")
    return {
        "has_video": has_v,
        "has_audio": any(st.get("codec_type") == "audio" for st in streams),
        "expected_audio": expect_audio,
        "size_bytes": len(data),
    }

def process_video(
    input_path: str,
    output_path: str,
    mode: str = "all_in_one",
    deep_meta_purge: bool = True,
    force_keyframes: bool = True,
    camera_profile: str = "samsung",
    upscale_1080p: bool = True,
    deep_scan: bool = True,
    humanization_preset: str = "full_human",
    synthid_scramble: str = "aggressive",
    progress_file: str | None = None,
    job_id: str = "",
) -> dict:
    if mode in ("unified", "deep_synthid"):
        mode = "all_in_one"
    tracker = ProgressTracker(progress_file, job_id)
    logs = []
    start_msg = f"[CLOUD PYTHON FFMPEG] Memulai pemrosesan video: {os.path.basename(input_path)}"
    logs.append(start_msg)
    logs.append(f"   -> Binary: {FFMPEG_BIN}")
    tracker.push_log(start_msg)

    metrics = probe_stream_metrics(input_path)
    has_audio = metrics["has_audio"]
    audio_duration_sec = metrics["audio_duration_sec"]
    speech_gain_db = float(metrics.get("speech_gain_db") or 0.0)
    codec_name = metrics["codec"]
    vid_w, vid_h = metrics["width"], metrics["height"]
    duration_sec = metrics["duration_sec"]
    src_fps = metrics["src_fps"]
    src_bitrate = int(metrics.get("src_bitrate") or 0)
    pulldown_detected = metrics["pulldown_detected"]
    effective_fps = metrics["effective_fps"]
    job_profile = generate_organic_job_profile(
        synthid_scramble=synthid_scramble,
        humanization_preset=humanization_preset,
    )
    use_upscale = upscale_1080p and camera_profile != "neutral"
    target_w, target_h = _compute_target_dimensions(vid_w, vid_h, use_upscale)

    if use_upscale:
        target_max_bps = max(2_800_000, min(4_500_000, int((src_bitrate or 3_800_000) * 0.90)))
    else:
        target_max_bps = max(2_000_000, min(3_800_000, int((src_bitrate or 3_400_000) * 0.85)))
    maxrate_k = f"{max(2000, target_max_bps // 1000)}k"
    bufsize_k = f"{max(4000, (target_max_bps * 2) // 1000)}k"

    if mode == "all_in_one" and duration_sec > 0:
        eff_dur = max(0.2, duration_sec - (job_profile["trim_start"] if duration_sec > 2.0 else 0.0))
        expected_out_dur = max(0.2, eff_dur * job_profile["speed_pts"])
        expected_frames = max(1, int(expected_out_dur * 30.0))
    elif mode == "safe_mode" and duration_sec > 0:
        expected_out_dur = max(0.2, duration_sec)
        expected_frames = max(1, int(expected_out_dur * 30.0))
    else:
        expected_out_dur = max(0.0, duration_sec)
        expected_frames = metrics["total_frames"]

    video_filter_str = ""
    if mode == "all_in_one":
        video_filter_str = build_unified_video_filter(
            vid_w, vid_h, duration_sec, use_upscale, src_fps, pulldown_detected, effective_fps, job_profile
        )
    elif mode == "safe_mode":
        video_filter_str = build_safe_mode_video_filter(
            vid_w, vid_h, use_upscale, src_fps, pulldown_detected, effective_fps, job_profile
        )

    # Calibrated color warmth & hue subcarrier drift apply to visual re-encode modes
    if video_filter_str:
        if humanization_preset in ("warmth", "full_human"):
            video_filter_str += ",colorbalance=rs=0.02:gs=0.008:bs=-0.02"

        if synthid_scramble == "aggressive":
            video_filter_str += f",hue=h='{job_profile['hue_amp1']}*sin(t*1.17)+{job_profile['hue_amp2']}*cos(t*2.63)'"

    res_label = f"{vid_w}x{vid_h} -> {target_w}x{target_h}" if (target_w and (target_w != vid_w or target_h != vid_h)) else (f"{vid_w}x{vid_h}" if vid_w else "Auto")
    fps_mode_label = (
        f"Pulldown Repair ({effective_fps}fps->30fps)"
        if pulldown_detected
        else f"Zero-Dup Motion Interp ({src_fps}fps->30fps)"
        if (0 < src_fps < 28.5)
        else f"Native {src_fps or 30}fps"
    )
    probe_msg = (
        f"   -> Stream Probe: Codec={codec_name.upper() or 'H264'} | "
        f"Res={res_label} | {fps_mode_label} | "
        f"Durasi={duration_sec:.2f}s | "
        f"Audio={'Ada Audio Stream' if has_audio else 'Hanya Video (Tanpa Audio)'}"
    )
    logs.append(probe_msg)
    tracker.update(
        force=True,
        stage="probing",
        durationSec=round(duration_sec, 2),
        totalFrames=expected_frames,
        percent=8,
    )
    tracker.push_log(probe_msg)

    if deep_scan:
        ds_msg = f"[DEEP SCAN AI BITSTREAM] Byte-level scan aktif (Preset: {humanization_preset.upper()}, Scramble: {synthid_scramble.upper()})."
        logs.append(ds_msg)
        tracker.push_log(ds_msg)

    if camera_profile == "apple":
        camera_brand = "mp42"
        v_handler = "Core Media Video"
        a_handler = "Core Media Audio"
    elif camera_profile == "xiaomi":
        camera_brand = "mp42"
        v_handler = "VideoHandler"
        a_handler = "SoundHandler"
    elif camera_profile == "neutral":
        camera_brand = "isom"
        v_handler = "VideoHandler"
        a_handler = "SoundHandler"
    else:
        camera_brand = "mp42"
        v_handler = "VideoHandle"
        a_handler = "SoundHandle"

    cam_meta: list[str] = []
    encode_preset = "fast" if duration_sec <= 12.0 else "faster"
    b_adapt_mode = "1"
    movflags_str = "+faststart"

    with tempfile.TemporaryDirectory() as temp_dir:
        effective_input_path = input_path
        scramble_stats_payload = None
        if synthid_scramble != "off":
            scrambled_in_path = os.path.join(temp_dir, "pre_scrambled_input.mp4")
            sc_stats = scramble_input_bitstream_watermarks(input_path, scrambled_in_path, codec_name)
            if os.path.isfile(scrambled_in_path) and os.path.getsize(scrambled_in_path) > 16384:
                effective_input_path = scrambled_in_path
            scramble_stats_payload = {
                "seiUnitsDetected": int(sc_stats.get("sei_detected") or 0),
                "seiPayloadsScrambled": int(sc_stats.get("sei_scrambled") or 0),
                "watermarkAtomsScrambled": int(sc_stats.get("atoms_scrambled") or 0),
                "totalBytesScrambled": int(sc_stats.get("bytes_scrambled") or 0),
                "targetedMarkers": list(sc_stats.get("markers") or []),
            }
            tracker.update(force=True, scrambleStats=scramble_stats_payload)
            sc_msg = (
                f"✓ [SYNTHID BITSTREAM SCRAMBLER] Mode={synthid_scramble.upper()} • "
                f"{sc_stats['sei_scrambled']}/{sc_stats['sei_detected']} SEI Watermark NAL + "
                f"{sc_stats['atoms_scrambled']} Atom Provenance ({sc_stats['bytes_scrambled']} bytes) diacak (CSPRNG)"
                + (f" [{', '.join(sc_stats['markers'][:4])}]" if sc_stats['markers'] else "")
            )
            logs.append(sc_msg)
            tracker.push_log(sc_msg)

        pass1_path = os.path.join(temp_dir, "pass1_reencoded.mp4")
        source_for_pass2 = effective_input_path

        effective_force_keyframes = force_keyframes and (mode == "remux_only")

        keyframe_flags = [
            "-g", str(job_profile["keyint"]),
            "-keyint_min", str(job_profile["min_keyint"]),
            "-sc_threshold", "40",
            "-refs", str(job_profile["refs"]),
            "-color_primaries", "bt709",
            "-color_trc", "bt709",
            "-colorspace", "bt709",
            "-color_range", "tv",
        ]

        x264_params = (
            f"ref={job_profile['refs']}:bframes={job_profile['bframes']}:b-adapt={b_adapt_mode}:b-pyramid=normal:weightp=1:"
            f"psy-rd={job_profile['psy_rd']}:aq-mode={job_profile['aq_mode']}:aq-strength={job_profile['aq_strength']}:"
            f"deblock={job_profile['deblock']}:nal-hrd=none:force-cfr=1:"
            f"open-gop=0:scenecut=40:keyint={job_profile['keyint']}:min-keyint={job_profile['min_keyint']}"
        )

        # TWO-STAGE ALL-IN-ONE EXPORT PROFILE:
        # Stage A (10% -> 80%): Audio-visual anti-AI frame synthesis into pass1_path
        # Stage B (81% -> 91%): Dedicated Zero-SEI (-bsf:v filter_units) + Hardware OEM + +faststart remux into output_path
        if mode == "all_in_one":
            aio_msg = (
                f"-> [PASS 1/2 • ALL-IN-ONE V 2.5] {fps_mode_label} + 180° Shutter Blend + Warp (k1={job_profile['lens_k1']}) "
                f"+ Vignette + CMOS Grain + Dual-Mic Stereo Air (CRF {job_profile['crf']}, max {maxrate_k})..."
            )
            logs.append(aio_msg)
            tracker.push_log(aio_msg)

            lang_tag = "und" if camera_profile == "neutral" else "eng"
            aio_common_tail = [
                "-dn",
                "-sn",
                "-r", "30",
                "-fps_mode", "cfr",
                "-video_track_timescale", "90000",
                "-c:v", "libx264",
                "-preset", encode_preset,
                "-profile:v", "high",
                "-level", "4.1",
                "-crf", job_profile["crf"],
                "-maxrate", maxrate_k,
                "-bufsize", bufsize_k,
                "-bf", str(job_profile["bframes"]),
                "-pix_fmt", "yuv420p",
                *keyframe_flags,
                "-x264-params", x264_params,
                "-bsf:v", "filter_units=remove_types=6",
                "-map_metadata", "-1",
                "-map_metadata:g", "-1",
                "-map_metadata:s:v", "-1",
                "-map_metadata:s:a", "-1",
                "-map_chapters", "-1",
                "-write_tmcd", "0",
                *cam_meta,
                "-metadata:s:v:0", f"handler_name={v_handler}",
                "-metadata:s:v:0", f"language={lang_tag}",
            ]

            def build_aio_cmd(include_audio: bool) -> list[str]:
                cmd = [
                    FFMPEG_BIN,
                    "-y",
                    "-threads", "0",
                    "-filter_threads", "0",
                    "-i", effective_input_path,
                ]
                if include_audio:
                    audio_fc = build_unified_audio_filter_complex(
                        "[0:a]", "[aout]", duration_sec, job_profile, audio_duration_sec, expected_out_dur, speech_gain_db
                    )
                    full_fc = f"[0:v]{video_filter_str}[vout];{audio_fc}"
                    cmd.extend([
                        "-filter_complex", full_fc,
                        "-map", "[vout]",
                        "-map", "[aout]",
                        "-c:a", "aac",
                        "-b:a", "192k",
                        "-ar", "48000",
                        "-cutoff", "22050",
                    ])
                else:
                    cmd.extend([
                        "-map", "0:v:0",
                        "-vf", video_filter_str,
                        "-an",
                    ])
                cmd.extend(aio_common_tail)
                if include_audio:
                    cmd.extend([
                        "-metadata:s:a:0", f"handler_name={a_handler}",
                        "-metadata:s:a:0", f"language={lang_tag}",
                    ])
                cmd.extend([
                    "-brand", camera_brand,
                    "-fflags", "+genpts+bitexact",
                    "-flags:v", "+bitexact",
                    "-flags:a", "+bitexact",
                    "-shortest",
                    pass1_path,
                ])
                return cmd

            rc_aio, err_aio = (1, "")
            aio_ok = False
            pass1_has_audio = False
            if has_audio:
                rc_aio, err_aio = run_ffmpeg_streaming(
                    build_aio_cmd(True),
                    tracker,
                    stage="pass1_reencode",
                    stage_label="Pass 1/2 Encode: 30fps Native + Stereo Room + 21kHz Air",
                    start_pct=10,
                    end_pct=80,
                    expected_duration=expected_out_dur,
                    expected_frames=expected_frames,
                    prefix="ffmpeg-all-in-one",
                )
                aio_ok = rc_aio == 0 and os.path.isfile(pass1_path) and os.path.getsize(pass1_path) > 16384
                if aio_ok:
                    pass1_has_audio = True
                else:
                    try:
                        if os.path.isfile(pass1_path):
                            os.unlink(pass1_path)
                    except Exception:
                        pass
                    fb_msg = "[AUDIO FALLBACK PYTHON] Stream audio tidak standar — mencoba ulang All-in-One mode video-only (-an)..."
                    logs.append(fb_msg)
                    tracker.push_log(fb_msg)

            if not aio_ok:
                rc_aio, err_aio = run_ffmpeg_streaming(
                    build_aio_cmd(False),
                    tracker,
                    stage="pass1_reencode",
                    stage_label="Pass 1/2 Encode: Safe CFR Video-Only Fallback",
                    start_pct=10,
                    end_pct=80,
                    expected_duration=expected_out_dur,
                    expected_frames=expected_frames,
                    prefix="ffmpeg-all-in-one-v",
                )
                aio_ok = rc_aio == 0 and os.path.isfile(pass1_path) and os.path.getsize(pass1_path) > 16384

            if not aio_ok:
                err_msg = err_aio.splitlines()[-1] if err_aio else "All-in-One Pass 1 FFmpeg pipeline failed"
                raise RuntimeError(f"FFmpeg All-in-One Pipeline gagal: {err_msg}")

            logs.extend(extract_ffmpeg_telemetry(err_aio, "ffmpeg-all-in-one"))
            done_p1 = (
                f"✓ [PASS 1/2 SELESAI] {fps_mode_label} + Shutter Blend + Anti-Diffusion Warp + Calibrated CMOS Grain "
                "+ AAC 192k 21.8kHz Stereo Air selesai — melanjutkan Pass 2 Zero-SEI Remuxing..."
            )
            logs.append(done_p1)
            tracker.push_log(done_p1)

            aio_pass2_cmd = [
                FFMPEG_BIN,
                "-y",
                "-i", pass1_path,
                "-map", "0:V:0",
                *(["-map", "0:a:0"] if pass1_has_audio else []),
                "-map", "-0:d",
                "-map", "-0:s",
                "-map", "-0:t",
                "-dn",
                "-sn",
                "-c", "copy",
                "-bsf:v", "filter_units=remove_types=6",
                "-map_metadata", "-1",
                "-map_metadata:g", "-1",
                "-map_metadata:s:v", "-1",
                "-map_metadata:s:a", "-1",
                "-map_chapters", "-1",
                "-write_tmcd", "0",
                *cam_meta,
                "-metadata:s:v:0", f"handler_name={v_handler}",
                "-metadata:s:v:0", f"language={lang_tag}",
                *(["-metadata:s:a:0", f"handler_name={a_handler}", "-metadata:s:a:0", f"language={lang_tag}"] if pass1_has_audio else []),
                "-brand", camera_brand,
                "-fflags", "+bitexact",
                "-flags:v", "+bitexact",
                "-flags:a", "+bitexact",
                "-movflags", movflags_str,
                output_path,
            ]
            rc2_aio, err2_aio = run_ffmpeg_streaming(
                aio_pass2_cmd,
                tracker,
                stage="pass2_remux",
                stage_label="Pass 2/2 Remux: Zero-SEI Strip, OEM Stamping & +faststart MOOV",
                start_pct=81,
                end_pct=91,
                expected_duration=expected_out_dur,
                expected_frames=expected_frames,
                prefix="ffmpeg-all-in-one-remux",
            )
            if rc2_aio != 0 or not os.path.isfile(output_path) or os.path.getsize(output_path) < 16384:
                err_msg2 = err2_aio.splitlines()[-1] if err2_aio else "All-in-One Pass 2 remux failed"
                raise RuntimeError(f"FFmpeg Pass 2 Remux gagal: {err_msg2}")

            logs.extend(extract_ffmpeg_telemetry(err2_aio, "ffmpeg-all-in-one-remux"))
            done_aio = "✓ [PASS 2/2 REMUX SELESAI] Zero-SEI Bitstream Scrub + MOOV +faststart Container Rewrite selesai."
            logs.append(done_aio)
            tracker.push_log(done_aio)
        else:
            if mode == "safe_mode":
                p1_msg = (
                    "-> [PASS 1/2 • SAFE MODE TEMPORAL V 2.4] "
                    f"{fps_mode_label} Anti-Glitch + Calibrated Grain + Audio Synced Anti-TTS..."
                )
                logs.append(p1_msg)
                tracker.push_log(p1_msg)

                pass1_bsf = "filter_units=remove_types=39|40" if codec_name in ("hevc", "h265") else "filter_units=remove_types=6"

                def build_pass1_cmd(include_audio: bool) -> list[str]:
                    cmd = [
                        FFMPEG_BIN,
                        "-y",
                        "-threads", "0",
                        "-filter_threads", "0",
                        "-i", effective_input_path,
                    ]
                    if include_audio:
                        audio_fc = build_safe_mode_audio_filter_complex(
                            "[0:a]", "[aout]", job_profile, expected_out_dur, speech_gain_db
                        )
                        full_fc = f"[0:v]{video_filter_str}[vout];{audio_fc}"
                        cmd.extend([
                            "-filter_complex", full_fc,
                            "-map", "[vout]",
                            "-map", "[aout]",
                            "-c:a", "aac",
                            "-b:a", "192k",
                            "-ar", "48000",
                            "-cutoff", "21800",
                        ])
                    else:
                        cmd.extend([
                            "-map", "0:v:0",
                            "-vf", video_filter_str,
                            "-an",
                        ])

                    cmd.extend([
                        "-r", "30",
                        "-fps_mode", "cfr",
                        "-video_track_timescale", "90000",
                        "-c:v", "libx264",
                        "-preset", encode_preset,
                        "-profile:v", "high",
                        "-level", "4.1",
                        "-crf", job_profile["crf"],
                        "-maxrate", maxrate_k,
                        "-bufsize", bufsize_k,
                        "-bf", str(job_profile["bframes"]),
                        "-pix_fmt", "yuv420p",
                        *keyframe_flags,
                        "-x264-params", x264_params,
                        "-bsf:v", pass1_bsf,
                        "-fflags", "+genpts+bitexact",
                        "-flags:v", "+bitexact",
                        "-flags:a", "+bitexact",
                        "-map_metadata", "-1",
                        "-map_chapters", "-1",
                        "-shortest",
                        pass1_path
                    ])
                    return cmd

                p1_label = "Pass 1/2 (Safe Mode): Strict Temporal CFR Frame Re-Encoding (Anti-Glitch)"
                p1_prefix = "ffmpeg-safemode"

                rc1, err1 = (1, "")
                p1_ok = False
                if has_audio:
                    rc1, err1 = run_ffmpeg_streaming(
                        build_pass1_cmd(True),
                        tracker,
                        stage="pass1_reencode",
                        stage_label=p1_label,
                        start_pct=10,
                        end_pct=82,
                        expected_duration=expected_out_dur,
                        expected_frames=expected_frames,
                        prefix=p1_prefix,
                    )
                    p1_ok = rc1 == 0 and os.path.isfile(pass1_path) and os.path.getsize(pass1_path) > 16384
                    if not p1_ok:
                        try:
                            if os.path.isfile(pass1_path):
                                os.unlink(pass1_path)
                        except Exception:
                            pass
                        fb_msg1 = "[AUDIO FALLBACK PYTHON] Audio stream tidak kompatibel — mencoba ulang Pass 1 mode video-only..."
                        logs.append(fb_msg1)
                        tracker.push_log(fb_msg1)

                if not p1_ok:
                    rc1, err1 = run_ffmpeg_streaming(
                        build_pass1_cmd(False),
                        tracker,
                        stage="pass1_reencode",
                        stage_label=f"{p1_label} (Video-Only)",
                        start_pct=10,
                        end_pct=82,
                        expected_duration=expected_out_dur,
                        expected_frames=expected_frames,
                        prefix=p1_prefix,
                    )
                    p1_ok = rc1 == 0 and os.path.isfile(pass1_path) and os.path.getsize(pass1_path) > 16384

                if p1_ok:
                    source_for_pass2 = pass1_path
                    t_lines = extract_ffmpeg_telemetry(err1, p1_prefix)
                    logs.extend(t_lines)
                    done1_msg = "✓ [PASS 1/2 SAFE MODE] Re-encoding temporal CFR ketat selesai mulus (0% stutter, 0% SEI)."
                    logs.append(done1_msg)
                    tracker.push_log(done1_msg)
                else:
                    err_msg = err1.splitlines()[-1] if err1 else "Unknown error"
                    raise RuntimeError(f"FFmpeg Pass 1 Re-encode Frame Filter gagal: {err_msg}")
            elif effective_force_keyframes:
                kf_msg = f"-> [PASS 1/2 • FORCE KEYFRAME RE-ENCODE] Menyuntikkan IDR Keyframes & B-Frames (CRF {job_profile['crf']})..."
                logs.append(kf_msg)
                tracker.push_log(kf_msg)

                pass1_kf_cmd = [
                    FFMPEG_BIN,
                    "-y",
                    "-threads", "0",
                    "-i", effective_input_path,
                    "-map", "0:V:0",
                ]
                if has_audio:
                    pass1_kf_cmd.extend(["-map", "0:a:0?", "-c:a", "copy"])
                else:
                    pass1_kf_cmd.append("-an")
                lang_tag = "und" if camera_profile == "neutral" else "eng"
                pass1_kf_cmd.extend([
                    "-map", "-0:d",
                    "-map", "-0:s",
                    "-map", "-0:t",
                    "-dn",
                    "-sn",
                    "-c:v", "libx264",
                    "-preset", encode_preset,
                    "-profile:v", "high",
                    "-level", "4.1",
                    "-crf", job_profile["crf"],
                    "-maxrate", maxrate_k,
                    "-bufsize", bufsize_k,
                    "-bf", str(job_profile["bframes"]),
                    "-pix_fmt", "yuv420p",
                    *keyframe_flags,
                    "-x264-params", x264_params,
                    "-bsf:v", "filter_units=remove_types=6",
                    "-fflags", "+bitexact",
                    "-flags:v", "+bitexact",
                    "-flags:a", "+bitexact",
                    "-map_metadata", "-1",
                    "-map_metadata:g", "-1",
                    "-map_metadata:s:v", "-1",
                    "-map_metadata:s:a", "-1",
                    "-map_chapters", "-1",
                    "-write_tmcd", "0",
                    "-metadata:s:v:0", f"handler_name={v_handler}",
                    "-metadata:s:v:0", f"language={lang_tag}",
                    *(["-metadata:s:a:0", f"handler_name={a_handler}", "-metadata:s:a:0", f"language={lang_tag}"] if has_audio else []),
                    "-brand", camera_brand,
                    pass1_path
                ])
                rc1kf, err1kf = run_ffmpeg_streaming(
                    pass1_kf_cmd,
                    tracker,
                    stage="pass1_reencode",
                    stage_label="Pass 1/2: Re-encode IDR/B-Frame Tanpa Metadata",
                    start_pct=10,
                    end_pct=82,
                    expected_duration=duration_sec,
                    expected_frames=expected_frames,
                    prefix="ffmpeg-keyframe",
                )
                if rc1kf == 0 and os.path.isfile(pass1_path) and os.path.getsize(pass1_path) > 16384:
                    source_for_pass2 = pass1_path
                    logs.extend(extract_ffmpeg_telemetry(err1kf, "ffmpeg-keyframe"))
                    donekf_msg = "✓ [PASS 1/2] Re-encode H.264 IDR/B-Frames bersih selesai tanpa metadata tambahan."
                    logs.append(donekf_msg)
                    tracker.push_log(donekf_msg)

            # Detect codec on pass2 source
            p2_metrics = probe_stream_metrics(source_for_pass2)
            pass2_codec = p2_metrics["codec"]
            sei_filter = "filter_units=remove_types=39|40" if pass2_codec in ("hevc", "h265") else "filter_units=remove_types=6"

            p2_msg = f"-> [PASS 2/2 • AGGRESSIVE TRANSMUX & ZERO-SEI PURGE] Membangun ulang container MP4 (-c copy -bsf:v {sei_filter} -brand {camera_brand})..."
            logs.append(p2_msg)
            tracker.push_log(p2_msg)

            pass2_cmd = [
                FFMPEG_BIN,
                "-y",
                "-i", source_for_pass2,
                *(["-avoid_negative_ts", "make_zero"] if (mode == "remux_only" or (effective_force_keyframes and source_for_pass2 == effective_input_path)) else []),
                "-map", "0:V:0",
            ]
            if has_audio:
                pass2_cmd.extend(["-map", "0:a:0?"])

            pass2_cmd.extend([
                "-map", "-0:d",
                "-map", "-0:s",
                "-map", "-0:t",
                "-dn",
                "-sn",
                "-c", "copy",
                "-bsf:v", sei_filter,
                "-map_metadata", "-1",
                "-map_metadata:g", "-1",
                "-map_metadata:s:v", "-1",
                "-map_metadata:s:a", "-1",
                "-map_chapters", "-1",
                "-write_tmcd", "0",
                *cam_meta,
                "-metadata:s:v:0", f"handler_name={v_handler}",
            ])
            if has_audio:
                pass2_cmd.extend(["-metadata:s:a:0", f"handler_name={a_handler}"])

            pass2_cmd.extend([
                "-brand", camera_brand,
                "-fflags", "+bitexact",
                "-flags:v", "+bitexact",
                "-flags:a", "+bitexact",
                "-movflags", movflags_str,
                output_path
            ])

            rc2, err2 = run_ffmpeg_streaming(
                pass2_cmd,
                tracker,
                stage="pass2_remux",
                stage_label="Pass 2/2: Zero-SEI Container Rewrite & Hardware OEM Stamping",
                start_pct=84,
                end_pct=94,
                expected_duration=p2_metrics["duration_sec"] or duration_sec,
                expected_frames=p2_metrics["total_frames"] or expected_frames,
                prefix="ffmpeg-remux",
            )
            if rc2 != 0 or not os.path.isfile(output_path) or os.path.getsize(output_path) < 1024:
                err_msg = err2.splitlines()[-1] if err2 else "Pass 2 failed"
                raise RuntimeError(f"FFmpeg Pass 2 Gagal: {err_msg}")

            logs.extend(extract_ffmpeg_telemetry(err2, "ffmpeg-remux"))

        tracker.update(
            force=True,
            stage="binary_sanitize",
            message="Eksisi box C2PA/UUID/JUMBF & kompaksi atom free...",
            percent=92,
        )
        sanitized_boxes = sanitize_binary_boxes_in_place(output_path)
        tracker.update(
            force=True,
            stage="binary_sanitize",
            message="Memverifikasi integritas atom MOOV/MDAT & 0 sisa metadata...",
            percent=95,
        )
        verify_info = verify_cleaned_output(output_path, expect_audio=has_audio)
        out_size_mb = verify_info["size_bytes"] / (1024 * 1024)
        fin1 = f"✓ [EKSISI FISIK & KOMPAKSI MP4] {sanitized_boxes} residu/tombstone/free box dihapus total & offset stco disesuaikan."
        fin2 = f"✓ [VERIFIKASI CONTAINER] MP4 lolos audit integritas ({out_size_mb:.2f} MB, 0 tombstones) — menyimpan hasil akhir..."
        logs.append(fin1)
        logs.append(fin2)
        tracker.push_log(fin1, force=False)
        tracker.push_log(fin2, force=False)
        tracker.update(
            force=True,
            stage="binary_sanitize",
            message=f"Container terverifikasi ({out_size_mb:.2f} MB) — menulis file akhir...",
            percent=97,
        )

    return {
        "success": True,
        "output_path": output_path,
        "size_bytes": os.path.getsize(output_path),
        "scramble_stats": scramble_stats_payload,
        "logs": logs,
    }

def main():
    parser = argparse.ArgumentParser(description="Cloud Python FFmpeg Cleaner Pipeline")
    parser.add_argument("--input", required=True, help="Path to input video")
    parser.add_argument("--output", required=True, help="Path to output cleaned video")
    parser.add_argument("--mode", default="all_in_one", choices=["all_in_one", "unified", "deep_synthid", "safe_mode", "remux_only"])
    parser.add_argument("--deep-meta-purge", default="true", choices=["true", "false"])
    parser.add_argument("--force-keyframes", default="true", choices=["true", "false"])
    parser.add_argument("--camera-profile", default="samsung", choices=["samsung", "apple", "xiaomi", "neutral"])
    parser.add_argument("--upscale-1080p", default="true", choices=["true", "false"])
    parser.add_argument("--deep-scan", default="true", choices=["true", "false"])
    parser.add_argument("--humanization-preset", default="full_human")
    parser.add_argument("--synthid-scramble", default="aggressive", choices=["aggressive", "balanced", "off"])
    parser.add_argument("--progress-file", default=None, help="Optional JSON progress file path")
    parser.add_argument("--job-id", default="", help="Job identifier for progress reporting")
    parser.add_argument("--defer-fail-to-caller", default="false", choices=["true", "false"])

    args = parser.parse_args()

    try:
        result = process_video(
            input_path=args.input,
            output_path=args.output,
            mode=args.mode,
            deep_meta_purge=(args.deep_meta_purge == "true"),
            force_keyframes=(args.force_keyframes == "true"),
            camera_profile=args.camera_profile,
            upscale_1080p=(args.upscale_1080p == "true"),
            deep_scan=(args.deep_scan == "true"),
            humanization_preset=args.humanization_preset,
            synthid_scramble=args.synthid_scramble,
            progress_file=args.progress_file,
            job_id=args.job_id,
        )
        print(json.dumps(result))
        sys.exit(0)
    except Exception as e:
        if args.progress_file:
            tracker = ProgressTracker(args.progress_file, args.job_id)
            tracker.load_existing_if_present()
            if args.defer_fail_to_caller == "true":
                tracker.push_log(
                    f"[PYTHON PIPELINE FALLBACK] {str(e)} — beralih ke fallback Node FFmpeg...",
                    force=True,
                )
            else:
                tracker.update(
                    force=True,
                    stage="failed",
                    message=f"Gagal: {str(e)}",
                    error=str(e),
                )
        sys.stderr.write(f"Error: {str(e)}\n")
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
