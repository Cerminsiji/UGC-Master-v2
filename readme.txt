<div align="center">

# UGC Master V2.5 — Anti-AI Engine

**All-in-One UGC Creator Studio & Video Metadata Cleaner**

![UGC Master](https://img.shields.io/badge/UGC_Master-V2.5-blueviolet?style=for-the-badge)
![Anti-AI Engine](https://img.shields.io/badge/Engine-Anti--AI-ff6b6b?style=for-the-badge)

[![Stars](https://img.shields.io/github/stars/Cerminsiji/UGC-Master-v2?style=flat-square)](https://github.com/Cerminsiji/UGC-Master-v2/stargazers)
[![Forks](https://img.shields.io/github/forks/Cerminsiji/UGC-Master-v2?style=flat-square)](https://github.com/Cerminsiji/UGC-Master-v2/forks)
[![Issues](https://img.shields.io/github/issues/Cerminsiji/UGC-Master-v2?style=flat-square)](https://github.com/Cerminsiji/UGC-Master-v2/issues)
[![Last Commit](https://img.shields.io/github/last-commit/Cerminsiji/UGC-Master-v2?style=flat-square)](https://github.com/Cerminsiji/UGC-Master-v2/commits/main)

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.8%2B-3776AB?logo=python&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-Media_Engine-007808?logo=ffmpeg&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?logo=docker&logoColor=white)
![Google_Cloud](https://img.shields.io/badge/Google_Cloud-Supported-4285F4?logo=googlecloud&logoColor=white)

</div>

---

## 📌 Overview

**UGC Master** adalah platform *All-in-One Creator Studio* yang dirancang untuk mendukung proses pembuatan konten UGC (*User Generated Content*), pengolahan video, dan pengelolaan metadata media dalam satu sistem terintegrasi.

Platform ini ditujukan untuk kreator konten, *affiliate marketer*, dan pembuat video pendek yang membutuhkan *workflow* produksi konten yang lebih praktis, modular, dan terstruktur.

---

## 🎯 Main Modules

| Module | Description |
| :--- | :--- |
| 🎬 **UGC Creator Studio** | Workspace untuk membuat, merencanakan, dan mengelola konten UGC |
| 🧹 **MetaCleaner AIO** | Tool untuk pemeriksaan dan pembersihan metadata media |

---

## ✨ Highlights

* 🎥 **UGC Creator Studio** untuk manajemen konten video pendek.
* 🧹 **MetaCleaner AIO** untuk penanganan metadata file media.
* 🎞️ **Media Processing Workflow** yang efisien dan andal.
* ⚙️ **Modular Application Architecture** berbasis layanan terpusat.
* 🐳 **Docker & Docker Compose Support** untuk kemudahan containerization.
* ☁️ **Google Cloud Deployment Options** (Cloud Run & Compute Engine).
* 🔄 **GitHub Actions CI/CD Integration** untuk otomatisasi *build* & *deploy*.
* 📦 **GitHub Container Registry (GHCR)** support.

---

## 📚 Table of Contents

- [Overview](#-overview)
- [Main Modules](#-main-modules)
- [Highlights](#-highlights)
- [Features](#-features)
- [Technology Stack](#-technology-stack)
- [System Requirements](#-system-requirements)
- [Installation](#-installation)
- [Environment Variables](#-environment-variables)
- [Development](#-development)
- [Deployment](#-deployment)
- [CI/CD Pipeline](#-cicd-pipeline)
- [MetaCleaner Workflow](#-metacleaner-workflow)
- [Troubleshooting](#-troubleshooting)
- [Project Structure](#-project-structure)
- [Security](#-security)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎬 Main Modules

### 1. UGC Creator Studio
Modul pendukung untuk *workflow* pembuatan konten UGC dan produksi video pendek berkualitas tinggi.

**Use Cases:**
* TikTok Shop content
* Shopee Video
* Marketplace affiliate content
* UGC product review
* Product showcase
* Short-form promotional video

**General Workflow:**
1. Menentukan produk atau konsep konten.
2. Menyiapkan ide dan struktur video.
3. Menyusun kebutuhan visual dan narasi.
4. Mengelola proses produksi konten.
5. Menyiapkan hasil akhir untuk kebutuhan publikasi.

### 2. MetaCleaner AIO
Modul khusus untuk membantu pengelolaan dan pembersihan metadata file media.

**General Capabilities:**
* Memeriksa struktur metadata file.
* Menghapus atau membersihkan metadata yang tidak diperlukan.
* Mengolah file media melalui *workflow* yang tersedia.
* Menyiapkan file bersih untuk proses distribusi.

> **⚠️ Catatan Penting:** Pembersihan metadata **bukan jaminan mutlak** bahwa suatu platform otomatis menganggap video sebagai rekaman kamera asli atau luput dari sistem deteksi AI.

---

## ⚡ Features

| Feature | Description |
| :--- | :--- |
| 🎬 **Creator Studio** | Workspace pembuatan dan perencanaan konten UGC |
| 🧹 **MetaCleaner AIO** | Pengelolaan dan pembersihan metadata media |
| 🎞️ **Video Processing** | Integrasi *workflow* pengolahan video tingkat lanjut |
| 🧩 **Modular Architecture** | Pemisahan fungsionalitas berdasarkan modul |
| 🐳 **Docker Support** | *Deployment* cepat menggunakan container |
| ☁️ **Cloud Ready** | Opsi *deployment* fleksibel di Google Cloud |
| 🔄 **CI/CD Automation** | Otomatisasi *build* dan *deployment* via GitHub Actions |
| 📦 **Container Registry** | Publikasi *image* secara aman ke GHCR |

---

## 🛠️ Technology Stack

| Technology | Purpose |
| :--- | :--- |
| **Node.js** | Runtime aplikasi utama |
| **Python** | Pemrosesan media & utilitas pendukung |
| **FFmpeg** | Core pemrosesan audio dan video |
| **Gemini API** | Integrasi fitur kecerdasan buatan (opsional) |
| **Docker** | Containerization aplikasi |
| **Nginx** | Reverse proxy & web server |
| **PM2** | Process management untuk Node.js |
| **Google Cloud** | Infrastruktur *cloud* pilihan |
| **GitHub Actions** | Otomatisasi CI/CD |
| **GHCR** | Container image registry |

---

## 💻 System Requirements

### Minimum Requirements

| Component | Requirement |
| :--- | :--- |
| **Operating System** | Linux, Windows, or macOS |
| **Node.js** | Versi 20+ |
| **Python** | Versi 3.8+ |
| **FFmpeg** | Terinstal dan dapat diakses dari PATH sistem |
| **Git** | Versi stabil terbaru |
| **RAM** | Menyesuaikan kebutuhan pemrosesan media |
| **Storage** | Menyesuaikan ukuran file media yang diolah |

### Check Dependencies
```bash
node --version
npm --version
python3 --version
ffmpeg -version
git --version
```

---

## 📥 Installation

### 1. Clone Repository
```bash
git clone https://github.com/Cerminsiji/UGC-Master-v2.git
cd UGC-Master-v2
```

### 2. Install Dependencies
Untuk project berbasis Node.js:
```bash
npm install
```

Jika repository menyediakan *requirements* Python:
```bash
python3 -m pip install -r requirements.txt
```

### 3. Configure Environment
Salin file konfigurasi contoh:
```bash
cp .env.example .env
```
Kemudian sesuaikan nilai parameter di dalam file `.env` dengan kebutuhan aplikasi Anda.

### 4. Check Available Scripts
Periksa perintah yang tersedia di dalam `package.json`:
```bash
npm run
```
Jalankan aplikasi pada mode development (contoh):
```bash
npm run dev
```

---

## 🔐 Environment Variables

Berikut adalah contoh template variabel lingkungan (`.env`):

```env
NODE_ENV=production
PORT=3000

# AI Integration
GEMINI_API_KEY=your_gemini_api_key_here

# Application Configuration
APP_URL=http://localhost:3000
```

**Security Recommendations:**
* Jangan pernah *commit* file `.env` berisi *credential* asli ke repository publik.
* Gunakan **GitHub Secrets** untuk pengelolaan kredensial pada pipeline CI/CD.
* Sesuaikan nama variabel dengan implementasi aktual pada source code Anda.

---

## 🧑‍💻 Development

Langkah cepat untuk mulai melakukan pengembangan lokal:

```bash
# 1. Clone repository
git clone https://github.com/Cerminsiji/UGC-Master-v2.git
cd UGC-Master-v2

# 2. Install dependencies
npm install

# 3. Jalankan script development
npm run dev
```

---

## 🚀 Deployment

### 1. VPS Deployment (Ubuntu + PM2 + Nginx)

**Update Server & Install Dependencies:**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx ffmpeg python3 python3-pip
```
*(Catatan: Install Node.js v20+ menggunakan repository resmi NodeSource).*

**Clone & Install Project:**
```bash
git clone https://github.com/Cerminsiji/UGC-Master-v2.git
cd UGC-Master-v2
npm install
```

**Setup PM2 Process Manager:**
```bash
sudo npm install -g pm2
pm2 start npm --name ugc-master -- start
pm2 save
pm2 startup
```

**Konfigurasi Nginx Reverse Proxy:**
Buat file konfigurasi baru:
```bash
sudo nano /etc/nginx/sites-available/ugc-master
```

Isi dengan konfigurasi berikut (sesuaikan `your-domain.com`):
```nginx
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
```

Aktifkan konfigurasi dan restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/ugc-master /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Enable HTTPS (SSL Certbot):**
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

### 2. Docker Deployment

Pastikan Docker dan Docker Compose telah terpasang di sistem Anda.

**Build & Run Container Manual:**
```bash
docker build -t ugc-master .

docker run -d \
  --name ugc-master \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  ugc-master
```

**Menggunakan Docker Compose:**
```bash
# Menjalankan container
docker compose up -d --build

# Memeriksa status container
docker compose ps

# Melihat log aplikasi
docker compose logs -f

# Menghentikan layanan
docker compose down
```

---

### 3. Google Cloud Run

Google Cloud Run sangat ideal untuk menjalankan aplikasi berbasis container secara *serverless*.

**Authentikasi & Konfigurasi Project:**
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

**Build & Deploy:**
```bash
# Build image menggunakan Cloud Build
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/ugc-master

# Deploy ke Cloud Run
gcloud run deploy ugc-master \
  --image gcr.io/YOUR_PROJECT_ID/ugc-master \
  --region asia-southeast2 \
  --platform managed \
  --allow-unauthenticated
```
*(Sesuaikan region, konfigurasi memori, timeout, dan port lingkungan sesuai kebutuhan aplikasi).*

---

### 4. Google Compute Engine (GCE)
1. Buat instance VM Linux melalui Google Cloud Console.
2. Atur aturan *firewall* dan akses SSH.
3. Install Node.js, Python, FFmpeg, Git, dan Nginx pada VM.
4. Clone repository dan pasang *dependencies*.
5. Konfigurasikan file lingkungan (`.env`).
6. Jalankan aplikasi menggunakan PM2 atau Docker.
7. Konfigurasikan Nginx sebagai reverse proxy dan aktifkan SSL.

---

## 🔄 CI/CD Pipeline

UGC Master mendukung otomatisasi *build* dan publikasi Docker image ke GitHub Container Registry (GHCR) menggunakan GitHub Actions.

**Workflow Overview:**
```text
Developer Push ➔ GitHub Repository ➔ GitHub Actions ➔ Build Docker Image ➔ Publish to GHCR ➔ Deployment Environment
```

**GHCR Image Format:**
```text
ghcr.io/USERNAME/REPOSITORY:latest
```

**Recommended GitHub Secrets:**
| Secret Name | Description |
| :--- | :--- |
| `GEMINI_API_KEY` | API Key untuk integrasi AI (jika digunakan) |
| `DEPLOY_HOST` | IP atau hostname server tujuan *deployment* |
| `DEPLOY_USER` | Username akses SSH server |
| `DEPLOY_SSH_KEY` | SSH private key untuk otentikasi server |

[![Docker Build Status](https://github.com/Cerminsiji/UGC-Master-v2/actions/workflows/docker-build.yml/badge.svg)](https://github.com/Cerminsiji/UGC-Master-v2/actions/workflows/docker-build.yml)

---

## 🧹 MetaCleaner Workflow

Alur standar proses pembersihan metadata file media:

```text
Input Media ➔ Metadata Inspection ➔ Metadata Processing ➔ Output Validation ➔ Processed Media
```

**Recommended Steps:**
1. Siapkan file media mentah yang akan diproses.
2. Lakukan inspeksi metadata awal sebelum pemrosesan.
3. Jalankan fungsi *MetaCleaner* sesuai skenario kebutuhan.
4. Simpan hasil pemrosesan file.
5. Periksa kembali struktur file hasil akhir untuk memastikan kualitas audio dan video tetap optimal.

---

## 🧰 Troubleshooting

1. **`npm install` gagal:**
   * Pastikan versi Node.js dan npm kompatibel (`node -v`).
   * Jalankan pembersihan cache: `npm cache verify && npm install`.

2. **FFmpeg tidak ditemukan oleh sistem:**
   * Install ulang atau pastikan path FFmpeg terdaftar di PATH environment variabel server (`sudo apt install ffmpeg -y`).

3. **Port 3000 sudah digunakan:**
   * Periksa proses aktif: `sudo lsof -i :3000`, lalu sesuaikan port aplikasi atau hentikan proses terkait.

4. **PM2 application error:**
   * Cek status: `pm2 status`, periksa log: `pm2 logs ugc-master`, atau lakukan *restart*: `pm2 restart ugc-master`.

5. **Nginx configuration error:**
   * Validasi sintaks konfigurasi: `sudo nginx -t` lalu cek status layanan: `sudo systemctl status nginx`.

---

## 📁 Project Structure

Struktur direktori standar proyek:

```text
UGC-Master-v2/
│
├── public/
├── src/
├── scripts/
├── assets/
│
├── .github/
│   └── workflows/
│       └── docker-build.yml
│
├── Dockerfile
├── docker-compose.yml
├── package.json
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

---

## 🔒 Security Policy

* **Jangan pernah melakukan commit file `.env`** ke dalam sistem version control.
* Lindungi dan rahasiakan API Key; hindari eksposur di sisi *client/frontend*.
* Batasi ukuran file unggahan (*upload limit*) sesuai kapasitas server untuk mencegah serangan *Denial of Service* (DoS).
* Selalu gunakan protokol HTTPS untuk *deployment* di lingkungan produksi publik.
* Perbarui *dependencies* secara berkala guna meminimalisir celah keamanan kerentanan (*vulnerabilities*).

---

## 🤝 Contributing

Kontribusi, saran, dan pengembangan lanjutan sangat terbuka lebar.

**Contribution Steps:**
1. Fork repository ini.
2. Buat branch fitur baru (`git checkout -b feature/nama-fitur`).
3. Lakukan *commit* perubahan (`git commit -m "Add amazing feature"`).
4. Dorong ke branch Anda (`git push origin feature/nama-fitur`).
5. Buat *Pull Request* baru ke branch utama.

Gunakan tab **GitHub Issues** untuk melaporkan *bug*, kendala teknis, atau mengajukan usulan fitur baru.

---

## 📝 License

Informasi lisensi merujuk pada file `LICENSE` yang disertakan di dalam repository ini.

---

<div align="center">

### ⭐ Support the Project

Jika proyek ini membantu *workflow* Anda, berikan dukungan dengan menekan tombol **Star** di GitHub!

<br>

[![View Repository](https://img.shields.io/badge/GitHub-View%20Repository-181717?style=for-the-badge&logo=github)](https://github.com/Cerminsiji/UGC-Master-v2)
[![Star Project](https://img.shields.io/badge/Star-Project-yellow?style=for-the-badge&logo=github)](https://github.com/Cerminsiji/UGC-Master-v2/stargazers)
[![Report Bug](https://img.shields.io/badge/Report-Bug-red?style=for-the-badge&logo=github)](https://github.com/Cerminsiji/UGC-Master-v2/issues)

<br>

**UGC Master V2.5**  
*Create • Process • Optimize*

Made with ❤️ for Content Creators

</div>
