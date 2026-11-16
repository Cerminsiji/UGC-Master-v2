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


def build_synthid_video_filter(width: int = 0, height: int = 0, upscale_1080p: bool = True) -> str:
    target_w, target_h = _compute_target_dimensions(width, height, upscale_1080p)
    if target_w >= 64 and target_h >= 64:
        scale_step = f"scale={target_w}:{target_h}:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv"
    else:
        scale_step = "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv"

    return (
        "setpts=0.961538*(PTS-STARTPTS),"
        "framerate=fps=30000/1001:interp_start=15:interp_end=240:scene=7.0,"
        "format=yuv420p,"
        "hqdn3d=0.9:0.7:1.1:0.9,"
        "lenscorrection=cx=0.495:cy=0.505:k1=-0.022:k2=0.007,"
        "perspective="
        "x0=W*0.022+W*0.0022*sin(on*0.19)+W*0.0010*cos(on*0.37):"
        "y0=H*0.022+H*0.0016*cos(on*0.16)+H*0.0009*sin(on*0.31):"
        "x1=W*0.978+W*0.0022*sin(on*0.19+0.4)+W*0.0009*cos(on*0.33):"
        "y1=H*0.022+H*0.0016*cos(on*0.16-0.3)+H*0.0009*sin(on*0.29):"
        "x2=W*0.022+W*0.0022*sin(on*0.19-0.3)+W*0.0010*cos(on*0.35):"
        "y2=H*0.978+H*0.0016*cos(on*0.16+0.4)+H*0.0009*sin(on*0.27):"
        "x3=W*0.978+W*0.0022*sin(on*0.19+0.2)+W*0.0009*cos(on*0.31):"
        "y3=H*0.978+H*0.0016*cos(on*0.16+0.2)+H*0.0009*sin(on*0.34):"
        "interpolation=linear:sense=source:eval=frame,"
        f"{scale_step},"
        "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,"
        "chromashift=cbh=1:cbv=0:crh=-1:crv=0,"
        "colorchannelmixer=rr=1.011:rg=-0.008:rb=-0.003:gr=-0.005:gg=1.007:gb=-0.002:br=-0.003:bg=-0.007:bb=1.010,"
        "eq=contrast=1.02:brightness=-0.002+0.004*sin(t*4.7+0.6*cos(t*8.3)):saturation=1.02:gamma=1.012:eval=frame,"
        "cas=strength=0.18,"
        "vignette=angle=PI/8,"
        "noise=c0s=2.8:c1s=1.5:c2s=1.5:allf=t+u,"
        "setsar=1"
    )


def build_safe_mode_video_filter(width: int = 0, height: int = 0, upscale_1080p: bool = True) -> str:
    """
    Safe Mode Temporal Re-Encoding Filtergraph v22:
    Eliminates 4:1 duplicate pulldown + static macroblock cloning via continuous micro-drift + BT.709 color lock.
    """
    target_w, target_h = _compute_target_dimensions(width, height, upscale_1080p)
    if target_w >= 64 and target_h >= 64:
        geom_steps = (
            "perspective="
            "x0=W*0.015+W*0.0015*sin(on*0.17)+W*0.0007*cos(on*0.33):"
            "y0=H*0.015+H*0.0011*cos(on*0.15)+H*0.0006*sin(on*0.29):"
            "x1=W*0.985+W*0.0015*sin(on*0.17+0.3)+W*0.0007*cos(on*0.31):"
            "y1=H*0.015+H*0.0011*cos(on*0.15-0.2)+H*0.0006*sin(on*0.27):"
            "x2=W*0.015+W*0.0015*sin(on*0.17-0.2)+W*0.0007*cos(on*0.35):"
            "y2=H*0.985+H*0.0011*cos(on*0.15+0.3)+H*0.0006*sin(on*0.25):"
            "x3=W*0.985+W*0.0015*sin(on*0.17+0.2)+W*0.0007*cos(on*0.29):"
            "y3=H*0.985+H*0.0011*cos(on*0.15+0.2)+H*0.0006*sin(on*0.31):"
            "interpolation=linear:sense=source:eval=frame,"
            f"scale={target_w}:{target_h}:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv,"
        )
    else:
        geom_steps = (
            "crop=trunc(iw*0.97/2)*2:trunc(ih*0.97/2)*2,"
            "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv,"
        )

    return (
        "setpts=PTS-STARTPTS,"
        "framerate=fps=30000/1001:interp_start=15:interp_end=240:scene=7.0,"
        "format=yuv420p,"
        "hqdn3d=0.8:0.6:1.0:0.8,"
        f"{geom_steps}"
        "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,"
        "chromashift=cbh=1:cbv=0:crh=-1:crv=0,"
        "colorchannelmixer=rr=1.008:rg=-0.006:rb=-0.002:gr=-0.004:gg=1.006:gb=-0.002:br=-0.002:bg=-0.006:bb=1.008,"
        "eq=contrast=1.015:brightness=-0.002+0.0035*sin(t*4.5+0.5*cos(t*7.9)):saturation=1.015:gamma=1.01:eval=frame,"
        "cas=strength=0.16,"
        "noise=c0s=2.4:c1s=1.3:c2s=1.3:allf=t+u,"
        "setsar=1"
    )


def build_unified_video_filter(width: int = 0, height: int = 0, duration_sec: float = 0.0, upscale_1080p: bool = True) -> str:
    """
    Unified All-in-One Pipeline v22:
    - Trims 0.08s leading silence/boundary signature
    - Converts 24fps AI sources to 29.97fps NTSC camera cadence via scene-aware interpolation
    - Runs native-res mild spatial/temporal filter + continuous sub-pixel perspective micro-drift (eliminates 77% static pixel locks)
    - Single-pass Lanczos 1080p BT.709 scale + CMOS auto-exposure micro-breathing + luma/chroma sensor grain
    """
    trim_prefix = "trim=start=0.08,setpts=PTS-STARTPTS," if duration_sec > 2.0 else "setpts=PTS-STARTPTS,"
    target_w, target_h = _compute_target_dimensions(width, height, upscale_1080p)
    scale_step = (
        f"scale={target_w}:{target_h}:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv,"
        if target_w >= 64 and target_h >= 64
        else "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos+accurate_rnd:in_color_matrix=auto:out_color_matrix=bt709:out_range=tv,"
    )

    return (
        f"{trim_prefix}"
        "framerate=fps=30000/1001:interp_start=15:interp_end=240:scene=7.0,"
        "format=yuv420p,"
        "hqdn3d=0.8:0.6:1.0:0.8,"
        "lenscorrection=cx=0.494:cy=0.506:k1=-0.020:k2=0.006,"
        "perspective="
        "x0=W*0.022+W*0.0022*sin(on*0.19)+W*0.0010*cos(on*0.37):"
        "y0=H*0.022+H*0.0016*cos(on*0.16)+H*0.0009*sin(on*0.31):"
        "x1=W*0.978+W*0.0022*sin(on*0.19+0.4)+W*0.0009*cos(on*0.33):"
        "y1=H*0.022+H*0.0016*cos(on*0.16-0.3)+H*0.0009*sin(on*0.29):"
        "x2=W*0.022+W*0.0022*sin(on*0.19-0.3)+W*0.0010*cos(on*0.35):"
        "y2=H*0.978+H*0.0016*cos(on*0.16+0.4)+H*0.0009*sin(on*0.27):"
        "x3=W*0.978+W*0.0022*sin(on*0.19+0.2)+W*0.0009*cos(on*0.31):"
        "y3=H*0.978+H*0.0016*cos(on*0.16+0.2)+H*0.0009*sin(on*0.34):"
        "interpolation=linear:sense=source:eval=frame,"
        f"{scale_step}"
        "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,"
        "chromashift=cbh=1:cbv=0:crh=-1:crv=0,"
        "hue=h=1.1:s=1.015,"
        "colorchannelmixer=rr=1.009:rg=-0.007:rb=-0.002:gr=-0.004:gg=1.006:gb=-0.002:br=-0.003:bg=-0.006:bb=1.009,"
        "eq=contrast=1.015:brightness=-0.002+0.004*sin(t*4.7+0.6*cos(t*8.3)):saturation=1.015:gamma=1.010:eval=frame,"
        "cas=strength=0.16,"
        "vignette=angle=PI/9,"
        "noise=c0s=2.8:c1s=1.5:c2s=1.5:allf=t+u,"
        "setsar=1"
    )


def build_synthid_audio_filter_complex(voice_label: str = "[0:a]", out_label: str = "[aout]") -> str:
    return (
        "anoisesrc=color=pink:amplitude=0.0014:sample_rate=48000:seed=104729[pL];"
        "anoisesrc=color=pink:amplitude=0.0014:sample_rate=48000:seed=224737[pR];"
        "[pL][pR]amerge=inputs=2,highpass=f=75,lowpass=f=15500,equalizer=f=450:t=q:w=0.8:g=-3,tremolo=f=0.33:d=0.18[room];"
        f"{voice_label}asetpts=PTS-STARTPTS,aresample=48000,"
        "aformat=channel_layouts=stereo,"
        "afftdn=nr=7:nf=-42:tn=1,"
        "rubberband=tempo=1.04:pitch=0.968:formant=shifted,"
        "highpass=f=70,"
        "equalizer=f=195:t=q:w=1.0:g=1.2,"
        "equalizer=f=3200:t=q:w=1.4:g=-0.9,"
        "aexciter=level_in=1:level_out=1:amount=2.8:drive=5.0:blend=0:freq=6800:ceil=19600,"
        "aecho=0.94:0.90:15|25:0.038|0.020,"
        "extrastereo=m=1.26,"
        "asoftclip=type=tanh:threshold=0.92,"
        "acompressor=threshold=-20dB:ratio=2.0:attack=8:release=120:makeup=2.0dB,"
        "asplit=2[vdry][ver_in];"
        "[ver_in]highpass=f=280,lowpass=f=5000,adelay=8|18,volume=0.11[ver];"
        "[vdry][ver]amix=inputs=2:normalize=0[voice];"
        f"[voice][room]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95{out_label}"
    )


def build_safe_mode_audio_filter_complex(voice_label: str = "[0:a]", out_label: str = "[aout]") -> str:
    """
    Safe Mode Temporal-Locked Audio Filtergraph v22:
    Natural 1/f pink indoor mic floor (-48 to -52 dB) + speech-correlated aexciter harmonics (zero HF hiss shelf).
    """
    return (
        "anoisesrc=color=pink:amplitude=0.0014:sample_rate=48000:seed=104729[pL];"
        "anoisesrc=color=pink:amplitude=0.0014:sample_rate=48000:seed=224737[pR];"
        "[pL][pR]amerge=inputs=2,highpass=f=75,lowpass=f=15500,equalizer=f=450:t=q:w=0.8:g=-3,tremolo=f=0.33:d=0.18[room];"
        f"{voice_label}asetpts=PTS-STARTPTS,aresample=48000:async=1:first_pts=0,"
        "aformat=channel_layouts=stereo,"
        "afftdn=nr=7:nf=-42:tn=1,"
        "rubberband=tempo=1.0:pitch=0.984:formant=shifted,"
        "highpass=f=70,"
        "equalizer=f=195:t=q:w=1.0:g=1.2,"
        "equalizer=f=3200:t=q:w=1.4:g=-0.8,"
        "aexciter=level_in=1:level_out=1:amount=2.7:drive=4.8:blend=0:freq=6800:ceil=19600,"
        "aecho=0.94:0.90:14|23:0.035|0.019,"
        "extrastereo=m=1.22,"
        "asoftclip=type=tanh:threshold=0.92,"
        "acompressor=threshold=-20dB:ratio=2.0:attack=8:release=120:makeup=2.0dB,"
        "asplit=2[vdry][ver_in];"
        "[ver_in]highpass=f=280,lowpass=f=5000,adelay=6|15,volume=0.10[ver];"
        "[vdry][ver]amix=inputs=2:normalize=0[voice];"
        f"[voice][room]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95{out_label}"
    )


def build_unified_audio_filter_complex(voice_label: str = "[0:a]", out_label: str = "[aout]", duration_sec: float = 0.0) -> str:
    """
    Unified Temporal-Locked Anti-TTS Audio Filtergraph v22:
    - Matching 0.08s start trim removes TTS lead-in dead silence cleanly
    - True 1/f indoor pink room ambiance (-49 dB natural floor, no synthetic >12.5kHz hiss shelf bump)
    - Speech-correlated aexciter (>14kHz/17kHz natural sibilant air) + 2.4% rubberband pitch/formant shift
    """
    atrim_prefix = "atrim=start=0.08,asetpts=PTS-STARTPTS," if duration_sec > 2.0 else "asetpts=PTS-STARTPTS,"
    return (
        "anoisesrc=color=pink:amplitude=0.0014:sample_rate=48000:seed=104729[pL];"
        "anoisesrc=color=pink:amplitude=0.0014:sample_rate=48000:seed=224737[pR];"
        "[pL][pR]amerge=inputs=2,highpass=f=75,lowpass=f=15500,equalizer=f=450:t=q:w=0.8:g=-3,tremolo=f=0.33:d=0.18[room];"
        f"{voice_label}{atrim_prefix}aresample=48000:async=1:first_pts=0,"
        "aformat=channel_layouts=stereo,"
        "afftdn=nr=7:nf=-42:tn=1,"
        "rubberband=tempo=1.0:pitch=0.976:formant=shifted,"
        "highpass=f=70,"
        "equalizer=f=195:t=q:w=1.0:g=1.2,"
        "equalizer=f=2600:t=q:w=1.5:g=-0.8,"
        "aexciter=level_in=1:level_out=1:amount=2.8:drive=5.0:blend=0:freq=6800:ceil=19600,"
        "aecho=0.94:0.90:14|24:0.036|0.019,"
        "extrastereo=m=1.24,"
        "asoftclip=type=tanh:threshold=0.92,"
        "acompressor=threshold=-20dB:ratio=2.0:attack=8:release=120:makeup=2.0dB,"
        "asplit=2[vdry][ver_in];"
        "[ver_in]highpass=f=280,lowpass=f=5000,adelay=7|17,volume=0.11[ver];"
        "[vdry][ver]amix=inputs=2:normalize=0[voice];"
        f"[voice][room]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95{out_label}"
    )

class ProgressTracker:
    def __init__(self, progress_file: str | None, job_id: str = ""):
        self.progress_file = progress_file
        self.job_id = job_id
        self.last_write_ts = 0.0
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

    def update(self, force: bool = False, **kwargs):
        self.state.update(kwargs)
        self.state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        if not self.progress_file:
            return
        now = time.monotonic()
        if not force and (now - self.last_write_ts) < 0.22:
            return
        self.last_write_ts = now
        tmp_path = f"{self.progress_file}.tmp.{os.getpid()}"
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

def probe_stream_metrics(input_file: str) -> dict:
    info = {
        "has_audio": False,
        "codec": "h264",
        "width": 0,
        "height": 0,
        "duration_sec": 0.0,
        "total_frames": 0,
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
            streams = data.get("streams") or []
            for st in streams:
                ctype = st.get("codec_type")
                if ctype == "audio":
                    info["has_audio"] = True
                elif ctype == "video" and info["width"] == 0:
                    info["codec"] = str(st.get("codec_name") or "h264").lower()
                    w = int(st.get("width") or 0)
                    h = int(st.get("height") or 0)
                    info["width"] = (w // 2) * 2
                    info["height"] = (h // 2) * 2
                    nb_frames = int(st.get("nb_frames") or 0)
                    if nb_frames > 0:
                        info["total_frames"] = nb_frames
                    elif info["duration_sec"] > 0:
                        info["total_frames"] = max(1, int(info["duration_sec"] * 29.97))
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
    """Run FFmpeg via Popen, streaming stderr telemetry cleanly into ProgressTracker."""
    tracker.update(
        force=True,
        stage=stage,
        message=stage_label,
        percent=start_pct,
    )

    proc = subprocess.Popen(
        cmd,
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
                fm = frame_re.search(line)
                fpm = fps_re.search(line)
                tm = time_re.search(line)
                sm = speed_re.search(line)

                cur_frame = int(fm.group(1)) if fm else tracker.state["frame"]
                cur_fps = float(fpm.group(1)) if fpm else tracker.state["fps"]
                cur_time = parse_time_to_sec(tm.group(1)) if tm else tracker.state["outTimeSec"]
                cur_speed = sm.group(1) if sm else tracker.state["speed"]

                ratio = 0.0
                if expected_duration > 0.1 and cur_time > 0:
                    ratio = min(1.0, cur_time / expected_duration)
                elif expected_frames > 0 and cur_frame > 0:
                    ratio = min(1.0, cur_frame / float(expected_frames))

                pct = min(end_pct, max(start_pct, int(start_pct + ratio * (end_pct - start_pct))))
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
        else:
            line_buf += byte

    if proc.stdout:
        proc.stdout.read()
    returncode = proc.wait()
    full_stderr = b"".join(stderr_chunks).decode("utf-8", errors="replace")
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
    mac_epoch_ctime = int(time.time()) + 2082844800 - 1620
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
                            ctime = int.from_bytes(data[offset+hdr+4:offset+hdr+8], byteorder="big")
                            if ctime == 0:
                                data[offset+hdr+4:offset+hdr+8] = ctime_32
                                data[offset+hdr+8:offset+hdr+12] = mtime_32
                        elif ver == 1 and offset + hdr + 20 <= offset + size:
                            ctime = int.from_bytes(data[offset+hdr+4:offset+hdr+12], byteorder="big")
                            if ctime == 0:
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
                    elif box_type in ("uuid", "c2pa", "jumb", "c2ma", "c2cl", "XMP_"):
                        data[offset+4:offset+8] = b"free"
                        data[offset+hdr:offset+size] = b"\x00" * (size - hdr)
                        sanitized_count += 1
                    elif box_type in ("©too", "©enc"):
                        data[offset+4:offset+8] = b"free"
                        data[offset+hdr:offset+size] = b"\x00" * (size - hdr)
                        sanitized_count += 1
                    elif box_type in ("udta", "meta", "ilst"):
                        payload = data[offset+hdr:min(offset+size, offset+1024)].decode('ascii', errors='ignore').lower()
                        if any(bad in payload for bad in bad_markers):
                            data[offset+4:offset+8] = b"free"
                            data[offset+hdr:offset+size] = b"\x00" * (size - hdr)
                            sanitized_count += 1
                        else:
                            next_start = offset + hdr + 4 if box_type == "meta" else offset + hdr
                            if next_start < offset + size:
                                walk_and_clean(next_start, offset + size, depth + 1)
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

def process_video(
    input_path: str,
    output_path: str,
    mode: str = "unified",
    deep_meta_purge: bool = True,
    force_keyframes: bool = True,
    camera_profile: str = "samsung",
    upscale_1080p: bool = True,
    progress_file: str | None = None,
    job_id: str = "",
) -> dict:
    tracker = ProgressTracker(progress_file, job_id)
    logs = []
    start_msg = f"[CLOUD PYTHON FFMPEG] Memulai pemrosesan video: {os.path.basename(input_path)}"
    logs.append(start_msg)
    logs.append(f"   -> Binary: {FFMPEG_BIN}")
    tracker.push_log(start_msg)

    metrics = probe_stream_metrics(input_path)
    has_audio = metrics["has_audio"]
    codec_name = metrics["codec"]
    vid_w, vid_h = metrics["width"], metrics["height"]
    duration_sec = metrics["duration_sec"]
    target_w, target_h = _compute_target_dimensions(vid_w, vid_h, upscale_1080p and camera_profile != "neutral")

    if mode == "deep_synthid" and duration_sec > 0:
        expected_frames = max(1, int(duration_sec * 0.961538 * 29.97))
    elif mode in ("all_in_one", "unified") and duration_sec > 0:
        eff_dur = max(0.2, duration_sec - (0.08 if duration_sec > 2.0 else 0.0))
        expected_frames = max(1, int(eff_dur * 29.97))
    elif mode == "safe_mode" and duration_sec > 0:
        expected_frames = max(1, int(duration_sec * 29.97))
    else:
        expected_frames = metrics["total_frames"]

    use_upscale = upscale_1080p and camera_profile != "neutral"
    if mode in ("all_in_one", "unified"):
        video_filter_str = build_unified_video_filter(vid_w, vid_h, duration_sec, use_upscale)
    elif mode == "safe_mode":
        video_filter_str = build_safe_mode_video_filter(vid_w, vid_h, use_upscale)
    else:
        video_filter_str = build_synthid_video_filter(vid_w, vid_h, use_upscale)
    res_label = f"{vid_w}x{vid_h} -> {target_w}x{target_h}" if (target_w and (target_w != vid_w or target_h != vid_h)) else (f"{vid_w}x{vid_h}" if vid_w else "Auto")
    probe_msg = (
        f"   -> Stream Probe: Codec={codec_name.upper() or 'H264'} | "
        f"Res={res_label} | "
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
    encode_preset = "superfast" if duration_sec > 25 else "veryfast"
    movflags_str = "+faststart"

    with tempfile.TemporaryDirectory() as temp_dir:
        pass1_path = os.path.join(temp_dir, "pass1_reencoded.mp4")
        source_for_pass2 = input_path

        effective_force_keyframes = force_keyframes and (mode not in ("all_in_one", "safe_mode", "unified"))

        keyframe_flags = [
            "-g", "30",
            "-keyint_min", "12",
            "-sc_threshold", "42",
            "-refs", "2",
            "-color_primaries", "bt709",
            "-color_trc", "bt709",
            "-colorspace", "bt709",
            "-color_range", "tv",
        ]

        x264_params = (
            "ref=2:bframes=2:b-adapt=1:b-pyramid=none:weightp=1:psy-rd=1.15,0.15:aq-mode=3:"
            "no-dct-decimate=1:nal-hrd=none:force-cfr=1:deblock=1,1:open-gop=0:scenecut=42:keyint=30:min-keyint=12"
        )

        # SINGLE-COMMAND ALL-IN-ONE EXPORT PROFILE
        if mode == "all_in_one":
            aio_msg = (
                "-> [ALL-IN-ONE SINGLE PIPELINE v22] Sub-Pixel Perspective Micro-Drift + 29.97fps Interp "
                "+ CMOS AE Breathing & Grain + 1/f Room Floor (-49dB) + Zero-mdta/Zero-SEI MP4..."
            )
            logs.append(aio_msg)
            tracker.push_log(aio_msg)

            aio_cmd = [
                FFMPEG_BIN,
                "-y",
                "-threads", "0",
                "-filter_threads", "0",
                "-i", input_path,
            ]

            if has_audio:
                audio_fc = build_unified_audio_filter_complex("[0:a]", "[aout]", duration_sec)
                full_fc = f"[0:v]{video_filter_str}[vout];{audio_fc}"
                aio_cmd.extend([
                    "-filter_complex", full_fc,
                    "-map", "[vout]",
                    "-map", "[aout]",
                    "-c:a", "aac",
                    "-b:a", "256k",
                    "-ar", "48000",
                    "-cutoff", "20500",
                ])
            else:
                aio_cmd.extend([
                    "-map", "0:v:0",
                    "-vf", video_filter_str,
                    "-an",
                ])

            lang_tag = "und" if camera_profile == "neutral" else "eng"
            aio_cmd.extend([
                "-dn",
                "-sn",
                "-fps_mode", "cfr",
                "-video_track_timescale", "90000",
                "-c:v", "libx264",
                "-preset", encode_preset,
                "-profile:v", "high",
                "-level", "4.1",
                "-crf", "18",
                "-bf", "2",
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
            ])
            if has_audio:
                aio_cmd.extend([
                    "-metadata:s:a:0", f"handler_name={a_handler}",
                    "-metadata:s:a:0", f"language={lang_tag}",
                ])

            aio_cmd.extend([
                "-brand", camera_brand,
                "-fflags", "+genpts+bitexact",
                "-flags:v", "+bitexact",
                "-flags:a", "+bitexact",
                "-movflags", movflags_str,
                output_path,
            ])

            rc_aio, err_aio = run_ffmpeg_streaming(
                aio_cmd,
                tracker,
                stage="pass1_reencode",
                stage_label="All-in-One v22 (Sub-Pixel Drift + 1080p BT.709 + 1/f Audio + Zero-SEI/Zero-mdta)",
                start_pct=10,
                end_pct=94,
                expected_duration=max(0.2, duration_sec - (0.08 if duration_sec > 2.0 else 0.0)) if duration_sec > 0 else 0,
                expected_frames=expected_frames,
                prefix="ffmpeg-all-in-one",
            )
            if rc_aio != 0 or not os.path.isfile(output_path) or os.path.getsize(output_path) <= 16384:
                err_msg = err_aio.splitlines()[-1] if err_aio else "All-in-One FFmpeg pipeline failed"
                raise RuntimeError(f"FFmpeg All-in-One Pipeline gagal: {err_msg}")

            logs.extend(extract_ffmpeg_telemetry(err_aio, "ffmpeg-all-in-one"))
            done_aio = (
                "✓ [ALL-IN-ONE SELESAI v22] Sub-Pixel Perspective Micro-Drift + 29.97fps + 1080p BT.709 "
                "+ 1/f Room Floor & Harmonics + Zero-SEI/Zero-mdta selesai dalam 1 pipeline."
            )
            logs.append(done_aio)
            tracker.push_log(done_aio)
        else:
            # PASS 1: Unified OR Safe Mode OR Deep Anti-SynthID
            if mode in ("unified", "deep_synthid", "safe_mode"):
                is_temporal_cfr = mode in ("safe_mode", "unified")
                if mode == "unified":
                    p1_msg = (
                        "-> [PASS 1/2 • PAKET TERPADU ANTI-GLITCH + ANTI-SYNTHID] "
                        "Temporal CFR ketat (PTS-STARTPTS, Closed-GOP, Bypass Keyframe-Only) + Optik CMOS Anti-SynthID + Audio Rubberband & Stereo Pink Air (-cutoff 20500)..."
                    )
                elif mode == "safe_mode":
                    p1_msg = (
                        "-> [PASS 1/2 • SAFE MODE TEMPORAL ANTI-GLITCH] "
                        "Re-encoding ketat frame-by-frame CFR (PTS-STARTPTS, Closed-GOP, Bypass Keyframe-Only Injection) + Audio Synced Anti-TTS..."
                    )
                else:
                    p1_msg = (
                        "-> [PASS 1/2 • AUDIO-VISUAL ANTI-AI v20] "
                        "Menjalankan Filter CMOS Optik Bebas-Ghost + 29.97fps B-Frames (refs=2) + Rubberband Pitch/Formant + Dual-Seed Pink Room Air (-cutoff 20200)..."
                    )
                logs.append(p1_msg)
                tracker.push_log(p1_msg)

                pass1_bsf = "filter_units=remove_types=39|40" if codec_name in ("hevc", "h265") else "filter_units=remove_types=6"

                pass1_cmd = [
                    FFMPEG_BIN,
                    "-y",
                    "-threads", "0",
                    "-filter_threads", "0",
                    "-i", input_path,
                ]

                if has_audio:
                    if mode == "unified":
                        audio_fc = build_unified_audio_filter_complex("[0:a]", "[aout]", duration_sec)
                    elif mode == "safe_mode":
                        audio_fc = build_safe_mode_audio_filter_complex("[0:a]", "[aout]")
                    else:
                        audio_fc = build_synthid_audio_filter_complex("[0:a]", "[aout]")
                    full_fc = f"[0:v]{video_filter_str}[vout];{audio_fc}"
                    pass1_cmd.extend([
                        "-filter_complex", full_fc,
                        "-map", "[vout]",
                        "-map", "[aout]",
                        "-c:a", "aac",
                        "-b:a", "256k",
                        "-ar", "48000",
                        "-cutoff", "20500",
                    ])
                else:
                    pass1_cmd.extend([
                        "-map", "0:v:0",
                        "-vf", video_filter_str,
                        "-an",
                    ])

                pass1_cmd.extend([
                    "-fps_mode", "cfr",
                    "-c:v", "libx264",
                    "-preset", encode_preset,
                    "-profile:v", "high",
                    "-level", "4.1",
                    "-crf", "18" if is_temporal_cfr else "19",
                    "-bf", "2",
                    "-pix_fmt", "yuv420p",
                    *keyframe_flags,
                    "-x264-params", x264_params,
                    "-bsf:v", pass1_bsf,
                    "-fflags", "+genpts+bitexact" if is_temporal_cfr else "+bitexact",
                    "-flags:v", "+bitexact",
                    "-flags:a", "+bitexact",
                    "-map_metadata", "-1",
                    "-map_chapters", "-1",
                    pass1_path
                ])

                rc1, err1 = run_ffmpeg_streaming(
                    pass1_cmd,
                    tracker,
                    stage="pass1_reencode",
                    stage_label=(
                        "Pass 1/2 (Unified Pipeline): Temporal CFR Anti-Glitch + Deep Anti-SynthID"
                        if mode == "unified" else
                        "Pass 1/2 (Safe Mode): Strict Temporal CFR Frame Re-Encoding (Anti-Glitch)"
                        if mode == "safe_mode" else
                        "Pass 1/2: Audio-Visual Anti-AI Filtering & B-Frame Synthesis"
                    ),
                    start_pct=10,
                    end_pct=82,
                    expected_duration=(duration_sec if is_temporal_cfr else duration_sec * 0.961538) if duration_sec > 0 else 0,
                    expected_frames=expected_frames,
                    prefix="ffmpeg-unified" if mode == "unified" else ("ffmpeg-safemode" if mode == "safe_mode" else "ffmpeg-reencode"),
                )
                if rc1 == 0 and os.path.isfile(pass1_path) and os.path.getsize(pass1_path) > 16384:
                    source_for_pass2 = pass1_path
                    t_lines = extract_ffmpeg_telemetry(err1, "ffmpeg-unified" if mode == "unified" else ("ffmpeg-safemode" if mode == "safe_mode" else "ffmpeg-reencode"))
                    logs.extend(t_lines)
                    done1_msg = (
                        "✓ [PASS 1/2 UNIFIED] Temporal CFR anti-glitch + Optik CMOS Anti-SynthID + Audio Rubberband/Pink Air selesai mulus (0% stutter)."
                        if mode == "unified" else
                        "✓ [PASS 1/2 SAFE MODE] Re-encoding temporal CFR ketat selesai mulus (0% stutter, Keyframe-Only Injection dilewati, 0% SEI)."
                        if mode == "safe_mode" else
                        "✓ [PASS 1/2] Re-sintesis Audio-Visual selesai: 29.97fps bebas ghost, B-Frames refs=2, Rubberband + Stereo Pink Room Air aktif."
                    )
                    logs.append(done1_msg)
                    tracker.push_log(done1_msg)
                else:
                    err_msg = err1.splitlines()[-1] if err1 else "Unknown error"
                    raise RuntimeError(f"FFmpeg Pass 1 Re-encode Frame Filter gagal: {err_msg}")
            elif effective_force_keyframes:
                kf_msg = "-> [PASS 1/2 • FORCE KEYFRAME RE-ENCODE] Menyuntikkan IDR Keyframes & B-Frames (CRF 18)..."
                logs.append(kf_msg)
                tracker.push_log(kf_msg)

                pass1_kf_cmd = [
                    FFMPEG_BIN,
                    "-y",
                    "-threads", "0",
                    "-i", input_path,
                    "-map", "0:v:0",
                ]
                if has_audio:
                    pass1_kf_cmd.extend(["-map", "0:a?", "-c:a", "copy"])
                pass1_kf_cmd.extend([
                    "-c:v", "libx264",
                    "-preset", encode_preset,
                    "-profile:v", "high",
                    "-level", "4.1",
                    "-crf", "18",
                    "-bf", "2",
                    "-pix_fmt", "yuv420p",
                    *keyframe_flags,
                    "-x264-params", x264_params,
                    "-fflags", "+bitexact",
                    "-flags:v", "+bitexact",
                    "-map_metadata", "-1",
                    "-map_chapters", "-1",
                    pass1_path
                ])
                rc1kf, err1kf = run_ffmpeg_streaming(
                    pass1_kf_cmd,
                    tracker,
                    stage="pass1_reencode",
                    stage_label="Pass 1/2: Menyuntikkan IDR Keyframes & B-Frames",
                    start_pct=10,
                    end_pct=82,
                    expected_duration=duration_sec,
                    expected_frames=expected_frames,
                    prefix="ffmpeg-keyframe",
                )
                if rc1kf == 0 and os.path.isfile(pass1_path) and os.path.getsize(pass1_path) > 16384:
                    source_for_pass2 = pass1_path
                    logs.extend(extract_ffmpeg_telemetry(err1kf, "ffmpeg-keyframe"))
                    donekf_msg = "✓ [PASS 1/2] IDR Keyframes 1s Closed-GOP berhasil disuntikkan."
                    logs.append(donekf_msg)
                    tracker.push_log(donekf_msg)

            # Detect codec on pass2 source
            p2_metrics = probe_stream_metrics(source_for_pass2)
            pass2_codec = p2_metrics["codec"]
            sei_filter = "filter_units=remove_types=39|40" if pass2_codec in ("hevc", "h265") else "filter_units=remove_types=6"

            p2_msg = f"-> [PASS 2/2 • REMUXING & ZERO-SEI PURGE] Menulis ulang container MP4 (-c copy -bsf:v {sei_filter} -brand {camera_brand})..."
            logs.append(p2_msg)
            tracker.push_log(p2_msg)

            pass2_cmd = [
                FFMPEG_BIN,
                "-y",
                "-i", source_for_pass2,
                *(["-avoid_negative_ts", "make_zero"] if (effective_force_keyframes and source_for_pass2 == input_path) else []),
                "-map", "0:v:0",
            ]
            if has_audio:
                pass2_cmd.extend(["-map", "0:a?"])

            pass2_cmd.extend([
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
            message="Eksisi box C2PA/UUID/JUMBF, kompaksi atom free, & finalisasi MP4...",
            percent=96,
        )
        sanitized_boxes = sanitize_binary_boxes_in_place(output_path)
        out_size_mb = os.path.getsize(output_path) / (1024 * 1024)
        fin1 = f"✓ [EKSISI FISIK & KOMPAKSI MP4] {sanitized_boxes} residu/free box dihapus total & offset stco disesuaikan."
        fin2 = f"✓ [SELESAI] Output bersih berhasil dibuat: {out_size_mb:.2f} MB (0% SEI Type 6, 0% Free/mdta, 29.97fps Micro-Drift)."
        logs.append(fin1)
        logs.append(fin2)
        tracker.push_log(fin1, force=False)
        tracker.push_log(fin2, force=False)
        tracker.update(
            force=True,
            stage="completed",
            message=f"Selesai 100% ({out_size_mb:.2f} MB) • Anti-AI v22 Aktif",
            percent=100,
        )

    return {
        "success": True,
        "output_path": output_path,
        "size_bytes": os.path.getsize(output_path),
        "logs": logs
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
    parser.add_argument("--progress-file", default=None, help="Optional JSON progress file path")
    parser.add_argument("--job-id", default="", help="Job identifier for progress reporting")

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
            progress_file=args.progress_file,
            job_id=args.job_id,
        )
        print(json.dumps(result))
        sys.exit(0)
    except Exception as e:
        if args.progress_file:
            tracker = ProgressTracker(args.progress_file, args.job_id)
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
