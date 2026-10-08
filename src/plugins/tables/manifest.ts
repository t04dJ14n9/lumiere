import { defineManifest } from "../../shared/manifest";
export const tableCommands = [
  ["insert-row-above", "Insert Row Above"],
  ["insert-row-below", "Insert Row Below"],
  ["insert-column-left", "Insert Column Left"],
  ["insert-column-right", "Insert Column Right"],
  ["delete-row", "Delete Row"],
  ["delete-column", "Delete Column"],
  ["move-row-up", "Move Row Up"],
  ["move-row-down", "Move Row Down"],
  ["move-column-left", "Move Column Left"],
  ["move-column-right", "Move Column Right"],
  ["align-left", "Align Left"],
  ["align-center", "Align Center"],
  ["align-right", "Align Right"],
  ["sort-ascending", "Sort Ascending"],
  ["sort-descending", "Sort Descending"],
] as const;
export default defineManifest({
  id: "tables",
  title: "Tables",
  description: "Edit Markdown tables as grids with projected cell editing.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  contributes: {
    commands: [
      {
        id: "insertTable",
        title: "Insert Table",
        editorCommand: "editor:insert-table",
      },
      ...tableCommands.map(([id, title]) => ({
        id:
          "table" +
          id
            .split("-")
            .map((part) => part[0]!.toUpperCase() + part.slice(1))
            .join(""),
        title: "Table: " + title,
        editorCommand: "editor:table-" + id,
      })),
    ],
  },
});
