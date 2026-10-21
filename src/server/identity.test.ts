import { describe, expect, it } from "vitest";
import { signId, verifyId } from "./identity";

describe("signed caller ids", () => {
  it("verifies its own signature and rejects another id, another secret or garbage", async () => {
    const sig = await signId("g-abc", "secret-one");
    expect(await verifyId("g-abc", sig, "secret-one")).toBe(true);
    expect(await verifyId("g-abd", sig, "secret-one")).toBe(false);
    expect(await verifyId("g-abc", sig, "secret-two")).toBe(false);
    expect(await verifyId("g-abc", "nope", "secret-one")).toBe(false);
    expect(await verifyId("g-abc", "", "secret-one")).toBe(false);
  });

  it("is url-safe and stable", async () => {
    const a = await signId("o-123", "k");
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await signId("o-123", "k")).toBe(a);
  });
});
