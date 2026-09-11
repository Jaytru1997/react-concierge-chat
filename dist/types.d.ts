export type ChatUserRole = 'admin' | 'staff' | 'user' | 'client' | 'guest';
export interface ChatUser {
    id?: string;
    name: string;
    email?: string;
    role: ChatUserRole;
    token?: string;
}
export interface ChatAttachment {
    name: string;
    type: 'image' | 'pdf' | 'file';
    mimeType: string;
    size: number;
    data: string;
}
export interface ChatMessage {
    id: string;
    sessionId: string;
    sender: 'client' | 'agent' | 'system';
    senderName?: string;
    text: string;
    timestamp: number;
    status: 'sending' | 'sent' | 'delivered' | 'read';
    read?: boolean;
    attachments?: ChatAttachment[];
}
export interface ChatSession {
    sessionId: string;
    clientName?: string;
    clientEmail?: string;
    startedAt: number;
    lastUpdated: number;
    lastMessage?: string;
    unreadCount: number;
    status: 'active' | 'closed';
}
export interface LiveChatWidgetProps {
    supportEmail?: string;
    brandName?: string;
    logo?: string;
    primaryColor?: string;
    apiUrl?: string;
    icon?: React.ReactNode;
    position?: 'bottom-right' | 'bottom-left';
    welcomeMessage?: string;
    currentUser?: ChatUser | null;
    onStaffLoginClick?: () => void;
    onSignOut?: () => void;
}
export interface AdminLiveChatProps {
    adminName?: string;
    apiUrl?: string;
    primaryColor?: string;
    brandName?: string;
    logo?: string;
    onDeleteSession?: (sessionId: string) => void;
    onSwitchToWidget?: () => void;
    onSignOut?: () => void;
}
export interface ConciergeChatProps {
    /**
     * Comma-separated or array of authentication routes on the host application.
     * e.g. "/api/admin/login, /api/auth/login" or ["/api/admin/login", "/api/auth/login"]
     */
    authRoute?: string | string[];
    /**
     * Optional route to probe for an existing authenticated session.
     * e.g. "/api/auth/session" or "/api/user/me"
     */
    sessionCheckRoute?: string;
    /**
     * Explicit current user passed from parent app (e.g. NextAuth useSession() or Redux store).
     */
    currentUser?: ChatUser | null;
    /**
     * Whether unauthenticated visitors can chat as guests (default: true).
     */
    allowGuest?: boolean;
    brandName?: string;
    logo?: string;
    primaryColor?: string;
    apiUrl?: string;
    supportEmail?: string;
    welcomeMessage?: string;
    position?: 'bottom-right' | 'bottom-left';
    onAuthSuccess?: (user: ChatUser) => void;
    onSignOut?: () => void;
}
