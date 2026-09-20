import { Redirect, Route, Switch } from "wouter";
import { Nav } from "./components/Nav.js";
import { ReviewDetailPage } from "./pages/ReviewDetailPage.js";
import { ReviewQueuePage } from "./pages/ReviewQueuePage.js";
import { RunDetailPage } from "./pages/RunDetailPage.js";
import { RunHistoryPage } from "./pages/RunHistoryPage.js";
import { TestDetailPage } from "./pages/TestDetailPage.js";
import { TestListPage } from "./pages/TestListPage.js";

// Thin developer tool — never executes tests itself, only calls core (invariant #3, SPEC-005 §3).
export function App() {
  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--text-primary)]">
      <Nav />
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
        <Route path="/reviews" component={ReviewQueuePage} />
        <Route path="/reviews/:testId/:stepId">
          {(params) => (
            <ReviewDetailPage testId={params.testId} stepId={params.stepId} />
          )}
        </Route>
      </Switch>
    </div>
  );
}
