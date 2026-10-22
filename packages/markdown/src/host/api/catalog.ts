import {
  coreManifests,
  features,
  workbenchFeatures,
} from "../../plugins/catalog";
import type { PluginDescriptor } from "./types";
export const builtinCatalog: readonly PluginDescriptor[] = Object.freeze(
  [...coreManifests, ...features, ...workbenchFeatures].map(
    ({ id, title, description, kind, defaultEnabled, surfaces }) =>
      Object.freeze({
        id,
        title,
        description,
        kind,
        defaultEnabled,
        surfaces: Object.freeze([...surfaces]),
      }),
  ),
);
