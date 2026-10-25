import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
import { pluginBundleSchema } from "../obsidianCompat/protocol";

const pluginIdSchema = Schema.string()
  .min(1)
  .max(256)
  .pattern(/^[A-Za-z0-9._-]+$/);

export const marketplaceEntrySchema = Schema.object({
  id: pluginIdSchema,
  name: Schema.string().min(1).max(512),
  author: Schema.string().max(512),
  description: Schema.string().max(4096),
  repo: Schema.string().max(512),
  downloads: Schema.number(),
  installed: Schema.boolean(),
  enabled: Schema.boolean(),
  installedVersion: Schema.string().max(128).optional(),
});

export const catalogSnapshotSchema = Schema.object({
  trusted: Schema.boolean(),
  configDir: Schema.string(),
  items: Schema.array(marketplaceEntrySchema),
});

export const mutationResultSchema = Schema.object({
  trusted: Schema.boolean(),
  configDir: Schema.string(),
  enabledIds: Schema.array(pluginIdSchema),
  item: marketplaceEntrySchema.optional(),
  items: Schema.array(marketplaceEntrySchema),
  plugins: Schema.array(pluginBundleSchema),
});

export const protocol = defineProtocol("obsidianMarketplace", {
  requests: {
    listCatalog: {
      params: Schema.object({
        forceRefresh: Schema.boolean().optional(),
      }),
      result: catalogSnapshotSchema,
    },
    installPlugin: {
      params: Schema.object({
        id: Schema.string().min(1).max(256),
        repo: Schema.string().max(512).optional(),
      }),
      result: mutationResultSchema,
    },
    setPluginEnabled: {
      params: Schema.object({
        id: Schema.string().min(1).max(256),
        enabled: Schema.boolean(),
      }),
      result: mutationResultSchema,
    },
    uninstallPlugin: {
      params: Schema.object({
        id: Schema.string().min(1).max(256),
      }),
      result: mutationResultSchema,
    },
  },
  notifications: {
    openModal: Schema.object({
      query: Schema.string().max(512).optional(),
    }),
    catalogUpdated: catalogSnapshotSchema,
  },
});
