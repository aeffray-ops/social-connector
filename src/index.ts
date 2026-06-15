export { SocialConnector } from "./SocialConnector.js";
export type { SocialConnectorOptions } from "./SocialConnector.js";
export type { ManualLoginOptions } from "./AuthManager.js";
export { PROVIDERS, getProvider, facebook, whatsapp, linkedin } from "./providers/index.js";
export type {
  ProviderId,
  SocialProvider,
  ProviderAuthConfig,
  PostOptions,
  PostContext,
  Post,
  ReadOptions,
  ReadContext,
  ConversationMessage,
  ReadConversationOptions,
  ReadConversationContext,
  RecentChat,
  ListRecentChatsOptions,
  ListRecentChatsContext,
} from "./types.js";
export type { Logger } from "./logger.js";
export {
  SocialConnectorError,
  NotLoggedInError,
  CheckpointError,
  SelectorError,
  PostFailedError,
  UnknownProviderError,
  UnsupportedActionError,
} from "./errors.js";
export { ensureLoggedIn } from "./session.js";
export type { ConnectorFactory, EnsureLoggedInOptions } from "./session.js";
