import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { ChatClient } from '../lib/chatClient';
import { dbMarkSessionAsRead } from '../lib/indexedDb';
import { requestNotificationPermission } from '../lib/notifications';
import { readFileAsBase64, validateFile, downloadAttachment, formatBytes } from '../lib/fileHelper';
export const LiveChatWidget = ({ supportEmail, brandName = 'Concierge Desk', primaryColor = '#0d7490', apiUrl = '/api/live-chat/relay', position = 'bottom-right', welcomeMessage, currentUser, onStaffLoginClick, onSignOut, }) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [inputVal, setInputVal] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const [isSending, setIsSending] = useState(false);
    const [pendingAttachments, setPendingAttachments] = useState([]);
    const [fileError, setFileError] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const clientRef = useRef(null);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    useEffect(() => {
        const client = new ChatClient({ supportEmail, apiUrl, welcomeMessage });
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
    }, [supportEmail, apiUrl, welcomeMessage]);
    useEffect(() => {
        if (modalOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, modalOpen, pendingAttachments]);
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
    const handleRemovePendingAttachment = (index) => {
        setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
    };
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if ((!inputVal.trim() && pendingAttachments.length === 0) || !clientRef.current || isSending)
            return;
        const textToSend = inputVal.trim();
        const attachmentsToSend = [...pendingAttachments];
        setInputVal('');
        setPendingAttachments([]);
        setFileError(null);
        setIsSending(true);
        try {
            await clientRef.current.sendMessage(textToSend, attachmentsToSend);
        }
        catch {
        }
        finally {
            setIsSending(false);
        }
    };
    const isLeft = position === 'bottom-left';
    const isStaffUser = currentUser?.role === 'admin' || currentUser?.role === 'staff';
    return (_jsxs(_Fragment, { children: [_jsx("div", { style: {
                    position: 'fixed',
                    bottom: '24px',
                    [isLeft ? 'left' : 'right']: '24px',
                    zIndex: 99999,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                }, children: _jsxs("button", { type: "button", onClick: handleToggleModal, style: {
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
                    }, "aria-label": "Open live chat", children: [_jsx("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M4.5 3C3.67 3 3 3.67 3 4.5V16.5C3 17.33 3.67 18 4.5 18H7V21.5L11.5 18H19.5C20.33 18 21 17.33 21 16.5V4.5C21 3.67 20.33 3 19.5 3H4.5ZM8 11.5C7.45 11.5 7 11.05 7 10.5C7 9.95 7.45 9.5 8 9.5C8.55 9.5 9 9.95 9 10.5C9 11.05 8.55 11.5 8 11.5ZM12 11.5C11.45 11.5 11 11.05 11 10.5C11 9.95 11.45 9.5 12 9.5C12.55 9.5 13 9.95 13 10.5C13 11.05 12.55 11.5 12 11.5ZM16 11.5C15.45 11.5 15 11.05 15 10.5C15 9.95 15.45 9.5 16 9.5C16.55 9.5 17 9.95 17 10.5C17 11.05 16.55 11.5 16 11.5Z" }) }), unreadCount > 0 && (_jsx("span", { style: {
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
                            }, children: unreadCount > 9 ? '9+' : unreadCount }))] }) }), modalOpen && (_jsxs("div", { style: {
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
                }, children: [_jsxs("div", { style: {
                            padding: '14px 16px',
                            backgroundColor: '#1e293b',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '10px' }, children: [_jsxs("div", { style: {
                                            position: 'relative',
                                            width: '36px',
                                            height: '36px',
                                            borderRadius: '10px',
                                            backgroundColor: `${primaryColor}25`,
                                            border: `1px solid ${primaryColor}50`,
                                            color: primaryColor,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 'bold',
                                            fontSize: '16px',
                                        }, children: ["\uD83D\uDCAC", _jsx("span", { style: {
                                                    position: 'absolute',
                                                    bottom: '-2px',
                                                    right: '-2px',
                                                    width: '10px',
                                                    height: '10px',
                                                    backgroundColor: '#10B981',
                                                    borderRadius: '50%',
                                                    border: '1.5px solid #1e293b',
                                                } })] }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: '700', fontSize: '14px', lineHeight: '1.2' }, children: brandName }), _jsx("div", { style: { fontSize: '11px', color: '#94a3b8' }, children: currentUser ? `Logged in: ${currentUser.name}` : 'Live Agents Online' })] })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '4px' }, children: [onStaffLoginClick && (_jsx("button", { type: "button", onClick: onStaffLoginClick, title: isStaffUser ? 'Switch to Staff Desk' : 'Staff Sign In', style: {
                                            background: isStaffUser ? `${primaryColor}30` : 'transparent',
                                            border: isStaffUser ? `1px solid ${primaryColor}60` : 'none',
                                            color: isStaffUser ? '#38bdf8' : '#94a3b8',
                                            cursor: 'pointer',
                                            padding: '6px',
                                            borderRadius: '6px',
                                            display: 'flex',
                                            alignItems: 'center',
                                        }, children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "11", width: "18", height: "11", rx: "2", ry: "2" }), _jsx("path", { d: "M7 11V7a5 5 0 0 1 10 0v4" })] }) })), currentUser && onSignOut && (_jsx("button", { type: "button", onClick: onSignOut, title: "Sign Out", style: {
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#94a3b8',
                                            cursor: 'pointer',
                                            padding: '6px',
                                            borderRadius: '6px',
                                            display: 'flex',
                                            alignItems: 'center',
                                        }, children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }), _jsx("polyline", { points: "16 17 21 12 16 7" }), _jsx("line", { x1: "21", y1: "12", x2: "9", y2: "12" })] }) })), _jsx("button", { type: "button", onClick: () => setModalOpen(false), style: {
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#94a3b8',
                                            cursor: 'pointer',
                                            padding: '6px',
                                            borderRadius: '6px',
                                            display: 'flex',
                                            alignItems: 'center',
                                        }, "aria-label": "Close live chat", children: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] })] }), _jsxs("div", { style: {
                            flex: 1,
                            padding: '16px',
                            overflowY: 'auto',
                            backgroundColor: '#090d16',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            fontSize: '13.5px',
                        }, children: [messages.map((m) => {
                                const isClient = m.sender === 'client';
                                const timeStr = new Date(m.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                });
                                return (_jsx("div", { style: {
                                        display: 'flex',
                                        justifyContent: isClient ? 'flex-end' : 'flex-start',
                                    }, children: _jsxs("div", { style: {
                                            maxWidth: '85%',
                                            padding: '10px 14px',
                                            borderRadius: '12px',
                                            backgroundColor: isClient ? primaryColor : '#1e293b',
                                            color: '#f8fafc',
                                            border: isClient ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                                            lineHeight: '1.45',
                                            wordBreak: 'break-word',
                                        }, children: [!isClient && m.senderName && (_jsx("div", { style: { fontSize: '10px', fontWeight: 'bold', color: '#38bdf8', marginBottom: '3px', textTransform: 'uppercase' }, children: m.senderName })), m.text && _jsx("div", { children: m.text }), m.attachments && m.attachments.length > 0 && (_jsx("div", { style: { marginTop: m.text ? '8px' : '0', display: 'flex', flexDirection: 'column', gap: '6px' }, children: m.attachments.map((att, idx) => (_jsx("div", { children: att.type === 'image' ? (_jsxs("div", { onClick: () => setPreviewImage(att.data), style: {
                                                            borderRadius: '8px',
                                                            overflow: 'hidden',
                                                            cursor: 'pointer',
                                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                                            maxWidth: '240px',
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
                                                                }, children: [_jsx("span", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }, children: att.name }), _jsx("span", { children: formatBytes(att.size) })] })] })) : (_jsxs("div", { onClick: () => downloadAttachment(att), style: {
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
                                                                }, children: "PDF" }), _jsxs("div", { style: { overflow: 'hidden', flex: 1 }, children: [_jsx("div", { style: { fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: att.name }), _jsxs("div", { style: { fontSize: '10px', opacity: 0.75 }, children: [formatBytes(att.size), " \u2022 Click to download"] })] }), _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), _jsx("polyline", { points: "7 10 12 15 17 10" }), _jsx("line", { x1: "12", y1: "15", x2: "12", y2: "3" })] })] })) }, idx))) })), _jsxs("div", { style: {
                                                    fontSize: '10px',
                                                    marginTop: '4px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    justifyContent: isClient ? 'flex-end' : 'flex-start',
                                                    color: isClient ? 'rgba(255, 255, 255, 0.7)' : '#94a3b8',
                                                }, children: [_jsx("span", { children: timeStr }), isClient && (_jsx("span", { children: m.status === 'sending' ? '⏳' : m.status === 'read' ? '✓✓' : '✓' }))] })] }) }, m.id));
                            }), _jsx("div", { ref: messagesEndRef })] }), pendingAttachments.length > 0 && (_jsx("div", { style: {
                            padding: '8px 12px',
                            backgroundColor: '#1e293b',
                            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            gap: '8px',
                            overflowX: 'auto',
                        }, children: pendingAttachments.map((att, idx) => (_jsxs("div", { style: {
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
                            }, children: [_jsx("span", { children: att.type === 'pdf' ? '📄' : '🖼️' }), _jsx("span", { style: { maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: att.name }), _jsx("button", { type: "button", onClick: () => handleRemovePendingAttachment(idx), style: {
                                        background: 'none',
                                        border: 'none',
                                        color: '#f87171',
                                        cursor: 'pointer',
                                        padding: '0 2px',
                                        fontSize: '13px',
                                    }, children: "\u00D7" })] }, idx))) })), fileError && (_jsx("div", { style: {
                            padding: '6px 12px',
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            fontSize: '11px',
                            borderTop: '1px solid rgba(239, 68, 68, 0.3)',
                        }, children: fileError })), _jsxs("form", { onSubmit: handleSendMessage, style: {
                            padding: '12px 14px',
                            backgroundColor: '#0f172a',
                            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center',
                        }, children: [_jsx("input", { type: "file", ref: fileInputRef, onChange: handleFileSelect, accept: "image/png,image/jpeg,image/webp,image/gif,application/pdf", style: { display: 'none' }, multiple: true }), _jsx("button", { type: "button", onClick: () => fileInputRef.current?.click(), title: "Attach image or PDF (strictly in-memory)", style: {
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }, children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" }) }) }), _jsx("input", { type: "text", placeholder: "Type a message or attach a file...", value: inputVal, onChange: (e) => setInputVal(e.target.value), disabled: isSending, style: {
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    backgroundColor: '#1e293b',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    color: '#f8fafc',
                                    fontSize: '13px',
                                    outline: 'none',
                                } }), _jsx("button", { type: "submit", disabled: (!inputVal.trim() && pendingAttachments.length === 0) || isSending, style: {
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
                                }, children: _jsx("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-6.054-2.685z" }) }) })] })] })), previewImage && (_jsx("div", { style: {
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
