/**
 * Minimal mirror of Markdown Workshop's `parseBridgeEnvelope` (Workbench v1).
 * Kept in lockstep with `vscode-markdown-workbench/src/shared/bridge/parse.ts`
 * so PDF unit tests can assert the public command emits a shape Workshop
 * already accepts. Not a full copy of checks.ts — only what PDF envelopes need.
 */

const HASH = /^[a-f0-9]{16,64}$/i;
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const BRIDGE_KEYS = new Set([
  'version',
  'producer',
  'capturedAt',
  'source',
  'locator',
  'view',
  'selection',
  'revision',
  'wiki',
]);

export type WorkbenchParse =
  | { readonly ok: true; readonly envelope: Record<string, unknown> }
  | { readonly ok: false; readonly reason: string };

/** Unknown versions fail closed so the caller can fall back. */
export function parseWorkbenchBridgeEnvelope(value: unknown): WorkbenchParse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'expected-object' };
  }
  const input = value as Record<string, unknown>;
  if (input.version !== 1) {
    return { ok: false, reason: 'unsupported-version' };
  }
  try {
    return { ok: true, envelope: readEnvelope(input) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid-envelope';
    return { ok: false, reason };
  }
}

function readEnvelope(input: Record<string, unknown>): Record<string, unknown> {
  const producer = input.producer;
  if (producer !== 'markdown' && producer !== 'pdf') {
    throw new TypeError('producer must be markdown or pdf');
  }
  const capturedAt = requiredString(input.capturedAt, 'capturedAt');
  assertTimestamp(capturedAt, 'capturedAt');
  const locator = readLocator(input.locator);
  const view = readView(input.view, (locator as { durable?: string }).durable);
  const extra = unknownFields(input);
  return Object.freeze({
    version: 1,
    producer,
    capturedAt,
    source: readSource(input.source),
    locator,
    ...(view ? { view } : {}),
    selection: readSelection(input.selection),
    revision: readRevision(input.revision),
    ...(extra ? { extra } : {}),
  });
}

function readSource(value: unknown): Record<string, unknown> {
  const input = asObject(value, 'source');
  const kind = input.kind;
  const media = input.media;
  if (kind !== 'file' && kind !== 'untitled' && kind !== 'remote') {
    throw new TypeError('source.kind is invalid');
  }
  if (media !== 'markdown' && media !== 'pdf' && media !== 'other') {
    throw new TypeError('source.media is invalid');
  }
  return {
    identity: requiredString(input.identity, 'source.identity'),
    kind,
    media,
  };
}

function readLocator(value: unknown): Record<string, unknown> {
  const input = asObject(value, 'locator');
  const durable = optionalText(input.durable, 'locator.durable');
  const pdf = readPdf(input.pdf);
  return {
    ...(durable ? { durable } : {}),
    ...(pdf ? { pdf } : {}),
  };
}

function readPdf(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const input = asObject(value, 'locator.pdf');
  const page = input.page;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1) {
    throw new TypeError('pdf page is invalid');
  }
  if (input.viewRect === undefined) return { page };
  const rect = asObject(input.viewRect, 'viewRect');
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (typeof rect[key] !== 'number' || !Number.isFinite(rect[key])) {
      throw new TypeError(`${key} must be a finite number`);
    }
  }
  if ((rect.width as number) < 0 || (rect.height as number) < 0) {
    throw new TypeError('viewRect sizes must be non-negative.');
  }
  return {
    page,
    viewRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  };
}

function readSelection(value: unknown): Record<string, unknown> {
  const input = asObject(value, 'selection');
  if (typeof input.text !== 'string') {
    throw new TypeError('selection.text must be a string');
  }
  const sha256 = requiredString(input.sha256, 'selection.sha256');
  if (!HASH.test(sha256)) {
    throw new TypeError('Hashes are 16 to 64 lowercase hex digits.');
  }
  return { text: input.text, sha256: sha256.toLowerCase() };
}

function readRevision(value: unknown): Record<string, unknown> {
  const input = asObject(value, 'revision');
  if (typeof input.isDirty !== 'boolean') {
    throw new TypeError('revision.isDirty must be boolean');
  }
  const sourceSha256 = optionalText(input.sourceSha256, 'revision.sourceSha256');
  if (input.isDirty && sourceSha256) {
    throw new TypeError('a dirty source has no whole-source hash');
  }
  return {
    isDirty: input.isDirty,
    ...(sourceSha256 ? { sourceSha256: sourceSha256.toLowerCase() } : {}),
  };
}

function readView(value: unknown, durable: string | undefined): { id: string } | undefined {
  if (value === undefined) return undefined;
  const id = requiredString(asObject(value, 'view').id, 'view.id');
  if (durable && id === durable) {
    throw new TypeError('view.id must not repeat the durable locator');
  }
  return { id };
}

function unknownFields(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!BRIDGE_KEYS.has(key)) extra[key] = value;
  }
  return Object.keys(extra).length === 0 ? undefined : extra;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

function assertTimestamp(value: string, label: string): void {
  if (!TIMESTAMP.test(value)) {
    throw new TypeError(`${label} must be an ISO-8601 timestamp.`);
  }
}
