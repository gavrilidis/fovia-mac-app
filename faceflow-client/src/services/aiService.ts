import { invoke } from "@tauri-apps/api/core";

const API_PROVIDER_STORAGE = "faceflow-ai-provider";
const API_MODEL_STORAGE = "faceflow-ai-model";

export type AIProvider = "openai" | "anthropic" | "gemini" | "deepseek" | "qwen" | "grok";

export interface AIProviderConfig {
  id: AIProvider;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
}

export const AI_PROVIDERS: AIProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
  },
  {
    id: "gemini",
    name: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "qwen",
    name: "Qwen",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    models: ["qwen-plus", "qwen-max", "qwen-turbo"],
  },
  {
    id: "grok",
    name: "Grok",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini",
    models: ["grok-3", "grok-3-mini"],
  },
];

const API_KEY_NAMES: Record<AIProvider, string> = {
  openai: "api_key_openai",
  anthropic: "api_key_anthropic",
  gemini: "api_key_gemini",
  deepseek: "api_key_deepseek",
  qwen: "api_key_qwen",
  grok: "api_key_grok",
};

interface AiTagResult {
  tags: string[];
  description: string;
}

function providerConfig(provider: AIProvider): AIProviderConfig {
  return AI_PROVIDERS.find((p) => p.id === provider) ?? AI_PROVIDERS[0];
}

export function getAiProvider(): AIProvider {
  const value = localStorage.getItem(API_PROVIDER_STORAGE);
  const isKnown = AI_PROVIDERS.some((p) => p.id === value);
  return isKnown ? (value as AIProvider) : "openai";
}

export function setAiProvider(provider: AIProvider): void {
  localStorage.setItem(API_PROVIDER_STORAGE, provider);
}

export function getAiModel(provider = getAiProvider()): string {
  const cfg = providerConfig(provider);
  const value = localStorage.getItem(`${API_MODEL_STORAGE}:${provider}`);
  return value && cfg.models.includes(value) ? value : cfg.defaultModel;
}

export function setAiModel(provider: AIProvider, model: string): void {
  localStorage.setItem(`${API_MODEL_STORAGE}:${provider}`, model);
}

export async function getAiApiKey(provider = getAiProvider()): Promise<string> {
  const keyName = API_KEY_NAMES[provider];
  const value = await invoke<string | null>("get_secret", { keyName });
  return value ?? "";
}

export async function setAiApiKey(provider: AIProvider, key: string): Promise<void> {
  const keyName = API_KEY_NAMES[provider];
  if (key.trim()) {
    await invoke("save_secret", { keyName, value: key.trim() });
  } else {
    await invoke("delete_secret", { keyName });
  }
}

export async function isAiConfigured(provider = getAiProvider()): Promise<boolean> {
  const key = await getAiApiKey(provider);
  return key.length > 0;
}

export async function analyzePhoto(base64Image: string): Promise<AiTagResult> {
  const provider = getAiProvider();
  const model = getAiModel(provider);
  const apiKey = await getAiApiKey(provider);
  if (!apiKey) {
    throw new Error("AI API key not configured");
  }

  if (provider === "anthropic") {
    return analyzeWithAnthropic(apiKey, model, base64Image);
  }
  if (provider === "gemini") {
    return analyzeWithGemini(apiKey, model, base64Image);
  }
  return analyzeWithOpenAICompatible(providerConfig(provider).baseUrl, apiKey, model, base64Image);
}

export async function testAiConnection(provider: AIProvider, model: string, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("API key is required");
  }
  const testImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBAQEAzOwAAAAASUVORK5CYII=";
  if (provider === "anthropic") {
    await analyzeWithAnthropic(trimmed, model, testImage);
    return;
  }
  if (provider === "gemini") {
    await analyzeWithGemini(trimmed, model, testImage);
    return;
  }
  await analyzeWithOpenAICompatible(providerConfig(provider).baseUrl, trimmed, model, testImage);
}

async function analyzeWithOpenAICompatible(baseUrl: string, apiKey: string, model: string, base64Image: string): Promise<AiTagResult> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Analyze this photo. Return a JSON object with two fields: "tags" and "description". Return ONLY valid JSON.',
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "low" },
            },
          ],
        },
      ],
      max_tokens: 300,
    }),
  });
  if (!response.ok) {
    throw new Error(`Provider API error: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseAiResponse(data.choices?.[0]?.message?.content ?? "");
}

async function analyzeWithAnthropic(apiKey: string, model: string, base64Image: string): Promise<AiTagResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64Image },
            },
            {
              type: "text",
              text: 'Analyze this photo. Return a JSON object with two fields: "tags" and "description". Return ONLY valid JSON.',
            },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as {
    content?: Array<{ text?: string }>;
  };
  return parseAiResponse(data.content?.[0]?.text ?? "");
}

async function analyzeWithGemini(apiKey: string, model: string, base64Image: string): Promise<AiTagResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: 'Analyze this photo. Return JSON with "tags" and "description". Return ONLY JSON.' },
              { inline_data: { mime_type: "image/jpeg", data: base64Image } },
            ],
          },
        ],
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseAiResponse(content);
}

function parseAiResponse(content: string): AiTagResult {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response");
  }
  const parsed = JSON.parse(jsonMatch[0]) as { tags?: unknown; description?: unknown };
  return {
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    description: typeof parsed.description === "string" ? parsed.description : "",
  };
}

export async function analyzePhotoBatch(
  photos: Array<{ filePath: string; base64: string }>,
  onProgress: (done: number, total: number, filePath: string) => void,
): Promise<Map<string, AiTagResult>> {
  const results = new Map<string, AiTagResult>();
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    onProgress(i, photos.length, photo.filePath);
    try {
      const result = await analyzePhoto(photo.base64);
      results.set(photo.filePath, result);
    } catch {
      // Skip failed photos silently
    }
  }
  onProgress(photos.length, photos.length, "");
  return results;
}
