import { ChatMessage } from '../types';
export type OnMessageCallback = (message: ChatMessage) => void;
export declare class ChatClient {
    private sessionId;
    private clientName;
    private supportEmail;
    private apiUrl;
    private listeners;
    private lastTimestamp;
    private pollInterval;
    private eventSource;
    private welcomeMessage?;
    constructor(options?: {
        sessionId?: string;
        clientName?: string;
        supportEmail?: string;
        apiUrl?: string;
        welcomeMessage?: string;
    });
    getSessionId(): string;
    getSupportEmail(): string;
    init(): Promise<ChatMessage[]>;
    onMessage(cb: OnMessageCallback): () => void;
    sendMessage(text: string): Promise<ChatMessage>;
    private startRealtimeStream;
    private startPolling;
    private notifyListeners;
    destroy(): void;
}
