// Browser-side mutations. Each runs after the fixture's own script, so window.__targets holds the
// real element objects. Ground truth lives in those objects and in the click listeners the fixture
// registered, never in DOM attributes the resolver could read.
export type Truth = "same" | "removed" | "ambiguous";

export interface Mutation {
  name: string;
  truth: Truth;
  // Source of a function body: (el, t, seed) => void, where t is the target's JSON entry.
  script: string;
}

export const MUTATIONS: Mutation[] = [
  {
    name: "class-rename",
    truth: "same",
    script: `el.removeAttribute("id"); el.className = "x" + seed + "-" + Math.abs(seed * 7919);`,
  },
  {
    name: "wrapper-insert",
    truth: "same",
    script: `el.removeAttribute("id"); const w = document.createElement("div"); w.className = "wrap" + seed; el.replaceWith(w); w.appendChild(el);`,
  },
  {
    name: "label-synonym",
    truth: "same",
    script: `el.removeAttribute("id"); setLabel(el, t.synonym);`,
  },
  {
    name: "label-i18n",
    truth: "same",
    script: `el.removeAttribute("id"); setLabel(el, t.i18n);`,
  },
  {
    name: "reorder",
    truth: "same",
    script: `el.removeAttribute("id"); const p = el.parentElement; p.insertBefore(el, p.firstElementChild);`,
  },
  {
    name: "duplicate-added",
    truth: "ambiguous",
    script: `el.removeAttribute("id"); const d = el.cloneNode(true); d.addEventListener("click", (e) => { e.preventDefault(); window.__hit("decoy"); }); el.after(d);`,
  },
  {
    name: "removed",
    truth: "removed",
    script: "el.remove();",
  },
];
