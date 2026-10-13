import { Vim } from "@replit/codemirror-vim";

type Adapter = Parameters<typeof Vim.findKey>[0];
const routingLayer = Symbol("vim-key-routing");
type KeyFinder = typeof Vim.findKey & {
  [routingLayer]?: () => typeof Vim.findKey;
};

function activeKeyFinder(finder: KeyFinder): typeof Vim.findKey {
  return finder[routingLayer]?.() ?? finder;
}

/** A sequence retains its starting adapter even after its logical buffer changes. */
export function installVimKeyRouting() {
  const destinations = new WeakMap<Adapter, Adapter>();
  const original = Vim.findKey;
  let live = true;
  // Both synchronous mapping expansion and macro replay call findKey for each
  // key. Redirect here, before resolving input state or recording that key.
  const findKey: typeof Vim.findKey = (adapter, key, origin) =>
    original.call(
      Vim,
      (live ? destinations.get(adapter) : undefined) ?? adapter,
      key,
      origin,
    );
  Object.defineProperty(findKey, routingLayer, {
    value: () => (live ? findKey : activeKeyFinder(original)),
  });
  Vim.findKey = findKey;
  return {
    handoff(from: Adapter, to: Adapter) {
      destinations.set(from, to);
      return () => destinations.delete(from);
    },
    destroy() {
      // Panels can stop out of registration order. Leave newer hooks in place
      // and make this layer inert if it is still in their delegation chain.
      live = false;
      if (Vim.findKey === findKey) {
        Vim.findKey = activeKeyFinder(original);
      }
    },
  };
}
