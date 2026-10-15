import type { Attachment } from "../services/api";
import type { Mode, Model, Plan } from "./types";
import { supabase } from "./supabase";
import { useStore } from "./store";
export interface AIResult {
  content: string;
  plan?: Plan;
  creditsUsed?: number;
  files?: Record<string, string>;
  summary?: string[];
}
export async function streamAI({
  projectId,
  attachments,
  references,
  prompt,
  files,
  mode,
  model,
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
