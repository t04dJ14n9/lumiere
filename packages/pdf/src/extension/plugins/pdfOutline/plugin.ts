import * as vscode from 'vscode';
import { OUTLINE_COMMAND_IDS } from '../pdf/registered-commands';
import type { Plugin } from "@workshop/core";
import type {} from "../services";
import manifest from './manifest';
import { registerOutlineView } from './outline-view';

/** The PDF Outline view in the Explorer, and the viewer bar's outline button. */
export const pdfOutlinePlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["pdfPanels", "pdfSettings", "outputChannel"] },
  apply(ctx) {
    const panels = ctx.pdfPanels;
    ctx.own(registerOutlineView(panels, ctx.pdfSettings, ctx.outputChannel), 'treeView');
    ctx.own(panels.handle('toggleOutline', () => vscode.commands.executeCommand(OUTLINE_COMMAND_IDS.toggleOutline)), 'message handler');
  },
};
