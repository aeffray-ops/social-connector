import type { Page } from "playwright";
import type { Logger } from "./logger.js";

export type ProviderId = "facebook" | "whatsapp" | "linkedin";

/**
 * Authentication config for a provider. Auth is always manual: we just
 * need to know where to go and how to recognize the logged-in state.
 */
export interface ProviderAuthConfig {
  /** Home page (logged-in state expected). */
  homeUrl: string;
  /** Login page (or QR for WhatsApp). */
  loginUrl: string;
  /** Selectors present ONLY when logged in. */
  loggedInMarkers: readonly string[];
  /** Selectors present ONLY when logged out. */
  loggedOutMarkers: readonly string[];
  /**
   * Optional regex (source string) matched against the page URL. When the URL
   * matches AND no loggedOutMarker is visible, the session is treated as valid.
   * A robust fallback when the logged-in DOM markers drift (e.g. LinkedIn
   * lands on /feed/ after login). Tested case-insensitively.
   */
  loggedInUrlPattern?: string;
  /**
   * Max wait (ms) for loggedInMarkers when probing session validity.
   * Bump for slow-loading providers (e.g. WhatsApp Web). Default: 5000.
   */
  loggedInTimeoutMs?: number;
  /** Cookie accept button, if the provider shows one. */
  cookieAccept?: readonly string[];
}

export interface PostOptions {
  /**
   * Recipient phone number. WhatsApp only: international number, no '+'
   * (e.g. "33612345678"). Ignored by wall/feed providers (Facebook, LinkedIn).
   */
  target?: string;
  /**
   * Chat/group/community name to open by searching the WhatsApp chat list.
   * Use this to message a group or a community's announcement group, which
   * have no phone number. Takes precedence over `target`. EXPERIMENTAL:
   * matches by visible name, so the name must be unique enough.
   */
  chat?: string;
  /** Screenshot before send/post (path). Debug. */
  screenshotPath?: string;
  /**
   * Local file paths to attach (images and/or a video). Convention: either a
   * single video OR up to 3 images, plus the text. Each provider attaches them
   * its own way: Facebook → "Photo/Vidéo", LinkedIn → "Ajouter un média",
   * WhatsApp → the paperclip. Empty/omitted = text-only post.
   */
  media?: string[];
}

/** Context passed to a provider's post() action. */
export interface PostContext {
  page: Page;
  content: string;
  options: PostOptions;
  log: Logger;
}

/** One post authored by the logged-in user, as scraped from their profile. */
export interface Post {
  /** Text content of the post. */
  text: string;
  /** Permalink to the post, if found. */
  url?: string;
  /** Relative time/age as shown in the UI (e.g. "2d"), if found. */
  time?: string;
}

export interface ReadOptions {
  /** Max number of posts to return. Default: 10. */
  limit?: number;
}

/** One scraped message from a WhatsApp conversation. */
export interface ConversationMessage {
  /** Sender name, or "me" for the logged-in user. */
  from: string;
  /** Message text. */
  text: string;
  /** Time as shown in the UI (e.g. "20:15"), if found. */
  time?: string;
  /** Date as shown in the bubble metadata (e.g. "14/06/2026"), if found. */
  date?: string;
  /** Stable WhatsApp message id (data-id), used for cache dedup. */
  id?: string;
}

export interface ReadConversationOptions {
  /** Chat/group/community name to open (by search). Required. */
  chat: string;
  /** Max number of recent messages to return. Default: 50. */
  limit?: number;
  /**
   * Best-effort lower bound on the message date (YYYY-MM-DD). Messages older
   * than this are dropped when their date can be parsed; unparseable dates are
   * kept. The hard cap is always `limit`.
   */
  since?: string;
  /**
   * If the encrypted cache holds this chat and it is younger than this many
   * milliseconds, serve it without launching the browser. 0 (default) always
   * re-scrapes (but still write-through updates the cache).
   */
  cacheMaxAgeMs?: number;
}

/** Context passed to a provider's readConversation() action. */
export interface ReadConversationContext {
  page: Page;
  options: ReadConversationOptions;
  log: Logger;
}

/** A row in the WhatsApp chat list (recency-sorted, newest first). */
export interface RecentChat {
  /** Chat/group/contact name. */
  name: string;
  /** Last-activity time/date as shown in the list (e.g. "16:45", "hier", "13/06/2026"). */
  time?: string;
  /** One-line preview of the last message. */
  preview?: string;
  /** Unread message count, 0 if none. */
  unread?: number;
}

export interface ListRecentChatsOptions {
  /** Max chats to return. Default: 20. */
  limit?: number;
  /** Restrict to chats with unread messages (uses the in-app Unread filter). */
  onlyUnread?: boolean;
}

/** Context passed to a provider's listRecentChats() action. */
export interface ListRecentChatsContext {
  page: Page;
  options: ListRecentChatsOptions;
  log: Logger;
}

/** Context passed to a provider's readPosts() action. */
export interface ReadContext {
  page: Page;
  options: ReadOptions;
  log: Logger;
}

/** A provider = auth config + a specific posting action. */
export interface SocialProvider {
  id: ProviderId;
  /** Human-readable name (logs, CLI). */
  label: string;
  /** Default persistent profile directory. */
  defaultUserDataDir: string;
  auth: ProviderAuthConfig;
  /** Posting / sending action, specific to the provider. */
  post(ctx: PostContext): Promise<void>;
  /**
   * Reads the logged-in user's own posts. Optional: providers that have no
   * concept of a post feed (e.g. WhatsApp) omit it.
   */
  readPosts?(ctx: ReadContext): Promise<Post[]>;
  /**
   * Lists the names of the groups the user belongs to. Optional: only
   * providers with a group concept (WhatsApp) implement it. Honors
   * `options.limit` (0/undefined = all).
   */
  listGroups?(ctx: ReadContext): Promise<string[]>;
  /**
   * Reads recent messages of one conversation. Optional: WhatsApp only.
   */
  readConversation?(ctx: ReadConversationContext): Promise<ConversationMessage[]>;
  /**
   * Lists the most recent chats (name + last time + preview + unread).
   * Optional: WhatsApp only.
   */
  listRecentChats?(ctx: ListRecentChatsContext): Promise<RecentChat[]>;
}
