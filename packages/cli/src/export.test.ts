import type { GroundedTest } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import { exportToPlaywright } from "./export.js";

const sampleGrounded: GroundedTest = {
  version: "1.0",
  groundedAt: "2026-09-10T00:00:00.000Z",
  groundedUrl: "https://example.com/login",
  flow: {
    id: "login-flow",
    name: "Login Flow",
    intent: "test user login",
    startUrl: "https://example.com/login",
    vars: {},
  },
  steps: [
    {
      id: "s1",
      kind: "ui",
      action: "type",
      intent: "type email",
      value: "user@test.com",
      onFailure: "abort",
      preconditions: [],
      assertions: [],
      expectedOutcome: [],
      negative: false,
      generalization: "same_element",
      target: {
        label: "Email",
        role: "textbox",
        semantics: ["email"],
        actions: ["type"],
        intent: "type email",
        resolution: {
          status: "grounded",
          confidence: 0.95,
          band: "high",
          selected: "c1",
          cachedSelector: "#email",
          winner: null,
        },
      },
    },
    {
      id: "s2",
      kind: "ui",
      action: "click",
      intent: "click submit",
      onFailure: "abort",
      preconditions: [],
      assertions: [
        { type: "urlContains", expected: "/dashboard" },
        { type: "textContains", expected: "Welcome" },
      ],
      expectedOutcome: [],
      negative: false,
      generalization: "same_element",
      target: {
        label: "Sign In",
        role: "button",
        semantics: ["submit"],
        actions: ["click"],
        intent: "click submit",
        resolution: {
          status: "grounded",
          confidence: 0.98,
          band: "high",
          selected: "c2",
          cachedSelector: "button[type='submit']",
          winner: null,
        },
      },
    },
  ],
};

describe("exportToPlaywright", () => {
  it("exports a grounded test to valid Playwright TypeScript syntax", () => {
    const code = exportToPlaywright(sampleGrounded);
    expect(code).toContain('import { test, expect } from "@playwright/test";');
    expect(code).toContain('test.describe("Login Flow", () => {');
    expect(code).toContain('await page.goto("https://example.com/login"');
    expect(code).toContain('await page.locator("#email").fill("user@test.com");');
    expect(code).toContain('await page.locator("button[type=\'submit\']").click();');
    expect(code).toContain('await expect(page).toHaveURL(new RegExp("/dashboard"));');
    expect(code).toContain('await expect(page.locator("body")).toContainText("Welcome");');
  });
});
