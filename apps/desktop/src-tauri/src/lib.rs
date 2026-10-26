//! Lumière's desktop app: a native window around Lumière's own server.
//!
//! The app does three things and nothing more (docs/HOSTS_PLAN.md, M4):
//! 1. start the server (`server.rs`, the contract in
//!    packages/app/src/server/contract.ts) and open its page in a window;
//! 2. give that page what a browser cannot: a folder picker, a menu, files
//!    opened from Finder or Explorer (`menu.rs`, `opening.rs`);
//! 3. stop the server when the app quits, so unsaved notes are written.
//!
//! Everything else (vaults, files, editing, settings) belongs to the server
//! and its page. When a feature seems to need Rust, put it in the server
//! first; the page is the same in a browser and in this window.

mod menu;
mod opening;
mod server;

use tauri::{RunEvent, WebviewUrl, WebviewWindowBuilder};

/// The one window's label; capabilities/shell.json grants it the shell's calls.
pub const MAIN_WINDOW: &str = "main";

pub fn run() {
    let app = tauri::Builder::default()
        // A second launch (a note opened from Finder while running) comes here.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            opening::from_second_launch(app, &args, &cwd);
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(opening::Pending::default())
        .menu(menu::build)
        .on_menu_event(menu::handle)
        .setup(|app| {
            opening::from_launch(app.handle());
            open_window(app.handle());
            opening::flush(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Lumière could not build its app");

    app.run(|handle, event| match event {
        // macOS: notes opened from Finder, at launch or later.
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => opening::from_finder(handle, &urls),
        RunEvent::Exit => server::stop(handle),
        _ => {}
    });
}

/// The server's page in the main window, or a page saying why it did not start.
fn open_window(app: &tauri::AppHandle) {
    let url = match server::start(app) {
        Ok(url) => url,
        Err(reason) => {
            eprintln!("Lumière: the server did not start: {reason}");
            let page = format!("index.html?reason={}", percent_encode(&reason));
            WebviewUrl::App(page.into())
        }
    };
    let built = WebviewWindowBuilder::new(app, MAIN_WINDOW, url)
        .title("Lumière")
        .inner_size(1200.0, 800.0)
        .min_inner_size(640.0, 400.0)
        .build();
    if let Err(error) = built {
        eprintln!("Lumière: could not open its window: {error}");
        app.exit(1);
    }
}

fn percent_encode(text: &str) -> String {
    text.bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::percent_encode;

    #[test]
    fn reasons_survive_the_query_string() {
        assert_eq!(percent_encode("a b&c=é"), "a%20b%26c%3D%C3%A9");
    }
}
