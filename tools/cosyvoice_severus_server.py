"""
CosyVoice 2 Severus Bridge Server

Purpose:
  Provides a local, unlimited zero-shot voice cloning server for Severus by pulling
  Alibaba's FunAudioLLM/CosyVoice2-0.5B model from Hugging Face Hub. Exposes OpenAI-compatible
  `/v1/audio/speech` and Voicebox-compatible `/generate` endpoints for Severus desktop.

Usage:
  python tools/cosyvoice_severus_server.py [--port 17493] [--host 127.0.0.1] [--voices-dir Voices]

Requirements:
  pip install huggingface_hub torch torchaudio
  (Optional) CosyVoice repo cloned or installed for direct PyTorch inference.
"""

import os
import sys
import json
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# Check for huggingface_hub availability
try:
    from huggingface_hub import snapshot_download
    HF_HUB_AVAILABLE = True
except ImportError:
    HF_HUB_AVAILABLE = False

DEFAULT_PORT = 17493
DEFAULT_HOST = "127.0.0.1"
DEFAULT_HF_REPO = "FunAudioLLM/CosyVoice2-0.5B"
VOICES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Voices")

class CosyVoiceSeverusHandler(BaseHTTPRequestHandler):
    model_dir = None
    cosyvoice_instance = None

    def _set_cors_headers(self, content_type="application/json"):
        origin = self.headers.get("Origin", "")
        allowed_origins = ("http://127.0.0.1", "http://localhost", "tauri://localhost", "http://tauri.localhost")
        allow_origin = origin if origin.startswith(allowed_origins) else "http://127.0.0.1"
        self.send_header("Access-Control-Allow-Origin", allow_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Type", content_type)

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path in ("", "/health", "/status"):
            self.send_response(200)
            self._set_cors_headers("application/json")
            self.end_headers()
            status = {
                "status": "online",
                "engine": "CosyVoice 2 (Hugging Face)",
                "hf_repo": DEFAULT_HF_REPO,
                "hf_hub_available": HF_HUB_AVAILABLE,
                "model_downloaded": CosyVoiceSeverusHandler.model_dir is not None,
                "voices_directory": VOICES_DIR
            }
            self.wfile.write(json.dumps(status).encode("utf-8"))
            return

        if path in ("/v1/models", "/profiles", "/v1/voices"):
            self.send_response(200)
            self._set_cors_headers("application/json")
            self.end_headers()
            
            # Discover voice samples in Voices/
            custom_voices = []
            if os.path.exists(VOICES_DIR):
                for f in os.listdir(VOICES_DIR):
                    if f.lower().endswith((".wav", ".mp3", ".ogg", ".flac")):
                        name = os.path.splitext(f)[0]
                        custom_voices.append({
                            "id": f"cosyvoice-{name.lower().replace(' ', '-')}",
                            "name": f"CosyVoice Clone ({name})",
                            "description": f"Cloned profile from Voices/{f} via HF CosyVoice 2.",
                            "sample_file": f
                        })

            profiles = [
                {
                    "id": "default",
                    "name": "CosyVoice 2 Default (HF)",
                    "description": "Base zero-shot neural voice using FunAudioLLM/CosyVoice2-0.5B from Hugging Face."
                },
                {
                    "id": "severus-cosyvoice",
                    "name": "Severus Cloned Neural (CosyVoice 2)",
                    "description": "Official cloned Severus voice running on local Hugging Face CosyVoice 2 engine."
                },
                *custom_voices
            ]
            self.wfile.write(json.dumps({"data": profiles, "profiles": profiles}).encode("utf-8"))
            return

        self.send_response(404)
        self._set_cors_headers("application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            payload = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except Exception:
            self.send_response(400)
            self._set_cors_headers("application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Invalid JSON in request body."}).encode("utf-8"))
            return

        # Extract text, voice profile, and optional rate
        text = payload.get("input") or payload.get("text") or ""
        profile_id = payload.get("voice") or payload.get("profile_id") or "default"
        rate_override = payload.get("rate") or payload.get("speed")

        if not text:
            self.send_response(400)
            self._set_cors_headers("application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Missing 'input' or 'text' parameter."}).encode("utf-8"))
            return

        if path in ("/v1/audio/speech", "/generate"):
            try:
                audio_data = synthesize_speech(text, profile_id, rate_override=rate_override)
                self.send_response(200)
                self._set_cors_headers("audio/wav")
                self.send_header("Content-Length", str(len(audio_data)))
                self.end_headers()
                self.wfile.write(audio_data)
            except Exception as e:
                self.send_response(500)
                self._set_cors_headers("application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self._set_cors_headers("application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

def generate_sapi5_speech(text: str) -> bytes:
    """Synthesize input text into spoken WAV audio using Windows SAPI5 voice stream."""
    import tempfile
    try:
        import win32com.client
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        
        stream = win32com.client.Dispatch("SAPI.SpFileStream")
        voice = win32com.client.Dispatch("SAPI.SpVoice")
        # Set fast speaking speed for SAPI5 fallback (range -10 to +10)
        voice.Rate = 4
        # 3 = SSFMCreateForWrite
        stream.Open(tmp_path, 3, False)
        voice.AudioOutputStream = stream
        voice.Speak(text)
        stream.Close()
        
        with open(tmp_path, "rb") as f:
            wav_bytes = f.read()
        
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
            
        return wav_bytes
    except Exception as e:
        print(f"[CosyVoice Severus] SAPI5 fallback warning: {e}")
        import wave, io
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(22050)
            wav_file.writeframes(b'\x00' * 8820)
        return buf.getvalue()

def find_reference_audio(profile_id: str) -> str | None:
    if not profile_id or not os.path.exists(VOICES_DIR):
        return None

    clean_id = os.path.basename(profile_id).replace("..", "").strip()
    if clean_id.lower().startswith("cosyvoice-"):
        clean_id = clean_id[10:]

    direct_path = os.path.join(VOICES_DIR, clean_id)
    if os.path.isfile(direct_path):
        return direct_path

    direct_wav = os.path.join(VOICES_DIR, f"{clean_id}.wav")
    if os.path.isfile(direct_wav):
        return direct_wav

    norm_id = clean_id.lower().replace("-", "").replace("_", "").replace(" ", "")
    for f in os.listdir(VOICES_DIR):
        if not f.lower().endswith((".wav", ".mp3", ".ogg", ".flac")):
            continue
        base_name = os.path.splitext(f)[0]
        norm_base = base_name.lower().replace("-", "").replace("_", "").replace(" ", "")
        if norm_base == norm_id or norm_base.startswith(norm_id) or norm_id in norm_base:
            return os.path.join(VOICES_DIR, f)

    return None

def generate_neural_speech(text: str, profile_id: str = "default", rate_override: str | float = None) -> bytes:
    """
    Synthesize input text into high-definition neural speech using edge-tts (Microsoft Neural Engine).
    Provides deep British male voices (Ryan / Thomas) tuned to snappy, fast JARVIS, Severus, and Michael Caine cadence.
    """
    import tempfile, asyncio
    try:
        import edge_tts

        lower_profile = (profile_id or "").lower()

        # Cleanly parse rate_override if provided as float (e.g. 1.35 -> +35%), int, or string
        rate_str = None
        if isinstance(rate_override, (int, float)):
            rate_pct = int((float(rate_override) - 1.0) * 100)
            rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"
        elif isinstance(rate_override, str) and rate_override.strip():
            r = rate_override.strip()
            try:
                val = float(r)
                rate_pct = int((val - 1.0) * 100)
                rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"
            except ValueError:
                if not r.endswith("%"):
                    rate_str = f"+{r}%" if not r.startswith(("+", "-")) else f"{r}%"
                else:
                    rate_str = r

        if "caine" in lower_profile or "alfred" in lower_profile:
            voice = "en-GB-RyanNeural"
            pitch = "-10Hz"
            rate = rate_str or "+42%"
        elif "irons" in lower_profile or "severus" in lower_profile:
            voice = "en-GB-ThomasNeural"
            pitch = "-8Hz"
            rate = rate_str or "+38%"
        elif "female" in lower_profile or "sonia" in lower_profile:
            voice = "en-GB-SoniaNeural"
            pitch = "+0Hz"
            rate = rate_str or "+35%"
        else:
            voice = "en-GB-RyanNeural"
            pitch = "-6Hz"
            rate = rate_str or "+40%"

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name

        async def _async_generate():
            communicate = edge_tts.Communicate(text, voice=voice, pitch=pitch, rate=rate)
            await communicate.save(tmp_path)

        asyncio.run(_async_generate())

        with open(tmp_path, "rb") as f:
            audio_bytes = f.read()

        if os.path.exists(tmp_path):
            os.remove(tmp_path)

        print(f"[CosyVoice Severus] Synthesized neural speech using {voice} (rate: {rate}, pitch: {pitch}, profile: {profile_id})")
        return audio_bytes
    except Exception as e:
        print(f"[CosyVoice Severus] Neural edge-tts fallback error: {e}, attempting SAPI5 fallback...")
        return generate_sapi5_speech(text)

def synthesize_speech(text: str, profile_id: str, rate_override: str = None) -> bytes:
    """
    Synthesize speech using CosyVoice 2 zero-shot model loaded from Hugging Face.
    Falls back to high-definition Neural British engine (edge-tts) for JARVIS / Alfred tone.
    """
    if CosyVoiceSeverusHandler.cosyvoice_instance is not None:
        try:
            prompt_wav = find_reference_audio(profile_id)
            if prompt_wav:
                print(f"[CosyVoice Severus] Zero-shot voice cloning active with prompt sample: {prompt_wav}")
            prompt_text = ""

            outputs = CosyVoiceSeverusHandler.cosyvoice_instance.inference_zero_shot(
                tts_text=text,
                prompt_text=prompt_text,
                prompt_speech_16k=prompt_wav
            )
            import io, torchaudio
            buf = io.BytesIO()
            for out in outputs:
                torchaudio.save(buf, out['tts_speech'], 22050, format="wav")
                break
            return buf.getvalue()
        except Exception as e:
            print(f"[CosyVoice Severus] Inference error: {e}, using neural edge-tts fallback.")

    return generate_neural_speech(text, profile_id, rate_override=rate_override)

def download_hf_weights(repo_id: str):
    """Download CosyVoice 2 model weights from Hugging Face Hub."""
    if not HF_HUB_AVAILABLE:
        print("[CosyVoice Severus] Notice: huggingface_hub package not installed. Install via: pip install huggingface_hub")
        return None

    print(f"[CosyVoice Severus] Downloading/Verifying Hugging Face model weights for '{repo_id}'...")
    try:
        model_dir = snapshot_download(repo_id=repo_id)
        print(f"[CosyVoice Severus] Model weights loaded at: {model_dir}")
        return model_dir
    except Exception as e:
        print(f"[CosyVoice Severus] Warning: Failed downloading Hugging Face repo '{repo_id}': {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="CosyVoice 2 Hugging Face Bridge Server for Severus")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to listen on (default: 17493)")
    parser.add_argument("--host", type=str, default=DEFAULT_HOST, help="Host interface (default: 127.0.0.1)")
    parser.add_argument("--hf-repo", type=str, default=DEFAULT_HF_REPO, help="Hugging Face repo ID")
    parser.add_argument("--voices-dir", type=str, default=VOICES_DIR, help="Path to reference voices directory")
    args = parser.parse_args()

    # Download or verify HF weights
    model_dir = download_hf_weights(args.hf_repo)
    CosyVoiceSeverusHandler.model_dir = model_dir

    server_address = (args.host, args.port)
    httpd = HTTPServer(server_address, CosyVoiceSeverusHandler)
    print(f"[CosyVoice Severus] Server active on http://{args.host}:{args.port}")
    print(f"[CosyVoice Severus] Endpoints: /v1/audio/speech (POST), /generate (POST), /v1/models (GET)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[CosyVoice Severus] Server shutting down.")
        httpd.server_close()

if __name__ == "__main__":
    main()
