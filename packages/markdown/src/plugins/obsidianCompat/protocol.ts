import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";

const pluginIdSchema = Schema.string()
  .min(1)
  .max(256)
  .pattern(/^[A-Za-z0-9._-]+$/);

const vaultPathSchema = Schema.string().min(0).max(4096);

export const manifestSchema = Schema.object({
  id: pluginIdSchema,
  name: Schema.string().min(1).max(512),
  version: Schema.string().min(1).max(128),
  minAppVersion: Schema.string().max(128).optional(),
  description: Schema.string().max(4096).optional(),
  author: Schema.string().max(512).optional(),
  authorUrl: Schema.string().max(2048).optional(),
  isDesktopOnly: Schema.boolean().optional(),
  dir: Schema.string().max(4096).optional(),
});

export const pluginBundleSchema = Schema.object({
  id: pluginIdSchema,
  manifest: manifestSchema,
  mainJs: Schema.string(),
  stylesCss: Schema.string().optional(),
  data: Schema.unknown().optional(),
});

export const serializedVaultFileSchema = Schema.object({
  path: vaultPathSchema,
  mtime: Schema.number(),
  ctime: Schema.number().optional(),
  size: Schema.number(),
  content: Schema.string().optional(),
});

export const bootstrapSnapshotSchema = Schema.object({
  trusted: Schema.boolean(),
  vaultRoot: Schema.string(),
  vaultName: Schema.string(),
  configDir: Schema.string(),
  activePath: Schema.string(),
  files: Schema.array(serializedVaultFileSchema),
  plugins: Schema.array(pluginBundleSchema),
});

export const protocol = defineProtocol("obsidianCompat", {
  requests: {
    bootstrap: {
      params: Schema.object({}),
      result: bootstrapSnapshotSchema,
    },
    loadPluginData: {
      params: Schema.object({ pluginId: pluginIdSchema }),
      result: Schema.object({ data: Schema.unknown().optional() }),
    },
    savePluginData: {
      params: Schema.object({
        pluginId: pluginIdSchema,
        data: Schema.unknown().optional(),
      }),
      result: Schema.boolean(),
    },
    vaultRead: {
      params: Schema.object({ path: vaultPathSchema }),
      result: Schema.object({ content: Schema.string() }),
    },
    vaultModify: {
      params: Schema.object({
        path: vaultPathSchema,
        data: Schema.string(),
      }),
      result: Schema.object({ mtime: Schema.number(), size: Schema.number() }),
    },
    vaultCreate: {
      params: Schema.object({
        path: vaultPathSchema,
        data: Schema.string(),
      }),
      result: serializedVaultFileSchema,
    },
    vaultCreateFolder: {
      params: Schema.object({ path: vaultPathSchema }),
      result: Schema.object({ path: vaultPathSchema }),
    },
    vaultDelete: {
      params: Schema.object({ path: vaultPathSchema }),
      result: Schema.boolean(),
    },
    vaultRename: {
      params: Schema.object({
        path: vaultPathSchema,
        newPath: vaultPathSchema,
      }),
      result: Schema.object({
        path: vaultPathSchema,
        newPath: vaultPathSchema,
      }),
    },
    vaultExists: {
      params: Schema.object({ path: vaultPathSchema }),
      result: Schema.boolean(),
    },
    openLinkText: {
      params: Schema.object({
        linktext: Schema.string().max(4096),
        sourcePath: vaultPathSchema,
        newLeaf: Schema.boolean().optional(),
      }),
      result: Schema.boolean(),
    },
  },
  notifications: {
    vaultChanged: Schema.object({
      activePath: Schema.string(),
      files: Schema.array(serializedVaultFileSchema),
    }),
    pluginsChanged: Schema.object({
      trusted: Schema.boolean(),
      configDir: Schema.string(),
      plugins: Schema.array(pluginBundleSchema),
    }),
  },
});
