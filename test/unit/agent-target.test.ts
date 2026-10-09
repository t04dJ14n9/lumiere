import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentTarget, type AgentEnvironment } from '../../src/shared/agent-target';

const CLAUDE = ['claude-vscode.editor.open'];
const CODEX = ['chatgpt.openSidebar', 'chatgpt.addFileToThread'];

const vscode = (commands: string[], hasChatParticipant = false, agentExtensions: string[] = []): AgentEnvironment => ({
  appName: 'Visual Studio Code',
  commands: new Set(['workbench.action.chat.open', ...commands]),
  hasChatParticipant,
  agentExtensions: new Set(agentExtensions),
});
const cursor = (commands: string[] = [], agentExtensions: string[] = []): AgentEnvironment =>
  ({ ...vscode(commands, false, agentExtensions), appName: 'Cursor' });

test('auto opens the editor\'s own chat when it is the only agent', () => {
  assert.equal(agentTarget('auto', cursor()), 'cursor');
  assert.equal(agentTarget('auto', vscode([], true)), 'chat');
});

test('auto never guesses between agents: with Claude Code or Codex installed it only copies', () => {
  assert.equal(agentTarget('auto', cursor(CLAUDE)), 'clipboard');
  assert.equal(agentTarget('auto', vscode(CLAUDE, true)), 'clipboard');
  assert.equal(agentTarget('auto', vscode(CODEX, true)), 'clipboard');
  assert.equal(agentTarget('auto', vscode([...CLAUDE, ...CODEX])), 'clipboard');
  // Claude Code alone is not picked either: its sidebar may be closed, the user may use a terminal agent.
  assert.equal(agentTarget('auto', vscode(CLAUDE)), 'clipboard');
  assert.equal(agentTarget('auto', vscode(CODEX)), 'clipboard');
  // Installed but not activated yet (no commands registered): still another agent.
  assert.equal(agentTarget('auto', cursor([], ['openai.chatgpt'])), 'clipboard');
  assert.equal(agentTarget('auto', vscode([], true, ['anthropic.claude-code'])), 'clipboard');
});

test('VS Code\'s chat command alone is not a chat: without a participant it shows nothing', () => {
  assert.equal(agentTarget('auto', vscode([])), 'clipboard');
  assert.equal(agentTarget('chat', vscode([])), 'clipboard');
  // Nor with AI features turned off.
  assert.equal(agentTarget('auto', { ...vscode([], true), chatDisabled: true }), 'clipboard');
});

test('the setting forces an agent when it is available, else the clipboard', () => {
  const all = vscode([...CLAUDE, ...CODEX], true);
  assert.equal(agentTarget('claudeCode', all), 'claudeCode');
  assert.equal(agentTarget('codex', all), 'codex');
  assert.equal(agentTarget('chat', all), 'chat');
  assert.equal(agentTarget('clipboard', all), 'clipboard');
  assert.equal(agentTarget('cursor', all), 'clipboard');
  assert.equal(agentTarget('cursor', cursor(CLAUDE)), 'cursor');
  assert.equal(agentTarget('claudeCode', vscode(CODEX)), 'clipboard');
});

test('Codex needs its add-file command: the selection is attached, not pasted', () => {
  assert.equal(agentTarget('codex', vscode(['chatgpt.openSidebar'])), 'clipboard');
});
