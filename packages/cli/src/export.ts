import type { GroundedTest, GroundedUiStep } from "@gimbal/shared";

// Translates a grounded Gimbal test into a standard, standalone @playwright/test TypeScript file.
// Invariant #2: JSON remains the primary execution format; this provides CI offramps and export portability.
export function exportToPlaywright(test: GroundedTest): string {
  const lines: string[] = [
    'import { test, expect } from "@playwright/test";',
    "",
    `test.describe("${test.flow.name.replace(/"/g, '\\"')}", () => {`,
    `  test("${(test.flow.intent || test.flow.name).replace(/"/g, '\\"')}", async ({ page }) => {`,
    "    // Initial navigation",
    `    await page.goto("${test.flow.startUrl}", { waitUntil: "domcontentloaded" });`,
    "",
  ];

  for (const step of test.steps) {
    lines.push(`    // Step ${step.id}: ${step.intent}`);
    if (step.kind !== "ui") {
      lines.push(`    // (${step.kind} step export deferred)`);
      lines.push("");
      continue;
    }

    const ui = step as GroundedUiStep;
    const sel = ui.target?.resolution?.cachedSelector;

    switch (ui.action) {
      case "navigate":
        lines.push(
          `    await page.goto("${ui.value || test.flow.startUrl}", { waitUntil: "domcontentloaded" });`,
        );
        break;
      case "wait":
        lines.push(
          `    await page.waitForTimeout(${Number(ui.value) || 500});`,
        );
        break;
      case "click":
        if (sel) {
          lines.push(`    await page.locator(${JSON.stringify(sel)}).click();`);
        }
        break;
      case "type":
        if (sel) {
          lines.push(
            `    await page.locator(${JSON.stringify(sel)}).fill(${JSON.stringify(ui.value || "")});`,
          );
        }
        break;
      case "select":
        if (sel) {
          lines.push(
            `    await page.locator(${JSON.stringify(sel)}).selectOption(${JSON.stringify(ui.value || "")});`,
          );
        }
        break;
      case "keypress":
        if (sel) {
          lines.push(
            `    await page.locator(${JSON.stringify(sel)}).press(${JSON.stringify(ui.value || "Enter")});`,
          );
        }
        break;
      case "submit":
        if (sel) {
          lines.push(
            `    await page.locator(${JSON.stringify(sel)}).press("Enter");`,
          );
        }
        break;
    }

    for (const a of ui.assertions) {
      switch (a.type) {
        case "urlContains":
          lines.push(
            `    await expect(page).toHaveURL(new RegExp(${JSON.stringify(a.expected)}));`,
          );
          break;
        case "textContains":
          lines.push(
            `    await expect(page.locator("body")).toContainText(${JSON.stringify(a.expected)});`,
          );
          break;
        case "elementVisible":
          if (sel) {
            lines.push(
              `    await expect(page.locator(${JSON.stringify(sel)})).toBeVisible();`,
            );
          }
          break;
        case "elementAbsent":
          if (sel) {
            lines.push(
              `    await expect(page.locator(${JSON.stringify(sel)})).toBeHidden();`,
            );
          }
          break;
        case "value":
          if (sel) {
            lines.push(
              `    await expect(page.locator(${JSON.stringify(sel)})).toHaveValue(${JSON.stringify(a.expected)});`,
            );
          }
          break;
        default:
          break;
      }
    }

    lines.push("");
  }

  lines.push("  });");
  lines.push("});");
  lines.push("");

  return lines.join("\n");
}
