//! Watches `second-brain/notes/` for changes and notifies the frontend with a
//! debounced `notes-changed` event so the graph and open editors stay live.

use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::{Event, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

const DEBOUNCE: Duration = Duration::from_millis(500);

pub fn start(app: AppHandle, notes_dir: PathBuf) {
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<()>();
        let mut watcher = match notify::recommended_watcher(
            move |res: Result<Event, notify::Error>| {
                if res.is_ok() {
                    let _ = tx.send(());
                }
            },
        ) {
            Ok(watcher) => watcher,
            Err(_) => return, // no native watcher available — the UI still refreshes on interaction
        };
        if watcher.watch(&notes_dir, RecursiveMode::NonRecursive).is_err() {
            return;
        }
        loop {
            if rx.recv().is_err() {
                return;
            }
            // keep draining until the stream has been quiet for DEBOUNCE
            let deadline = Instant::now() + DEBOUNCE;
            loop {
                match deadline.checked_duration_since(Instant::now()) {
                    Some(remaining) => {
                        if rx.recv_timeout(remaining).is_err() {
                            return;
                        }
                    }
                    None => break,
                }
            }
            let _ = app.emit("notes-changed", ());
        }
    });
}
