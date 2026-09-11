export * from './types';
export { ConciergeChat } from './components/ConciergeChat';
export { LiveChatWidget } from './components/LiveChatWidget';
export { AdminLiveChat } from './components/AdminLiveChat';
export { StaffLoginModal } from './components/StaffLoginModal';
export { ChatClient } from './lib/chatClient';
export {
  getOrCreateClientSessionId,
  getClientName,
  setClientName,
  resolveSupportEmail,
} from './lib/session';
export {
  authenticateWithRoutes,
  parseAuthRoutes,
  getStoredChatUser,
  storeChatUser,
  clearStoredChatUser,
  checkSessionRoute,
} from './lib/auth';
export {
  getChatDB,
  dbSaveMessage,
  dbGetMessages,
  dbGetAllSessions,
  dbSaveSession,
  dbMarkSessionAsRead,
  dbDeleteSession,
} from './lib/indexedDb';
export {
  requestNotificationPermission,
  playNotificationSound,
  triggerNativeNotification,
} from './lib/notifications';
export { createNextRelayHandler } from './server/relayHandler';
