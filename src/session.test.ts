import { describe, it, expect, vi } from "vitest";
import { ensureLoggedIn } from "./session.js";

function fakeConnector(loggedIn: boolean) {
  return {
    visible: false,
    isLoggedIn: vi.fn(async () => loggedIn),
    login: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

describe("ensureLoggedIn", () => {
  it("returns the hidden connector when already logged in (no login window)", async () => {
    const hidden = fakeConnector(true);
    const factory = vi.fn((visible: boolean) => {
      const c = fakeConnector(true);
      c.visible = visible;
      return visible ? c : (hidden as any);
    });
    const c = await ensureLoggedIn(factory as any, {});
    expect(c).toBe(hidden);
    expect(hidden.login).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("opens a visible connector and logs in when not logged in", async () => {
    const hidden = fakeConnector(false);
    const visible = fakeConnector(false);
    const factory = vi.fn((v: boolean) => (v ? (visible as any) : (hidden as any)));
    const statuses: string[] = [];
    const c = await ensureLoggedIn(factory as any, {
      autoLogin: true,
      onStatus: (s) => statuses.push(s),
    });
    expect(hidden.close).toHaveBeenCalled();
    expect(visible.login).toHaveBeenCalled();
    expect(c).toBe(visible);
    expect(statuses).toContain("login-window-opened");
  });

  it("returns the hidden connector unchanged when autoLogin is false", async () => {
    const hidden = fakeConnector(false);
    const factory = vi.fn(() => hidden as any);
    const c = await ensureLoggedIn(factory as any, { autoLogin: false });
    expect(c).toBe(hidden);
    expect(hidden.login).not.toHaveBeenCalled();
  });
});
