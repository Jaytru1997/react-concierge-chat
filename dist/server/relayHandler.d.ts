import type { ChatMessage, ChatSession } from '../types';
interface InMemoryStore {
    sessions: Map<string, ChatSession>;
    messages: Map<string, ChatMessage[]>;
    subscribers: Map<string, Set<(msg: ChatMessage) => void>>;
}
declare global {
    var __concierge_chat_store__: InMemoryStore | undefined;
}
/**
 * Creates standard HTTP / SSE handlers for Next.js App Router (route.ts).
 *
 * Example usage in `app/api/live-chat/relay/route.ts`:
 * ```ts
 * import { createNextRelayHandler } from 'react-concierge-chat';
 *
 * export const { GET, POST } = createNextRelayHandler();
 * ```
 */
export declare function createNextRelayHandler(options?: {
    maxStoredMessagesPerSession?: number;
}): {
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
};
export {};
