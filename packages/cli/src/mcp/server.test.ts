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
    runTest: vi.fn(),
    getReport: vi.fn(),
    getRepairPayload: vi.fn(),
    maintain: vi.fn(),
    deleteTest: vi.fn(),
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
  return { mcpClient, server };
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

  it("submitSpec calls client.submitSpec", async () => {
    const client = mockClient();
    vi.mocked(client.submitSpec).mockResolvedValue({
      testId: "test-id",
      spec: validSpec,
    });
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "submitSpec",
      arguments: validSpec,
    });

    expect(client.submitSpec).toHaveBeenCalledWith(
      expect.objectContaining({ version: "1.0" }),
    );
    expect(res.content[0].text).toContain("test-id");
  });

  it("groundTest calls client.groundTest", async () => {
    const client = mockClient();
    vi.mocked(client.groundTest).mockResolvedValue({ grounded: {} as any });
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "groundTest",
      arguments: { testId: "t1" },
    });

    expect(client.groundTest).toHaveBeenCalledWith("t1");
    expect(res.content[0].text).toContain("grounded");
  });

  it("runTest calls client.runTest", async () => {
    const client = mockClient();
    vi.mocked(client.runTest).mockResolvedValue({ runId: "r1" });
    const { mcpClient } = await setupMcp(client);

    const res = await mcpClient.callTool({
      name: "runTest",
      arguments: { testId: "t1", vars: { username: "user" } },
    });

    expect(client.runTest).toHaveBeenCalledWith({
      testId: "t1",
      vars: { username: "user" },
    });
    expect(res.content[0].text).toContain("r1");
  });

  it("getReport / pollRun calls client.getReport", async () => {
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

    // Test alias pollRun
    const resAlias = await mcpClient.callTool({
      name: "pollRun",
      arguments: { runId: "r1" },
    });
    expect(resAlias.content[0].text).toContain("passed");
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
});
