import type { ApiStep, DbStep } from "@gimbal/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunContext } from "../types.js";
import { ApiAdapter } from "./api.js";
import { DbAdapter } from "./db.js";

function apiStep(overrides: Partial<ApiStep> = {}): ApiStep {
  return {
    id: "s1",
    intent: "call api",
    onFailure: "abort",
    preconditions: [],
    assertions: [],
    negative: false,
    kind: "api",
    request: { method: "GET", url: "https://api.test/users/${id}" },
    ...overrides,
  };
}

function dbStep(overrides: Partial<DbStep> = {}): DbStep {
  return {
    id: "s1",
    intent: "check row",
    onFailure: "abort",
    preconditions: [],
    assertions: [],
    negative: false,
    kind: "db",
    query: "select * from users where id = 1",
    ...overrides,
  };
}

function ctx(overrides: Partial<RunContext> = {}): RunContext {
  return {
    test: {} as RunContext["test"],
    testId: "test-1",
    page: {} as RunContext["page"],
    vars: {},
    cache: {} as RunContext["cache"],
    healing: {} as RunContext["healing"],
    runId: "r1",
    screenshotsDir: "/tmp",
    ...overrides,
  };
}

describe("ApiAdapter", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("interpolates ${vars} into the request URL and passes through method/headers/body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new ApiAdapter();
    const step = apiStep({
      request: {
        method: "POST",
        url: "https://api.test/users/${id}",
        headers: { "x-test": "1" },
        body: { name: "dana" },
      },
    });
    const result = await adapter.execute(step, ctx({ vars: { id: "42" } }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/users/42",
      expect.objectContaining({
        method: "POST",
        headers: { "x-test": "1" },
        body: JSON.stringify({ name: "dana" }),
      }),
    );
    expect(result.status).toBe("passed");
  });

  it("passes when all assertions succeed against the response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 201,
      json: () => Promise.resolve({ id: 42 }),
    }) as unknown as typeof fetch;

    const adapter = new ApiAdapter();
    const step = apiStep({
      assertions: [{ type: "apiStatus", expected: 201 }],
    });
    const result = await adapter.execute(step, ctx());
    expect(result.status).toBe("passed");
  });

  it("fails with ASSERTION_FAILED and stops at the first failing assertion", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 404,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    const adapter = new ApiAdapter();
    const step = apiStep({
      assertions: [
        { type: "apiStatus", expected: 200 },
        { type: "apiBody", path: "x", expected: 1 },
      ],
    });
    const result = await adapter.execute(step, ctx());
    expect(result.status).toBe("failed");
    expect(result.failure?.reason).toBe("ASSERTION_FAILED");
  });

  it("tolerates a non-JSON response body without throwing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.reject(new Error("not json")),
    }) as unknown as typeof fetch;

    const adapter = new ApiAdapter();
    const result = await adapter.execute(
      apiStep({ request: { method: "GET", url: "https://api.test/x" } }),
      ctx(),
    );
    expect(result.status).toBe("passed");
  });
});

describe("DbAdapter", () => {
  it("fails with NO_DB_CONFIGURED when ctx.dbQuery is not set", async () => {
    const adapter = new DbAdapter();
    const result = await adapter.execute(dbStep(), ctx({ dbQuery: undefined }));
    expect(result.status).toBe("failed");
    expect(result.failure?.reason).toBe("NO_DB_CONFIGURED");
  });

  it("runs the query via ctx.dbQuery and passes when the assertion matches the row", async () => {
    const dbQuery = vi.fn().mockResolvedValue({ id: 1, name: "dana" });
    const adapter = new DbAdapter();
    const step = dbStep({
      assertions: [
        { type: "dbRow", query: "select 1", expected: { id: 1, name: "dana" } },
      ],
    });
    const result = await adapter.execute(step, ctx({ dbQuery }));
    expect(dbQuery).toHaveBeenCalledWith(step.query);
    expect(result.status).toBe("passed");
  });

  it("fails with ASSERTION_FAILED when the row doesn't match", async () => {
    const dbQuery = vi.fn().mockResolvedValue({ id: 1, name: "wrong" });
    const adapter = new DbAdapter();
    const step = dbStep({
      assertions: [
        { type: "dbRow", query: "select 1", expected: { id: 1, name: "dana" } },
      ],
    });
    const result = await adapter.execute(step, ctx({ dbQuery }));
    expect(result.status).toBe("failed");
    expect(result.failure?.reason).toBe("ASSERTION_FAILED");
  });
});
