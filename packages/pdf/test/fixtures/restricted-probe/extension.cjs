/* global require, exports */
// VS Code loads this test-only extension through its CommonJS entry point.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vscode = require('vscode');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TextEncoder } = require('node:util');

exports.activate = context => {
  const agentCalls = [];
  context.subscriptions.push(
    // A stub only: no third-party agent is installed or contacted.
    vscode.commands.registerCommand('claude-vscode.editor.open', (...args) => agentCalls.push(args)),
    vscode.commands.registerCommand('pdfWorkshopTests.reportTrust', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) throw new Error('The test workspace is missing');
      const settings = vscode.workspace.getConfiguration('pdfWorkshop');
      const report = {
        trusted: vscode.workspace.isTrusted,
        extensionActive: vscode.extensions.getExtension('t04dj14n9.vscode-workshop')?.isActive,
        bridgeEnabled: settings.get('agentBridge.enabled'),
        target: settings.get('copyLinkForAgent.target'),
        workspaceBridge: settings.inspect('agentBridge.enabled')?.workspaceValue,
        workspaceTarget: settings.inspect('copyLinkForAgent.target')?.workspaceValue,
        clipboard: await vscode.env.clipboard.readText(),
        agentCalls,
      };
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(folder.uri, 'trust-state.json'),
        new TextEncoder().encode(JSON.stringify(report)),
      );
    }),
  );
};
