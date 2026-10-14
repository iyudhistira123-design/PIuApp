# Aktivasi layanan PiwuApp

**Status:** jalur integrasi dan UI sudah tersedia, tetapi akun eksternal belum dikonfigurasi/diuji live dalam workspace ini. Flag `/api/status` hanya menyatakan keberadaan konfigurasi. Tidak ada kredensial, transaksi, OTP, atau deployment sungguhan yang dibuat oleh pengujian lokal.

Jangan menempelkan secret di chat. Isi environment melalui secret manager/deployment dashboard atau `.env` lokal yang diabaikan Git. Nilai `VITE_*` masuk ke bundle browser; **hanya URL dan anon/publishable key Supabase** yang boleh memakai prefix itu.

## 1. Database, akun, dan AI

1. Gunakan Supabase **staging** yang terpisah dari produksi. Backup bila database sudah berisi data.
2. Terapkan migration sekali, berurutan: `001_schema.sql`, `002_workspace_sync.sql`, `003_services.sql`, `004_project_data.sql`, lalu `005_admin.sql`. Bootstrap admin pertama mengikuti [ADMIN.md](ADMIN.md). Migration ini bukan skrip idempoten untuk dijalankan ulang.
3. Isi `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, dan server-only `SUPABASE_SERVICE_ROLE_KEY`. Aktifkan verifikasi email/nomor serta batasi signup/rate limit di Supabase.
4. Atur Site URL, redirect allowlist, email delivery, dan Google OAuth bila digunakan. Frontend dan API harus satu origin HTTPS. Isi `APP_BASE_URL` dengan origin publik sebenarnya, termasuk host preview bila menguji preview. Jangan gunakan localhost untuk tautan yang dibuka pengguna jarak jauh.
5. Isi `LLM_BASE_URL` (base kompatibel OpenAI, biasanya berakhir `/v1`), `LLM_API_KEY`, dan `LLM_MODEL`. Override tier opsional: `LLM_MODEL_CEPAT`, `LLM_MODEL_SEIMBANG`, `LLM_MODEL_KUAT`. Gunakan HTTPS untuk provider eksternal.
6. Restart dev server. Perubahan `VITE_*` juga memerlukan rebuild saat produksi.
7. Masuk sebagai akun nyata, buat project, tunggu **Tersinkron**. Buka **Layanan → Status → Periksa koneksi Supabase & AI**. Pemeriksaan ini menguji Auth, tabel kredit, dan endpoint daftar model; **bukan** bukti inference, multimodal, atau semua migration bekerja.
8. Uji Ask, Plan, Builder, review, restore, stop, dan kegagalan provider. Plan harus berisi goal/tasks; Ask/Plan tidak dapat mengirim perubahan file. Kredit awal 30, Ask 1, Plan 2, Builder Cepat 1/Seimbang atau Otomatis 3/Kuat 8. Otomatis dapat memilih model kuat tetapi tetap tarif Otomatis. Tidak ada klaim chain-of-thought: summary hanyalah ringkasan implementasi publik.

AI menerima maksimal 3 lampiran, masing-masing 4 MB: PNG/JPG/WebP, PDF teks (20 halaman pertama, 20.000 karakter), TXT. UI saat ini mengirim satu lampiran per pesan. `.fig` harus diekspor sebagai gambar/PDF. PDF diproses di worker dengan batas waktu 15 detik dan heap 192 MB; ini bukan isolasi OS/container. Gambar memerlukan model vision. URL referensi maksimal 2 per permintaan; UI memakai satu referensi dari tab Referensi URL. Halaman JS-only/login mungkin tidak menghasilkan konten bermakna. Clone berarti interpretasi desain orisinal, bukan salinan pixel-perfect atau pengambilan aset berlisensi.

## 2. OTP WhatsApp

- Aktifkan phone auth dan **Send SMS Hook** Supabase ke `POST {APP_BASE_URL}/api/webhooks/whatsapp`.
- Simpan signing secret hook ke `SUPABASE_SMS_HOOK_SECRET`. Implementasi memverifikasi Standard Webhooks, timestamp, ID, dan deduplikasi payload; bukan endpoint OTP tanpa autentikasi.
- Gunakan akun WhatsApp Business/Meta dengan nomor terdaftar dan **Authentication template yang disetujui**, parameter OTP pada body serta URL button. Isi `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_LANGUAGE`, `WHATSAPP_GRAPH_VERSION`.
- Supabase membuat, menyimpan, mengatur kedaluwarsa, dan memverifikasi OTP. PiwuApp tidak membuat kode fallback. Tombol login menggunakan channel SMS Supabase yang delivery-nya dialihkan oleh hook ke WhatsApp.
- Uji consent penerima, format E.164, expiry, resend/rate-limit, signature salah, hook replay, kegagalan Meta, dan verifikasi kode salah. `processing` yang tertinggal akibat crash harus diperiksa operator sebelum retry; jangan menghapus receipt secara sembarangan.

## 3. Sandbox, npm, dan Lighthouse

1. Siapkan akun E2B dan `E2B_API_KEY` server-only. Eksekusi kode user **tidak pernah** memakai shell host PiwuApp.
2. Bangun template Node 22 + Chromium + Lighthouse dengan skrip administrator:
   ```sh
   node --env-file=.env scripts/build-sandbox-template.mjs
   ```
   Skrip ini menggunakan SDK E2B terpasang; belum dijalankan live di sini. Build template menggunakan infrastruktur akun Anda dan dapat dikenai biaya. Jangan memasukkan secret lain dalam image, build context, atau environment template.
3. Isi `E2B_TEMPLATE` dengan alias yang dihasilkan (default skrip `piwuapp-node-audit`). Template mengatur `CHROME_PATH=/usr/bin/chromium`.
4. Terminal menjalankan shell non-interaktif, maksimal 90 detik per perintah; 1 kredit. Ini bukan PTY/persistent shell session. Direktori kerja tetap `/home/user/project`; perubahan `cd`/shell variables tidak bertahan antarperintah.
5. **Layanan → Paket** mencari registry npm, install/uninstall, preview eksternal, impor snapshot, dan stop. Install/preview 2 kredit. `npm install --ignore-scripts` menghindari lifecycle script saat instalasi; paket yang benar-benar membutuhkan postinstall dapat gagal dan perlu ditinjau.
6. Perubahan `package.json` dapat dipulihkan melalui versi. Perubahan dari shell **tidak otomatis mengganti editor**; gunakan **Impor perubahan sandbox** dengan konfirmasi. File biner, secrets, build, node_modules, file >256 KB, atau snapshot >4 MB tidak diimpor. Edit cloud yang baru menyinkronkan path terkait ke sandbox dan dapat mengganti perubahan shell yang belum diimpor.
7. Sandbox TTL 10 menit, maksimal dua sesi aktif per akun dalam satu proses API. Sesi hilang setelah restart API; batas global/sesi masih in-memory, sehingga deploy awal harus satu instance. Preview sandbox dapat diakses pemegang URL sampai sandbox berhenti.
8. Lighthouse menjalankan build nyata di sandbox, 3 kredit. Hasil asli disimpan dalam `scan_reports`; tidak ada skor sintetis. Audit gagal bila template/browser belum siap. Laporan Lighthouse upstream dapat memuat judul bahasa Inggris.

## 4. Kolaborasi

- Owner membuat undangan Viewer/Editor di Layanan → Anggota. Tautan sekali pakai, SHA-256 di database, 7 hari. Undangan dengan email harus diterima oleh akun dengan email yang sama dan sudah diverifikasi.
- Email opsional melalui `RESEND_API_KEY` + `EMAIL_FROM` dari domain terverifikasi. Jika email gagal, UI tetap menampilkan tautan dan mengatakan email belum terkirim.
- Owner mencabut undangan/membership; API juga mendukung perubahan role. Owner tidak dapat diubah melalui endpoint anggota.
- Migration 003 menambahkan policies kanal private Realtime dan publication `project_workspaces` bila Supabase Realtime tersedia. Uji RLS kanal pada Supabase asli. Presence hanya indikasi kehadiran, bukan bukti identitas/cursor terverifikasi.
- Perubahan remote memicu antrean sync yang sama dengan fallback polling. Konflik revisi tetap eksplisit; ini **bukan CRDT atau penggabungan karakter simultan**.
- Komentar cloud memiliki author_id dari JWT, terpisah dari komentar demo dalam snapshot notebook.

## 5. Publish, domain, analytics

- Isi `NETLIFY_TOKEN`, E2B variables, dan `APP_BASE_URL`. Owner saja yang bisa publish/domain/rollback/unpublish. Biaya publish 5 kredit.
- Queue tersimpan di PostgreSQL, satu job aktif per project; lease 15 menit, maksimal tiga pengambilan ulang untuk worker yang hilang. Proses gagal mengembalikan kredit; recovery reservations berjalan setiap menit, setelah batas 35 menit. Antrean yang menunggu >1 jam dibatalkan.
- Build Vite menghasilkan `dist` maksimal 25 MB/500 file. Lighthouse performa, SEO, dan aksesibilitas masing-masing harus ≥60. Ini gate dasar, **bukan audit keamanan atau jaminan kualitas**.
- Setelah upload, status hosting harus dikonfirmasi sebelum deployment/job/settlement kredit ditandai selesai dalam transaksi SQL. Timeout dapat berarti provider sudah menerima upload; periksa dashboard hosting sebelum mengulang. Retry tidak menjamin exactly-once resource pada provider eksternal.
- Subdomain menggunakan domain hosting Netlify, **bukan klaim kepemilikan `piwuapp.app`**. Domain custom memerlukan DNS milik pengguna. Ikuti CNAME yang ditampilkan; apex menggunakan petunjuk DNS provider. **Periksa SSL** baru menandai aktif ketika sertifikat `issued` mencakup hostname.
- **Hentikan publikasi** menghapus site hosting, bukan kode workspace. Penghapusan project juga membuat `hosting_cleanup_jobs`; worker mencoba menghapus site hingga 5 kali. Jika provider mati/token dicabut, website dapat tetap online sampai cleanup berhasil. Operator wajib memonitor dan menangani antrean gagal.
- Analytics tanpa cookie, DNT/GPC dihormati. IP mentah tidak disimpan. `ANALYTICS_HASH_KEY` menghasilkan hash perangkat-harian berotasi; bukan jumlah orang unik. Referrer hanya hostname, path tanpa query. Ringkasan maksimal 10.000 event terbaru dalam 30 hari, dengan label sampling. Retensi 31 hari dibersihkan oleh worker. Statistik tidak tahan bot/spoofing untuk penggunaan finansial.

## 6. Pembayaran, kredit, referral, marketplace

- Mulai dari **sandbox provider**, bukan pembayaran nyata. Set `PAYMENT_PROVIDER=midtrans` atau `xendit`.
- Midtrans: isi `MIDTRANS_SERVER_KEY`; `PAYMENT_LIVE=false` memakai sandbox endpoint. Notification URL: `/api/webhooks/payments/midtrans`. Signature SHA-512 diverifikasi, lalu status diambil ulang ke API provider.
- Xendit: isi `XENDIT_SECRET_KEY` test-mode dan `XENDIT_WEBHOOK_TOKEN`. Invoice callback: `/api/webhooks/payments/xendit`. Test/live Xendit ditentukan jenis API key; **flag PAYMENT_LIVE tidak mengubah mode key Xendit**. Token callback diperiksa dan invoice dibaca ulang server-side.
- Harga/kredit berasal dari katalog server, bukan request client. Webhook/refresh mengecek ID, amount, IDR, dan settlement. Browser redirect tidak menambah kredit. Pemenuhan transaksi idempoten melalui row lock dan ledger unik.
- Pro Rp199.000/600 kredit; Team Rp499.000/2.000 kredit; top-up 100 Rp49.000, 500 Rp199.000. Paket prabayar 30 hari, tidak auto-renew. Pembelian paket berikutnya dijadwalkan setelah periode sebelumnya; kredit langsung ditambahkan. Tidak ada prorata upgrade. Pembatasan fitur berdasarkan tier belum lengkap; kredit merupakan pembatas penggunaan yang aktif.
- Midtrans full refund/chargeback mencabut kredit, entitlement, revenue, dan bonus referral terkait. Saldo bisa negatif. Partial refund ditandai `review` untuk rekonsiliasi manual. Xendit refund lifecycle di luar invoice callback **belum otomatis**; operator harus melakukan rekonsiliasi. Jangan mengaktifkan uang nyata sebelum alur ini memenuhi kebijakan bisnis dan diuji provider.
- Referral diklaim akun terverifikasi dalam 7 hari, sebelum pembayaran pertama. Bonus 50 untuk kedua akun setelah pembelian paket/top-up minimal Rp49.000; pembelian template tidak menghasilkan bonus. Anti-fraud multiakun memerlukan kontrol tambahan sebelum promosi publik.
- Marketplace mempublikasikan snapshot kode, tanpa chat, ledger, atau env_vars. Snapshot berbayar hanya dikirim ke pemilik/pembeli dengan entitlement. Pendapatan bersih 80% dicatat, bukan langsung dibayarkan. **Payout, KYC, pajak, dispute, moderasi, dan refund parsial belum otomatis.**

## 7. Secrets, storage, rekaman

- Buat `SECRETS_ENCRYPTION_KEY` 32 byte acak dalam format 64 hex melalui secret manager. AES-256-GCM memakai nonce acak dan AAD project/environment/key. Backup/rotasi master key harus dikelola operator; kehilangan key berarti tidak dapat mendekripsi data.
- UI hanya menerima input dan menampilkan nama/environment. Tidak ada read-plaintext endpoint. Ini **bukan KMS envelope encryption** dan secret tidak otomatis diinjeksikan ke aplikasi statis/E2B.
- Storage memakai bucket privat `project-assets`; URL signed berlaku 5 menit. Validasi signature file bukan antivirus/DLP lengkap.
- Rekaman berupa snapshot kode dan label aksi, bukan video. Disimpan di IndexedDB, dipisahkan berdasarkan akun/project di UI; bukan enkripsi browser. Timeline memiliki play/pause/scrub/speed dan preview terisolasi.
- Owner dapat membagikan rekaman setelah konfirmasi review data; tautan read-only 7 hari, dapat dicabut. Kode tetap dapat disalin penerima selama tautan aktif. Maksimal 100 snapshot/4 MB.

## 8. Menjalankan dan acceptance staging

```sh
npm ci
npm test
npm run build
npm start             # frontend + API satu proses, default port 3001
# atau npm run dev    # Vite 3001 + API 3002
```

Pasang HTTPS reverse proxy, body/concurrency limits, HSTS/CSP yang kompatibel Monaco/preview, dan origin yang benar. Set `TRUST_PROXY_CIDRS` hanya ke proxy milik Anda; jangan trust-all. In-memory rate limit dan sandbox map bukan koordinasi multi-instance. Queue publish dan ledger sudah database-backed.

Acceptance wajib sebelum go-live:

- Empat akun: Owner/Editor/Viewer/outsider, termasuk pencabutan akses, token palsu/expired, dan dua akun dalam browser yang sama.
- Supabase Auth/PostgREST/Storage/Realtime sungguhan; login Google dan WhatsApp pada perangkat penerima.
- AI teks/gambar/PDF, Plan, stop/disconnect, secret output, insufisien kredit, provider timeout.
- Sandbox install, edit melalui shell, import/restore, expiry, stop; Lighthouse berhasil dan gagal; publish/rollback/unpublish/domain SSL; hapus project saat build.
- Provider payment sukses, pending, expired, callback berulang/out-of-order, amount mismatch, chargeback, dan rekonsiliasi gagal jaringan. Jangan gunakan kartu/dompet nyata untuk tes pertama.
- Beli template sebagai akun kedua; sumber tidak dapat diambil sebelum bayar; revoke share rekaman; tidak ada secret muncul pada bundle/log/preview.
- Pantau `publish_jobs`, `hosting_cleanup_jobs`, `credit_reservations`, `payment_orders`, `webhook_receipts`; siapkan alert, backup, kebijakan retensi, dan runbook operator.

Lingkungan coding ini belum memiliki akun/kredensial layanan tersebut dan koneksi keluar dibatasi. Hasil unit/mock/PostgreSQL lokal tidak boleh dianggap verifikasi provider live.

### Runner browser di sandbox Linux

Jalankan aplikasi pada port 3001, lalu `npm run test:e2e:sandbox`. Runner memakai Chromium dan native library dari dependency npm yang terkunci; tidak memerlukan download CDN Playwright. File hasil ekstraksi berada di `node_modules`/temporary directory dan tidak dimasukkan ke Git. `npm run test:e2e` tetap tersedia untuk instalasi Playwright biasa.

### Dataset cloud

Panel Database untuk akun nyata memakai migration 004, RPC di bawah JWT pemanggil, tipe kolom dan pemeriksaan revisi. Baca [PROJECT_DATA.md](PROJECT_DATA.md). Ini menggantikan prototipe lokal hanya untuk pengguna cloud; bukan SQL console atau backend aplikasi yang dipublikasikan.
