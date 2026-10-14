# Media landing page

## Background video hero

Video yang dipilih pengguna:

- Halaman sumber: https://pixabay.com/videos/clouds-sky-moving-background-35573/
- Pembuat yang tercantum di halaman: **Animateon**.
- MP4 yang ditautkan halaman tersebut: https://cdn.pixabay.com/video/2020/04/09/35573-407595474_large.mp4
- Halaman sumber menyatakan **Pixabay Content License**: https://pixabay.com/service/license-summary/ . Tinjau ketentuan yang berlaku saat mendistribusikan ulang atau mengubah pemakaian.

Implementasi: `src/components/landing/HeroVideo.tsx` + `hero-video.css`, hanya untuk hero landing page, termasuk area prompt dan tagline bawah. Video memakai object-fit cover, tanpa suara, looping, playsInline, overlay terang, autoplay tanpa tombol putar/jeda atau kontrol player, sesuai permintaan pengguna.

### Performa dan preferensi pengguna

- Video baru dipasang saat hero terlihat, halaman aktif, dan pemutaran diizinkan. `preload="none"` menghindari preload terpisah sebelum pemutaran; autoplay tetap membutuhkan pengunduhan media.
- `prefers-reduced-motion: reduce` atau `navigator.connection.saveData` menonaktifkan pemutaran otomatis dan tidak memasang sumber video selama preferensi tersebut aktif.
- Video dijeda di luar viewport atau saat tab tidak aktif. Pemutaran otomatis dilanjutkan saat kembali jika preferensi perangkat mengizinkannya.
- Jeda mempertahankan frame terakhir. Autoplay ditolak browser atau media gagal → latar statis tanpa kontrol tambahan. Prompt, CTA dan navigasi tetap dapat digunakan.
- Latar cadangan adalah gradient CSS statis buatan PiwuApp, **bukan gambar frame yang diekstrak dari video**.

### Hosting

Lingkungan kerja tidak dapat mengunduh MP4 dari CDN Pixabay (koneksi keluar CDN dibatasi). Karena itu video saat ini direferensikan langsung dari URL CDN asli; tidak ada MP4 besar atau salinan video pengganti dimasukkan ke repository. Browser pengguna harus dapat mengakses CDN. Ini bukan bukti konektivitas CDN pada semua perangkat, dan URL pihak ketiga bisa berubah.

Untuk produksi disarankan menyiapkan salinan teroptimasi pada CDN/domain sendiri setelah mengunduh secara sah melalui halaman sumber. Set `VITE_HERO_VIDEO_URL` ke URL publik atau path file yang tersedia, misalnya `/media/hero-clouds.mp4`, lalu rebuild frontend. Jangan mengisi path tersebut sebelum file benar-benar ada. URL ini publik, bukan tempat token/secret. Preview hero tidak mengirim kredensial Supabase ke penyedia video.

### Pengujian

Browser tests memakai WebM kecil yang dibuat di memori sebagai fixture untuk menguji pemutaran native, muted/loop/playsInline, jeda/resume dan perilaku offscreen. Fixture ini **bukan video yang ditampilkan ke pengguna** dan tidak mengganti URL produksi. Tests juga menguji tidak adanya kontrol player, preferensi pengurangan gerak/hemat data, media gagal, prompt tetap berfungsi, mobile overflow, serta axe pada hero. Pemutaran MP4 asli perlu diverifikasi melalui jaringan browser pengguna/deployment.
