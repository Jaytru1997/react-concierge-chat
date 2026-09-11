import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { dbGetAllSessions, dbGetMessages, dbSaveMessage, dbSaveSession, dbMarkSessionAsRead, dbDeleteSession, } from '../lib/indexedDb';
import { triggerNativeNotification, requestNotificationPermission } from '../lib/notifications';
import { readFileAsBase64, validateFile, downloadAttachment, formatBytes } from '../lib/fileHelper';
export const AdminLiveChat = ({ adminName = 'Staff Support', apiUrl = '/api/live-chat/relay', primaryColor = '#0d7490', brandName = 'Live Concierge Desk', onSwitchToWidget, onSignOut, }) => {
    const [sessions, setSessions] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [replyText, setReplyText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [pendingAttachments, setPendingAttachments] = useState([]);
    const [fileError, setFileError] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const messagesEndRef = useRef(null);
    const lastAdminTimestamp = useRef(0);
    const eventSourceRef = useRef(null);
    const fileInputRef = useRef(null);
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
            setSessions((prev) => prev.map((s) => (s.sessionId === selectedSessionId ? { ...s, unreadCount: 0 } : s)));
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
            .catch(() => { });
        try {
            const es = new EventSource(`${apiUrl}?sessionId=all&mode=sse`);
            eventSourceRef.current = es;
            es.addEventListener('message', async (e) => {
                try {
                    const msg = JSON.parse(e.data);
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
                            }
                            else {
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
                                if (m.some((item) => item.id === msg.id))
                                    return m;
                                return [...m, msg];
                            });
                        }
                        if (msg.sender === 'client') {
                            if (soundEnabled || document.hidden) {
                                const snippet = msg.text || (msg.attachments?.length ? `📎 ${msg.attachments[0].name}` : 'New message');
                                triggerNativeNotification(`Live Chat from ${msg.senderName || 'Client'}`, snippet);
                            }
                        }
                    }
                }
                catch { }
            });
        }
        catch { }
        return () => {
            eventSourceRef.current?.close();
        };
    }, [selectedSessionId, soundEnabled, apiUrl]);
    const handleFileSelect = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0)
            return;
        setFileError(null);
        const newAttachments = [];
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
            }
            catch {
                setFileError('Failed to encode attachment');
            }
        }
        if (newAttachments.length > 0) {
            setPendingAttachments((prev) => [...prev, ...newAttachments]);
        }
        if (fileInputRef.current)
            fileInputRef.current.value = '';
    };
    const handleSendReply = async (e, customText) => {
        if (e)
            e.preventDefault();
        const text = (customText || replyText).trim();
        if ((!text && pendingAttachments.length === 0) || !selectedSessionId)
            return;
        setReplyText('');
        const attachmentsToSend = [...pendingAttachments];
        setPendingAttachments([]);
        setFileError(null);
        const agentMsg = {
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
        }
        catch { }
    };
    const handleDeleteSession = async (sessionId) => {
        if (confirm('Delete this chat log from local device storage?')) {
            await dbDeleteSession(sessionId);
            setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
            if (selectedSessionId === sessionId) {
                setSelectedSessionId(null);
            }
        }
    };
    const handleDownloadTranscript = () => {
        if (!active)
            return;
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
    const filtered = sessions.filter((s) => s.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.sessionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase()));
    const active = sessions.find((s) => s.sessionId === selectedSessionId);
    return (_jsxs("div", { style: {
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
        }, children: [_jsxs("div", { style: {
                    width: '320px',
                    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                    backgroundColor: '#0B132B',
                    display: 'flex',
                    flexDirection: 'column',
                }, children: [_jsxs("div", { style: { padding: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("span", { style: { fontWeight: 600, fontSize: '15px', color: '#FFFFFF' }, children: "Live Sessions" }), _jsx("span", { style: {
                                                    backgroundColor: primaryColor,
                                                    color: '#FFFFFF',
                                                    borderRadius: '9999px',
                                                    fontSize: '11px',
                                                    padding: '2px 8px',
                                                    fontWeight: 'bold',
                                                }, children: sessions.length })] }), _jsxs("div", { style: { display: 'flex', gap: '4px' }, children: [onSwitchToWidget && (_jsx("button", { type: "button", onClick: onSwitchToWidget, title: "Switch to Floating Widget", style: {
                                                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                                    border: 'none',
                                                    color: '#94a3b8',
                                                    padding: '5px 8px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '11px',
                                                }, children: "Widget" })), onSignOut && (_jsx("button", { type: "button", onClick: onSignOut, title: "Sign Out", style: {
                                                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    color: '#f87171',
                                                    padding: '5px 8px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '11px',
                                                }, children: "Sign Out" }))] })] }), _jsx("input", { type: "text", placeholder: "Search visitor / session...", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), style: {
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    color: '#FFFFFF',
                                    fontSize: '13px',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                } })] }), _jsx("div", { style: { flex: 1, overflowY: 'auto', padding: '8px' }, children: filtered.length === 0 ? (_jsx("div", { style: { textAlign: 'center', padding: '40px 10px', color: '#64748B', fontSize: '13px' }, children: "No active chat sessions" })) : (filtered.map((s) => {
                            const isSelected = s.sessionId === selectedSessionId;
                            const timeStr = new Date(s.lastUpdated).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                            });
                            return (_jsxs("div", { onClick: () => setSelectedSessionId(s.sessionId), style: {
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
                                }, children: [_jsxs("div", { style: { overflow: 'hidden', paddingRight: '8px' }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: '13px', color: '#FFFFFF' }, children: s.clientName || 'Visitor' }), _jsx("div", { style: {
                                                    fontSize: '11px',
                                                    color: '#94A3B8',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    maxWidth: '180px',
                                                }, children: s.lastMessage || 'Started chat' })] }), _jsxs("div", { style: { textAlign: 'right', flexShrink: 0 }, children: [_jsx("div", { style: { fontSize: '10px', color: '#64748B' }, children: timeStr }), s.unreadCount > 0 && (_jsx("span", { style: {
                                                    backgroundColor: '#EF4444',
                                                    color: '#FFFFFF',
                                                    borderRadius: '9999px',
                                                    fontSize: '10px',
                                                    padding: '2px 6px',
                                                    fontWeight: 'bold',
                                                }, children: s.unreadCount }))] })] }, s.sessionId));
                        })) })] }), _jsx("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#090E17' }, children: active ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                padding: '14px 20px',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                backgroundColor: '#0B132B',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, fontSize: '14px', color: '#FFFFFF' }, children: active.clientName }), _jsxs("div", { style: { fontSize: '11px', color: '#64748B' }, children: ["Session: ", _jsx("span", { style: { color: primaryColor }, children: active.sessionId })] })] }), _jsxs("div", { style: { display: 'flex', gap: '8px' }, children: [_jsx("button", { type: "button", onClick: handleDownloadTranscript, title: "Export Transcript", style: {
                                                backgroundColor: 'transparent',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                color: '#94a3b8',
                                                borderRadius: '8px',
                                                padding: '6px 10px',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                            }, children: "Export" }), _jsx("button", { type: "button", onClick: () => setSoundEnabled(!soundEnabled), style: {
                                                backgroundColor: 'transparent',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                color: soundEnabled ? primaryColor : '#64748B',
                                                borderRadius: '8px',
                                                padding: '6px 10px',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                            }, children: soundEnabled ? '🔔 Alert On' : '🔕 Muted' }), _jsx("button", { type: "button", onClick: () => handleDeleteSession(active.sessionId), style: {
                                                backgroundColor: 'transparent',
                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                color: '#EF4444',
                                                borderRadius: '8px',
                                                padding: '6px 10px',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                            }, children: "Delete" })] })] }), _jsxs("div", { style: {
                                flex: 1,
                                padding: '16px',
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px',
                            }, children: [messages.map((m) => {
                                    const isAgent = m.sender === 'agent';
                                    const timeStr = new Date(m.timestamp).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    });
                                    return (_jsx("div", { style: {
                                            display: 'flex',
                                            justifyContent: isAgent ? 'flex-end' : 'flex-start',
                                        }, children: _jsxs("div", { style: {
                                                maxWidth: '75%',
                                                padding: '10px 14px',
                                                borderRadius: '12px',
                                                backgroundColor: isAgent ? primaryColor : '#1E293B',
                                                color: '#FFFFFF',
                                                lineHeight: '1.45',
                                                fontSize: '13.5px',
                                                wordBreak: 'break-word',
                                            }, children: [_jsx("div", { style: { fontSize: '10px', opacity: 0.7, marginBottom: '2px', textTransform: 'uppercase' }, children: isAgent ? m.senderName || adminName : m.senderName || 'Visitor' }), m.text && _jsx("div", { children: m.text }), m.attachments && m.attachments.length > 0 && (_jsx("div", { style: { marginTop: m.text ? '8px' : '0', display: 'flex', flexDirection: 'column', gap: '6px' }, children: m.attachments.map((att, idx) => (_jsx("div", { children: att.type === 'image' ? (_jsxs("div", { onClick: () => setPreviewImage(att.data), style: {
                                                                borderRadius: '8px',
                                                                overflow: 'hidden',
                                                                cursor: 'pointer',
                                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                                                maxWidth: '260px',
                                                            }, children: [_jsx("img", { src: att.data, alt: att.name, style: {
                                                                        width: '100%',
                                                                        height: 'auto',
                                                                        maxHeight: '180px',
                                                                        objectFit: 'cover',
                                                                        display: 'block',
                                                                    } }), _jsxs("div", { style: {
                                                                        fontSize: '11px',
                                                                        padding: '4px 8px',
                                                                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                                                        color: '#e2e8f0',
                                                                        display: 'flex',
                                                                        justifyContent: 'space-between',
                                                                    }, children: [_jsx("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }, children: att.name }), _jsx("span", { children: formatBytes(att.size) })] })] })) : (_jsxs("div", { onClick: () => downloadAttachment(att), style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                padding: '8px 10px',
                                                                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                                borderRadius: '8px',
                                                                cursor: 'pointer',
                                                                transition: 'background 0.2s',
                                                            }, children: [_jsx("div", { style: {
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
                                                                    }, children: "PDF" }), _jsxs("div", { style: { overflow: 'hidden', flex: 1 }, children: [_jsx("div", { style: { fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: att.name }), _jsxs("div", { style: { fontSize: '10px', opacity: 0.75 }, children: [formatBytes(att.size), " \u2022 Click to download"] })] }), _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), _jsx("polyline", { points: "7 10 12 15 17 10" }), _jsx("line", { x1: "12", y1: "15", x2: "12", y2: "3" })] })] })) }, idx))) })), _jsx("div", { style: { fontSize: '10px', opacity: 0.7, textAlign: 'right', marginTop: '4px' }, children: timeStr })] }) }, m.id));
                                }), _jsx("div", { ref: messagesEndRef })] }), _jsx("div", { style: {
                                padding: '8px 12px',
                                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                                backgroundColor: '#0B132B',
                                display: 'flex',
                                gap: '6px',
                                overflowX: 'auto',
                            }, children: cannedReplies.map((r, idx) => (_jsx("button", { type: "button", onClick: () => handleSendReply(undefined, r), style: {
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    color: '#CBD5E1',
                                    borderRadius: '20px',
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }, children: r }, idx))) }), pendingAttachments.length > 0 && (_jsx("div", { style: {
                                padding: '6px 16px',
                                backgroundColor: '#0f172a',
                                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                                display: 'flex',
                                gap: '8px',
                                overflowX: 'auto',
                            }, children: pendingAttachments.map((att, idx) => (_jsxs("div", { style: {
                                    padding: '4px 8px',
                                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '11px',
                                    color: '#e2e8f0',
                                }, children: [_jsx("span", { children: att.type === 'pdf' ? '📄' : '🖼️' }), _jsx("span", { style: { maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: att.name }), _jsx("button", { type: "button", onClick: () => setPendingAttachments((p) => p.filter((_, i) => i !== idx)), style: {
                                            background: 'none',
                                            border: 'none',
                                            color: '#f87171',
                                            cursor: 'pointer',
                                            padding: '0 2px',
                                            fontSize: '13px',
                                        }, children: "\u00D7" })] }, idx))) })), fileError && (_jsx("div", { style: {
                                padding: '4px 16px',
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                color: '#f87171',
                                fontSize: '11px',
                            }, children: fileError })), _jsxs("form", { onSubmit: (e) => handleSendReply(e), style: {
                                padding: '12px 16px',
                                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                                backgroundColor: '#0B132B',
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'center',
                            }, children: [_jsx("input", { type: "file", ref: fileInputRef, onChange: handleFileSelect, accept: "image/png,image/jpeg,image/webp,image/gif,application/pdf", style: { display: 'none' }, multiple: true }), _jsx("button", { type: "button", onClick: () => fileInputRef.current?.click(), title: "Attach image or PDF (strictly in-memory)", style: {
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#94a3b8',
                                        cursor: 'pointer',
                                        padding: '8px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }, children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" }) }) }), _jsx("input", { type: "text", placeholder: `Reply as ${adminName}...`, value: replyText, onChange: (e) => setReplyText(e.target.value), style: {
                                        flex: 1,
                                        padding: '10px 14px',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                        color: '#FFFFFF',
                                        fontSize: '13px',
                                        outline: 'none',
                                    } }), _jsx("button", { type: "submit", disabled: !replyText.trim() && pendingAttachments.length === 0, style: {
                                        backgroundColor: primaryColor,
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '10px',
                                        padding: '10px 18px',
                                        fontWeight: 'bold',
                                        fontSize: '13px',
                                        cursor: (!replyText.trim() && pendingAttachments.length === 0) ? 'not-allowed' : 'pointer',
                                        opacity: (!replyText.trim() && pendingAttachments.length === 0) ? 0.5 : 1,
                                    }, children: "Send Reply" })] })] })) : (_jsx("div", { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }, children: "Select a session from the list to start chatting" })) }), previewImage && (_jsx("div", { style: {
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    zIndex: 1000000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                }, onClick: () => setPreviewImage(null), children: _jsxs("div", { style: { position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }, children: [_jsx("img", { src: previewImage, alt: "Preview", style: {
                                maxWidth: '100%',
                                maxHeight: '85vh',
                                objectFit: 'contain',
                                borderRadius: '12px',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                            } }), _jsx("button", { onClick: () => setPreviewImage(null), style: {
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
                            }, children: "\u00D7" })] }) }))] }));
};
