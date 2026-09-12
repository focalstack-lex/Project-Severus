export interface AIConfig {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  providerName: "Ollama Local",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "",
  model: "llama3.2",
  systemPrompt:
    "You are Severus AI, an engineering assistant and academic mentor embedded in Lex Matondo's Second Brain. Keep answers concise, factual, and actionable. Maintain the dignified, stoic persona of Professor Severus Snape, and always address the user respectfully by appending 'Sir' at the end of your response.",
};

const STORAGE_KEY = "severus_ai_config";

export function loadAIConfig(): AIConfig {
  try {
    const metaEnv = (import.meta as any).env || {};
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    const providerName = parsed.providerName || metaEnv.VITE_AI_PROVIDER || DEFAULT_AI_CONFIG.providerName;
    const baseUrl = parsed.baseUrl || metaEnv.VITE_AI_BASE_URL || DEFAULT_AI_CONFIG.baseUrl;
    const apiKey = parsed.apiKey || metaEnv.VITE_AI_API_KEY || DEFAULT_AI_CONFIG.apiKey;
    const model = parsed.model || metaEnv.VITE_AI_MODEL || DEFAULT_AI_CONFIG.model;
    const systemPrompt = parsed.systemPrompt || DEFAULT_AI_CONFIG.systemPrompt;

    return {
      providerName,
      baseUrl,
      apiKey,
      model,
      systemPrompt,
    };
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

export function saveAIConfig(config: AIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error("Failed to save AI config to localStorage:", err);
  }
}

/**
 * Normalizes baseUrl so it doesn't end with trailing slashes or duplicate paths
 */
function cleanBaseUrl(url: string): string {
  let cleaned = url.trim().replace(/\/+$/, "");
  if (cleaned.endsWith("/chat/completions")) {
    cleaned = cleaned.replace(/\/chat\/completions$/, "");
  }
  return cleaned;
}

/**
 * Strips whitespace, hidden carriage returns, and accidental wrapping quotes from API keys
 */
function sanitizeApiKey(key: string): string {
  return key.trim().replace(/^["']|["']$/g, "").trim();
}

function parseErrorMessage(status: number, text: string): string {
  try {
    const json = JSON.parse(text);
    if (json.error?.message) {
      return json.error.message;
    }
    if (json.message) {
      return json.message;
    }
  } catch {
    // fallback
  }
  return text.slice(0, 180) || `HTTP ${status}`;
}

/**
 * Tests connectivity to the configured OpenAI-compatible endpoint
 */
export async function testAIConnection(config: AIConfig): Promise<{ ok: boolean; message: string }> {
  const base = cleanBaseUrl(config.baseUrl);
  const endpoint = `${base}/chat/completions`;
  const cleanKey = sanitizeApiKey(config.apiKey);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cleanKey) {
    headers["Authorization"] = `Bearer ${cleanKey}`;
    // Support Google Gemini / Vertex OpenAI endpoints which accept x-goog-api-key
    if (base.includes("generativelanguage.googleapis.com")) {
      headers["x-goog-api-key"] = cleanKey;
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model.trim(),
        messages: [{ role: "user", content: "Ping" }],
        max_tokens: 5,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const errorDetail = parseErrorMessage(res.status, text);
      return {
        ok: false,
        message: `HTTP ${res.status}: ${errorDetail}`,
      };
    }

    return {
      ok: true,
      message: `Connected successfully to ${config.model}!`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Connection failed or timed out",
    };
  }
}

/**
 * Single-shot completion used by utility callers (e.g. the system-command
 * fallback) that need a bare model answer without Severus persona or telemetry.
 */
export async function chatOnce(config: AIConfig, systemPrompt: string, userText: string): Promise<string> {
  const base = cleanBaseUrl(config.baseUrl);
  const endpoint = `${base}/chat/completions`;
  const cleanKey = sanitizeApiKey(config.apiKey);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cleanKey) {
    headers["Authorization"] = `Bearer ${cleanKey}`;
    if (base.includes("generativelanguage.googleapis.com")) {
      headers["x-goog-api-key"] = cleanKey;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model.trim(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
        temperature: 0,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${parseErrorMessage(res.status, text)}`);
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      throw new Error("No response message returned from model.");
    }
    return reply;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sends messages to the OpenAI-compatible endpoint
 */
export async function sendAIChat(
  config: AIConfig,
  messages: ChatMessage[],
  dynamicContext?: string,
): Promise<string> {
  const base = cleanBaseUrl(config.baseUrl);
  const endpoint = `${base}/chat/completions`;
  const cleanKey = sanitizeApiKey(config.apiKey);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cleanKey) {
    headers["Authorization"] = `Bearer ${cleanKey}`;
    if (base.includes("generativelanguage.googleapis.com")) {
      headers["x-goog-api-key"] = cleanKey;
    }
  }

  const basePrompt =
    config.systemPrompt?.trim() ||
    "You are Severus AI, an active engineering copilot and cognitive mentor embedded in Project Severus Second Brain.";

  const fullSystemContent = dynamicContext
    ? `${basePrompt}\n\n${dynamicContext}`
    : basePrompt;

  const systemMsg: ChatMessage[] = [{ role: "system", content: fullSystemContent }];

  const payload = {
    model: config.model.trim(),
    messages: [...systemMsg, ...messages],
    temperature: 0.7,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const errorDetail = parseErrorMessage(res.status, text);
    throw new Error(`HTTP ${res.status}: ${errorDetail}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error("No response message returned from model.");
  }

  return reply;
}
