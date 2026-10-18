/**
 * Whether the extension takes Copy Link for Agent here (the desktop's agent
 * bridge), as written into the page. Without it (in a browser) the viewer
 * shows no selection menu, whose only action is that. A page without the
 * attribute keeps the menu, as before it existed.
 */
export function hasAgentLinks(): boolean {
  return document.getElementById("root")?.dataset.agentLinks !== "false";
}
