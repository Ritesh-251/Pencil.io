import { z } from "zod";

export const CanvasBaseSchema = z.object({
  id: z.string().optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  rotation: z.number().finite().min(-3600).max(3600).optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  scaleX: z.number().finite().gt(0).max(100).optional(),
  scaleY: z.number().finite().gt(0).max(100).optional(),
});

export const StrokeSchema = CanvasBaseSchema.extend({
  type: z.literal("stroke"),
  points: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .min(1)
    .max(5000),
  color: z.string().min(1),
  width: z.number().gt(0),
});

export const RectSchema = CanvasBaseSchema.extend({
  type: z.literal("rect"),
  width: z.number().gt(0),
  height: z.number().gt(0),
  color: z.string().optional(),
  fill: z.string().optional(),
  strokeWidth: z.number().optional(),
});

export const EllipseSchema = CanvasBaseSchema.extend({
  type: z.literal("ellipse"),
  width: z.number().gt(0),
  height: z.number().gt(0),
  color: z.string().optional(),
  fill: z.string().optional(),
  strokeWidth: z.number().optional(),
});

export const LineSchema = CanvasBaseSchema.extend({
  type: z.literal("line"),
  points: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
  color: z.string().optional(),
  width: z.number().optional(),
});

export const ArrowSchema = LineSchema.extend({
  type: z.literal("arrow"),
});

export const ImageSchema = CanvasBaseSchema.extend({
  type: z.literal("image"),
  url: z.string().url().max(2048).optional(),
  src: z.string().max(2048).optional(),
  width: z.number().gt(0).optional(),
  height: z.number().gt(0).optional(),
}).refine((data) => data.url || data.src, {
  message: "image url or src is required",
});

export const StickySchema = CanvasBaseSchema.extend({
  type: z.literal("sticky"),
  text: z.string().min(1).max(2000),
});

export const FrameSchema = CanvasBaseSchema.extend({
  type: z.literal("frame"),
  width: z.number().gt(0),
  height: z.number().gt(0),
});

export const TextSchema = CanvasBaseSchema.extend({
  type: z.literal("text"),
  text: z.string().min(1).max(1000),
});

export const CanvasObjectSchema = z.discriminatedUnion("type", [
  StrokeSchema,
  RectSchema,
  EllipseSchema,
  LineSchema,
  ArrowSchema,
  ImageSchema,
  StickySchema,
  FrameSchema,
  TextSchema,
]);

export type CanvasObject = z.infer<typeof CanvasObjectSchema>;
