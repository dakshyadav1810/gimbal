import type { GimbalConfig } from "@gimbal/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn();
const endMock = vi.fn();

vi.mock("pg", () => ({
  default: {
    Pool: vi.fn().mockImplementation(() => ({
      connect: connectMock,
      end: endMock,
    })),
  },
}));

const { openDbSession } = await import("./db-client.js");

function config(overrides: Partial<GimbalConfig["db"]> = {}): GimbalConfig {
  return {
    db: { readOnly: true, ...overrides },
  } as unknown as GimbalConfig;
}

describe("openDbSession", () => {
  beforeEach(() => {
    queryMock.mockReset().mockResolvedValue({ rows: [{ id: 1 }] });
    releaseMock.mockReset();
    connectMock.mockReset().mockResolvedValue({
      query: queryMock,
      release: releaseMock,
    });
    endMock.mockReset();
  });

  it("returns null when config.db.url is unset (NO_DB_CONFIGURED stays unchanged)", () => {
    expect(openDbSession(config())).toBeNull();
  });

  it("wraps the run in a transaction: BEGIN on beginFixture, ROLLBACK + release on rollback", async () => {
    const session = openDbSession(config({ url: "postgres://test" }))!;
    await session.beginFixture();
    expect(queryMock).toHaveBeenCalledWith("BEGIN");

    await session.rollback();
    expect(queryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(releaseMock).toHaveBeenCalled();
  });

  it("query runs against the fixture connection and returns the first row", async () => {
    const session = openDbSession(config({ url: "postgres://test" }))!;
    await session.beginFixture();
    const row = await session.query("select * from users where id = 1");
    expect(queryMock).toHaveBeenCalledWith(
      "select * from users where id = 1",
    );
    expect(row).toEqual({ id: 1 });
  });

  it("query throws before beginFixture has started the transaction", async () => {
    const session = openDbSession(config({ url: "postgres://test" }))!;
    await expect(session.query("select 1")).rejects.toThrow(
      /fixture transaction not started/,
    );
  });

  it("close ends the pool", async () => {
    const session = openDbSession(config({ url: "postgres://test" }))!;
    await session.beginFixture();
    await session.close();
    expect(endMock).toHaveBeenCalled();
  });
});
