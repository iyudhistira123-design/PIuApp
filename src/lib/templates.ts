export const templates = [
  {
    id: "studio",
    category: "Landing page",
    name: "Ruang Studio",
    description: "Ruang digital untuk ide-ide besar.",
    prompt:
      "Buat landing page studio desain interior yang elegan, dengan warna hijau gelap dan tipografi editorial.",
    tag: "Paling populer",
    color: "#153e36",
  },
  {
    id: "dashboard",
    category: "Dashboard",
    name: "Moneta",
    description: "Semua angka, dalam satu pandangan.",
    prompt:
      "Buat dashboard keuangan dengan kartu ringkasan, grafik pendapatan, dan daftar transaksi.",
    tag: "",
    color: "#69765c",
  },
  {
    id: "shop",
    category: "E-commerce",
    name: "Objek Everyday",
    description: "Toko kecil. Kemungkinan besar.",
    prompt:
      "Buat toko online produk rumah tangga dengan desain minimal, katalog produk, dan keranjang belanja.",
    tag: "",
    color: "#dba77b",
  },
  {
    id: "portfolio",
    category: "Portfolio",
    name: "Karya & Cerita",
    description: "Tempat terbaik untuk karya terbaik.",
    prompt:
      "Buat portfolio kreatif dengan tipografi besar, galeri proyek, tentang saya, dan formulir kontak.",
    tag: "",
    color: "#b9bdd3",
  },
  {
    id: "umkm",
    category: "Bisnis lokal",
    name: "Kopi Sore",
    description: "Cerita lokal, jangkauan lebih luas.",
    prompt:
      "Buat website kedai Kopi Sore dengan menu, cerita brand, dan formulir pemesanan.",
    tag: "",
    color: "#886b54",
  },
  {
    id: "invitation",
    category: "Undangan",
    name: "Hari Bahagia",
    description: "Satu halaman untuk momen istimewa.",
    prompt:
      "Buat undangan pernikahan digital yang elegan dengan informasi acara dan konfirmasi kehadiran.",
    tag: "",
    color: "#c3b49e",
  },
  {
    id: "pos",
    category: "Alat internal",
    name: "Kasir Pintar",
    description: "Operasional yang lebih sederhana.",
    prompt:
      "Buat aplikasi kasir dengan katalog produk, keranjang transaksi, dan total pembayaran.",
    tag: "",
    color: "#738c9f",
  },
];
export function starterFiles(
  template = "studio",
  name = "Project baru",
): Record<string, string> {
  const jsxName = JSON.stringify(name)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  const htmlName = name.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
  const dashboard = template === "dashboard";
  const shop = template === "shop" || template === "pos";
  const heading = dashboard
    ? "Bisnis Anda, dalam angka."
    : shop
      ? "Objek sederhana.\nHidup lebih indah."
      : template === "portfolio"
        ? "Ide yang berani.\nKarya yang berarti."
        : template === "invitation"
          ? "Sebuah awal\nuntuk selamanya."
          : template === "umkm"
            ? "Cerita baik dimulai\ndari secangkir kopi."
            : "Ruang yang baik,\ncerita yang baru.";
  return {
    "src/App.tsx": `import React from 'react';\nimport './styles.css';\n\nexport default function App() {\n  return (\n    <main>\n      <nav><a className="brand" href="#">{${jsxName}}</a><div><a href="#karya">${shop ? "Koleksi" : "Karya"}</a><a href="#tentang">Tentang</a><a href="#kontak">Hubungi kami ↗</a></div></nav>\n      <section className="hero" id="tentang">\n        <p className="eyebrow">${dashboard ? "RINGKASAN BISNIS ANDA" : shop ? "DIBUAT DENGAN PENUH PERHATIAN" : "DESAIN DENGAN TUJUAN"}</p>\n        <h1>${heading.split("\n").join("<br/>")}</h1>\n        <p className="intro">Kami percaya hal-hal sederhana dapat menciptakan perubahan yang berarti. Temukan sesuatu yang dibuat khusus untuk Anda.</p>\n        <button onClick={() => { document.getElementById('karya')?.scrollIntoView({behavior: 'smooth'}); }}>Jelajahi ${shop ? "koleksi" : "karya"} <span>↗</span></button>\n        <div className="hero-art"><div className="arch"></div><div className="orb"></div><div className="plinth"></div><span>EST. 2026 · INDONESIA</span></div>\n      </section>\n      <section className="collection" id="karya"><div className="section-title"><h2>${dashboard ? "Performa bulan ini" : shop ? "Pilihan untuk keseharian" : "Dibuat dengan hati."}</h2><span>${dashboard ? "Sumber data belum terhubung" : shop ? "Katalog kosong" : "Konten awal template"}</span></div>${dashboard || shop ? '<p role="status">Belum ada sumber data bisnis yang terhubung. Produk, pesanan, pendapatan, dan pembayaran tidak disimulasikan.</p>' : ""}<div className="cards">{${JSON.stringify(dashboard ? ["Pendapatan · Belum ada data", "Pesanan · Belum ada data", "Pelanggan · Belum ada data"] : shop ? [] : ["Sebuah perspektif baru", "Bentuk bertemu fungsi", "Detail yang berarti"])}.map((item, i) => <article key={item}><div className={'card-art art-' + i}><span>{String(i+1).padStart(2, '0')}</span></div><h3>{item}</h3>${dashboard || shop ? "" : '<a className="text-button" href="#kontak">Lihat bagian kontak ↗</a>'}</article>)}</div></section>\n      <footer id="kontak"><h2>Mari mulai sesuatu yang baik.</h2><p>Alamat kontak belum ditentukan.</p><small>© 2026 {${jsxName}}. Dibuat dengan PiwuApp.</small></footer>\n    </main>\n  );\n}\n`,
    "src/styles.css": `* { box-sizing: border-box; } html { scroll-behavior: smooth; } body { margin: 0; color: #193b32; background: #f6f4ed; font-family: Arial, sans-serif; } a { color: inherit; text-decoration: none; } nav { display: flex; justify-content: space-between; align-items: center; padding: 28px 6%; border-bottom: 1px solid #193b3220; } .brand { font-size: 24px; font-weight: 700; letter-spacing: -1px; } nav div { display: flex; gap: 28px; font-size: 12px; } .hero { padding: 80px 6% 100px; position: relative; overflow: hidden; min-height: 600px; } .eyebrow { font-size: 10px; letter-spacing: 2px; margin-bottom: 26px; } h1 { font-family: Georgia, serif; font-weight: 400; font-size: clamp(40px, 5.8vw, 78px); line-height: 1.08; letter-spacing: -3px; margin: 0 0 24px; position: relative; z-index: 2; } .intro { max-width: 340px; font-size: 14px; line-height: 1.8; color: #657069; position: relative; z-index: 2; } button { background: #193b32; color: white; padding: 16px 24px; border: 0; cursor: pointer; margin-top: 20px; } button span { margin-left: 28px; } .hero-art { position: absolute; right: 6%; top: 60px; width: 38%; height: 420px; background: #e2ded1; border-radius: 180px 180px 0 0; overflow: hidden; } .arch { position: absolute; width: 70%; height: 90%; background: #a6aa91; border-radius: 150px 150px 0 0; left: 15%; top: 18%; box-shadow: inset 25px 8px 40px #67755c55; } .orb { width: 150px; height: 150px; border-radius: 50%; background: radial-gradient(circle at 30% 25%, #f2dab3, #9b7548); position: absolute; top: 40%; left: 25%; z-index: 2; box-shadow: 25px 20px 30px #0002; } .plinth { width: 180px; height: 130px; position: absolute; background: linear-gradient(90deg,#d1c2a6,#e9dfcd); bottom: 0; left: 22%; } .hero-art span { position: absolute; bottom: 20px; left: 20px; font-size: 8px; letter-spacing: 2px; z-index: 3; } .collection { padding: 50px 6%; background: #fff; } .section-title { display:flex;align-items:center;justify-content:space-between;margin-bottom:28px; } h2 { font-family: Georgia,serif; font-size:32px;font-weight:400; } .section-title span {font-size:12px;} .cards {display:grid;grid-template-columns:repeat(3,1fr);gap:24px;} .card-art {height:220px;background:#e6e0d3;display:grid;place-items:center;font-size:70px;font-family:Georgia,serif;} .art-1 {background:#bec5b6;} .art-2 {background:#d4c0ac;} h3 {font-size:14px;font-weight:500;} .text-button {background:none;color:inherit;padding:0;margin:0;font-size:11px;} footer {padding:60px 6%;background:#193b32;color:#eee;} footer small {display:block;margin-top:60px;font-size:10px;opacity:.6;} @media(max-width:640px){nav{padding:22px 6%;}nav div{gap:12px;font-size:10px;}.hero{padding-top:50px;min-height:800px;}h1{font-size:48px;}.hero-art{top:400px;right:6%;width:88%;height:340px;}.cards{grid-template-columns:1fr;}.card-art{height:240px;}h2{font-size:26px;}}`,
    "PIWU.md": `# Memori project\n\nProject: ${name}\nBahasa UI: Bahasa Indonesia\nStack: React + TypeScript + CSS\nGaya: editorial, bersih, responsif; kontras yang jelas.\nKonvensi: komponen fungsional, aksesibilitas keyboard.\nJangan memasukkan secret atau token ke kode frontend.\nIni scaffold awal, bukan hasil inference AI atau aplikasi bisnis yang sudah terhubung. Jangan membuat metrik, inventaris, transaksi, atau pembayaran palsu. Tampilkan status kosong/loading/error sampai backend aplikasi benar-benar dihubungkan.\n`,
    "package.json": JSON.stringify(
      {
        name: "piwu-project",
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: {
          dev: "vite --host 0.0.0.0",
          build: "vite build",
          preview: "vite preview --host 0.0.0.0",
        },
        devDependencies: { vite: "^6.4.4", typescript: "~5.7.2" },
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
      },
      null,
      2,
    ),
    "index.html":
      '<!doctype html>\n<html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>' +
      htmlName +
      '</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    "src/main.tsx":
      "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);\n",
  };
}
