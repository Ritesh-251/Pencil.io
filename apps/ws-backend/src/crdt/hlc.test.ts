import { describe, it, expect, beforeEach } from "vitest";
import { generateHLC, compareLogicalTimestamp, LogicalTimestamp } from "./hlc";

describe("HLC (Hybrid Logical Clock)", () => {
  it("should generate monotonic timestamps", () => {
    const actorId = "user-1";
    const ts1 = generateHLC(actorId);
    const ts2 = generateHLC(actorId);

    expect(ts2.time).toBeGreaterThan(ts1.time);
    expect(ts1.actorId).toBe(actorId);
    expect(ts2.actorId).toBe(actorId);
  });

  it("should compare timestamps correctly based on time", () => {
    const t1: LogicalTimestamp = { time: 100, actorId: "a" };
    const t2: LogicalTimestamp = { time: 200, actorId: "b" };

    expect(compareLogicalTimestamp(t1, t2)).toBeLessThan(0);
    expect(compareLogicalTimestamp(t2, t1)).toBeGreaterThan(0);
  });

  it("should compare timestamps correctly based on actorId if time is equal", () => {
    const t1: LogicalTimestamp = { time: 100, actorId: "a" };
    const t2: LogicalTimestamp = { time: 100, actorId: "b" };

    expect(compareLogicalTimestamp(t1, t2)).toBeLessThan(0);
    expect(compareLogicalTimestamp(t2, t1)).toBeGreaterThan(0);
  });

  it("should return 0 for identical timestamps", () => {
    const t1: LogicalTimestamp = { time: 100, actorId: "a" };
    const t2: LogicalTimestamp = { time: 100, actorId: "a" };

    expect(compareLogicalTimestamp(t1, t2)).toBe(0);
  });
});
