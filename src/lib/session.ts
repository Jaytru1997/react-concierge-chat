const SESSION_KEY = 'concierge_chat_session_id';
const CLIENT_NAME_KEY = 'concierge_chat_client_name';

export function getOrCreateClientSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';

  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    sessionId = `sess_${Date.now().toString(36)}_${randomHex}`;
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function getClientName(): string {
  if (typeof window === 'undefined') return 'Client';
  let name = localStorage.getItem(CLIENT_NAME_KEY);
  if (!name) {
    const idSuffix = getOrCreateClientSessionId().slice(-4).toUpperCase();
    name = `User #${idSuffix}`;
    localStorage.setItem(CLIENT_NAME_KEY, name);
  }
  return name;
}

export function setClientName(name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CLIENT_NAME_KEY, name.trim());
}

export function resolveSupportEmail(overrideEmail?: string): string {
  if (overrideEmail && overrideEmail.trim()) {
    return overrideEmail.trim();
  }

  const envEmail =
    (typeof process !== 'undefined' &&
      (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
        process.env.SUPPORT_EMAIL ||
        process.env.SMTP_USER)) ||
    '';

  return envEmail || 'support@example.com';
}
