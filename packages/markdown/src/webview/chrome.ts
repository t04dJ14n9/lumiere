/**
 * Stable webview entry whose only job is to pull the Properties chrome graph
 * into the module graph under a fixed URL (`webview/chrome.js`).
 *
 * `webviewHTML` modulepreloads this while `editor.js` downloads and parses, so
 * Properties / Sources chunks are often already in cache when bootstrap calls
 * `preloadChromeFeatures()`. Side-effect-free: plugins are not started here.
 */
import "../plugins/properties/webview";
import "../plugins/sourcesProperty/webview";
import "../plugins/tags/webview";
import "../plugins/lineNumbers/webview";
