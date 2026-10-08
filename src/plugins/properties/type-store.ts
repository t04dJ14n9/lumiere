import {
  propertyTypes,
  type PropertyKind,
  type PropertyTypes,
} from "../../markdown/properties/types";
interface PreferenceStorage {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

/** Preferences are scoped by vault root; note values remain in TextDocuments. */
export class PropertyTypeStore {
  private pending: Promise<void> = Promise.resolve();
  private readonly key = "markdownPropertyTypes";

  constructor(private readonly storage: PreferenceStorage) {}

  read(scope: string): PropertyTypes {
    const all = this.storage.get<Record<string, unknown>>(this.key, {});
    const types =
      all && typeof all === "object" && Object.hasOwn(all, scope)
        ? all[scope]
        : undefined;
    return propertyTypes(types)
      ? Object.fromEntries(
          Object.entries(types).map(([key, kind]) => [key.toLowerCase(), kind]),
        )
      : {};
  }

  set(scope: string, key: string, kind: PropertyKind | null): Promise<void> {
    const update = this.pending.then(async () => {
      const all = this.storage.get<Record<string, unknown>>(this.key, {});
      let types = { ...this.read(scope) };
      if (kind === null) {
        delete types[key.toLowerCase()];
      } else {
        types = { ...types, [key.toLowerCase()]: kind };
      }
      await this.storage.update(this.key, { ...all, [scope]: types });
    });
    this.pending = update.catch(() => {});
    return update;
  }
}
