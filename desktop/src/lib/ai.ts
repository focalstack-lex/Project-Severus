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
    "You are Severus AI, an engineering assistant and academic mentor embedded in Lex Matondo's Second Brain. Keep answers concise, factual, and actionable.",
};

const STORAGE_KEY = "severus_ai_config";

export function loadAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AI_CONFIG;
    return { ...DEFAULT_AI_CONFIG, ...JSON.parse(raw) };
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
 * Sends messages to the OpenAI-compatible endpoint
 */
export async function sendAIChat(
  config: AIConfig,
  messages: ChatMessage[],
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

  const systemMsg: ChatMessage[] = config.systemPrompt
    ? [{ role: "system", content: config.systemPrompt }]
    : [];

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
