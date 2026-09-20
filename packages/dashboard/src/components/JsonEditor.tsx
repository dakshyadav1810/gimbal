import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";

// Dashboard chrome follows the OS's prefers-color-scheme via Tailwind's dark: classes (no manual
// toggle exists) — CodeMirror needs the same signal explicitly, since it doesn't read CSS media
// queries itself and defaults to a light theme unconditionally otherwise.
function usePrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return prefersDark;
}

type SaveState = "idle" | "saving" | "saved" | "error";

// JSON test editor with shared Zod validation for hand-edits (SPEC-005 §3). Saves via
// PATCH /tests/:id (PLAN-002 Phase A) — previously this control had no save action at all.
export function JsonEditor({ testId }: { testId: string }) {
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const prefersDark = usePrefersDark();
  const queryClient = useQueryClient();

  useEffect(() => {
    api.getTest(testId).then((t) => {
      const json = JSON.stringify(t, null, 2);
      setText(json);
      setSavedText(json);
    });
  }, [testId]);

  const onChange = (value: string) => {
    setText(value);
    setSaveState("idle");
    try {
      JSON.parse(value);
      setParseError(null);
    } catch (e) {
      setParseError(String(e));
    }
  };

  const dirty = text !== savedText;

  const save = async () => {
    setSaveState("saving");
    setSaveError(null);
    try {
      const parsed = JSON.parse(text);
      // The dashboard edits Tier-1 authoring fields (flow/steps) — a GroundedTest response
      // includes runtime resolution data the SpecIR schema doesn't accept, so only the SpecIR
      // shape (flow + steps) is sent back.
      const { flow, steps } = parsed;
      await api.updateSpec(testId, { version: "1.0", flow, steps });
      setSavedText(text);
      setSaveState("saved");
      queryClient.invalidateQueries({ queryKey: ["tests", testId] });
      queryClient.invalidateQueries({ queryKey: ["tests"] });
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <CodeMirror
        value={text}
        height="400px"
        theme={prefersDark ? oneDark : "light"}
        onChange={onChange}
      />
      <div className="flex items-center justify-between border-t border-[var(--border-default)] px-4 py-2.5">
        <div className="text-xs text-[var(--text-tertiary)]">
          {parseError
            ? "Invalid JSON — fix before saving."
            : saveState === "saved" && !dirty
              ? "Saved. Re-ground to apply changes to future runs."
              : dirty
                ? "Unsaved changes."
                : "No changes."}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || !!parseError || saveState === "saving"}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saveState === "saving" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : saveState === "saved" && !dirty ? (
            <Check size={13} />
          ) : null}
          {saveState === "saving" ? "Saving..." : "Save"}
        </button>
      </div>
      {parseError && (
        <div className="border-t border-[var(--border-default)] px-4 py-2 text-xs text-rose-600 dark:text-rose-400">
          {parseError}
        </div>
      )}
      {saveState === "error" && saveError && (
        <div className="border-t border-[var(--border-default)] px-4 py-2 text-xs text-rose-600 dark:text-rose-400">
          Save failed: {saveError}
        </div>
      )}
    </div>
  );
}
