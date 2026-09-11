import { ChatAttachment, ChatMessage } from '../types';
import { dbGetMessages, dbSaveMessage } from './indexedDb';
import { getOrCreateClientSessionId, getClientName, resolveSupportEmail } from './session';
import { triggerNativeNotification, requestNotificationPermission } from './notifications';

export type OnMessageCallback = (message: ChatMessage) => void;

export class ChatClient {
  private sessionId: string;
  private clientName: string;
  private supportEmail: string;
  private apiUrl: string;
  private listeners: Set<OnMessageCallback> = new Set();
  private lastTimestamp: number = 0;
  private pollInterval: any = null;
  private eventSource: EventSource | null = null;
  private welcomeMessage?: string;
  private isInitializing: boolean = false;

  constructor(options?: {
    sessionId?: string;
    clientName?: string;
    supportEmail?: string;
    apiUrl?: string;
    welcomeMessage?: string;
  }) {
    this.sessionId = options?.sessionId || getOrCreateClientSessionId();
    this.clientName = options?.clientName || getClientName();
    this.supportEmail = resolveSupportEmail(options?.supportEmail);
    this.apiUrl = options?.apiUrl || '/api/live-chat/relay';
    this.welcomeMessage = options?.welcomeMessage;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getSupportEmail(): string {
    return this.supportEmail;
  }

  public async init(): Promise<ChatMessage[]> {
    if (this.isInitializing) {
      return await dbGetMessages(this.sessionId);
    }
    this.isInitializing = true;

    try {
      const history = await dbGetMessages(this.sessionId);
      const hasGreetingOrAgent = history.some(
        (m) => m.id.startsWith('greet_') || (m.sender === 'agent' && m.id === `greet_${this.sessionId}`)
      );

      if (history.length > 0) {
        this.lastTimestamp = Math.max(...history.map((m) => m.timestamp));
      }

      if (!hasGreetingOrAgent && history.length === 0) {
        const defaultText =
          this.welcomeMessage ||
          `Hello! 👋 Welcome to Concierge Support. How can we assist you today? (You can also reach our desk at ${this.supportEmail})`;

        const initialGreeting: ChatMessage = {
          id: `greet_${this.sessionId}`,
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

      // Deduplicate history strictly by ID
      const uniqueHistory = Array.from(
        new Map(history.map((m) => [m.id, m])).values()
      ).sort((a, b) => a.timestamp - b.timestamp);

      this.startRealtimeStream();
      return uniqueHistory;
    } finally {
      this.isInitializing = false;
    }
  }

  public onMessage(cb: OnMessageCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public async sendMessage(
    text: string,
    attachments?: ChatAttachment[]
  ): Promise<ChatMessage> {
    const trimmed = text.trim();
    if (!trimmed && (!attachments || attachments.length === 0)) {
      throw new Error('Message or attachment required');
    }

    const msg: ChatMessage = {
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
    } catch {}

    requestNotificationPermission();
    return msg;
  }

  private startRealtimeStream() {
    if (typeof window === 'undefined') return;

    try {
      this.eventSource = new EventSource(
        `${this.apiUrl}?sessionId=${encodeURIComponent(this.sessionId)}&mode=sse`
      );

      this.eventSource.addEventListener('message', async (e) => {
        try {
          const data = JSON.parse(e.data) as ChatMessage;
          if (data && data.sender === 'agent' && data.timestamp > this.lastTimestamp) {
            this.lastTimestamp = data.timestamp;
            await dbSaveMessage({ ...data, read: false, status: 'delivered' });
            this.notifyListeners(data);

            if (document.hidden) {
              const snippet = data.text || (data.attachments?.length ? `📎 ${data.attachments[0].name}` : 'New message');
              triggerNativeNotification(
                `New message from ${data.senderName || 'VIP Concierge'}`,
                snippet
              );
            }
          }
        } catch {}
      });

      this.eventSource.onerror = () => {
        this.eventSource?.close();
        this.startPolling();
      };
    } catch {
      this.startPolling();
    }
  }

  private startPolling() {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(async () => {
      try {
        const res = await fetch(
          `${this.apiUrl}?sessionId=${encodeURIComponent(this.sessionId)}&since=${this.lastTimestamp}`
        );
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
                  triggerNativeNotification(
                    `New message from ${msg.senderName || 'VIP Concierge'}`,
                    snippet
                  );
                }
              }
            }
          }
        }
      } catch {}
    }, 3000);
  }

  private notifyListeners(msg: ChatMessage) {
    this.listeners.forEach((fn) => fn(msg));
  }

  public destroy() {
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
