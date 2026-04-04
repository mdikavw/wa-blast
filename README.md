# 📲 WhatsApp Reminder Automation

Aplikasi ini merupakan sistem otomatisasi pengiriman pesan WhatsApp yang membantu pengguna mengirim pesan secara massal dengan cara yang lebih efisien, terjadwal, dan tetap bersifat personal.

Aplikasi ini cocok digunakan untuk kegiatan rutin seperti pengingat, notifikasi, atau penyampaian informasi kepada banyak pihak tanpa harus mengirim pesan satu per satu.

---

## 🚀 Fitur Utama

- ✅ Pengiriman pesan WhatsApp otomatis
- ✅ Template pesan dinamis (berbasis variabel)
- ✅ Input kontak melalui halaman aplikasi
- ✅ Input template langsung dari kolom pesan
- ✅ Import data harian melalui CSV
- ✅ Penjadwalan otomatis dengan jeda acak
- ✅ Sistem skip untuk data tidak relevan
- ✅ Resume otomatis jika aplikasi ditutup

---

## 🧩 Konsep Dasar

Aplikasi ini bekerja dengan 3 komponen utama:

1. **Kontak** → diinput melalui halaman *Contact*
2. **Template Pesan** → diinput melalui kolom pesan di aplikasi
3. **Data Harian (CSV)** → data yang akan dikirim setiap hari

---

## 🧪 Cara Penggunaan

### 1. Input Kontak
- Buka halaman **Contact**
- Masukkan:
  - Nama
  - Nomor WhatsApp
  - Sapaan (Bapak/Ibu/dll)
- Simpan data kontak

---

### 2. Input Template Pesan
- Masukkan template pada kolom pesan di aplikasi

Contoh:
Selamat siang {sapaan}, {nama} memiliki {data} yang bisa digunakan

---

### 3. Import Data Harian (CSV)

Format CSV:
```csv
nomor, variabel1
628xxxxxxxxxx,10
628xxxxxxxxxx,0
```
Kolom nomor wajib ada. Variabel bisa ditambahkan sebanyak yang diperlukan

---

### 4. Jalankan Pengiriman

Klik tombol **Start Scheduler**

Sistem akan:
- Menjadwalkan pengiriman
- Mengirim pesan satu per satu
- Memberi jeda otomatis antar pesan

---

### 5. Monitoring

Status pengiriman:

- `menunggu`
- `mengirim`
- `terkirim`
- `gagal`
- `skip`

---

