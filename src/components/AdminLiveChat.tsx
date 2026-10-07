import React, { useState, useEffect, useRef } from 'react';
import { ChatAttachment, ChatMessage, ChatSession, AdminLiveChatProps } from '../types';
import {
  dbGetAllSessions,
  dbGetMessages,
  dbSaveMessage,
  dbSaveSession,
  dbMarkSessionAsRead,
  dbDeleteSession,
} from '../lib/indexedDb';
import { triggerNativeNotification, requestNotificationPermission } from '../lib/notifications';
import { readFileAsBase64, validateFile, downloadAttachment, formatBytes } from '../lib/fileHelper';

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
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastAdminTimestamp = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      setIsMobile(mobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const loadSessions = async () => {
    const all = await dbGetAllSessions();
    setSessions(all);
    if (!selectedSessionId && all.length > 0 && !isMobile) {
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
  }, [messages, pendingAttachments]);

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
      const es = new EventSource(`${apiUrl}?sessionId=all&mode=sse`);
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
              const snippet = msg.text || (msg.attachments?.length ? `📎 ${msg.attachments[0].name}` : 'File sent');

              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  lastUpdated: msg.timestamp,
                  lastMessage: snippet,
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
                    lastMessage: snippet,
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
                const snippet = msg.text || (msg.attachments?.length ? `📎 ${msg.attachments[0].name}` : 'New message');
                triggerNativeNotification(
                  `Live Chat from ${msg.senderName || 'Client'}`,
                  snippet
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setFileError(null);
    const newAttachments: ChatAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = validateFile(file);
      if (!validation.valid) {
        setFileError(validation.error || 'Invalid file');
        continue;
      }

      try {
        const encoded = await readFileAsBase64(file);
        newAttachments.push(encoded);
      } catch {
        setFileError('Failed to encode attachment');
      }
    }

    if (newAttachments.length > 0) {
      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendReply = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const text = (customText || replyText).trim();
    if ((!text && pendingAttachments.length === 0) || !selectedSessionId) return;

    setReplyText('');
    const attachmentsToSend = [...pendingAttachments];
    setPendingAttachments([]);
    setFileError(null);

    const agentMsg: ChatMessage = {
      id: `agent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId: selectedSessionId,
      sender: 'agent',
      senderName: adminName,
      text,
      timestamp: Date.now(),
      status: 'delivered',
      read: true,
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
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
        if (isMobile) {
          setMobileView('list');
        }
      }
    }
  };

  const handleDownloadTranscript = () => {
    if (!active) return;
    const header = `CHAT TRANSCRIPT\nBrand: ${brandName}\nSession ID: ${active.sessionId}\nClient: ${active.clientName}\nDate: ${new Date().toLocaleString()}\n----------------------------------------\n\n`;
    const body = messages
      .map((m) => {
        const attInfo = m.attachments?.length ? ` [Attachments: ${m.attachments.map((a) => a.name).join(', ')}]` : '';
        return `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.sender === 'agent' ? m.senderName || 'Staff' : m.senderName || 'Client'}: ${m.text || ''}${attInfo}`;
      })
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
    '📄 Please review the attached document.',
    '📧 We have dispatched a confirmation summary to your registered email.',
  ];

  const filtered = sessions.filter(
    (s) =>
      s.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.sessionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const active = sessions.find((s) => s.sessionId === selectedSessionId);
  const otherUnreadCount = sessions
    .filter((s) => s.sessionId !== selectedSessionId)
    .reduce((acc, s) => acc + (s.unreadCount || 0), 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        maxWidth: '100%',
        height: '100%',
        minHeight: isMobile ? '100%' : '650px',
        maxHeight: isMobile ? '100%' : 'calc(100vh - 100px)',
        backgroundColor: '#0F172A',
        color: '#E2E8F0',
        borderRadius: isMobile ? '0' : '16px',
        overflow: 'hidden',
        border: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: isMobile ? 'none' : '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Left Column / Mobile List View: Sessions List */}
      <div
        style={{
          width: isMobile ? '100%' : '300px',
          minWidth: isMobile ? '100%' : '260px',
          maxWidth: isMobile ? '100%' : '320px',
          flexShrink: 0,
          borderRight: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0B132B',
          display: (!isMobile || mobileView === 'list') ? 'flex' : 'none',
          flexDirection: 'column',
          overflow: 'hidden',
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#FFFFFF' }}>Live Sessions</span>
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

            <div style={{ display: 'flex', gap: '6px' }}>
              {onSwitchToWidget && (
                <button
                  type="button"
                  onClick={onSwitchToWidget}
                  title="Switch to Floating Widget"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#94a3b8',
                    padding: '5px 9px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
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
                    padding: '5px 9px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>

          <div style={{ position: 'relative' }}>
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
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px', WebkitOverflowScrolling: 'touch' }}>
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
                  onClick={() => {
                    setSelectedSessionId(s.sessionId);
                    if (isMobile) {
                      setMobileView('chat');
                    }
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#1E293B' : 'transparent',
                    borderLeft: isSelected ? `3px solid ${primaryColor}` : '3px solid transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                    transition: 'all 0.15s ease',
                    minHeight: '48px',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ overflow: 'hidden', paddingRight: '8px', flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.clientName || 'Visitor'}
                    </div>
                    <div
                      style={{
                        fontSize: '11.5px',
                        color: '#94A3B8',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '200px',
                        marginTop: '2px',
                      }}
                    >
                      {s.lastMessage || 'Started chat'}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{ fontSize: '10.5px', color: '#64748B' }}>{timeStr}</div>
                    {s.unreadCount > 0 && (
                      <span
                        style={{
                          backgroundColor: '#EF4444',
                          color: '#FFFFFF',
                          borderRadius: '9999px',
                          fontSize: '10px',
                          padding: '2px 6px',
                          fontWeight: 'bold',
                          boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
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

      {/* Right Column / Mobile Chat View: Active Conversation */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          width: isMobile ? '100%' : 'auto',
          display: (!isMobile || mobileView === 'chat') ? 'flex' : 'none',
          flexDirection: 'column',
          backgroundColor: '#090E17',
          overflow: 'hidden',
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        {active ? (
          <>
            {/* Header */}
            <div
              style={{
                padding: isMobile ? '12px 14px' : '14px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#0B132B',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0,
                minWidth: 0,
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', gap: '8px' }}>
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setMobileView('list')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#FFFFFF',
                      borderRadius: '8px',
                      padding: '6px 9px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    aria-label="Back to sessions list"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    <span>Back</span>
                    {otherUnreadCount > 0 && (
                      <span
                        style={{
                          backgroundColor: '#EF4444',
                          color: '#FFFFFF',
                          borderRadius: '9999px',
                          fontSize: '10px',
                          padding: '1px 5px',
                          fontWeight: 'bold',
                        }}
                      >
                        {otherUnreadCount}
                      </span>
                    )}
                  </button>
                )}

                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {active.clientName}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    ID: <span style={{ color: primaryColor }}>{active.sessionId.substring(0, 16)}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: isMobile ? '4px' : '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleDownloadTranscript}
                  title="Export Transcript"
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#94a3b8',
                    borderRadius: '8px',
                    padding: isMobile ? '6px 8px' : '6px 10px',
                    fontSize: isMobile ? '11px' : '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {!isMobile && <span>Export</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  title={soundEnabled ? 'Alerts Enabled (Click to Mute)' : 'Alerts Muted (Click to Enable)'}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: soundEnabled ? primaryColor : '#64748B',
                    borderRadius: '8px',
                    padding: isMobile ? '6px 8px' : '6px 10px',
                    fontSize: isMobile ? '11px' : '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>{soundEnabled ? '🔔' : '🔕'}</span>
                  {!isMobile && <span>{soundEnabled ? 'Alert On' : 'Muted'}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSession(active.sessionId)}
                  title="Delete Session"
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#EF4444',
                    borderRadius: '8px',
                    padding: isMobile ? '6px 8px' : '6px 10px',
                    fontSize: isMobile ? '11px' : '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  {!isMobile && <span>Delete</span>}
                </button>
              </div>
            </div>

            {/* Message Area */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: isMobile ? '14px 12px' : '16px 20px',
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                width: '100%',
                boxSizing: 'border-box',
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
                      width: '100%',
                      justifyContent: isAgent ? 'flex-end' : 'flex-start',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: isMobile ? '88%' : '75%',
                        minWidth: '100px',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        backgroundColor: isAgent ? primaryColor : '#1E293B',
                        color: '#FFFFFF',
                        lineHeight: '1.45',
                        fontSize: '13.5px',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        boxShadow: isAgent ? `0 4px 12px ${primaryColor}40` : '0 4px 12px rgba(0,0,0,0.2)',
                      }}
                    >
                      <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '2px', textTransform: 'uppercase', fontWeight: 600 }}>
                        {isAgent ? m.senderName || adminName : m.senderName || 'Visitor'}
                      </div>

                      {m.text && <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>}

                      {/* In-Memory Attachment Rendering */}
                      {m.attachments && m.attachments.length > 0 && (
                        <div style={{ marginTop: m.text ? '8px' : '0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {m.attachments.map((att, idx) => (
                            <div key={idx}>
                              {att.type === 'image' ? (
                                <div
                                  onClick={() => setPreviewImage(att.data)}
                                  style={{
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                    maxWidth: isMobile ? '100%' : '260px',
                                  }}
                                >
                                  <img
                                    src={att.data}
                                    alt={att.name}
                                    style={{
                                      width: '100%',
                                      height: 'auto',
                                      maxHeight: '180px',
                                      objectFit: 'cover',
                                      display: 'block',
                                    }}
                                  />
                                  <div
                                    style={{
                                      fontSize: '11px',
                                      padding: '4px 8px',
                                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                      color: '#e2e8f0',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                    }}
                                  >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                                      {att.name}
                                    </span>
                                    <span>{formatBytes(att.size)}</span>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  onClick={() => downloadAttachment(att)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 10px',
                                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: '28px',
                                      height: '28px',
                                      borderRadius: '6px',
                                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                      color: '#ef4444',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontWeight: 'bold',
                                      fontSize: '10px',
                                      flexShrink: 0,
                                    }}
                                  >
                                    PDF
                                  </div>
                                  <div style={{ overflow: 'hidden', flex: 1 }}>
                                    <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {att.name}
                                    </div>
                                    <div style={{ fontSize: '10px', opacity: 0.75 }}>
                                      {formatBytes(att.size)} • Click to download
                                    </div>
                                  </div>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ fontSize: '10px', opacity: 0.7, textAlign: 'right', marginTop: '4px' }}>
                        {timeStr}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Canned Quick Replies */}
            <div
              style={{
                padding: '8px 12px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#0B132B',
                display: 'flex',
                gap: '6px',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                maxWidth: '100%',
                flexShrink: 0,
                boxSizing: 'border-box',
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
                    padding: '5px 12px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Pending Attachments Tray */}
            {pendingAttachments.length > 0 && (
              <div
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#0f172a',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  gap: '8px',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                }}
              >
                {pendingAttachments.map((att, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      color: '#e2e8f0',
                      flexShrink: 0,
                    }}
                  >
                    <span>{att.type === 'pdf' ? '📄' : '🖼️'}</span>
                    <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {att.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingAttachments((p) => p.filter((_, i) => i !== idx))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#f87171',
                        cursor: 'pointer',
                        padding: '0 2px',
                        fontSize: '13px',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* File Error Alert */}
            {fileError && (
              <div
                style={{
                  padding: '4px 16px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  fontSize: '11px',
                  flexShrink: 0,
                }}
              >
                {fileError}
              </div>
            )}

            {/* Reply Composer with Paperclip Attachment Trigger */}
            <form
              onSubmit={(e) => handleSendReply(e)}
              style={{
                padding: isMobile ? '10px 12px' : '12px 16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#0B132B',
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                flexShrink: 0,
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              {/* Hidden File Input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                style={{ display: 'none' }}
                multiple
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach image or PDF (strictly in-memory)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: isMobile ? '6px' : '8px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              <input
                type="text"
                placeholder={isMobile ? 'Reply message...' : `Reply as ${adminName}...`}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: isMobile ? '8px 12px' : '10px 14px',
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
                disabled={!replyText.trim() && pendingAttachments.length === 0}
                style={{
                  backgroundColor: primaryColor,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: isMobile ? '8px 12px' : '10px 18px',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: (!replyText.trim() && pendingAttachments.length === 0) ? 'not-allowed' : 'pointer',
                  opacity: (!replyText.trim() && pendingAttachments.length === 0) ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0,
                }}
              >
                <span>{isMobile ? 'Send' : 'Send Reply'}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748B', padding: '24px', textAlign: 'center', gap: '12px' }}>
            <div style={{ fontSize: '14px' }}>Select a session from the list to start chatting</div>
            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileView('list')}
                style={{
                  backgroundColor: primaryColor,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                View Session List
              </button>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen Image Lightbox Modal */}
      {previewImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
            zIndex: 1000000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setPreviewImage(null)}
        >
          <div style={{ position: 'relative', maxWidth: '95vw', maxHeight: '90vh' }}>
            <img
              src={previewImage}
              alt="Preview"
              style={{
                maxWidth: '100%',
                maxHeight: '85vh',
                objectFit: 'contain',
                borderRadius: '12px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              }}
            />
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: '-12px',
                right: '-12px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '16px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
