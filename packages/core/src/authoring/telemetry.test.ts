import { describe, expect, it } from "vitest";
import type { DomCandidate } from "../resolver/base.js";
import { computeDomDiff } from "./telemetry.js";

describe("computeDomDiff", () => {
  it("correctly computes DomDiff arrays when comparing base DOM to one containing a newly injected modal", () => {
    const baseCandidates: DomCandidate[] = [
      {
        id: "cand_0",
        selector: "#open-settings",
        tag: "button",
        role: "button",
        label: "Open Settings",
        xpath: "/html/body/div/button[1]",
      },
      {
        id: "cand_1",
        selector: "#nav-home",
        tag: "a",
        role: "link",
        label: "Home",
        xpath: "/html/body/nav/a",
      },
    ];

    const afterCandidates: DomCandidate[] = [
      {
        id: "cand_1",
        selector: "#nav-home",
        tag: "a",
        role: "link",
        label: "Home",
        xpath: "/html/body/nav/a",
      },
      {
        id: "cand_2",
        selector: "#settings-dialog",
        tag: "div",
        role: "dialog",
        label: "Settings",
        region: "modal",
        xpath: "/html/body/div[2]",
      },
      {
        id: "cand_3",
        selector: "#save-btn",
        tag: "button",
        role: "button",
        label: "Save",
        xpath: "/html/body/div[2]/button",
      },
    ];

    const diff = computeDomDiff(baseCandidates, afterCandidates);

    expect(diff).toContain("+ modal 'Settings'");
    expect(diff).toContain("+ button 'Save'");
    expect(diff).toContain("- button 'Open Settings'");
    expect(diff).toHaveLength(3);
  });

  it("returns empty diff when candidate sets are identical", () => {
    const candidates: DomCandidate[] = [
      {
        id: "cand_0",
        selector: "#submit",
        tag: "button",
        role: "button",
        label: "Submit",
        testId: "submit-btn",
      },
    ];

    const diff = computeDomDiff(candidates, candidates);
    expect(diff).toEqual([]);
  });
});
