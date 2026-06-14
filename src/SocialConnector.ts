import { BrowserSession } from "./BrowserSession.js";
import { AuthManager, type ManualLoginOptions } from "./AuthManager.js";
import { createLogger } from "./logger.js";
import { getProvider } from "./providers/index.js";
import { cacheEnabled, isFresh, readCache, writeCache } from "./cache.js";
import { NotLoggedInError, UnsupportedActionError } from "./errors.js";
import type {
  ConversationMessage,
  ListRecentChatsOptions,
  Post,
  PostOptions,
  ProviderId,
  ReadConversationOptions,
  ReadOptions,
  RecentChat,
  SocialProvider,
} from "./types.js";

export interface SocialConnectorOptions {
  /** Persistent profile directory. Default: the provider's (e.g. ./.fb-profile). */
  userDataDir?: string;
  /** Headless browser. Default: true (hidden). Set false to show Chromium. */
  headless?: boolean;
  /** Slows down actions (ms) for visual debugging. */
  slowMo?: number;
  /** Browser locale. Default: fr-FR. */
  locale?: string;
  /** Progress logs (steps + timing). Default: true. */
  verbose?: boolean;
}

/**
 * Public multi-provider facade.
 *
 *   const fb = new SocialConnector("facebook");
 *   await fb.login();                       // MANUAL login (window), once
 *   await fb.post("Hello wall!");
 *
 *   const wa = new SocialConnector("whatsapp");
 *   await wa.login();                       // scan the QR
 *   await wa.post("Hi!", { target: "33612345678" });
 *
 * Login is always manual. The session is saved per provider and reused.
 */
export class SocialConnector {
  private readonly provider: SocialProvider;
  private readonly session: BrowserSession;
  private readonly auth: AuthManager;
  private started = false;

  constructor(
    provider: ProviderId | SocialProvider,
    opts: SocialConnectorOptions = {},
  ) {
    this.provider = typeof provider === "string" ? getProvider(provider) : provider;
    const logger = createLogger(opts.verbose ?? true);
    this.session = new BrowserSession({
      userDataDir: opts.userDataDir ?? this.provider.defaultUserDataDir,
      headless: opts.headless ?? true,
      slowMo: opts.slowMo,
      locale: opts.locale,
      logger,
    });
    this.auth = new AuthManager(this.session, this.provider.auth);
  }

  /** Active provider. */
  get providerId(): ProviderId {
    return this.provider.id;
  }

  /** Starts the browser (idempotent). */
  async start(): Promise<void> {
    if (this.started) return;
    await this.session.start();
    this.started = true;
  }

  /** MANUAL login: reuses the saved session, otherwise waits for the manual login. */
  async login(opts?: ManualLoginOptions): Promise<void> {
    await this.start();
    await this.auth.waitForManualLogin(opts);
  }

  /** True if a saved session is valid. */
  async isLoggedIn(): Promise<boolean> {
    await this.start();
    return this.auth.isLoggedIn();
  }

  /**
   * Posts / sends a message. The meaning depends on the provider:
   * Facebook -> wall, LinkedIn -> feed, WhatsApp -> message to options.target.
   */
  async post(content: string, options: PostOptions = {}): Promise<void> {
    await this.start();
    if (!content.trim()) throw new Error("Empty content.");
    if (!(await this.auth.isLoggedIn())) {
      throw new NotLoggedInError(
        `No valid session for ${this.provider.label}. Run login() first.`,
      );
    }
    await this.provider.post({
      page: this.session.page,
      content,
      options,
      log: this.session.logger,
    });
  }

  /**
   * Reads the logged-in user's own posts (Facebook wall, LinkedIn activity).
   * Throws UnsupportedActionError for providers without a post feed (WhatsApp).
   */
  async read(options: ReadOptions = {}): Promise<Post[]> {
    await this.start();
    if (!(await this.auth.isLoggedIn())) {
      throw new NotLoggedInError(
        `No valid session for ${this.provider.label}. Run login() first.`,
      );
    }
    if (!this.provider.readPosts) {
      throw new UnsupportedActionError(
        `${this.provider.label} does not support reading posts.`,
      );
    }
    return this.provider.readPosts({
      page: this.session.page,
      options,
      log: this.session.logger,
    });
  }

  /**
   * Lists the names of the groups the user belongs to (WhatsApp).
   * Throws UnsupportedActionError for providers without a group concept.
   */
  async listGroups(options: ReadOptions = {}): Promise<string[]> {
    await this.start();
    if (!(await this.auth.isLoggedIn())) {
      throw new NotLoggedInError(
        `No valid session for ${this.provider.label}. Run login() first.`,
      );
    }
    if (!this.provider.listGroups) {
      throw new UnsupportedActionError(
        `${this.provider.label} does not support listing groups.`,
      );
    }
    return this.provider.listGroups({
      page: this.session.page,
      options,
      log: this.session.logger,
    });
  }

  /**
   * Reads recent messages of one conversation (WhatsApp).
   * Throws UnsupportedActionError for providers without conversations.
   */
  async readConversation(options: ReadConversationOptions): Promise<ConversationMessage[]> {
    // Serve from the encrypted cache without launching the browser if fresh.
    const maxAge = options.cacheMaxAgeMs ?? 0;
    if (cacheEnabled() && maxAge > 0) {
      const entry = await readCache(options.chat);
      if (entry && isFresh(entry, maxAge, Date.now())) {
        const limit = options.limit ?? 50;
        return entry.messages.slice(-limit);
      }
    }

    await this.start();
    if (!(await this.auth.isLoggedIn())) {
      throw new NotLoggedInError(
        `No valid session for ${this.provider.label}. Run login() first.`,
      );
    }
    if (!this.provider.readConversation) {
      throw new UnsupportedActionError(
        `${this.provider.label} does not support reading conversations.`,
      );
    }
    const messages = await this.provider.readConversation({
      page: this.session.page,
      options,
      log: this.session.logger,
    });
    // Write-through: merge into the encrypted cache (no-op if disabled).
    await writeCache(options.chat, messages, new Date().toISOString()).catch(() => {});
    return messages;
  }

  /**
   * Lists the most recent chats (WhatsApp): name + last time + preview + unread.
   * Throws UnsupportedActionError for other providers.
   */
  async listRecentChats(options: ListRecentChatsOptions = {}): Promise<RecentChat[]> {
    await this.start();
    if (!(await this.auth.isLoggedIn())) {
      throw new NotLoggedInError(
        `No valid session for ${this.provider.label}. Run login() first.`,
      );
    }
    if (!this.provider.listRecentChats) {
      throw new UnsupportedActionError(
        `${this.provider.label} does not support listing recent chats.`,
      );
    }
    return this.provider.listRecentChats({
      page: this.session.page,
      options,
      log: this.session.logger,
    });
  }

  /** Closes the browser. */
  async close(): Promise<void> {
    await this.session.close();
    this.started = false;
  }
}
