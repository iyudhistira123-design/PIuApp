import type { Attachment } from "../services/api";
import type {
  Mode,
  Model,
  OpsReport,
  Plan,
  SourceRef,
  ResearchReport,
} from "./types";
import { supabase } from "./supabase";
import { useStore } from "./store";
export interface AIResult {
  content: string;
  plan?: Plan;
  creditsUsed?: number;
  files?: Record<string, string>;
  summary?: string[];
  /** Model the provider actually answered with, plus the tier it billed as. */
  model?: string;
  tier?: string;
  /** Present only when the reply asked for deterministic scene edits. */
  ops?: OpsReport;
  /** Numbered sources plus the citation report, when research mode ran. */
  sources?: SourceRef[];
  research?: ResearchReport;
}

/** Tier presets; any other value is a concrete model id from the API key. */
export const AI_TIERS = ["Otomatis", "Cepat", "Seimbang", "Kuat"] as const;
export const TIER_INFO: Record<string, string> = {
  Otomatis: "Pilih sendiri: ringan untuk obrolan, kuat untuk permintaan besar",
  Cepat: "Jawaban tercepat untuk pertanyaan ringan",
  Seimbang: "Seimbang antara kecepatan dan kualitas",
  Kuat: "Paling teliti untuk perubahan besar",
};
export interface AiModelGroup {
  label: string;
  models: string[];
}
export interface AiModelCatalog {
  source: "provider";
  count: number;
  models: string[];
  groups: AiModelGroup[];
  /** Optional per-tier overrides the operator configured on the server. */
  tiers: Record<string, string>;
  defaultModel: string;
  defaultSource: string;
}
export function tierCost(tier: string) {
  return tier === "Kuat" ? 8 : tier === "Cepat" ? 1 : 3;
}
export function tierOfModel(model: string, tiers: Record<string, string> = {}) {
  for (const tier of ["Kuat", "Seimbang", "Cepat"])
    if (tiers[tier] === model) return tier;
  return "Seimbang";
}
/** Client mirror of the server cost rule, so the estimate never lies. */
export function estimateCredits({
  mode,
  model,
  tiers = {},
  prompt = "",
  hasAttachments = false,
}: {
  mode: Mode;
  model: string;
  tiers?: Record<string, string>;
  prompt?: string;
  hasAttachments?: boolean;
}) {
  if (mode === "Ask") return 1;
  if (mode === "Plan") return 2;
  const tier = (AI_TIERS as readonly string[]).includes(model)
    ? model === "Otomatis"
      ? prompt.length > 1200 || hasAttachments
        ? "Kuat"
        : "Seimbang"
      : model
    : tierOfModel(model, tiers);
  return tierCost(tier);
}
/**
 * Every model the configured API key serves, straight from the provider.
 * Throws with the server message when the list cannot be read; the tier
 * presets keep working in that case.
 */
export async function fetchAiModels({
  refresh = false,
  signal,
}: { refresh?: boolean; signal?: AbortSignal } = {}): Promise<AiModelCatalog> {
  const response = await fetch(
    "/api/ai/models" + (refresh ? "?refresh=1" : ""),
    { signal },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.models))
    throw new Error(
      data.error ||
        "Daftar model provider tidak dapat dibaca. Tier Otomatis/Cepat/Seimbang/Kuat tetap tersedia.",
    );
  return data as AiModelCatalog;
}
export async function streamAI({
  projectId,
  attachments,
  references,
  prompt,
  files,
  mode,
  model,
  research = false,
  onToken,
  signal,
}: {
  projectId: string;
  attachments?: Attachment[];
  references?: string[];
  prompt: string;
  files: Record<string, string>;
  mode: Mode;
  model: string;
  /** Opt-in: the reply may run one bounded search round and cite sources. */
  research?: boolean;
  onToken: (s: string) => void;
  signal?: AbortSignal;
}): Promise<AIResult> {
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  const user = useStore.getState().user;
  if (!session || !user || user.demo || session.user.id !== user.id)
    throw new Error("Masuk dengan akun terverifikasi untuk menjalankan AI.");
  const accountId = user.id;
  const response = await fetch("/api/projects/" + projectId + "/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: "Bearer " + session.access_token } : {}),
    },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      prompt,
      files,
      mode,
      model,
      attachments,
      references,
      research,
    }),
    signal,
  });
  if (!response.ok) {
    const e = await response
      .json()
      .catch(() => ({ error: "Layanan AI tidak merespons." }));
    throw new Error(e.error || "Layanan tidak tersedia.");
  }
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  let result: AIResult = { content: "" };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const data = event
        .split("\n")
        .filter((x) => x.startsWith("data: "))
        .map((x) => x.slice(6))
        .join("\n");
      if (!data) continue;
      const p = JSON.parse(data);
      if (p.type === "token") {
        result.content += p.content;
        onToken(result.content);
      }
      if (p.type === "result") {
        result = p.result;
        completed = true;
      }
      if (p.type === "error") throw new Error(p.message);
    }
  }
  if (!completed)
    throw new Error(
      "Streaming terputus sebelum hasil lengkap. Tidak ada perubahan file yang diterapkan.",
    );
  if (useStore.getState().user?.id !== accountId)
    throw new Error("Akun berubah. Hasil AI tidak diterapkan.");
  if (mode === "Plan" && !result.plan)
    throw new Error(
      "Provider tidak mengembalikan rencana. Tidak ada rencana preset yang digunakan.",
    );
  if (mode !== "Builder") delete result.files;
  return result;
}
