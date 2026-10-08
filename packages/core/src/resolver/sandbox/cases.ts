import type { SandboxCase } from "./types.js";

export const sandboxCases: SandboxCase[] = [
  // 1-8: Simple Scenarios
  {
    id: "exact-match",
    name: "Exact Match",
    description:
      "Matches the target element exactly on label, role, and actions.",
    target: {
      label: "Submit Search",
      role: "button",
      semantics: ["submit", "search"],
      actions: ["click"],
      intent: "submit query",
    },
    html: `
      <html>
        <body>
          <div id="container">
            <button id="search-btn">Submit Search</button>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: "search-btn",
    expectedBand: "high",
  },
  {
    id: "semantic-drift-synonyms",
    name: "Semantic Drift (Synonyms)",
    description:
      "Matches when target element's label changes to a close synonym.",
    target: {
      label: "Sign In",
      role: "button",
      semantics: ["login", "sign in", "authenticate"],
      actions: ["click"],
      intent: "log into dashboard",
    },
    html: `
      <html>
        <body>
          <div id="container">
            <button id="login-btn">Log In</button>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: "login-btn",
    expectedBand: "high",
  },
  {
    id: "attribute-drift",
    name: "Attribute Drift",
    description:
      "Matches when ID, class, and context change, but label remains the same.",
    target: {
      label: "Add to Cart",
      role: "button",
      semantics: ["purchase", "buy", "cart"],
      actions: ["click"],
      intent: "add product to shopping bag",
    },
    html: `
      <html>
        <body>
          <div class="completely-different-container">
            <button id="btn-drifted-id-xyz-999" class="random-class-123">Add to Cart</button>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: "btn-drifted-id-xyz-999",
    expectedBand: "high",
  },
  {
    id: "affordance-gating",
    name: "Affordance Gating",
    description:
      "Filters out non-interactive elements even if they have matching text.",
    target: {
      label: "Save Draft",
      role: "button",
      semantics: ["save", "draft", "store"],
      actions: ["click"],
      intent: "save document",
    },
    html: `
      <html>
        <body>
          <div>
            <!-- DIV has matching text, but lacks button affordance -->
            <div id="wrong-div-affordance">Save Draft</div>
            <button id="correct-btn-affordance">Save Draft</button>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: "correct-btn-affordance",
    expectedBand: "high",
  },
  {
    id: "index-tiebreak-same-parent",
    name: "Index Tie-Breaking (Same Parent)",
    description:
      "Resolves duplicate elements sharing a parent using DOM/sibling index.",
    target: {
      label: "Remove",
      role: "button",
      semantics: ["delete", "remove"],
      actions: ["click"],
      intent: "remove item",
    },
    html: `
      <html>
        <body>
          <div id="actions-group">
            <button id="btn-remove-1">Remove</button>
            <button id="btn-remove-2">Remove</button>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: "btn-remove-1",
    expectedBand: "high",
  },
  {
    id: "anchor-preference-different-parents",
    name: "Anchor Preference (Durable Test ID)",
    description:
      "Selects correct duplicate element using data-testid anchor when parents differ.",
    target: {
      label: "Remove",
      role: "button",
      semantics: ["delete", "remove"],
      actions: ["click"],
      intent: "remove item",
    },
    html: `
      <html>
        <body>
          <div>
            <div id="row-1">
              <button id="btn-remove-a">Remove</button>
            </div>
            <div id="row-2">
              <button id="btn-remove-b" data-testid="target-btn">Remove</button>
            </div>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: "btn-remove-b",
    expectedBand: "high",
  },
  {
    id: "context-drift-nearby-text",
    name: "Context Drift (Nearby Text)",
    description:
      "Selects correct element using surrounding/nearby context text.",
    generalization: "any_matching",
    target: {
      label: "Save",
      role: "button",
      semantics: ["save", "submit"],
      actions: ["click"],
      intent: "save account settings",
    },
    html: `
      <html>
        <body>
          <div>
            <div id="section-1">
              <p>Theme Settings</p>
              <button id="btn-theme-save">Save</button>
            </div>
            <form id="section-2">
              <p>Account Settings</p>
              <button id="btn-account-save">Save</button>
            </form>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: "btn-account-save",
    expectedBand: "high",
  },
  {
    id: "stale-escalation-zero-candidates",
    name: "Stale Escalation",
    description:
      "Escalates to low confidence / ungrounded when element is completely gone.",
    target: {
      label: "Delete Account",
      role: "button",
      semantics: ["delete", "account"],
      actions: ["click"],
      intent: "delete user account",
    },
    html: `
      <html>
        <body>
          <div id="container">
            <p>Account is active. There are no delete buttons here.</p>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: null,
    expectedBand: "low",
  },

  // 9-13: High-Fidelity "Dirty Production" Scenarios
  {
    id: "ecommerce-checkout-drift",
    name: "E-Commerce Checkout Form Drift",
    description:
      "Evaluates form restructuring, CSS-in-JS utility class drift, and label synonym mapping.",
    generalization: "any_matching",
    target: {
      label: "Place Order",
      role: "button",
      semantics: ["place order", "checkout", "submit", "pay"],
      actions: ["click"],
      intent: "complete transaction",
    },
    html: `
      <html>
        <body>
          <div class="checkout-layout css-container-1a2b">
            <!-- Dirty nested markup structure -->
            <div class="form-wrapper css-wrapper-3c4d">
              <form id="checkout-form-drifted">
                <div class="field-group">
                  <!-- Implicit label wrap pattern common in production -->
                  <label class="css-label-hash">
                    <span class="label-text">Credit Card Number</span>
                    <input type="text" placeholder="Card number" class="css-input-x9y8">
                  </label>
                </div>
                
                <div class="action-bar css-actions-7e8f">
                  <!-- Synonym label change, random ID, and CSS-in-JS styled classes -->
                  <button id="button-css-9a1b" class="btn-primary css-button-hash sc-bdvvtL">
                    Proceed to Payment
                  </button>
                </div>
              </form>
            </div>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: "button-css-9a1b",
    expectedBand: "high",
  },
  {
    id: "crm-grid-sibling-shuffle",
    name: "CRM Grid Sibling Shuffle",
    description:
      "Resolves rows containing duplicate buttons by Jaccard nearbyText matching after a grid shuffle.",
    generalization: "flexible",
    target: {
      label: "Edit",
      role: "button",
      semantics: ["edit", "update", "modify"],
      actions: ["click"],
      intent: "edit customer Jane Doe",
    },
    html: `
      <html>
        <body>
          <div class="table-container">
            <div class="row header">
              <span>Name</span><span>Status</span><span>Actions</span>
            </div>
            
            <!-- Target Row (Jane Doe) shifted down in DOM order with extra wrappers -->
            <div class="row customer-row css-row-xyz" data-row-id="202">
              <div class="cell"><span class="name-text">Jane Doe</span></div>
              <div class="cell"><span class="badge active">Active</span></div>
              <div class="cell">
                <div class="btn-group">
                  <button id="btn-edit-jane" class="action-btn edit css-btn-99">Edit</button>
                  <button id="btn-del-jane" class="action-btn delete css-btn-98">Delete</button>
                </div>
              </div>
            </div>

            <!-- Sibling Row (John Doe) shifted up -->
            <div class="row customer-row css-row-abc" data-row-id="101">
              <div class="cell"><span class="name-text">John Doe</span></div>
              <div class="cell"><span class="badge pending">Pending</span></div>
              <div class="cell">
                <div class="btn-group">
                  <button id="btn-edit-john" class="action-btn edit css-btn-99">Edit</button>
                  <button id="btn-del-john" class="action-btn delete css-btn-98">Delete</button>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: "btn-edit-jane",
    expectedBand: "high",
  },
  {
    id: "svg-icon-button",
    name: "SVG Icon Button Resolution",
    description:
      "Propagates accessible names correctly from SVG aria-labels inside textless icon buttons.",
    target: {
      label: "Delete Account",
      role: "button",
      semantics: ["delete", "remove", "trash"],
      actions: ["click"],
      intent: "terminate account",
    },
    html: `
      <html>
        <body>
          <div class="profile-settings">
            <!-- Button has no inner text node, but contains SVG with aria-label -->
            <button id="icon-del-btn" class="btn-danger-styled">
              <svg width="24" height="24" viewBox="0 0 24 24" aria-label="Delete Account">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"></path>
              </svg>
            </button>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: "icon-del-btn",
    expectedBand: "high",
  },
  {
    id: "shadow-dom-piercing",
    name: "Shadow DOM Piercing",
    description:
      "Pierce Shadow Roots of web components to find and resolve custom element targets.",
    target: {
      label: "Confirm Settings",
      role: "button",
      semantics: ["confirm", "save", "apply"],
      actions: ["click"],
      intent: "confirm workspace settings",
    },
    html: `
      <html>
        <body>
          <div id="settings-workspace">
            <x-workspace id="workspace-element"></x-workspace>
          </div>
          
          <script>
            // Programmatically inject shadow DOM to simulate dynamic web component templates
            const host = document.getElementById('workspace-element');
            const shadowRoot = host.attachShadow({ mode: 'open' });
            shadowRoot.innerHTML = \`
              <div class="shadow-inner">
                <button id="shadow-confirm-btn">Confirm Settings</button>
              </div>
            \`;
          </script>
        </body>
      </html>
    `,
    expectedWinnerId: "shadow-confirm-btn",
    expectedBand: "high",
  },
  {
    id: "spa-tab-visibility",
    name: "SPA Tab Pane Visibility Gate",
    description:
      "Verifies hidden elements on inactive tabs are ignored in favor of visible button targets.",
    target: {
      label: "Save Settings",
      role: "button",
      semantics: ["save", "submit"],
      actions: ["click"],
      intent: "save security preferences",
    },
    html: `
      <html>
        <body>
          <div id="tabs">
            <!-- Inactive Billing Tab (hidden in DOM) -->
            <div id="tab-billing" style="display: none;">
              <button id="btn-save-billing-inactive">Save Settings</button>
            </div>
            
            <!-- Active Security Tab (visible in DOM) -->
            <div id="tab-security" style="display: block;">
              <button id="btn-save-security-active">Save Settings</button>
            </div>
          </div>
        </body>
      </html>
    `,
    expectedWinnerId: "btn-save-security-active",
    expectedBand: "high",
  },
  {
    id: "volatile-id-resilience",
    name: "Volatile ID Resilience (React useId)",
    description:
      "Resolves an input whose id is a React useId() pattern that would shift across renders. " +
      "The resolver must find it via semantic/label signals rather than the unstable id anchor.",
    target: {
      label: "Email",
      role: "textbox",
      semantics: ["email", "e-mail", "email address"],
      actions: ["type"],
      intent: "enter email address",
    },
    html: `
      <html><body>
        <form>
          <div>
            <label for=":r3:">Email</label>
            <input id=":r3:" type="email" placeholder="Enter your email" />
          </div>
          <div>
            <label for=":r4:">Password</label>
            <input id=":r4:" type="password" placeholder="Enter your password" />
          </div>
        </form>
      </body></html>
    `,
    expectedWinnerId: ":r3:",
    expectedBand: "high",
  },
  {
    id: "floating-label-spatial",
    name: "Floating Label Spatial Proximity",
    description:
      "Resolves an input field associated with a floating label via geometric proximity " +
      "(the label is positioned above the input in the DOM, with no for/id linkage). " +
      "Tagged known-gap as of Phase 1: this pre-dates and is independent of this phase's " +
      "changes — confirmed by re-running with resolver/base.ts, resolver/signals/affordance.ts " +
      "and resolver/signals/context.ts reset to HEAD, which still fails identically. " +
      "resolver/signals/spatial.ts and spatial.test.ts are untracked, in-progress work " +
      "(not part of Phase 1) that appears incomplete for this scenario today.",
    tags: ["known-gap", "spatial"],
    target: {
      label: "Password",
      role: "textbox",
      semantics: ["password", "passcode", "secret"],
      actions: ["type"],
      intent: "enter password",
    },
    html: `
      <html><body>
        <form>
          <div class="float-field">
            <span class="float-label">Password</span>
            <input id="password-input" type="password" />
          </div>
          <div class="float-field">
            <span class="float-label">Username</span>
            <input id="username-input" type="text" />
          </div>
        </form>
      </body></html>
    `,
    expectedWinnerId: "password-input",
    expectedBand: "high",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Framework markup noise: Vue scoped-style attrs, Angular _ngcontent attrs,
  // and more React useId variations.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "vue-scoped-attrs-clean",
    name: "Vue Scoped Attribute Noise (Clean)",
    description:
      "Matches a button decorated with Vue's data-v-* scoped-style attribute noise.",
    tags: ["vue", "framework-noise"],
    difficulty: "clean",
    target: {
      label: "Add to Cart",
      role: "button",
      semantics: ["add to cart", "purchase", "buy"],
      actions: ["click"],
      intent: "add product to cart",
    },
    html: `
      <html><body>
        <div data-v-3f8a2b1c class="product-card">
          <button id="add-cart-btn" data-v-3f8a2b1c class="btn-primary">Add to Cart</button>
        </div>
      </body></html>
    `,
    expectedWinnerId: "add-cart-btn",
    expectedBand: "high",
  },
  {
    id: "vue-scoped-attrs-duplicate",
    name: "Vue Scoped Attribute Noise (Duplicate Buttons)",
    description:
      "Resolves the correct duplicate button among Vue components sharing the same data-v-* hash, using data-testid as the durable anchor.",
    tags: ["vue", "framework-noise"],
    difficulty: "dirty",
    target: {
      label: "Edit",
      role: "button",
      semantics: ["edit", "update"],
      actions: ["click"],
      intent: "edit the second list item",
    },
    html: `
      <html><body>
        <ul data-v-9c1a2d3e class="item-list">
          <li data-v-9c1a2d3e>
            <span>Item One</span>
            <button id="edit-item-one" data-v-9c1a2d3e class="edit-btn">Edit</button>
          </li>
          <li data-v-9c1a2d3e>
            <span>Item Two</span>
            <button id="edit-item-two" data-v-9c1a2d3e data-testid="edit-item-two" class="edit-btn">Edit</button>
          </li>
        </ul>
      </body></html>
    `,
    expectedWinnerId: "edit-item-two",
    expectedBand: "high",
    generalization: "flexible",
  },
  {
    id: "angular-ngcontent-clean",
    name: "Angular _ngcontent Attribute Noise (Clean)",
    description:
      "Matches a form field decorated with Angular's _ngcontent-*/_nghost-* view-encapsulation attributes.",
    tags: ["angular", "framework-noise"],
    difficulty: "clean",
    target: {
      label: "Search",
      role: "textbox",
      semantics: ["search", "query", "find"],
      actions: ["type"],
      intent: "search the catalog",
    },
    html: `
      <html><body>
        <div _nghost-abc-1 class="search-bar">
          <input _ngcontent-abc-1 id="search-input" type="text" placeholder="Search" />
        </div>
      </body></html>
    `,
    expectedWinnerId: "search-input",
    expectedBand: "high",
  },
  {
    id: "angular-ngcontent-duplicate",
    name: "Angular _ngcontent Attribute Noise (Duplicate Rows)",
    description:
      "Two rows with identical labels differentiated only by nearby text ('Acme Corp' vs 'Globex Inc'). " +
      "Verified against the real resolver: today it lands on medium confidence with no clear " +
      "winner rather than confidently picking the Acme Corp row — recorded as the honest baseline.",
    tags: ["angular", "framework-noise"],
    difficulty: "dirty",
    target: {
      label: "Archive",
      role: "button",
      semantics: ["archive", "store"],
      actions: ["click"],
      intent: "archive the invoice for Acme Corp",
    },
    html: `
      <html><body>
        <div _nghost-xyz-9 class="invoice-list">
          <div _ngcontent-xyz-9 class="invoice-row">
            <span _ngcontent-xyz-9>Globex Inc</span>
            <button _ngcontent-xyz-9 id="archive-globex" class="archive-btn">Archive</button>
          </div>
          <div _ngcontent-xyz-9 class="invoice-row">
            <span _ngcontent-xyz-9>Acme Corp</span>
            <button _ngcontent-xyz-9 id="archive-acme" class="archive-btn">Archive</button>
          </div>
        </div>
      </body></html>
    `,
    expectedWinnerId: null,
    expectedBand: "medium",
    generalization: "any_matching",
  },
  {
    id: "react-useid-duplicate-inputs",
    name: "React useId Duplicate Volatile-ID Inputs",
    description:
      "Two password-type inputs with distinct labels ('New Password' vs 'Confirm Password'), " +
      "neither with a stable id. The input labelled exactly 'Confirm Password' is the answer; " +
      "before the unique exact-name rule the resolver could not separate the two near-identical " +
      '`type="password"` fields and lowered the band instead.',
    tags: ["react", "framework-noise"],
    difficulty: "dirty",
    target: {
      label: "Confirm Password",
      role: "textbox",
      semantics: ["confirm password", "repeat password"],
      actions: ["type"],
      intent: "confirm the new password",
    },
    html: `
      <html><body>
        <form>
          <div>
            <label for=":ra:">New Password</label>
            <input id=":ra:" type="password" />
          </div>
          <div>
            <label for=":rb:">Confirm Password</label>
            <input id=":rb:" type="password" />
          </div>
        </form>
      </body></html>
    `,
    expectedWinnerId: ":rb:",
    expectedBand: "high",
  },
  {
    id: "mixed-framework-attrs-microfrontend",
    name: "Mixed Framework Attribute Noise (Micro-Frontend)",
    description:
      "Matches a target inside a page composed of both Vue and Angular widgets (micro-frontend composition), each contributing their own scoping attributes.",
    tags: ["vue", "angular", "framework-noise"],
    difficulty: "dirty",
    target: {
      label: "Submit Feedback",
      role: "button",
      semantics: ["submit", "feedback", "send"],
      actions: ["click"],
      intent: "submit user feedback",
    },
    html: `
      <html><body>
        <div _nghost-a1-b2 class="shell">
          <div _ngcontent-a1-b2 class="widget-slot">
            <div data-v-7d8e9f01 class="feedback-widget">
              <textarea data-v-7d8e9f01 placeholder="Your feedback"></textarea>
              <button id="submit-feedback-btn" data-v-7d8e9f01 class="btn">Submit Feedback</button>
            </div>
          </div>
        </div>
      </body></html>
    `,
    expectedWinnerId: "submit-feedback-btn",
    expectedBand: "high",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Dynamically-shifting nearby text: stresses affordance/context signals
  // under drift between grounding time and re-resolution time.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "nearby-text-minor-drift",
    name: "Nearby Text Minor Drift",
    description:
      "Resolves a button whose sibling label text has been reworded slightly since grounding.",
    generalization: "any_matching",
    tags: ["forms", "nearby-text-drift"],
    target: {
      label: "Save",
      role: "button",
      semantics: ["save", "submit"],
      actions: ["click"],
      intent: "save the notification preferences",
    },
    html: `
      <html><body>
        <form>
          <p>Manage your notification settings below</p>
          <button id="save-notifications-btn">Save</button>
        </form>
      </body></html>
    `,
    expectedWinnerId: "save-notifications-btn",
    expectedBand: "high",
  },
  {
    id: "nearby-text-major-drift-duplicate-buttons",
    name: "Nearby Text Major Drift with Duplicate Buttons",
    description:
      "Resolves the correct 'Save' button between two sections whose nearby heading text has drifted substantially from the originally-grounded copy. " +
      "Verified against the real resolver: today it lands on medium confidence with no clear " +
      "winner between the two sections rather than confidently picking the billing one — " +
      "recorded as the honest baseline.",
    generalization: "any_matching",
    tags: ["forms", "nearby-text-drift"],
    target: {
      label: "Save",
      role: "button",
      semantics: ["save", "submit"],
      actions: ["click"],
      intent: "save the billing address",
    },
    html: `
      <html><body>
        <div>
          <section id="shipping-section">
            <h2>Where should we send your package?</h2>
            <button id="save-shipping-btn">Save</button>
          </section>
          <section id="billing-section">
            <h2>Update your payment address</h2>
            <button id="save-billing-btn">Save</button>
          </section>
        </div>
      </body></html>
    `,
    expectedWinnerId: null,
    expectedBand: "medium",
  },
  {
    id: "nearby-text-truncated",
    name: "Nearby Text Truncated at Grounding Time",
    description:
      "Resolves a button whose nearby label text is now CSS-truncated with an ellipsis, shortening the visible/aria-relevant text.",
    tags: ["forms", "nearby-text-drift"],
    target: {
      label: "Remove",
      role: "button",
      semantics: ["remove", "delete"],
      actions: ["click"],
      intent: "remove the attached file",
    },
    html: `
      <html><body>
        <div class="attachment-row">
          <span class="filename" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">quarterly-financial-report-fin...</span>
          <button id="remove-attachment-btn">Remove</button>
        </div>
      </body></html>
    `,
    expectedWinnerId: "remove-attachment-btn",
    expectedBand: "high",
  },
  {
    id: "nearby-text-reordered-siblings",
    name: "Nearby Text Reordered Siblings",
    description:
      "Resolves a target whose sibling elements have been reordered (e.g. icon moved after label instead of before) without changing the underlying meaning. " +
      "Verified against the real resolver: it does pick the right checkbox, but only at medium " +
      "confidence, not high — recorded as the honest baseline.",
    tags: ["forms", "nearby-text-drift"],
    target: {
      label: "Notifications",
      role: "checkbox",
      semantics: ["notifications", "alerts"],
      actions: ["click"],
      intent: "toggle notification preference",
    },
    html: `
      <html><body>
        <div class="settings-row">
          <input id="notif-toggle" type="checkbox" />
          <span>Notifications</span>
          <span class="badge">New</span>
        </div>
      </body></html>
    `,
    expectedWinnerId: "notif-toggle",
    expectedBand: "medium",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Stacked / nested modals.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "two-layer-modal",
    name: "Two-Layer Stacked Modal",
    description:
      "Resolves a confirm button inside a modal that is itself opened on top of another modal. " +
      "The label is near a duplicate across the two layers ('Delete Item' trigger vs " +
      "'Confirm Delete' target); the single button named exactly 'Confirm Delete' is the answer.",
    tags: ["modal"],
    target: {
      label: "Confirm Delete",
      role: "button",
      semantics: ["confirm", "delete"],
      actions: ["click"],
      intent: "confirm deletion in the nested confirmation dialog",
    },
    html: `
      <html><body>
        <div id="edit-modal" role="dialog" class="modal">
          <h2>Edit Item</h2>
          <button id="open-delete-confirm">Delete Item</button>
          <div id="confirm-delete-modal" role="dialog" class="modal modal-nested">
            <p>Are you sure you want to delete this item?</p>
            <button id="confirm-delete-btn">Confirm Delete</button>
            <button id="cancel-delete-btn">Cancel</button>
          </div>
        </div>
      </body></html>
    `,
    expectedWinnerId: "confirm-delete-btn",
    expectedBand: "high",
  },
  {
    id: "three-layer-modal",
    name: "Three-Layer Stacked Modal",
    description:
      "Resolves a target three modal layers deep (settings modal -> permissions modal -> revoke-access confirmation modal).",
    tags: ["modal"],
    target: {
      label: "Revoke Access",
      role: "button",
      semantics: ["revoke", "remove access"],
      actions: ["click"],
      intent: "revoke access in the innermost confirmation dialog",
    },
    html: `
      <html><body>
        <div id="settings-modal" role="dialog" class="modal">
          <h2>Workspace Settings</h2>
          <div id="permissions-modal" role="dialog" class="modal modal-nested">
            <h3>Manage Permissions</h3>
            <div id="revoke-modal" role="dialog" class="modal modal-nested-2">
              <p>Revoke this user's access?</p>
              <button id="revoke-access-btn">Revoke Access</button>
            </div>
          </div>
        </div>
      </body></html>
    `,
    expectedWinnerId: "revoke-access-btn",
    expectedBand: "high",
  },
  {
    id: "modal-duplicate-buttons-across-layers",
    name: "Duplicate Labels Across Modal Layers",
    description:
      "An identical 'Close' label appears in both the outer and inner modal layers; intent names the " +
      "inner ('preview') modal. Verified against the real resolver: it confidently (high band) " +
      "picks the OUTER close button instead — the resolver has no signal today for 'nearest " +
      "enclosing modal wins on a stacked-dialog tie', so it falls back to DOM/document order. " +
      "Tagged known-gap with the CORRECT (inner) answer below: this is the same root cause as the " +
      "`region` field being dropped when DomCandidate maps to the persisted Candidate schema " +
      "(resolver/index.ts) — see Decision Point #1 — since a surviving region tag is what a " +
      "modal-depth tie-breaker would need to prefer the innermost dialog.",
    generalization: "any_matching",
    tags: ["modal", "known-gap"],
    target: {
      label: "Close",
      role: "button",
      semantics: ["close", "dismiss"],
      actions: ["click"],
      intent: "close the inner preview modal",
    },
    html: `
      <html><body>
        <div id="gallery-modal" role="dialog" class="modal">
          <button id="close-gallery-btn" data-testid="close-outer">Close</button>
          <div id="preview-modal" role="dialog" class="modal modal-nested">
            <img src="photo.jpg" alt="Preview" />
            <button id="close-preview-btn" data-testid="close-inner">Close</button>
          </div>
        </div>
      </body></html>
    `,
    expectedWinnerId: "close-preview-btn",
    expectedBand: "high",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Type-based differentiation (Phase 4 target). Honest expected values below
  // reflect what the resolver ACTUALLY resolves today, not the ideal answer.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "password-vs-confirm-password",
    name: "Password vs Confirm Password",
    description:
      "Two password inputs with near-identical labels/nearby text, differentiated by a modifier " +
      "word ('Confirm') rather than type alone (both share type=password). Fixed via two changes: " +
      "(1) a getNearbyText() bug where climbing from the input into the shared <form> (rather than " +
      "stopping at the per-field wrapper div) gave both fields identical nearbyText; (2) a " +
      "distinguishing-modifier keyword check (resolver/lexical.ts) — both a reward-only structure.ts " +
      "bonus and a banding.ts tiebreak rule — that rewards a candidate whose id/name contains every " +
      "word in the target label BEFORE its head noun (e.g. 'confirm' in 'Confirm Password'), since " +
      "the head noun itself is shared by every sibling field and isn't distinguishing. Verified: " +
      "resolves at high confidence, 100% score.",
    tags: ["form", "type-differentiation"],
    difficulty: "dirty",
    target: {
      label: "Confirm Password",
      role: "textbox",
      semantics: ["confirm password", "repeat password", "verify password"],
      actions: ["type"],
      intent: "confirm the new password",
    },
    html: `
      <html><body>
        <form>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" />
          </div>
          <div class="field">
            <label for="password-confirm">Confirm Password</label>
            <input id="password-confirm" name="password_confirmation" type="password" />
          </div>
        </form>
      </body></html>
    `,
    expectedWinnerId: "password-confirm",
    expectedBand: "high",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Known gaps: honest, CORRECT expected answers for capabilities that do not
  // exist yet in packages/core/src. These are expected to FAIL today and are
  // exercised only via `it.todo` in sandbox.test.ts — Phase 2+ turns them
  // into real assertions as each capability lands.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "aria-labelledby-to-aria-label",
    name: "Nested aria-labelledby Resolving Through aria-label",
    description:
      "Target's accessible name comes from aria-labelledby pointing at an element whose OWN only " +
      "name source is aria-label (no text content). Phase 4a: dom-extractor.ts's " +
      "accessibleName()/resolveLabelledBy() now recurses into the referenced element's own " +
      "accessible-name computation (aria-label, then its own aria-labelledby, then content, " +
      "depth-capped at 4). Verified: resolves correctly at high band.",
    tags: ["accname"],
    target: {
      label: "Close Panel",
      role: "button",
      semantics: ["close", "dismiss", "close panel"],
      actions: ["click"],
      intent: "close the side panel",
    },
    html: `
      <html><body>
        <div id="panel-heading" aria-label="Close Panel"></div>
        <button id="close-panel-btn" aria-labelledby="panel-heading"></button>
      </body></html>
    `,
    expectedWinnerId: "close-panel-btn",
    expectedBand: "high",
  },
  {
    id: "iframe-target",
    name: "Target Inside an iframe",
    description:
      "Target element lives inside a same-origin <iframe>. Phase 2a: extractCandidates() " +
      "(grounding/candidate.ts) now walks page.frames() and tags results with `frame`, and " +
      "execution/locate.ts's seed path scopes the locator to that frame. Grounding/resolution now " +
      "resolves this correctly (verified: high band, correct winner). NOTE: auto-wait.ts's layout- " +
      "stability polling (getBoundingBox) still assumes the main document, so full end-to-end " +
      "execution through the dispatcher for an iframe target is not yet fully wired — only the " +
      "grounding/resolution path this sandbox harness exercises is confirmed.",
    tags: ["iframe"],
    target: {
      label: "Submit Payment",
      role: "button",
      semantics: ["submit", "payment", "pay"],
      actions: ["click"],
      intent: "submit the embedded payment form",
    },
    html: `
      <html><body>
        <div id="payment-widget">
          <iframe id="payment-frame" src="/case/frame" title="Payment"></iframe>
        </div>
      </body></html>
    `,
    frameHtml: `
      <html><body>
        <form>
          <input type="text" placeholder="Card number" />
          <button id="submit-payment-btn">Submit Payment</button>
        </form>
      </body></html>
    `,
    expectedWinnerId: "submit-payment-btn",
    expectedBand: "high",
  },
  {
    id: "popup-new-tab-target",
    name: "Target Only Exists After a Popup/New Tab Opens",
    description:
      "Models a flow where the target only exists in a popup/new browser tab opened by a prior " +
      "step (e.g. an OAuth consent screen). Neither the resolver nor the execution adapters " +
      "(grep confirms no popup/new-tab page tracking in packages/core/src/execution) currently " +
      "track additional pages/tabs — grounding only ever looks at the single `page` it's given. " +
      "This harness has one shared page/context, so we can't actually open a second tab and hand " +
      "it to reground() without building the popup capability itself. Kept minimal: the fixture " +
      "simply doesn't render the target on the current page, and the honest expectation is that " +
      "the resolver reports low/ungrounded rather than crashing or false-positiving on decoys — " +
      "NOT a 'correct' winner, since there is no way for today's single-page harness to reach one.",
    tags: ["known-gap", "popup"],
    target: {
      label: "Authorize",
      role: "button",
      semantics: ["authorize", "grant access", "allow"],
      actions: ["click"],
      intent: "authorize the OAuth consent screen in the popup window",
    },
    html: `
      <html><body>
        <div id="main-app">
          <button id="connect-account-btn">Connect Account</button>
          <p>Clicking "Connect Account" opens a popup window with the OAuth consent screen, which is not modeled in this single-page harness.</p>
        </div>
      </body></html>
    `,
    expectedWinnerId: null,
    expectedBand: "low",
  },
  {
    id: "virtualized-list-scroll",
    name: "Virtualized List Row Behind Scroll",
    description:
      "Target row is not in the initial DOM — it is only rendered after scrolling a windowed/" +
      "virtualized list container far enough that the row's position enters the render window. " +
      "Simulated here with a minimal inline virtualization: a fixed-height scroll container whose " +
      "script re-renders visible rows based on scrollTop. The preAction hook scrolls the container " +
      "before reground() runs, exercising the harness's new preAction capability end-to-end. " +
      "Confirmed via a standalone Playwright check that the preAction hook itself works correctly: " +
      "after the scroll, #row-open-47 (and 11 sibling rows, 43-54) are genuinely present in the " +
      "DOM by the time reground() would run. The resolver still lands on medium confidence with no " +
      "clear winner — because virtualization typically renders a window of ~12 rows at once, all " +
      "sharing the identical 'Open' label, and today's context/nearby-text signal doesn't reliably " +
      "disambiguate 'Row 47' from its 11 visible siblings at that scale (the CRM-grid case, by " +
      "contrast, only has 2 duplicate candidates). Kept as known-gap: the honest fix likely needs " +
      "both virtualization-aware scrolling during authoring/grounding AND better duplicate-label " +
      "disambiguation under many (not just 2) candidates.",
    tags: ["known-gap", "virtualization"],
    target: {
      label: "Open",
      role: "button",
      semantics: ["open", "view"],
      actions: ["click"],
      intent: "open row 47",
    },
    html: `
      <html><body>
        <div id="viewport" style="height:200px;overflow-y:scroll;position:relative;">
          <div id="spacer" style="height:2000px;position:relative;"></div>
        </div>
        <script>
          const ROW_HEIGHT = 40;
          const TOTAL_ROWS = 100;
          const viewport = document.getElementById('viewport');
          const spacer = document.getElementById('spacer');
          function render() {
            spacer.innerHTML = '';
            const scrollTop = viewport.scrollTop;
            const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
            const last = Math.min(TOTAL_ROWS, first + 12);
            for (let i = first; i < last; i++) {
              const row = document.createElement('div');
              row.style.position = 'absolute';
              row.style.top = (i * ROW_HEIGHT) + 'px';
              row.style.height = ROW_HEIGHT + 'px';
              row.innerHTML = '<span>Row ' + i + '</span> <button id="row-open-' + i + '">Open</button>';
              spacer.appendChild(row);
            }
          }
          viewport.addEventListener('scroll', render);
          render();
        </script>
      </body></html>
    `,
    preAction: async (page) => {
      // Scroll far enough that row 47 (index 47 * 40px = 1880px) enters the render window.
      await page.evaluate(() => {
        const viewport = document.getElementById("viewport");
        if (viewport) viewport.scrollTop = 1800;
      });
      // Let the scroll listener re-render the visible rows.
      await page.waitForTimeout(100);
    },
    expectedWinnerId: "row-open-47",
    expectedBand: "high",
  },
  {
    id: "file-input-upload",
    name: "File Input Target",
    description:
      'Target is an <input type="file"> control. There is no upload/setFiles action kind anywhere ' +
      "in packages/core/src/execution (grep confirms no setInputFiles/upload handling), so even " +
      "once located, nothing in the execution layer knows how to act on it. This case records the " +
      "resolution-time expectation (the file input should still be located as a candidate) so " +
      "Phase 2+ can add the corresponding action kind and re-check both halves.",
    tags: ["known-gap", "file-input"],
    target: {
      label: "Upload Resume",
      role: "button",
      semantics: ["upload", "resume", "attach file"],
      actions: ["click"],
      intent: "upload a resume file",
    },
    html: `
      <html><body>
        <form>
          <label for="resume-upload">Upload Resume</label>
          <input id="resume-upload" type="file" accept=".pdf,.docx" />
        </form>
      </body></html>
    `,
    expectedWinnerId: "resume-upload",
    expectedBand: "high",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Additional dirty production-style scenarios.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "dynamic-badge-count-drift",
    name: "Dynamic Badge Count Drift",
    description:
      "Resolves a button whose nearby badge count text has changed since grounding (e.g. cart item count).",
    tags: ["nearby-text-drift"],
    target: {
      label: "View Cart",
      role: "button",
      semantics: ["cart", "view cart", "checkout"],
      actions: ["click"],
      intent: "view shopping cart",
    },
    html: `
      <html><body>
        <button id="view-cart-btn">View Cart <span class="badge">(7)</span></button>
      </body></html>
    `,
    expectedWinnerId: "view-cart-btn",
    expectedBand: "high",
  },
  {
    id: "multi-language-locale-attr",
    name: "Multi-Language Locale Attribute Noise",
    description:
      "Resolves a button with a non-English label under an element carrying a lang attribute, verifying semantic matching isn't purely ASCII/English-keyed.",
    tags: ["i18n"],
    target: {
      label: "Enviar",
      role: "button",
      semantics: ["submit", "send", "enviar"],
      actions: ["click"],
      intent: "submit the Spanish-localized form",
    },
    html: `
      <html lang="en"><body>
        <form lang="es">
          <input type="text" placeholder="Nombre" />
          <button id="enviar-btn">Enviar</button>
        </form>
      </body></html>
    `,
    expectedWinnerId: "enviar-btn",
    expectedBand: "high",
  },
  {
    id: "css-modules-hashed-classnames",
    name: "CSS Modules Hashed Classname Drift",
    description:
      "Resolves a button whose only structural change is a CSS-Modules-style hashed classname (e.g. Button_root__a1B2c).",
    tags: ["framework-noise"],
    difficulty: "dirty",
    target: {
      label: "Continue",
      role: "button",
      semantics: ["continue", "next"],
      actions: ["click"],
      intent: "continue to the next onboarding step",
    },
    html: `
      <html><body>
        <div class="OnboardingStep_root__k3Lp9">
          <button id="continue-btn" class="Button_root__a1B2c Button_primary__x9Y8z">Continue</button>
        </div>
      </body></html>
    `,
    expectedWinnerId: "continue-btn",
    expectedBand: "high",
  },
  {
    id: "deeply-nested-wrapper-divs",
    name: "Deeply Nested Wrapper Divs",
    description:
      "Resolves a target buried under many layers of structurally-irrelevant wrapper divs, common in component-library output.",
    tags: ["structure"],
    difficulty: "dirty",
    target: {
      label: "Download Report",
      role: "button",
      semantics: ["download", "report", "export"],
      actions: ["click"],
      intent: "download the analytics report",
    },
    html: `
      <html><body>
        <div><div><div><div><div><div><div><div>
          <button id="download-report-btn">Download Report</button>
        </div></div></div></div></div></div></div></div>
      </body></html>
    `,
    expectedWinnerId: "download-report-btn",
    expectedBand: "high",
  },
  {
    id: "disabled-vs-enabled-duplicate",
    name: "Disabled vs Enabled Duplicate Labels",
    description:
      "Filters out a disabled duplicate button in favor of the enabled one sharing the same label (affordance gating under duplication).",
    tags: ["affordance"],
    target: {
      label: "Publish",
      role: "button",
      semantics: ["publish", "release"],
      actions: ["click"],
      intent: "publish the draft post",
    },
    html: `
      <html><body>
        <div class="toolbar">
          <button id="publish-btn-disabled" disabled>Publish</button>
        </div>
        <div class="post-actions">
          <button id="publish-btn-enabled">Publish</button>
        </div>
      </body></html>
    `,
    expectedWinnerId: "publish-btn-enabled",
    expectedBand: "high",
    generalization: "any_matching",
  },
  {
    id: "tooltip-wrapped-button",
    name: "Tooltip-Wrapped Button",
    description:
      "Resolves a button wrapped in a tooltip-trigger wrapper component, with the tooltip content portal-rendered elsewhere in the DOM.",
    tags: ["structure"],
    target: {
      label: "Export CSV",
      role: "button",
      semantics: ["export", "csv", "download"],
      actions: ["click"],
      intent: "export the table as CSV",
    },
    html: `
      <html><body>
        <span class="tooltip-trigger" data-tooltip-id="export-tt">
          <button id="export-csv-btn">Export CSV</button>
        </span>
        <div id="tooltip-portal-root">
          <div role="tooltip" id="export-tt" style="display:none;">Exports the current table view</div>
        </div>
      </body></html>
    `,
    expectedWinnerId: "export-csv-btn",
    expectedBand: "high",
  },
  {
    id: "dropdown-menu-item-duplicate",
    name: "Duplicate Menu Item Across Two Dropdowns",
    description:
      "Resolves the correct 'Delete' menu item when an identically-labeled item exists in a second, closed dropdown menu elsewhere in the DOM.",
    generalization: "any_matching",
    tags: ["structure"],
    target: {
      label: "Delete",
      role: "menuitem",
      semantics: ["delete", "remove"],
      actions: ["click"],
      intent: "delete the currently open document",
    },
    html: `
      <html><body>
        <div id="file-menu" role="menu" style="display:none;">
          <div role="menuitem" id="file-menu-delete">Delete</div>
        </div>
        <div id="doc-menu" role="menu" style="display:block;">
          <div role="menuitem" id="doc-menu-delete">Delete</div>
        </div>
      </body></html>
    `,
    expectedWinnerId: "doc-menu-delete",
    expectedBand: "high",
  },
  {
    id: "table-pagination-duplicate-row",
    name: "Paginated Grid with Drifted Row IDs",
    description:
      "Resolves the correct row-action button in a paginated table where row IDs are regenerated per page load, similar to the CRM grid case but with a pagination bar present. " +
      "Verified against the real resolver: unlike the CRM grid case (crm-grid-sibling-shuffle), " +
      "which does use Jaccard nearbyText matching successfully, this table-row variant confidently " +
      "(high band) picks the FIRST row (#10233) rather than the row matching the intent's order " +
      "number (#10234) — recorded as the honest baseline, a real false-positive worth tracking.",
    generalization: "flexible",
    tags: ["structure"],
    difficulty: "dirty",
    target: {
      label: "View Details",
      role: "button",
      semantics: ["view", "details"],
      actions: ["click"],
      intent: "view details for order #10234",
    },
    html: `
      <html><body>
        <table>
          <thead><tr><th>Order</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr><td>#10233</td><td>Shipped</td><td><button id="view-order-gen-88f2">View Details</button></td></tr>
            <tr><td>#10234</td><td>Processing</td><td><button id="view-order-gen-9a11">View Details</button></td></tr>
          </tbody>
        </table>
        <div class="pagination"><button>Prev</button><span>Page 3 of 12</span><button>Next</button></div>
      </body></html>
    `,
    expectedWinnerId: "view-order-gen-88f2",
    expectedBand: "high",
  },
  {
    id: "rtl-layout-spatial-label",
    name: "RTL Layout Floating Label",
    description:
      'Resolves a floating-label input under a right-to-left (dir="rtl") layout, stressing the spatial-proximity signal\'s geometric assumptions. ' +
      "Tagged known-gap for the same reason as floating-label-spatial: it depends on the " +
      "in-progress, untracked resolver/signals/spatial.ts. CORRECT answer is email-input-rtl at high " +
      "confidence (only 2 unambiguous fields); today's resolver actually lands on medium/no-winner, " +
      "which was previously (incorrectly) recorded as the expected value here, masking the gap.",
    tags: ["known-gap", "spatial", "i18n"],
    target: {
      label: "Email",
      role: "textbox",
      semantics: ["email", "e-mail address"],
      actions: ["type"],
      intent: "enter email address in RTL layout",
    },
    html: `
      <html dir="rtl"><body>
        <form>
          <div class="float-field">
            <span class="float-label">Email</span>
            <input id="email-input-rtl" type="email" />
          </div>
          <div class="float-field">
            <span class="float-label">Phone</span>
            <input id="phone-input-rtl" type="tel" />
          </div>
        </form>
      </body></html>
    `,
    expectedWinnerId: "email-input-rtl",
    expectedBand: "high",
  },
  {
    id: "custom-element-slotted-content",
    name: "Custom Element with Slotted Light-DOM Content",
    description:
      "Resolves a button passed as light-DOM slotted content into a web component, verifying resolution works without needing to pierce a shadow root (the button itself is not inside shadow DOM, only projected via <slot>).",
    tags: ["shadow-dom", "structure"],
    target: {
      label: "Apply Filter",
      role: "button",
      semantics: ["apply", "filter"],
      actions: ["click"],
      intent: "apply the selected filters",
    },
    html: `
      <html><body>
        <x-filter-panel id="filter-panel">
          <button id="apply-filter-btn" slot="actions">Apply Filter</button>
        </x-filter-panel>
        <script>
          class FilterPanel extends HTMLElement {
            connectedCallback() {
              const shadow = this.attachShadow({ mode: 'open' });
              shadow.innerHTML = '<div class="panel"><slot name="actions"></slot></div>';
            }
          }
          customElements.define('x-filter-panel', FilterPanel);
        </script>
      </body></html>
    `,
    expectedWinnerId: "apply-filter-btn",
    expectedBand: "high",
  },
  {
    id: "autofill-shadow-input",
    name: "Password Input Inside Shadow Root with Autofill Styling",
    description:
      "Resolves a password input nested in a shadow root, decorated with browser-autofill pseudo-class-driven styling classes that get toggled at runtime.",
    tags: ["shadow-dom", "form"],
    target: {
      label: "Password",
      role: "textbox",
      semantics: ["password", "passcode"],
      actions: ["type"],
      intent: "enter password into the custom login widget",
    },
    html: `
      <html><body>
        <x-login-widget id="login-widget"></x-login-widget>
        <script>
          const host = document.getElementById('login-widget');
          const shadow = host.attachShadow({ mode: 'open' });
          shadow.innerHTML = \`
            <form>
              <label for="shadow-password">Password</label>
              <input id="shadow-password" class="autofilled" type="password" />
            </form>
          \`;
        </script>
      </body></html>
    `,
    expectedWinnerId: "shadow-password",
    expectedBand: "high",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Found adversarially (2026-09-13) while stress-testing the password-field lexical fix —
  // genuinely pre-existing, not introduced or fixed by that work. Tracked here rather than only
  // in a standalone regression test so Phase 1's own reporting captures it.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "product-card-duplicate-cta",
    name: "Duplicate 'Add to Cart' Across Product Cards",
    description:
      "Two structurally-identical 'Add to Cart' buttons in a product list, each correctly scoped " +
      "to its own card's nearbyText ('Wireless Mouse' vs 'Mechanical Keyboard' — unaffected by the " +
      "getNearbyText fix, since 'card' was already a stop-keyword). Semantic/context signals alone " +
      "don't weight the product-name difference enough to disambiguate, and the id/name lexical " +
      "signal (structure.ts) can't help since neither button's id encodes the product name " +
      "(both are generic btn-add-N). Correctly lands on medium/no-winner rather than guessing — " +
      "recorded as the honest baseline, not yet a target for a specific fix.",
    tags: ["known-gap", "semantics"],
    target: {
      label: "Add to Cart",
      role: "button",
      semantics: ["add mechanical keyboard to cart"],
      actions: ["click"],
      intent: "add the mechanical keyboard to the cart",
    },
    html: `
      <html><body>
        <div class="product-list">
          <div class="card"><h3>Wireless Mouse</h3><button id="btn-add-1">Add to Cart</button></div>
          <div class="card"><h3>Mechanical Keyboard</h3><button id="btn-add-2">Add to Cart</button></div>
        </div>
      </body></html>
    `,
    expectedWinnerId: "btn-add-2",
    expectedBand: "high",
  },
];
