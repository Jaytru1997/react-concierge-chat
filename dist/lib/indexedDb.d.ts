import { ChatMessage, ChatSession } from '../types';
export declare function getChatDB(): Promise<IDBDatabase>;
export declare function dbSaveMessage(message: ChatMessage): Promise<void>;
export declare function dbGetMessages(sessionId: string): Promise<ChatMessage[]>;
export declare function dbGetAllSessions(): Promise<ChatSession[]>;
export declare function dbSaveSession(session: ChatSession): Promise<void>;
export declare function dbMarkSessionAsRead(sessionId: string): Promise<void>;
export declare function dbDeleteSession(sessionId: string): Promise<void>;
