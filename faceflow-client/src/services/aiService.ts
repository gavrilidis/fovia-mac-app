import { invoke } from "@tauri-apps/api/core";

const API_PROVIDER_STORAGE = "faceflow-ai-provider";
const API_MODEL_STORAGE = "faceflow-ai-model";

export type AIProvider = "openai" | "anthropic" | "gemini" | "qwen" | "grok";

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
    id: "qwen",
    name: "Qwen",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-vl-plus",
    models: ["qwen-vl-max", "qwen-vl-plus"],
  },
  {
    id: "grok",
    name: "Grok",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-vision-1212",
    models: ["grok-2-vision-1212"],
  },
];

const API_KEY_NAMES: Record<AIProvider, string> = {
  openai: "api_key_openai",
  anthropic: "api_key_anthropic",
  gemini: "api_key_gemini",
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
  const cfg = providerConfig(provider);

  if (provider === "gemini") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": trimmed },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Reply OK" }] }], generationConfig: { maxOutputTokens: 4 } }),
      },
    );
    if (!response.ok) throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
    return;
  }

  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": trimmed,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model, max_tokens: 4, messages: [{ role: "user", content: "Reply OK" }] }),
    });
    if (!response.ok) throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
    return;
  }

  // OpenAI-compatible providers (OpenAI, Qwen, Grok)
  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${trimmed}` },
    body: JSON.stringify({ model, max_tokens: 4, messages: [{ role: "user", content: "Reply OK" }] }),
  });
  if (!response.ok) throw new Error(`Provider API error: ${response.status} ${await response.text()}`);
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
              text: 'Analyze this photo. Return a JSON object with two fields: "tags" (array of 10-20 descriptive keywords — include BOTH English AND Russian for each concept, e.g. "man", "мужчина", "outdoor", "на улице". Cover: scene type, objects, people descriptions, activities, colors, emotions, weather, time of day, location type) and "description" (one sentence English description). Return ONLY valid JSON, no markdown.',
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
              text: 'Analyze this photo. Return a JSON object with two fields: "tags" (array of 10-20 descriptive keywords — include BOTH English AND Russian for each concept, e.g. "man", "мужчина", "outdoor", "на улице". Cover: scene type, objects, people descriptions, activities, colors, emotions, weather, time of day, location type) and "description" (one sentence English description). Return ONLY valid JSON, no markdown.',
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
              {
                text: 'Analyze this photo. Return a JSON object with two fields: "tags" (array of 10-20 descriptive keywords — include BOTH English AND Russian for each concept, e.g. "man", "мужчина", "outdoor", "на улице". Cover: scene type, objects, people descriptions, activities, colors, emotions, weather, time of day, location type) and "description" (one sentence English description). Return ONLY valid JSON, no markdown.',
              },
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

// ---------------------------------------------------------------------------
// Quality analysis: blur / closed-eyes / off-frame detection
// ---------------------------------------------------------------------------

export interface AiQualityResult {
  is_blurry: boolean;
  closed_eyes: boolean;
  out_of_focus: boolean;
  bad_composition: boolean;
  reason: string;
}

const QUALITY_PROMPT =
  'Analyze this photo and respond with ONLY valid JSON (no markdown). Schema: {"is_blurry": boolean, "closed_eyes": boolean, "out_of_focus": boolean, "bad_composition": boolean, "reason": "short English explanation"}. is_blurry=true if image is shaky/motion-blurred. closed_eyes=true if any visible main subject has eyes shut. out_of_focus=true if main subject is not in focus. bad_composition=true if subject is awkwardly cut off or off-frame.';

export async function analyzeQuality(base64Image: string): Promise<AiQualityResult> {
  const provider = getAiProvider();
  const model = getAiModel(provider);
  const apiKey = await getAiApiKey(provider);
  if (!apiKey) throw new Error("AI API key not configured");
  const raw = await callVisionModel(provider, model, apiKey, base64Image, QUALITY_PROMPT, 200);
  return parseQualityResponse(raw);
}

function parseQualityResponse(content: string): AiQualityResult {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Failed to parse AI quality response");
  const parsed = JSON.parse(m[0]) as Partial<AiQualityResult>;
  return {
    is_blurry: !!parsed.is_blurry,
    closed_eyes: !!parsed.closed_eyes,
    out_of_focus: !!parsed.out_of_focus,
    bad_composition: !!parsed.bad_composition,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
  };
}

// ---------------------------------------------------------------------------
// Person merge suggestion: ask vision model whether two faces are same person
// ---------------------------------------------------------------------------

export interface AiMergeDecision {
  same_person: boolean;
  confidence: number;
  reason: string;
}

const MERGE_PROMPT =
  'You are comparing two photos that may show the same person at different angles, lighting, or moments. Look at face structure, hair, clothing, accessories, and any other distinctive features. Respond with ONLY valid JSON (no markdown): {"same_person": boolean, "confidence": number 0-1, "reason": "short English explanation"}. Be permissive: if facial features look similar enough that a human reviewer would say "yes, probably same person", say true.';

export async function compareTwoFaces(
  base64A: string,
  base64B: string,
): Promise<AiMergeDecision> {
  const provider = getAiProvider();
  const model = getAiModel(provider);
  const apiKey = await getAiApiKey(provider);
  if (!apiKey) throw new Error("AI API key not configured");
  const raw = await callVisionModelTwoImages(provider, model, apiKey, base64A, base64B, MERGE_PROMPT, 200);
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Failed to parse AI merge response");
  const parsed = JSON.parse(m[0]) as Partial<AiMergeDecision>;
  return {
    same_person: !!parsed.same_person,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
  };
}

// ---------------------------------------------------------------------------
// Internal: low-level vision-model callers (single + paired image)
// ---------------------------------------------------------------------------

async function callVisionModel(
  provider: AIProvider,
  model: string,
  apiKey: string,
  base64Image: string,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  if (provider === "anthropic") {
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
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? "";
  }
  if (provider === "gemini") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: "image/jpeg", data: base64Image } },
              ],
            },
          ],
        }),
      },
    );
    if (!response.ok) throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
  // OpenAI-compatible
  const cfg = providerConfig(provider);
  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "low" } },
          ],
        },
      ],
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) throw new Error(`Provider API error: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

async function callVisionModelTwoImages(
  provider: AIProvider,
  model: string,
  apiKey: string,
  base64A: string,
  base64B: string,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  if (provider === "anthropic") {
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
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64A } },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64B } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? "";
  }
  if (provider === "gemini") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: "image/jpeg", data: base64A } },
                { inline_data: { mime_type: "image/jpeg", data: base64B } },
              ],
            },
          ],
        }),
      },
    );
    if (!response.ok) throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
  const cfg = providerConfig(provider);
  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64A}`, detail: "low" } },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64B}`, detail: "low" } },
          ],
        },
      ],
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) throw new Error(`Provider API error: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}
