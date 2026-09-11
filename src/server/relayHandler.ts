import type { ChatMessage, ChatSession } from '../types';

interface InMemoryStore {
  sessions: Map<string, ChatSession>;
  messages: Map<string, ChatMessage[]>;
  subscribers: Map<string, Set<(msg: ChatMessage) => void>>;
}

declare global {
  // eslint-disable-next-line no-var
  var __concierge_chat_store__: InMemoryStore | undefined;
}

function getStore(): InMemoryStore {
  if (!global.__concierge_chat_store__) {
    global.__concierge_chat_store__ = {
      sessions: new Map(),
      messages: new Map(),
      subscribers: new Map(),
    };
  }
  return global.__concierge_chat_store__;
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
export function createNextRelayHandler(options?: {
  maxStoredMessagesPerSession?: number;
}) {
  const maxHistory = options?.maxStoredMessagesPerSession || 100;

  async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'poll';
    const sessionId = searchParams.get('sessionId') || 'all';
    const since = parseInt(searchParams.get('since') || '0', 10);
    const store = getStore();

    if (mode === 'sse') {
      const encoder = new TextEncoder();
      let unsubscribe: (() => void) | null = null;

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: connected\ndata: ${JSON.stringify({
                status: 'connected',
                sessionId,
                timestamp: Date.now(),
              })}\n\n`
            )
          );

          const listener = (msg: ChatMessage) => {
            if (sessionId === 'all' || msg.sessionId === sessionId) {
              controller.enqueue(
                encoder.encode(
                  `event: message\ndata: ${JSON.stringify(msg)}\n\n`
                )
              );
            }
          };

          if (!store.subscribers.has(sessionId)) {
            store.subscribers.set(sessionId, new Set());
          }
          store.subscribers.get(sessionId)!.add(listener);

          unsubscribe = () => {
            const subs = store.subscribers.get(sessionId);
            if (subs) {
              subs.delete(listener);
              if (subs.size === 0) {
                store.subscribers.delete(sessionId);
              }
            }
          };
        },
        cancel() {
          if (unsubscribe) unsubscribe();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    if (sessionId === 'all') {
      const allSessions = Array.from(store.sessions.values()).sort(
        (a, b) => b.lastUpdated - a.lastUpdated
      );
      return Response.json({ success: true, sessions: allSessions });
    }

    const sessionMsgs = store.messages.get(sessionId) || [];
    const newMsgs = sessionMsgs.filter((m) => m.timestamp > since);
    return Response.json({
      success: true,
      messages: newMsgs,
      session: store.sessions.get(sessionId) || null,
    });
  }

  async function POST(request: Request) {
    try {
      const body = await request.json();
      const { type, message, session } = body;
      const store = getStore();

      if (type === 'session_heartbeat' && session) {
        const existing = store.sessions.get(session.sessionId);
        const updated: ChatSession = {
          ...(existing || {
            sessionId: session.sessionId,
            startedAt: Date.now(),
            unreadCount: 0,
            status: 'active',
          }),
          ...session,
          lastUpdated: Date.now(),
        };
        store.sessions.set(session.sessionId, updated);
        return Response.json({ success: true, session: updated });
      }

      if (type === 'message' && message) {
        const msg = message as ChatMessage;
        const sId = msg.sessionId;

        if (!store.messages.has(sId)) {
          store.messages.set(sId, []);
        }
        const history = store.messages.get(sId)!;
        history.push(msg);
        if (history.length > maxHistory) {
          history.shift();
        }

        const existingSession = store.sessions.get(sId);
        const updatedSession: ChatSession = {
          sessionId: sId,
          clientName: msg.sender === 'client' ? (msg.senderName || existingSession?.clientName || 'Visitor') : (existingSession?.clientName || 'Visitor'),
          clientEmail: existingSession?.clientEmail,
          startedAt: existingSession?.startedAt || msg.timestamp,
          unreadCount:
            msg.sender === 'client'
              ? (existingSession?.unreadCount || 0) + 1
              : 0,
          lastMessage: msg.text.slice(0, 80),
          lastUpdated: Date.now(),
          status: 'active',
        };
        store.sessions.set(sId, updatedSession);

        const notify = (targetId: string) => {
          const subs = store.subscribers.get(targetId);
          if (subs) {
            for (const sub of subs) {
              try {
                sub(msg);
              } catch {
                // ignore disconnected listeners
              }
            }
          }
        };

        notify(sId);
        notify('all');

        return Response.json({ success: true, message: msg });
      }

      return Response.json(
        { success: false, error: 'Unknown action type' },
        { status: 400 }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid request';
      return Response.json({ success: false, error: message }, { status: 500 });
    }
  }

  return { GET, POST };
}
