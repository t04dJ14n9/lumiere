//! Notes and folders opened from outside the app: Finder's "Open With", a
//! file dropped on the Dock icon, `lumiere notes/today.md` from a terminal,
//! a second launch with paths. Each goes to the server (`server::show`),
//! which tells the page; the page opens it. Paths that arrive before the
//! server is ready wait in `Pending`.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};

use crate::{server, MAIN_WINDOW};

#[derive(Default)]
pub struct Pending(Mutex<Vec<PathBuf>>);

/// This launch's own arguments (a terminal, or a file association on Windows and Linux).
pub fn from_launch<R: Runtime>(app: &AppHandle<R>) {
    let cwd = std::env::current_dir().unwrap_or_default();
    let args: Vec<String> = std::env::args().collect();
    show_all(app, paths_from_args(&args, &cwd));
}

pub fn from_second_launch<R: Runtime>(app: &AppHandle<R>, args: &[String], cwd: &str) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    show_all(app, paths_from_args(args, Path::new(cwd)));
}

#[cfg(target_os = "macos")]
pub fn from_finder<R: Runtime>(app: &AppHandle<R>, urls: &[tauri::Url]) {
    let paths = urls
        .iter()
        .filter_map(|url| url.to_file_path().ok())
        .collect();
    show_all(app, paths);
}

/// Show what arrived before the server was ready.
pub fn flush<R: Runtime>(app: &AppHandle<R>) {
    let waiting = app
        .try_state::<Pending>()
        .and_then(|pending| {
            pending
                .0
                .lock()
                .ok()
                .map(|mut list| std::mem::take(&mut *list))
        })
        .unwrap_or_default();
    show_all(app, waiting);
}

fn show_all<R: Runtime>(app: &AppHandle<R>, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    if !server::is_running(app) {
        if let Some(pending) = app.try_state::<Pending>() {
            if let Ok(mut list) = pending.0.lock() {
                list.extend(paths);
            }
        }
        return;
    }
    let app = app.clone();
    // Off the main thread: each is a request to the server.
    std::thread::spawn(move || {
        for path in paths {
            if let Err(error) = server::show(&app, &path) {
                eprintln!("Lumière: {error}");
            }
        }
    });
}

/// The paths among a launch's arguments, made absolute; flags and the program are not paths.
pub fn paths_from_args(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    args.iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .map(|arg| {
            let path = Path::new(arg);
            if path.is_absolute() {
                path.to_path_buf()
            } else {
                cwd.join(path)
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::paths_from_args;
    use std::path::{Path, PathBuf};

    #[test]
    fn launch_arguments_become_absolute_paths() {
        let args: Vec<String> = ["lumiere", "--flag", "notes/today.md", "/abs/vault"]
            .iter()
            .map(|arg| arg.to_string())
            .collect();
        assert_eq!(
            paths_from_args(&args, Path::new("/home/me")),
            vec![
                PathBuf::from("/home/me/notes/today.md"),
                PathBuf::from("/abs/vault")
            ]
        );
        assert!(paths_from_args(&args[..1], Path::new("/")).is_empty());
    }
}
