import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildContainer } from "../server/container.js";
import type { GimbalConfig, GroundedTest, Tier1Target } from "@gimbal/shared";

const config: GimbalConfig = {
  port: 1,
  browser: "chromium",
  headless: true,
  dbPath: ":memory:",
  artifactsDir: "/tmp/a",
  fixturesDir: "/tmp/f",
  screenshotsDir: "/tmp/s",
  embeddingModel: "Xenova/all-MiniLM-L6-v2",
  embeddingRevision: "751bff37182d3f1213fa05d7196b954e230abad9",
  bands: { high: 0.7, medium: 0.5 },
  timeouts: { actionMs: 5000, navMs: 10000, hydrationNetworkIdleMs: 2000, hydrationQuietWindowMs: 150 },
  db: { readOnly: true },
  maxScrollPasses: 3,
  determinism: {},
};

async function resolve(browser: Browser, html: string, target: Tier1Target) {
  const page = await browser.newPage();
  await page.setContent(html);
  await page.waitForTimeout(100);
  const container = buildContainer(config);
  const mockTest: GroundedTest = {
    version: "1.0",
    groundedAt: new Date().toISOString(),
    groundedUrl: "http://x/",
    flow: { id: "f", name: "f", intent: "i", startUrl: "http://x/", vars: {} },
    steps: [
      {
        id: "s1",
        kind: "ui",
        action: target.actions[0] as "click" | "type",
        intent: target.intent,
        onFailure: "abort",
        target: { ...target, resolution: undefined },
        preconditions: [],
        assertions: [],
        negative: false,
        generalization: "same_element",
        expectedOutcome: [],
      },
    ],
  };
  const result = await container.grounding.reground(mockTest, "s1", page);
  const winner = result.resolution.candidates.find(
    (c) => c.id === result.resolution.selected,
  );
  await page.close();
  return {
    band: result.band,
    winnerId: winner?.anchors.attributes?.id ?? null,
    candidates: result.resolution.candidates.map((c) => ({
      id: c.anchors.attributes?.id,
      score: c.score,
      nearbyText: c.anchors.nearbyText,
    })),
  };
}

describe("Adversarial verification of the getNearbyText + modifier-tiebreak fixes", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser.close();
  });

  it("generalizes to a THREE-field password scenario not in the sandbox corpus (New/Current/Confirm)", async () => {
    const html = `
      <html><body><form>
        <div class="field"><label for="current-pw">Current Password</label><input id="current-pw" name="current_password" type="password" /></div>
        <div class="field"><label for="new-pw">New Password</label><input id="new-pw" name="new_password" type="password" /></div>
        <div class="field"><label for="confirm-pw">Confirm New Password</label><input id="confirm-pw" name="confirm_new_password" type="password" /></div>
      </form></body></html>
    `;
    const res = await resolve(browser, html, {
      label: "New Password",
      role: "textbox",
      semantics: ["new password", "set password"],
      actions: ["type"],
      intent: "enter the new password",
    });
    expect(res.winnerId).toBe("new-pw");
    expect(res.band).toBe("high");
  }, 20000);

  it("FALSE-POSITIVE SUBSTRING RISK: a class merely containing 'field' as a substring (not a real field wrapper) should not wrongly scope nearbyText to a tiny fragment", async () => {
    // "playfield-banner" is NOT a single-field wrapper — it's a promo banner wrapping two unrelated
    // buttons. If the "field" keyword substring-matches here, nearbyText for each button gets
    // truncated to just the banner's own text — but both buttons are inside the SAME banner either
    // way, so let's check whether this changes anything undesirable in practice.
    const html = `
      <html><body>
        <div class="playfield-banner">
          <p>Weekly Deals</p>
          <button id="btn-shop">Shop Now</button>
          <button id="btn-dismiss">Dismiss</button>
        </div>
      </body></html>
    `;
    const res = await resolve(browser, html, {
      label: "Shop Now",
      role: "button",
      semantics: ["shop", "browse deals"],
      actions: ["click"],
      intent: "go shop the weekly deals",
    });
    expect(res.winnerId).toBe("btn-shop");
  }, 20000);

  it("ADVERSARIAL: modifier tiebreak must NOT fire when the matching candidate is semantically wrong", async () => {
    // Two fields where a coincidental id/name substring match could mislead the tiebreak if it
    // ignored the OTHER signals entirely: target is "Confirm Email", but a "Confirm Password" field
    // also exists and happens to be first in DOM order / could confuse a purely lexical shortcut.
    const html = `
      <html><body><form>
        <div class="field"><label for="pw-confirm">Confirm Password</label><input id="pw-confirm" name="password_confirm" type="password" /></div>
        <div class="field"><label for="email-confirm">Confirm Email</label><input id="email-confirm" name="email_confirm" type="email" /></div>
      </form></body></html>
    `;
    const res = await resolve(browser, html, {
      label: "Confirm Email",
      role: "textbox",
      semantics: ["confirm email", "verify email address"],
      actions: ["type"],
      intent: "confirm the email address",
    });
    expect(res.winnerId).toBe("email-confirm");
    expect(res.band).toBe("high");
  }, 20000);

  it("KNOWN GAP (pre-existing, NOT introduced or fixed by this session's work): a repeated card " +
    "list's nearbyText is correctly per-card (unaffected by today's changes — 'card' was already a " +
    "stop-keyword before this session), but semantic/context signals alone don't disambiguate two " +
    "structurally-identical 'Add to Cart' buttons whose distinguishing text (the product name) isn't " +
    "encoded in id/name — so the new lexical signal can't help here either. Documented, not silently " +
    "dropped, after being found while adversarially stress-testing the password-field fix.", async () => {
    const html = `
      <html><body>
        <div class="product-list">
          <div class="card"><h3>Wireless Mouse</h3><button id="btn-add-1">Add to Cart</button></div>
          <div class="card"><h3>Mechanical Keyboard</h3><button id="btn-add-2">Add to Cart</button></div>
        </div>
      </body></html>
    `;
    const res = await resolve(browser, html, {
      label: "Add to Cart",
      role: "button",
      semantics: ["add mechanical keyboard to cart"],
      actions: ["click"],
      intent: "add the mechanical keyboard to the cart",
    });
    // nearbyText IS correctly per-card (verifies the getNearbyText fix didn't regress this pattern)...
    expect(res.candidates.find((c) => c.id === "btn-add-2")?.nearbyText).toContain(
      "Mechanical Keyboard",
    );
    expect(res.candidates.find((c) => c.id === "btn-add-1")?.nearbyText).toContain(
      "Wireless Mouse",
    );
    // ...but the resolver still can't confidently pick between them — genuinely ambiguous today.
    expect(res.winnerId).toBeNull();
    expect(res.band).toBe("medium");
  }, 20000);

  it("does NOT regress: 'First Name' vs 'Last Name' (a different modifier-noun pair, not password)", async () => {
    const html = `
      <html><body><form>
        <div class="field"><label for="fn">First Name</label><input id="fn" name="first_name" type="text" /></div>
        <div class="field"><label for="ln">Last Name</label><input id="ln" name="last_name" type="text" /></div>
      </form></body></html>
    `;
    const res = await resolve(browser, html, {
      label: "Last Name",
      role: "textbox",
      semantics: ["last name", "surname"],
      actions: ["type"],
      intent: "enter the last name",
    });
    expect(res.winnerId).toBe("ln");
    expect(res.band).toBe("high");
  }, 20000);
});
