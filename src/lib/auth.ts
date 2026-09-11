import { ChatUser, ChatUserRole } from '../types';

const AUTH_STORAGE_KEY = 'concierge_chat_auth_user';

export function parseAuthRoutes(routes?: string | string[]): string[] {
  if (!routes) return [];
  if (Array.isArray(routes)) {
    return routes.map((r) => r.trim()).filter(Boolean);
  }
  return routes
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

export function getStoredChatUser(): ChatUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ChatUser;
  } catch {
    return null;
  }
}

export function storeChatUser(user: ChatUser): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch {}
}

export function clearStoredChatUser(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {}
}

function extractRoleFromPayload(data: any): ChatUserRole {
  if (!data) return 'user';

  const rawRole = (
    data.role ||
    data.user?.role ||
    data.user_role ||
    data.type ||
    data.user?.type ||
    ''
  )
    .toString()
    .toLowerCase();

  const isAdminFlag =
    Boolean(data.isAdmin) ||
    Boolean(data.user?.isAdmin) ||
    Boolean(data.is_admin) ||
    Boolean(data.user?.is_admin) ||
    Boolean(data.isStaff) ||
    Boolean(data.user?.isStaff);

  if (
    isAdminFlag ||
    rawRole.includes('admin') ||
    rawRole.includes('staff') ||
    rawRole.includes('support') ||
    rawRole.includes('moderator')
  ) {
    return 'admin';
  }

  return 'user';
}

function extractNameFromPayload(data: any, fallbackIdentifier: string): string {
  if (!data) return fallbackIdentifier;
  return (
    data.name ||
    data.user?.name ||
    data.fullName ||
    data.user?.fullName ||
    data.username ||
    data.user?.username ||
    data.email ||
    data.user?.email ||
    fallbackIdentifier
  );
}

/**
 * Agnostically attempts authentication across one or multiple auth endpoints.
 * Preserves credentials & cookies without disturbing the wider host app session.
 */
export async function authenticateWithRoutes(
  routes: string | string[],
  credentials: { identifier: string; password: string }
): Promise<{ success: boolean; user?: ChatUser; error?: string }> {
  const parsedRoutes = parseAuthRoutes(routes);

  if (parsedRoutes.length === 0) {
    return {
      success: false,
      error: 'No authentication routes configured on chat widget.',
    };
  }

  let lastError = 'Authentication failed. Please verify credentials.';

  for (const route of parsedRoutes) {
    try {
      const payload = {
        email: credentials.identifier,
        username: credentials.identifier,
        password: credentials.password,
      };

      const res = await fetch(route, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        lastError =
          errorBody.message ||
          errorBody.error ||
          `Authentication failed with status ${res.status}`;
        continue; // Try next route in sequence if any
      }

      const json = await res.json().catch(() => ({}));
      const payloadData = json.data || json.user || json;

      const role = extractRoleFromPayload(payloadData);
      const name = extractNameFromPayload(payloadData, credentials.identifier);
      const email =
        payloadData.email ||
        payloadData.user?.email ||
        (credentials.identifier.includes('@') ? credentials.identifier : undefined);
      const token = json.token || json.access_token || payloadData.token;

      const user: ChatUser = {
        id: payloadData.id || payloadData._id || `user_${Date.now()}`,
        name,
        email,
        role,
        token,
      };

      storeChatUser(user);
      return { success: true, user };
    } catch (err: any) {
      lastError = err?.message || 'Network error during authentication probe';
    }
  }

  return { success: false, error: lastError };
}

export async function checkSessionRoute(
  route: string
): Promise<ChatUser | null> {
  try {
    const res = await fetch(route, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });

    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json) return null;

    const payloadData = json.data || json.user || json;
    const role = extractRoleFromPayload(payloadData);
    const name = extractNameFromPayload(payloadData, 'Authenticated User');
    const email = payloadData.email || payloadData.user?.email;

    const user: ChatUser = {
      id: payloadData.id || payloadData._id || `user_${Date.now()}`,
      name,
      email,
      role,
      token: json.token || json.access_token,
    };

    storeChatUser(user);
    return user;
  } catch {
    return null;
  }
}
