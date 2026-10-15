# PiwuApp

> **Mode aplikasi saat ini: layanan nyata saja.** Login demo, AI preset lokal, shell simulasi, dan pratinjau admin telah dihapus dari jalur aplikasi. Workspace memerlukan login Supabase; AI/E2B/publish memerlukan provider server yang aktif. Jika layanan belum siap, aplikasi menampilkan error/status, bukan hasil sukses simulasi. Status koneksi ada di halaman login. Integrasi live belum terverifikasi di lingkungan ini; lihat [aktivasi layanan nyata](docs/REAL_SERVICES.md).

Chat-based app builder MVP berbahasa Indonesia. React 19, TypeScript, Vite, Tailwind, Zustand, Lucide, Monaco, xterm, Supabase/RLS, dan backend SSE OpenAI-compatible. Integrasi layanan nyata tersedia, tetapi **belum diaktifkan atau diverifikasi live** tanpa konfigurasi akun eksternal.

## Verifikasi terakhir — 15 Oktober 2026

**95/95 unit/integrasi lulus**, suite browser lengkap **66/66 lulus**, lalu regresi native/tema **8/8 lulus**. Build produksi, 11 smoke HTTP, dan tes Chromium pada aset produksi/worker Monaco lulus. Admin kini memiliki pencarian server, filter, CSV aman dan diagnostik; migration **007–008** diperlukan. [Laporan terbaru](docs/ADMIN_PRODUCTION_VERIFICATION.md).

Audit dependency utama PiwuApp: **0 temuan diketahui**. **Scaffold Expo SDK 57 masih memiliki 15 paket terdampak severity high dari dua advisory transitif**; export Android/iOS dan TypeScript berhasil, tetapi belum uji perangkat asli. Sebelas kapabilitas layanan masih `not_configured`; belum sertifikasi produksi/pentest. [Acceptance yang masih terblokir](docs/NATIVE_PRODUCTION_ACCEPTANCE.md).

## Menjalankan

```sh
npm install
cp .env.example .env
npm run dev
```

Buka port **3001**. Vite meneruskan `/api` ke backend port 3002; browser tidak memanggil localhost untuk API. Server menerima host preview Arena.

- `/` — landing page lengkap
- `/login` — login/signup Supabase dan status kesiapan layanan
- `/forgot-password`, `/reset-password` — pemulihan password Supabase (memerlukan konfigurasi email/redirect)
- `/projects` — dashboard akun cloud dengan cache offline
- `/project/:id` — IDE, React live preview, AI panel, menu **Layanan**
- `/account` — kredit, checkout, pesanan, referral, pendapatan template
- `/marketplace` — template komunitas gratis/berbayar
- `/admin` — administrasi pengguna/project/transaksi/broadcast/layanan/audit; memerlukan peran administrator yang diverifikasi server
- `/invite/:token`, `/recording/:token` — undangan dan replay read-only

## Alur setelah layanan diaktifkan

1. Tulis ide di landing → login akun terverifikasi → project tersinkron ke cloud.
2. Edit `src/App.tsx` atau CSS di Monaco; preview diperbarui otomatis.
3. Kirim instruksi ke provider AI aktif → lihat diff → **Terima semua**. Tanpa provider, tidak ada perubahan preset.
4. Pulihkan di **Riwayat**; coba **Plan**, edit checklist, **Setujui & Bangun**.
5. **Design** → klik teks → ubah style → terapkan ke kode.
6. **Canvas** → bandingkan frame desktop/tablet/ponsel, geser dan ubah ukuran frame, gunakan zoom/pan serta undo layout. [Panduan canvas](docs/CANVAS.md).
7. Export ZIP dari dropdown project atau dialog Publish.
8. Klik **Rekam**, edit kode, lalu **Stop** untuk player timeline.
9. **Layanan** menampilkan status konfigurasi, kolaborasi, sandbox/npm, storage/secrets, URL reference, publish/domain, analytics, audit dan marketplace.

Hero landing memakai video awan pilihan pengguna, dengan autoplay tanpa kontrol player dan fallback hemat gerak/data. Sumber dan opsi self-hosted: [MEDIA.md](docs/MEDIA.md).

Chat AI punya pemilih model: pilih preset tier (Otomatis/Cepat/Seimbang/Kuat) **atau** model mana pun yang dilayani `LLM_API_KEY` Anda — daftar diambil dari `GET {LLM_BASE_URL}/models`, jadi DeepSeek, Claude, GLM, Qwen, dan model lain di key itu semuanya muncul (dikelompokkan hanya untuk tampilan, pencarian, dan bisa di-scroll keyboard). Model yang dipilih dikirim apa adanya, balasan menampilkan nama model yang menjawab, dan estimasi kredit di composer mengikuti aturan server. Detail konfigurasi: [SERVICES_SETUP.md](docs/SERVICES_SETUP.md).

Landing juga memakai lapisan animasi terisolasi (`landing-motion.css` + `useLandingMotion.ts`): entrance hero bertahap, reveal saat scroll, ambient gradien, indikator progres, dan micro-interaction hover. Konten hanya disembunyikan setelah JavaScript aktif (`html.js-reveal`), tanpa IntersectionObserver semua blok tetap tampil, dan `prefers-reduced-motion` mematikan seluruh gerakan.

**Tidak ada fallback AI atau shell simulasi.** Tidak ada pembayaran, email undangan, OTP, atau deployment publik yang diaktifkan diam-diam.

## Paket SQL siap dipasang

Mulai dari **[supabase/README.md](supabase/README.md)**. Database baru memakai satu file `supabase/install/INSTALL_NEW_DATABASE.sql` (001–008, transaksi atomik). Database lama hanya menjalankan migration yang belum diterapkan—**jangan gunakan installer baru**. Paket juga menyediakan `CHECK_INSTALLATION.sql` yang read-only dan `BOOTSTRAP_FIRST_ADMIN.sql` untuk akun email terverifikasi, tanpa password bawaan.

## Konfigurasi cloud / provider

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: URL project + anon/publishable key, bukan service role.
- Email/Google auth harus diaktifkan di Supabase, dengan redirect URL deployment terdaftar.
- `LLM_BASE_URL`: endpoint kompatibel OpenAI, mis. `https://your-provider.example/v1`.
- `LLM_API_KEY` dan `LLM_MODEL`: server-only.
- Terapkan `supabase/001_schema.sql` lalu `supabase/002_workspace_sync.sql` dan `supabase/003_services.sql`; tambahkan `supabase/004_project_data.sql` untuk dataset cloud dan `supabase/005_admin.sql` untuk administrasi platform; `supabase/006_studio_bridge.sql` diperlukan untuk bridge Roblox Studio. Tambahkan `supabase/007_runtime_coordination.sql` untuk rate limit/kuota bersama dan `supabase/008_admin_directory.sql` untuk pencarian akun admin. Migration menyediakan tabel, RLS, dan RPC cloud. Akun terverifikasi menggunakan antrean autosave; project demo hanya diunggah setelah impor eksplisit.
- Ikuti [panduan cloud](docs/CLOUD_SETUP.md) untuk konfigurasi, batasan, dan skenario pengujian staging.

Panduan lengkap environment, webhook, E2B template, pricing, limits, dan acceptance staging: **[SERVICES_SETUP.md](docs/SERVICES_SETUP.md)**. Payout/KYC marketplace, refund parsial/Xendit lanjutan, GitHub OAuth/push, dan backend data aplikasi pengguna belum otomatis. Panel Database sekarang mendukung dataset cloud privat dengan revision check; lihat [PROJECT_DATA.md](docs/PROJECT_DATA.md).

Aktivasi superadmin pertama, peran, broadcast terjadwal dan batas kontrol: **[ADMIN.md](docs/ADMIN.md)**. Tidak ada kredensial admin bawaan.

Baca [status tiap tahap](docs/STATUS.md) dan [keamanan](docs/SECURITY.md) sebelum deployment.

## Perintah

```sh
npm run build       # TypeScript check + production bundle
npm start           # frontend + API produksi, default 3001; reverse proxy HTTPS diperlukan
npm test            # unit/invariant tests
npm run verify:readiness  # diagnostik read-only; bukan sertifikasi integrasi live
npm run check:bundle      # anggaran ukuran setelah build
npm run test:security     # regresi keamanan lokal, bukan pentest penuh
npm run verify:production # smoke HTTP; server produksi lokal 3201 harus aktif
npm run test:e2e    # browser flows; requires Chromium
npm run test:e2e:sandbox  # Linux: Chromium + libraries dari dependency npm, tanpa CDN Playwright
```

## Struktur

```
src/components/    UI, prompt, template thumbnails
src/pages/         Landing, Auth, Dashboard, Workspace
src/workspace/     Explorer, Plan, Monaco, terminal, database, inspector
src/lib/           Types, store, templates, preview compiler, AI, Supabase
src/lib/cloud/     Repository, validation, sync queue, scope isolation, conflict reconciliation
src/components/storage/  Session bootstrap, status, import & conflict UI
server/            Authenticated service API, providers, SSE, publish worker
scripts/           Administrator E2B template build (explicit opt-in)
supabase/          Schema + RLS foundation
docs/              Honest delivery status, security checklist
```

Preview runtime `src/lib/preview-runtime.txt` adalah React/ReactDOM bundled lokal. Untuk regenerasi setelah upgrade React:

```sh
npx esbuild src/lib/preview-entry.ts --bundle --minify --format=iife --define:process.env.NODE_ENV='"production"' --outfile=src/lib/preview-runtime.txt
```

Tes browser memerlukan aplikasi aktif pada port 3001 (`npm run dev` di proses lain).

Monaco dan worker di-lazy-load. Ukuran bundle editor lebih besar dari UI utama; tidak menghambat landing page. Perlu import editor/language API yang lebih granular untuk optimasi lebih lanjut.

### Status pengujian cloud

State/sinkronisasi dan kebijakan SQL diuji dengan PostgreSQL PGlite; UI impor/konflik/Viewer diuji di browser. Belum ada Supabase live yang terhubung. Cache browser bukan penyimpanan terenkripsi; jangan masukkan secret atau data sensitif.

## Pilihan project & Roblox Studio

Composer landing dan formulir project menyediakan **Web App / Aplikasi Mobile (Expo) / Roblox Game**. Target project mengikuti login dan penyimpanan cloud, bukan sekadar label. Lihat [jenis project](docs/PROJECT_KINDS.md).

Roblox menyediakan editor Luau, scene builder Three.js, vertex/face mesh dasar, impor/ekspor OBJ dan plugin lokal Studio berbasis snapshot/review. [Panduan dan batas Roblox](docs/ROBLOX.md). Aktifkan bridge dengan migration `006_studio_bridge.sql` setelah 001–005; plugin tersedia di `public/plugins/PiwuStudio.luau`. Belum ada klaim pengujian terhadap Studio asli atau publikasi game.

## Tema IDE

Seluruh workspace mendukung **Terang/Gelap** lewat tombol matahari/bulan di kanan atas atau **Pengaturan → Tema IDE**. Berlaku untuk Web App, Expo dan Roblox; preferensi disimpan di browser tanpa mengubah source project. [Panduan tema & layout Roblox](docs/IDE_THEME.md).

Untuk browser regression tanpa kredensial produksi: `UI_TEST_FIXTURES=1 npm run test:e2e:sandbox` (server pengujian sementara 3101, terpisah dari preview 3001; bukan login demo pada aplikasi).
