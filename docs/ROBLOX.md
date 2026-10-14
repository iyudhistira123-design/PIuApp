# Project Roblox & Studio Bridge — v1

## Yang tersedia di kode aplikasi

- Jenis project `webapp`, `mobile` (Expo), dan `roblox` dipertahankan melalui login, cache, RPC cloud, duplikasi, dan reload. Project lama tanpa `kind` tetap Web App.
- Roblox memakai Luau: `ServerScriptService`, `ReplicatedStorage/Shared`, `StarterPlayer/StarterPlayerScripts`, `default.project.json` (pemetaan Rojo), dan `PIWU.md`. Editor memakai syntax highlight Lua; belum LSP/type checker Luau/Roblox autocomplete.
- Builder 3D Three.js: Part balok/bola/silinder, grup Model, posisi/rotasi/ukuran/warna/Anchored, parent hierarchy, pilih objek dengan mouse atau daftar, orbit/zoom. Ukuran dalam stud, rotasi derajat, posisi lokal terhadap Model parent. Penghapusan descendants dikonfirmasi.
- Mesh dasar: vertex/face segitiga dapat ditulis dari nol melalui editor koordinat, impor OBJ, ekspor OBJ. Maksimal 512 vertex/1024 face per mesh dan 250 objek scene. Ini **bukan** Blender, sculpting, CSG, terrain editor, rigging, atau animasi. OBJ hanya geometri (bukan material/tekstur).
- Semua perubahan builder disimpan dalam `scene.roblox.json` melalui versi project; gunakan Riwayat untuk pemulihan. Preview browser adalah renderer geometri, **bukan engine/Play Test Roblox**.
- Bridge HTTPS berpasangan melalui token acak, berlaku 30 menit, hash SHA-256 di database. Snapshot Studio diimpor ke file project; AI provider membaca file dan manifest tersebut (bukan mengakses Studio tanpa plugin). Provider AI tetap harus diaktifkan secara terpisah.
- Explorer instance, rename, tambah Folder/Model/Part/Script/LocalScript/ModuleScript, reparent melalui draft JSON, dan hapus descendants menghasilkan bundle eksplisit. Modifikasi file script menjadi operasi update Source. Menghapus file saja tidak dianggap izin menghapus instance.
- Hanya Part/Model dari builder dapat dimasukkan ke draft Explorer. Mesh kustom harus diekspor OBJ dan diimpor/diunggah sebagai aset melalui Studio. Bridge menolak menganggap mesh mentah sudah menjadi MeshPart.

## Aktivasi (belum dijalankan pada Studio asli di lingkungan ini)

1. Backend harus dapat menjangkau Supabase. Terapkan **sekali** `supabase/006_studio_bridge.sql` setelah 001–005. Jangan ulang migration yang sudah terpasang. Tabel hanya bisa diakses service-role server, bukan browser/anon; RLS tetap aktif.
2. Buat project Roblox dan tunggu tersinkron ke cloud. Buka **3D Builder → Hubungkan Studio**.
3. Unduh `/plugins/PiwuStudio.luau`. Di Studio, buat Script sementara, tempel source plugin, pilih **Save as Local Plugin** (menu Studio dapat berbeda menurut versi), lalu **hapus Script sementara dari place**. Jangan menjalankan plugin sebagai Script game. Buka plugin PiwuApp dari toolbar Plugins.
4. Simpan backup place. Hentikan Play/Run. Plugin hanya mengizinkan Edit Mode.
5. Klik **Buat token pasangan** di PiwuApp. Masukkan origin HTTPS aplikasi dan token tersebut di dock plugin, klik **Simpan koneksi di memori**. Token plugin tidak sama dengan key Supabase/Roblox dan tidak boleh dibagikan. Plugin tidak menyimpan token melalui Plugin Settings. Izinkan HTTP untuk domain aplikasi jika Studio meminta izin. Jangan memasukkan URL pihak yang tidak Anda percaya: snapshot berisi source script Anda.
6. Klik **Kirim snapshot** di Studio, lalu **Impor snapshot Studio** di PiwuApp. Proses memberi atribut `PiwuBridgeId` pada descendants saat ekspor eksplisit agar objek bernama sama tetap dapat dibedakan. Snapshot tidak diam-diam dipotong ketika mencapai batas.
7. Edit source Luau di IDE atau minta perubahan dari provider AI. Tinjau diff dan terima di IDE. Gunakan draft Explorer untuk tambah/rename/delete. Perubahan ini **belum** mengubah Studio.
8. Klik **Tinjau perubahan Studio**; periksa daftar, source, serta penghapusan. Centang konfirmasi lalu **Kirim bundle ke Studio**.
9. Di plugin, klik **Ambil & tinjau perubahan**, baca ringkasan, lalu **Terapkan** dua kali untuk konfirmasi dalam 12 detik. Server membandingkan snapshot terkini dengan baseline; perubahan lokal Studio menyebabkan konflik, bukan overwrite.
10. Periksa hasil di Explorer Studio dan gunakan Undo jika diperlukan. **Script baru tetap Disabled** sampai diaktifkan secara manual setelah review. Lakukan Play Test di Studio sendiri. Receipt menandakan operasi plugin selesai, bukan game sudah benar/aman atau telah dipublikasikan.
11. Kirim snapshot baru setelah setiap penerapan. Gunakan **Cabut akses plugin** di web untuk mencabut token server; tombol putus di plugin hanya menghapus token dari memori lokal.

## Batas dan kegagalan

- Snapshot mencakup descendants pada Workspace, ReplicatedFirst, ReplicatedStorage, ServerScriptService, ServerStorage, StarterGui, StarterPack, StarterPlayer, Lighting, SoundService, Teams, TextChatService, MaterialService, LocalizationService. **Bukan semua internal DataModel**, CoreGui/CorePackages, runtime pemain, atau seluruh property/aset biner.
- Maksimal 750 instance, 140 script, source 100 KB/script, snapshot 4 MB, dan 300 operasi/bundle. Workspace juga membatasi 200 file/240 KB file impor; manifest besar dapat ditolak. Konteks AI masih dibatasi endpoint (350 KB kode), belum retrieval/chunking place besar. Jika tidak muat, gunakan place/project lebih kecil; jangan menganggap AI membaca file yang belum diimpor.
- Class selain allowlist dapat muncul sebagai metadata read-only. Property bridge hanya nama/parent, source script yang bisa dibaca, serta transform/size/color/Anchored/shape untuk Part. Terrain, CSG, MeshPart assets, constraints, attributes khusus, animations dan property arbitrer tidak diserialisasi lengkap.
- Instance lama tidak boleh diganti class/path script; buat instance baru secara eksplisit. Akses source yang ditolak Studio tetap read-only; tidak dicoba dibypass.
- Antrean bersifat manual snapshot/review/apply, **bukan sinkronisasi kontinu tanpa persetujuan**. File lama tidak dihapus dari IDE otomatis ketika mengimpor snapshot baru.
- Claim bundle menggunakan compare-and-swap. Token diperiksa ulang terhadap expiry, membership Editor/Owner, suspension, project lock dan maintenance. Token tidak disimpan dalam project, chat, atau localStorage. Anggota Editor dapat memasangkan ulang bridge; hanya satu pairing aktif/project.
- Plugin preflight dilakukan sebelum mutasi dan memakai ChangeHistoryService recording. Roblox tidak menyediakan transaksi lintas semua instance: kegagalan parsial dilaporkan, riwayat dipertahankan untuk Undo, dan bundle tidak diulang otomatis. Jangan klaim operasi atomik. Jika crash setelah claim, inspeksi place lalu cabut/pasangkan ulang; jangan replay tanpa memastikan hasil.
- Mencabut token tidak bisa membatalkan mutasi yang sudah di-claim dan sedang berjalan di Studio. Receipt gagal tidak berarti perubahan gagal; plugin mengingatkan pengguna agar tidak menerapkan ulang.
- Plugin tidak memakai `loadstring`, `require` remote, menjalankan source AI, memulai Play Test atau mempublikasikan game. Script yang diterima tetap memerlukan review keamanan oleh pembuat game.

## Verifikasi yang bisa dilakukan di sini

Pengujian browser memakai fixture jaringan terisolasi untuk project cloud/bridge; renderer 3D berjalan di Chromium. Unit menguji mesh/topologi, schema snapshot, operasi terlindungi, stale bundle, CAS claim, expiry/role/lock, dan privilege tabel pada PostgreSQL PGlite. Plugin dan starter scripts dikompilasi dengan Luau WASM untuk memeriksa sintaks, **bukan menjalankan API Studio**.

Uji Studio nyata wajib: pairing, duplicate instance names, unsaved script editor, local edit conflict, partial failure/Undo, revoked access, interrupted receipt, and Play Test. Belum ada keberhasilan sinkronisasi ke place live yang diklaim.

## Preview hasil AI dan Canvas Map

- **3D Builder → Preview 3D** menampilkan geometri `scene.roblox.json`. Instruksi AI mewajibkan file scene lengkap untuk permintaan model/map, bukan hanya script Luau pembuat Part. Kontrak disertakan server bahkan pada project lama.
- Usulan scene otomatis dibuka sebagai **preview hanya baca sebelum diterima**. Pilih **Lihat diff scene** untuk memeriksa JSON; **Tolak** mengembalikan scene tersimpan. Scene yang invalid tidak dapat diterima dan tidak mengganti scene terakhir. Menerima satu file tidak membuang usulan file lain.
- **Canvas Map** adalah proyeksi orthographic dari scene yang sama pada bidang X/Z (Y tetap tinggi), bukan canvas desain website. Beralih 3D/map tidak menggandakan atau mengubah objek.
- Pilih objek melalui viewport/Explorer, lalu **Geser / Putar / Ukuran** untuk gizmo langsung. Model tidak menerima scale grup; atur ukuran Part turunannya. **Snap** mengatur translasi 0,5/1/2/4 stud (Bebas mematikannya); rotasi bersnap 15°, scale 0,25. **Bingkai semua** memusatkan seluruh geometri.
- Di map, drag kosong untuk pan; roda/pinch untuk zoom. Tombol Kiri/Kanan/Atas/Bawah atau tombol panah saat canvas fokus memindahkan objek pada sumbu dunia X/Z, termasuk objek dengan Model parent berotasi. Gizmo disimpan satu kali saat drag berakhir, bukan setiap frame; perubahan masuk Riwayat project. Escape membatalkan drag sebelum dilepas.
- Preview diperbarui setelah scene diterima/disimpan dan bertahan saat reload. Pengujian browser memeriksa preview proposal, penerimaan, gizmo drag, snap, perpindahan keyboard, invalid scene, dan persistensi; fixture AI bukan bukti inference provider live.
- Preview **tidak mengeksekusi Luau**. Physics, gameplay, efek runtime, terrain dan aset khusus yang hanya tersedia di Studio tidak otomatis divisualisasi. Jalankan Play Test di Roblox Studio untuk hasil runtime sebenarnya.
