UGC Master — Creator Studio & MetaCleaner AIO

<p align="center">
  <strong>V2.5 — Anti-AI Engine</strong><br>
  <em>All-in-One UGC Creator Studio & Video Metadata Cleaner</em>
</p><p align="center">
  <a href="https://github.com/Cerminsiji/UGC-Master-v2">
    <img src="https://img.shields.io/badge/UGC%20Master-V2.5-blueviolet?style=for-the-badge" alt="UGC Master V2.5">
  </a>
  <img src="https://img.shields.io/badge/Engine-Anti--AI-ff6b6b?style=for-the-badge" alt="Anti-AI Engine">
  <img src="https://img.shields.io/badge/Status-Development-blue?style=for-the-badge" alt="Development">
</p><p align="center">
  <a href="https://github.com/Cerminsiji/UGC-Master-v2/stargazers">
    <img src="https://img.shields.io/github/stars/Cerminsiji/UGC-Master-v2?style=social" alt="GitHub Stars">
  </a>
  <a href="https://github.com/Cerminsiji/UGC-Master-v2/network/members">
    <img src="https://img.shields.io/github/forks/Cerminsiji/UGC-Master-v2?style=social" alt="GitHub Forks">
  </a>
  <a href="https://github.com/Cerminsiji/UGC-Master-v2/issues">
    <img src="https://img.shields.io/github/issues/Cerminsiji/UGC-Master-v2" alt="GitHub Issues">
  </a>
  <img src="https://img.shields.io/github/last-commit/Cerminsiji/UGC-Master-v2" alt="Last Commit">
</p><p align="center">
  <img src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Python-3.8%2B-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FFmpeg-Media%20Engine-007808?logo=ffmpeg&logoColor=white" alt="FFmpeg">
  <img src="https://img.shields.io/badge/Docker-Supported-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/Google%20Cloud-Supported-4285F4?logo=googlecloud&logoColor=white" alt="Google Cloud">
</p>---

📌 Overview

UGC Master adalah platform All-in-One Creator Studio yang dirancang untuk membantu proses pembuatan konten UGC (User Generated Content), pengolahan video, dan pengelolaan metadata media dalam satu sistem.

Dikembangkan untuk mendukung workflow kreator konten, affiliate marketer, dan pembuat video pendek yang membutuhkan proses produksi konten lebih praktis dan terstruktur.

Versi V2.5 — Anti-AI Engine menggabungkan dua modul utama:

Modul| Fungsi
🎬 UGC Creator Studio| Workspace untuk membuat dan mengelola konten UGC
🧹 MetaCleaner AIO| Tool pengolahan dan pembersihan metadata media

✨ Highlights

- 🎥 UGC Creator Studio
- 🧹 MetaCleaner AIO
- ⚙️ Integrated media-processing workflow
- 🚀 Deployment-ready architecture
- 🐳 Docker & Docker Compose support
- ☁️ Google Cloud deployment support
- 🔄 GitHub Actions CI/CD integration
- 📦 GitHub Container Registry support

---

🧭 Table of Contents

- "Overview" (#-overview)
- "Main Modules" (#-main-modules)
- "Features" (#-features)
- "Technology Stack" (#-technology-stack)
- "System Requirements" (#-system-requirements)
- "Installation" (#-installation)
- "Environment Variables" (#-environment-variables)
- "Development" (#-development)
- "Deployment" (#-deployment)
  - "VPS Deployment" (#1-vps-deployment)
  - "Docker Deployment" (#2-docker-deployment)
  - "Google Cloud Run" (#3-google-cloud-run)
  - "Google Compute Engine" (#4-google-compute-engine)
- "CI/CD Pipeline" (#-cicd-pipeline)
- "MetaCleaner Workflow" (#-metacleaner-workflow)
- "Troubleshooting" (#-troubleshooting)
- "Project Structure" (#-project-structure)
- "Security Notes" (#-security-notes)
- "Contributing" (#-contributing)
- "License" (#-license)

---

🎬 Main Modules

<details>
<summary><strong>1. UGC Creator Studio</strong></summary><br>Modul untuk mendukung workflow pembuatan konten UGC dan produksi video pendek.

Use cases:

- TikTok Shop content
- Shopee Video
- Marketplace affiliate content
- UGC product review
- Product showcase
- Short-form promotional video

Workflow umum:

1. Menentukan produk atau konsep konten.
2. Menyiapkan ide dan struktur video.
3. Menyusun kebutuhan visual dan narasi.
4. Mengelola proses produksi konten.
5. Menyiapkan hasil untuk kebutuhan publikasi.

</details><details>
<summary><strong>2. MetaCleaner AIO</strong></summary><br>Modul untuk membantu pengelolaan metadata file media.

Tujuan penggunaan:

- Memeriksa metadata file.
- Menghapus atau membersihkan metadata yang tidak diperlukan.
- Mengolah file media melalui workflow yang tersedia.
- Membantu menyiapkan file untuk proses distribusi.

Catatan: MetaCleaner merupakan alat pengolahan metadata, bukan jaminan bahwa suatu platform akan menganggap video sebagai rekaman kamera asli atau tidak dibuat menggunakan AI.

</details>---

⚡ Features

Feature| Description
🎬 Creator Studio| Workspace pembuatan konten UGC
🧹 MetaCleaner AIO| Pengelolaan metadata media
🎞️ Video Processing| Dukungan workflow pengolahan video
🧩 Modular Architecture| Pemisahan fungsi berdasarkan modul
🐳 Docker Support| Deployment menggunakan container
☁️ Cloud Ready| Opsi deployment di Google Cloud
🔄 CI/CD| Otomatisasi build dan deployment
📦 Container Registry| Dukungan publikasi image ke GHCR

---

🛠️ Technology Stack

Teknologi yang digunakan atau didukung dalam workflow proyek:

Technology| Purpose
Node.js| Runtime aplikasi
Python| Pemrosesan dan utilitas pendukung
FFmpeg| Pemrosesan audio dan video
Gemini API| Integrasi AI jika dikonfigurasi
Docker| Containerization
Nginx| Reverse proxy
PM2| Process management
Google Cloud| Infrastruktur cloud
GitHub Actions| CI/CD automation
GHCR| Container image registry

---

💻 System Requirements

Minimum Requirements

Component| Requirement
Operating System| Linux / Windows / macOS
Node.js| 20+
Python| 3.8+
FFmpeg| Installed and accessible from PATH
Git| Latest stable version
RAM| Sesuai kebutuhan pemrosesan
Storage| Menyesuaikan ukuran media

«Pastikan versi dan dependensi sesuai dengan konfigurasi aktual pada repository.»

Check Installed Dependencies

node --version
npm --version
python3 --version
ffmpeg -version
git --version

---

📥 Installation

1. Clone Repository

git clone https://github.com/Cerminsiji/UGC-Master-v2.git

cd UGC-Master-v2

2. Install Dependencies

Jika menggunakan npm:

npm install

Jika repository menyediakan "requirements.txt":

python3 -m pip install -r requirements.txt

3. Configure Environment

Buat file ".env" berdasarkan ".env.example" jika file tersebut tersedia:

cp .env.example .env

Kemudian sesuaikan konfigurasi dengan kebutuhan aplikasi.

4. Run Application

Periksa script yang tersedia:

npm run

Jalankan script development yang disediakan oleh project. Contoh:

npm run dev

«Nama script dapat berbeda. Gunakan script yang benar-benar tercantum pada "package.json".»

---

🔐 Environment Variables

Konfigurasi environment digunakan untuk menyimpan pengaturan aplikasi dan integrasi layanan.

Contoh template:

NODE_ENV=production
PORT=3000

# AI Integration
GEMINI_API_KEY=

# Application
APP_URL=

Penting:

- Jangan memasukkan API key asli ke repository.
- Jangan membagikan file ".env".
- Gunakan GitHub Secrets untuk kebutuhan CI/CD.
- Sesuaikan nama variabel dengan implementasi aktual aplikasi.

---

🧑‍💻 Development

Untuk pengembangan lokal:

git clone https://github.com/Cerminsiji/UGC-Master-v2.git

cd UGC-Master-v2

npm install

Periksa perintah yang tersedia:

npm run

Jalankan perintah development sesuai konfigurasi proyek.

Untuk memeriksa perubahan:

git status

Untuk mengirim perubahan:

git add .

git commit -m "Update UGC Master"

git push origin main

---

🚀 Deployment

1. VPS Deployment

Contoh deployment menggunakan Ubuntu, PM2, dan Nginx.

Update Server

sudo apt update && sudo apt upgrade -y

Install Dependencies

sudo apt install -y git nginx ffmpeg python3 python3-pip

Install Node.js 20+ menggunakan metode instalasi resmi yang sesuai dengan distribusi Linux.

Verifikasi:

node -v
npm -v

Clone Project

git clone https://github.com/Cerminsiji/UGC-Master-v2.git

cd UGC-Master-v2

npm install

Install PM2

sudo npm install -g pm2

Start Application

Sesuaikan perintah dengan entry point atau script aplikasi:

pm2 start npm --name ugc-master -- start

Simpan konfigurasi PM2:

pm2 save

pm2 startup

Nginx Reverse Proxy

Buat konfigurasi:

sudo nano /etc/nginx/sites-available/ugc-master

Contoh konfigurasi:

server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3000;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

Aktifkan konfigurasi:

sudo ln -s /etc/nginx/sites-available/ugc-master /etc/nginx/sites-enabled/

sudo nginx -t

sudo systemctl reload nginx

Enable HTTPS

Jika domain sudah mengarah ke server:

sudo apt install -y certbot python3-certbot-nginx

sudo certbot --nginx -d your-domain.com

---

2. Docker Deployment

Pastikan Docker dan Docker Compose sudah terpasang.

Build Image

docker build -t ugc-master .

Run Container

docker run -d \
  --name ugc-master \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  ugc-master

Docker Compose

Jika repository menyediakan "docker-compose.yml" atau "compose.yaml":

docker compose up -d --build

Melihat container:

docker compose ps

Melihat log:

docker compose logs -f

Menghentikan container:

docker compose down

---

3. Google Cloud Run

Deployment ke Google Cloud Run dapat digunakan untuk menjalankan aplikasi berbasis container.

Requirements

- Google Cloud account
- Google Cloud CLI
- Project Google Cloud
- Billing aktif
- Container image yang dapat diakses Cloud Run

Authenticate

gcloud auth login

gcloud config set project YOUR_PROJECT_ID

Build Image

gcloud builds submit \
  --tag gcr.io/YOUR_PROJECT_ID/ugc-master

Deploy

gcloud run deploy ugc-master \
  --image gcr.io/YOUR_PROJECT_ID/ugc-master \
  --region asia-southeast2 \
  --platform managed \
  --allow-unauthenticated

«Sesuaikan region, port, environment variables, memory, timeout, dan akses publik berdasarkan kebutuhan aplikasi. Pastikan aplikasi mendengarkan port yang diberikan melalui environment variable "PORT".»

---

4. Google Compute Engine

Untuk deployment pada VM Google Cloud:

1. Buat VM Linux melalui Google Cloud Console.
2. Atur firewall dan akses SSH.
3. Install Node.js, Python, FFmpeg, Git, dan Nginx.
4. Clone repository.
5. Install dependencies.
6. Konfigurasikan environment.
7. Jalankan aplikasi menggunakan PM2 atau Docker.
8. Konfigurasikan Nginx dan HTTPS.

---

🔄 CI/CD Pipeline

UGC Master dapat menggunakan GitHub Actions untuk mengotomatisasi proses build dan publikasi Docker image ke GitHub Container Registry (GHCR).

Workflow Overview

Developer Push
      |
      v
GitHub Repository
      |
      v
GitHub Actions
      |
      v
Build Docker Image
      |
      v
Publish to GHCR
      |
      v
Deployment Environment

GHCR Image Format

ghcr.io/USERNAME/REPOSITORY:latest

Recommended GitHub Secrets

Secret| Description
"GEMINI_API_KEY"| API key untuk integrasi Gemini
"DEPLOY_HOST"| IP atau hostname server
"DEPLOY_USER"| Username server
"DEPLOY_SSH_KEY"| SSH private key deployment

«Tambahkan hanya secret yang benar-benar digunakan workflow. Jangan menyimpan credential di dalam source code.»

GitHub Actions Badge

Jika workflow Docker menggunakan nama file "docker-build.yml", tambahkan badge berikut:

![Docker Build](https://github.com/Cerminsiji/UGC-Master-v2/actions/workflows/docker-build.yml/badge.svg)

Badge akan aktif setelah workflow dengan nama file tersebut tersedia di repository.

---

🧹 MetaCleaner Workflow

Gambaran umum proses pengolahan metadata:

Input Media
     |
     v
Metadata Inspection
     |
     v
Metadata Processing
     |
     v
Output Validation
     |
     v
Processed Media

Recommended Workflow

1. Siapkan file media yang akan diproses.
2. Periksa metadata sebelum pemrosesan.
3. Jalankan fitur MetaCleaner sesuai kebutuhan.
4. Simpan hasil pemrosesan.
5. Periksa kembali file hasil.
6. Pastikan kualitas video dan audio tetap sesuai kebutuhan.

Catatan: Pembersihan metadata tidak menjamin penghapusan seluruh jejak asal-usul media. Metadata tertentu dapat dibuat ulang oleh aplikasi atau platform saat proses ekspor dan upload.

---

🧰 Troubleshooting

<details>
<summary><strong>1. npm install gagal</strong></summary>Periksa versi Node.js dan npm:

node -v
npm -v

Kemudian coba:

npm cache verify

npm install

</details><details>
<summary><strong>2. FFmpeg tidak ditemukan</strong></summary>Ubuntu/Debian:

sudo apt update

sudo apt install ffmpeg -y

Verifikasi:

ffmpeg -version

</details><details>
<summary><strong>3. Port sudah digunakan</strong></summary>Periksa proses yang menggunakan port:

sudo lsof -i :3000

Sesuaikan port aplikasi atau hentikan proses yang tidak diperlukan.

</details><details>
<summary><strong>4. PM2 application error</strong></summary>Periksa status:

pm2 status

Lihat log:

pm2 logs ugc-master

Restart:

pm2 restart ugc-master

</details><details>
<summary><strong>5. Docker container tidak berjalan</strong></summary>Periksa:

docker ps -a

Lihat log:

docker logs ugc-master

Restart:

docker restart ugc-master

</details><details>
<summary><strong>6. Nginx configuration error</strong></summary>Validasi konfigurasi:

sudo nginx -t

Periksa status:

sudo systemctl status nginx

</details>---

📁 Project Structure

Struktur direktori berikut merupakan gambaran konseptual. Sesuaikan dengan struktur aktual repository.

UGC-Master-v2/
│
├── public/
├── src/
├── scripts/
├── assets/
│
├── .github/
│   └── workflows/
│
├── Dockerfile
├── docker-compose.yml
├── package.json
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md

---

🔒 Security Notes

Keamanan aplikasi dan data pengguna perlu diperhatikan.

- Jangan commit file ".env".
- Jangan expose API key di frontend atau repository publik.
- Gunakan environment variables untuk credential.
- Batasi akses file dan direktori upload.
- Validasi file yang diunggah.
- Batasi ukuran file upload sesuai kapasitas server.
- Gunakan HTTPS untuk deployment publik.
- Lakukan pembaruan dependency secara berkala.
- Terapkan autentikasi dan pembatasan akses jika aplikasi digunakan secara publik.

---

🤝 Contributing

Kontribusi dan pengembangan lebih lanjut sangat terbuka.

Contribution Steps

1. Fork repository.
2. Buat branch fitur baru.
3. Lakukan perubahan.
4. Commit perubahan.
5. Push branch.
6. Buat Pull Request.

git checkout -b feature/new-feature

git add .

git commit -m "Add new feature"

git push origin feature/new-feature

Silakan gunakan GitHub Issues untuk melaporkan bug, memberikan masukan, atau mengusulkan fitur baru.

---

📝 License

Informasi lisensi mengikuti file "LICENSE" yang tersedia di repository.

Jika belum tersedia, tambahkan file lisensi dan tentukan ketentuan penggunaan sebelum mendistribusikan proyek.

---

⭐ Support the Project

Jika project ini bermanfaat, dukung pengembangannya dengan memberikan Star di GitHub.

<p align="center">
  <a href="https://github.com/Cerminsiji/UGC-Master-v2">
    <img src="https://img.shields.io/badge/GitHub-View%20Repository-181717?style=for-the-badge&logo=github" alt="View Repository">
  </a>
  <a href="https://github.com/Cerminsiji/UGC-Master-v2/stargazers">
    <img src="https://img.shields.io/badge/⭐-Star%20Project-yellow?style=for-the-badge" alt="Star Project">
  </a>
  <a href="https://github.com/Cerminsiji/UGC-Master-v2/issues">
    <img src="https://img.shields.io/badge/Report-Bug-red?style=for-the-badge&logo=github" alt="Report Bug">
  </a>
</p><p align="center">
  <strong>UGC Master V2.5</strong><br>
  <em>Create • Process • Optimize</em>
</p><p align="center">
  Made with ❤️ for Content Creators
</p>
