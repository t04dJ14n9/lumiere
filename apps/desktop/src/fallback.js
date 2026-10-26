// The reason Lumière's server did not start, from the window's URL (src-tauri/src/lib.rs).
document.getElementById("reason").textContent =
  new URLSearchParams(location.search).get("reason") ?? "";
