import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentTarget, type AgentEnvironment } from '../../src/shared/agent-target';

const vscode = (commands: string[], hasChatParticipant = false): AgentEnvironment =>
  ({ appName: 'Visual Studio Code', commands: new Set(['workbench.action.chat.open', ...commands]), hasChatParticipant });

test('Copy Link for Agent prefers the editor\'s own chat, then Claude Code, then Codex', () => {
  assert.equal(agentTarget('auto', { appName: 'Cursor', commands: new Set(['workbench.action.chat.open']), hasChatParticipant: false }), 'cursor');
  assert.equal(agentTarget('auto', vscode(['claude-vscode.editor.openLast'], true)), 'chat');
  assert.equal(agentTarget('auto', vscode(['claude-vscode.editor.openLast', 'chatgpt.openSidebar'])), 'claudeCode');
  assert.equal(agentTarget('auto', vscode(['chatgpt.openSidebar'])), 'codex');
});

test('VS Code\'s chat command alone is not a chat: without a participant it shows nothing', () => {
  assert.equal(agentTarget('auto', vscode([])), 'clipboard');
  assert.equal(agentTarget('chat', vscode([])), 'clipboard');
  // Nor with AI features turned off.
  assert.equal(agentTarget('auto', { ...vscode(['chatgpt.openSidebar'], true), chatDisabled: true }), 'codex');
});

test('a chosen target is used when available, else the clipboard', () => {
  const both = vscode(['claude-vscode.editor.openLast', 'chatgpt.openSidebar'], true);
  assert.equal(agentTarget('codex', both), 'codex');
  assert.equal(agentTarget('clipboard', both), 'clipboard');
  assert.equal(agentTarget('cursor', both), 'clipboard');
});
