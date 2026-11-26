UGC Master — Creator Studio & MetaCleaner AIO

Version 2.5 | Anti-AI Engine
Complete Project Documentation & Deployment Guide

Platform terpadu untuk pembuatan konten video UGC (User Generated Content) dan pemrosesan metadata video melalui MetaCleaner AIO.

Dokumentasi ini mencakup instalasi, konfigurasi, deployment, otomatisasi build, dan pemeliharaan aplikasi pada berbagai lingkungan:

- Local Development
- VPS / VDS (Ubuntu / Debian)
- Docker & Docker Compose
- Google Cloud Platform (Cloud Run & Compute Engine)
- GitHub Actions CI/CD

---

Table of Contents

1. "Project Overview" (#1-project-overview)
2. "Main Features" (#2-main-features)
3. "System Requirements" (#3-system-requirements)
4. "Local Development" (#4-local-development)
5. "VPS / VDS Deployment" (#5-vps--vds-deployment)
6. "Docker Deployment" (#6-docker-deployment)
7. "Google Cloud Deployment" (#7-google-cloud-deployment)
8. "GitHub Actions CI/CD" (#8-github-actions-cicd)
9. "Environment Variables" (#9-environment-variables)
10. "Maintenance & Auto-Cleaner" (#10-maintenance--auto-cleaner)
11. "Troubleshooting" (#11-troubleshooting)
12. "Security Recommendations" (#12-security-recommendations)

---

1. Project Overview

UGC Master — Creator Studio & MetaCleaner AIO merupakan platform yang mengintegrasikan dua sistem utama:

1. UGC Creator Studio: Sistem pembuatan konten video UGC berbasis AI.
2. MetaCleaner AIO: Sistem pemrosesan video dan sanitasi metadata dengan pendekatan forensik.

Aplikasi dirancang untuk membantu proses produksi konten video, mulai dari pembuatan ide, penulisan naskah, penyusunan storyboard, hingga pemrosesan file video.

Technology Stack

Komponen| Teknologi
Runtime| Node.js 20+
AI Integration| Google Gemini AI
Video Processing| FFmpeg & FFprobe
Backend Processing| Python 3
Process Manager| PM2
Reverse Proxy| Nginx
Containerization| Docker
CI/CD| GitHub Actions
Container Registry| GitHub Container Registry

---

2. Main Features

2.1 UGC Creator Studio

Fitur untuk membantu produksi konten video UGC:

- AI-powered video script generator menggunakan Google Gemini.
- Automatic scene-by-scene storyboard generation.
- Teleprompter untuk membantu proses perekaman.
- Visual hook management.
- Content creation workflow.

2.2 MetaCleaner AIO — Anti-AI Engine V2.5

MetaCleaner AIO dilengkapi sejumlah modul pemrosesan video dan audio.

1. CSPRNG Bitstream Scrambler

Modul pengacakan payload tertentu yang berkaitan dengan:

- SynthID.
- NAL SEI unregistered messages.
- C2PA / JUMBF / UUID provenance atoms.

2. Duplicate Frame Detection & Pulldown Repair

Pemrosesan duplikasi frame menggunakan:

- "mpdecimate".
- Frame duplicate detection.
- 30 FPS Constant Frame Rate (CFR) synthesis.
- Motion-aware frame processing.

3. Organic Visual Camera Engine

Simulasi karakteristik visual kamera melalui:

- CMOS Bayer sensor grain.
- 180-degree shutter blend.
- Barrel lens distortion.
- ISP CAS sharpening.

4. Dual-Mic Stereo Room Reflection

Pemrosesan audio yang mencakup:

- High-frequency audio processing di atas 17 kHz.
- Stereo room reflection simulation.
- Pengolahan jeda hening digital.

5. Zero-Tombstone Physical Box Compaction

Pemrosesan struktur kontainer MP4 yang mencakup:

- Pemeriksaan atom "free" dan "skip".
- Rekonstruksi tabel offset "stco" dan "co64".
- Pemrosesan struktur MP4 setelah proses encoding.

6. Granular Streaming Progress

Sistem telemetry pemrosesan dengan:

- Real-time frame-by-frame progress.
- Granular processing updates.
- Progress reporting yang lebih konsisten.

«Catatan: Nama modul dan deskripsi teknis di atas mengikuti spesifikasi proyek. Efektivitas penghapusan watermark, identifikasi AI, provenance, atau atribusi konten tidak dijamin. Proses pengubahan metadata juga tidak membuktikan bahwa suatu video dibuat oleh kamera fisik atau manusia.»

---

3. System Requirements

3.1 Supported Operating Systems

- Ubuntu 20.04 / 22.04 / 24.04 LTS.
- Debian.
- macOS.
- Windows melalui WSL2.

3.2 Software Requirements

Komponen| Minimum| Rekomendasi
Node.js| 20.x| 20 LTS atau lebih baru
Python| 3.8+| Versi stabil terbaru yang kompatibel
FFmpeg| 5.x| 6.x / 7.x
FFprobe| 5.x| 6.x / 7.x
RAM| 2 GB| 4–8 GB
CPU| 2 vCPU| 4 vCPU
Storage| 10 GB| 20 GB atau lebih

Catatan: Kebutuhan resource dapat meningkat bergantung pada resolusi, durasi video, jumlah proses encoding, dan penggunaan concurrent users.

---

4. Local Development

Step 1 — Clone Repository

git clone https://github.com/Cerminsiji/UGC-Master-v2.git

cd UGC-Master-v2

Step 2 — Install Dependencies

npm install

Step 3 — Configure Environment

Salin template environment:

cp .env.example .env.local

Edit file ".env.local":

GEMINI_API_KEY=YOUR_GEMINI_API_KEY
APP_URL=http://localhost:3000
PORT=3000

Ganti "YOUR_GEMINI_API_KEY" dengan API Key Google AI Studio milik Anda.

Step 4 — Start Development Server

npm run dev

Step 5 — Access Application

Buka browser:

http://localhost:3000

---

5. VPS / VDS Deployment

Panduan deployment menggunakan Ubuntu / Debian dengan kombinasi:

- Node.js.
- PM2.
- Nginx.
- Certbot SSL.

Metode ini cocok untuk VPS dari DigitalOcean, Linode, Contabo, Hetzner, Vultr, dan AWS EC2.

5.1 Update Server

sudo apt update && sudo apt upgrade -y

Install dependensi:

sudo apt install -y \
  curl \
  git \
  build-essential \
  python3 \
  python3-pip \
  ffmpeg \
  nginx

5.2 Install Node.js 20

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

sudo apt install -y nodejs

Verifikasi instalasi:

node -v
npm -v
python3 -V
ffmpeg -version
ffprobe -version

5.3 Install PM2

sudo npm install -g pm2

5.4 Clone Project

Buat direktori aplikasi:

sudo mkdir -p /var/www/ugc-studio

sudo chown -R $USER:$USER /var/www/ugc-studio

cd /var/www/ugc-studio

Clone repository:

git clone https://github.com/Cerminsiji/UGC-Master-v2.git .

5.5 Install Dependencies

npm install

5.6 Configure Production Environment

Buat file ".env":

nano .env

Isi konfigurasi:

NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

GEMINI_API_KEY=YOUR_GEMINI_API_KEY
APP_URL=https://domain-anda.com

5.7 Build Application

npm run build

Pastikan proses build berhasil sebelum menjalankan aplikasi.

5.8 Start Application with PM2

Jika aplikasi memang menggunakan "server.js" sebagai entry point:

pm2 start server.js --name ugc-studio -i max

Simpan konfigurasi proses:

pm2 save
pm2 startup

Jalankan perintah tambahan yang ditampilkan oleh PM2 untuk mengaktifkan startup otomatis.

Monitoring:

pm2 status
pm2 logs ugc-studio
pm2 monit

«Catatan: Mode cluster "-i max" perlu diuji kompatibilitasnya dengan sistem pemrosesan file, temporary storage, dan background jobs aplikasi. Gunakan satu instance jika belum dipastikan aman untuk multi-process.»

5.9 Configure Nginx Reverse Proxy

Buat konfigurasi:

sudo nano /etc/nginx/sites-available/ugc-studio

Masukkan konfigurasi:

server {
    listen 80;
    server_name domain-anda.com www.domain-anda.com;

    client_max_body_size 500M;
    client_body_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:3000;

        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;

        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}

Aktifkan konfigurasi:

sudo ln -s /etc/nginx/sites-available/ugc-studio \
/etc/nginx/sites-enabled/

Periksa konfigurasi:

sudo nginx -t

Restart Nginx:

sudo systemctl restart nginx

5.10 Install Free SSL Certificate

Install Certbot:

sudo apt install -y certbot python3-certbot-nginx

Generate SSL:

sudo certbot --nginx \
  -d domain-anda.com \
  -d www.domain-anda.com

Setelah berhasil, aplikasi dapat diakses melalui:

https://domain-anda.com

Pastikan DNS domain sudah mengarah ke IP server sebelum menjalankan Certbot.

---

6. Docker Deployment

Docker memungkinkan aplikasi dijalankan dalam lingkungan container yang konsisten.

6.1 Install Docker

Untuk Ubuntu / Debian:

curl -fsSL https://get.docker.com -o get-docker.sh

sudo sh get-docker.sh

Install Docker Compose plugin:

sudo apt install -y docker-compose-plugin

Verifikasi:

docker --version
docker compose version

6.2 Option A — Docker Compose (Recommended)

Pastikan repository memiliki file:

Dockerfile
docker-compose.yml

Siapkan file ".env":

GEMINI_API_KEY=YOUR_GEMINI_API_KEY
APP_URL=https://domain-anda.com
PORT=3000

Build dan jalankan container:

docker compose up -d --build

Periksa status:

docker compose ps

Lihat log:

docker compose logs -f

Restart aplikasi:

docker compose restart

Stop aplikasi:

docker compose down

Update aplikasi:

git pull

docker compose up -d --build

6.3 Option B — Manual Docker Build

Build image:

docker build -t ugc-master-app:latest .

Jalankan container:

docker run -d \
  --name ugc-master-cleaner \
  -p 3000:3000 \
  --env-file .env \
  -v /tmp:/tmp \
  --restart unless-stopped \
  ugc-master-app:latest

Monitoring:

docker ps
docker logs -f ugc-master-cleaner

Stop container:

docker stop ugc-master-cleaner

Hapus container:

docker rm ugc-master-cleaner

«Pastikan direktori temporary yang digunakan aplikasi memiliki izin akses dan kebijakan cleanup yang aman. Hindari mount seluruh "/tmp" host jika tidak diperlukan.»

---

7. Google Cloud Deployment

Tersedia dua opsi deployment menggunakan Google Cloud Platform.

7.1 Option A — Google Cloud Run

Google Cloud Run merupakan layanan serverless container dengan kemampuan auto-scaling.

Step 1 — Install Google Cloud SDK

Login:

gcloud auth login

Pilih project:

gcloud config set project ID_PROJECT_GCP_ANDA

Step 2 — Build Container Image

gcloud builds submit \
  --tag gcr.io/ID_PROJECT_GCP_ANDA/ugc-master:latest

«Untuk deployment baru, disarankan menggunakan Artifact Registry sebagai pengganti Container Registry lama. Sesuaikan nama image dan lokasi repository dengan konfigurasi registry yang digunakan.»

Step 3 — Deploy to Cloud Run

Contoh deployment:

gcloud run deploy ugc-master \
  --image gcr.io/ID_PROJECT_GCP_ANDA/ugc-master:latest \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --timeout 600 \
  --set-env-vars APP_URL=https://URL_CLOUD_RUN_ANDA

Untuk API Key, gunakan Secret Manager dan konfigurasi secret sebagai environment variable, bukan memasukkan credential langsung ke command deployment.

Recommended Configuration

Resource| Recommendation
CPU| 2 vCPU
Memory| 4 GiB
Timeout| 600 seconds
Region| asia-southeast1
Scaling| Sesuaikan kebutuhan aplikasi

Cloud Run Considerations

- Perhatikan batas ukuran request dan upload.
- Perhatikan batas waktu request.
- Cloud Run menggunakan filesystem container yang bersifat ephemeral.
- File sementara harus dikelola dengan benar.
- Gunakan Cloud Storage jika membutuhkan penyimpanan file persisten.
- Proses encoding panjang mungkin lebih sesuai menggunakan Cloud Run Jobs atau Compute Engine.

7.2 Option B — Google Compute Engine

Compute Engine menyediakan VM dengan kontrol server lebih fleksibel.

Step 1 — Create VM Instance

Buka:

Google Cloud Console
→ Compute Engine
→ VM Instances
→ Create Instance

Rekomendasi konfigurasi:

Komponen| Konfigurasi
Machine Type| e2-standard-2
CPU| 2 vCPU
RAM| 8 GB
Operating System| Ubuntu 22.04 LTS
Boot Disk| Minimal 25 GB SSD
Firewall| Allow HTTP & HTTPS

Step 2 — Connect to VM

Klik tombol SSH pada VM instance.

Step 3 — Deploy Application

Ikuti seluruh instruksi pada:

"Section 5 — VPS / VDS Deployment" (#5-vps--vds-deployment)

---

8. GitHub Actions CI/CD

Repository menggunakan workflow otomatis untuk membangun Docker image.

Lokasi workflow:

.github/workflows/docker-build.yml

8.1 Workflow Overview

Workflow dirancang untuk berjalan ketika:

- Terjadi "git push" ke branch "main".
- Terjadi "git push" ke branch "master".
- Dibuat release tag seperti "v1.0.0".

Proses otomatis:

1. GitHub Actions menjalankan Ubuntu runner.
2. Menyiapkan environment build.
3. Membangun Docker image.
4. Menyiapkan runtime Node.js, Python, dan FFmpeg sesuai Dockerfile.
5. Mengunggah image ke GitHub Container Registry.

Target image:

ghcr.io/cerminsiji/ugc-master-v2:latest

«Nama image dan tag aktual mengikuti konfigurasi workflow. Pastikan "docker-build.yml" benar-benar menggunakan GHCR dan memiliki permission "packages: write".»

8.2 Deploy Image to VPS

Login ke GitHub Container Registry:

echo "GITHUB_PERSONAL_ACCESS_TOKEN" | \
docker login ghcr.io \
-u GITHUB_USERNAME \
--password-stdin

Tarik image:

docker pull ghcr.io/cerminsiji/ugc-master-v2:latest

Jalankan aplikasi:

docker run -d \
  --name ugc-master \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  ghcr.io/cerminsiji/ugc-master-v2:latest

Untuk image private, gunakan token dengan permission minimum yang diperlukan, misalnya "read:packages".

8.3 Update Deployment

Setelah workflow berhasil membangun image terbaru:

docker pull ghcr.io/cerminsiji/ugc-master-v2:latest

docker stop ugc-master

docker rm ugc-master

docker run -d \
  --name ugc-master \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  ghcr.io/cerminsiji/ugc-master-v2:latest

Untuk production, pertimbangkan menggunakan immutable image tags berdasarkan commit SHA agar versi deployment dapat dilacak dan di-rollback.

---

9. Environment Variables

Konfigurasi environment aplikasi.

Variable| Required| Default| Description
"GEMINI_API_KEY"| Ya| -| Google Gemini API Key
"APP_URL"| Ya| -| URL publik aplikasi
"PORT"| Tidak| "3000"| HTTP server port
"HOSTNAME"| Tidak| "0.0.0.0"| Host binding
"FFMPEG_BIN"| Tidak| Auto-detect| Custom FFmpeg binary path
"FFPROBE_BIN"| Tidak| Auto-detect| Custom FFprobe binary path

Example .env

NODE_ENV=production

PORT=3000
HOSTNAME=0.0.0.0

GEMINI_API_KEY=YOUR_GEMINI_API_KEY

APP_URL=https://domain-anda.com

# Optional
FFMPEG_BIN=/usr/bin/ffmpeg
FFPROBE_BIN=/usr/bin/ffprobe

Important:

- Jangan commit file ".env" ke repository publik.
- Pastikan ".env" masuk ke ".gitignore".
- Gunakan GitHub Secrets untuk kebutuhan CI/CD.
- Gunakan Secret Manager untuk deployment Google Cloud.
- Jangan pernah menampilkan API Key pada frontend atau log aplikasi.

---

10. Maintenance & Auto-Cleaner

10.1 Automatic Temporary File Cleanup

Aplikasi memiliki mekanisme pembersihan file sementara berdasarkan spesifikasi proyek:

Parameter| Konfigurasi
Temporary File TTL| 5 menit
Background Sweeper| Setiap 120 detik
Target| Orphan / dormant temporary files
Manual Cleanup| Audit Forensik & Log

Mekanisme ini dirancang untuk mengurangi penumpukan file temporary akibat upload dan pemrosesan video.

10.2 Manual Cleanup

Pembersihan dapat dilakukan melalui panel aplikasi:

Audit Forensik & Log
→ Bersihkan Server

Atau menggunakan HTTP endpoint:

curl -X DELETE \
"http://127.0.0.1:3000/api/meta-cleaner/download?sweep=dormant"

Pastikan endpoint cleanup memiliki autentikasi dan otorisasi yang sesuai sebelum diekspos ke jaringan publik.

10.3 PM2 Monitoring

pm2 status

pm2 logs ugc-studio

pm2 monit

10.4 Docker Monitoring

docker ps

docker stats

docker logs -f ugc-master

10.5 Nginx Monitoring

sudo systemctl status nginx

sudo tail -f /var/log/nginx/access.log

sudo tail -f /var/log/nginx/error.log

---

11. Troubleshooting

11.1 HTTP 413 — Payload Too Large

Problem:

Upload video gagal karena ukuran file melebihi batas request.

Solution:

Periksa konfigurasi Nginx:

client_max_body_size 500M;

Validasi:

sudo nginx -t

sudo systemctl reload nginx

Pastikan batas upload pada aplikasi dan reverse proxy juga konsisten.

11.2 FFmpeg Not Found

Problem:

Aplikasi tidak dapat menemukan binary FFmpeg.

Solution:

Install FFmpeg:

sudo apt install -y ffmpeg

Periksa:

which ffmpeg

which ffprobe

ffmpeg -version

Jika menggunakan binary custom, atur:

FFMPEG_BIN=/usr/bin/ffmpeg
FFPROBE_BIN=/usr/bin/ffprobe

11.3 Memory / OOM During Encoding

Problem:

Proses encoding video 4K atau video berdurasi panjang gagal akibat keterbatasan RAM.

Solution:

Periksa penggunaan memori:

free -h

htop

Contoh menambahkan swap 4 GB:

sudo fallocate -l 4G /swapfile

sudo chmod 600 /swapfile

sudo mkswap /swapfile

sudo swapon /swapfile

Verifikasi:

swapon --show

free -h

Untuk membuat swap aktif otomatis setelah reboot, tambahkan entri berikut ke "/etc/fstab" setelah memastikan belum ada entri yang sama:

/swapfile none swap sw 0 0

Swap membantu mengurangi risiko OOM, tetapi tidak menggantikan kebutuhan RAM yang memadai.

11.4 Application Not Accessible

Periksa status aplikasi:

pm2 status

Periksa port:

sudo ss -tulpn | grep 3000

Periksa log:

pm2 logs ugc-studio

Periksa Nginx:

sudo nginx -t

sudo systemctl status nginx

11.5 API Key Error

Periksa:

- API Key sudah benar.
- Environment variable sudah dimuat.
- API Key memiliki akses ke layanan Gemini yang digunakan.
- Quota dan billing API sesuai kebutuhan.
- Server sudah direstart setelah perubahan ".env".

11.6 Health Check

Jalankan:

curl -i http://127.0.0.1:3000/api/health

Respons yang diharapkan:

HTTP/1.1 200 OK

Body response harus mengikuti format health check yang diimplementasikan aplikasi.

---

12. Security Recommendations

Untuk deployment production, terapkan praktik keamanan berikut:

1. API Key Protection — Simpan API Key di environment variables atau secret manager.
2. HTTPS Enforcement — Gunakan SSL/TLS untuk seluruh akses publik.
3. Upload Validation — Validasi tipe file, ukuran, dan konten video yang diunggah.
4. Access Control — Lindungi endpoint administratif dan endpoint cleanup.
5. Temporary Storage — Gunakan direktori khusus dengan permission terbatas.
6. Resource Limits — Batasi CPU, RAM, dan jumlah proses encoding.
7. Container Security — Jalankan container dengan hak akses minimum.
8. Dependency Updates — Perbarui dependency Node.js dan Python secara berkala.
9. Logging — Hindari mencatat API Key, token, atau informasi sensitif ke log.
10. Backup & Recovery — Siapkan strategi backup konfigurasi dan rollback deployment.

---

Project Repository

GitHub:
https://github.com/Cerminsiji/UGC-Master-v2

Container Registry:
https://github.com/Cerminsiji/UGC-Master-v2/pkgs/container/ugc-master-v2

---

Documentation Information

Item| Details
Project| UGC Master — Creator Studio & MetaCleaner AIO
Engine Version| V2.5
Documentation| Deployment & Maintenance Guide
Runtime| Node.js 20+
Video Engine| FFmpeg / FFprobe
AI Integration| Google Gemini
Deployment| VPS, Docker, GCP
CI/CD| GitHub Actions
Documentation Year| 2026

---

UGC Master — Creator Studio & MetaCleaner AIO
Build. Create. Process. Deploy.
