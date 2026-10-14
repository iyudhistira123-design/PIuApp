import { Check, ListChecks, ArrowUpRight, Plus, Trash2 } from "lucide-react";
import type { Plan } from "../lib/types";
export default function PlanPanel({
  plan,
  onChange,
  onApprove,
  busy,
}: {
  plan?: Plan;
  onChange: (p: Plan) => void;
  onApprove: () => void;
  busy: boolean;
}) {
  if (!plan)
    return (
      <div className="chat-empty">
        <ListChecks size={26} />
        <h3>Bangun dengan arah yang jelas.</h3>
        <p>
          Pilih mode Plan, lalu ceritakan ide Anda. Tinjau rencananya sebelum
          satu baris kode ditulis.
        </p>
      </div>
    );
  return (
    <div className="plan-panel">
      <span className="plan-kicker">RENCANA IMPLEMENTASI</span>
      <h3>{plan.goal}</h3>
      {(["pages", "structure", "decisions"] as const).map((key, i) =>
        plan[key]?.length ? (
          <details key={key}>
            <summary>
              {["Halaman", "Struktur file", "Keputusan teknis"][i]}
            </summary>
            {plan[key]!.map((v, n) => (
              <p key={n}>{v}</p>
            ))}
          </details>
        ) : null,
      )}
      <p>Sesuaikan langkah dan tambahkan catatan sebelum membangun.</p>
      <div className="plan-progress">
        <span
          style={{
            width:
              (plan.tasks.filter((t) => t.done).length / plan.tasks.length) *
                100 +
              "%",
          }}
        />
      </div>
      <small>
        {plan.tasks.filter((t) => t.done).length} dari {plan.tasks.length}{" "}
        langkah selesai
      </small>
      {plan.tasks.map((task, i) => (
        <div className={"plan-task " + (task.done ? "done" : "")} key={i}>
          <div>
            <button
              className="task-checkbox"
              aria-label="Tandai langkah"
              disabled={!plan.approved}
              onClick={() =>
                onChange({
                  ...plan,
                  tasks: plan.tasks.map((t, j) =>
                    j === i ? { ...t, done: !t.done } : t,
                  ),
                })
              }
            >
              {task.done && <Check size={11} />}
            </button>
            <input
              value={task.text}
              onChange={(e) =>
                onChange({
                  ...plan,
                  tasks: plan.tasks.map((t, j) =>
                    j === i ? { ...t, text: e.target.value } : t,
                  ),
                })
              }
            />
            <button
              className="ws-icon"
              aria-label="Hapus langkah"
              onClick={() =>
                onChange({
                  ...plan,
                  tasks: plan.tasks.filter((_, j) => j !== i),
                })
              }
            >
              <Trash2 size={11} />
            </button>
          </div>
          <input
            className="task-comment"
            value={task.comment}
            placeholder="Tambahkan catatan…"
            onChange={(e) =>
              onChange({
                ...plan,
                tasks: plan.tasks.map((t, j) =>
                  j === i ? { ...t, comment: e.target.value } : t,
                ),
              })
            }
          />
        </div>
      ))}
      <button
        className="plan-add"
        onClick={() =>
          onChange({
            ...plan,
            tasks: [
              ...plan.tasks,
              { text: "Langkah baru", done: false, comment: "" },
            ],
          })
        }
      >
        <Plus size={13} />
        Tambah langkah
      </button>
      <button
        className="ws-button primary full-width"
        disabled={busy || !plan.tasks.length}
        onClick={onApprove}
      >
        {plan.approved ? "Jalankan kembali" : "Setujui & Bangun"}
        <ArrowUpRight size={14} />
      </button>
      <p className="plan-note">
        Checklist diselesaikan setelah hasil ditinjau. Menjalankan rencana
        memerlukan provider AI dan project yang tersinkron.
      </p>
    </div>
  );
}
