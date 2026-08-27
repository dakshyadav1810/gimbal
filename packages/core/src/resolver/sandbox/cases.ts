import type { SandboxCase } from "./types.js";

export const sandboxCases: SandboxCase[] = [
  // 1-8: Simple Scenarios
  {
    id: "exact-match",
    name: "Exact Match",
    description: "Matches the target element exactly on label, role, and actions.",
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
    description: "Matches when target element's label changes to a close synonym.",
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
    description: "Matches when ID, class, and context change, but label remains the same.",
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
    description: "Filters out non-interactive elements even if they have matching text.",
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
    description: "Resolves duplicate elements sharing a parent using DOM/sibling index.",
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
    description: "Selects correct duplicate element using data-testid anchor when parents differ.",
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
    description: "Selects correct element using surrounding/nearby context text.",
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
    description: "Escalates to low confidence / ungrounded when element is completely gone.",
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
    description: "Evaluates form restructuring, CSS-in-JS utility class drift, and label synonym mapping.",
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
    description: "Resolves rows containing duplicate buttons by Jaccard nearbyText matching after a grid shuffle.",
    generalization: "widened_intent",
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
    description: "Propagates accessible names correctly from SVG aria-labels inside textless icon buttons.",
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
    description: "Pierce Shadow Roots of web components to find and resolve custom element targets.",
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
    description: "Verifies hidden elements on inactive tabs are ignored in favor of visible button targets.",
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
];
