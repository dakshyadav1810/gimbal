import { Suspense, lazy } from "react";
import { Redirect, Route, Switch } from "wouter";
import { Nav } from "./components/Nav.js";
const RepairsPage = lazy(() =>
  import("./pages/RepairsPage.js").then((m) => ({ default: m.RepairsPage })),
);
const RunDetailPage = lazy(() =>
  import("./pages/RunDetailPage.js").then((m) => ({
    default: m.RunDetailPage,
  })),
);
const RunHistoryPage = lazy(() =>
  import("./pages/RunHistoryPage.js").then((m) => ({
    default: m.RunHistoryPage,
  })),
);
const TestDetailPage = lazy(() =>
  import("./pages/TestDetailPage.js").then((m) => ({
    default: m.TestDetailPage,
  })),
);
const TestListPage = lazy(() =>
  import("./pages/TestListPage.js").then((m) => ({ default: m.TestListPage })),
);

// Thin developer tool — never executes tests itself, only calls core (invariant #3, SPEC-005 §3).
export function App() {
  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--text-primary)]">
      <Nav />
      <Suspense fallback={null}>
        <Switch>
          <Route path="/">
            <Redirect to="/tests" />
          </Route>
          <Route path="/tests" component={TestListPage} />
          <Route path="/tests/:id">
            {(params) => <TestDetailPage testId={params.id} />}
          </Route>
          <Route path="/tests/:id/runs">
            {(params) => <RunHistoryPage testId={params.id} />}
          </Route>
          <Route path="/tests/:id/runs/:runId">
            {(params) => (
              <RunDetailPage testId={params.id} runId={params.runId} />
            )}
          </Route>
          <Route path="/repairs" component={RepairsPage} />
        </Switch>
      </Suspense>
    </div>
  );
}
