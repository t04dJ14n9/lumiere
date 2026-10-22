//! The app menu: the platform's standard menus, with "Open Folder…" in File.
//! A command the page handles is sent to it as a `lumiere://menu` event whose
//! payload is the command's id (packages/app/src/shell/tauri.ts, `MenuCommand`).

use tauri::menu::{Menu, MenuEvent, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

use crate::MAIN_WINDOW;

/// The event the page listens to (tauri.ts, `MENU_EVENT`).
pub const MENU_EVENT: &str = "lumiere://menu";

/// Commands the page handles, by menu item id (tauri.ts, `MenuCommand`).
const PAGE_COMMANDS: &[&str] = &["open-vault"];

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let open_vault =
        MenuItem::with_id(app, "open-vault", "Open Folder…", true, Some("CmdOrCtrl+O"))?;
    match file_menu(&menu)? {
        Some(file) => {
            file.prepend(&PredefinedMenuItem::separator(app)?)?;
            file.prepend(&open_vault)?;
        }
        None => {
            let file = Submenu::with_items(app, "File", true, &[&open_vault])?;
            menu.insert(&file, 1)?;
        }
    }
    Ok(menu)
}

pub fn handle<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    if PAGE_COMMANDS.contains(&id) {
        if let Err(error) = app.emit_to(MAIN_WINDOW, MENU_EVENT, id) {
            eprintln!("Lumière: could not send the menu command {id}: {error}");
        }
    }
}

/// The standard menu's File submenu, where there is one.
fn file_menu<R: Runtime>(menu: &Menu<R>) -> tauri::Result<Option<Submenu<R>>> {
    for item in menu.items()? {
        if let MenuItemKind::Submenu(submenu) = item {
            if submenu.text()? == "File" {
                return Ok(Some(submenu));
            }
        }
    }
    Ok(None)
}
