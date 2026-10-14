import type { PropertyRenderer, PropertyRenderers } from "./api";

export type { PropertyRenderer, PropertyRenderers };

export function createPropertyRenderers(): PropertyRenderers {
  const renderers = new Map<string, PropertyRenderer>();
  return {
    register(renderer) {
      const key = renderer.key.toLowerCase();
      renderers.set(key, renderer);
      return () => {
        if (renderers.get(key) === renderer) {
          renderers.delete(key);
        }
      };
    },
    render(key, value, values) {
      return renderers.get(key.toLowerCase())?.render(value, values);
    },
    bind(root) {
      for (const renderer of renderers.values()) {
        renderer.bind?.(root);
      }
    },
  };
}
