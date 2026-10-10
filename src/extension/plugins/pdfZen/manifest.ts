import { defineManifest } from '../../runtime/manifest';

export default defineManifest({
  id: 'pdfZen',
  title: 'Zen mode',
  capabilities: ['commands'],
  requires: ['pdf'],
});
