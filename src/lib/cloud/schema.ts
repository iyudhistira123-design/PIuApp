import { z } from "zod";
const safePath = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (p) =>
      !p.startsWith("/") &&
      !p.includes("\\") &&
      !/(^|\/)\.\.(\/|$)|(^|\/)\.env($|[./])/.test(p),
    "Path file tidak aman",
  );
const files = z
  .record(safePath, z.string().max(262144))
  .refine((f) => Object.keys(f).length <= 200);
const finiteTime = z.number().finite().nonnegative();
const opsChange = z.object({
  kind: z.string().max(40),
  target: z.string().max(120),
  id: z.string().max(100).optional(),
  name: z.string().max(80).optional(),
  changes: z.array(z.string().max(200)).max(40).optional(),
  reason: z.string().max(300).optional(),
});
const message = z.object({
  id: z.string().min(1).max(128),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(250000),
  mode: z.enum(["Builder", "Plan", "Ask"]),
  files: z.array(safePath).optional(),
  summary: z.array(z.string()).optional(),
  // Report of applied/rejected structured scene ops, shown as-is in the chat.
  ops: z
    .object({
      version: z.number(),
      applied: z.array(opsChange).max(40),
      rejected: z.array(opsChange).max(40),
      sceneChanged: z.boolean(),
      note: z.string().max(300),
    })
    .optional(),
  at: finiteTime,
});
export const projectSchema = z.object({
  kind: z.enum(["webapp", "mobile", "roblox"]).optional(),
  id: z.uuid(),
  name: z
    .string()
    .min(1)
    .max(120)
    .refine((s) => s.trim().length > 0),
  description: z.string().max(12000),
  template: z.string().max(100),
  files,
  messages: z.array(message).max(5000),
  versions: z
    .array(
      z.object({ id: z.string(), label: z.string(), files, at: finiteTime }),
    )
    .max(50),
  createdAt: finiteTime,
  updatedAt: finiteTime,
  plan: z
    .object({
      goal: z.string(),
      pages: z.array(z.string()).max(30).optional(),
      structure: z.array(z.string()).max(100).optional(),
      decisions: z.array(z.string()).max(20).optional(),
      tasks: z
        .array(
          z.object({
            text: z.string(),
            done: z.boolean(),
            comment: z.string(),
          }),
        )
        .max(1000),
      approved: z.boolean(),
    })
    .optional(),
  comments: z
    .array(
      z.object({
        id: z.string(),
        selector: z.string(),
        body: z.string(),
        resolved: z.boolean(),
      }),
    )
    .max(5000),
});
export const cloudRowSchema = z.object({
  payload: projectSchema,
  revision: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  owner_id: z.uuid(),
  access_role: z.enum(["Owner", "Editor", "Viewer"]),
  updated_at: z.string().refine((s) => Number.isFinite(Date.parse(s))),
});
