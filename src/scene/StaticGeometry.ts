import { BufferGeometry, Mesh } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Bake static pieces into one draw while keeping their normals and UVs intact.
 * Source geometry remains owned by the caller (it may be shared elsewhere).
 */
export function mergeStaticGeometry(meshes: readonly Mesh[]): BufferGeometry {
  const parts = meshes.map((mesh) => {
    mesh.updateMatrix();
    return mesh.geometry.clone().applyMatrix4(mesh.matrix);
  });
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error("Static geometry attributes must match.");
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
