import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState } from "react";
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

// JSON test editor with shared Zod validation for hand-edits (SPEC-005 §3).
export function JsonEditor({ testId }: { testId: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const prefersDark = usePrefersDark();

  useEffect(() => {
    api.getTest(testId).then((t) => setText(JSON.stringify(t, null, 2)));
  }, [testId]);

  const onChange = (value: string) => {
    setText(value);
    try {
      JSON.parse(value);
      setError(null);
    } catch (e) {
      setError(String(e));
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
      {error && (
        <div className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
