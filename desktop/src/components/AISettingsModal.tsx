import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type AIConfig, testAIConnection } from "../lib/ai";
import {
  loadElevenLabsConfig,
  saveElevenLabsConfig,
  testElevenLabsVoice,
  fetchElevenLabsVoices,
  FREE_PREMADE_VOICES,
  type ElevenLabsConfig,
  type VoicePreset,
} from "../lib/voice";
import {
  getMicrophoneDevices,
  getSelectedMicrophoneId,
  setSelectedMicrophone,
  getMicrophoneStream,
  type AudioDevice,
} from "../lib/audioDevices";
import { openSoundSettings, openExternalUrl } from "../lib/tauri";
import {
  loadStravaConfig,
  saveStravaConfig,
  fetchStravaAthleteStats,
  exchangeAuthorizationCode,
  buildStravaAuthUrl,
  loadCachedStravaStats,
  type StravaConfig,
  type StravaAthleteStats,
} from "../lib/strava";
import {
  beginGmailConsent,
  checkMailNow,
  completeGmailConnect,
  disconnectGmail,
  formatMailSummary,
  isGmailConnected,
  loadGmailConfig,
  saveGmailConfig,
  startGmailPolling,
  type GmailConfig,
} from "../lib/gmail";
import Icon from "./Icon";

interface Props {
  open: boolean;
  config: AIConfig;
  onSave: (config: AIConfig) => void;
  onClose: () => void;
}

const PRESETS: Array<{ label: string; config: Partial<AIConfig> }> = [
  {
    label: "Ollama (Local)",
    config: {
      providerName: "Ollama Local",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.2",
      apiKey: "",
    },
  },
  {
    label: "LM Studio",
    config: {
      providerName: "LM Studio",
      baseUrl: "http://localhost:1234/v1",
      model: "local-model",
      apiKey: "",
    },
  },
  {
    label: "OpenRouter",
    config: {
      providerName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "google/gemini-2.0-flash-001",
    },
  },
  {
    label: "Groq (Fast)",
    config: {
      providerName: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
    },
  },
  {
    label: "OpenAI",
    config: {
      providerName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    },
  },
  {
    label: "Gemini",
    config: {
      providerName: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-2.0-flash",
    },
  },
  {
    label: "DeepSeek",
    config: {
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
    },
  },
  {
    label: "Custom",
    config: {
      providerName: "Custom Provider",
    },
  },
];

export default function AISettingsModal({ open, config, onSave, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"llm" | "voice" | "mic" | "strava" | "gmail">("llm");
  const [form, setForm] = useState<AIConfig>({ ...config });
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ElevenLabs Voice State
  const [elevenForm, setElevenForm] = useState<ElevenLabsConfig>(loadElevenLabsConfig);
  const [showElevenKey, setShowElevenKey] = useState(false);
  const [testingEleven, setTestingEleven] = useState(false);
  const [elevenTestResult, setElevenTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [voices, setVoices] = useState<VoicePreset[]>(FREE_PREMADE_VOICES);
  const [fetchingVoices, setFetchingVoices] = useState(false);

  // Microphone Devices & Level State
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>(getSelectedMicrophoneId());
  const [scanningMics, setScanningMics] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [testListening, setTestListening] = useState(false);
  const [testTranscript, setTestTranscript] = useState("");
  const vuAnimationRef = useRef<number | null>(null);
  const vuStreamRef = useRef<MediaStream | null>(null);
  const vuAudioCtxRef = useRef<AudioContext | null>(null);
  const testRecognitionRef = useRef<any>(null);

  // Strava Telemetry State
  const [stravaForm, setStravaForm] = useState<StravaConfig>(loadStravaConfig);
  const [showStravaSecret, setShowStravaSecret] = useState(false);
  const [stravaStats, setStravaStats] = useState<StravaAthleteStats | null>(loadCachedStravaStats);
  const [syncingStrava, setSyncingStrava] = useState(false);
  const [stravaResult, setStravaResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [authCodeInput, setAuthCodeInput] = useState("");
  const [exchangingCode, setExchangingCode] = useState(false);

  // Gmail School Updates State
  const initialGmail = loadGmailConfig();
  const [gmailForm, setGmailForm] = useState({
    clientId: initialGmail.clientId,
    domain: initialGmail.domain,
    pollMinutes: initialGmail.pollMinutes,
  });
  const [gmailSecret, setGmailSecret] = useState("");
  const [gmailConnected, setGmailConnected] = useState(initialGmail.connected);
  const [gmailLastSync, setGmailLastSync] = useState<number | null>(initialGmail.lastSyncAt);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [gmailResult, setGmailResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleGmailConnect = async () => {
    setConnectingGmail(true);
    setGmailResult(null);
    try {
      if (!gmailForm.clientId.trim() || !gmailSecret.trim() || !gmailForm.domain.trim()) {
        throw new Error("Client ID, client secret, and school domain are all required.");
      }
      const code = await beginGmailConsent(gmailForm.clientId);
      const cfg = await completeGmailConnect(code, gmailForm.clientId, gmailSecret);
      setGmailConnected(true);
      setGmailLastSync(cfg.lastSyncAt);
      setGmailResult({ ok: true, message: "Connected — school mail polling is live, Sir." });
      startGmailPolling();
    } catch (err) {
      setGmailResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setConnectingGmail(false);
    }
  };

  const handleGmailDisconnect = async () => {
    setConnectingGmail(true);
    setGmailResult(null);
    try {
      await disconnectGmail();
      setGmailConnected(false);
      setGmailSecret("");
      setGmailResult({ ok: true, message: "Disconnected — token revoked and credentials wiped, Sir." });
    } catch (err) {
      setGmailResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setConnectingGmail(false);
    }
  };

  const handleGmailCheckNow = async () => {
    setConnectingGmail(true);
    setGmailResult(null);
    try {
      const result = await checkMailNow();
      setGmailLastSync(loadGmailConfig().lastSyncAt);
      setGmailResult({ ok: true, message: formatMailSummary(result) });
    } catch (err) {
      setGmailResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setConnectingGmail(false);
    }
  };

  const persistGmailForm = () => {
    const cfg = loadGmailConfig();
    const next: GmailConfig = {
      ...cfg,
      clientId: gmailForm.clientId.trim() || cfg.clientId,
      domain: gmailForm.domain.trim(),
      pollMinutes: Math.max(1, Number(gmailForm.pollMinutes) || cfg.pollMinutes),
    };
    saveGmailConfig(next);
    if (isGmailConnected(next)) {
      startGmailPolling(); // restart with the new interval/domain
    }
  };

  const refreshDevices = useCallback(async () => {
    setScanningMics(true);
    try {
      const list = await getMicrophoneDevices();
      setDevices(list);
    } finally {
      setScanningMics(false);
    }
  }, []);

  // Monitor live volume energy when Microphone tab is open
  useEffect(() => {
    if (!open || activeTab !== "mic") {
      if (vuAnimationRef.current) {
        cancelAnimationFrame(vuAnimationRef.current);
        vuAnimationRef.current = null;
      }
      if (vuStreamRef.current) {
        vuStreamRef.current.getTracks().forEach((t) => t.stop());
        vuStreamRef.current = null;
      }
      if (vuAudioCtxRef.current && vuAudioCtxRef.current.state !== "closed") {
        void vuAudioCtxRef.current.close();
        vuAudioCtxRef.current = null;
      }
      setMicLevel(0);
      return;
    }

    void refreshDevices();

    let isCancelled = false;
    async function startMeter() {
      try {
        const stream = await getMicrophoneStream(selectedMicId);
        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        vuStreamRef.current = stream;

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        vuAudioCtxRef.current = ctx;

        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.2;
        src.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (isCancelled) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            sum += data[i];
          }
          const avg = sum / data.length;
          // Normalize energy curve to human voice range
          const normalized = Math.min(1, Math.max(0, (avg - 8) / 70));
          setMicLevel(normalized);
          vuAnimationRef.current = requestAnimationFrame(tick);
        };
        vuAnimationRef.current = requestAnimationFrame(tick);
      } catch (err) {
        console.warn("Could not start VU meter:", err);
      }
    }

    void startMeter();

    return () => {
      isCancelled = true;
      if (vuAnimationRef.current) {
        cancelAnimationFrame(vuAnimationRef.current);
        vuAnimationRef.current = null;
      }
      if (vuStreamRef.current) {
        vuStreamRef.current.getTracks().forEach((t) => t.stop());
        vuStreamRef.current = null;
      }
      if (vuAudioCtxRef.current && vuAudioCtxRef.current.state !== "closed") {
        void vuAudioCtxRef.current.close();
        vuAudioCtxRef.current = null;
      }
      setMicLevel(0);
    };
  }, [open, activeTab, selectedMicId, refreshDevices]);

  // Clean up recognition on unmount or tab change
  useEffect(() => {
    return () => {
      if (testRecognitionRef.current) {
        try {
          testRecognitionRef.current.abort();
        } catch {
          // ignore
        }
        testRecognitionRef.current = null;
      }
    };
  }, [activeTab]);

  const handleFetchVoices = async () => {
    if (!elevenForm.apiKey) return;
    setFetchingVoices(true);
    try {
      const list = await fetchElevenLabsVoices(elevenForm.apiKey);
      if (list.length > 0) {
        setVoices(list);
      }
    } catch {
      // Ignored
    } finally {
      setFetchingVoices(false);
    }
  };

  const handlePreset = (preset: (typeof PRESETS)[number]) => {
    setForm((prev) => ({
      ...prev,
      ...preset.config,
    }));
    setTestResult(null);
  };

  const handleTestLLM = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testAIConnection(form);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleTestEleven = async () => {
    setTestingEleven(true);
    setElevenTestResult(null);
    try {
      const res = await testElevenLabsVoice(elevenForm);
      setElevenTestResult(res);
    } catch (err) {
      setElevenTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTestingEleven(false);
    }
  };

  const handleTestRecognition = () => {
    const SpeechRec =
      (window as unknown as { webkitSpeechRecognition?: any; SpeechRecognition?: any })
        .webkitSpeechRecognition ||
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition;
    if (!SpeechRec) {
      setTestTranscript("Speech Recognition not supported in this window.");
      return;
    }

    if (testListening) {
      testRecognitionRef.current?.abort();
      setTestListening(false);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";

      setTestListening(true);
      setTestTranscript("Listening… speak now into your microphone.");

      rec.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join(" ");
        setTestTranscript(`“${transcript}”`);
      };

      rec.onerror = (e: any) => {
        setTestTranscript(`Recognition error: ${e.error || "No speech detected"}`);
        setTestListening(false);
      };

      rec.onend = () => {
        setTestListening(false);
      };

      rec.start();
      testRecognitionRef.current = rec;
    } catch (err) {
      setTestTranscript(`Failed to start test: ${String(err)}`);
      setTestListening(false);
    }
  };

  const handleOpenSoundSettings = async () => {
    try {
      await openSoundSettings();
    } catch (err) {
      console.warn("Could not launch sound settings:", err);
    }
  };

  const handleSyncStrava = async () => {
    setSyncingStrava(true);
    setStravaResult(null);
    try {
      saveStravaConfig(stravaForm);
      const stats = await fetchStravaAthleteStats(stravaForm);
      setStravaStats(stats);
      setStravaResult({
        ok: true,
        message: `Synced ${stats.weeklyMileageKm.toFixed(1)} km this week (${stats.weeklyRunCount} runs).`,
      });
    } catch (err) {
      setStravaResult({
        ok: false,
        message: String(err instanceof Error ? err.message : err),
      });
    } finally {
      setSyncingStrava(false);
    }
  };

  const handleOpenStravaAuth = async () => {
    if (!stravaForm.clientId.trim()) {
      setStravaResult({ ok: false, message: "Please enter your Strava Client ID in the input above first." });
      return;
    }
    const url = buildStravaAuthUrl(stravaForm.clientId);
    setStravaResult({
      ok: true,
      message: "Opening Strava in your browser… Click 'Authorize', then copy the code= from the redirected page.",
    });
    await openExternalUrl(url);
  };

  const handleCopyStravaAuthUrl = async () => {
    if (!stravaForm.clientId.trim()) {
      setStravaResult({ ok: false, message: "Please enter your Strava Client ID in the input above first." });
      return;
    }
    const url = buildStravaAuthUrl(stravaForm.clientId);
    try {
      await navigator.clipboard.writeText(url);
      setStravaResult({ ok: true, message: "Authorization URL copied to clipboard! Paste it into your browser." });
    } catch {
      setStravaResult({ ok: false, message: "Could not write to clipboard. Please click 1. Authorize directly." });
    }
  };

  const handleExchangeCode = async () => {
    if (!authCodeInput.trim() || !stravaForm.clientId || !stravaForm.clientSecret) {
      setStravaResult({
        ok: false,
        message: "Please provide your Client ID, Client Secret, and Authorization Code.",
      });
      return;
    }

    setExchangingCode(true);
    setStravaResult(null);
    try {
      let code = authCodeInput.trim();
      const match = code.match(/[?&]code=([^&]+)/);
      if (match) code = match[1];

      const updated = await exchangeAuthorizationCode(code, stravaForm.clientId, stravaForm.clientSecret);
      setStravaForm(updated);
      setAuthCodeInput("");

      const stats = await fetchStravaAthleteStats(updated);
      setStravaStats(stats);
      setStravaResult({
        ok: true,
        message: `Connected successfully as ${stats.athleteName}! Telemetry synced.`,
      });
    } catch (err) {
      setStravaResult({
        ok: false,
        message: String(err instanceof Error ? err.message : err),
      });
    } finally {
      setExchangingCode(false);
    }
  };

  const handleSave = () => {
    const activeDevice = devices.find((d) => d.deviceId === selectedMicId);
    setSelectedMicrophone(
      selectedMicId,
      activeDevice?.label ?? (selectedMicId ? "Selected Microphone" : "System Default Microphone")
    );
    saveElevenLabsConfig(elevenForm);
    saveStravaConfig(stravaForm);
    persistGmailForm();
    onSave(form);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="ai-settings-modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="ai-modal-header">
          <div className="ai-modal-title-wrap">
            <h2 className="ai-modal-title">Intelligence, Voice &amp; Microphone Settings</h2>
          </div>
          <button className="close-btn" onClick={onClose} title="Close settings" aria-label="Close settings">
            <Icon name="close" size={13} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="ai-modal-tabs">
          <button
            type="button"
            className={`ai-tab-btn ${activeTab === "llm" ? "active" : ""}`}
            onClick={() => setActiveTab("llm")}
          >
            <Icon name="brain" size={13} />
            <span>AI Brain &amp; Model</span>
          </button>
          <button
            type="button"
            className={`ai-tab-btn ${activeTab === "voice" ? "active" : ""}`}
            onClick={() => setActiveTab("voice")}
          >
            <Icon name="spark" size={13} />
            <span>ElevenLabs Voice</span>
          </button>
          <button
            type="button"
            className={`ai-tab-btn ${activeTab === "mic" ? "active" : ""}`}
            onClick={() => setActiveTab("mic")}
          >
            <Icon name="mic" size={13} />
            <span>Microphone Input</span>
          </button>
          <button
            type="button"
            className={`ai-tab-btn ${activeTab === "strava" ? "active" : ""}`}
            onClick={() => setActiveTab("strava")}
          >
            <Icon name="activity" size={13} />
            <span>Strava Telemetry</span>
          </button>
          <button
            type="button"
            className={`ai-tab-btn ${activeTab === "gmail" ? "active" : ""}`}
            onClick={() => setActiveTab("gmail")}
          >
            <Icon name="mail" size={13} />
            <span>Gmail School Mail</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "llm" && (
            <motion.div
              key="llm"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Preset Quick Select */}
              <div className="ai-presets-wrap">
              <span className="ai-field-label">PRESETS:</span>
              <div className="ai-presets-list">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={`ai-preset-btn ${
                      form.providerName === p.config.providerName ? "active" : ""
                    }`}
                    onClick={() => handlePreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-form-body">
              {/* Base URL */}
              <div className="ai-form-group">
                <label className="ai-field-label">
                  BASE URL <span className="dim">(OpenAI-Compatible /v1)</span>
                </label>
                <input
                  type="text"
                  className="ai-input"
                  value={form.baseUrl}
                  placeholder="http://localhost:11434/v1 or https://openrouter.ai/api/v1"
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                />
              </div>

              {/* Model Name */}
              <div className="ai-form-group">
                <label className="ai-field-label">MODEL NAME</label>
                <input
                  type="text"
                  className="ai-input"
                  value={form.model}
                  placeholder="e.g. llama3.2, qwen2.5-coder:7b, gemini-2.0-flash"
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </div>

              {/* API Key */}
              <div className="ai-form-group">
                <div className="ai-field-header">
                  <label className="ai-field-label">
                    API KEY <span className="dim">(Optional for local Ollama/LM Studio)</span>
                  </label>
                  <button
                    type="button"
                    className="ai-text-toggle"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? "HIDE" : "SHOW"}
                  </button>
                </div>
                <input
                  type={showKey ? "text" : "password"}
                  className="ai-input"
                  value={form.apiKey || ""}
                  placeholder="sk-... (leave blank if local / not required)"
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                />
              </div>

              {/* System Prompt Customizer */}
              <div className="ai-form-group">
                <label className="ai-field-label">
                  SYSTEM PROMPT OVERRIDE <span className="dim">(Optional)</span>
                </label>
                <textarea
                  className="ai-input ai-textarea"
                  rows={3}
                  value={form.systemPrompt || ""}
                  placeholder="Leave empty to use Severus Second Brain defaults..."
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                />
              </div>

              {/* Test connection output */}
              {testResult && (
                <div
                  className={`ai-test-pill ${
                    testResult.ok ? "ai-test-ok" : "ai-test-err"
                  }`}
                >
                  <span className="dot" />
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === "voice" && (
          <motion.div
            key="voice"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="ai-form-body"
          >
            {/* Free Presets Quick Select */}
            <div className="ai-presets-wrap">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 4 }}>
                <span className="ai-field-label">VOICE SELECTOR (FREE PREMADES &amp; ACCOUNT):</span>
                <button
                  type="button"
                  className="ai-text-toggle"
                  onClick={handleFetchVoices}
                  disabled={fetchingVoices || !elevenForm.apiKey}
                >
                  {fetchingVoices ? "FETCHING…" : "SYNC ACCOUNT VOICES"}
                </button>
              </div>
              <div className="ai-presets-list">
                {voices.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`ai-preset-btn ${
                      elevenForm.voiceId === v.id ? "active" : ""
                    }`}
                    onClick={() =>
                      setElevenForm((prev) => ({
                        ...prev,
                        voiceId: v.id,
                      }))
                    }
                    title={v.description}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-tip-box" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                ElevenLabs Free Tier vs. Custom Clones:
              </div>
              <div>
                • <strong>Free Tier (10,000 characters/mo):</strong> ElevenLabs allows using <strong>Premade Default Voices</strong> via API at zero cost. <strong>George</strong> (British storyteller) is the closest tone to Severus.
              </div>
              <div style={{ marginTop: 5 }}>
                • <strong>Why HTTP 402 Occurs:</strong> Free accounts cannot use Community Library voices or custom Instant Clones via the API. Upgrading to ElevenLabs Starter ($1 for 1st mo, then $5/mo) unlocks API access for your custom cloned voice from <code style={{ color: "#c084fc" }}>Severus/Voices/*.mp3</code>.
              </div>
            </div>

            {/* ElevenLabs API Key */}
            <div className="ai-form-group">
              <div className="ai-field-header">
                <label className="ai-field-label">
                  ELEVENLABS API KEY <span className="dim">(xi-api-key)</span>
                </label>
                <button
                  type="button"
                  className="ai-text-toggle"
                  onClick={() => setShowElevenKey(!showElevenKey)}
                >
                  {showElevenKey ? "HIDE" : "SHOW"}
                </button>
              </div>
              <input
                type={showElevenKey ? "text" : "password"}
                className="ai-input"
                value={elevenForm.apiKey || ""}
                placeholder="sk_... from elevenlabs.io"
                onChange={(e) => setElevenForm({ ...elevenForm, apiKey: e.target.value })}
              />
            </div>

            {/* Voice ID */}
            <div className="ai-form-group">
              <label className="ai-field-label">VOICE ID</label>
              <input
                type="text"
                className="ai-input"
                value={elevenForm.voiceId || ""}
                placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                onChange={(e) => setElevenForm({ ...elevenForm, voiceId: e.target.value })}
              />
            </div>

            {/* Model Selector */}
            <div className="ai-form-group">
              <label className="ai-field-label">TTS MODEL</label>
              <select
                className="ai-input"
                value={elevenForm.modelId || "eleven_flash_v2_5"}
                onChange={(e) => setElevenForm({ ...elevenForm, modelId: e.target.value })}
                style={{ cursor: "pointer" }}
              >
                <option value="eleven_flash_v2_5">Eleven Flash v2.5 (Fastest ~100ms latency, recommended for Thinking Mode)</option>
                <option value="eleven_turbo_v2_5">Eleven Turbo v2.5 (High quality &amp; fast)</option>
                <option value="eleven_multilingual_v2">Eleven Multilingual v2 (Rich emotional cadence)</option>
              </select>
            </div>

            {/* Test connection output */}
            {elevenTestResult && (
              <div
                className={`ai-test-pill ${
                  elevenTestResult.ok ? "ai-test-ok" : "ai-test-err"
                }`}
              >
                <span className="dot" />
                <span>{elevenTestResult.message}</span>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "mic" && (
          <motion.div
            key="mic"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="ai-form-body"
          >
            <div className="ai-tip-box" style={{ background: "rgba(59, 130, 246, 0.06)", borderColor: "rgba(59, 130, 246, 0.18)", marginBottom: 8 }}>
              <div style={{ fontWeight: 600, color: "#93c5fd", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="mic" size={13} />
                Hardware Microphone Selection:
              </div>
              <div>
                Choose the physical microphone Severus should listen to for hands-free voice commands, double-claps, and conversational thinking mode.
              </div>
            </div>

            {/* Microphone Selector */}
            <div className="ai-form-group">
              <label className="ai-field-label">
                ACTIVE MICROPHONE DEVICE ({devices.length} DETECTED)
              </label>
              <div className="mic-selector-row">
                <select
                  className="ai-input mic-select"
                  value={selectedMicId}
                  onChange={(e) => setSelectedMicId(e.target.value)}
                >
                  <option value="">Default System Microphone</option>
                  {devices
                    .filter((d) => d.deviceId && d.deviceId !== "default")
                    .map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="mic-refresh-btn"
                  onClick={refreshDevices}
                  disabled={scanningMics}
                  title="Rescan connected audio devices"
                >
                  <Icon name="reset" size={12} />
                  <span>{scanningMics ? "Scanning…" : "Rescan"}</span>
                </button>
              </div>
            </div>

            {/* Live Volume VU Meter */}
            <div className="ai-form-group">
              <label className="ai-field-label">LIVE INPUT LEVEL (SPEAK TO TEST)</label>
              <div className="mic-vu-panel">
                <div className="mic-vu-header">
                  <span>SIGNAL ENERGY</span>
                  <span className="mic-vu-val">{Math.round(micLevel * 100)}%</span>
                </div>
                <div className="mic-vu-track">
                  <div
                    className="mic-vu-bar"
                    style={{
                      width: `${Math.max(2, Math.min(100, micLevel * 100))}%`,
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-muted)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: micLevel > 0.06 ? "#34d399" : "rgba(255,255,255,0.3)", boxShadow: micLevel > 0.06 ? "0 0 8px #34d399" : "none" }} />
                    {micLevel > 0.06 ? "Voice signal detected" : "Ambient noise / Silent"}
                  </span>
                  <span style={{ maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {devices.find((d) => d.deviceId === selectedMicId)?.label || "Default System Mic"}
                  </span>
                </div>
              </div>
            </div>

            {/* Live Speech Recognition Test */}
            <div className="ai-form-group">
              <div className="ai-field-header">
                <label className="ai-field-label">SPEECH RECOGNITION TEST</label>
                <button
                  type="button"
                  className="ai-btn-secondary"
                  style={{ padding: "3px 10px", fontSize: "11px" }}
                  onClick={handleTestRecognition}
                >
                  <Icon name={testListening ? "close" : "mic"} size={11} />
                  <span>{testListening ? "Stop Test" : "Start 5s Test"}</span>
                </button>
              </div>
              <div className="mic-test-rec-box">
                <div className="mic-rec-transcript">
                  {testTranscript || 'Click "Start 5s Test" and speak a phrase (e.g. "Hey Severus, open copilot") to verify recognition.'}
                </div>
              </div>
            </div>

            {/* Windows System Sound Settings Link */}
            <div className="ai-form-group" style={{ marginTop: 2 }}>
              <button
                type="button"
                className="ai-btn-secondary"
                style={{ width: "100%", justifyContent: "center", gap: 8, padding: "8px 14px" }}
                onClick={handleOpenSoundSettings}
                title="Open Windows Sound Settings to set this mic as default for the whole PC"
              >
                <Icon name="external" size={12} />
                <span>Open Windows Sound Settings (ms-settings:sound)</span>
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === "strava" && (
          <motion.div
            key="strava"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="strava-tab-content"
          >
            {/* Athlete Status & Overview */}
            {stravaStats ? (
              <div className="strava-athlete-card">
                <div className="strava-athlete-header">
                  {stravaStats.athleteAvatar ? (
                    <img
                      src={stravaStats.athleteAvatar}
                      alt={stravaStats.athleteName}
                      className="strava-avatar"
                    />
                  ) : (
                    <div className="strava-avatar-placeholder">
                      <Icon name="activity" size={18} />
                    </div>
                  )}
                  <div className="strava-athlete-meta">
                    <div className="strava-athlete-name">{stravaStats.athleteName}</div>
                    <div className="strava-athlete-badge">
                      <span className="strava-online-dot" />
                      Strava Telemetry Connected
                    </div>
                  </div>
                  <button
                    type="button"
                    className="strava-sync-btn"
                    disabled={syncingStrava}
                    onClick={handleSyncStrava}
                    title="Sync latest activities from Strava"
                  >
                    <Icon name="reset" size={12} />
                    <span>{syncingStrava ? "Syncing…" : "Sync"}</span>
                  </button>
                </div>

                {/* Metrics Grid */}
                <div className="strava-metrics-grid">
                  <div className="strava-metric-box">
                    <span className="strava-metric-label">THIS WEEK</span>
                    <span className="strava-metric-value">{stravaStats.weeklyMileageKm.toFixed(1)} km</span>
                    <span className="strava-metric-sub">{stravaStats.weeklyRunCount} runs</span>
                  </div>
                  <div className="strava-metric-box">
                    <span className="strava-metric-label">THIS MONTH</span>
                    <span className="strava-metric-value">{stravaStats.monthlyMileageKm.toFixed(1)} km</span>
                    <span className="strava-metric-sub">Cumulative</span>
                  </div>
                  <div className="strava-metric-box">
                    <span className="strava-metric-label">LATEST RUN</span>
                    <span className="strava-metric-value">
                      {stravaStats.latestRun ? stravaStats.latestRun.formattedDistance : "None"}
                    </span>
                    <span className="strava-metric-sub">
                      {stravaStats.latestRun ? stravaStats.latestRun.formattedPace : "No runs"}
                    </span>
                  </div>
                </div>

                {/* Latest Run Details */}
                {stravaStats.latestRun && (
                  <div className="strava-latest-card">
                    <div className="strava-latest-title" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Icon name="activity" size={13} />
                      <span>{stravaStats.latestRun.name}</span>
                    </div>
                    <div className="strava-latest-details">
                      <span>{stravaStats.latestRun.formattedDate}</span>
                      <span>·</span>
                      <span>{stravaStats.latestRun.formattedDuration}</span>
                      <span>·</span>
                      <span>{stravaStats.latestRun.elevationGainM}m elevation</span>
                      {stravaStats.latestRun.averageHeartrate && (
                        <>
                          <span>·</span>
                          <span>{stravaStats.latestRun.averageHeartrate} bpm</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="strava-unconnected-banner">
                <Icon name="activity" size={20} />
                <div className="strava-banner-text">
                  <strong>Connect Your Strava Subscription</strong>
                  <p>
                    Severus will automatically ingest your running telemetry, compute weekly mileage,
                    sync activities to your daily journal, and deliver spoken athletic briefings.
                  </p>
                </div>
              </div>
            )}

            {/* API Credentials */}
            <div className="ai-field-group">
              <label className="ai-field-label">STRAVA CLIENT ID</label>
              <input
                type="text"
                className="ai-field-input"
                placeholder="e.g. 123456"
                value={stravaForm.clientId}
                onChange={(e) => setStravaForm({ ...stravaForm, clientId: e.target.value })}
              />
            </div>

            <div className="ai-field-group">
              <label className="ai-field-label">STRAVA CLIENT SECRET</label>
              <div className="ai-input-with-action">
                <input
                  type={showStravaSecret ? "text" : "password"}
                  className="ai-field-input"
                  placeholder="e.g. 9f8a7b6c5d..."
                  value={stravaForm.clientSecret}
                  onChange={(e) => setStravaForm({ ...stravaForm, clientSecret: e.target.value })}
                />
                <button
                  type="button"
                  className="ai-input-action-btn"
                  onClick={() => setShowStravaSecret(!showStravaSecret)}
                  title={showStravaSecret ? "Hide secret" : "Show secret"}
                >
                  <Icon name="eye" size={13} />
                </button>
              </div>
            </div>

            <div className="ai-field-group">
              <label className="ai-field-label">STRAVA REFRESH TOKEN</label>
              <div className="ai-input-with-action">
                <input
                  type={showStravaSecret ? "text" : "password"}
                  className="ai-field-input"
                  placeholder="e.g. 3a2b1c0d..."
                  value={stravaForm.refreshToken}
                  onChange={(e) => setStravaForm({ ...stravaForm, refreshToken: e.target.value })}
                />
                <button
                  type="button"
                  className="ai-input-action-btn"
                  onClick={() => setShowStravaSecret(!showStravaSecret)}
                  title={showStravaSecret ? "Hide token" : "Show token"}
                >
                  <Icon name="eye" size={13} />
                </button>
              </div>
            </div>

            {/* 1-Click Setup Helper */}
            <div className="strava-setup-guide">
              <div className="strava-guide-title">
                <Icon name="info" size={12} />
                <span>Quick Setup Assistant (2 Minutes)</span>
              </div>
              <ol className="strava-steps-list">
                <li>
                  Open{" "}
                  <button
                    type="button"
                    className="strava-link"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
                    onClick={() => void openExternalUrl("https://www.strava.com/settings/api")}
                  >
                    strava.com/settings/api
                  </button>{" "}
                  and create an app (Domain: <code>localhost</code>).
                </li>
                <li>Paste your <strong>Client ID</strong> and <strong>Client Secret</strong> above.</li>
                <li style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>Click:</span>
                  <button
                    type="button"
                    className="strava-auth-link-btn"
                    onClick={handleOpenStravaAuth}
                  >
                    1. Authorize Severus on Strava
                  </button>
                  <button
                    type="button"
                    className="ai-preset-btn"
                    style={{ padding: "3px 8px", fontSize: "10.5px", cursor: "pointer" }}
                    onClick={handleCopyStravaAuthUrl}
                    title="Copy direct OAuth URL to clipboard"
                  >
                    Copy Link
                  </button>
                </li>
                <li>
                  After clicking Authorize, Strava redirects to <code>http://localhost/?code=...</code>. Copy the <code>code=</code> from the browser URL.
                </li>
                <li className="strava-code-exchange-row">
                  <input
                    type="text"
                    className="ai-field-input code-input"
                    placeholder="Paste code=XXXXX here"
                    value={authCodeInput}
                    onChange={(e) => setAuthCodeInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="strava-exchange-btn"
                    disabled={!authCodeInput || exchangingCode || !stravaForm.clientId || !stravaForm.clientSecret}
                    onClick={handleExchangeCode}
                  >
                    {exchangingCode ? "Connecting…" : "2. Complete Setup"}
                  </button>
                </li>
              </ol>
            </div>

            {stravaResult && (
              <div className={`ai-test-result ${stravaResult.ok ? "success" : "error"}`}>
                <Icon name={stravaResult.ok ? "check" : "alert"} size={13} />
                <span>{stravaResult.message}</span>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "gmail" && (
          <motion.div
            key="gmail"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="ai-status-line">
              <span className={`ai-test-pill ${gmailConnected ? "ai-test-ok" : "ai-test-err"}`}>
                <span className="dot" />
                <span>
                  {gmailConnected
                    ? `Connected${gmailLastSync ? ` · last sync ${new Date(gmailLastSync).toLocaleTimeString()}` : ""}`
                    : "Not connected"}
                </span>
              </span>
            </div>

            <div className="ai-form-body">
              <div className="ai-form-group">
                <label className="ai-field-label">
                  OAUTH CLIENT ID <span className="dim">(Desktop-type client)</span>
                </label>
                <input
                  type="text"
                  className="ai-input"
                  value={gmailForm.clientId}
                  placeholder="1234567890-abc123.apps.googleusercontent.com"
                  onChange={(e) => setGmailForm({ ...gmailForm, clientId: e.target.value })}
                />
              </div>

              <div className="ai-form-group">
                <div className="ai-field-header">
                  <label className="ai-field-label">
                    OAUTH CLIENT SECRET <span className="dim">(stored in Windows Credential Manager)</span>
                  </label>
                </div>
                <input
                  type="password"
                  className="ai-input"
                  value={gmailSecret}
                  placeholder={gmailConnected ? "•••••••• stored — leave blank to keep" : "GOCSPX-…"}
                  onChange={(e) => setGmailSecret(e.target.value)}
                />
              </div>

              <div className="ai-form-group">
                <label className="ai-field-label">
                  SCHOOL DOMAIN <span className="dim">(updates come from this sender domain)</span>
                </label>
                <input
                  type="text"
                  className="ai-input"
                  value={gmailForm.domain}
                  placeholder="e.g. davao.cjc.edu.ph — without the @"
                  onChange={(e) => setGmailForm({ ...gmailForm, domain: e.target.value })}
                />
              </div>

              <div className="ai-form-group">
                <label className="ai-field-label">POLL INTERVAL</label>
                <select
                  className="ai-input"
                  value={gmailForm.pollMinutes}
                  onChange={(e) => setGmailForm({ ...gmailForm, pollMinutes: Number(e.target.value) })}
                >
                  {[1, 2, 3, 5, 10, 15].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      every {minutes} minute{minutes === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </div>

              {gmailResult && (
                <div className={`ai-test-pill ${gmailResult.ok ? "ai-test-ok" : "ai-test-err"}`}>
                  <span className="dot" />
                  <span>{gmailResult.message}</span>
                </div>
              )}

              <p className="gmail-privacy-note">
                Read-only scopes (gmail.readonly + Classroom) — Severus can never send or delete
                anything. Only sender, subject, and date headers are fetched; bodies stay in Gmail,
                and Classroom supplies due dates and announcements directly. Tokens live in Windows
                Credential Manager. Testing-mode consents expire weekly — reconnect when the badge
                stops updating.
              </p>
            </div>

            <div className="gmail-actions">
              {!gmailConnected ? (
                <button
                  type="button"
                  className="accent gmail-connect-btn"
                  disabled={connectingGmail || !gmailForm.clientId.trim() || !gmailSecret.trim() || !gmailForm.domain.trim()}
                  onClick={() => void handleGmailConnect()}
                >
                  {connectingGmail ? (
                    "Waiting for consent…"
                  ) : (
                    <>
                      <Icon name="mail" size={12} /> Connect School Gmail
                    </>
                  )}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="ai-btn-secondary"
                    disabled={connectingGmail}
                    onClick={() => void handleGmailCheckNow()}
                  >
                    <Icon name="reset" size={12} /> Check Now
                  </button>
                  <button
                    type="button"
                    className="ai-btn-secondary gmail-disconnect-btn"
                    disabled={connectingGmail}
                    onClick={() => void handleGmailDisconnect()}
                  >
                    <Icon name="close" size={12} /> Disconnect &amp; Revoke
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

        {/* Footer Actions */}
        <div className="ai-modal-footer">
          {activeTab === "llm" ? (
            <button
              type="button"
              className="ai-btn-secondary"
              disabled={testing}
              onClick={handleTestLLM}
            >
              {testing ? (
                "Testing…"
              ) : (
                <>
                  <Icon name="activity" size={12} /> Test LLM Brain
                </>
              )}
            </button>
          ) : activeTab === "voice" ? (
            <button
              type="button"
              className="ai-btn-secondary"
              disabled={testingEleven}
              onClick={handleTestEleven}
            >
              {testingEleven ? (
                "Verifying…"
              ) : (
                <>
                  <Icon name="activity" size={12} /> Test ElevenLabs Voice
                </>
              )}
            </button>
          ) : activeTab === "mic" ? (
            <button
              type="button"
              className="ai-btn-secondary"
              onClick={handleTestRecognition}
            >
              <Icon name={testListening ? "close" : "mic"} size={12} />
              <span>{testListening ? "Listening…" : "Test Speech Recognition"}</span>
            </button>
          ) : activeTab === "gmail" ? (
            <button
              type="button"
              className="ai-btn-secondary"
              disabled={connectingGmail || !gmailConnected}
              onClick={() => void handleGmailCheckNow()}
            >
              <Icon name="mail" size={12} />
              <span>{connectingGmail ? "Checking…" : "Check School Mail Now"}</span>
            </button>
          ) : (
            <button
              type="button"
              className="ai-btn-secondary"
              disabled={syncingStrava || !stravaForm.clientId || !stravaForm.refreshToken}
              onClick={handleSyncStrava}
            >
              <Icon name="activity" size={12} />
              <span>{syncingStrava ? "Syncing Telemetry…" : "Sync Strava Now"}</span>
            </button>
          )}

          <div className="ai-footer-right">
            <button type="button" onClick={onClose}>
              CANCEL
            </button>
            <button type="button" className="accent" onClick={handleSave}>
              SAVE &amp; APPLY
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
