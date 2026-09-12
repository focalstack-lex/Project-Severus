import { useState } from "react";
import { type AIConfig, testAIConnection } from "../lib/ai";

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
    label: "Gemini OpenAI Endpoint",
    config: {
      providerName: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-2.0-flash",
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
  const [form, setForm] = useState<AIConfig>({ ...config });
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!open) return null;

  const handlePreset = (preset: (typeof PRESETS)[number]) => {
    setForm((prev) => ({
      ...prev,
      ...preset.config,
    }));
    setTestResult(null);
  };

  const handleTest = async () => {
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

  const handleSave = () => {
    onSave(form);
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="ai-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-modal-header">
          <div className="ai-modal-title-wrap">
            <span className="ai-modal-section">04 / CONFIGURATION</span>
            <h2 className="ai-modal-title">AI BRAIN &amp; MODEL PROVIDER</h2>
          </div>
          <button className="close-btn" onClick={onClose} title="Close settings">
            ✕
          </button>
        </div>

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

        {/* Footer Actions */}
        <div className="ai-modal-footer">
          <button
            type="button"
            className="ai-btn-secondary"
            disabled={testing}
            onClick={handleTest}
          >
            {testing ? "TESTING…" : "⚡ TEST CONNECTION"}
          </button>
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
