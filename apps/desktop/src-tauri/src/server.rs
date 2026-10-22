//! Lumière's server, as the desktop app runs it. The contract is
//! packages/app/src/server/contract.ts: arguments in; one JSON ready line on
//! stdout; logs on stderr; closing stdin stops it, unsaved notes written
//! first, within 5 seconds. Change both sides together.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime, Url, WebviewUrl};

/// How long the server may take to print its ready line.
const READY_TIMEOUT: Duration = Duration::from_secs(30);
/// The server stops itself within 5 seconds; after this it is killed.
const STOP_GRACE: Duration = Duration::from_secs(7);
/// The cookie the server reads its launch token from (auth.ts, `TOKEN_COOKIE`).
const TOKEN_COOKIE: &str = "lumiere_token";

/// The server's ready line (contract.ts, `ReadyLine`).
#[derive(Debug, Deserialize, PartialEq)]
pub struct Ready {
    pub lumiere: String,
    pub url: String,
    pub port: u16,
    pub pid: u32,
    pub version: String,
}

struct Server {
    child: Child,
    /// Dropping it closes the server's stdin, which tells it to stop.
    stdin: Option<ChildStdin>,
    /// `127.0.0.1:<port>`, as the server names itself.
    address: String,
    token: String,
}

struct Running(Mutex<Option<Server>>);

/// Start the server; the window's URL once it is ready.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewUrl, String> {
    let data = data_folder(app)?;
    let mut command = server_command(app)?;
    command
        .arg("--data")
        .arg(&data)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    let mut child = command
        .spawn()
        .map_err(|error| format!("could not run the server: {error}"))?;
    let ready = read_ready(&mut child).inspect_err(|_| {
        let _ = child.kill();
    })?;
    let url: Url = ready
        .url
        .parse()
        .map_err(|error| format!("the ready line's URL is not one: {error}"))?;
    let token = token_of(&url).ok_or("the ready line's URL has no token")?;
    let address = format!("{}:{}", url.host_str().unwrap_or("127.0.0.1"), ready.port);
    app.manage(Running(Mutex::new(Some(Server {
        stdin: child.stdin.take(),
        child,
        address,
        token,
    }))));
    Ok(WebviewUrl::External(url))
}

pub fn is_running<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<Running>()
        .is_some_and(|running| running.0.lock().is_ok_and(|server| server.is_some()))
}

/// Stop the server: close its stdin, wait for it to write notes and exit, else kill it.
pub fn stop<R: Runtime>(app: &AppHandle<R>) {
    let Some(running) = app.try_state::<Running>() else {
        return;
    };
    let Some(mut server) = running.0.lock().ok().and_then(|mut slot| slot.take()) else {
        return;
    };
    drop(server.stdin.take());
    let deadline = Instant::now() + STOP_GRACE;
    while Instant::now() < deadline {
        match server.child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => break,
        }
    }
    eprintln!("Lumière: the server did not stop in time; ending it");
    let _ = server.child.kill();
    let _ = server.child.wait();
}

/// Ask the server to show a note or folder (`POST /api/open`); the page then opens it.
pub fn show<R: Runtime>(app: &AppHandle<R>, path: &Path) -> Result<(), String> {
    let (address, token) = {
        let running = app
            .try_state::<Running>()
            .ok_or("the server is not running")?;
        let slot = running
            .0
            .lock()
            .map_err(|_| "the server's state is unusable")?;
        let server = slot.as_ref().ok_or("the server has stopped")?;
        (server.address.clone(), server.token.clone())
    };
    let body = serde_json::json!({ "path": path.to_string_lossy() }).to_string();
    let mut stream = TcpStream::connect(&address).map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|error| error.to_string())?;
    stream
        .write_all(open_request(&address, &token, &body).as_bytes())
        .map_err(|error| error.to_string())?;
    let mut status = String::new();
    BufReader::new(stream)
        .read_line(&mut status)
        .map_err(|error| error.to_string())?;
    if status.split_whitespace().nth(1) == Some("200") {
        Ok(())
    } else {
        Err(format!(
            "the server would not open {}: {}",
            path.display(),
            status.trim()
        ))
    }
}

/// Node running the server script: in development (scripts/dev.mjs) the
/// built script under the developer's Node; in the bundle, the Node beside
/// this executable (tauri.bundle.json, externalBin) and the script in the
/// resource folder (scripts/build-sidecar.mjs).
fn server_command<R: Runtime>(app: &AppHandle<R>) -> Result<Command, String> {
    #[cfg(debug_assertions)]
    {
        if let Ok(script) = std::env::var("LUMIERE_SERVER") {
            let node = std::env::var("LUMIERE_NODE").unwrap_or_else(|_| "node".into());
            let mut command = Command::new(node);
            command.arg(script);
            return Ok(command);
        }
    }
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let folder = exe.parent().ok_or("the app has no folder")?;
    let node = folder.join(format!("lumiere-node{}", std::env::consts::EXE_SUFFIX));
    let script = app
        .path()
        .resource_dir()
        .map_err(|error| format!("no resource folder: {error}"))?
        .join("app")
        .join("server.js");
    let mut command = Command::new(node);
    command.arg(script);
    Ok(command)
}

/// Where the server keeps settings and state: the app's data folder, or in
/// development a throwaway one (`LUMIERE_DATA`).
fn data_folder<R: Runtime>(app: &AppHandle<R>) -> Result<std::path::PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        if let Ok(folder) = std::env::var("LUMIERE_DATA") {
            return Ok(folder.into());
        }
    }
    app.path()
        .app_data_dir()
        .map_err(|error| format!("no app data folder: {error}"))
}

/// The first line on the server's stdout, within `READY_TIMEOUT`.
fn read_ready(child: &mut Child) -> Result<Ready, String> {
    let stdout = child.stdout.take().ok_or("the server has no stdout")?;
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut lines = BufReader::new(stdout).lines();
        let _ = sender.send(lines.next().and_then(Result::ok));
        // Nothing more should come; read it anyway, so the server never blocks writing.
        for _ in lines {}
    });
    match receiver.recv_timeout(READY_TIMEOUT) {
        Ok(Some(line)) => parse_ready(&line),
        Ok(None) => Err("the server stopped before it was ready; its log says why".into()),
        Err(_) => Err(format!(
            "the server was not ready within {} seconds",
            READY_TIMEOUT.as_secs()
        )),
    }
}

pub fn parse_ready(line: &str) -> Result<Ready, String> {
    let ready: Ready = serde_json::from_str(line)
        .map_err(|error| format!("expected the ready line, got {line:?} ({error})"))?;
    if ready.lumiere == "ready" {
        Ok(ready)
    } else {
        Err(format!("expected the ready line, got {line:?}"))
    }
}

fn token_of(url: &Url) -> Option<String> {
    url.query_pairs()
        .find(|(key, _)| key == "token")
        .map(|(_, value)| value.into_owned())
}

fn open_request(address: &str, token: &str, body: &str) -> String {
    format!(
        "POST /api/open HTTP/1.1\r\nHost: {address}\r\nCookie: {TOKEN_COOKIE}={token}\r\n\
         Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_ready_line_is_read_as_the_contract_says() {
        let ready = parse_ready(
            r#"{"lumiere":"ready","url":"http://127.0.0.1:5000/?token=abc","port":5000,"pid":42,"version":"0.1.5"}"#,
        )
        .unwrap();
        assert_eq!(ready.port, 5000);
        assert_eq!(
            token_of(&ready.url.parse().unwrap()).as_deref(),
            Some("abc")
        );
        assert!(parse_ready(r#"{"level":"warn","message":"hi"}"#).is_err());
        assert!(
            parse_ready(r#"{"lumiere":"stopped","url":"","port":0,"pid":0,"version":""}"#).is_err()
        );
        assert!(parse_ready("Listening on 5000").is_err());
    }

    #[test]
    fn an_open_request_carries_the_token_and_names_the_server() {
        let request = open_request("127.0.0.1:5000", "t0k", r#"{"path":"/n.md"}"#);
        assert!(request.starts_with("POST /api/open HTTP/1.1\r\n"));
        assert!(request.contains("\r\nHost: 127.0.0.1:5000\r\n"));
        assert!(request.contains("\r\nCookie: lumiere_token=t0k\r\n"));
        assert!(request.contains("\r\nContent-Length: 16\r\n"));
        assert!(request.ends_with("\r\n\r\n{\"path\":\"/n.md\"}"));
    }
}
