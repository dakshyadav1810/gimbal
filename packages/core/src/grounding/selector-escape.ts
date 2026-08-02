// Node-side escaping for selector fragments built from untrusted DOM values (ids, data-testid,
// attribute values). Mirrors the CSSOM `CSS.escape` algorithm, which has no Node global equivalent.
export function cssEscape(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const code = value.charCodeAt(i);

    if (code === 0x0000) {
      result += "�";
      continue;
    }
    if (
      (code >= 0x0001 && code <= 0x001f) ||
      code === 0x007f ||
      (i === 0 && code >= 0x0030 && code <= 0x0039) ||
      (i === 1 &&
        code >= 0x0030 &&
        code <= 0x0039 &&
        value.charCodeAt(0) === 0x002d)
    ) {
      result += `\\${code.toString(16)} `;
      continue;
    }
    if (i === 0 && char === "-" && value.length === 1) {
      result += `\\${char}`;
      continue;
    }
    if (
      code >= 0x0080 ||
      char === "-" ||
      char === "_" ||
      (code >= 0x0030 && code <= 0x0039) ||
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a)
    ) {
      result += char;
      continue;
    }
    result += `\\${char}`;
  }
  return result;
}

// XPath has no native escape/quoting function; wrap values that contain a double quote using
// concat() so an embedded quote can't terminate the string literal early.
export function xpathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  const parts = value.split('"').map((part) => `"${part}"`);
  return `concat(${parts.join(", '\"', ")})`;
}
