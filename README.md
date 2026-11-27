# 🎬 UGC Master — Creator Studio & MetaCleaner Pro

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.8%2B-3776ab?logo=python)](https://www.python.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-AIO%20Pipeline-007808?logo=ffmpeg)](https://ffmpeg.org/)
[![Docker](https://img.shields.io/badge/Docker-GHCR%20CI%2FCD-2496ed?logo=docker)](.github/workflows/docker-build.yml)

Platform produksi konten **UGC (*User Generated Content*)** berbasis AI sekaligus **Engine Sanitasi & Audit Forensik Video (MetaCleaner Pro)** untuk membuat storyboard yang mengikuti referensi produk, koreografi TikTok Dance, *motion control*, hingga membersihkan jejak metadata SEI, C2PA, dan anomali visual/audio video AI.

---

## 📑 Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Arsitektur & Tech Stack](#-arsitektur--tech-stack)
- [Endpoint API](#-endpoint-api)
- [Struktur Proyek](#-struktur-proyek)
- [Prasyarat Sistem](#-prasyarat-sistem)
- [Menjalankan Secara Lokal](#-menjalankan-secara-lokal)
- [Konfigurasi Environment Variables](#-konfigurasi-environment-variables)
- [Deployment](#-deployment)
  - [Docker & Docker Compose](#1-docker--docker-compose)
  - [VPS / VDS (Ubuntu + PM2 + Nginx)](#2-vps--vds-ubuntu--pm2--nginx)
  - [Google Cloud Run](#3-google-cloud-run)
  - [GitHub Actions CI/CD (GHCR)](#4-github-actions-cicd-ghcr)
- [Pemeliharaan & Auto-Clean Server](#-pemeliharaan--auto-clean-server)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Fitur Utama

### 1. UGC Creator Studio & Storyboard Generator
- **AI Storyboard Generator & Reference Tracking**: Menyusun storyboard *scene-by-scene* (hook, problem, demo produk, CTA, framing kamera, pencahayaan, dan audio) yang mengikuti referensi visual maupun brief produk.
- **Direct Link Extractor & Auto-Detect Product**: Mengekstrak informasi produk/referensi langsung dari tautan atau deskripsi (`DirectLinkExtractorBar`) untuk mengisi konteks generator secara otomatis.
- **TikTok Dance Studio & Motion Control**:
  - Generator storyboard khusus koreografi/dance TikTok (`TikTokDanceStudio`).
  - Analisis video referensi gerak untuk panduan kontrol gerakan & framing (`MotionControlPanel`).
- **Hook Generator, Scene Enhancer & Continuity Audit**:
  - Menghasilkan variasi *hook* pembuka video dengan retensi tinggi (`HookGeneratorModal`).
  - Menyempurnakan detail visual/dialog tiap scene (`SceneCard`) serta mengaudit konsistensi visual antar-scene.
- **Compliance Checker**: Deteksi kata/klaim berisiko pada naskah dan caption beserta saran pengganti yang aman.
- **Creator Utilities**:
  - *Drag-and-drop* urutan scene (`@dnd-kit`).
  - **Teleprompter Mode**, **Script Table View**, **Rate Card Calculator**, dan **Caption Generator**.
  - Ekspor ke JSON / Print / PDF (`ExportModal`) serta penyimpanan proyek otomatis di browser (*LocalStorage* + *IndexedDB*).

### 2. MetaCleaner Pro & Audit Forensik AI (AIO Engine)
- **Real-Time Deep-Scan Metadata SEI**: Progress bar langsung untuk memindai kontainer MP4 dan bitstream video secara mendalam sebelum & sesudah pembersihan.
- **Panel "Pemicu AI" (*AI Trigger Checklist*)**: Menampilkan elemen spesifik yang terdeteksi sebagai pemicu watermark/AI pada komponen *Audit Forensik & Log* (layer `SEI_NAL`, `C2PA_JUMBF`, `UUID_BOX`, `VENDOR_TAG`, dan `CONTAINER_MUXER`) lengkap dengan *offset hex*, *ASCII/hex preview*, alasan deteksi, serta langkah perbaikannya.
- **CSPRNG Bitstream Scrambler & Zero-SEI Scrubbing**: Mengacak payload tersembunyi (SynthID, SEI NAL Unit Type 6 pada H.264 dan Type 39/40 pada HEVC) serta atom provenance (`uuid`, `c2pa`, `jumb`, `udta`, `meta`, `XMP_`) sebelum tahap re-encoding.
- **Calibrated CMOS Sensor Grain Retention**:
  - Injeksi *micro-grain* CMOS (luma & chroma) ditempatkan pada tahap akhir filter ISP (setelah `colorbalance` dan `hue`), dipadukan dengan tuning `libx264` (`no-dct-decimate=1`, `no-fast-pskip=1`, `deadzone-inter=10`, `deadzone-intra=8`, `pbratio=1.20`) serta batas minimum bitrate VBV yang terkalibrasi.
  - Mempertahankan variasi piksel temporal alami pada latar belakang statis (`Static Delta >= 0.22`) sehingga bebas dari peringatan `[CONTAINER_MUXER] Latar Belakang Tanpa Sensor Grain CMOS (Ciri Diffusion/Over-Smooth)`.
- **0% Duplikat Cadence & 180° Shutter Blend**: Perbaikan duplikat frame pulldown (`mpdecimate`) ke 30fps CFR, *lens correction*, dan *shutter blend* organik.
- **Dual-Mic Stereo Room Air Audio**: Konversi audio mono/TTS menjadi stereo ruang alami dengan *high-band thermal mic air* (`>17kHz`) dan penghapusan jeda hening digital mutlak.
- **Physical MP4 Box Compaction**: Menghapus fisik atom `free`/`skip` serta menghitung ulang tabel offset `stco`/`co64` MP4 agar bersih dari jejak *stripping* metadata.

---

## 🛠️ Arsitektur & Tech Stack

| Lapisan | Teknologi |
|---|---|
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript 5, Tailwind CSS v4, Lucide Icons, Motion, `@dnd-kit` |
| **Backend & AI** | Next.js API Routes (`Node.js` runtime), `@google/genai` (server-side Gemini API) |
| **Media Pipeline** | Python 3 (`scripts/ffmpeg_cleaner.py`) sebagai engine utama + Node.js FFmpeg wrapper sebagai fallback |
| **Binary Tools** | `ffmpeg` & `ffprobe` (didukung `ffmpeg-static` & `ffprobe-static` maupun binary sistem) |
| **Container Parser** | `mp4box` + custom ISO-BMFF & H.264/HEVC NAL unit parser |

---

## 🔌 Endpoint API

| Endpoint | Fungsi |
|---|---|
| `POST /api/generate-storyboard` | Generate storyboard UGC utama dari brief & referensi |
| `POST /api/generate-dance-storyboard` | Generate storyboard koreografi TikTok Dance |
| `POST /api/analyze-motion-video` | Analisis video referensi untuk panduan *Motion Control* |
| `POST /api/auto-detect-product` | Ekstraksi & deteksi produk otomatis dari link/input |
| `POST /api/generate-hooks` | Generate variasi *hook* pembuka video |
| `POST /api/enhance-scene` | Sempurnakan narasi & arahan visual per scene |
| `POST /api/audit-continuity` | Audit konsistensi visual dan naratif antar-scene |
| `POST /api/generate-caption` | Generate caption & hashtag media sosial |
| `POST /api/meta-cleaner/upload` | Unggah video ke server untuk diproses MetaCleaner Pro |
| `POST /api/meta-cleaner` | Jalankan pipeline pembersihan & sanitasi video |
| `GET /api/meta-cleaner/progress` | Polling progres encoding & deep-scan secara real-time |
| `POST /api/meta-cleaner/probe` | Audit forensik bitstream, SEI, container, & visual/audio |
| `GET/DELETE /api/meta-cleaner/download` | Unduh video bersih & sweep file *dormant* di `/tmp` |
| `GET /api/health` | Health check server (`200 OK`) |

---

## 📁 Struktur Proyek

```text
├── app/
│   ├── api/                  # Seluruh endpoint AI & MetaCleaner Pro
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/               # UI Studio, MetaCleanerPro, SceneCard, Teleprompter, ExportModal, dll.
├── lib/                      # Gemini client, video-probe, bitstream-scrambler, progress tracker
├── scripts/
│   ├── ffmpeg_cleaner.py     # Cloud Python FFmpeg Anti-AI & Zero-SEI pipeline
│   └── prepare-standalone.js # Post-build helper untuk Next.js standalone output
├── utils/                    # Compliance checker & storage helpers (LocalStorage/IndexedDB)
├── .github/workflows/
│   └── docker-build.yml      # GitHub Actions CI/CD build & push ke GHCR
├── Dockerfile                # Multi-stage Docker (Node 20 + Python 3 + FFmpeg)
├── docker-compose.yml        # Konfigurasi compose siap produksi
├── server.js                 # Server entry point production
└── .env.example              # Template environment variables
```

---

## 💻 Prasyarat Sistem

- **OS**: Linux (Ubuntu 20.04/22.04/24.04 LTS direkomendasikan), macOS, atau Windows (WSL2)
- **Node.js**: v20.x LTS atau lebih baru
- **Python**: v3.8+ (untuk menjalankan `scripts/ffmpeg_cleaner.py`)
- **FFmpeg & FFprobe**: v5.x / v6.x / v7.x
- **Resource Disarankan**: Minimal **2 vCPU** dan **4 GB RAM** (untuk encoding video 1080p)

---

## 🚀 Menjalankan Secara Lokal

1. **Clone repositori**
   ```bash
   git clone https://github.com/USERNAME/REPO_NAME.git
   cd REPO_NAME
   ```

2. **Install dependensi**
   ```bash
   npm install
   ```

3. **Siapkan environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Isi `GEMINI_API_KEY` dan `APP_URL` di `.env.local`:
   ```env
   GEMINI_API_KEY="AIzaSy..."
   APP_URL="http://localhost:3000"
   ```

4. **Jalankan server development**
   ```bash
   npm run dev
   ```
   Akses aplikasi di `http://localhost:3000`.

5. **Lint & build production**
   ```bash
   npm run lint
   npm run build
   npm run start
   ```

---

## 🔐 Konfigurasi Environment Variables

| Variabel | Wajib | Keterangan |
|---|---|---|
| `GEMINI_API_KEY` | Ya | API Key Google Gemini (hanya diakses di server-side API Routes). |
| `APP_URL` | Ya | URL publik aplikasi (contoh: `http://localhost:3000` atau domain produksi). |
| `PORT` | Tidak | Port HTTP server (default: `3000`). |
| `HOSTNAME` | Tidak | Host binding (default: `0.0.0.0`). |
| `FFMPEG_BIN` | Tidak | Path manual ke binary `ffmpeg` jika ingin override binary bawaan. |
| `FFPROBE_BIN` | Tidak | Path manual ke binary `ffprobe` jika ingin override binary bawaan. |

> ⚠️ **Keamanan**: Jangan pernah memberi prefiks `NEXT_PUBLIC_` pada `GEMINI_API_KEY` dan pastikan file `.env` / `.env.local` tidak ikut ter-commit ke GitHub.

---

## 🌐 Deployment

### 1. Docker & Docker Compose

```bash
cp .env.example .env
# Edit .env lalu isi GEMINI_API_KEY & APP_URL

docker compose up -d --build
docker compose logs -f
```

### 2. VPS / VDS (Ubuntu + PM2 + Nginx)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential python3 ffmpeg nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

npm install
npm run build
pm2 start server.js --name "ugc-master"
pm2 save
```

Pastikan blok Nginx mengizinkan ukuran upload video besar dan timeout encoding panjang:

```nginx
server {
    listen 80;
    server_name domain-anda.com;

    client_max_body_size 500M;
    client_body_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

### 3. Google Cloud Run

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/ugc-master:latest
gcloud run deploy ugc-master \
  --image gcr.io/PROJECT_ID/ugc-master:latest \
  --platform managed \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --timeout 600 \
  --set-env-vars GEMINI_API_KEY="AIzaSy...",APP_URL="https://URL_CLOUD_RUN_ANDA"
```

### 4. GitHub Actions CI/CD (GHCR)

File `.github/workflows/docker-build.yml` otomatis membangun Docker image (`linux/amd64`) dan melakukan push ke `ghcr.io/<username>/<repo>` saat ada *push* ke branch `main`/`master` atau tag semver (`v*.*.*`).

---

## 🧹 Pemeliharaan & Auto-Clean Server

- **Auto-Clean TTL (5 Menit)**: Video input/output sementara di `/tmp` dihapus otomatis setelah TTL berakhir.
- **Background Sweeper**: Membersihkan file *dormant/orphan* di server secara berkala.
- **Sweep Manual via HTTP**:
  ```bash
  curl -X DELETE "http://127.0.0.1:3000/api/meta-cleaner/download?sweep=dormant"
  ```

---

## 🛟 Troubleshooting

- **HTTP 413 (`Payload Too Large`)**: Pastikan `client_max_body_size 500M;` sudah dipasang di konfigurasi Nginx.
- **Health Check**: Jalankan `curl -I http://127.0.0.1:3000/api/health` (harus mengembalikan `200 OK`).
- **OOM saat render 1080p**: Gunakan minimal 4 GB RAM atau aktifkan *swap file* di VPS.
