import React, { useState, useEffect, useRef } from 'react';
import { ChatAttachment, ChatMessage, ChatUser, LiveChatWidgetProps } from '../types';
import { ChatClient } from '../lib/chatClient';
import { dbMarkSessionAsRead } from '../lib/indexedDb';
import { requestNotificationPermission } from '../lib/notifications';
import { readFileAsBase64, validateFile, downloadAttachment, formatBytes } from '../lib/fileHelper';
import { StaffLoginForm } from './StaffLoginForm';

export const LiveChatWidget: React.FC<LiveChatWidgetProps & {
  authRoute?: string | string[];
  onAuthSuccess?: (user: ChatUser) => void;
}> = ({
  supportEmail,
  brandName = 'Concierge Desk',
  logo,
  icon,
  primaryColor = '#0d7490',
  apiUrl = '/api/live-chat/relay',
  position = 'bottom-right',
  welcomeMessage,
  currentUser,
  authRoute,
  onAuthSuccess,
  onStaffLoginClick,
  onSignOut,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'auth'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const clientRef = useRef<ChatClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const client = new ChatClient({ supportEmail, brandName, apiUrl, welcomeMessage });
    clientRef.current = client;

    client.init().then((history) => {
      setMessages(history);
    });

    const unsubscribe = client.onMessage((newMsg) => {
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === newMsg.id);
        if (exists) {
          return prev.map((m) => (m.id === newMsg.id ? newMsg : m));
        }
        return [...prev, newMsg];
      });

      if (!modalOpen && newMsg.sender === 'agent') {
        setUnreadCount((c) => c + 1);
      }
    });

    const handleExternalOpen = () => {
      setModalOpen(true);
      setUnreadCount(0);
      if (clientRef.current) {
        dbMarkSessionAsRead(clientRef.current.getSessionId());
      }
    };

    window.addEventListener('concierge:open-live-chat', handleExternalOpen);

    return () => {
      unsubscribe();
      client.destroy();
      window.removeEventListener('concierge:open-live-chat', handleExternalOpen);
    };
  }, [supportEmail, brandName, apiUrl, welcomeMessage]);

  useEffect(() => {
    if (modalOpen && view === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, modalOpen, pendingAttachments, view]);

  const handleToggleModal = () => {
    const nextState = !modalOpen;
    setModalOpen(nextState);
    if (nextState) {
      setUnreadCount(0);
      requestNotificationPermission();
      if (clientRef.current) {
        dbMarkSessionAsRead(clientRef.current.getSessionId());
      }
    }
  };

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

  const handleRemovePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputVal.trim() && pendingAttachments.length === 0) || !clientRef.current || isSending) return;

    const textToSend = inputVal.trim();
    const attachmentsToSend = [...pendingAttachments];
    setInputVal('');
    setPendingAttachments([]);
    setFileError(null);
    setIsSending(true);

    try {
      await clientRef.current.sendMessage(textToSend, attachmentsToSend);
    } catch {
    } finally {
      setIsSending(false);
    }
  };

  const isLeft = position === 'bottom-left';
  const isStaffUser = currentUser?.role === 'admin' || currentUser?.role === 'staff';

  return (
    <>
      {/* Floating Trigger Button */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          [isLeft ? 'left' : 'right']: '24px',
          zIndex: 99999,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <button
          type="button"
          onClick={handleToggleModal}
          style={{
            position: 'relative',
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            backgroundColor: primaryColor,
            color: '#FFFFFF',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 10px 25px ${primaryColor}66`,
            transition: 'all 0.25s ease',
          }}
          aria-label="Open live chat"
        >
          {icon ? (
            icon
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.5 3C3.67 3 3 3.67 3 4.5V16.5C3 17.33 3.67 18 4.5 18H7V21.5L11.5 18H19.5C20.33 18 21 17.33 21 16.5V4.5C21 3.67 20.33 3 19.5 3H4.5ZM8 11.5C7.45 11.5 7 11.05 7 10.5C7 9.95 7.45 9.5 8 9.5C8.55 9.5 9 9.95 9 10.5C9 11.05 8.55 11.5 8 11.5ZM12 11.5C11.45 11.5 11 11.05 11 10.5C11 9.95 11.45 9.5 12 9.5C12.55 9.5 13 9.95 13 10.5C13 11.05 12.55 11.5 12 11.5ZM16 11.5C15.45 11.5 15 11.05 15 10.5C15 9.95 15.45 9.5 16 9.5C16.55 9.5 17 9.95 17 10.5C17 11.05 16.55 11.5 16 11.5Z" />
            </svg>
          )}

          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                backgroundColor: '#EF4444',
                color: '#FFFFFF',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 'bold',
                padding: '2px 6px',
                border: '2px solid #FFFFFF',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Confined Modal Chat Window */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            [isLeft ? 'left' : 'right']: '24px',
            width: '390px',
            maxWidth: 'calc(100vw - 32px)',
            height: '560px',
            maxHeight: 'calc(100vh - 80px)',
            backgroundColor: '#0f172a',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 100000,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#f8fafc',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: '#1e293b',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  position: 'relative',
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: primaryColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: '4px',
                  boxSizing: 'border-box',
                }}
              >
                {logo ? (
                  <img src={logo} alt={brandName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '16px' }}>💬</span>
                )}
                <span
                  style={{
                    position: 'absolute',
                    bottom: '-1px',
                    right: '-1px',
                    width: '9px',
                    height: '9px',
                    backgroundColor: '#10B981',
                    borderRadius: '50%',
                    border: '1.5px solid #1e293b',
                  }}
                />
              </div>
              <div>
                <div style={{ fontWeight: '700', fontSize: '14px', lineHeight: '1.2' }}>{brandName}</div>
                <div
                  style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    maxWidth: '180px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {currentUser ? (
                    <span style={{ color: '#38bdf8' }} title={currentUser.email || currentUser.name}>
                      {currentUser.email || currentUser.name}
                    </span>
                  ) : (
                    'Live Agents Online'
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {/* Confined Inline Staff Login Trigger Button */}
              {!currentUser && (
                <button
                  type="button"
                  onClick={() => setView(view === 'auth' ? 'chat' : 'auth')}
                  title={view === 'auth' ? 'Back to chat' : 'Staff sign in'}
                  style={{
                    background: view === 'auth' ? `${primaryColor}30` : 'transparent',
                    border: view === 'auth' ? `1px solid ${primaryColor}60` : 'none',
                    color: view === 'auth' ? '#38bdf8' : '#94a3b8',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </button>
              )}

              {isStaffUser && onStaffLoginClick && (
                <button
                  type="button"
                  onClick={onStaffLoginClick}
                  title="Open Multi-Session Staff Desk"
                  style={{
                    background: `${primaryColor}30`,
                    border: `1px solid ${primaryColor}60`,
                    color: '#38bdf8',
                    cursor: 'pointer',
                    padding: '5px 8px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  Desk
                </button>
              )}

              {currentUser && onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  title="Sign Out"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              )}

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label="Close live chat"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          {/* Body: Either Confined Inline Staff Login OR Chat Stream */}
          {view === 'auth' ? (
            <StaffLoginForm
              authRoute={authRoute}
              primaryColor={primaryColor}
              onBack={() => setView('chat')}
              onSuccess={(authResult) => {
                onAuthSuccess?.(authResult);
                setView('chat');
              }}
            />
          ) : (
            <>
              {/* Messages Area */}
              <div
                style={{
                  flex: 1,
                  padding: '16px',
                  overflowY: 'auto',
                  backgroundColor: '#090d16',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  fontSize: '13.5px',
                }}
              >
                {messages.map((m) => {
                  const isClient = m.sender === 'client';
                  const timeStr = new Date(m.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        justifyContent: isClient ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '85%',
                          padding: '10px 14px',
                          borderRadius: '12px',
                          backgroundColor: isClient ? primaryColor : '#1e293b',
                          color: '#f8fafc',
                          border: isClient ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                          lineHeight: '1.45',
                          wordBreak: 'break-word',
                        }}
                      >
                        {!isClient && m.senderName && (
                          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#38bdf8', marginBottom: '3px', textTransform: 'uppercase' }}>
                            {m.senderName}
                          </div>
                        )}

                        {m.text && <div>{m.text}</div>}

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
                                      maxWidth: '240px',
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

                        <div
                          style={{
                            fontSize: '10px',
                            marginTop: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: isClient ? 'flex-end' : 'flex-start',
                            color: isClient ? 'rgba(255, 255, 255, 0.7)' : '#94a3b8',
                          }}
                        >
                          <span>{timeStr}</span>
                          {isClient && (
                            <span>{m.status === 'sending' ? '⏳' : m.status === 'read' ? '✓✓' : '✓'}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Pending Attachments Tray */}
              {pendingAttachments.length > 0 && (
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#1e293b',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    gap: '8px',
                    overflowX: 'auto',
                  }}
                >
                  {pendingAttachments.map((att, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        padding: '4px 8px',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        color: '#e2e8f0',
                      }}
                    >
                      <span>{att.type === 'pdf' ? '📄' : '🖼️'}</span>
                      <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {att.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePendingAttachment(idx)}
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
                    padding: '6px 12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    fontSize: '11px',
                    borderTop: '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {fileError}
                </div>
              )}

              {/* Form Input with Paperclip Attachment Trigger */}
              <form
                onSubmit={handleSendMessage}
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#0f172a',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
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

                {/* Paperclip Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image or PDF (strictly in-memory)"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>

                <input
                  type="text"
                  placeholder="Type a message or attach a file..."
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  disabled={isSending}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f8fafc',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />

                <button
                  type="submit"
                  disabled={(!inputVal.trim() && pendingAttachments.length === 0) || isSending}
                  style={{
                    backgroundColor: primaryColor,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    cursor: (!inputVal.trim() && pendingAttachments.length === 0) || isSending ? 'not-allowed' : 'pointer',
                    opacity: (!inputVal.trim() && pendingAttachments.length === 0) || isSending ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-6.054-2.685z" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Fullscreen Image Lightbox Modal */}
      {previewImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            zIndex: 1000000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setPreviewImage(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
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
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
};
