import { dbGetMessages, dbSaveMessage } from './indexedDb';
import { getOrCreateClientSessionId, getClientName, resolveSupportEmail } from './session';
import { triggerNativeNotification, requestNotificationPermission } from './notifications';
export class ChatClient {
    constructor(options) {
        Object.defineProperty(this, "sessionId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "clientName", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "supportEmail", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "apiUrl", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "listeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "lastTimestamp", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "pollInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "eventSource", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "welcomeMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.sessionId = options?.sessionId || getOrCreateClientSessionId();
        this.clientName = options?.clientName || getClientName();
        this.supportEmail = resolveSupportEmail(options?.supportEmail);
        this.apiUrl = options?.apiUrl || '/api/live-chat/relay';
        this.welcomeMessage = options?.welcomeMessage;
    }
    getSessionId() {
        return this.sessionId;
    }
    getSupportEmail() {
        return this.supportEmail;
    }
    async init() {
        const history = await dbGetMessages(this.sessionId);
        if (history.length > 0) {
            this.lastTimestamp = Math.max(...history.map((m) => m.timestamp));
        }
        else {
            const defaultText = this.welcomeMessage ||
                `Hello! 👋 Welcome to Concierge Support. How can we assist you today? (You can also reach our desk at ${this.supportEmail})`;
            const initialGreeting = {
                id: `greet_${Date.now()}`,
                sessionId: this.sessionId,
                sender: 'agent',
                senderName: 'VIP Concierge',
                text: defaultText,
                timestamp: Date.now(),
                status: 'delivered',
                read: true,
            };
            await dbSaveMessage(initialGreeting);
            history.push(initialGreeting);
            this.lastTimestamp = initialGreeting.timestamp;
        }
        this.startRealtimeStream();
        return history;
    }
    onMessage(cb) {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }
    async sendMessage(text) {
        const trimmed = text.trim();
        if (!trimmed)
            throw new Error('Message cannot be empty');
        const msg = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            sessionId: this.sessionId,
            sender: 'client',
            senderName: this.clientName,
            text: trimmed,
            timestamp: Date.now(),
            status: 'sending',
            read: true,
        };
        await dbSaveMessage(msg);
        this.lastTimestamp = msg.timestamp;
        this.notifyListeners(msg);
        try {
            const res = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(msg),
            });
            if (res.ok) {
                msg.status = 'delivered';
                await dbSaveMessage(msg);
                this.notifyListeners(msg);
            }
        }
        catch { }
        requestNotificationPermission();
        return msg;
    }
    startRealtimeStream() {
        if (typeof window === 'undefined')
            return;
        try {
            this.eventSource = new EventSource(`${this.apiUrl}?sessionId=${encodeURIComponent(this.sessionId)}&sse=true`);
            this.eventSource.addEventListener('message', async (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data && data.sender === 'agent' && data.timestamp > this.lastTimestamp) {
                        this.lastTimestamp = data.timestamp;
                        await dbSaveMessage({ ...data, read: false, status: 'delivered' });
                        this.notifyListeners(data);
                        if (document.hidden) {
                            triggerNativeNotification(`New message from ${data.senderName || 'VIP Concierge'}`, data.text);
                        }
                    }
                }
                catch { }
            });
            this.eventSource.onerror = () => {
                this.eventSource?.close();
                this.startPolling();
            };
        }
        catch {
            this.startPolling();
        }
    }
    startPolling() {
        if (this.pollInterval)
            return;
        this.pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`${this.apiUrl}?sessionId=${encodeURIComponent(this.sessionId)}&after=${this.lastTimestamp}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.messages && Array.isArray(data.messages)) {
                        for (const msg of data.messages) {
                            if (msg.sender === 'agent' && msg.timestamp > this.lastTimestamp) {
                                this.lastTimestamp = msg.timestamp;
                                await dbSaveMessage({ ...msg, read: false, status: 'delivered' });
                                this.notifyListeners(msg);
                                if (document.hidden) {
                                    triggerNativeNotification(`New message from ${msg.senderName || 'VIP Concierge'}`, msg.text);
                                }
                            }
                        }
                    }
                }
            }
            catch { }
        }, 3000);
    }
    notifyListeners(msg) {
        this.listeners.forEach((fn) => fn(msg));
    }
    destroy() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.listeners.clear();
    }
}
