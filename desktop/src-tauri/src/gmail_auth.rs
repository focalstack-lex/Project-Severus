//! Gmail school-mail auth: the loopback capture for Google's OAuth consent
//! redirect, and Windows Credential Manager storage for tokens.
//!
//! The renderer performs every HTTPS call (token exchange, refresh, API) via
//! fetch — this module only listens on 127.0.0.1 for the one redirect Google
//! makes, and keeps the refresh token + client secret out of localStorage.

use keyring::Entry;

const SERVICE: &str = "Severus";
const LISTEN_DEADLINE_SECS: u64 = 300;

// ---------------------------------------------------------------------------
// Secure storage — Windows Credential Manager
// ---------------------------------------------------------------------------

fn entry(key: &str) -> Result<Entry, String> {
    if key.trim().is_empty() {
        return Err("credential key is empty".into());
    }
    Entry::new(SERVICE, key).map_err(|e| format!("cannot open credential store: {e}"))
}

#[tauri::command]
pub fn secure_store(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| format!("cannot store credential: {e}"))
}

#[tauri::command]
pub fn secure_load(key: String) -> Result<String, String> {
    entry(&key)?.get_password().map_err(|_| format!("credential '{key}' not found"))
}

#[tauri::command]
pub fn secure_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("cannot delete credential: {e}")),
    }
}

// ---------------------------------------------------------------------------
// OAuth consent capture — one-shot loopback listener
// ---------------------------------------------------------------------------

/// Build the Google consent URL. Pure + tested. Scopes: Gmail read-only plus
/// Classroom read-only. Coursework/submission listing REQUIRES the
/// coursework.* scope family — courses.readonly alone is rejected with 403
/// PERMISSION_DENIED on courseWork.list, and the student-submissions.students
/// variant is teacher-facing and not accepted for these endpoints.
pub fn build_consent_url(client_id: &str, port: u16, state: &str) -> String {
    let scopes = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/classroom.courses.readonly",
        "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
        "https://www.googleapis.com/auth/classroom.announcements.readonly",
    ]
    .join(" ");
    // Encode the % first, then the rest — order matters.
    let encoded_scopes = scopes
        .replace('%', "%25")
        .replace(':', "%3A")
        .replace('/', "%2F")
        .replace(' ', "%20");
    format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={client_id}&redirect_uri=http%3A%2F%2F127.0.0.1%3A{port}&response_type=code&scope={encoded_scopes}&access_type=offline&prompt=consent&state={state}"
    )
}

/// Percent-decode a URL-escaped value (Google sends the code as `4%2F0A…`).
/// Pure + tested. `+` is left as `+` — codes do not use form encoding.
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = &value[index + 1..index + 3];
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Extract the OAuth `code` (or `error`) from a redirect request's first line.
/// Pure + tested; returns Ok(None) when the line is not the OAuth path.
pub fn extract_code_from_request(request_line: &str) -> Result<Option<String>, String> {
    // "GET /?state=abc&code=4%2F0Axyz&scope=... HTTP/1.1"
    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "malformed request line".to_string())?;
    if !path.starts_with("/?") {
        return Ok(None); // favicon or other noise
    }
    for pair in path[2..].split('&') {
        if let Some(value) = pair.strip_prefix("code=") {
            let cleaned = value.split('&').next().unwrap_or(value);
            return Ok(Some(percent_decode(cleaned)));
        }
        if let Some(error) = pair.strip_prefix("error=") {
            return Err(format!(
                "consent was denied: {}",
                percent_decode(error.split('&').next().unwrap_or(error))
            ));
        }
    }
    Ok(None)
}

const REDIRECT_ACK: &str = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<!doctype html><html><head><meta charset=\"utf-8\"><title>Severus</title></head><body style=\"background:#050505;color:#f2f2f0;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0\"><p>Authorized. You can close this window and return to Severus, Sir.</p></body></html>";

/// Start the consent flow: spawn a one-shot listener on 127.0.0.1:`port` that
/// captures the authorization code, and hand back the URL the renderer should
/// open in the default browser. The listener self-terminates on success,
/// denial, or the 5-minute deadline.
#[tauri::command]
pub fn gmail_begin_auth(app: tauri::AppHandle, client_id: String, port: u16, state: String) -> Result<String, String> {
    let url = build_consent_url(client_id.trim(), port, state.trim());
    std::thread::spawn(move || {
        let listener = match std::net::TcpListener::bind(("127.0.0.1", port)) {
            Ok(l) => l,
            Err(e) => {
                let _ = app.emit("gmail-auth-failed", format!("port {port} unavailable: {e}"));
                return;
            }
        };
        listener.set_nonblocking(true).ok();

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(LISTEN_DEADLINE_SECS);
        let mut code: Option<String> = None;

        while std::time::Instant::now() < deadline && code.is_none() {
            let (mut stream, _) = match listener.accept() {
                Ok(pair) => pair,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(120));
                    continue;
                }
                Err(_) => {
                    std::thread::sleep(std::time::Duration::from_millis(120));
                    continue;
                }
            };
            stream.set_nonblocking(false).ok();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(10)))
                .ok();
            // Bounded read: the browser sends the GET and HOLDS the connection
            // open — read_to_string would hang until the timeout and lose the
            // request. Stop at the end of the headers instead.
            let mut buffer: Vec<u8> = Vec::new();
            let mut chunk = [0u8; 2048];
            use std::io::Read;
            loop {
                match stream.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => {
                        buffer.extend_from_slice(&chunk[..n]);
                        if buffer.windows(4).any(|window| window == b"\r\n\r\n") || buffer.len() > 16384 {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            let request_head = String::from_utf8_lossy(&buffer);
            let request_line = request_head.lines().next().unwrap_or("");
            match extract_code_from_request(request_line) {
                Ok(Some(found)) => {
                    let _ = stream.write_all(REDIRECT_ACK.as_bytes());
                    code = Some(found);
                }
                Ok(None) => {
                    let _ = stream.write_all(REDIRECT_ACK.as_bytes());
                }
                Err(denial) => {
                    let _ = stream.write_all(REDIRECT_ACK.as_bytes());
                    let _ = app.emit("gmail-auth-failed", denial);
                    return;
                }
            }
        }

        match code {
            Some(found) => {
                let _ = app.emit("gmail-auth-code", found);
            }
            None => {
                let _ = app.emit("gmail-auth-failed", "no authorization code arrived within 5 minutes".to_string());
            }
        }
    });

    Ok(url)
}

use std::io::Write as _;
use tauri::Emitter as _;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_consent_url_with_encoded_redirect() {
        let url = build_consent_url("123-apps.googleusercontent.com", 47153, "st4te");
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?client_id=123-apps.googleusercontent.com"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A47153"));
        assert!(url.contains("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fclassroom.courses.readonly"));
        assert!(url.contains("classroom.coursework.me.readonly"));
        assert!(url.contains("classroom.announcements.readonly"));
        assert!(url.contains("access_type=offline"));
        assert!(url.contains("prompt=consent"));
        assert!(url.contains("state=st4te"));
    }

    #[test]
    fn extracts_code_from_redirect_line() {
        let line = "GET /?state=st4te&code=4%2F0AxxxSampleCode&scope=https://mail.example HTTP/1.1";
        assert_eq!(
            extract_code_from_request(line).unwrap(),
            Some("4/0AxxxSampleCode".to_string())
        );
    }

    #[test]
    fn extracts_code_when_code_is_first_param() {
        let line = "GET /?code=abc123&scope=email HTTP/1.1";
        assert_eq!(extract_code_from_request(line).unwrap(), Some("abc123".to_string()));
    }

    #[test]
    fn reports_consent_denial() {
        let line = "GET /?state=st4te&error=access_denied HTTP/1.1";
        let err = extract_code_from_request(line).unwrap_err();
        assert!(err.contains("access_denied"));
    }

    #[test]
    fn ignores_non_oauth_requests() {
        assert_eq!(extract_code_from_request("GET /favicon.ico HTTP/1.1").unwrap(), None);
    }

    #[test]
    fn secure_store_roundtrip() {
        let key = format!("test-gmail-{}", std::process::id());
        secure_store(key.clone(), "secret-value".into()).unwrap();
        assert_eq!(secure_load(key.clone()).unwrap(), "secret-value");
        secure_delete(key.clone()).unwrap();
        assert!(secure_load(key.clone()).is_err());
    }
}
