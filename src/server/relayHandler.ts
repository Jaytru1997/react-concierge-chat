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

const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{6,128}$/;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_SESSIONS = 1000;

function isValidSessionId(id: string): boolean {
  return id === 'all' || SESSION_ID_REGEX.test(id);
}

function sanitizeText(str: string): string {
  if (typeof str !== 'string') return '';
  return str.slice(0, MAX_MESSAGE_LENGTH).trim();
}

/**
 * Production-grade HTTP & SSE handlers for Next.js App Router (route.ts).
 * Includes memory exhaustion defenses, input sanitization, and session isolation.
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
  corsOrigin?: string;
}) {
  const maxHistory = options?.maxStoredMessagesPerSession || 100;
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': options?.corsOrigin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'poll';
    const sessionId = searchParams.get('sessionId') || 'all';
    const since = parseInt(searchParams.get('since') || '0', 10);
    const store = getStore();

    if (!isValidSessionId(sessionId)) {
      return Response.json(
        { success: false, error: 'Invalid session identifier' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (mode === 'sse') {
      const encoder = new TextEncoder();
      let unsubscribe: (() => void) | null = null;

      const stream = new ReadableStream({
        start(controller) {
          try {
            controller.enqueue(
              encoder.encode(
                `event: connected\ndata: ${JSON.stringify({
                  status: 'connected',
                  sessionId,
                  timestamp: Date.now(),
                })}\n\n`
              )
            );
          } catch {
            return;
          }

          const listener = (msg: ChatMessage) => {
            if (sessionId === 'all' || msg.sessionId === sessionId) {
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: message\ndata: ${JSON.stringify(msg)}\n\n`
                  )
                );
              } catch {
                if (unsubscribe) unsubscribe();
              }
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
          ...corsHeaders,
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
      return Response.json(
        { success: true, sessions: allSessions },
        { headers: corsHeaders }
      );
    }

    const sessionMsgs = store.messages.get(sessionId) || [];
    const newMsgs = sessionMsgs.filter((m) => m.timestamp > since);
    return Response.json(
      {
        success: true,
        messages: newMsgs,
        session: store.sessions.get(sessionId) || null,
      },
      { headers: corsHeaders }
    );
  }

  async function POST(request: Request) {
    try {
      const body = await request.json();
      const { type, message, session } = body;
      const store = getStore();

      if (type === 'session_heartbeat' && session) {
        if (!isValidSessionId(session.sessionId)) {
          return Response.json(
            { success: false, error: 'Invalid session ID' },
            { status: 400, headers: corsHeaders }
          );
        }

        // Enforce max active sessions to prevent memory leaks
        if (store.sessions.size > MAX_SESSIONS) {
          const oldestSessionKey = Array.from(store.sessions.keys())[0];
          if (oldestSessionKey) {
            store.sessions.delete(oldestSessionKey);
            store.messages.delete(oldestSessionKey);
          }
        }

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
        return Response.json({ success: true, session: updated }, { headers: corsHeaders });
      }

      if (type === 'message' && message) {
        const sId = String(message.sessionId || '');
        if (!isValidSessionId(sId)) {
          return Response.json(
            { success: false, error: 'Invalid session ID' },
            { status: 400, headers: corsHeaders }
          );
        }

        const sanitizedText = sanitizeText(message.text || '');
        if (!sanitizedText) {
          return Response.json(
            { success: false, error: 'Message text cannot be empty' },
            { status: 400, headers: corsHeaders }
          );
        }

        const safeSender =
          message.sender === 'agent' || message.sender === 'system'
            ? message.sender
            : 'client';

        const msg: ChatMessage = {
          id: String(message.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`),
          sessionId: sId,
          sender: safeSender,
          senderName: String(message.senderName || (safeSender === 'client' ? 'Visitor' : 'Support')).slice(0, 50),
          text: sanitizedText,
          timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
          status: 'delivered',
          read: safeSender === 'agent',
        };

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

        return Response.json({ success: true, message: msg }, { headers: corsHeaders });
      }

      return Response.json(
        { success: false, error: 'Unknown action type' },
        { status: 400, headers: corsHeaders }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid request';
      return Response.json({ success: false, error: message }, { status: 500, headers: corsHeaders });
    }
  }

  return { GET, POST };
}
