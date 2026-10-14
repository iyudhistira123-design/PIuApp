# Aktivasi layanan nyata

## Kondisi saat ini

Jalur demo bukan lagi pintu masuk aplikasi. Membuka `/projects`, `/project/:id`, `/admin`, atau halaman layanan tanpa sesi akun mengarah ke login. Project lama tidak dihapus: login nyata lalu impor data legacy secara eksplisit dari dialog Penyimpanan.

Pemeriksaan terakhir di lingkungan kerja: Supabase Auth dan database tidak dapat dijangkau oleh backend. Kredensial AI, E2B, hosting, pembayaran, WhatsApp, dan master key enkripsi belum tersedia. Ini adalah blocker operasional, tidak dapat diperbaiki dengan mengganti label atau membuat hasil tiruan.

## Urutan aktivasi yang diperlukan

1. **Jaringan dan Supabase:** jalankan backend di lingkungan yang dapat menjangkau project Supabase. Isi `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` melalui environment/secret manager. Jangan tempel secret di chat, source, atau file project pengguna. Jalankan migration `supabase/001_schema.sql` sampai `005_admin.sql` sesuai urutan. Atur URL redirect Auth untuk domain aplikasi; aktifkan provider login yang dipakai. Lihat CLOUD_SETUP.md dan ADMIN.md untuk RLS/bootstrap administrator.
2. **AI:** isi `LLM_BASE_URL` (base URL kompatibel chat/completions), `LLM_API_KEY`, `LLM_MODEL`; opsional model per tier. Endpoint menggunakan JWT akun, membership Editor, pemeriksaan platform dan saldo kredit. Uji Ask → Plan → Builder pada project yang tersinkron; cek versi sebelum/sesudah dan reserve/settlement kredit. Jangan menganggap hasil `/models` menjamin inference berhasil.
3. **Runtime/terminal:** isi `E2B_API_KEY` dan template yang sesuai (`E2B_TEMPLATE`). Perintah dijalankan di sandbox terisolasi dengan batas waktu; tidak ada akses shell host. Terminal saat ini non-interaktif, bukan PTY persisten. Cek output/exit code asli serta perubahan file melalui mekanisme import snapshot; jangan menganggap shell otomatis menyimpan perubahan ke cloud.
4. **Publikasi:** konfigurasi `NETLIFY_TOKEN`, `APP_BASE_URL`, E2B/template. Jalankan audit/build pada proyek uji, tunggu provider benar-benar mengonfirmasi deployment. Domain sendiri memerlukan pengaturan DNS dan verifikasi.
5. **Secrets:** buat master key AES-256-GCM 32 byte (64 hex) melalui secret manager untuk `SECRETS_ENCRYPTION_KEY`. Simpan cadangan secara aman; jangan merotasi tanpa rencana migrasi ciphertext yang sudah ada. PiwuApp tidak membuat key sementara yang berpotensi membuat secret lama tak terbaca.
6. **Pembayaran/WhatsApp/email:** ikuti SERVICES_SETUP.md. Lakukan verifikasi provider sandbox, signature callback dan idempotency sebelum mengaktifkan transaksi live. Mode sandbox provider bukan pembayaran uang nyata. Aktivasi ini tidak dilakukan otomatis dan tidak mengirim transaksi/pesan pada pemeriksaan kesiapan.

## Pemeriksaan setelah konfigurasi

- Restart backend setelah perubahan environment dan rebuild frontend jika variabel `VITE_` berubah.
- `GET /api/public/readiness`: hanya auth health dan tiga tabel inti diperiksa; hasil di-cache 30 detik. Status `configured_unverified` menunjukkan keberadaan konfigurasi, bukan koneksi provider live. Status `reachable` tidak menggantikan uji RLS dan seluruh migrasi.
- Login akun terverifikasi, buat project, tunggu “Tersinkron ke cloud”, buka di browser kedua dengan akun yang sama. Ubah file dan pastikan perubahan remote diterima tanpa menimpa draft konflik. Supabase Realtime publication dipasang oleh migration 003; koneksi gagal memakai polling, bukan kolaborasi palsu.
- Uji akun Viewer tidak dapat menulis/AI/publish, dan akun lain tidak dapat membaca project privat.
- Jalankan satu inference nyata, satu perintah shell nyata, lalu deployment uji. Periksa hasil layanan dan ledger, bukan hanya perubahan teks UI.

Pengujian otomatis menggunakan fixture jaringan yang terisolasi di `tests/` dan tidak disertakan di aplikasi. Itu bukan bukti bahwa provider eksternal sudah aktif. Seluruh daftar sisa implementasi terdapat di STATUS.md; “tanpa demo” belum sama dengan “semua fitur produksi tuntas”.
