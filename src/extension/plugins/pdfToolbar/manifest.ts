import { defineManifest } from '../../runtime/manifest';

export default defineManifest({
  id: 'pdfToolbar',
  title: 'PDF Toolbar',
  capabilities: ['statusBar', 'commands'],
  requires: ['pdf'],
});
