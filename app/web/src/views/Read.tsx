import { useState } from "react";
import { getJSON, RecentChat, ConversationMessage } from "../api.js";
import { Button } from "../components/Button.js";
import { Spinner } from "../components/Spinner.js";

export function Inbox() {
  const [chats, setChats] = useState<RecentChat[]>([]);
  const [msgs, setMsgs] = useState<ConversationMessage[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  async function loadChats() {
    setLoadingChats(true);
    try {
      setChats(await getJSON<RecentChat[]>("/api/chats?limit=20"));
    } finally {
      setLoadingChats(false);
    }
  }

  async function openChat(name: string) {
    setActiveChat(name);
    setLoadingMsgs(true);
    try {
      setMsgs(
        await getJSON<ConversationMessage[]>(
          `/api/conversation?chat=${encodeURIComponent(name)}&limit=50`
        )
      );
    } finally {
      setLoadingMsgs(false);
    }
  }

  function initials(name: string) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }

  return (
    <div className="content-container">
      <div className="inbox-pane">
        {/* Chat list */}
        <div className="chat-list">
          <div className="chat-list-header">
            <h3>Recent</h3>
            <Button variant="ghost" size="sm" onClick={loadChats} disabled={loadingChats}>
              {loadingChats ? <Spinner size="sm" /> : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
              )}
              Refresh
            </Button>
          </div>

          <div className="chat-list-body">
            {chats.length === 0 && !loadingChats && (
              <div className="empty-state" style={{ padding: "32px 16px" }}>
                <div className="empty-state-icon">💬</div>
                <div className="empty-state-sub">Click Refresh to load recent chats</div>
              </div>
            )}
            {loadingChats && (
              <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                <Spinner />
              </div>
            )}
            {chats.map((c) => (
              <div
                key={c.name}
                className={`chat-item${activeChat === c.name ? " active" : ""}`}
                onClick={() => openChat(c.name)}
              >
                <div className="chat-avatar">{initials(c.name)}</div>
                <div className="chat-info">
                  <div className="chat-name">{c.name}</div>
                  <div className="chat-preview">{c.preview}</div>
                </div>
                <div className="chat-meta">
                  <span className="chat-time">{c.time}</span>
                  {c.unread > 0 && (
                    <span className="unread-pill">{c.unread}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <div className="conversation-pane">
          {activeChat ? (
            <>
              <div className="conversation-header">{activeChat}</div>
              <div className="conversation-body">
                {loadingMsgs && (
                  <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                    <Spinner />
                  </div>
                )}
                {!loadingMsgs && msgs.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state-sub">No messages</div>
                  </div>
                )}
                {msgs.map((m, i) => {
                  const isMe = m.from === "me";
                  return (
                    <div key={i} className={`message-bubble ${isMe ? "me" : "other"}`}>
                      <div className="bubble-text">{m.text}</div>
                      <div className="bubble-meta">
                        {!isMe && <span>{m.from}</span>}
                        <span>{m.time}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ height: "100%" }}>
              <div className="empty-state-icon">←</div>
              <div className="empty-state-title">No conversation selected</div>
              <div className="empty-state-sub">Pick a chat from the list to read messages</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
