import React, { useState, useEffect } from 'react';
import { ChatUser, ConciergeChatProps } from '../types';
import { LiveChatWidget } from './LiveChatWidget';
import { AdminLiveChat } from './AdminLiveChat';
import { StaffLoginModal } from './StaffLoginModal';
import {
  getStoredChatUser,
  storeChatUser,
  clearStoredChatUser,
  checkSessionRoute,
} from '../lib/auth';

/**
 * Universal Concierge Chat component.
 * Automatically resolves user identity & roles via agnostic authRoutes,
 * supporting guests, authenticated clients, and staff/admin desks.
 */
export const ConciergeChat: React.FC<ConciergeChatProps> = ({
  authRoute,
  sessionCheckRoute,
  currentUser: explicitUser,
  allowGuest = true,
  brandName = 'Concierge Desk',
  primaryColor = '#0d7490',
  apiUrl = '/api/live-chat/relay',
  supportEmail,
  welcomeMessage,
  position = 'bottom-right',
  onAuthSuccess,
  onSignOut,
}) => {
  const [user, setUser] = useState<ChatUser | null>(() => explicitUser || getStoredChatUser());
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [adminDeskOpen, setAdminDeskOpen] = useState(false);

  // Sync explicit user if updated by parent
  useEffect(() => {
    if (explicitUser !== undefined) {
      setUser(explicitUser);
      if (explicitUser) {
        storeChatUser(explicitUser);
      }
    }
  }, [explicitUser]);

  // Optionally check session route on mount
  useEffect(() => {
    if (!user && sessionCheckRoute) {
      checkSessionRoute(sessionCheckRoute).then((verifiedUser) => {
        if (verifiedUser) {
          setUser(verifiedUser);
          onAuthSuccess?.(verifiedUser);
        }
      });
    }
  }, [sessionCheckRoute, user, onAuthSuccess]);

  const handleAuthSuccess = (authenticatedUser: ChatUser) => {
    setUser(authenticatedUser);
    storeChatUser(authenticatedUser);
    onAuthSuccess?.(authenticatedUser);

    if (authenticatedUser.role === 'admin' || authenticatedUser.role === 'staff') {
      setAdminDeskOpen(true);
    }
  };

  const handleSignOut = () => {
    setUser(null);
    clearStoredChatUser();
    setAdminDeskOpen(false);
    onSignOut?.();
  };

  const isAdminOrStaff = user?.role === 'admin' || user?.role === 'staff';

  return (
    <>
      {/* Client Floating Widget */}
      {(!isAdminOrStaff || !adminDeskOpen) && (
        <LiveChatWidget
          brandName={brandName}
          primaryColor={primaryColor}
          apiUrl={apiUrl}
          supportEmail={supportEmail}
          welcomeMessage={welcomeMessage}
          position={position}
          currentUser={user}
          onStaffLoginClick={() => {
            if (isAdminOrStaff) {
              setAdminDeskOpen(true);
            } else {
              setLoginModalOpen(true);
            }
          }}
          onSignOut={user ? handleSignOut : undefined}
        />
      )}

      {/* Staff Admin Desk Overlay (When Authenticated as Admin/Staff) */}
      {isAdminOrStaff && adminDeskOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(10px)',
            zIndex: 999998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '1200px',
              height: '85vh',
              maxHeight: '800px',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <AdminLiveChat
              adminName={user?.name || 'Staff Support'}
              apiUrl={apiUrl}
              primaryColor={primaryColor}
              brandName={brandName}
              onSwitchToWidget={() => setAdminDeskOpen(false)}
              onSignOut={handleSignOut}
            />
          </div>
        </div>
      )}

      {/* Inline Staff Login Modal */}
      <StaffLoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        authRoute={authRoute}
        primaryColor={primaryColor}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
};
