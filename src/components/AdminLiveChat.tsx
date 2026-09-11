import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, ChatSession, AdminLiveChatProps } from '../types';
import {
  dbGetAllSessions,
  dbGetMessages,
  dbSaveMessage,
  dbSaveSession,
  dbMarkSessionAsRead,
  dbDeleteSession,
} from '../lib/indexedDb';
import { triggerNativeNotification, requestNotificationPermission } from '../lib/notifications';

export const AdminLiveChat: React.FC<AdminLiveChatProps> = ({
  adminName = 'Staff Support',
  apiUrl = '/api/live-chat/relay',
  primaryColor = '#0d7490',
  brandName = 'Live Concierge Desk',
  onSwitchToWidget,
  onSignOut,
}) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastAdminTimestamp = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadSessions = async () => {
    const all = await dbGetAllSessions();
    setSessions(all);
    if (!selectedSessionId && all.length > 0) {
      setSelectedSessionId(all[0].sessionId);
    }
  };

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }

    dbGetMessages(selectedSessionId).then((msgs) => {
      setMessages(msgs);
      dbMarkSessionAsRead(selectedSessionId);
      setSessions((prev) =>
        prev.map((s) => (s.sessionId === selectedSessionId ? { ...s, unreadCount: 0 } : s))
      );
    });
  }, [selectedSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    requestNotificationPermission();
    loadSessions();

    fetch(`${apiUrl}?view=sessions`)
      .then((res) => res.json())
      .then(async (data) => {
        if (data.sessions && Array.isArray(data.sessions)) {
          for (const s of data.sessions) {
            await dbSaveSession({
              sessionId: s.sessionId,
              clientName: s.clientName,
              startedAt: s.startedAt,
              lastUpdated: s.lastUpdated,
              lastMessage: s.lastMessage,
              unreadCount: 0,
              status: 'active',
            });
          }
          await loadSessions();
        }
      })
      .catch(() => {});

    try {
      const es = new EventSource(`${apiUrl}?view=admin&sse=true`);
      eventSourceRef.current = es;

      es.addEventListener('message', async (e) => {
        try {
          const msg = JSON.parse(e.data) as ChatMessage;
          if (msg && msg.timestamp > lastAdminTimestamp.current) {
            lastAdminTimestamp.current = msg.timestamp;
            await dbSaveMessage(msg);

            setSessions((prev) => {
              const existingIdx = prev.findIndex((s) => s.sessionId === msg.sessionId);
              const isCurrentSession = selectedSessionId === msg.sessionId;
              const unreadDelta = msg.sender === 'client' && !isCurrentSession ? 1 : 0;

              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  lastUpdated: msg.timestamp,
                  lastMessage: msg.text,
                  unreadCount: updated[existingIdx].unreadCount + unreadDelta,
                };
                return updated.sort((a, b) => b.lastUpdated - a.lastUpdated);
              } else {
                return [
                  {
                    sessionId: msg.sessionId,
                    clientName: msg.senderName || 'Client',
                    startedAt: msg.timestamp,
                    lastUpdated: msg.timestamp,
                    lastMessage: msg.text,
                    unreadCount: unreadDelta,
                    status: 'active',
                  },
                  ...prev,
                ];
              }
            });

            if (msg.sessionId === selectedSessionId) {
              setMessages((m) => {
                if (m.some((item) => item.id === msg.id)) return m;
                return [...m, msg];
              });
            }

            if (msg.sender === 'client') {
              if (soundEnabled || document.hidden) {
                triggerNativeNotification(
                  `Live Chat from ${msg.senderName || 'Client'}`,
                  msg.text
                );
              }
            }
          }
        } catch {}
      });
    } catch {}

    return () => {
      eventSourceRef.current?.close();
    };
  }, [selectedSessionId, soundEnabled, apiUrl]);

  const handleSendReply = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const text = (customText || replyText).trim();
    if (!text || !selectedSessionId) return;

    setReplyText('');

    const agentMsg: ChatMessage = {
      id: `agent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId: selectedSessionId,
      sender: 'agent',
      senderName: adminName,
      text,
      timestamp: Date.now(),
      status: 'delivered',
      read: true,
    };

    await dbSaveMessage(agentMsg);
    setMessages((prev) => [...prev, agentMsg]);

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'message', message: agentMsg }),
      });
    } catch {}
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (confirm('Delete this chat log from local device storage?')) {
      await dbDeleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
      }
    }
  };

  const handleDownloadTranscript = () => {
    if (!active) return;
    const header = `CHAT TRANSCRIPT\nBrand: ${brandName}\nSession ID: ${active.sessionId}\nClient: ${active.clientName}\nDate: ${new Date().toLocaleString()}\n----------------------------------------\n\n`;
    const body = messages
      .map((m) => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.sender === 'agent' ? m.senderName || 'Staff' : m.senderName || 'Client'}: ${m.text}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${active.sessionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cannedReplies = [
    '👋 Hello! How may our support team assist you today?',
    '🔍 We are actively reviewing your inquiry. Please allow us a moment.',
    '✅ Your request has been successfully processed.',
    '📧 We have dispatched a confirmation summary to your registered email.',
  ];

  const filtered = sessions.filter(
    (s) =>
      s.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.sessionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const active = sessions.find((s) => s.sessionId === selectedSessionId);

  return (
    <div
      style={{
        display: 'flex',
        height: '650px',
        maxHeight: 'calc(100vh - 100px)',
        backgroundColor: '#0F172A',
        color: '#E2E8F0',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Left Column: Sessions List */}
      <div
        style={{
          width: '320px',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0B132B',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '15px', color: '#FFFFFF' }}>Live Sessions</span>
              <span
                style={{
                  backgroundColor: primaryColor,
                  color: '#FFFFFF',
                  borderRadius: '9999px',
                  fontSize: '11px',
                  padding: '2px 8px',
                  fontWeight: 'bold',
                }}
              >
                {sessions.length}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              {onSwitchToWidget && (
                <button
                  type="button"
                  onClick={onSwitchToWidget}
                  title="Switch to Floating Widget"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: 'none',
                    color: '#94a3b8',
                    padding: '5px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  Widget
                </button>
              )}
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  title="Sign Out"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    padding: '5px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>

          <input
            type="text"
            placeholder="Search visitor / session..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: '#FFFFFF',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: '#64748B', fontSize: '13px' }}>
              No active chat sessions
            </div>
          ) : (
            filtered.map((s) => {
              const isSelected = s.sessionId === selectedSessionId;
              const timeStr = new Date(s.lastUpdated).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={s.sessionId}
                  onClick={() => setSelectedSessionId(s.sessionId)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#1E293B' : 'transparent',
                    borderLeft: isSelected ? `3px solid ${primaryColor}` : '3px solid transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ overflow: 'hidden', paddingRight: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#FFFFFF' }}>
                      {s.clientName || 'Visitor'}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#94A3B8',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '180px',
                      }}
                    >
                      {s.lastMessage || 'Started chat'}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '10px', color: '#64748B' }}>{timeStr}</div>
                    {s.unreadCount > 0 && (
                      <span
                        style={{
                          backgroundColor: '#EF4444',
                          color: '#FFFFFF',
                          borderRadius: '9999px',
                          fontSize: '10px',
                          padding: '2px 6px',
                          fontWeight: 'bold',
                        }}
                      >
                        {s.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Active Conversation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#090E17' }}>
        {active ? (
          <>
            {/* Header */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#0B132B',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#FFFFFF' }}>{active.clientName}</div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  Session: <span style={{ color: primaryColor }}>{active.sessionId}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleDownloadTranscript}
                  title="Export Transcript"
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#94a3b8',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: soundEnabled ? primaryColor : '#64748B',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {soundEnabled ? '🔔 Alert On' : '🔕 Muted'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSession(active.sessionId)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#EF4444',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Message Area */}
            <div
              style={{
                flex: 1,
                padding: '16px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {messages.map((m) => {
                const isAgent = m.sender === 'agent';
                const timeStr = new Date(m.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      justifyContent: isAgent ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '75%',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        backgroundColor: isAgent ? primaryColor : '#1E293B',
                        color: '#FFFFFF',
                        lineHeight: '1.45',
                        fontSize: '13.5px',
                        wordBreak: 'break-word',
                      }}
                    >
                      <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '2px', textTransform: 'uppercase' }}>
                        {isAgent ? m.senderName || adminName : m.senderName || 'Visitor'}
                      </div>
                      <div>{m.text}</div>
                      <div style={{ fontSize: '10px', opacity: 0.7, textAlign: 'right', marginTop: '4px' }}>
                        {timeStr}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Canned Responses */}
            <div
              style={{
                padding: '8px 12px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#0B132B',
                display: 'flex',
                gap: '6px',
                overflowX: 'auto',
              }}
            >
              {cannedReplies.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendReply(undefined, r)}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#CBD5E1',
                    borderRadius: '20px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Reply Composer */}
            <form
              onSubmit={(e) => handleSendReply(e)}
              style={{
                padding: '12px 16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#0B132B',
                display: 'flex',
                gap: '8px',
              }}
            >
              <input
                type="text"
                placeholder={`Reply as ${adminName}...`}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={!replyText.trim()}
                style={{
                  backgroundColor: primaryColor,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 18px',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: !replyText.trim() ? 'not-allowed' : 'pointer',
                  opacity: !replyText.trim() ? 0.5 : 1,
                }}
              >
                Send Reply
              </button>
            </form>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
            Select a session from the list to start chatting
          </div>
        )}
      </div>
    </div>
  );
};
