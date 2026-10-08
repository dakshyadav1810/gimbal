# Page snapshots

`getPage` gives an agent a shallow, honest picture of a page before it writes a test: the controls on it, by role and accessible name, the region they are in, test ids, and disabled state.

## What it is

An observation. Gimbal records one while grounding (it already has the page open) and when you ask for a refresh. Each snapshot says when it was captured, whether the browser was logged in, and a short fingerprint of the DOM. The last three per page are kept under `.gimbal/snapshots/`, which `gimbal init` git-ignores.

## What it is not

- Not the whole app. Logged-out and logged-in views, open dialogs and different data are different pages that nobody may have visited. The response says so.
- Not a source of selectors. Agents describe targets by meaning; grounding finds the element.
- Not a place for secrets. Input values, URL query strings and fragments, and ARIA text are never stored.

If a page was never observed, `getPage` opens it. If your app is not running, it tells you to start it.
