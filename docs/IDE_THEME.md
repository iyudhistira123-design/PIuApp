# Tema IDE dan workspace Roblox

## Penggunaan

Klik tombol **Terang / Gelap** (ikon matahari/bulan pada ponsel) di kanan atas IDE. Pilihan yang sama tersedia di **Pengaturan → Tema IDE**. Tema berlaku untuk seluruh IDE Web App, Expo, dan Roblox, bukan hanya builder.

Preferensi disimpan pada browser ini melalui key `piwu-ide-theme`. Nilai default adalah Gelap. Pergantian pada tab lain diselaraskan melalui storage event; jika storage diblokir, tema tetap berubah untuk sesi berjalan dan Pengaturan menampilkan peringatan. Tidak ada informasi akun, token, atau data project di preferensi tema.

## Cakupan

- Shell, navbar, activity bar, Explorer, pencarian, tab, statusbar.
- Panel AI, riwayat, review, rencana, composer, pesan kosong/error.
- Monaco editor dan diff menggunakan tema native `vs` / `vs-dark` dengan palette PiwuApp, bukan CSS invert.
- Terminal mengganti palette xterm secara langsung, termasuk 16 warna ANSI, tanpa membuang buffer atau membuat ulang sesi terminal.
- Canvas website, chrome preview, panel data, layanan, dialog, notifikasi dan instruksi Expo.
- Preview 3D/Canvas Map: latar, grid dan garis seleksi mengikuti tema. Orbit/camera dipertahankan saat renderer diperbarui.

**Bukan perubahan source project.** Tema IDE tidak menulis ulang HTML/CSS aplikasi, tidak menambah versi project, tidak mengubah warna material/geometri scene, dan tidak mengubah isi iframe preview atau Play Test Studio. Web App yang dibuat tetap memakai desainnya sendiri.

## Layout Roblox

Navigasi utama hanya Code / 3D Builder / Canvas Map. Header scene tidak lagi mengulang tab yang sama. Toolbar kompak; status simpan dan jumlah objek dipisahkan dari properti. Tombol panel di header scene dapat menyembunyikan Explorer maupun properti untuk memperluas viewport. Layout menyesuaikan lebar panel melalui container query, bukan hanya ukuran layar browser.

Kontrol builder, gizmo, mesh/OBJ, review hasil AI dan bridge Studio tetap menggunakan perilaku sebelumnya. Gizmo dan angka properti memakai scene yang sama pada kedua tema.

## Pengujian tanpa kredensial produksi

`UI_TEST_FIXTURES=1 npm run test:e2e:sandbox` menjalankan Vite sementara di **3101** dengan origin autentikasi `.invalid` dan identifier publik khusus pengujian. Playwright mengganti respons jaringan dengan fixture. Server sementara berhenti setelah suite selesai. Ini **bukan akun demo atau bypass login aplikasi**; preview pengguna pada **3001** tidak memakai konfigurasi fixture.

Tes tema memeriksa reload, kegagalan storage, perpindahan project/route, perubahan Monaco, sesi xterm tetap sama, file scene tidak berubah, panel Roblox, mobile overflow, dan audit Axe pada builder, toolbar canvas serta dialog/layanan. Screenshot dari fixture menunjukkan UI yang dirender Chromium, bukan bukti layanan cloud/AI aktif.
