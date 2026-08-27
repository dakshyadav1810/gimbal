import type { WsMessage } from "@gimbal/shared";
import { describe, expect, it, vi } from "vitest";
import { WsHub } from "./ws-hub.js";

function fakeSocket() {
  return { send: vi.fn() };
}

const message: WsMessage = {
  type: "log",
  runId: "r1",
  message: "hello",
} as unknown as WsMessage;

describe("WsHub", () => {
  it("delivers an emitted message to every subscriber of that key", () => {
    const hub = new WsHub();
    const a = fakeSocket();
    const b = fakeSocket();
    hub.subscribe("run:r1", a);
    hub.subscribe("run:r1", b);
    hub.emit("run:r1", message);
    expect(a.send).toHaveBeenCalledWith(JSON.stringify(message));
    expect(b.send).toHaveBeenCalledWith(JSON.stringify(message));
  });

  it("does not deliver to subscribers of a different key", () => {
    const hub = new WsHub();
    const other = fakeSocket();
    hub.subscribe("run:other", other);
    hub.emit("run:r1", message);
    expect(other.send).not.toHaveBeenCalled();
  });

  it("does not throw when emitting to a key with no subscribers", () => {
    const hub = new WsHub();
    expect(() => hub.emit("run:nobody", message)).not.toThrow();
  });

  it("stops delivering to a socket once unsubscribed", () => {
    const hub = new WsHub();
    const a = fakeSocket();
    hub.subscribe("run:r1", a);
    hub.unsubscribe("run:r1", a);
    hub.emit("run:r1", message);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("unsubscribing a socket that was never subscribed is a no-op", () => {
    const hub = new WsHub();
    const a = fakeSocket();
    expect(() => hub.unsubscribe("run:r1", a)).not.toThrow();
  });

  it("subscribing the same socket twice to the same key does not duplicate deliveries", () => {
    const hub = new WsHub();
    const a = fakeSocket();
    hub.subscribe("run:r1", a);
    hub.subscribe("run:r1", a);
    hub.emit("run:r1", message);
    expect(a.send).toHaveBeenCalledTimes(1);
  });
});
