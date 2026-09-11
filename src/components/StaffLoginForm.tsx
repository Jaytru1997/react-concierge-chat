import React, { useState } from 'react';
import { ChatUser } from '../types';
import { authenticateWithRoutes } from '../lib/auth';

interface StaffLoginFormProps {
  authRoute?: string | string[];
  primaryColor?: string;
  onBack: () => void;
  onSuccess: (user: ChatUser) => void;
}

export const StaffLoginForm: React.FC<StaffLoginFormProps> = ({
  authRoute,
  primaryColor = '#0d7490',
  onBack,
  onSuccess,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please enter your email/username and password');
      return;
    }

    if (!authRoute || (Array.isArray(authRoute) && authRoute.length === 0)) {
      setError('No auth routes configured on chat widget.');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await authenticateWithRoutes(authRoute, {
      identifier: identifier.trim(),
      password,
    });

    setLoading(false);

    if (result.success && result.user) {
      onSuccess(result.user);
    } else {
      setError(result.error || 'Authentication failed. Please check credentials.');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '20px',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '18px' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: `${primaryColor}25`,
            border: `1px solid ${primaryColor}50`,
            color: primaryColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 10px auto',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600 }}>Staff & Admin Login</h3>
        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
          Sign in to unlock multi-session staff desk
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#f87171',
            fontSize: '11.5px',
            marginBottom: '14px',
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginBottom: '5px' }}>
            Email or Username
          </label>
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="admin@example.com"
            autoFocus
            style={{
              width: '100%',
              padding: '9px 12px',
              backgroundColor: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#cbd5e1', marginBottom: '5px' }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: '100%',
              padding: '9px 12px',
              backgroundColor: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: '8px',
            padding: '10px',
            backgroundColor: primaryColor,
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {loading ? 'Authenticating...' : 'Sign In'}
        </button>

        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#94a3b8',
            padding: '8px',
            borderRadius: '8px',
            fontSize: '12px',
            cursor: 'pointer',
            marginTop: 'auto',
          }}
        >
          Cancel & Return to Chat
        </button>
      </form>
    </div>
  );
};
