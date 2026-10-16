export const CREDIT_COSTS: {
  ask: number;
  plan: number;
  chat: { Cepat: number; Seimbang: number; Kuat: number };
  researchRound: number;
  researchRoundsPerRequest: number;
  sandboxCommand: number;
  sandboxJob: number;
  audit: number;
  publish: number;
};
export const PLAN_PERIOD_DAYS: number;
export const FREE_PLAN: {
  plan: string;
  credits: number;
  once: boolean;
  reason: string;
};
export const PLAN_LADDER: {
  plan: string;
  sku: string | null;
  monthly: number;
  annual: number;
  credits: number;
  once?: boolean;
}[];
export const TOPUP_LADDER: { sku: string; amount: number; credits: number }[];
export function usageProfile(id: string): UsageProfile;
export function costLine(): string;
export interface UsageProfile {
  id: string;
  label: string;
  detail: string;
  chatSeimbang?: number;
  chatKuat?: number;
  chatCepat?: number;
  ask?: number;
  plan?: number;
  researchRounds?: number;
  sandboxJobsPerWeek?: number;
  auditsPerMonth?: number;
  publishesPerMonth?: number;
}
export const USAGE_PROFILES: UsageProfile[];
export function creditsPerDay(profile?: UsageProfile): number;
export function durationDays(credits: number, profile?: UsageProfile): number;
export function lastsLabel(credits: number, profile?: UsageProfile): string;
export function ratePerCredit(amount: number, credits: number): number;
export function ratesAreMonotonic(
  offers: { amount: number; credits: number }[],
): boolean;
