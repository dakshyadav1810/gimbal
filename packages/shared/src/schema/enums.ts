import { z } from "zod";

export const ActionType = z.enum([
  "navigate",
  "click",
  "type",
  "select",
  "keypress",
  "submit",
  "wait",
  "file",
  // Waits for a specific (Tier-1, DOM-blind) target to become resolvable before continuing —
  // unlike "wait" (a fixed duration), this polls the resolver up to a timeout, so it survives
  // variable-latency async rendering (a React.lazy()/Suspense boundary, a slow API-backed
  // dropdown, ...) without hardcoding how long that latency actually is. `value`, if set, is a
  // numeric-string timeout override in ms (default 10000); grounding has no auto-wait polling loop
  // like execution does, so this step exists specifically to give grounding the same resilience.
  "waitForSelector",
]);
export type ActionType = z.infer<typeof ActionType>;

export const StepKind = z.enum(["ui", "api", "db"]);
export type StepKind = z.infer<typeof StepKind>;

export const Generalization = z.enum([
  "same_element",
  "any_matching",
  "aggressive",
  "flexible",
]);
export type Generalization = z.infer<typeof Generalization>;

export const OnFailure = z.enum([
  "abort",
  "continue",
  "retry_once",
  "optional",
]);
export type OnFailure = z.infer<typeof OnFailure>;

export const SignalName = z.enum([
  "semantics",
  "affordance",
  "context",
  "structure",
  "index",
]);
export type SignalName = z.infer<typeof SignalName>;

export const Band = z.enum(["high", "medium", "low"]);
export type Band = z.infer<typeof Band>;

export const ResolutionStatus = z.enum(["grounded", "ungrounded", "stale"]);
export type ResolutionStatus = z.infer<typeof ResolutionStatus>;

export const Score = z.number().min(0).max(1);
export type Score = z.infer<typeof Score>;

// Playwright's getByRole() only recognizes this fixed ARIA role set (its accessibility-tree
// mapping, not the full ARIA spec) — a DOM-blind authoring agent guessing a plausible-but-wrong
// role ("card", "notification") would otherwise pass schema validation and simply never match
// anything at grounding/runtime, with no error surfaced before that point.
export const AriaRole = z.enum([
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "deletion",
  "dialog",
  "directory",
  "document",
  "emphasis",
  "feed",
  "figure",
  "form",
  "generic",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "insertion",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "marquee",
  "math",
  "meter",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "navigation",
  "none",
  "note",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "subscript",
  "superscript",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "time",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem",
]);
export type AriaRole = z.infer<typeof AriaRole>;
