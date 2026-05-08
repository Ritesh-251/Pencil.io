import { AiServiceEnvSchema } from "@repo/validation";
import { logger } from "../infra/logger";

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
  private _config: any = null;
  private discoveredEmbeddingModels: string[] | null = null;

  private get config() {
    if (!this._config) {
      this._config = AiServiceEnvSchema.parse(process.env);
    }
    return this._config;
  }

  async embedText(text: string): Promise<number[]> {
    const attempted: string[] = [];
    const candidateModels = Array.from(
      new Set([
        this.config.GEMINI_EMBED_MODEL,
        "text-embedding-004",
        "gemini-embedding-2",
      ]),
    ).filter(Boolean);

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

    if (this.discoveredEmbeddingModels === null) {
      await this.listEmbeddingModels();
    }

    for (const modelName of this.discoveredEmbeddingModels || []) {
      if (attempted.includes(modelName)) continue;
      try {
        return await this.geminiEmbedWithModel(modelName, text);
      } catch {
        continue;
      }
    }

    const failedModels = attempted.join(", ");
    throw new Error(
      `No supported Gemini embedding model worked. Tried: ${failedModels || "none"}`,
    );
  }

  private async geminiEmbedWithModel(
    modelName: string,
    text: string,
  ): Promise<number[]> {
    const payload = await this.geminiRequest(
      `models/${modelName}:embedContent`,
      {
        method: "POST",
        body: JSON.stringify({
          content: { parts: [{ text }] },
          outputDimensionality: this.config.GEMINI_EMBED_DIMENSION,
        }),
      },
    );

    const values = payload?.embedding?.values;
    if (!Array.isArray(values)) {
      throw new Error(`Invalid embedding response from model ${modelName}`);
    }
    return values;
  }

  private async listEmbeddingModels(): Promise<string[]> {
    const payload = await this.geminiRequest("models", { method: "GET" });
    const models = Array.isArray(payload?.models) ? payload.models : [];
    this.discoveredEmbeddingModels = models
      .filter((item: any) =>
        item?.supportedGenerationMethods?.includes("embedContent"),
      )
      .map((item: any) => item.name.replace(/^models\//, ""));
    return this.discoveredEmbeddingModels || [];
  }

  async generateWithFallback(
    params: GenerateParams,
  ): Promise<GenerateResponse> {
    const visionImage =
      typeof params.image === "string"
        ? await this.normalizeVisionImage(params.image)
        : params.image;

    try {
      const text = await this.geminiGenerate({
        ...params,
        image: visionImage,
      });
      return { text, provider: "gemini" };
    } catch (geminiError: any) {
      console.warn(
        "Gemini failed, falling back to Ollama:",
        geminiError.message,
      );
      try {
        const text = await this.ollamaGenerate({
          ...params,
          image: visionImage,
        });
        return {
          text,
          provider: "ollama",
          fallbackReason: geminiError.message,
        };
      } catch (ollamaError: any) {
        logger.error(
          { geminiError, ollamaError, model: params.model },
          "Both Gemini and Ollama failed",
        );
        throw new Error(
          `AI services unavailable: Gemini(${geminiError.message}), Ollama(${ollamaError.message})`,
        );
      }
    }
  }

  private async geminiGenerate(
    params: Omit<GenerateParams, "image"> & { image?: VisionImage },
  ): Promise<string> {
    const parts: any[] = [{ text: params.prompt }];
    if (params.image) {
      parts.push({
        inlineData: {
          mimeType: params.image.mimeType,
          data: params.image.data,
        },
      });
    }

    const payload = await this.geminiRequest(
      `models/${params.model}:generateContent`,
      {
        method: "POST",
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: params.system }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: params.temperature ?? 0.2 },
        }),
      },
    );

    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned empty response");
    return text.trim();
  }

  private async ollamaGenerate(
    params: Omit<GenerateParams, "image"> & { image?: VisionImage },
  ): Promise<string> {
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
    if (!response.ok)
      throw new Error(payload?.error || "Ollama request failed");
    return payload?.message?.content?.trim() || "";
  }

  private async geminiRequest(path: string, init: RequestInit) {
    const url = `https://generativelanguage.googleapis.com/v1beta/${path}${path.includes("?") ? "&" : "?"}key=${this.config.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    });

    const payload = await response.json();
    if (!response.ok)
      throw new Error(
        payload?.error?.message || `Gemini error ${response.status}`,
      );
    return payload;
  }

  private async normalizeVisionImage(
    image?: string,
  ): Promise<VisionImage | undefined> {
    if (!image) return undefined;
    if (/^https?:\/\//i.test(image)) {
      const allowedPrefixes = (process.env.IMAGE_CDN_BASE_URL || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const isAllowed = allowedPrefixes.some((prefix) =>
        image.startsWith(prefix),
      );
      if (!isAllowed) {
        logger.warn({ image }, "SSRF attempt: Blocked external image fetch");
        return undefined;
      }
      return this.fetchImage(image);
    }

    const match = image.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
    if (match) return { mimeType: match[1]!, data: match[2]! };

    return { mimeType: "image/png", data: image };
  }

  private async fetchImage(url: string): Promise<VisionImage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      return {
        mimeType: res.headers.get("content-type") || "image/png",
        data: Buffer.from(arrayBuffer).toString("base64"),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const aiService = new AiService();
