import { useState } from "react";
import ServicePanel from "./ServicePanel";
const tabs = [
  ["integrations", "Status"],
  ["invite", "Anggota"],
  ["comments", "Komentar"],
  ["packages", "Paket"],
  ["assets", "Aset"],
  ["secrets", "Secrets"],
  ["reference", "Referensi URL"],
  ["publish", "Publish"],
  ["analytics", "Analytics"],
  ["security", "Lighthouse"],
  ["marketplace", "Jual template"],
  ["credits", "Kredit"],
];
export default function ServiceHub({
  projectId,
  onReference,
}: {
  projectId: string;
  onReference?: (url: string, title: string) => void;
}) {
  const [tab, setTab] = useState("integrations");
  return (
    <div className="service-panel">
      <nav className="service-tabs" aria-label="Layanan project">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <ServicePanel
        key={tab}
        kind={tab}
        projectId={projectId}
        onReference={onReference}
      />
    </div>
  );
}
