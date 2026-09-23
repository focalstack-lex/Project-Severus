"""
Whisper STT Severus Bridge Server

Purpose:
  Provides fully offline speech recognition for the Severus desktop app. The Tauri
  window renders in WebView2, which exposes the Web Speech API constructor but has
  no speech service behind it, so every recognition attempt fails with a `network`
  error and the runtime also ships no on-device model to fall back to (measured in
  the live app on 2026-09-23). This server replaces that dead engine with a local
  Whisper model: no service, no cloud, no API key.

Endpoints:
  GET  /health      Engine status, model name, whether weights are loaded
  POST /transcribe  Body: raw 16-bit mono PCM (16 kHz) or a WAV file
                    Headers: X-Severus-Sample-Rate (optional, default 16000)
                    Returns: {"text": "...", "rejected": false, ...}

Usage:
  python tools/whisper_severus_server.py [--port 17494] [--host 127.0.0.1] [--model tiny.en]

Requirements:
  pip install faster-whisper
  The model is downloaded from Hugging Face on first run (~75 MB for tiny.en),
  then cached locally so later runs are fully offline.
"""

import argparse
import io
import json
import os
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

try:
    import numpy as np
except ImportError:
    print("[WhisperSTT] FATAL: numpy is required. Install it via: pip install numpy")
    sys.exit(1)

try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    WhisperModel = None
    FASTER_WHISPER_AVAILABLE = False

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 17494
DEFAULT_MODEL = os.environ.get("SEVERUS_STT_MODEL", "tiny.en")
TARGET_SAMPLE_RATE = 16000
COMPUTE_TYPE = os.environ.get("SEVERUS_STT_COMPUTE_TYPE", "int8")
MAX_BODY_BYTES = 12 * 1024 * 1024
MIN_TEXT_CHARS = 2
MIN_AVG_LOGPROB = -1.2

# Whisper emits these on silence, noise or music. They must never reach the
# command grammar, which would otherwise act on them.
HALLUCINATION_BLACKLIST = {
    "thank you",
    "thanks for watching",
    "thank you for watching",
    "please subscribe",
    "subscribe",
    "you",
    "bye",
    "okay",
    "oh",
    "yeah",
    "hmm",
    "uh",
    "um",
    "the end",
    "so",
    "and",
    "i",
    "a",
}


class WhisperSeverusHandler(BaseHTTPRequestHandler):
    model = None
    model_name = DEFAULT_MODEL
    device = "cpu"
    model_ready = False
    load_error = None
    # ctranslate2 serialises inference cleanly, and keeping one transcription in
    # flight avoids CPU thrash when several segments arrive at once.
    infer_lock = threading.Lock()

    def log_message(self, fmt, *args):
        sys.stderr.write("[WhisperSTT] %s - %s\n" % (self.address_string(), fmt % args))

    def _set_cors_headers(self, content_type="application/json"):
        origin = self.headers.get("Origin", "")
        allowed_prefixes = ("http://127.0.0.1", "http://localhost", "tauri://localhost", "http://tauri.localhost")
        allow_origin = origin if origin.startswith(allowed_prefixes) else "http://127.0.0.1"
        self.send_header("Access-Control-Allow-Origin", allow_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Severus-Sample-Rate")
        self.send_header("Content-Type", content_type)

    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self._set_cors_headers()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/")

        if path in ("", "/health", "/status"):
            self._send_json(200, {
                "status": "online",
                "engine": "faster-whisper (local, offline)",
                "backend_available": FASTER_WHISPER_AVAILABLE,
                "model": WhisperSeverusHandler.model_name,
                "device": WhisperSeverusHandler.device,
                "compute_type": COMPUTE_TYPE,
                "model_ready": WhisperSeverusHandler.model_ready,
                "load_error": WhisperSeverusHandler.load_error,
                "sample_rate": TARGET_SAMPLE_RATE,
            })
            return

        self._send_json(404, {"error": "unknown path", "path": path})

    def _decode_body(self, raw, declared_rate):
        """Turn raw PCM or a WAV container into mono float32 at the target rate."""
        if raw[:4] == b"RIFF":
            with wave.open(io.BytesIO(raw), "rb") as wav:
                channels = wav.getnchannels()
                width = wav.getsampwidth()
                rate = wav.getframerate()
                frames = wav.readframes(wav.getnframes())
            if width != 2:
                raise ValueError(f"unsupported WAV sample width: {width * 8} bit")
            audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
            if channels > 1:
                audio = audio.reshape(-1, channels).mean(axis=1)
            return resample_linear(audio, rate, TARGET_SAMPLE_RATE)

        if len(raw) % 2 != 0:
            raw = raw[:-1]
        audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        return resample_linear(audio, declared_rate, TARGET_SAMPLE_RATE)

    def _load_model(self):
        return load_model()

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/")

        if path not in ("/transcribe", "/v1/audio/transcriptions", "/stt"):
            self._send_json(404, {"error": "unknown path", "path": path})
            return

        if not FASTER_WHISPER_AVAILABLE:
            self._send_json(503, {
                "error": "faster-whisper is not installed",
                "hint": "pip install faster-whisper",
            })
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._send_json(400, {"error": "invalid Content-Length"})
            return

        if length <= 0:
            self._send_json(400, {"error": "empty request body"})
            return

        if length > MAX_BODY_BYTES:
            self._send_json(413, {"error": f"body too large ({length} bytes), limit is {MAX_BODY_BYTES}"})
            return

        raw = self.rfile.read(length)

        try:
            declared_rate = int(self.headers.get("X-Severus-Sample-Rate") or TARGET_SAMPLE_RATE)
        except ValueError:
            declared_rate = TARGET_SAMPLE_RATE
        if declared_rate <= 0:
            declared_rate = TARGET_SAMPLE_RATE

        try:
            audio = self._decode_body(raw, declared_rate)
        except Exception as err:
            self._send_json(400, {"error": f"could not decode audio payload: {err}"})
            return

        duration = float(len(audio)) / TARGET_SAMPLE_RATE
        if duration < 0.2:
            self._send_json(200, {"text": "", "rejected": True, "reason": "too-short", "duration": round(duration, 3)})
            return

        if not self._load_model():
            self._send_json(503, {
                "error": "model unavailable",
                "detail": WhisperSeverusHandler.load_error,
                "hint": "The first run downloads the weights from Hugging Face and needs internet access.",
            })
            return

        started = time.time()
        try:
            with WhisperSeverusHandler.infer_lock:
                segments, info = WhisperSeverusHandler.model.transcribe(
                    audio,
                    language="en",
                    beam_size=1,
                    best_of=1,
                    temperature=0.0,
                    condition_on_previous_text=False,
                    vad_filter=False,
                    word_timestamps=False,
                )
                segment_list = list(segments)
        except Exception as err:
            print(f"[WhisperSTT] ERROR: transcription failed: {err}")
            self._send_json(500, {"error": f"transcription failed: {err}"})
            return

        elapsed = time.time() - started
        text = " ".join(seg.text.strip() for seg in segment_list).strip()
        avg_logprob = min((seg.avg_logprob for seg in segment_list), default=0.0)
        rejected, reason = is_junk_transcript(text, avg_logprob)

        if rejected:
            print(f"[WhisperSTT] Rejected transcript ({reason}): {text!r}")

        self._send_json(200, {
            "text": "" if rejected else text,
            "raw_text": text,
            "rejected": rejected,
            "reason": reason,
            "duration": round(duration, 3),
            "elapsed": round(elapsed, 3),
            "avg_logprob": round(avg_logprob, 3),
            "language": getattr(info, "language", "en"),
        })


def resample_linear(audio, src_rate, dst_rate):
    """Linear resample. The browser captures at 16 kHz already, so this is a guard."""
    if src_rate == dst_rate or len(audio) == 0:
        return audio.astype(np.float32, copy=False)
    target_len = int(round(len(audio) * dst_rate / float(src_rate)))
    if target_len <= 1:
        return np.zeros(1, dtype=np.float32)
    source_index = np.linspace(0, len(audio) - 1, target_len)
    return np.interp(source_index, np.arange(len(audio)), audio).astype(np.float32)


def load_model():
    """Load the Whisper weights once, guarded so concurrent requests cannot race."""
    if WhisperSeverusHandler.model_ready:
        return True

    with WhisperSeverusHandler.infer_lock:
        if WhisperSeverusHandler.model_ready:
            return True
        try:
            print(
                f"[WhisperSTT] Loading model '{WhisperSeverusHandler.model_name}' "
                f"({COMPUTE_TYPE}) on {WhisperSeverusHandler.device}..."
            )
            started = time.time()
            WhisperSeverusHandler.model = WhisperModel(
                WhisperSeverusHandler.model_name,
                device=WhisperSeverusHandler.device,
                compute_type=COMPUTE_TYPE,
            )
            WhisperSeverusHandler.model_ready = True
            WhisperSeverusHandler.load_error = None
            print(f"[WhisperSTT] Model ready in {time.time() - started:.1f}s. Offline recognition is live.")
            return True
        except Exception as err:
            WhisperSeverusHandler.load_error = str(err)
            print(f"[WhisperSTT] ERROR: could not load model '{WhisperSeverusHandler.model_name}': {err}")
            return False


def is_junk_transcript(text, avg_logprob, min_chars=MIN_TEXT_CHARS, min_logprob=MIN_AVG_LOGPROB):
    """
    Reject the two failure modes of always-on Whisper: confident silence
    hallucinations and low-confidence noise transcriptions.
    """
    stripped = (text or "").strip()
    if len(stripped) < min_chars:
        return True, "too-few-characters"

    letters = "".join(ch for ch in stripped.lower() if ch.isalnum() or ch == " ").strip()
    if not letters:
        return True, "punctuation-only"

    if letters in HALLUCINATION_BLACKLIST:
        return True, "known-hallucination"

    if avg_logprob < min_logprob:
        return True, "low-confidence"

    return False, None


def warmup(model_name):
    """Load the weights at startup so the first spoken command is not delayed."""
    WhisperSeverusHandler.model_name = model_name
    WhisperSeverusHandler._load_model(None)


def main():
    parser = argparse.ArgumentParser(description="Local Whisper STT bridge server for Severus")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to listen on (default: 17494)")
    parser.add_argument("--host", type=str, default=DEFAULT_HOST, help="Host interface (default: 127.0.0.1)")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Whisper model size (default: tiny.en)")
    parser.add_argument("--device", type=str, default="cpu", help="Inference device (default: cpu)")
    parser.add_argument("--no-warmup", action="store_true", help="Skip loading the model at startup")
    args = parser.parse_args()

    if not FASTER_WHISPER_AVAILABLE:
        print("[WhisperSTT] FATAL: faster-whisper is not installed. Run: pip install faster-whisper")
        sys.exit(1)

    WhisperSeverusHandler.model_name = args.model
    WhisperSeverusHandler.device = args.device

    if not args.no_warmup:
        threading.Thread(target=warmup, args=(args.model,), daemon=True).start()

    server_address = (args.host, args.port)
    httpd = ThreadingHTTPServer(server_address, WhisperSeverusHandler)
    print(f"[WhisperSTT] Severus offline recognition listening on http://{args.host}:{args.port}")
    print(f"[WhisperSTT] Model: {args.model} ({COMPUTE_TYPE}, {args.device})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("[WhisperSTT] Shutting down.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
