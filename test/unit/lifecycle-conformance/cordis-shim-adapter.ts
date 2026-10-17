import { CordisApplication } from "../../../src/kernel-cordis/application";
import type { BackingService, HarnessFactory } from "./shared/harness";

interface Services {
  lifecycleBacking: BackingService;
  lifecycleDerived: BackingService;
}

/** Only translates the harness contract; all lifecycle machinery lives in src. */
export const createCordisShimHarness: HarnessFactory = (specs) => {
  const errors: string[] = [];
  const application = new CordisApplication<Services>(
    specs.map((spec) => ({
      id: spec.id,
      requires: spec.requires ?? [],
      provides: spec.provides ? [spec.provides] : [],
      apply: (scope) => spec.activate(scope),
    })),
    (error) => {
      errors.push(error instanceof Error ? error.message : String(error));
    },
  );
  return {
    errors,
    enable: (id) => application.enable(id),
    disable: (id) => application.disable(id),
    restart: (id) => application.restart(id),
    dispose: () => application.dispose(),
    state: (id) => application.state(id),
    service: (name) => application.find(name),
  };
};
