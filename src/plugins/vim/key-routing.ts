import { Vim } from "@replit/codemirror-vim";

type Adapter = Parameters<typeof Vim.findKey>[0];
const routingLayer = Symbol("vim-key-routing");
type KeyFinder = typeof Vim.findKey & {
  [routingLayer]?: () => typeof Vim.findKey;
};

function activeKeyFinder(finder: KeyFinder): typeof Vim.findKey {
  return finder[routingLayer]?.() ?? finder;
}

/** Forward cached executor objects without changing the adapter's public state. */
function forwardObject<T extends object>(
  current: () => T,
  bindMethods = false,
): T {
  return new Proxy(current(), {
    get(_target, property) {
      const owner = current();
      const value: unknown = Reflect.get(owner, property, owner);
      // Adapter methods need their real receiver; mode fields such as lastMotion
      // must retain function identity for Vim's vertical-column bookkeeping.
      return bindMethods && typeof value === "function"
        ? value.bind(owner)
        : value;
    },
    set(_target, property, value: unknown) {
      const owner = current();
      return Reflect.set(owner, property, value, owner);
    },
  });
}

function sequenceAdapter(source: Adapter) {
  let current = source;
  // doKeyToKey and macro replay retain both cm and vim. Forward both objects,
  // including macro insert-change application and special-key fallbacks.
  Vim.maybeInitVimState_(source);
  const mode = forwardObject(() => {
    const vim = current.state.vim;
    if (!vim) {
      return Vim.maybeInitVimState_(current);
    }
    return vim;
  });
  const state = forwardObject(() => current.state);
  const routedState = new Proxy(state, {
    get(target, property) {
      return property === "vim" ? mode : Reflect.get(target, property);
    },
  });
  const adapter = new Proxy(
    forwardObject(() => current, true),
    {
      get(target, property) {
        return property === "state"
          ? routedState
          : Reflect.get(target, property);
      },
    },
  );
  return {
    source,
    adapter,
    use(destination: Adapter) {
      current = destination;
    },
  };
}

/** A sequence retains its starting adapter even after its logical buffer changes. */
export function installVimKeyRouting() {
  const destinations = new WeakMap<Adapter, Adapter>();
  const original = Vim.findKey;
  let live = true;
  const sequences = new WeakMap<Adapter, ReturnType<typeof sequenceAdapter>>();
  const findKey: typeof Vim.findKey = (adapter, key, origin) => {
    if (!live) {
      return original.call(Vim, adapter, key, origin);
    }
    let sequence = sequences.get(adapter);
    if (!sequence) {
      sequence = sequenceAdapter(adapter);
      sequences.set(adapter, sequence);
      sequences.set(sequence.adapter, sequence);
    }
    // Switch only at the next key boundary: the handing-off motion must finish
    // its bookkeeping on the cell before cached executor state follows it.
    sequence.use(destinations.get(sequence.source) ?? sequence.source);
    return original.call(Vim, sequence.adapter, key, origin);
  };
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
