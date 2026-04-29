import { CanvasAction } from "../events/canvas/canvas.types";
import { CanvasObjectSchema } from "@repo/validation";

function isAllowedImageUrl(url: string): boolean {
  const raw = process.env.CDN_URL || process.env.IMAGE_CDN_BASE_URL || "";
  const prefixes = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (prefixes.length === 0) return false;

  return prefixes.some((prefix) => {
    if (url === prefix) return true;
    if (prefix.endsWith("/")) return url.startsWith(prefix);
    return url.startsWith(prefix + "/");
  });
}

function getShapeProps(data: any): any {
  if (
    data?.props &&
    typeof data.props === "object" &&
    !Array.isArray(data.props)
  ) {
    return data.props;
  }
  return data;
}

export class CanvasService {
  validateObject(action: CanvasAction, data: any): string | null {
    if (!action) return "Action is required";

    const shape = getShapeProps(data);
    const result = CanvasObjectSchema.safeParse(shape);

    if (!result.success) {
      return result.error.issues[0]?.message || "Invalid object data";
    }

    const validated = result.data;

    if (validated.type === "image") {
      const imageUrl = validated.url || validated.src;
      if (imageUrl) {
        const lowerUrl = imageUrl.toLowerCase();
        if (
          lowerUrl.startsWith("data:") ||
          lowerUrl.startsWith("javascript:")
        ) {
          return "image url is not allowed";
        }
        if (!isAllowedImageUrl(imageUrl)) {
          return "image url is outside allowed CDN";
        }
      }
    }

    return null;
  }
}

export const canvasService = new CanvasService();
