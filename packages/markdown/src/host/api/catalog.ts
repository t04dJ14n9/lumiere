import { features, workbenchFeatures } from "../../plugins/catalog";
import publicApi from "../../plugins/publicApi/manifest";
import document from "../../plugins/document/manifest";
import editor from "../../plugins/editor/manifest";
import dialect from "../../plugins/dialect/manifest";
import commands from "../../plugins/commands/manifest";
import livePreview from "../../plugins/livePreview/manifest";
import render from "../../plugins/render/manifest";
import resources from "../../plugins/resources/manifest";
import vault from "../../plugins/vault/manifest";
import markers from "../../plugins/markers/manifest";
import type { PluginDescriptor } from "./types";
export const builtinCatalog: readonly PluginDescriptor[] = Object.freeze(
  [
    publicApi,
    document,
    editor,
    dialect,
    commands,
    livePreview,
    render,
    resources,
    vault,
    markers,
    ...features,
    ...workbenchFeatures,
  ].map(({ id, title, description, kind, defaultEnabled, surfaces }) =>
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
