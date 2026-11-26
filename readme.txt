UGC Master — Creator Studio & MetaCleaner AIO

V2.5 — Anti-AI Engine

All-in-One UGC Creator Studio & Video Metadata Cleaner.

"UGC Master" (https://img.shields.io/badge/UGC%20Master-V2.5-blueviolet?style=for-the-badge)
"Anti-AI Engine" (https://img.shields.io/badge/Engine-Anti--AI-ff6b6b?style=for-the-badge)

""GitHub Stars" (https://img.shields.io/github/stars/Cerminsiji/UGC-Master-v2?style=flat-square)" (https://github.com/Cerminsiji/UGC-Master-v2/stargazers)
""GitHub Forks" (https://img.shields.io/github/forks/Cerminsiji/UGC-Master-v2?style=flat-square)" (https://github.com/Cerminsiji/UGC-Master-v2/forks)
""GitHub Issues" (https://img.shields.io/github/issues/Cerminsiji/UGC-Master-v2?style=flat-square)" (https://github.com/Cerminsiji/UGC-Master-v2/issues)
""Last Commit" (https://img.shields.io/github/last-commit/Cerminsiji/UGC-Master-v2?style=flat-square)" (https://github.com/Cerminsiji/UGC-Master-v2/commits/main)

"Node.js" (https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
"Python" (https://img.shields.io/badge/Python-3.8%2B-3776AB?logo=python&logoColor=white)
"FFmpeg" (https://img.shields.io/badge/FFmpeg-Media%20Engine-007808?logo=ffmpeg&logoColor=white)
"Docker" (https://img.shields.io/badge/Docker-Supported-2496ED?logo=docker&logoColor=white)
"Google Cloud" (https://img.shields.io/badge/Google%20Cloud-Supported-4285F4?logo=googlecloud&logoColor=white)

---

📌 Overview

UGC Master adalah platform All-in-One Creator Studio yang dirancang untuk mendukung proses pembuatan konten UGC (User Generated Content), pengolahan video, dan pengelolaan metadata media dalam satu sistem.

Platform ini ditujukan untuk kreator konten, affiliate marketer, dan pembuat video pendek yang membutuhkan workflow produksi konten yang lebih praktis dan terstruktur.

🎯 Main Modules

Module| Description
🎬 UGC Creator Studio| Workspace untuk membuat dan mengelola konten UGC
🧹 MetaCleaner AIO| Tool untuk pemeriksaan dan pengolahan metadata media

✨ Highlights

- 🎥 UGC Creator Studio
- 🧹 MetaCleaner AIO
- 🎞️ Media processing workflow
- ⚙️ Modular application architecture
- 🐳 Docker and Docker Compose support
- ☁️ Google Cloud deployment options
- 🔄 GitHub Actions CI/CD integration
- 📦 GitHub Container Registry support

---

📚 Table of Contents

- "Overview" (#-overview)
- "Main Modules" (#-main-modules)
- "Features" (#-features)
- "Technology Stack" (#-technology-stack)
- "System Requirements" (#-system-requirements)
- "Installation" (#-installation)
- "Environment Variables" (#-environment-variables)
- "Development" (#-development)
- "Deployment" (#-deployment)
- "CI/CD Pipeline" (#-cicd-pipeline)
- "MetaCleaner Workflow" (#-metacleaner-workflow)
- "Troubleshooting" (#-troubleshooting)
- "Project Structure" (#-project-structure)
- "Security" (#-security)
- "Contributing" (#-contributing)
- "License" (#-license)

---

🎬 Main Modules

1. UGC Creator Studio

Modul untuk mendukung workflow pembuatan konten UGC dan produksi video pendek.

Use cases:

- TikTok Shop content
- Shopee Video
- Marketplace affiliate content
- UGC product review
- Product showcase
- Short-form promotional video

General workflow:

1. Menentukan produk atau konsep konten.
2. Menyiapkan ide dan struktur video.
3. Menyusun kebutuhan visual dan narasi.
4. Mengelola proses produksi konten.
5. Menyiapkan hasil untuk kebutuhan publikasi.

2. MetaCleaner AIO

Modul untuk membantu pengelolaan metadata file media.

General capabilities:

- Memeriksa metadata file.
- Menghapus atau membersihkan metadata yang tidak diperlukan.
- Mengolah file media melalui workflow yang tersedia.
- Menyiapkan file untuk proses distribusi.

«Note: Pembersihan metadata bukan jaminan bahwa suatu platform akan menganggap video sebagai rekaman kamera asli atau tidak dibuat menggunakan AI.»

---

⚡ Features

Feature| Description
🎬 Creator Studio| Workspace pembuatan konten UGC
🧹 MetaCleaner AIO| Pengelolaan metadata media
🎞️ Video Processing| Workflow pengolahan video
🧩 Modular Architecture| Pemisahan fungsi berdasarkan modul
🐳 Docker Support| Deployment menggunakan container
☁️ Cloud Ready| Opsi deployment di Google Cloud
🔄 CI/CD| Otomatisasi build dan deployment
📦 Container Registry| Dukungan publikasi image ke GHCR

---

🛠️ Technology Stack

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
Operating System| Linux, Windows, or macOS
Node.js| 20+
Python| 3.8+
FFmpeg| Installed and accessible from PATH
Git| Latest stable version
RAM| Sesuai kebutuhan pemrosesan
Storage| Menyesuaikan ukuran media

Check Dependencies

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

Untuk project berbasis Node.js:

npm install

Jika repository menyediakan "requirements.txt":

python3 -m pip install -r requirements.txt

3. Configure Environment

Jika tersedia file ".env.example", buat konfigurasi lokal:

cp .env.example .env

Kemudian sesuaikan konfigurasi dengan kebutuhan aplikasi.

4. Check Available Scripts

npm run

Jalankan script yang tersedia di "package.json". Contoh:

npm run dev

«Nama script dapat berbeda sesuai konfigurasi project.»

---

🔐 Environment Variables

Berikut contoh template environment:

NODE_ENV=production
PORT=3000

# AI Integration
GEMINI_API_KEY=

# Application
APP_URL=

Security recommendations:

- Jangan memasukkan API key asli ke repository.
- Jangan membagikan file ".env".
- Gunakan GitHub Secrets untuk kebutuhan CI/CD.
- Sesuaikan nama variabel dengan implementasi aktual aplikasi.

---

🧑‍💻 Development

Clone repository:

git clone https://github.com/Cerminsiji/UGC-Master-v2.git

cd UGC-Master-v2

npm install

Periksa script yang tersedia:

npm run

Periksa perubahan:

git status

Commit dan push perubahan:

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

Install Node.js 20+ menggunakan metode resmi yang sesuai dengan distribusi Linux.

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

Sesuaikan dengan script aplikasi:

pm2 start npm --name ugc-master -- start

Simpan konfigurasi:

pm2 save

pm2 startup

Nginx Reverse Proxy

Buat file konfigurasi:

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

Build Docker Image

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

Google Cloud Run dapat digunakan untuk menjalankan aplikasi berbasis container.

Requirements

- Google Cloud account
- Google Cloud CLI
- Google Cloud project
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

Tambahkan hanya secret yang benar-benar digunakan oleh workflow.

GitHub Actions Badge

Jika workflow Docker menggunakan file ".github/workflows/docker-build.yml", tambahkan badge berikut:

"Docker Build" (https://github.com/Cerminsiji/UGC-Master-v2/actions/workflows/docker-build.yml/badge.svg)

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

---

🧰 Troubleshooting

1. npm install gagal

Periksa versi Node.js dan npm:

node -v
npm -v

Kemudian coba:

npm cache verify
npm install

2. FFmpeg tidak ditemukan

Ubuntu/Debian:

sudo apt update
sudo apt install ffmpeg -y

Verifikasi:

ffmpeg -version

3. Port sudah digunakan

Periksa proses yang menggunakan port:

sudo lsof -i :3000

Sesuaikan port aplikasi atau hentikan proses yang tidak diperlukan.

4. PM2 application error

Periksa status:

pm2 status

Lihat log:

pm2 logs ugc-master

Restart:

pm2 restart ugc-master

5. Docker container tidak berjalan

Periksa container:

docker ps -a

Lihat log:

docker logs ugc-master

Restart:

docker restart ugc-master

6. Nginx configuration error

Validasi konfigurasi:

sudo nginx -t

Periksa status:

sudo systemctl status nginx

---

📁 Project Structure

Struktur berikut merupakan contoh gambaran direktori. Sesuaikan dengan struktur aktual repository.

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

🔒 Security

- Jangan commit file ".env".
- Jangan expose API key di frontend atau repository publik.
- Gunakan environment variables untuk credential.
- Batasi akses file dan direktori upload.
- Validasi file yang diunggah.
- Batasi ukuran file upload sesuai kapasitas server.
- Gunakan HTTPS untuk deployment publik.
- Perbarui dependency secara berkala.
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

Gunakan GitHub Issues untuk melaporkan bug, memberikan masukan, atau mengusulkan fitur baru.

---

📝 License

Informasi lisensi mengikuti file "LICENSE" yang tersedia di repository.

Jika belum tersedia, tambahkan file lisensi dan tentukan ketentuan penggunaan sebelum mendistribusikan proyek.

---

⭐ Support the Project

Jika project ini bermanfaat, dukung pengembangannya dengan memberikan Star di GitHub.

""View Repository" (https://img.shields.io/badge/GitHub-View%20Repository-181717?style=for-the-badge&logo=github)" (https://github.com/Cerminsiji/UGC-Master-v2)

""Star Project" (https://img.shields.io/badge/Star-Project-yellow?style=for-the-badge&logo=github)" (https://github.com/Cerminsiji/UGC-Master-v2/stargazers)

""Report Bug" (https://img.shields.io/badge/Report-Bug-red?style=for-the-badge&logo=github)" (https://github.com/Cerminsiji/UGC-Master-v2/issues)

---

UGC Master V2.5

Create • Process • Optimize

Made with ❤️ for Content Creators
