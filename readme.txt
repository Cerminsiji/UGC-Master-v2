================================================================================
UGC MASTER - CREATOR STUDIO & METACLEANER AIO (V2.5 ANTI-AI ENGINE)
PANDUAN LENGKAP PROYEK & CARA DEPLOYMENT LENGKAP
(VPS/VDS, DOCKER, DOCKER COMPOSE, GOOGLE CLOUD, & GITHUB ACTIONS)
================================================================================

Daftar Isi:
1. Tentang Proyek & Fitur Utama
2. Spesifikasi Kebutuhan Sistem (Prerequisites)
3. Cara Menjalankan di Komputer Lokal (Local Dev)
4. Cara Deploy ke Server VPS/VDS (Ubuntu/Debian) via PM2 & Nginx
5. Cara Deploy Menggunakan Docker & Docker Compose
6. Cara Deploy ke Google Cloud Platform (Cloud Run & Compute Engine)
7. Otomasi Build Docker di GitHub (GitHub Actions CI/CD)
8. Konfigurasi Environment Variables (.env)
9. Pemeliharaan, Auto-Cleaner, & Troubleshooting

================================================================================
1. TENTANG PROYEK & FITUR UTAMA
================================================================================

UGC Master adalah platform terpadu pembuatan konten video UGC (User Generated 
Content) dan sanitasi metadata video tingkat forensik (MetaCleaner AIO).

Fitur Utama:
- UGC Creator Studio: Generator naskah video otomatis berbasis Google Gemini AI,
  pembuat storyboard scene-by-scene, teleprompter, dan manajemen hook visual.
- MetaCleaner AIO (Anti-AI Engine V2.5):
  * CSPRNG Bitstream Scrambler: Mengacak payload tersembunyi SynthID, NAL SEI
    unregistered, dan atom provenance (C2PA/JUMBF/UUID) sebelum decoding.
  * 0% Duplikat Pulldown Repair: Mendeteksi dan menghapus duplikat frame 24->30fps
    melalui 'mpdecimate' + sintesis 30fps CFR motion-aware.
  * Organic Visual Camera Engine: Injeksi sensor grain CMOS Bayer, 180-degree
    shutter blend, barrel lens warp optik, dan ISP CAS sharpening.
  * Dual-Mic Stereo Room Reflection: Memulihkan frekuensi audio udara (>17kHz)
    serta memecah jeda hening digital mutlak khas suara AI TTS.
  * Zero-Tombstone Physical Box Compaction: Menghilangkan total atom 'free'/'skip'
    dan merekonstruksi tabel offset 'stco'/'co64' MP4 agar bebas dari jejak
    stripping metadata FFmpeg.
  * Granular Streaming Progress: Telemetry frame-by-frame real-time tanpa lonjakan
    tiba-tiba (80% ke 100%).

================================================================================
2. SPESIFIKASI KEBUTUHAN SISTEM (PREREQUISITES)
================================================================================

Untuk menjalankan aplikasi ini dengan performa optimal:

- Sistem Operasi: Linux (Ubuntu 20.04/22.04/24.04 LTS direkomendasikan), macOS, 
  atau Windows (WSL2).
- Node.js: Versi 20.x LTS atau lebih baru.
- Python: Versi 3.8+ (diperlukan untuk script /scripts/ffmpeg_cleaner.py).
- FFmpeg & FFprobe: Versi 5.x, 6.x, atau 7.x (didukung juga oleh library 
  ffmpeg-static internal).
- RAM: Minimal 2 GB (Disarankan 4 GB - 8 GB untuk re-encoding video 1080p).
- CPU: Minimal 2 vCPU (Disarankan 4 vCPU untuk proses multi-threading x264).
- Disk: Minimal 10 GB ruang kosong (untuk penyimpanan sementara video di /tmp).

================================================================================
3. CARA MENJALANKAN DI KOMPUTER LOKAL (LOCAL DEV)
================================================================================

1. Clone repositori dari GitHub:
   git clone https://github.com/USERNAME/REPO_NAME.git
   cd REPO_NAME

2. Install dependensi Node.js:
   npm install

3. Siapkan file konfigurasi environment:
   cp .env.example .env.local

   Buka file .env.local dan masukkan API Key Gemini Anda:
   GEMINI_API_KEY="AIzaSy..."
   APP_URL="http://localhost:3000"

4. Jalankan mode pengembangan (Development):
   npm run dev

5. Buka browser di http://localhost:3000

================================================================================
4. CARA DEPLOY KE SERVER VPS / VDS (UBUNTU / DEBIAN) VIA PM2 & NGINX
================================================================================

Metode ini adalah cara standar paling efisien dan hemat memori pada VPS seperti
DigitalOcean, Linode, Contabo, Hetzner, Vultr, atau AWS EC2.

--- Langkah 1: Update Server & Install Dependensi Dasar ---
Buka terminal SSH VPS Anda dan jalankan:

sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential python3 python3-pip ffmpeg nginx

# Install Node.js 20 LTS via NodeSource:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verifikasi instalasi:
node -v      # Harus v20.x atau lebih tinggi
python3 -V   # Harus Python 3.8+
ffmpeg -version

# Install PM2 global (Process Manager):
sudo npm install -g pm2

--- Langkah 2: Setup Direktori Proyek & Build ---
# Buat folder aplikasi:
sudo mkdir -p /var/www/ugc-studio
sudo chown -R $USER:$USER /var/www/ugc-studio
cd /var/www/ugc-studio

# Clone repositori Anda:
git clone https://github.com/USERNAME/REPO_NAME.git .

# Install dependensi:
npm install --production=false

# Buat file .env:
nano .env

Isi .env:
NODE_ENV=production
PORT=3000
GEMINI_API_KEY="AIzaSy..."
APP_URL="https://domain-anda.com"

# Build proyek untuk production:
npm run build

--- Langkah 3: Menjalankan Aplikasi dengan PM2 ---
# Jalankan server menggunakan server.js:
pm2 start server.js --name "ugc-studio" -i max

# Simpan proses agar otomatis berjalan saat server restart:
pm2 save
pm2 startup

--- Langkah 4: Konfigurasi Nginx Reverse Proxy ---
Buat konfigurasi virtual host Nginx:
sudo nano /etc/nginx/sites-available/ugc-studio

Tempel konfigurasi berikut (ganti domain-anda.com dengan domain/IP Anda):

server {
    listen 80;
    server_name domain-anda.com www.domain-anda.com;

    # PENTING: Izinkan upload video hingga 500MB
    client_max_body_size 500M;
    client_body_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout panjang untuk proses render video berat
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}

# Aktifkan konfigurasi dan restart Nginx:
sudo ln -s /etc/nginx/sites-available/ugc-studio /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

--- Langkah 5: Pasang SSL Gratis (HTTPS) dengan Certbot ---
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d domain-anda.com -d www.domain-anda.com

Aplikasi Anda kini sudah live dengan HTTPS di https://domain-anda.com!

================================================================================
5. CARA DEPLOY MENGGUNAKAN DOCKER & DOCKER COMPOSE
================================================================================

Jika Anda lebih memilih containerisasi agar lingkungan selalu identik:

--- Opsi A: Menggunakan Docker Compose (Sangat Disarankan) ---
1. Pastikan Docker dan Docker Compose sudah terpasang di VPS Anda:
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo apt install -y docker-compose-plugin

2. Siapkan file .env pada direktori proyek:
   GEMINI_API_KEY=AIzaSy...
   APP_URL=https://domain-anda.com

3. Jalankan container di latar belakang:
   docker compose up -d --build

4. Cek status container:
   docker compose ps
   docker compose logs -f

5. Untuk memperbarui versi aplikasi di kemudian hari:
   git pull
   docker compose up -d --build

--- Opsi B: Build & Run Docker Manual ---
1. Build image:
   docker build -t ugc-master-app:latest .

2. Jalankan container:
   docker run -d \
     --name ugc-master-cleaner \
     -p 3000:3000 \
     -e GEMINI_API_KEY="AIzaSy..." \
     -e APP_URL="https://domain-anda.com" \
     -v /tmp:/tmp \
     --restart unless-stopped \
     ugc-master-app:latest

================================================================================
6. CARA DEPLOY KE GOOGLE CLOUD PLATFORM (GCP)
================================================================================

--- Opsi 1: Google Cloud Run (Serverless Container) ---
Cloud Run adalah layanan serverless Google yang otomatis melakukan scaling.

1. Install Google Cloud SDK (gcloud CLI) di komputer Anda dan login:
   gcloud auth login
   gcloud config set project ID_PROJECT_GCP_ANDA

2. Build dan submit image ke Google Artifact Registry / Container Registry:
   gcloud builds submit --tag gcr.io/ID_PROJECT_GCP_ANDA/ugc-master:latest

3. Deploy ke Cloud Run:
   gcloud run deploy ugc-master \
     --image gcr.io/ID_PROJECT_GCP_ANDA/ugc-master:latest \
     --platform managed \
     --region asia-southeast1 \
     --allow-unauthenticated \
     --memory 4Gi \
     --cpu 2 \
     --timeout 600 \
     --set-env-vars GEMINI_API_KEY="AIzaSy...",APP_URL="https://URL_CLOUD_RUN_ANDA"

Catatan Cloud Run:
- Berikan alokasi CPU minimal 2 vCPU dan RAM 4 GB agar re-encoding video FFmpeg
  tidak kehabisan memori.
- Set timeout ke 600 detik (10 menit) untuk mencegah timeout pada video panjang.

--- Opsi 2: Google Compute Engine (VM Instance) ---
1. Di Google Cloud Console, buka 'Compute Engine' -> 'VM instances'.
2. Klik 'Create Instance':
   - Machine type: e2-standard-2 (2 vCPU, 8 GB RAM) atau e2-medium.
   - Boot disk: Ubuntu 22.04 LTS (minimal 25 GB SSD).
   - Firewall: Centang 'Allow HTTP traffic' dan 'Allow HTTPS traffic'.
3. Setelah VM aktif, klik tombol 'SSH' lalu ikuti panduan Bagian 4 (Deploy ke VPS).

================================================================================
7. OTOMASI BUILD DOCKER DI GITHUB (GITHUB ACTIONS CI/CD)
================================================================================

Repositori ini telah dilengkapi dengan workflow CI/CD otomatis pada file:
.github/workflows/docker-build.yml

Cara Kerja Otomasi:
1. Setiap kali Anda melakukan 'git push' ke branch 'main' atau 'master' (atau 
   membuat rilis tag seperti 'v1.0.0'), GitHub Actions akan secara otomatis:
   - Menjalankan build environment Ubuntu.
   - Membangun (build) Docker image multi-stage (Node.js + Python 3 + FFmpeg).
   - Mengunggah (push) image siap pakai ke GitHub Container Registry (GHCR) 
     pada alamat:
     ghcr.io/USERNAME_GITHUB/NAMA_REPO:latest

2. Cara Menggunakan Image Hasil GitHub Actions di Server Anda:
   Di server VPS Anda, cukup login satu kali ke GHCR:
   echo "PERSONAL_ACCESS_TOKEN_GITHUB" | docker login ghcr.io -u USERNAME_GITHUB --password-stdin

   Lalu jalankan image langsung tanpa perlu build ulang di server:
   docker run -d \
     --name ugc-master \
     -p 3000:3000 \
     -e GEMINI_API_KEY="AIzaSy..." \
     -e APP_URL="https://domain-anda.com" \
     --restart unless-stopped \
     ghcr.io/USERNAME_GITHUB/NAMA_REPO:latest

================================================================================
8. KONFIGURASI ENVIRONMENT VARIABLES (.ENV)
================================================================================

Variabel yang didukung oleh aplikasi:

| Nama Variabel     | Wajib? | Keterangan                                       |
|-------------------|--------|--------------------------------------------------|
| GEMINI_API_KEY    | Ya     | API Key dari Google AI Studio untuk fitur AI.    |
| APP_URL           | Ya     | URL publik aplikasi (contoh: https://domain.com) |
| PORT              | Tidak  | Port HTTP server (Default: 3000)                 |
| HOSTNAME          | Tidak  | Host binding (Default: 0.0.0.0)                  |
| FFMPEG_BIN        | Tidak  | Jalur manual binary FFmpeg jika ada kustomisasi  |
| FFPROBE_BIN       | Tidak  | Jalur manual binary FFprobe jika ada kustomisasi |

================================================================================
9. PEMELIHARAAN, AUTO-CLEANER, & TROUBLESHOOTING
================================================================================

1. Mekanisme Pembersihan Otomatis (Auto-Clean):
   Aplikasi dilengkapi proteksi server otomatis untuk membersihkan file sisa 
   temporary:
   - File video upload dan hasil encode otomatis dihapus setelah 5 menit (TTL).
   - Background sweeper berjalan setiap 120 detik untuk membersihkan file /tmp
     yang berstatus orphan/dormant.
   - Anda juga dapat memicu pembersihan manual kapan saja melalui panel 
     "Audit Forensik & Log" -> Klik "Bersihkan Server", atau via endpoint HTTP:
     curl -X DELETE "http://127.0.0.1:3000/api/meta-cleaner/download?sweep=dormant"

2. Error "Payload Too Large" (413) saat Upload Video:
   Jika menggunakan Nginx, pastikan direktif berikut sudah disetel di blok server:
   client_max_body_size 500M;

3. Error Memory/OOM Saat Encoding Video 4K atau Durasi Panjang:
   Pastikan swap memory aktif pada VPS Anda jika RAM terbatas:
   sudo fallocate -l 4G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile

4. Cek Health Check Server:
   curl -I http://127.0.0.1:3000/api/health
   Respon yang benar adalah HTTP 200 dengan status "ok".

================================================================================
UGC Master - Creator Studio & MetaCleaner AIO Engine
Build & Deployment Documentation - 2026
================================================================================
