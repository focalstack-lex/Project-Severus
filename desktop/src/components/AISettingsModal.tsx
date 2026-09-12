import { useState } from "react";
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
  const [activeTab, setActiveTab] = useState<"llm" | "voice">("llm");
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

  if (!open) return null;

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

  const handleSave = () => {
    saveElevenLabsConfig(elevenForm);
    onSave(form);
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="ai-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-modal-header">
          <div className="ai-modal-title-wrap">
            <h2 className="ai-modal-title">Intelligence &amp; Voice Settings</h2>
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
            <Icon name="mic" size={13} />
            <span>ElevenLabs Voice</span>
          </button>
        </div>

        {activeTab === "llm" ? (
          <>
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
                  value={form.apiKey}
                  placeholder="sk-... or blank for local models"
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
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
          </>
        ) : (
          /* ElevenLabs Voice Tab */
          <div className="ai-form-body">
            {/* Enable Toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 0",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  Use ElevenLabs Neural Voice
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Speaks in your cloned Severus Snape voice in Thinking Mode (falls back to local voice if offline)
                </div>
              </div>
              <input
                type="checkbox"
                checked={elevenForm.enabled !== false}
                onChange={(e) => setElevenForm({ ...elevenForm, enabled: e.target.checked })}
                style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#c084fc" }}
              />
            </div>

            {/* Voice Presets */}
            <div className="ai-presets-wrap">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="ai-field-label">FREE TIER PREMADE VOICES (NO UPGRADE NEEDED):</span>
                {elevenForm.apiKey && (
                  <button
                    type="button"
                    className="ai-text-toggle"
                    disabled={fetchingVoices}
                    onClick={handleFetchVoices}
                    title="Load voices from your ElevenLabs account"
                  >
                    {fetchingVoices ? "FETCHING…" : "SYNC ACCOUNT VOICES"}
                  </button>
                )}
              </div>
              <div className="ai-presets-list">
                {voices.map((v) => {
                  const isSelected = elevenForm.voiceId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`ai-preset-btn ${isSelected ? "active" : ""}`}
                      onClick={() => {
                        setElevenForm({ ...elevenForm, voiceId: v.id });
                        setElevenTestResult(null);
                      }}
                      title={v.description}
                    >
                      {v.name} {v.accent ? `(${v.accent})` : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Free Tier vs Paid Explanation */}
            <div className="ai-tip-box" style={{ lineHeight: 1.55 }}>
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
          </div>
        )}

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
          ) : (
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
      </div>
    </div>
  );
}
