import type { SocialConnector } from "./SocialConnector.js";

export type ConnectorFactory = (visible: boolean) => SocialConnector;

export interface EnsureLoggedInOptions {
  /** When not logged in, open a visible window and run the manual login. */
  autoLogin?: boolean;
  /** Progress callback: "checking" | "login-window-opened" | "logged-in". */
  onStatus?: (status: string) => void;
}

/**
 * Returns a connector with a valid session. Probes with a hidden connector;
 * if not logged in and autoLogin is set, opens a VISIBLE connector, runs the
 * manual login, and returns that. Shared by the CLI and the web server.
 */
export async function ensureLoggedIn(
  factory: ConnectorFactory,
  opts: EnsureLoggedInOptions = {},
): Promise<SocialConnector> {
  const onStatus = opts.onStatus ?? (() => {});
  onStatus("checking");
  const hidden = factory(false);
  if (await hidden.isLoggedIn()) {
    onStatus("logged-in");
    return hidden;
  }
  if (!opts.autoLogin) return hidden;
  await hidden.close().catch(() => {});
  onStatus("login-window-opened");
  const visible = factory(true);
  await visible.login();
  onStatus("logged-in");
  return visible;
}
