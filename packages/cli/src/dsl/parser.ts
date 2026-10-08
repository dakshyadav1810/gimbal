import type { GeometricType } from "@gimbal/shared";
import { parse } from "yaml";

// ─── Target expression ───────────────────────────────────────────────────────

export interface DslTarget {
  role: string;
  label: string;
}

// Parses expressions like:  button("Sign In")  |  textbox("Email")  |  "Sign In"
// defaultRole is used when the expression is a bare quoted string.
export function parseTargetExpr(expr: string, defaultRole?: string): DslTarget {
  const trimmed = expr.trim();

  // role("label") pattern
  const roleMatch = trimmed.match(/^(\w+)\(\s*"([^"]*)"\s*\)$/);
  if (roleMatch) {
    return { role: roleMatch[1].toLowerCase(), label: roleMatch[2] };
  }

  // bare "label" pattern
  const bareMatch = trimmed.match(/^"([^"]*)"$/);
  if (bareMatch) {
    if (!defaultRole)
      throw new Error(
        `Cannot infer role for bare label "${bareMatch[1]}" — wrap it in a role expression like button("${bareMatch[1]}")`,
      );
    return { role: defaultRole, label: bareMatch[1] };
  }

  throw new Error(`Cannot parse target expression: ${expr}`);
}

// ─── DSL Step types ──────────────────────────────────────────────────────────

export type DslStep =
  | { kind: "navigate"; url: string }
  | { kind: "click"; target: DslTarget }
  | { kind: "type"; target: DslTarget; value: string }
  | { kind: "select"; target: DslTarget; value: string }
  | { kind: "keypress"; key: string }
  | { kind: "submit"; target: DslTarget }
  | { kind: "wait"; ms: number }
  | { kind: "waitForSelector"; target: DslTarget }
  | { kind: "assert"; assertType: "urlContains"; value: string }
  | { kind: "assert"; assertType: "textContains"; value: string }
  | { kind: "assert"; assertType: "visible"; target: DslTarget }
  | { kind: "assert"; assertType: "absent"; target: DslTarget }
  | {
      kind: "assert";
      assertType: "value";
      target: DslTarget;
      expected: string;
    }
  | {
      kind: "assert";
      assertType: "geometric";
      geometricType: GeometricType;
      referenceTarget: DslTarget;
      target?: DslTarget;
    };

// ─── DSL AST ─────────────────────────────────────────────────────────────────

export interface DslAst {
  flow: {
    id: string;
    name: string;
    intent: string;
    startUrl: string;
    vars?: Record<string, string>;
  };
  steps: DslStep[];
}

// ─── Step parsers ────────────────────────────────────────────────────────────

// "Field = \"value\""  →  { field, value }
function parseFieldAssignment(expr: string): { field: string; value: string } {
  const m = expr.match(/^([^=]+?)\s*=\s*"([^"]*)"$/);
  if (!m)
    throw new Error(`Expected "Field = \\"value\\"" syntax but got: ${expr}`);
  return { field: m[1].trim(), value: m[2] };
}

// Parse an assert expression: urlContains("x") | textContains("x") |
//   visible(role("x")) | absent(role("x")) | value(role("x"), "expected")
function parseAssertExpr(expr: string): DslStep & { kind: "assert" } {
  const trimmed = expr.trim();

  const urlMatch = trimmed.match(/^urlContains\("([^"]*)"\)$/);
  if (urlMatch)
    return { kind: "assert", assertType: "urlContains", value: urlMatch[1] };

  const textMatch = trimmed.match(/^textContains\("([^"]*)"\)$/);
  if (textMatch)
    return { kind: "assert", assertType: "textContains", value: textMatch[1] };

  const visibleMatch = trimmed.match(/^visible\((.+)\)$/);
  if (visibleMatch)
    return {
      kind: "assert",
      assertType: "visible",
      target: parseTargetExpr(visibleMatch[1]),
    };

  const absentMatch = trimmed.match(/^absent\((.+)\)$/);
  if (absentMatch)
    return {
      kind: "assert",
      assertType: "absent",
      target: parseTargetExpr(absentMatch[1]),
    };

  // value(role("label"), "expected")
  const valueMatch = trimmed.match(/^value\((.+),\s*"([^"]*)"\)$/);
  if (valueMatch)
    return {
      kind: "assert",
      assertType: "value",
      target: parseTargetExpr(valueMatch[1]),
      expected: valueMatch[2],
    };

  // geometric assertions: rightOf(button("Cancel")), isRightOf(...), below(...), etc.
  const geomMatch = trimmed.match(
    /^(rightOf|isRightOf|leftOf|isLeftOf|above|isAbove|below|isBelow|inside|isInside|alignedHorizontally|isAlignedHorizontally|alignedVertically|isAlignedVertically)\((.+)\)$/,
  );
  if (geomMatch) {
    const fnName = geomMatch[1];
    const inner = geomMatch[2].trim();
    const typeMap: Record<string, GeometricType> = {
      rightOf: "isRightOf",
      isRightOf: "isRightOf",
      leftOf: "isLeftOf",
      isLeftOf: "isLeftOf",
      above: "isAbove",
      isAbove: "isAbove",
      below: "isBelow",
      isBelow: "isBelow",
      inside: "isInside",
      isInside: "isInside",
      alignedHorizontally: "isAlignedHorizontally",
      isAlignedHorizontally: "isAlignedHorizontally",
      alignedVertically: "isAlignedVertically",
      isAlignedVertically: "isAlignedVertically",
    };
    const geometricType = typeMap[fnName];

    // Check for two targets: fn(target, referenceTarget)
    const commaIndex = inner.indexOf('",');
    if (
      commaIndex !== -1 &&
      inner.includes('("') &&
      inner.indexOf('("') < commaIndex
    ) {
      const closingParen = inner.indexOf(")", commaIndex);
      if (closingParen !== -1) {
        const subjectExpr = inner.slice(0, closingParen + 1).trim();
        const refExpr = inner
          .slice(closingParen + 1)
          .replace(/^,\s*/, "")
          .trim();
        if (refExpr) {
          return {
            kind: "assert",
            assertType: "geometric",
            geometricType,
            target: parseTargetExpr(subjectExpr),
            referenceTarget: parseTargetExpr(refExpr),
          };
        }
      }
    }

    return {
      kind: "assert",
      assertType: "geometric",
      geometricType,
      referenceTarget: parseTargetExpr(inner),
    };
  }

  throw new Error(`Cannot parse assert expression: ${expr}`);
}

function parseStep(raw: Record<string, unknown>): DslStep {
  const keys = Object.keys(raw);
  if (keys.length !== 1)
    throw new Error(
      `Each step must have exactly one key, got: ${keys.join(", ")}`,
    );
  const [action] = keys;
  const val = raw[action] as string | number;

  switch (action) {
    case "navigate":
      return { kind: "navigate", url: String(val) };

    case "click": {
      const expr = String(val);
      // bare "text" or role("text")
      const defaultRole = expr.startsWith('"') ? "button" : undefined;
      return { kind: "click", target: parseTargetExpr(expr, defaultRole) };
    }

    case "type": {
      const { field, value } = parseFieldAssignment(String(val));
      return {
        kind: "type",
        target: { role: "textbox", label: field },
        value,
      };
    }

    case "select": {
      const { field, value } = parseFieldAssignment(String(val));
      return {
        kind: "select",
        target: { role: "combobox", label: field },
        value,
      };
    }

    case "keypress":
      return { kind: "keypress", key: String(val) };

    case "submit": {
      const expr = String(val);
      const defaultRole = expr.startsWith('"') ? "button" : undefined;
      return { kind: "submit", target: parseTargetExpr(expr, defaultRole) };
    }

    case "wait":
      return { kind: "wait", ms: Number(val) || 500 };

    case "waitForSelector": {
      const expr = String(val);
      return { kind: "waitForSelector", target: parseTargetExpr(expr) };
    }

    case "assert":
      return parseAssertExpr(String(val));

    default:
      throw new Error(`Unknown step action: "${action}"`);
  }
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseDsl(source: string): DslAst {
  let doc: unknown;
  try {
    doc = parse(source);
  } catch (e) {
    throw new Error(`YAML parse error: ${(e as Error).message}`);
  }

  if (!doc || typeof doc !== "object")
    throw new Error("DSL must be a YAML object at the top level");

  const raw = doc as Record<string, unknown>;

  // Validate flow
  if (!raw.flow || typeof raw.flow !== "object")
    throw new Error('DSL must have a "flow" object');
  const flow = raw.flow as Record<string, unknown>;

  for (const required of ["id", "name", "intent", "startUrl"] as const) {
    if (typeof flow[required] !== "string" || !flow[required])
      throw new Error(
        `flow.${required} is required and must be a non-empty string`,
      );
  }

  // Validate steps
  if (!Array.isArray(raw.steps) || raw.steps.length === 0)
    throw new Error('"steps" must be a non-empty array');

  const steps: DslStep[] = raw.steps.map((s: unknown, i: number) => {
    if (!s || typeof s !== "object")
      throw new Error(`step[${i}] must be an object`);
    try {
      return parseStep(s as Record<string, unknown>);
    } catch (e) {
      throw new Error(`step[${i}]: ${(e as Error).message}`);
    }
  });

  return {
    flow: {
      id: flow.id as string,
      name: flow.name as string,
      intent: flow.intent as string,
      startUrl: flow.startUrl as string,
      vars: (flow.vars as Record<string, string>) ?? {},
    },
    steps,
  };
}
