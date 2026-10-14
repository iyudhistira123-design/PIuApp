import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { sceneSchema, type RobloxScene } from "./scene";
// Move in the map's world X/Z plane even when a Model parent is rotated.
export function nudgeOnMap(
  scene: RobloxScene,
  id: string,
  x: number,
  z: number,
): RobloxScene {
  const item = scene.objects.find((o) => o.id === id);
  if (!item) return scene;
  const chain = [];
  let parent = item.parent;
  while (parent) {
    const p = scene.objects.find((o) => o.id === parent)!;
    chain.unshift(p);
    parent = p.parent;
  }
  const matrix = new Matrix4();
  for (const p of chain)
    matrix.multiply(
      new Matrix4().compose(
        new Vector3(...p.position),
        new Quaternion().setFromEuler(
          new Euler(
            ...(p.rotation.map((n) => (n * Math.PI) / 180) as [
              number,
              number,
              number,
            ]),
          ),
        ),
        new Vector3(1, 1, 1),
      ),
    );
  const pos = new Vector3(...item.position)
    .applyMatrix4(matrix)
    .add(new Vector3(x, 0, z))
    .applyMatrix4(matrix.invert());
  return sceneSchema.parse({
    ...scene,
    objects: scene.objects.map((o) =>
      o.id === id
        ? { ...o, position: pos.toArray().map((n) => Number(n.toFixed(6))) }
        : o,
    ),
  });
}
