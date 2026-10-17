/**
 * Selects which host plugin runtime implements lifetime for this activation.
 * Default remains native until Stage C. Env wins over the contributed setting
 * so unpackaged Host / CI-less local runs can flip without editing settings.
 */
export type RuntimeImpl = 'native' | 'cordis';

/** Contributed setting key (package.json). */
export const RUNTIME_IMPL_SETTING = 'pdfWorkshop.runtimeImpl';

/** Env override, e.g. PDF_WORKSHOP_RUNTIME_IMPL=cordis. */
export const RUNTIME_IMPL_ENV = 'PDF_WORKSHOP_RUNTIME_IMPL';

export function resolveRuntimeImpl(readSetting: () => unknown): RuntimeImpl {
  const fromEnv = process.env[RUNTIME_IMPL_ENV]?.trim().toLowerCase();
  if (fromEnv === 'native' || fromEnv === 'cordis') return fromEnv;
  const fromSetting = readSetting();
  if (fromSetting === 'native' || fromSetting === 'cordis') return fromSetting;
  return 'native';
}
