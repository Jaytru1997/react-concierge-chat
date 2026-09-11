import { ChatUser } from '../types';
export declare function parseAuthRoutes(routes?: string | string[]): string[];
export declare function getStoredChatUser(): ChatUser | null;
export declare function storeChatUser(user: ChatUser): void;
export declare function clearStoredChatUser(): void;
/**
 * Agnostically attempts authentication across one or multiple auth endpoints.
 * Preserves credentials & cookies without disturbing the wider host app session.
 */
export declare function authenticateWithRoutes(routes: string | string[], credentials: {
    identifier: string;
    password: string;
}): Promise<{
    success: boolean;
    user?: ChatUser;
    error?: string;
}>;
export declare function checkSessionRoute(route: string): Promise<ChatUser | null>;
