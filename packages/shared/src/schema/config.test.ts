import { describe, expect, it } from "vitest";
import { GimbalConfig } from "./config.js";

describe("GimbalConfig.bands", () => {
  it("defaults to high:0.7/medium:0.5 when omitted", () => {
    const config = GimbalConfig.parse({});
    expect(config.bands).toEqual({ high: 0.7, medium: 0.5 });
  });

  it("accepts a custom bands config where high > medium", () => {
    const config = GimbalConfig.parse({ bands: { high: 0.9, medium: 0.4 } });
    expect(config.bands).toEqual({ high: 0.9, medium: 0.4 });
  });

  it("rejects a bands config where high <= medium (would silently invert confidence semantics)", () => {
    expect(() => GimbalConfig.parse({ bands: { high: 0.5, medium: 0.5 } })).toThrow();
    expect(() => GimbalConfig.parse({ bands: { high: 0.4, medium: 0.6 } })).toThrow();
  });
});
