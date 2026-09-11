import { dbGetMessages, dbSaveMessage, dbDeleteMessage } from './indexedDb';
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
        Object.defineProperty(this, "brandName", {
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
        Object.defineProperty(this, "isInitializing", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        this.sessionId = options?.sessionId || getOrCreateClientSessionId();
        this.clientName = options?.clientName || getClientName();
        this.brandName = options?.brandName || 'Support Desk';
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
        if (this.isInitializing) {
            return await dbGetMessages(this.sessionId);
        }
        this.isInitializing = true;
        try {
            let history = await dbGetMessages(this.sessionId);
            const defaultText = this.welcomeMessage ||
                `Hello! 👋 Welcome to ${this.brandName}. How can we assist you today?${this.supportEmail && !this.supportEmail.includes('example.com')
                    ? ` (You can also reach our desk at ${this.supportEmail})`
                    : ''}`;
            // Purge / deduplicate legacy duplicate greetings stored in IndexedDB from earlier versions
            const greetingMessages = history.filter((m) => m.id.startsWith('greet_') ||
                (m.sender === 'agent' && (m.text.includes('Welcome to') || m.text.includes('assist you today'))));
            if (greetingMessages.length > 1) {
                // Keep only 1 greeting and delete the older/duplicate greetings from IndexedDB
                for (let i = 1; i < greetingMessages.length; i++) {
                    await dbDeleteMessage(greetingMessages[i].id).catch(() => { });
                }
                const redundantIds = new Set(greetingMessages.slice(1).map((g) => g.id));
                history = history.filter((m) => !redundantIds.has(m.id));
            }
            // If an existing greeting has old placeholder text ('Welcome to Concierge Support' / 'support@example.com'), migrate it
            if (greetingMessages.length > 0 && !this.welcomeMessage) {
                const primaryGreeting = greetingMessages[0];
                if (primaryGreeting.text.includes('Welcome to Concierge Support') ||
                    primaryGreeting.text.includes('support@example.com') ||
                    primaryGreeting.senderName === 'VIP Concierge') {
                    primaryGreeting.text = defaultText;
                    primaryGreeting.senderName = `${this.brandName} Support`;
                    await dbSaveMessage(primaryGreeting);
                }
            }
            const hasGreetingOrAgent = history.some((m) => m.id.startsWith('greet_') || m.sender === 'agent');
            if (history.length > 0) {
                this.lastTimestamp = Math.max(...history.map((m) => m.timestamp));
            }
            if (!hasGreetingOrAgent && history.length === 0) {
                const initialGreeting = {
                    id: `greet_${this.sessionId}`,
                    sessionId: this.sessionId,
                    sender: 'agent',
                    senderName: `${this.brandName} Support`,
                    text: defaultText,
                    timestamp: Date.now(),
                    status: 'delivered',
                    read: true,
                };
                await dbSaveMessage(initialGreeting);
                history.push(initialGreeting);
                this.lastTimestamp = initialGreeting.timestamp;
            }
            // Deduplicate history strictly by ID
            const uniqueHistory = Array.from(new Map(history.map((m) => [m.id, m])).values()).sort((a, b) => a.timestamp - b.timestamp);
            this.startRealtimeStream();
            return uniqueHistory;
        }
        finally {
            this.isInitializing = false;
        }
    }
    onMessage(cb) {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }
    async sendMessage(text, attachments) {
        const trimmed = text.trim();
        if (!trimmed && (!attachments || attachments.length === 0)) {
            throw new Error('Message or attachment required');
        }
        const msg = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            sessionId: this.sessionId,
            sender: 'client',
            senderName: this.clientName,
            text: trimmed,
            timestamp: Date.now(),
            status: 'sending',
            read: true,
            attachments: attachments && attachments.length > 0 ? attachments : undefined,
        };
        await dbSaveMessage(msg);
        this.lastTimestamp = msg.timestamp;
        this.notifyListeners(msg);
        try {
            const res = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'message', message: msg }),
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
            this.eventSource = new EventSource(`${this.apiUrl}?sessionId=${encodeURIComponent(this.sessionId)}&mode=sse`);
            this.eventSource.addEventListener('message', async (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data && data.sender === 'agent' && data.timestamp > this.lastTimestamp) {
                        this.lastTimestamp = data.timestamp;
                        await dbSaveMessage({ ...data, read: false, status: 'delivered' });
                        this.notifyListeners(data);
                        if (document.hidden) {
                            const snippet = data.text || (data.attachments?.length ? `📎 ${data.attachments[0].name}` : 'New message');
                            triggerNativeNotification(`New message from ${data.senderName || 'VIP Concierge'}`, snippet);
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
                const res = await fetch(`${this.apiUrl}?sessionId=${encodeURIComponent(this.sessionId)}&since=${this.lastTimestamp}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.messages && Array.isArray(data.messages)) {
                        for (const msg of data.messages) {
                            if (msg.sender === 'agent' && msg.timestamp > this.lastTimestamp) {
                                this.lastTimestamp = msg.timestamp;
                                await dbSaveMessage({ ...msg, read: false, status: 'delivered' });
                                this.notifyListeners(msg);
                                if (document.hidden) {
                                    const snippet = msg.text || (msg.attachments?.length ? `📎 ${msg.attachments[0].name}` : 'New message');
                                    triggerNativeNotification(`New message from ${msg.senderName || 'VIP Concierge'}`, snippet);
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
