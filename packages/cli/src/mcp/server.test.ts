import type { SpecIR } from "@gimbal/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { CoreApiError, type CoreClient } from "../client.js";
import { buildMcpServer } from "./server.js";

function mockClient() {
  return {
    getKdg: vi.fn(),
    submitSpec: vi.fn(),
    groundTest: vi.fn(),
    authorTest: vi.fn(),
    runTest: vi.fn(),
    runTestSync: vi.fn(),
    getReport: vi.fn(),
    getRepairPayload: vi.fn(),
    maintain: vi.fn(),
    deleteTest: vi.fn(),
    explore: vi.fn(),
  } as unknown as CoreClient;
}

const validSpec: SpecIR = {
  version: "1.0",
  flow: {
    id: "test",
    name: "test",
    intent: "test",
    startUrl: "https://test.com",
    vars: {},
  },
  steps: [
    {
      id: "s1",
      kind: "ui",
      action: "click",
      intent: "click button",
      onFailure: "abort",
      preconditions: [],
      assertions: [],
      expectedOutcome: [],
      negative: false,
      generalization: "same_element",
    },
  ],
};

async function setupMcp(client: CoreClient) {
  const server = buildMcpServer(client);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcpClient = new Client(
    { name: "test-client", version: "0.1.0" },
    { capabilities: {} },
  );
  await mcpClient.connect(clientTransport);
  return {
    mcpClient: {
      callTool: async (params: { name: string; arguments?: Record<string, unknown> }) => {
        const res = await mcpClient.callTool(params);
        return res as { content: Array<{ type: string; text: string }>; isError?: boolean };
      },
    },
    server,
  };
}

describe("MCP Server Tools", () => {
  it("getMap calls client.getKdg", async () => {
    const client = mockClient();
    vi.mocked(client.getKdg).mockResolvedValue({ route: "/login", nodes: {} });
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "getMap",
      arguments: { entryUrl: "/login" },
    });

    expect(client.getKdg).toHaveBeenCalledWith("/login");
    expect(res.content[0].text).toContain("/login");
  });

  it("authorTest with SpecIR calls client.authorTest", async () => {
    const client = mockClient();
    vi.mocked(client.authorTest).mockResolvedValue({
      testId: "test-id",
      grounded: {} as any,
    });
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "authorTest",
      arguments: validSpec,
    });

    expect(client.authorTest).toHaveBeenCalledWith(
      expect.objectContaining({ version: "1.0" }),
    );
    expect(res.content[0].text).toContain("test-id");
  });

  it("authorTest with testId only re-grounds existing test", async () => {
    const client = mockClient();
    vi.mocked(client.groundTest).mockResolvedValue({ grounded: {} as any });
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "authorTest",
      arguments: { testId: "t1" },
    });

    expect(client.groundTest).toHaveBeenCalledWith("t1");
    expect(res.content[0].text).toContain("grounded");
  });

  it("runTest defaults to sync mode (calls client.runTestSync)", async () => {
    const client = mockClient();
    vi.mocked(client.runTestSync).mockResolvedValue({
      runId: "r-sync",
      status: "passed",
      steps: [],
    } as any);
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "runTest",
      arguments: { testId: "t1", vars: { username: "user" } },
    });

    expect(client.runTestSync).toHaveBeenCalledWith(
      { testId: "t1", vars: { username: "user" } },
      30000,
    );
    expect(res.content[0].text).toContain("r-sync");
  });

  it("runTest with sync: false calls client.runTest asynchronously", async () => {
    const client = mockClient();
    vi.mocked(client.runTest).mockResolvedValue({ runId: "r-async" });
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "runTest",
      arguments: { testId: "t1", sync: false },
    });

    expect(client.runTest).toHaveBeenCalledWith({ testId: "t1" });
    expect(res.content[0].text).toContain("r-async");
  });

  it("getReport calls client.getReport", async () => {
    const client = mockClient();
    vi.mocked(client.getReport).mockResolvedValue({
      runId: "r1",
      status: "passed",
    } as any);
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "getReport",
      arguments: { runId: "r1" },
    });

    expect(client.getReport).toHaveBeenCalledWith("r1");
    expect(res.content[0].text).toContain("passed");
  });

  it("healing calls client.getRepairPayload", async () => {
    const client = mockClient();
    vi.mocked(client.getRepairPayload).mockResolvedValue({
      spec: validSpec,
    } as any);
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "healing",
      arguments: { testId: "t1" },
    });

    expect(client.getRepairPayload).toHaveBeenCalledWith("t1");
    expect(res.content[0].text).toContain("spec");
  });

  it("updateTest calls client.maintain", async () => {
    const client = mockClient();
    vi.mocked(client.maintain).mockResolvedValue({ testId: "t1" });
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "updateTest",
      arguments: { testId: "t1", stepIds: ["s1"], spec: validSpec },
    });

    expect(client.maintain).toHaveBeenCalledWith("t1", {
      stepIds: ["s1"],
      spec: expect.objectContaining({ version: "1.0" }),
    });
    expect(res.content[0].text).toContain("t1");
  });

  it("deleteTest calls client.deleteTest", async () => {
    const client = mockClient();
    vi.mocked(client.deleteTest).mockResolvedValue({ ok: true });
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "deleteTest",
      arguments: { testId: "t1" },
    });

    expect(client.deleteTest).toHaveBeenCalledWith("t1");
    expect(res.content[0].text).toContain("true");
  });

  it("surfaces CoreApiError as clean MCP error message", async () => {
    const client = mockClient();
    vi.mocked(client.getKdg).mockRejectedValue(
      new CoreApiError(400, "bad_request", "invalid route"),
    );
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "getMap",
      arguments: { entryUrl: "/login" },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe(
      "gimbal core error (bad_request): invalid route",
    );
  });

  it("exploreUiState calls client.explore", async () => {
    const client = mockClient();
    vi.mocked(client.explore).mockResolvedValue({
      domDiff: ["+ modal 'Settings'"],
      urlChangedTo: "https://test.com/settings",
    });
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "exploreUiState",
      arguments: {
        url: "https://test.com",
        action: "click",
        target: {
          role: "button",
          label: "Settings",
          semantics: ["settings"],
          actions: ["click"],
          intent: "open settings",
        },
      },
    });

    expect(client.explore).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://test.com", action: "click" }),
    );
    expect(res.content[0].text).toContain("+ modal 'Settings'");
  });

  it("authorTest calls client.authorTest with SpecIR or DSL", async () => {
    const client = mockClient();
    vi.mocked(client.authorTest).mockResolvedValue({
      testId: "t-authored",
      grounded: {} as any,
    });
    const { mcpClient } = await setupMcp(client);

    const dsl = `
flow:
  id: auth-flow
  name: Auth Flow
  intent: login
  startUrl: http://localhost:3000
steps:
  - click: button("Login")
  - assert: urlContains("/dashboard")
`;
    const res = await mcpClient.callTool({
      name: "authorTest",
      arguments: { dsl },
    });

    expect(client.authorTest).toHaveBeenCalledWith(
      expect.objectContaining({ version: "1.0" }),
    );
    expect(res.content[0].text).toContain("t-authored");
  });

  it("runTest with sync: true calls client.runTestSync", async () => {
    const client = mockClient();
    vi.mocked(client.runTestSync).mockResolvedValue({
      runId: "r-sync",
      status: "passed",
      steps: [],
    } as any);
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "runTest",
      arguments: { testId: "t1", sync: true },
    });

    expect(client.runTestSync).toHaveBeenCalledWith({ testId: "t1" }, 30000);
    expect(res.content[0].text).toContain("r-sync");
  });

  it("executeDsl authors and executes test in 1 turn", async () => {
    const client = mockClient();
    vi.mocked(client.authorTest).mockResolvedValue({
      testId: "t-dsl",
      grounded: {} as any,
    });
    vi.mocked(client.runTestSync).mockResolvedValue({
      runId: "r-dsl",
      status: "passed",
      steps: [],
    } as any);
    const { mcpClient } = await setupMcp(client);

    const dsl = `
flow:
  id: exec-flow
  name: Exec Flow
  intent: test
  startUrl: http://localhost:3000
steps:
  - click: button("Go")
  - assert: urlContains("/done")
`;
    const res = await mcpClient.callTool({
      name: "executeDsl",
      arguments: { dsl },
    });

    expect(client.authorTest).toHaveBeenCalled();
    expect(client.runTestSync).toHaveBeenCalledWith({ testId: "t-dsl", vars: undefined }, 30000);
    expect(res.content[0].text).toContain("r-dsl");
  });
});
