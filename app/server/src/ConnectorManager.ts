import { SocialConnector, type ProviderId } from "social-connector";

type Factory = (provider: ProviderId, visible: boolean) => SocialConnector;

interface Slot {
  connector: SocialConnector | null;
  lastUsed: number;
  queue: Promise<unknown>;
}

export interface ConnectorManagerOptions {
  factory?: Factory;
  idleMs?: number;
}

const DEFAULT_FACTORY: Factory = (provider, visible) =>
  new SocialConnector(provider, {
    userDataDir: process.env.USER_DATA_DIR,
    headless: visible ? false : true,
    verbose: false,
  });

export class ConnectorManager {
  private slots = new Map<ProviderId, Slot>();
  private factory: Factory;
  private idleMs: number;
  private reaper: NodeJS.Timeout;

  constructor(opts: ConnectorManagerOptions = {}) {
    this.factory = opts.factory ?? DEFAULT_FACTORY;
    this.idleMs = opts.idleMs ?? 10 * 60_000;
    this.reaper = setInterval(() => void this.reap(), 60_000);
    this.reaper.unref?.();
  }

  private slot(p: ProviderId): Slot {
    let s = this.slots.get(p);
    if (!s) { s = { connector: null, lastUsed: Date.now(), queue: Promise.resolve() }; this.slots.set(p, s); }
    return s;
  }

  /** Returns the live connector for a provider, creating a hidden one lazily. */
  async get(p: ProviderId): Promise<SocialConnector> {
    const s = this.slot(p);
    if (!s.connector) s.connector = this.factory(p, false);
    s.lastUsed = Date.now();
    return s.connector;
  }

  /** Replaces the live connector (e.g. after a visible login). */
  set(p: ProviderId, c: SocialConnector): void {
    const s = this.slot(p);
    s.connector = c;
    s.lastUsed = Date.now();
  }

  /** Runs `fn` serialized per provider; different providers run concurrently. */
  run<T>(p: ProviderId, fn: () => Promise<T>): Promise<T> {
    const s = this.slot(p);
    const next = s.queue.then(fn, fn);
    s.queue = next.then(() => { s.lastUsed = Date.now(); }, () => { s.lastUsed = Date.now(); });
    return next;
  }

  newConnector(p: ProviderId, visible: boolean): SocialConnector {
    return this.factory(p, visible);
  }

  /** Instant, browser-free session check (profile dir existence). */
  hasSession(p: ProviderId): boolean {
    const s = this.slots.get(p);
    return (s?.connector ?? this.factory(p, false)).hasSession();
  }

  /** Logs out a provider: closes its connector and deletes the saved profile. */
  async logout(p: ProviderId): Promise<void> {
    const s = this.slot(p);
    const c = s.connector ?? this.factory(p, false);
    s.connector = null;
    await c.logout();
  }

  private async reap(): Promise<void> {
    const now = Date.now();
    for (const [, s] of this.slots) {
      if (s.connector && now - s.lastUsed > this.idleMs) {
        const c = s.connector; s.connector = null;
        await c.close().catch(() => {});
      }
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.reaper);
    for (const s of this.slots.values()) {
      if (s.connector) await s.connector.close().catch(() => {});
      s.connector = null;
    }
  }
}
