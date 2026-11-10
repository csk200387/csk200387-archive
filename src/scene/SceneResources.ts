import {
  BufferGeometry,
  DirectionalLight,
  Material,
  Mesh,
  Points,
  Scene,
  ShaderMaterial,
  Texture,
} from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

/** Release GPU allocations once per shared resource. CPU sources remain reusable
 * when returning from the index; final teardown also drops the scene references.
 */
export function releaseSceneGpu(scene: Scene) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const collectTexture = (value: unknown) => {
    if (value instanceof Texture && !value.isRenderTargetTexture)
      textures.add(value);
  };
  scene.traverse((object) => {
    if (object instanceof DirectionalLight) {
      object.shadow.dispose();
      object.shadow.map = null;
      object.shadow.mapPass = null;
    }
    if (object instanceof Mesh || object instanceof Points) {
      geometries.add(object.geometry);
      if (object instanceof Reflector) {
        // Render targets own framebuffers/depth attachments as well as textures.
        object.getRenderTarget().dispose();
      }
      if (Array.isArray(object.material)) {
        for (const material of object.material) materials.add(material);
      } else materials.add(object.material);
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) collectTexture(value);
    if (material instanceof ShaderMaterial) {
      for (const uniform of Object.values(material.uniforms)) {
        const value: unknown = uniform.value;
        if (Array.isArray(value)) value.forEach(collectTexture);
        else collectTexture(value);
      }
    }
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
}
