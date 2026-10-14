import {
  ArrowUpRight,
  ArrowRight,
  TrendingUp,
  Plus,
  Circle,
  ShoppingBag,
  Menu,
} from "lucide-react";
export default function TemplatePreview({
  type = "studio",
}: {
  type?: string;
}) {
  if (["mobile", "roblox"].includes(type))
    return (
      <div
        className="template-preview"
        style={{
          background: "#20352f",
          color: "#e3f2e8",
          display: "grid",
          placeContent: "center",
          gap: 12,
          padding: 20,
        }}
      >
        <strong style={{ fontSize: 24 }}>
          {type === "mobile" ? "Expo" : "Roblox"}
        </strong>
        <span style={{ fontSize: 12 }}>
          {type === "mobile"
            ? "React Native · Android / iOS"
            : "Luau · Explorer · 3D"}
        </span>
      </div>
    );
  if (type === "dashboard")
    return (
      <div className="template-preview mini-dashboard">
        <aside>
          <span className="mini-monogram">m.</span>
          <i />
          <i />
          <i />
          <i />
          <i />
        </aside>
        <main>
          <nav>
            <b>Ringkasan</b>
            <span>Oktober 2026⌄</span>
          </nav>
          <p>Selamat datang kembali, Dinda 👋</p>
          <div className="mini-metrics">
            <div>
              <small>Total pendapatan</small>
              <b>Rp24.580.000</b>
              <em>↗ 12,8% bulan ini</em>
            </div>
            <div>
              <small>Total pelanggan</small>
              <b>1.284</b>
              <em>↗ 8,2% bulan ini</em>
            </div>
          </div>
          <div className="mini-chart">
            <b>
              Statistik pendapatan <span>Mingguan⌄</span>
            </b>
            <div className="chart-grid">
              {[35, 56, 42, 71, 54, 80, 68, 91, 74, 100, 83, 112].map(
                (h, i) => (
                  <i key={i} style={{ height: h + "%" }} />
                ),
              )}
            </div>
            <div className="chart-labels">
              <span>Sen</span>
              <span>Sel</span>
              <span>Rab</span>
              <span>Kam</span>
              <span>Jum</span>
              <span>Sab</span>
            </div>
          </div>
          <div className="mini-transaction">
            <span>Transaksi terbaru</span>
            <span>Lihat semua →</span>
          </div>
          <div className="transaction-lines">
            <i />
            <i />
          </div>
        </main>
      </div>
    );
  if (type === "shop" || type === "pos")
    return (
      <div className="template-preview mini-shop">
        <nav>
          <b>
            objek<span>®</span>
          </b>
          <span>Koleksi &nbsp; Tentang</span>
          <ShoppingBag size={10} />
        </nav>
        <div className="mini-shop-hero">
          <small>HAL-HAL BAIK UNTUK SETIAP HARI</small>
          <h3>
            Sederhana.
            <br />
            Tapi istimewa.
          </h3>
          <span>
            Temukan objek favoritmu <ArrowRight size={9} />
          </span>
          <div className="vase vase-one" />
          <div className="vase vase-two" />
          <div className="vase-shadow" />
        </div>
        <div className="mini-products">
          <div>
            <i className="product-bowl" />
            <small>
              Mangkuk Terra <b>Rp129.000</b>
            </small>
          </div>
          <div>
            <i className="product-lamp" />
            <small>
              Lampu Sora <b>Rp459.000</b>
            </small>
          </div>
          <div>
            <i className="product-vase" />
            <small>
              Vas Nala <b>Rp249.000</b>
            </small>
          </div>
        </div>
      </div>
    );
  if (type === "portfolio")
    return (
      <div className="template-preview mini-portfolio">
        <nav>
          <b>nara.design</b>
          <span>
            Tersedia untuk kolaborasi <i />
          </span>
        </nav>
        <small>DESAINER INDEPENDEN · JAKARTA</small>
        <h3>
          Ide yang berani.
          <br />
          Karya yang <em>berarti.</em>
          <ArrowUpRight size={26} />
        </h3>
        <div className="portfolio-bottom">
          <div className="portfolio-art">
            <span>
              FORM
              <br />& FEEL
            </span>
            <i />
            <i />
            <i />
          </div>
          <div className="portfolio-note">
            <span>01 / PILIHAN KARYA</span>
            <p>
              Menjembatani ide
              <br />
              dan pengalaman.
            </p>
            <Circle size={24} />
          </div>
        </div>
      </div>
    );
  return (
    <div
      className={
        "template-preview mini-studio " + (type === "umkm" ? "coffee" : "")
      }
    >
      <nav>
        <b>
          {type === "umkm"
            ? "kopi sore."
            : type === "invitation"
              ? "nara & arya."
              : "ruang."}
        </b>
        <span>
          Karya &nbsp; Studio &nbsp; <ArrowUpRight size={8} />
        </span>
      </nav>
      <div className="studio-copy">
        <small>
          {type === "umkm" ? "DIRACIK DENGAN HATI" : "RUANG BAIK, HIDUP BAIK."}
        </small>
        <h3>
          {type === "umkm" ? (
            <>
              Sore yang baik,
              <br />
              kopi yang hangat.
            </>
          ) : type === "invitation" ? (
            <>
              Awal cerita
              <br />
              kita bersama.
            </>
          ) : (
            <>
              Ruang untuk
              <br />
              cerita baru.
            </>
          )}
        </h3>
        <p>Desain yang terasa seperti rumah.</p>
        <span>
          Temukan inspirasi <ArrowUpRight size={9} />
        </span>
      </div>
      <div className="studio-arch">
        <div className="studio-window" />
        <div className="studio-table" />
        <div className="studio-chair" />
        <div className="studio-plant">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="studio-bottom">
        <span>DIRANCANG DENGAN HATI.</span>
        <span>01 — 04</span>
      </div>
    </div>
  );
}
