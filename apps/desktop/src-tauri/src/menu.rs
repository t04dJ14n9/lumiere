//! The app menu: the platform's standard menus, with Lumière's commands in
//! them, under VS Code's keys:
//! - Settings… (⌘,) in the app menu on macOS, in File elsewhere;
//! - Open Folder… (⌘O), Close Tab (⌘W) and Close Window (⇧⌘W) in File;
//! - Toggle Sidebar (⌘B), Toggle Outline (⌥⌘B) and Color Theme in View;
//! - Show Next Tab (⇧⌘]), Show Previous Tab (⇧⌘[) and Switch to Last Tab
//!   (⌃⇥) in Window.
//!
//! A command the page handles is sent to it as a `lumiere://menu` event whose
//! payload is the command's id (packages/app/src/shell/tauri.ts,
//! `MENU_COMMANDS`; keep the two lists the same). A key the editor page uses
//! itself, such as ⌘B for Bold while typing, reaches the page first.

use tauri::menu::{Menu, MenuEvent, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::MAIN_WINDOW;

/// The event the page listens to (tauri.ts, `MENU_EVENT`).
pub const MENU_EVENT: &str = "lumiere://menu";

/// Commands the page handles, by menu item id (tauri.ts, `MENU_COMMANDS`).
const PAGE_COMMANDS: &[&str] = &[
    "open-vault",
    "open-settings",
    "close-tab",
    "next-tab",
    "previous-tab",
    "last-tab",
    "toggle-sidebar",
    "toggle-outline",
    "theme-system",
    "theme-light",
    "theme-dark",
];

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    add_file_items(app, &menu)?;
    add_settings(app, &menu)?;
    add_view_items(app, &menu)?;
    add_tab_items(app, &menu)?;
    Ok(menu)
}

pub fn handle<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    if id == "close-window" {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
            let _ = window.close();
        }
        return;
    }
    if PAGE_COMMANDS.contains(&id) {
        if let Err(error) = app.emit_to(MAIN_WINDOW, MENU_EVENT, id) {
            eprintln!("Lumière: could not send the menu command {id}: {error}");
        }
    }
}

/// ⌘W is the page's Close Tab, which closes the shown tab while there are
/// others and the window otherwise; Close Window moves to ⇧⌘W, as in VS
/// Code. The platform's own Close Window would take ⌘W first, so it goes.
fn add_file_items<R: Runtime>(app: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    let file = submenu(app, menu, "File", 1)?;
    for kind in file.items()? {
        if let MenuItemKind::Predefined(predefined) = &kind {
            if predefined.text()? == "Close Window" {
                file.remove(predefined)?;
            }
        }
    }
    file.prepend(&PredefinedMenuItem::separator(app)?)?;
    file.prepend(&item(app, "open-vault", "Open Folder…", "CmdOrCtrl+O")?)?;
    file.append(&item(app, "close-tab", "Close Tab", "CmdOrCtrl+W")?)?;
    file.append(&item(
        app,
        "close-window",
        "Close Window",
        "Shift+CmdOrCtrl+W",
    )?)?;
    Ok(())
}

/// macOS keeps Settings in the app menu, after About; elsewhere it ends File.
fn add_settings<R: Runtime>(app: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    let settings = item(app, "open-settings", "Settings…", "CmdOrCtrl+,")?;
    if cfg!(target_os = "macos") {
        if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
            app_menu.insert(&PredefinedMenuItem::separator(app)?, 1)?;
            app_menu.insert(&settings, 2)?;
            return Ok(());
        }
    }
    let file = submenu(app, menu, "File", 1)?;
    file.append(&PredefinedMenuItem::separator(app)?)?;
    file.append(&settings)?;
    Ok(())
}

fn add_view_items<R: Runtime>(app: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    let theme = Submenu::with_items(
        app,
        "Color Theme",
        true,
        &[
            &MenuItem::with_id(app, "theme-system", "Follow System", true, None::<&str>)?,
            &MenuItem::with_id(app, "theme-light", "Light", true, None::<&str>)?,
            &MenuItem::with_id(app, "theme-dark", "Dark", true, None::<&str>)?,
        ],
    )?;
    let view = submenu(app, menu, "View", 3)?;
    view.prepend(&PredefinedMenuItem::separator(app)?)?;
    view.prepend(&theme)?;
    view.prepend(&PredefinedMenuItem::separator(app)?)?;
    view.prepend(&item(
        app,
        "toggle-outline",
        "Toggle Outline",
        "Alt+CmdOrCtrl+B",
    )?)?;
    view.prepend(&item(
        app,
        "toggle-sidebar",
        "Toggle Sidebar",
        "CmdOrCtrl+B",
    )?)?;
    Ok(())
}

/// The window's own ⌥⌘→ and ⌥⌘← work too, in the window around the note.
fn add_tab_items<R: Runtime>(app: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    let window = submenu(app, menu, "Window", 4)?;
    window.append(&PredefinedMenuItem::separator(app)?)?;
    window.append(&item(
        app,
        "next-tab",
        "Show Next Tab",
        "CmdOrCtrl+Shift+]",
    )?)?;
    window.append(&item(
        app,
        "previous-tab",
        "Show Previous Tab",
        "CmdOrCtrl+Shift+[",
    )?)?;
    window.append(&item(app, "last-tab", "Switch to Last Tab", "Ctrl+Tab")?)?;
    Ok(())
}

fn item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    text: &str,
    accelerator: &str,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, text, true, Some(accelerator))
}

/// The standard menu's submenu called `text`, or a new one inserted at `position`.
fn submenu<R: Runtime>(
    app: &AppHandle<R>,
    menu: &Menu<R>,
    text: &str,
    position: usize,
) -> tauri::Result<Submenu<R>> {
    for kind in menu.items()? {
        if let MenuItemKind::Submenu(existing) = kind {
            if existing.text()? == text {
                return Ok(existing);
            }
        }
    }
    let created = Submenu::new(app, text, true)?;
    menu.insert(&created, position)?;
    Ok(created)
}

#[cfg(test)]
mod tests {
    use super::PAGE_COMMANDS;

    /// The page's list (tauri.ts, `MENU_COMMANDS`), so the two cannot drift apart unseen.
    #[test]
    fn the_page_knows_every_menu_command() {
        let page = include_str!("../../../../packages/app/src/shell/tauri.ts");
        for command in PAGE_COMMANDS {
            assert!(
                page.contains(&format!("\"{command}\"")),
                "tauri.ts does not list {command}"
            );
        }
    }
}
