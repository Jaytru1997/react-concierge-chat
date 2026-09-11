# react-concierge-chat 🛡️💬

A modern, production-grade, zero-database live concierge chat widget and multi-session admin desk for React & Next.js applications, featuring platform-agnostic user authentication and automatic role-based UI switching.

[![npm version](https://img.shields.io/npm/v/react-concierge-chat.svg)](https://www.npmjs.com/package/react-concierge-chat)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## ✨ Key Features

- 🔑 **Platform-Agnostic Authentication**: Seamlessly authenticates users against your existing login endpoints (`authRoute="/api/admin/login, /api/auth/login"`) or directly binds to your existing React auth state (`currentUser={session.user}`).
- 🔄 **Automatic Role-Based UI Switching**: Automatically renders the **Floating Client Chat Widget** for visitors/users, or morphs into the **Full Multi-Session Live Chat Desk** for authenticated admins and staff.
- 🚀 **Zero Server Database Overhead**: Messages and chat history live strictly inside the client's and support staff's browser **IndexedDB**. Nothing is stored permanently on your server database.
- ⚡ **Real-time Bidirectional Relay**: Sub-second messaging using Server-Sent Events (SSE) with automatic fallback to polling.
- 🔔 **Native Push & Audio Alerts**: Fires native browser `Notification` alerts with Web Audio API synthesizer chimes when messages arrive while the window or tab is unfocused.
- 🏢 **Multi-Session Support Admin Desk**: Full staff interface with session search, unread badge counters, instant canned responses, and chat transcript downloads.
- 🔒 **Multi-Session Safe**: Querying `authRoutes` preserves cookies & headers without voiding or interfering with the user's wider platform login session.
- 📧 **Automatic Support Email Detection**: Automatically resolves support contact email by checking `NEXT_PUBLIC_SUPPORT_EMAIL`, `SUPPORT_EMAIL`, or `SMTP_USER` from environment variables, or accepts a direct prop override.
- 🎨 **Self-Contained Styling**: Beautiful dark-mode concierge UI with zero CSS setup required (no Tailwind, Remixicon, or external font stylesheets needed).

---

## 📦 Installation

```bash
npm install react-concierge-chat
# or
yarn add react-concierge-chat
# or
pnpm add react-concierge-chat
```

---

## 🚀 Quick Start (Next.js App Router)

### 1. Set up the Server Relay Route

Create `app/api/live-chat/relay/route.ts`:

```typescript
import { createNextRelayHandler } from 'react-concierge-chat';

// Generates real-time SSE stream and in-memory message relay
export const { GET, POST } = createNextRelayHandler();
```

---

### 2. Universal Drop-In Chat Component (`<ConciergeChat />`)

Add `<ConciergeChat />` to your layout or root template. Provide your application's login route(s) via `authRoute`:

```tsx
'use client';

import { ConciergeChat } from 'react-concierge-chat';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        
        {/* Universal Chat & Admin Desk */}
        <ConciergeChat 
          brandName="Shield Support"
          primaryColor="#0d7490"
          authRoute="/api/admin/login, /api/auth/login"
          allowGuest={true}
        />
      </body>
    </html>
  );
}
```

---

## 🔐 How Authentication & Role Detection Works

### 1. Multi-Route Configuration
If your app has distinct login endpoints for admins and regular users, pass them as a comma-separated string or an array:

```tsx
// Comma-separated string
<ConciergeChat authRoute="/api/admin/login, /api/auth/login" />

// Or array
<ConciergeChat authRoute={["/api/admin/login", "/api/auth/login"]} />
```

When a user attempts to sign into the Staff Desk:
1. The widget prompts for email/username and password.
2. It probes the configured `authRoutes` sequentially with `credentials: 'include'`.
3. The response payload is inspected for standard role indicators (`role: 'admin'`, `isAdmin: true`, `user.role`, `isStaff: true`, etc.).
4. If the role is `admin` or `staff`, it automatically opens the **Multi-Session Live Chat Desk**.
5. It preserves session credentials in chat-scoped storage without voiding or interfering with any existing platform session cookies.

---

### 2. Direct Prop Integration (NextAuth, Supabase, Redux, Firebase)
If your app already knows the logged-in user in React context, pass `currentUser` directly:

```tsx
'use client';

import { useSession } from 'next-auth/react';
import { ConciergeChat } from 'react-concierge-chat';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  return (
    <div>
      {children}
      <ConciergeChat
        currentUser={session?.user ? {
          name: session.user.name || 'User',
          email: session.user.email || '',
          role: session.user.role || (session.user.email === 'admin@corp.com' ? 'admin' : 'user'),
        } : null}
      />
    </div>
  );
}
```

---

## 📋 Component Props Reference

### `<ConciergeChat />` (Universal Master Component)

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `authRoute` | `string \| string[]` | `undefined` | Endpoint(s) used for in-chat credentials auth (comma-separated or array). |
| `currentUser` | `ChatUser \| null` | `undefined` | Explicit user object `{ name, email, role: 'admin' \| 'user' }`. |
| `sessionCheckRoute` | `string` | `undefined` | Optional endpoint to probe on load for active session (e.g. `/api/auth/session`). |
| `allowGuest` | `boolean` | `true` | Allows unauthenticated visitors to chat as guests. |
| `brandName` | `string` | `"Concierge Desk"` | Name displayed in widget headers. |
| `primaryColor` | `string` | `"#0d7490"` | Primary brand accent color. |
| `apiUrl` | `string` | `"/api/live-chat/relay"` | Endpoint of the in-memory SSE relay. |
| `position` | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` | Position of the launcher bubble on the screen. |
| `welcomeMessage` | `string` | *automated greeting* | First message presented to new visitors. |
| `onAuthSuccess` | `(user: ChatUser) => void` | `undefined` | Callback fired upon successful authentication. |
| `onSignOut` | `() => void` | `undefined` | Callback fired when the user signs out of chat desk. |

---

### Standalone Sub-Components

You can also import and use `<LiveChatWidget />` or `<AdminLiveChat />` independently if you have separate dedicated pages for clients and staff:

```tsx
import { LiveChatWidget, AdminLiveChat } from 'react-concierge-chat';

// Embedded Client Widget
<LiveChatWidget brandName="Customer Support" primaryColor="#0d7490" />

// Dedicated Staff Desk Page
<AdminLiveChat adminName="Alex" primaryColor="#0d7490" />
```

---

## ⚙️ Environment Variables

The package automatically detects support contact emails in this priority order:

```env
NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com
SUPPORT_EMAIL=support@example.com
SMTP_USER=support@example.com
```

---

## 🚢 Publishing to NPM

1. Build the distribution bundle:
```bash
npm run build
```
2. Log in to your NPM profile:
```bash
npm login
```
3. Publish to NPM:
```bash
npm publish --access public
```

---

## 📄 License

MIT © [Mozay](https://github.com/Jaytru1997)
