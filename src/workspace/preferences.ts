export function readPaneWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  try {
    const raw = localStorage.getItem(key);
    const value = raw === null ? fallback : Number(raw);
    return Number.isFinite(value)
      ? Math.max(min, Math.min(max, value))
      : fallback;
  } catch {
    return fallback;
  }
}
