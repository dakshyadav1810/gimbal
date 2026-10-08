# Spec format

A test is JSON ("Spec IR") that describes intent. Gimbal turns it into `grounded.json` by finding elements on your running app. You can write the JSON directly or use the YAML DSL, which compiles to it.

## Spec IR

```json
{
  "version": "1.0",
  "flow": { "id": "login", "name": "Log in", "intent": "A user signs in", "startUrl": "http://localhost:3000/login", "vars": { "email": "ada@example.com" } },
  "steps": [
    { "id": "email", "kind": "ui", "action": "type", "value": "${email}", "intent": "enter email",
      "target": { "label": "Email", "role": "textbox", "semantics": ["email", "e-mail address"], "actions": ["type"], "intent": "enter email" } },
    { "id": "submit", "kind": "ui", "action": "click", "intent": "sign in",
      "target": { "label": "Sign in", "role": "button", "semantics": ["sign in", "log in", "continue"], "actions": ["click"], "intent": "sign in" },
      "assertions": [{ "type": "urlContains", "expected": "/dashboard" }] }
  ]
}
```

A target never contains a selector. `semantics` is the field that matters most: list the other words a user might see for the same control. `role` must be a real ARIA role.

Steps are `ui`, `api` or `db`. UI actions: `navigate`, `click`, `type`, `select`, `keypress`, `submit`, `wait`, `waitForSelector`, `file`.

Every spec needs at least one assertion or `expectedOutcome`. Secrets are declared by name in `flow.vars` and supplied at run time.

## Step options

| Field | Meaning |
|---|---|
| `onFailure` | `abort` (default), `continue`, `retry_once`, `optional`. |
| `negative` | The step should be rejected by the app; the verdict is inverted. |
| `preconditions` | `visible`, `enabled`, `modal_open`, `url_contains`. |
| `generalization` | How strictly the target must match: `same_element` (default) is the strictest. |
| `expectedOutcome` | `navigation`, `url_change`, `element_appears`, `text_contains`, `field_contains`. |
| `assertions` | See below. |

## Assertions

`urlContains`, `textContains`, `value`, `elementVisible`, `elementAbsent`, `apiStatus`, `apiBody`, `dbRow`, spatial checks (`isRightOf`, `isLeftOf`, `isAbove`, `isBelow`, `isInside`, `isAlignedHorizontally`, `isAlignedVertically`) and `ariaSnapshot`.

## YAML DSL

```yaml
flow:
  id: login
  name: Log in
  intent: A user signs in
  startUrl: http://localhost:3000/login
steps:
  - navigate: /login
  - type: Email = "ada@example.com"
  - click: button("Sign in")
  - assert: urlContains("/dashboard")
```

An assertion line attaches to the step before it. The DSL covers the common cases; use the JSON for anything it cannot say (for instance, a long `semantics` list).
