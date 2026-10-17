import { defineManifest } from "../manifest";

export default defineManifest({
  id: "pdf",
  title: "PDF Viewer",
  capabilities: [
    "customEditor",
    "binaryDocument",
    "selectionProvider",
    "navigationTarget",
    "commands",
  ],
});
