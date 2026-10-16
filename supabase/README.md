# SQL yang perlu dipasang untuk PiwuApp

**Baca ini dahulu. Jangan menjalankan installer baru dan migration satu-per-satu pada database yang sama. Pilih salah satu jalur.** Jalankan melalui **Supabase → SQL Editor → New query**, sebagai operator database tepercaya, bukan dari browser aplikasi.

SQL ini menyiapkan database; tidak membuat akun Auth, mengirim email, memasang key, mengaktifkan provider, atau membuktikan layanan produksi bekerja.

## A. Project Supabase baru, belum pernah dipasang PiwuApp

1. Pastikan project benar-benar baru/dikhususkan untuk PiwuApp. Auth dan Storage bawaan Supabase harus tersedia.
2. Buka [`install/INSTALL_NEW_DATABASE.sql`](install/INSTALL_NEW_DATABASE.sql), salin **seluruh isi**, lalu Run sekali di SQL Editor. File ini menggabungkan migration **001–010** dalam **satu transaksi**, dengan pemeriksaan konflik objek/bucket. Jika ada error, transaksi dibatalkan; jangan melanjutkan dari potongan tengah atau menghapus data untuk memaksa berhasil.
3. Jalankan [`install/CHECK_INSTALLATION.sql`](install/CHECK_INSTALLATION.sql). Lihat setiap result set: marker 001–010 seharusnya `MARKER_TERDETEKSI`; tabel/RLS, RPC penting dan bucket seharusnya `OK`.
4. Lanjutkan bootstrap admin di bagian C.

**Setelah installer gabungan berhasil, jangan jalankan lagi file 001–010 satu-per-satu.** Installer menolak database yang telah memiliki objek PiwuApp. Jangan menghapus guard-nya.

## B. Database lama / pernah menjalankan sebagian migration

1. **Backup dahulu**, simpan SQL/migration yang pernah dijalankan, dan uji upgrade pada staging bila database menyimpan data pengguna.
2. Jalankan `install/CHECK_INSTALLATION.sql`. Ini read-only dan boleh diulang. Marker hanya petunjuk objek yang tersedia, **bukan histori/checksum** atau bukti seluruh policy benar. Bila hasil bercampur/tidak konsisten, hentikan dan tinjau—jangan menebak atau menjalankan installer baru.
3. Cocokkan dengan riwayat perubahan database. Jalankan **hanya migration yang belum dipasang**, satu file penuh per query, sesuai urutan di bawah.
4. Jalankan pemeriksaan kembali. Jika SQL Editor masih berada dalam transaksi gagal, jalankan `ROLLBACK;` sebelum mencoba query lain. Jangan mengganti error dengan `DROP TABLE`, reset database atau menonaktifkan RLS.

| Urutan | File kanonis                                                 | Isi utama                                                       |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------------- |
| 001    | [001_schema.sql](001_schema.sql)                             | Tabel fondasi project, RLS dan bucket privat                    |
| 002    | [002_workspace_sync.sql](002_workspace_sync.sql)             | Snapshot workspace, revisi dan RPC sinkronisasi                 |
| 003    | [003_services.sql](003_services.sql)                         | Kredit, pembayaran, undangan, publish, storage, rekaman         |
| 004    | [004_project_data.sql](004_project_data.sql)                 | Dataset privat, validasi dan konflik revisi                     |
| 005    | [005_admin.sql](005_admin.sql)                               | Peran admin, broadcast, audit, suspension, lock dan maintenance |
| 006    | [006_studio_bridge.sql](006_studio_bridge.sql)               | Bridge Roblox Studio yang hanya diakses server                  |
| 007    | [007_runtime_coordination.sql](007_runtime_coordination.sql) | Rate limit dan admission sandbox bersama                        |
| 008    | [008_admin_directory.sql](008_admin_directory.sql)           | Pencarian akun admin melalui RPC service-only                   |
| 009    | [009_search_cache.sql](009_search_cache.sql)                 | Cache pencarian bersama di atas tabel service-only              |
| 010    | [010_credit_lots.sql](010_credit_lots.sql)                   | Kredit bentuk lot: jatah harian, rollover paket, kedaluwarsa    |

Contoh: **jika sudah dipastikan 001–006 lengkap**, jalankan 007, 008, 009, lalu 010. Jika baru 001–005, jalankan 006 sampai 010. File 001–006 tidak didesain untuk dijalankan berulang.

**Migration 010 mengubah cara kredit bekerja dan sebaiknya direncanakan, bukan dijalankan diam-diam:** setelah dipasang, saldo yang ada dipindahkan menjadi satu lot dengan masa berlaku 12 bulan (referensi `migrasi-010:<user_id>`), kredit baru masuk sebagai lot bertanggal (harian hangus di akhir hari UTC, paket 2 bulan, top-up 12 bulan), dan `piwu_ensure_credits` tidak lagi memberi jatah sekali — ia mengisi jatah harian 20 (Free/Pro) atau 40 (Team) kredit. Artinya janji lama "kredit tidak kedaluwarsa" berhenti berlaku tepat saat 010 dijalankan, dan saldo akun yang menganggur lebih dari 12 bulan akan hangus. Setelah dipasang, halaman akun membaca jatah harian dari fungsi read-only `public.piwu_credit_status(uuid)`; sebelum 010 ada, halaman itu menyebut migration ini alih-alih menampilkan kuota yang tidak ditegakkan. Jalankan 010 pada jendela yang Anda pantau, lalu periksa hasilnya dengan `CHECK_INSTALLATION.sql` (marker `010` harus `MARKER_TERDETEKSI`, termasuk `piwu_credit_status`).

File gabungan tetap menjalankan isi kanonis di atas; hanya transaksi terluarnya digabung dan ditambahkan guard instalasi baru serta notifikasi reload schema. Paket ini ditujukan untuk SQL Editor, bukan mengganti histori internal Supabase CLI.

## C. Aktifkan superadmin pertama

1. Pasang environment frontend/backend yang benar dan aktifkan autentikasi email/redirect di Supabase. **Service-role key hanya backend**, tidak pernah `VITE_*` atau chat.
2. Daftar akun sungguhan dan selesaikan verifikasi email. **Tidak perlu membuat password atau akun dengan SQL.**
3. Buka [`install/BOOTSTRAP_FIRST_ADMIN.sql`](install/BOOTSTRAP_FIRST_ADMIN.sql).
4. Ganti nilai `GANTI_EMAIL_ADMIN_DI_SINI` dengan email akunmu **hanya pada salinan di SQL Editor**. Jangan commit salinan berisi alamat pribadi/key ke repository.
5. Jalankan seluruh file. Script menolak akun tidak ditemukan, belum terverifikasi, anonymous, ditangguhkan, atau jika superadmin sudah ada. Pemberian peran dan audit `bootstrap_superadmin` dilakukan dalam transaksi yang sama.
6. Login dengan akun tersebut, buka **`/admin` → Diagnostik**. Administrator berikutnya dikelola lewat panel, bukan mengulang bootstrap.

Bootstrap ini memberi peran aplikasi pada akun terverifikasi yang sudah ada; tidak mengubah password atau membuat akses demo. Lindungi akses SQL Editor/operator database karena ia lebih berkuasa daripada role aplikasi.

## D. Setelah SQL selesai

- Konfigurasikan environment sesuai `.env.example` dan [panduan layanan](../docs/SERVICES_SETUP.md).
- Jalankan `npm run verify:readiness` pada backend yang sudah hidup. Probe tidak menggantikan uji akun/RLS/provider sungguhan.
- Produksi memakai `NODE_ENV=production` dan koordinasi database; jangan memaksa mode memory untuk melewati error. Sandbox interaktif lintas server memerlukan sticky routing.
- Uji minimal dua akun berbeda; verifikasi pengguna biasa tidak dapat mengakses `/admin` atau membaca project orang lain.
- Ikuti [acceptance produksi/native](../docs/NATIVE_PRODUCTION_ACCEPTANCE.md). Ada risiko dependency Expo yang masih terbuka; memasang SQL tidak menutup risiko tersebut.

## Verifikasi paket ini

- Installer gabungan diuji pada PostgreSQL embedded PGlite dengan schema Auth/Storage pendamping: instalasi baru, penolakan instalasi ulang/konflik bucket, rollback penuh pada kegagalan akhir, diagnosis sebelum/sesudah install, dan bootstrap akun terverifikasi beserta audit.
- Ekstensi `pgcrypto` tidak tersedia di PGlite; hanya deklarasi extension dihapus dari salinan uji, tidak dari file Supabase yang disediakan.
- Ini bukan bukti migration sudah dijalankan pada database live kamu. Uji ulang RLS, Storage, Realtime dan hak akun pada Supabase staging.

Untuk pengembang: `npm run sql:bundle` memperbarui installer dari migration kanonis; `npm run sql:check` mendeteksi perbedaan. Tes: `node --import tsx --test tests/sql-install.test.ts`. Jangan mengedit file gabungan secara manual.
