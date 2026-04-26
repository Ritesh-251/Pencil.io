import { AiServiceEnvSchema } from "@repo/validation";

// types
export type VisionImage = {
  mimeType: string;
  data: string;
};

export type GenerateParams = {
  model: string;
  system: string;
  prompt: string;
  image?: string | VisionImage;
  temperature?: number;
};

export type GenerateResponse = {
  text: string;
  provider: string;
  fallbackReason?: string;
};

export class AiService {
  private config = AiServiceEnvSchema.parse(process.env);
  private discoveredEmbeddingModels: string[] | null = null;

  async embedText(text: string): Promise<number[]> {
    const attempted: string[] = [];
    const candidateModels = Array.from(new Set([
      this.config.GEMINI_EMBED_MODEL,
      "text-embedding-004",
      "gemini-embedding-2",
      ...(this.discoveredEmbeddingModels || []),
    ])).filter(Boolean);

    for (const modelName of candidateModels) {
      attempted.push(modelName);
      try {
        return await this.geminiEmbedWithModel(modelName, text);
      } catch (error: any) {
        if (!/not found|not supported|does not exist/i.test(error.message)) {
          throw error;
        }
      }
    }

    const listedModels = await this.listEmbeddingModels();
    for (const modelName of listedModels) {
      if (attempted.includes(modelName)) continue;
      try {
        return await this.geminiEmbedWithModel(modelName, text);
      } catch { continue; }
    }

    throw new Error(`No supported Gemini embedding model worked. Tried: ${attempted.join(", ")}`);
  }

  private async geminiEmbedWithModel(modelName: string, text: string): Promise<number[]> {
    const payload = await this.geminiRequest(`models/${modelName}:embedContent`, {
      method: "POST",
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: this.config.GEMINI_EMBED_DIMENSION,
      }),
    });

    return payload?.embedding?.values as number[];
  }

  private async listEmbeddingModels(): Promise<string[]> {
    const payload = await this.geminiRequest("models", { method: "GET" });
    const models = Array.isArray(payload?.models) ? payload.models : [];
    this.discoveredEmbeddingModels = models
      .filter((item: any) => item?.supportedGenerationMethods?.includes("embedContent"))
      .map((item: any) => item.name.replace(/^models\//, ""));
    return this.discoveredEmbeddingModels || [];
  }

  async generateWithFallback(params: GenerateParams): Promise<GenerateResponse> {
    const visionImage = typeof params.image === "string" 
      ? await this.normalizeVisionImage(params.image)
      : params.image;

    try {
      const text = await this.geminiGenerate({
        ...params,
        image: visionImage,
      });
      return { text, provider: "gemini" };
    } catch (geminiError: any) {
      console.warn("Gemini failed, falling back to Ollama:", geminiError.message);
      const text = await this.ollamaGenerate({
        ...params,
        image: visionImage,
      });
      return {
        text,
        provider: "ollama",
        fallbackReason: geminiError.message,
      };
    }
  }

  private async geminiGenerate(params: Omit<GenerateParams, "image"> & { image?: VisionImage }): Promise<string> {
    const parts: any[] = [{ text: params.prompt }];
    if (params.image) {
      parts.push({
        inlineData: { mimeType: params.image.mimeType, data: params.image.data }
      });
    }

    const payload = await this.geminiRequest(`models/${params.model}:generateContent`, {
      method: "POST",
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: params.temperature ?? 0.2 },
      }),
    });

    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned empty response");
    return text.trim();
  }

  private async ollamaGenerate(params: Omit<GenerateParams, "image"> & { image?: VisionImage }): Promise<string> {
    const userMessage: any = { role: "user", content: params.prompt };
    if (params.image) userMessage.images = [params.image.data];

    const response = await fetch(`${this.config.OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.OLLAMA_MODEL,
        stream: false,
        options: { temperature: params.temperature ?? 0.2 },
        messages: [{ role: "system", content: params.system }, userMessage],
      }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Ollama request failed");
    return payload?.message?.content?.trim() || "";
  }

  private async geminiRequest(path: string, init: RequestInit) {
    const url = `https://generativelanguage.googleapis.com/v1beta/${path}${path.includes("?") ? "&" : "?"}key=${this.config.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || `Gemini error ${response.status}`);
    return payload;
  }

  private async normalizeVisionImage(image?: string): Promise<VisionImage | undefined> {
    if (!image) return undefined;
    if (/^https?:\/\//i.test(image)) return this.fetchImage(image);
    
    const match = image.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
    if (match) return { mimeType: match[1]!, data: match[2]! };
    
    return { mimeType: "image/png", data: image };
  }

  private async fetchImage(url: string): Promise<VisionImage> {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch image");
    const arrayBuffer = await res.arrayBuffer();
    return {
      mimeType: res.headers.get("content-type") || "image/png",
      data: Buffer.from(arrayBuffer).toString("base64"),
    };
  }
}

export const aiService = new AiService();
