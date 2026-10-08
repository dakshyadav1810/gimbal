export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
  fix?: string;
}

export function checkNode(version = process.versions.node): Check {
  const major = Number(version.split(".")[0]);
  return {
    name: `Node ${major}`,
    ok: major >= 22,
    detail:
      major >= 22
        ? undefined
        : `Gimbal needs Node 22 or newer, found ${version}`,
    fix: "install Node 22+ (https://nodejs.org) and rerun",
  };
}

export async function checkUrl(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<Check> {
  const name = `Target application (${url})`;
  try {
    await fetchFn(url, { signal: AbortSignal.timeout(4000) });
    return { name, ok: true };
  } catch {
    return {
      name,
      ok: false,
      detail: "nothing answered",
      fix: "start your app, or pass the right address with --url",
    };
  }
}

export function formatReport(checks: Check[]): string {
  const lines = ["Gimbal Doctor"];
  for (const c of checks) {
    lines.push(`${c.ok ? "✓" : "✗"} ${c.name}`);
    if (!c.ok) {
      if (c.detail) lines.push(`    ${c.detail}`);
      if (c.fix) lines.push(`    fix: ${c.fix}`);
    }
  }
  const bad = checks.filter((c) => !c.ok).length;
  lines.push(
    bad === 0 ? "Ready." : `Not ready: ${bad} problem${bad > 1 ? "s" : ""}.`,
  );
  return lines.join("\n");
}
