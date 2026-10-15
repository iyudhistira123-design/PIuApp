export type Mode = "Builder" | "Plan" | "Ask";
export type Model = "Otomatis" | "Cepat" | "Seimbang" | "Kuat" | (string & {});
export interface OpsChange {
  kind: string;
  target: string;
  id?: string;
  name?: string;
  changes?: string[];
  reason?: string;
}
/** What the server actually did with a structured scene ops batch. */
export interface OpsReport {
  version: number;
  applied: OpsChange[];
  rejected: OpsChange[];
  sceneChanged: boolean;
  note: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: Mode;
  files?: string[];
  ops?: OpsReport;
  summary?: string[];
  /** Model the provider answered with, shown on the reply. */
  model?: string;
  at: number;
}
export interface Version {
  id: string;
  label: string;
  files: Record<string, string>;
  at: number;
}
export interface Plan {
  pages?: string[];
  structure?: string[];
  decisions?: string[];
  goal: string;
  tasks: { text: string; done: boolean; comment: string }[];
  approved: boolean;
}
export interface Project {
  kind?: import("./project-kinds").ProjectKind;
  id: string;
  name: string;
  description: string;
  template: string;
  files: Record<string, string>;
  messages: Message[];
  versions: Version[];
  createdAt: number;
  updatedAt: number;
  plan?: Plan;
  comments: { id: string; selector: string; body: string; resolved: boolean }[];
}
export interface User {
  id: string;
  name: string;
  email: string;
  demo: boolean;
}
export interface SavedPrompt {
  id: string;
  title: string;
  content: string;
  tags: string;
}
