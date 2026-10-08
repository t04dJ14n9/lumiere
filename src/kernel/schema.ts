export type Infer<S> = S extends Schema<infer T> ? T : never;
type Shape = Record<string, Schema<unknown>>;
type ObjectValue<S extends Shape> = { [K in keyof S as undefined extends Infer<S[K]> ? never : K]: Infer<S[K]> } & {
  [K in keyof S as undefined extends Infer<S[K]> ? K : never]?: Infer<S[K]>;
};
export class ValidationError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path || "$"}: ${message}`);
  }
}
/** Immutable schema definitions; defaults are parsed afresh, never shared mutable data. */
export class Schema<T> {
  constructor(
    private readonly read: (value: unknown, path: string) => T,
    private readonly json: Record<string, unknown>,
  ) {}
  parse(value: unknown): T {
    return this.read(value, "$");
  }
  at(value: unknown, path: string): T {
    return this.read(value, path);
  }
  toJSONSchema(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(this.json));
  }
  optional(): Schema<T | undefined> {
    return new Schema((v, p) => (v === undefined ? undefined : this.read(v, p)), this.json);
  }
  default(value: T): Schema<T> {
    this.parse(value);
    return new Schema((v, p) => this.read(v === undefined ? value : v, p), { ...this.json, default: value });
  }
  description(value: string): Schema<T> {
    return new Schema(this.read, { ...this.json, description: value });
  }
  min(value: number): Schema<T> {
    return this.bound(value, false);
  }
  max(value: number): Schema<T> {
    return this.bound(value, true);
  }
  private bound(value: number, max: boolean): Schema<T> {
    const key =
      this.json.type === "number"
        ? max
          ? "maximum"
          : "minimum"
        : this.json.type === "array"
          ? max
            ? "maxItems"
            : "minItems"
          : max
            ? "maxLength"
            : "minLength";
    return new Schema(
      (v, p) => {
        const parsed = this.read(v, p);
        const size =
          typeof parsed === "number"
            ? parsed
            : typeof parsed === "string" || Array.isArray(parsed)
              ? parsed.length
              : NaN;
        if (!Number.isFinite(size) || (max ? size > value : size < value))
          throw new ValidationError(p, `violates ${key} ${value}`);
        return parsed;
      },
      { ...this.json, [key]: value },
    );
  }
  pattern(pattern: RegExp): Schema<T> {
    return new Schema(
      (v, p) => {
        const parsed = this.read(v, p);
        if (typeof parsed !== "string" || !new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, "")).test(parsed))
          throw new ValidationError(p, "pattern mismatch");
        return parsed;
      },
      { ...this.json, pattern: pattern.source },
    );
  }
  static boolean(): Schema<boolean> {
    return new Schema(
      (v, p) => {
        if (typeof v !== "boolean") throw new ValidationError(p, "expected boolean");
        return v;
      },
      { type: "boolean" },
    );
  }
  static number(): Schema<number> {
    return new Schema(
      (v, p) => {
        if (typeof v !== "number" || !Number.isFinite(v)) throw new ValidationError(p, "expected finite number");
        return v;
      },
      { type: "number" },
    );
  }
  static string(): Schema<string> {
    return new Schema(
      (v, p) => {
        if (typeof v !== "string") throw new ValidationError(p, "expected string");
        return v;
      },
      { type: "string" },
    );
  }
  static unknown(): Schema<unknown> {
    return new Schema((v) => v, {});
  }
  static union<const T extends readonly (string | number | boolean | null)[]>(values: T): Schema<T[number]> {
    return new Schema(
      (v, p) => {
        if (!values.includes(v as T[number])) throw new ValidationError(p, "expected enum member");
        return v as T[number];
      },
      { enum: [...values] },
    );
  }
  static array<T>(item: Schema<T>): Schema<T[]> {
    return new Schema(
      (v, p) => {
        if (!Array.isArray(v)) throw new ValidationError(p, "expected array");
        return v.map((x, i) => item.at(x, `${p}[${i}]`));
      },
      { type: "array", items: item.toJSONSchema() },
    );
  }
  static object<S extends Shape>(shape: S): Schema<ObjectValue<S>> {
    return new Schema(
      (v, p) => {
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new ValidationError(p, "expected object");
        const input = v as Record<string, unknown>;
        for (const key of Object.keys(input))
          if (!Object.hasOwn(shape, key)) throw new ValidationError(`${p}.${key}`, "unexpected property");
        return Object.fromEntries(
          Object.entries(shape)
            .map(([key, schema]) => [key, schema.at(Object.hasOwn(input, key) ? input[key] : undefined, `${p}.${key}`)])
            .filter(([, value]) => value !== undefined),
        ) as ObjectValue<S>;
      },
      {
        type: "object",
        properties: Object.fromEntries(Object.entries(shape).map(([k, s]) => [k, s.toJSONSchema()])),
        required: Object.entries(shape)
          .filter(([, s]) => {
            try {
              s.parse(undefined);
              return false;
            } catch {
              return true;
            }
          })
          .map(([k]) => k),
        additionalProperties: false,
      },
    );
  }
  static record<T>(item: Schema<T>): Schema<Record<string, T>> {
    return new Schema(
      (v, p) => {
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new ValidationError(p, "expected record");
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, item.at(x, `${p}.${k}`)]));
      },
      { type: "object", additionalProperties: item.toJSONSchema() },
    );
  }
}
