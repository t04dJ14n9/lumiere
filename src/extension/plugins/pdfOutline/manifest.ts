import { defineManifest } from '../../runtime/manifest';

export default defineManifest({
  id: 'pdfOutline',
  title: 'PDF Outline',
  capabilities: ['treeView', 'commands'],
  requires: ['pdf'],
});
