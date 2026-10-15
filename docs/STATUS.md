# Status implementasi — 15 Oktober 2026

**PiwuApp memiliki workspace lokal, sinkronisasi cloud, dan jalur integrasi layanan nyata. Belum dinyatakan SaaS siap produksi atau seluruh 13 tahap tuntas.** Environment eksternal belum tersedia untuk uji live. Tombol layanan tidak membuat hasil sukses palsu saat konfigurasi tidak ada.

## Paket SQL siap pasang

Installer baru atomik 001–008, pemeriksaan read-only tabel/RLS/RPC/bucket, dan bootstrap superadmin terverifikasi beserta audit tersedia di [supabase/README.md](../supabase/README.md). Installer menolak database lama/konflik bucket; tidak ada reset data otomatis. **87/87 unit/integrasi lulus**, termasuk tiga tes paket SQL baru. Database live belum diubah. Bootstrap tidak membuat akun/password.

## Pembaruan terbaru: admin dan hardening

**95/95 unit/integrasi, 66/66 browser lengkap (lima regresi motion landing dan empat regresi pemilih model AI), 8/8 regresi native/tema, build produksi, 11/11 smoke HTTP dan 1/1 tes bundle produksi lulus.** Admin ditambah pencarian server, filter, ekspor CSV, diagnostik dan aksesibilitas tabel. Migration 007 menambahkan rate limit/kuota bersama; 008 menambahkan direktori akun service-only. Produksi fail-closed bila kontrol keamanan/koordinasi tidak tersedia. Routing sandbox tetap memerlukan affinity; belum HA/failover transparan.

Monaco utama turun **3.350,19 → 3.201,51 kB**, aset JS **112 → 38**. Scaffold Expo diperbarui ke SDK 57 dan berhasil diekspor oleh Metro/Hermes untuk Android/iOS. **Dependency utama 0 temuan, scaffold Expo masih 15 paket terdampak high (dua advisory upstream)**; perangkat asli, Studio asli, pentest menyeluruh dan cluster produksi belum diuji. Tidak ada konfigurasi provider atau migration live yang diaktifkan.

Rincian/batas bukti: [ADMIN_PRODUCTION_VERIFICATION.md](ADMIN_PRODUCTION_VERIFICATION.md). Checklist yang belum dijalankan: [NATIVE_PRODUCTION_ACCEPTANCE.md](NATIVE_PRODUCTION_ACCEPTANCE.md). Angka pada bagian historis berikut bukan hasil terakhir.

| Tahap                  | Sudah diimplementasikan                                                                                                                  | Batas penting                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Landing/design      | Logo orisinal, landing responsif, font lokal, template, pricing, FAQ                                                                     | Audit menyeluruh semua viewport masih perlu                                                                                                                   |
| 2. Auth/dashboard      | Supabase email/Google + recovery, CRUD, cache per akun, sync revision/RLS, impor eksplisit cache lama, WhatsApp hook + OTP UI            | OAuth, email delivery, WhatsApp perlu konfigurasi dan uji perangkat nyata                                                                                     |
| 3. Workspace           | IDE Terang/Gelap Web App/Expo/Roblox, panel resize/toggle, status penyimpanan, private Realtime presence                                 | Presence bukan identitas terverifikasi; bukan live cursor/CRDT                                                                                                |
| 4. Kode/preview        | Monaco, explorer, local React preview terisolasi, versi/restore, ZIP; preview npm melalui E2B                                            | Preview lokal hanya React/import lokal; editor/TS worker masih besar                                                                                          |
| 5. AI                  | SSE terautentikasi + membership, kredit atomik, model tier, PIWU.md, gambar/PDF/TXT, URL reference                                       | Model harus dikonfigurasi; .fig tidak diparse; clone bukan pixel-perfect                                                                                      |
| 6. Plan/Ask            | Plan provider terstruktur, edit/approve, Ask read-only, review/version/restore                                                           | Tidak menandai tugas teruji secara palsu; autonomous test/fix agent belum dibuat                                                                              |
| 7. Design              | Pemilihan elemen, edit CSS/teks, device/zoom/focus/multi-preview                                                                         | Bukan AST/source-map editor; teks nested/dinamis terbatas                                                                                                     |
| 8. Dev tools           | Search/replace, xterm, shell E2B nyata, npm install/uninstall, import snapshot shell                                                     | Non-interaktif; sesi ephemeral; inspector bukan React DevTools/network recorder                                                                               |
| 9. Data                | Editor dataset cloud bertipe/revisi/draft/JSON, storage privat, encrypted secrets, RLS/RPC                                               | Dataset JSONB privat workspace, bukan backend aplikasi; ER/relations, SQL console, user-app auth, image generation, KMS belum dibangun                        |
| 10. Kolaborasi/publish | Invite/email/link, roles, komentar cloud, Realtime invalidation, queue/build/Netlify, domains/SSL, rollback/unpublish/cleanup, analytics | Provider belum diuji live; GitHub OAuth/push belum diimplementasikan; tidak ada domain piwuapp.app yang diklaim                                               |
| 11. Kualitas           | Scan statis, Lighthouse asli di sandbox + gate publish, tes axe pada login, SQL/RLS dan API guards                                       | Bukan audit keamanan penuh; project CVE scanning/pentest belum ada                                                                                            |
| 12. Bisnis             | Hosted checkout Midtrans/Xendit, verified callbacks, atomic credits, referral, riwayat akun                                              | Prabayar, bukan recurring; tier feature gating belum lengkap; partial/Xendit refund dan anti-fraud lanjutan perlu operator; prompt library masih privat lokal |
| 13. Lanjutan           | Rekaman snapshot IndexedDB + player/scrubber + expiring shares; free/paid marketplace + entitlement/revenue ledger; URL reference → AI   | Bukan video/screen capture; payout/KYC/dispute/moderasi belum otomatis                                                                                        |

## Pemeriksaan sebelumnya — audit real-mode

Laporan lengkap: **[AUDIT_REAL_MODE.md](AUDIT_REAL_MODE.md)**. Ringkasan ini mendahului pembaruan admin/hardening terbaru di atas.

- **75/75 tes unit/integrasi lokal lulus** dan **build produksi berhasil**; warning ukuran chunk Monaco tetap ada.
- **56/56 tes browser suite lengkap lulus** setelah perbaikan awal audit. Setelah perubahan scaffold: **16/16 regresi terarah lulus**; setelah perubahan API terakhir: **9/9 regresi terarah lulus**. Subset saling tumpang tindih, tidak dijumlahkan sebagai tes unik; suite lengkap tidak diulang setelah perubahan terakhir.
- Scaffold dashboard yang diekspor berhasil dibangun menggunakan Vite. Template baru tidak lagi menampilkan metrik bisnis/produk/keranjang palsu; menampilkan data belum terhubung. File pengguna lama tidak ditimpa.
- Perbaikan recovery Supabase, respons API/skema, timeout, pane storage, sandbox startup/locking, replay native dan error share rekaman; panel database lokal yang tidak terpakai dihapus.
- `npm audit` melaporkan **0 kerentanan diketahui**, bukan pengganti pentest.
- Preview **3001** menjawab HTTP 200 dan API readiness terjangkau. **11 kapabilitas masih `not_configured`, `liveVerified: false`**; `.env` tidak tersedia. Browser memakai fixture provider, bukan bukti produksi berfungsi.
- Tidak ada akun uji nyata yang berhasil dibuat/diundang, migration live, inference berbayar, pembayaran, pesan atau deploy publik dalam audit ini.

## Aktivasi

Ikuti [SERVICES_SETUP.md](SERVICES_SETUP.md), [CLOUD_SETUP.md](CLOUD_SETUP.md), dan [SECURITY.md](SECURITY.md). Konfigurasi hanya melalui environment/secret manager, bukan chat atau file project. Preview pengembangan tetap frontend **3001**, API **3002**.

## Ditunda sesuai instruksi awal

Background autonomous agent, browser extension, API publik/CLI untuk pengguna. Expo kini memiliki scaffold native yang dapat diekspor; native signing/build dan uji perangkat belum diimplementasikan/diverifikasi. Endpoint `/api` yang ada adalah backend internal aplikasi, bukan produk public developer API.

## Lanjutan data cloud

Migration 004 dan panel Database menyediakan dataset cloud dengan sesi nyata; tidak ada fallback ke data demo lokal. Detail hak akses, draft, konflik, ekspor, dan batasan tersedia di [PROJECT_DATA.md](PROJECT_DATA.md). Development API memakai Node watch agar perubahan route backend dimuat ulang, bukan tertinggal sampai restart manual.

Startup development juga sudah diuji tanpa `.env`: `server/dev.mjs` memuat file tersebut hanya jika ada, menghindari kegagalan Node watch pada file env yang belum dibuat. Preview dan API kembali sehat di port 3001/3002.

## Administrasi platform

Panel `/admin` menyediakan ringkasan, pengguna/suspension/kredit, project/lock/delete/unpublish, rekonsiliasi transaksi, moderasi template, broadcast in-app bersegmen dan terjadwal, operasional hosting/rekaman, konten hero/dukungan/maintenance/sakelar layanan, administrator dan audit. Peran database superadmin/operator/auditor; bukan metadata browser. Semua mutasi reasoned/idempotent/audited, revision check pada broadcast/settings, serta RLS/RPC dan API guards.

Tanpa Supabase dan bootstrap admin: akses ditolak/status konfigurasi ditampilkan, tanpa pratinjau admin demo atau data produksi palsu. Broadcast bukan email/WhatsApp massal. Tidak mengklaim editor semua copy halaman, tarif, refund/payout, atau integrasi eksternal sudah aktif. Ikuti [ADMIN.md](ADMIN.md).

## Penyegaran IDE dan video hero

Workbench kini memakai panel datar berwarna netral, command center, tab editor dan posisi kursor Monaco, terminal responsif, serta drawer explorer/asisten pada mobile. Canvas responsif menambahkan frame yang dapat dipindah/diubah ukurannya, zoom/pan, navigator, mode interaksi, undo/redo layout, dan penyimpanan lokal per akun/project. Lihat [CANVAS.md](CANVAS.md). Ini bukan backend aplikasi baru atau sinkronisasi canvas cloud.

Hero landing memakai URL video awan pilihan pengguna dari Pixabay 35573, overlay agar konten terbaca, autoplay tanpa tombol, pause offscreen/tab tersembunyi, reduced motion/hemat data dan fallback statis. MP4 asli belum dapat diunduh/diputar di jaringan sandbox; pemutaran native diuji menggunakan fixture terkontrol. Provenance dan hosting: [MEDIA.md](MEDIA.md).

## Perbaikan banner informasi platform

Koneksi backend preview ke Supabase terdiagnosis gagal di jaringan (status upstream 0/fetch failure); sebelumnya `/api/public/site` menghasilkan 503 yang memunculkan banner terus-menerus. Endpoint publik sekarang memberikan fallback berstatus eksplisit, timeout dan jeda retry. Landing mempertahankan konten bawaan/terakhir tanpa banner global; pengumuman member tetap memiliki pelaporan error di dashboard. Guards layanan privat tidak dilonggarkan. Koneksi database live dan penerapan migration belum dinyatakan berhasil.

Verifikasi patch: seluruh 55 tes unit/integrasi lulus dan 9 tes browser terarah lulus (platform, admin, video hero). Regresi tambahan: 4 tes server untuk default/deduplication/backoff/recovery/cache/guard, dan 2 tes browser untuk outage/recovery serta maintenance dari cache. Rincian terdapat di [ADMIN.md](ADMIN.md).

## Navbar landing — desain clean dan scroll glass

- Navbar landing dipisahkan ke `LandingNav.tsx` dan CSS terisolasi agar header IDE/dashboard tidak berubah. Logo PiwuApp dipertahankan, spacing/menu/CTA dirapikan dengan warna slate yang senada dengan hero.
- Sticky navbar menjadi panel mengambang setelah scroll 24 px: latar transparan, backdrop blur 24 px, border dan bayangan halus. Teks tetap tajam. Browser tanpa backdrop-filter memakai latar hampir solid; reduced-motion meniadakan transisi.
- Dropdown solusi/sumber daya memiliki ikon dan deskripsi. Escape mengembalikan fokus, ArrowDown masuk ke dropdown, klik di luar/fokus keluar menutup menu. Menu ponsel memakai submenu inline, bukan flyout di luar viewport; panel bisa discroll di layar pendek. Menu ditutup saat navigasi atau pergantian breakpoint.
- Validasi: TypeScript dan production build berhasil (peringatan ukuran chunk Monaco tetap ada). Seluruh **32 tes browser lulus**, termasuk 2 regresi navbar baru, video hero, platform fallback, admin, canvas, dan alur workspace. Pemeriksaan axe pada navbar desktop/mobile tidak menemukan pelanggaran; viewport 320, 390, 1024, dan 1440 diuji.
- Bukti lokal: `.artifacts/navbar-full-browser.log`, `.artifacts/navbar-build.log`, `.artifacts/navbar-{desktop-top,desktop-scroll,desktop-menu,mobile-menu,mobile-scroll}.png`. Screenshot hero menggunakan reduced-motion/static fallback, bukan bukti pemutaran video CDN asli.

## Optimasi responsif landing — mobile, tablet, desktop

- CSS khusus landing (`src/components/landing/landing-responsive.css`), tidak mengubah layout/auth/data IDE, dashboard, atau admin. Lebar konten dibatasi 1280 px dengan gutter fluid, judul memakai clamp, dan teks utama/sekunder diperbesar serta ditingkatkan kontrasnya.
- Template 1 kolom ≤480 px, 2 kolom ≤1100 px, 4 kolom di desktop. Harga 1 kolom ≤600 px, 2 kolom ≤1000 px (kartu terakhir di tengah), 3 kolom di desktop. Fitur, FAQ, footer dan filter template mengikuti breakpoint masing-masing, bukan mengecilkan seluruh halaman.
- Input ide 16 px; tombol prompt, saran, filter dan pilihan periode memiliki tinggi minimal 44 px. Menu landscape dapat discroll; navbar blur dan autoplay video dipertahankan. Spasi kalimat subtitle tidak hilang saat line break disembunyikan.
- Ilustrasi template/workspace ditandai dekoratif untuk screen reader, label kartu nyata dipertahankan; heading footer diperbaiki dan pilihan periode menggunakan aria-pressed.
- Validasi browser Chromium: 320×740, 390×844, 600×960, 768×1024, 834×1194, 844×390, 1024×768, 1440×1000, 1920×1080. Memeriksa batas layout tanpa horizontal overflow, kolom, ukuran kontrol, navigasi harga/FAQ/template hingga login, judul admin panjang, dan rotasi viewport tanpa kehilangan prompt. Axe seluruh landing lulus pada 320/834/1440 px. Ini emulasi viewport, bukan pengujian perangkat fisik atau Safari.
- Production build dan TypeScript berhasil, **seluruh 42 tes browser lulus** (10 regresi responsif baru). Log `.artifacts/responsive-build.log` dan `.artifacts/responsive-full-browser.log`. Peringatan bundle Monaco yang besar tetap ada; tidak ada klaim optimasi bundle pada patch tampilan ini. Screenshot hero tetap memakai reduced-motion/static fallback, bukan verifikasi CDN asli.

## Animasi landing — motion yang senada dengan desain

- Lapisan motion terpisah (`src/components/landing/landing-motion.css`) plus pengendali kecil (`src/components/landing/useLandingMotion.ts`), sehingga header IDE, dashboard, auth dan admin tidak berubah. Palet, easing 220 ms ala navbar, dan skala tipografi landing tetap dipakai.
- Yang bergerak: entrance hero bertahap dengan garis bawah yang tergambar, reveal saat scroll (template, langkah, fitur, harga, FAQ, footer) dengan stagger, aurora gradien hero dan bloom CTA yang berembus lambat, shimmer pada baris skeleton ilustrasi, sheen tombol/kartu, micro-interaction hover dan aktif, switch periode harga yang mengulang angka, popover navbar, dan indikator progres tipis di bawah navbar.
- Hanya `transform`/`opacity` yang dianimasikan dan tidak ada elemen dekoratif tambahan yang menerima event pointer, jadi tidak ada layout shift atau area klik baru. Animasi reveal di-settle setelah selesai agar transform hover berikutnya tidak terblokir.
- Komitmen aksesibilitas: konten hanya disembunyikan setelah JavaScript menambahkan `html.js-reveal`; tanpa JavaScript/IntersectionObserver semua blok tampil penuh, dan `prefers-reduced-motion: reduce` mematikan seluruh animasi (garis bawah tetap tergambar, indikator progres disembunyikan).
- Verifikasi: spec baru `tests/landing-motion.spec.ts` (5 tes: reveal saat scroll, reduced motion, spotlight/progres, harga tahunan, fallback tanpa lapisan reveal) plus 15 tes landing lama; suite browser lengkap **62/62 lulus** dalam 3,5 menit. Gerakan dinilai dari hasil tangkapan layar Chromium, bukan pengujian perangkat asli atau Safari.

## Pemilih model AI — semua model dari API key provider

- Chat AI kini membiarkan pengguna memilih sendiri modelnya. Daftar diambil dari `GET {LLM_BASE_URL}/models` milik API key yang dipasang, jadi DeepSeek, Claude, GLM, Qwen, Kimi, Grok, Mistral, model internal perusahaan, atau id apa pun yang dikembalikan provider tersebut ikut tampil. Pengelompokan (DeepSeek/Anthropic Claude/Z.ai GLM/…/"Model lainnya") **hanya untuk tampilan** dan tidak pernah menyembunyikan id; id yang tidak dikenal tetap ada di "Model lainnya".
- Preset tier (Otomatis/Cepat/Seimbang/Kuat) tetap tersedia dan tetap memakai `LLM_MODEL*` bila diisi. `LLM_MODEL` sekarang **opsional**: bila kosong, server memakai model pertama dari daftar provider. Bila daftar tidak terbaca dan `LLM_MODEL` juga kosong, permintaan gagal dengan pesan jelas, bukan diam-diam memakai model lain.
- Model yang dipilih dikirim apa adanya ke provider; server hanya menolak id yang tidak ada di daftar (fail closed, bukan downgrade senyap). Balasan menyimpan dan menampilkan nama model yang menjawab.
- Biaya kredit: `Ask` 1, `Plan` 2, `Builder` mengikuti tier (Cepat 1 / Seimbang 3 / Kuat 8). Model provider dihitung setara Seimbang kecuali operator memetakannya ke tier lewat `LLM_MODEL_KUAT` dll. Estimasi di composer memakai aturan yang sama seperti server, termasuk saat Otomatis memilih tier Kuat untuk prompt panjang.
- Daftar model di-cache 60 detik di server dengan penggabungan permintaan bersamaan dan tombol muat ulang di UI; pilihan terakhir pengguna disimpan per akun di browser (kunci `piwu-ai-model-v1:<scope>`).
- Verifikasi: `tests/ai-models.test.ts` (8 tes: katalog, cache, default opsional, tarif, penolakan model tak dikenal, kegagalan daftar, `/api/ai/models` lewat HTTP nyata) dan `tests/ai-model-picker.spec.ts` (4 tes: kelengkapan daftar + pencarian + keyboard, pengiriman model pilihan + nama model di balasan, kegagalan daftar tetap jujur, aksesibilitas & lebar di panel sempit). Suite browser lengkap lulus 66/66; unit/integrasi 95/95.

## Jalur layanan nyata — demo interaktif dinonaktifkan

**Perubahan ini bukan bukti aktivasi produksi.** Endpoint `/api/public/readiness` pada lingkungan ini melaporkan autentikasi dan database `unreachable`; AI, E2B, publikasi, pembayaran, WhatsApp dan enkripsi secrets `not_configured`. Kredensial Supabase ada di environment privat, tetapi koneksi backend gagal. Tidak ada kredensial provider lain yang ditambahkan atau transaksi live yang dijalankan.

- Login demo dihapus, sesi demo lama tidak lagi dipulihkan sebagai identitas, dan dashboard/IDE/layanan/admin memerlukan sesi akun. Data demo lama tetap disimpan agar tidak hilang dan masih dapat diimpor secara eksplisit setelah login nyata.
- AI Builder/Plan/Ask hanya melalui endpoint authenticated `/api/projects/:id/ai`. Generator preset lokal dan fallback rencana buatan dihapus. Provider tidak tersedia → error yang jelas tanpa file/hasil palsu. Provider dikonfigurasi tidak lagi diklaim terhubung sebelum respons API diterima. Prompt awal menunggu cloud sync, terikat ke ID project untuk mencegah duplikasi, dan tidak dibawa ke akun lain.
- Terminal tidak lagi menirukan `ls`/`cat`; shell harus menggunakan E2B. Monaco, kompilasi React/preview iframe, edit manual, canvas, undo/versi, ekspor dan snapshot tetap merupakan operasi lokal yang nyata, bukan inference atau server aplikasi produksi.
- Realtime invalidation tingkat akun ditambahkan untuk memicu antrean sync revision-checked di dashboard maupun IDE. Presence dan per-project subscriptions tetap ada. Belum CRDT/live-cursor; polling tetap menjadi recovery saat WebSocket gagal.
- Pratinjau admin dihapus dari jalur aplikasi; akses dan mutasi tetap memerlukan peran server. Semua checks JWT/RLS/kredit/membership tetap berlaku. Gangguan auth upstream dilaporkan 503, bukan dipalsukan sebagai login berhasil.
- Pemeriksaan kesiapan baca-saja: bounded 3 detik, cache 30 detik, dedup concurrent, auth health dan tiga tabel inti. Tidak memanggil inference, shell, email, transaksi atau deployment; tidak membocorkan secret/data pengguna. `reachable` bukan bukti seluruh migrasi/RLS/provider berfungsi.
- Uji browser lama dimigrasikan dari login demo/preset ke fixture jaringan Supabase/RPC/SSE yang hanya ada di `tests/`. Ini menguji jalur produksi aplikasi, **bukan** koneksi provider live. Regresi penyimpanan mempertahankan cakupan migrasi data legacy, konflik, Viewer dan pemisahan akun.
- Belum seluruh 13 tahap selesai: GitHub OAuth/push, backend/auth aplikasi hasil generasi, ER/relations, payouts/KYC/refund automation dan beberapa batas yang tercatat di atas tetap belum diimplementasikan. Menghapus demo tidak mengubah batas tersebut.

### Validasi migrasi real-only

Production build/TypeScript berhasil dan **58 tes unit/integrasi lulus**. Seluruh kasus browser selain fixture impor legacy lulus pada run penuh awal (44 lulus, 1 fixture lama masih mencoba masuk sebagai demo sehingga ditolak guard baru). Fixture impor telah diperbaiki untuk menyuntikkan cache legacy tanpa login demo dan lulus tiga kali berturut-turut. Hasil suite penuh final dicatat di bawah setelah verifikasi. Log: `.artifacts/real-mode-unit-final.log`, `.artifacts/real-mode-build.log`, `.artifacts/real-mode-legacy-browser.log`.

**Hasil final real-only:** seluruh **45 tes browser lulus** (2 menit), termasuk 3 tes real-only baru dan migrasi semua alur demo lama ke kontrak authenticated RPC/SSE. Log `.artifacts/real-mode-browser-final2.log`. Total unit/integrasi 58 lulus; production build berhasil. Provider eksternal tetap belum diaktifkan/diverifikasi live.

## Multi-target project + Roblox (implementasi v1)

Selector Web App / Aplikasi Mobile / Roblox Game di landing telah dirapikan menjadi segmented control di dalam composer; hanya detail target aktif ditampilkan. Saran prompt mengikuti target. Form Dashboard memakai pilihan dengan radio yang aksesibel. `kind` dan pending target dipertahankan lewat login/sinkronisasi; target legacy adalah web.

Expo mendapat scaffold native yang dapat diekspor, bukan iframe simulasi. Roblox mendapat Luau/editor, geometri Three.js, Part/Model hierarchy, editor vertex/triangle dasar, impor/ekspor OBJ, serta plugin pendamping HTTPS. Bridge mendukung snapshot → draft Explorer/script → review → queued bundle → konfirmasi plugin → receipt. Class/property dibatasi, perubahan lokal ditolak sebagai konflik, script baru dinonaktifkan, dan mutasi plugin tersimpan ke ChangeHistory untuk Undo. Rincian dan batas penting: [ROBLOX.md](ROBLOX.md), [PROJECT_KINDS.md](PROJECT_KINDS.md).

Aktivasi Studio memerlukan migration **006_studio_bridge.sql**, koneksi backend/cloud dan instalasi plugin lokal. Belum diuji terhadap Roblox Studio asli/akun Roblox atau perangkat Expo. Belum full mesh sculpting/terrain/CSG, continuous sync, binary assets, Luau language server, automatic Play Test, native signing/build atau game publish. “Snapshot seluruh Explorer” di versi ini hanya berlaku untuk service yang didukung dan batas yang didokumentasikan; tidak mengakses internal/protected services.

### Hasil akhir multi-target / Roblox v1

- **65 tes unit/integrasi lulus**, **48 tes browser lulus** (termasuk target selector/login, Expo scaffold, native preview boundary, scene/mesh/OBJ/Luau, import snapshot, review dan antrean bridge), dan **production build berhasil**. Sintaks plugin berhasil dikompilasi Luau WASM; ini bukan uji API Roblox Studio.
- Build pertama berjalan bersamaan dengan browser suite dan dihentikan karena tekanan memori sandbox; build diulang secara serial dan berhasil (39,53 detik). Peringatan ukuran chunk Monaco lama masih ada. Roblox renderer/bridge dipisahkan dalam chunk lazy, tidak dimuat di landing.
- Bukti: `.artifacts/multitarget-unit-final.log`, `.artifacts/multitarget-browser-final.log`, `.artifacts/multitarget-build-final.log`, `.artifacts/project-selector-{desktop,mobile}.png`, `.artifacts/roblox-builder-desktop.png`, `.artifacts/studio-bridge-mobile.png`.
- File plugin siap diunduh dari `/plugins/PiwuStudio.luau`. Migration 006 **belum diterapkan ke database live**. Sinkronisasi ke Studio asli, native device build, dan inference provider live **belum diklaim berhasil**.

## Penyesuaian preview hasil AI & Canvas Map Roblox

- Hasil geometri AI memakai kontrak `scene.roblox.json` yang disertakan pada instruksi server untuk seluruh project Roblox, termasuk project lama. Usulan scene ditampilkan sebelum diterima, hanya baca, dengan diff/terima/tolak; JSON/topologi invalid tidak boleh mengganti scene tersimpan. Menerima satu file mempertahankan usulan file lainnya.
- Tampilan khusus **Canvas Map** menggunakan kamera orthographic X/Z dari scene yang sama dengan Preview 3D. Mendukung pan/zoom, bingkai scene, gizmo geser/putar/ukuran, snap, pilihan Explorer dan perpindahan keyboard/tombol arah. Perubahan transform disimpan saat selesai drag dan masuk versi project. Luau tidak dieksekusi di browser.
- Perbaikan mobile: toolbar compact/horizontal, panel AI tidak menutupi scene ketika berpindah ke layar kecil; keyboard focus dipertahankan saat scene dirender ulang.
- Validasi: **68 unit/integrasi lulus**, **13 browser regresi terpilih lulus**. Lima tes project-kind/Roblox kemudian dijalankan ulang dengan assertion tambahan untuk penerimaan parsial dan keyboard berulang: **5/5 lulus**. Build produksi berhasil; peringatan ukuran Monaco masih ada.
- Bukti renderer aktual (geometri dari fixture respons AI, bukan provider live): `.artifacts/roblox-ai-preview.png`, `.artifacts/roblox-map-desktop.png`, `.artifacts/roblox-map-mobile.png`. Log: `.artifacts/roblox-map-{unit-final,final-browser,acceptance,build-final}.log`.

## IDE Roblox bersih + tema seluruh IDE

Header Roblox diringkas menjadi satu hierarki navigasi. Toolbar, status simpan, Explorer dan properti mengikuti sistem warna netral; panel scene dapat disembunyikan. Layout adaptif memakai container query. Label status bahasa file `.luau` sekarang Luau.

Tema **Terang/Gelap** ditambahkan untuk seluruh workspace Web App/Expo/Roblox: editor Monaco + diff, terminal ANSI (tanpa reset sesi), chat/riwayat/rencana, canvas, data/layanan, dialog, toolbar dan renderer 3D. Preferensi disimpan lokal dan sinkron lintas tab; pilihan tidak mengubah file atau warna objek project. Rincian: [IDE_THEME.md](IDE_THEME.md).

Verifikasi: **68 tes unit/integrasi lulus**, suite regresi **52/52 browser lulus**, kemudian **3/3 tes tema final lulus** termasuk tes Expo tambahan. Audit Axe pada builder, toolbar canvas dan dialog yang diuji tidak melaporkan pelanggaran. Screenshot dark/light, kode/terminal, web canvas, layanan dan mobile diperiksa secara visual.

Lingkungan yang dipulihkan pada giliran ini tidak memiliki file `.env`; kredensial produksi tidak direka ulang. Pengujian browser memakai server fixture terpisah 3101 lewat `UI_TEST_FIXTURES=1`; preview normal tetap 3001 dengan autentikasi nyata yang memerlukan konfigurasi lingkungan. Tidak ada pembuatan akun, migrasi database, atau inference AI live pada perubahan tema ini.

Build produksi tema **berhasil** (35,20 detik); `git diff --check` bersih. Peringatan ukuran chunk Monaco masih ada dan tidak memblokir build. Bukti terbaru: `.artifacts/ide-theme-unit.log`, `.artifacts/ide-theme-regression.log`, `.artifacts/ide-theme-final.log`, `.artifacts/ide-theme-build.log`.
