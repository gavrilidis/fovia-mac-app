const API_KEY_STORAGE = "faceflow-ai-api-key";
const API_PROVIDER_STORAGE = "faceflow-ai-provider";

export type AiProvider = "openai" | "anthropic";

export function getAiApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? "";
}

export function setAiApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function getAiProvider(): AiProvider {
  return (localStorage.getItem(API_PROVIDER_STORAGE) as AiProvider) ?? "openai";
}

export function setAiProvider(provider: AiProvider): void {
  localStorage.setItem(API_PROVIDER_STORAGE, provider);
}

export function isAiConfigured(): boolean {
  return getAiApiKey().length > 0;
}

interface AiTagResult {
  tags: string[];
  description: string;
}

export async function analyzePhoto(base64Image: string): Promise<AiTagResult> {
  const apiKey = getAiApiKey();
  const provider = getAiProvider();

  if (!apiKey) {
    throw new Error("AI API key not configured");
  }

  if (provider === "openai") {
    return analyzeWithOpenAI(apiKey, base64Image);
  }
  return analyzeWithAnthropic(apiKey, base64Image);
}

async function analyzeWithOpenAI(apiKey: string, base64Image: string): Promise<AiTagResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
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
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseAiResponse(content);
}

async function analyzeWithAnthropic(apiKey: string, base64Image: string): Promise<AiTagResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
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
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "";
  return parseAiResponse(content);
}

function parseAiResponse(content: string): AiTagResult {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response");
  }
  const parsed = JSON.parse(jsonMatch[0]);
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
