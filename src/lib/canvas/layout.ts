export type FrameKind = "desktop" | "tablet" | "mobile";
export interface CanvasFrame {
  id: string;
  name: string;
  kind: FrameKind;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Camera {
  x: number;
  y: number;
  scale: number;
}
export const presets: Record<
  FrameKind,
  { name: string; width: number; height: number }
> = {
  desktop: { name: "Desktop", width: 1280, height: 800 },
  tablet: { name: "Tablet", width: 768, height: 1024 },
  mobile: { name: "Ponsel", width: 390, height: 844 },
};
export const MAX_FRAMES = 6;
export const MIN_SCALE = 0.12;
export const MAX_SCALE = 1.5;
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export function frameOf(kind: FrameKind, index = 1, x = 0): CanvasFrame {
  return {
    id: crypto.randomUUID(),
    kind,
    name: presets[kind].name + (index > 1 ? " " + index : ""),
    x,
    y: 0,
    width: presets[kind].width,
    height: presets[kind].height,
  };
}
export function initialFrames() {
  return [
    frameOf("desktop"),
    frameOf("tablet", 1, 1360),
    frameOf("mobile", 1, 2208),
  ];
}
export function arrangeFrames(frames: CanvasFrame[]) {
  let x = 0;
  return frames.map((f) => {
    const next = { ...f, x, y: 0 };
    x += f.width + 80;
    return next;
  });
}
export function layoutKey(scope: string, project: string) {
  return `piwu-canvas-v1:${encodeURIComponent(scope)}:${encodeURIComponent(project)}`;
}
export function decodeLayout(raw: string): CanvasFrame[] {
  const parsed = JSON.parse(raw);
  if (
    parsed?.version !== 1 ||
    !Array.isArray(parsed.frames) ||
    parsed.frames.length > MAX_FRAMES
  )
    throw new Error("Layout canvas tidak valid.");
  const ids = new Set<string>();
  return parsed.frames.map((f: CanvasFrame) => {
    if (
      !f ||
      typeof f.id !== "string" ||
      f.id.length > 80 ||
      ids.has(f.id) ||
      typeof f.name !== "string" ||
      !f.name.trim() ||
      f.name.length > 60 ||
      !Object.hasOwn(presets, f.kind) ||
      !Number.isFinite(f.x) ||
      !Number.isFinite(f.y) ||
      Math.abs(f.x) > 20000 ||
      Math.abs(f.y) > 20000 ||
      !Number.isInteger(f.width) ||
      f.width < 320 ||
      f.width > 1920 ||
      !Number.isInteger(f.height) ||
      f.height < 320 ||
      f.height > 1600
    )
      throw new Error("Layout canvas tidak valid.");
    ids.add(f.id);
    return {
      id: f.id,
      name: f.name,
      kind: f.kind,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
    };
  });
}
export function fitCamera(
  frames: CanvasFrame[],
  width: number,
  height: number,
): Camera {
  if (!frames.length) return { x: 48, y: 80, scale: 0.5 };
  const minX = Math.min(...frames.map((f) => f.x)),
    minY = Math.min(...frames.map((f) => f.y - 42));
  const maxX = Math.max(...frames.map((f) => f.x + f.width)),
    maxY = Math.max(...frames.map((f) => f.y + f.height));
  const scale = clamp(
    Math.min(
      (Math.max(width, 200) - 100) / (maxX - minX),
      (Math.max(height, 200) - 150) / (maxY - minY),
    ),
    MIN_SCALE,
    0.9,
  );
  return {
    x: (width - (maxX - minX) * scale) / 2 - minX * scale,
    y: (height - (maxY - minY) * scale) / 2 - minY * scale - 12,
    scale,
  };
}
export function zoomAt(
  camera: Camera,
  scale: number,
  x: number,
  y: number,
): Camera {
  const next = clamp(scale, MIN_SCALE, MAX_SCALE);
  return {
    x: x - ((x - camera.x) * next) / camera.scale,
    y: y - ((y - camera.y) * next) / camera.scale,
    scale: next,
  };
}
