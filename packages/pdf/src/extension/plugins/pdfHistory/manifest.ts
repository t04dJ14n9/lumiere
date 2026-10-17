import { defineManifest } from '../../runtime/manifest';

export default defineManifest({
  id: 'pdfHistory',
  title: 'PDF location history',
  capabilities: ['commands'],
  requires: ['pdf'],
});
