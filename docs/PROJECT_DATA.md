# Tabel data project (migration 004)

Panel Database sekarang membedakan **demo lokal** dan **dataset cloud** secara eksplisit. Akun nyata tidak beralih diam-diam ke tabel demo ketika layanan gagal.

## Aktivasi

1. Terapkan migration 001–003, lalu `supabase/004_project_data.sql` sekali pada Supabase staging.
2. Konfigurasi Supabase frontend dan service API seperti SERVICES_SETUP.md. Masuk dengan akun terverifikasi dan sinkronkan project terlebih dahulu.
3. Buka workspace → Database. Buat tabel, tambahkan kolom/baris, lalu pilih **Simpan ke cloud**.

Data disimpan sebagai JSONB terstruktur di `project_datasets`, bukan membuat tabel PostgreSQL/DDL dari input pengguna. Dataset hanya untuk anggota workspace; ini **bukan backend publik atau autentikasi pengguna aplikasi hasil publish**.

## Fitur dan batas

- Tipe teks, angka, ya/tidak; nilai kosong diizinkan. Kunci kolom berupa huruf kecil/angka/underscore, diawali huruf.
- Maksimal 20 tabel per project, 32 kolom per tabel, 1.000 baris, 2 MB, dan 4.000 karakter per nilai teks. Angka dibatasi ±10^15; bukan tipe desimal uang presisi arbitrer.
- Owner/Editor membuat dan mengubah tabel, kolom serta baris. Viewer membaca/mengekspor saja. Hanya Owner menghapus seluruh tabel cloud; Editor tetap dapat mengubah atau menghapus isi baris/kolom.
- Semua save/delete menyertakan revisi. RPC mengunci data dan menolak revisi lama; tidak ada force-overwrite. Delete tidak dapat dibatalkan oleh stale save yang membuat ulang ID lama.
- Konflik mempertahankan draft. Pilih ekspor JSON, muat ulang cloud dengan konfirmasi, atau simpan sebagai tabel baru. Simpan-sebagai-baru tetap tunduk pada nama unik dan batas jumlah tabel.
- Draft disimpan di IndexedDB menurut akun/project/tabel. **Tidak terenkripsi**; akun terpisah dalam UI bukan kerahasiaan terhadap pemilik profil browser. Kegagalan storage/validasi menampilkan peringatan. Ekspor JSON sebelum keluar jika draft belum tersimpan di perangkat.
- Pergantian tabel mempertahankan draft yang valid. Reload memulihkan draft tanpa otomatis mengirimnya ke server. Tombol **Buang draft lokal** tidak menghapus data cloud.
- Impor JSON berformat `piwu-data-v1` membuat draft baru dengan ID tabel/baris baru. Tidak menggabungkan atau menimpa tabel cloud. CSV/SQL import belum tersedia.
- Daftar metadata diperiksa setiap 30 detik. Perubahan remote memberi peringatan; isi draft tidak diganti otomatis. Ini bukan CRDT atau sinkronisasi sel realtime.
- Dataset bukan bagian snapshot kode, versi AI, ZIP kode, template marketplace, atau recording. Ekspor JSON adalah cadangan terpisah; versi tabel historis dan restore cloud belum dibangun.

## Otorisasi

RLS melindungi SELECT. Direct INSERT/UPDATE/DELETE dicabut dari authenticated/anon. RPC `piwu_save_dataset` dan `piwu_delete_dataset` menggunakan `auth.uid()`, search_path tetap, pemeriksaan role, validasi JSON/tipe/ukuran, dan revision check. Service API memakai **JWT client milik pemanggil** untuk RPC, bukan service-role client. Identitas author tidak diterima dari body.

## Bukti pengujian

- PostgreSQL PGlite menjalankan migration 001–004, menguji Owner/Editor/Viewer/outsider, revocation, direct-write denial, stale save/delete, tipe/ukuran, cross-project adoption, dan cascade.
- API test memastikan parameter actor tidak diambil dari body, hasil RPC diminta sebagai satu object, dan penghapusan memerlukan Owner.
- Browser test menggunakan repository fixture untuk UI save, Viewer, konflik/save-as-new, kegagalan jaringan, dan pemisahan draft akun. Ini bukan bukti koneksi Supabase live.

Penggunaan nyata masih memerlukan acceptance staging pada Supabase, backup database, kebijakan retensi/penghapusan, dan pembatasan kapasitas per akun. Jangan menyimpan credential atau data sensitif di demo/cache browser.
