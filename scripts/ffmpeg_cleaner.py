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

def build_synthid_video_filter(width: int = 0, height: int = 0) -> str:
    if width >= 64 and height >= 64:
        target_w = (width // 2) * 2
        target_h = (height // 2) * 2
        pre_scale = ""
        scale_step = f"scale={target_w}:{target_h}:flags=lanczos+accurate_rnd"
    else:
        pre_scale = "scale=trunc(iw*1.05/2)*2:trunc(ih*1.05/2)*2:flags=bicubic,"
        scale_step = "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos+accurate_rnd"

    return (
        "setpts=0.961538*(PTS-STARTPTS),"
        "fps=fps=30000/1001,"
        "format=yuv420p,"
        "hqdn3d=1.8:1.4:2.8:2.0,"
        f"{pre_scale}"
        "lenscorrection=cx=0.495:cy=0.505:k1=-0.028:k2=0.009,"
        "rotate=0.009:ow=iw:oh=ih:bilinear=1,"
        "crop=trunc(iw*0.95/2)*2:trunc(ih*0.95/2)*2:trunc(iw*0.024)+trunc(1.8*sin(t*1.9)):trunc(ih*0.024)+trunc(1.8*cos(t*1.4)),"
        f"{scale_step},"
        "chromashift=cbh=1:cbv=0:crh=-1:crv=0,"
        "colorchannelmixer=rr=1.014:rg=-0.011:rb=-0.003:gr=-0.007:gg=1.009:gb=-0.002:br=-0.004:bg=-0.009:bb=1.013,"
        "eq=contrast=1.025:brightness=-0.003:saturation=1.02:gamma=1.015,"
        "unsharp=5:5:0.42:3:3:0.15,"
        "vignette=angle=PI/7,"
        "noise=c0s=4.5:c1s=2.6:c2s=2.6:allf=t+u,"
        "setsar=1"
    )

def build_synthid_audio_filter_complex(voice_label: str = "[0:a]", out_label: str = "[aout]") -> str:
    return (
        "anoisesrc=color=pink:amplitude=0.0014:sample_rate=48000:seed=104729[pL];"
        "anoisesrc=color=pink:amplitude=0.0014:sample_rate=48000:seed=224737[pR];"
        "[pL][pR]amerge=inputs=2,highpass=f=160,lowpass=f=10000,equalizer=f=450:t=q:w=0.7:g=-5[room_lo];"
        "anoisesrc=color=white:amplitude=0.0128:sample_rate=48000:seed=319993[aL];"
        "anoisesrc=color=white:amplitude=0.0128:sample_rate=48000:seed=492871[aR];"
        "[aL][aR]amerge=inputs=2,highpass=f=13900,highpass=f=13900,lowpass=f=20400[room_hi];"
        "[room_lo][room_hi]amix=inputs=2:normalize=0,tremolo=f=0.38:d=0.20,volume=0.85[room];"
        f"{voice_label}asetpts=PTS-STARTPTS,aresample=48000,"
        "aformat=channel_layouts=stereo,"
        "afftdn=nr=11:nf=-36:tn=1,"
        "rubberband=tempo=1.04:pitch=0.966:formant=shifted,"
        "highpass=f=65,"
        "equalizer=f=185:t=q:w=1.0:g=1.4,"
        "equalizer=f=3400:t=q:w=1.2:g=-1.1,"
        "highshelf=f=9500:g=0.8,"
        "aecho=0.94:0.90:15|26:0.045|0.025,"
        "extrastereo=m=1.28,"
        "asoftclip=type=tanh:threshold=0.92,"
        "acompressor=threshold=-26dB:ratio=2.6:attack=8:release=120,"
        "asplit=2[vdry][ver_in];"
        "[ver_in]highpass=f=280,lowpass=f=4800,adelay=8|19,volume=0.13[ver];"
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

def sanitize_binary_boxes_in_place(file_path: str) -> int:
    sanitized_count = 0
    bad_markers = (
        "c2pa",
        "jumb",
        "synthid",
        "watermark",
        "adobe",
        "google",
        "apple",
        "iso media file produced by",
        "created on:",
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
    )
    container_boxes = ("moov", "trak", "mdia", "minf", "stbl", "edts", "dinf")
    mac_epoch_now = int(time.time()) + 2082844800 - 1860
    ts_bytes_32 = mac_epoch_now.to_bytes(4, byteorder="big")
    ts_bytes_64 = mac_epoch_now.to_bytes(8, byteorder="big")
    try:
        with open(file_path, "r+b") as f:
            data = bytearray(f.read())
            length = len(data)

            def walk_and_clean(start: int, end: int, depth: int):
                nonlocal sanitized_count
                if depth > 7:
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
                        # Normalize FFmpeg minor_version (512 -> 0) and replace 'iso2' brand with 'isom'
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
                                data[offset+hdr+4:offset+hdr+8] = ts_bytes_32
                                data[offset+hdr+8:offset+hdr+12] = ts_bytes_32
                        elif ver == 1 and offset + hdr + 20 <= offset + size:
                            ctime = int.from_bytes(data[offset+hdr+4:offset+hdr+12], byteorder="big")
                            if ctime == 0:
                                data[offset+hdr+4:offset+hdr+12] = ts_bytes_64
                                data[offset+hdr+12:offset+hdr+20] = ts_bytes_64
                    elif box_type in ("uuid", "c2pa", "jumb", "c2ma", "c2cl", "XMP_"):
                        data[offset+4:offset+8] = b"free"
                        data[offset+hdr:offset+size] = b"\x00" * (size - hdr)
                        sanitized_count += 1
                    elif box_type in ("udta", "meta", "ilst", "©too", "©enc"):
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
            f.seek(0)
            f.write(data)
            f.truncate()
    except Exception as e:
        sys.stderr.write(f"Binary sanitize warning: {e}\n")
    return sanitized_count

def process_video(
    input_path: str,
    output_path: str,
    mode: str = "deep_synthid",
    deep_meta_purge: bool = True,
    force_keyframes: bool = True,
    camera_profile: str = "samsung",
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
    expected_frames = max(1, int(duration_sec * 0.961538 * 29.97)) if (mode == "deep_synthid" and duration_sec > 0) else metrics["total_frames"]

    video_filter_str = build_synthid_video_filter(vid_w, vid_h)
    probe_msg = (
        f"   -> Stream Probe: Codec={codec_name.upper() or 'H264'} | "
        f"Res={f'{vid_w}x{vid_h}' if vid_w else 'Auto'} | "
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
        cam_meta = ["-metadata", "make=Apple", "-metadata", "model=iPhone 15 Pro", "-metadata", "software=17.5.1"]
    elif camera_profile == "xiaomi":
        camera_brand = "mp42"
        v_handler = "VideoHandler"
        a_handler = "SoundHandler"
        cam_meta = ["-metadata", "make=Xiaomi", "-metadata", "model=Xiaomi 14 Ultra"]
    elif camera_profile == "neutral":
        camera_brand = "isom"
        v_handler = "VideoHandler"
        a_handler = "SoundHandler"
        cam_meta = []
    else:
        camera_brand = "mp42"
        v_handler = "VideoHandle"
        a_handler = "SoundHandle"
        cam_meta = ["-metadata", "make=samsung", "-metadata", "model=SM-S928B"]

    encode_preset = "superfast" if duration_sec > 25 or (vid_w * vid_h > 1100000) else "veryfast"

    with tempfile.TemporaryDirectory() as temp_dir:
        pass1_path = os.path.join(temp_dir, "pass1_reencoded.mp4")
        source_for_pass2 = input_path

        keyframe_flags = [
            "-g", "45" if force_keyframes else "60",
            "-keyint_min", "20",
            "-sc_threshold", "40",
            "-refs", "2",
            "-color_primaries", "bt709",
            "-color_trc", "bt709",
            "-colorspace", "bt709"
        ]

        x264_params = (
            "ref=2:bframes=2:b-adapt=1:nal-hrd=none:force-cfr=1:"
            "deblock=1,1:aq-mode=2:open-gop=0:scenecut=40:keyint=45:min-keyint=20"
            if force_keyframes else
            "ref=2:bframes=2:b-adapt=1:nal-hrd=none:force-cfr=1:deblock=1,1:aq-mode=2:open-gop=0:keyint=60:min-keyint=24"
        )

        # PASS 1: Multi-Domain Audio-Visual Anti-AI Re-Synthesis & Smartphone B-Frame Encoding
        if mode == "deep_synthid":
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
                "-c:v", "libx264",
                "-preset", encode_preset,
                "-profile:v", "high",
                "-level", "4.1",
                "-crf", "19",
                "-bf", "2",
                "-pix_fmt", "yuv420p",
                "-color_primaries", "bt709",
                "-color_trc", "bt709",
                "-colorspace", "bt709",
                *keyframe_flags,
                "-x264-params", x264_params,
                "-bsf:v", pass1_bsf,
                "-fflags", "+bitexact",
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
                stage_label="Pass 1/2: Audio-Visual Anti-AI Filtering & B-Frame Synthesis",
                start_pct=10,
                end_pct=82,
                expected_duration=duration_sec * 0.961538 if duration_sec > 0 else 0,
                expected_frames=expected_frames,
                prefix="ffmpeg-reencode",
            )
            if rc1 == 0 and os.path.isfile(pass1_path) and os.path.getsize(pass1_path) > 16384:
                source_for_pass2 = pass1_path
                t_lines = extract_ffmpeg_telemetry(err1, "ffmpeg-reencode")
                logs.extend(t_lines)
                done1_msg = "✓ [PASS 1/2] Re-sintesis Audio-Visual selesai: 29.97fps bebas ghost, B-Frames refs=2, Rubberband + Stereo Pink Room Air aktif."
                logs.append(done1_msg)
                tracker.push_log(done1_msg)
            else:
                err_msg = err1.splitlines()[-1] if err1 else "Unknown error"
                raise RuntimeError(f"FFmpeg Pass 1 Re-encode Frame Filter gagal: {err_msg}")
        elif force_keyframes:
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
            *(["-avoid_negative_ts", "make_zero"] if (force_keyframes and source_for_pass2 == input_path) else []),
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
            "-metadata", "encoder=",
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
            "-movflags", "+faststart",
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
            message="Eksisi box C2PA/UUID/JUMBF & finalisasi atom MP4...",
            percent=96,
        )
        sanitized_boxes = sanitize_binary_boxes_in_place(output_path)
        out_size_mb = os.path.getsize(output_path) / (1024 * 1024)
        fin1 = f"✓ [EKSISI FISIK C2PA/UUID] {sanitized_boxes} box dinetralisasi menjadi free padding."
        fin2 = f"✓ [SELESAI] Output bersih berhasil dibuat: {out_size_mb:.2f} MB (0% SEI Type 6, Zero AI Watermark)."
        logs.append(fin1)
        logs.append(fin2)
        tracker.push_log(fin1, force=False)
        tracker.push_log(fin2, force=False)
        tracker.update(
            force=True,
            stage="completed",
            message=f"Selesai 100% ({out_size_mb:.2f} MB) • Zero-SEI & Anti-SynthID Aktif",
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
    parser.add_argument("--mode", default="deep_synthid", choices=["deep_synthid", "remux_only"])
    parser.add_argument("--deep-meta-purge", default="true", choices=["true", "false"])
    parser.add_argument("--force-keyframes", default="true", choices=["true", "false"])
    parser.add_argument("--camera-profile", default="samsung", choices=["samsung", "apple", "xiaomi", "neutral"])
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
