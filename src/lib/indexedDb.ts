import { ChatMessage, ChatSession } from '../types';

const DB_NAME = 'ConciergeChatDB';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getChatDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in browser environments'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('messages')) {
          const messagesStore = db.createObjectStore('messages', { keyPath: 'id' });
          messagesStore.createIndex('sessionId', 'sessionId', { unique: false });
          messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('sessions')) {
          const sessionsStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
          sessionsStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
          sessionsStore.createIndex('status', 'status', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

export async function dbSaveMessage(message: ChatMessage): Promise<void> {
  const db = await getChatDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['messages', 'sessions'], 'readwrite');
    const msgStore = tx.objectStore('messages');
    const sessionStore = tx.objectStore('sessions');

    msgStore.put(message);

    const sessionReq = sessionStore.get(message.sessionId);
    sessionReq.onsuccess = () => {
      const existing = sessionReq.result as ChatSession | undefined;
      const updatedSession: ChatSession = {
        sessionId: message.sessionId,
        clientName: message.sender === 'client' ? (message.senderName || existing?.clientName || 'Client') : (existing?.clientName || 'Client'),
        startedAt: existing?.startedAt || message.timestamp,
        lastUpdated: message.timestamp,
        lastMessage: message.text,
        unreadCount: message.sender === 'agent' && !message.read ? (existing?.unreadCount || 0) + 1 : (existing?.unreadCount || 0),
        status: existing?.status || 'active',
      };
      sessionStore.put(updatedSession);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetMessages(sessionId: string): Promise<ChatMessage[]> {
  const db = await getChatDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('sessionId');
    const request = index.getAll(sessionId);

    request.onsuccess = () => {
      const msgs = (request.result as ChatMessage[]) || [];
      msgs.sort((a, b) => a.timestamp - b.timestamp);
      resolve(msgs);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function dbGetAllSessions(): Promise<ChatSession[]> {
  const db = await getChatDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');
    const request = store.getAll();

    request.onsuccess = () => {
      const sessions = (request.result as ChatSession[]) || [];
      sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
      resolve(sessions);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function dbSaveSession(session: ChatSession): Promise<void> {
  const db = await getChatDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    store.put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbMarkSessionAsRead(sessionId: string): Promise<void> {
  const db = await getChatDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['messages', 'sessions'], 'readwrite');
    const msgStore = tx.objectStore('messages');
    const sessionStore = tx.objectStore('sessions');
    const index = msgStore.index('sessionId');
    const req = index.getAll(sessionId);

    req.onsuccess = () => {
      const msgs = (req.result as ChatMessage[]) || [];
      msgs.forEach((m) => {
        if (!m.read) {
          m.read = true;
          m.status = 'read';
          msgStore.put(m);
        }
      });

      const sessReq = sessionStore.get(sessionId);
      sessReq.onsuccess = () => {
        const sess = sessReq.result as ChatSession | undefined;
        if (sess) {
          sess.unreadCount = 0;
          sessionStore.put(sess);
        }
      };
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbDeleteSession(sessionId: string): Promise<void> {
  const db = await getChatDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['messages', 'sessions'], 'readwrite');
    const msgStore = tx.objectStore('messages');
    const sessionStore = tx.objectStore('sessions');

    const index = msgStore.index('sessionId');
    const req = index.getAllKeys(sessionId);

    req.onsuccess = () => {
      const keys = req.result;
      keys.forEach((k) => msgStore.delete(k));
      sessionStore.delete(sessionId);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
