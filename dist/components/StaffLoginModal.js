import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { authenticateWithRoutes } from '../lib/auth';
export const StaffLoginModal = ({ authRoute, primaryColor = '#0d7490', isOpen, onClose, onSuccess, }) => {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    if (!isOpen)
        return null;
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!identifier.trim() || !password) {
            setError('Please enter your email/username and password');
            return;
        }
        if (!authRoute || (Array.isArray(authRoute) && authRoute.length === 0)) {
            setError('No auth routes configured. Please pass the `authRoute` prop.');
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
            onClose();
        }
        else {
            setError(result.error || 'Authentication failed. Please check your credentials.');
        }
    };
    return (_jsx("div", { style: {
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
        }, onClick: onClose, children: _jsxs("div", { style: {
                width: '100%',
                maxWidth: '380px',
                backgroundColor: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                color: '#f8fafc',
                position: 'relative',
            }, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '10px' }, children: [_jsx("div", { style: {
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '10px',
                                        backgroundColor: `${primaryColor}25`,
                                        border: `1px solid ${primaryColor}50`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: primaryColor,
                                    }, children: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "11", width: "18", height: "11", rx: "2", ry: "2" }), _jsx("path", { d: "M7 11V7a5 5 0 0 1 10 0v4" })] }) }), _jsxs("div", { children: [_jsx("h3", { style: { margin: 0, fontSize: '16px', fontWeight: 600 }, children: "Staff & Admin Access" }), _jsx("p", { style: { margin: 0, fontSize: '12px', color: '#94a3b8' }, children: "Authenticate to access the live chat desk" })] })] }), _jsx("button", { onClick: onClose, style: {
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '6px',
                                display: 'flex',
                            }, children: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] }), error && (_jsx("div", { style: {
                        padding: '10px 12px',
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        color: '#f87171',
                        fontSize: '12px',
                        marginBottom: '16px',
                        lineHeight: 1.4,
                    }, children: error })), _jsxs("form", { onSubmit: handleSubmit, style: { display: 'flex', flexDirection: 'column', gap: '14px' }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: '12px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' }, children: "Email or Username" }), _jsx("input", { type: "text", value: identifier, onChange: (e) => setIdentifier(e.target.value), placeholder: "admin@example.com", autoFocus: true, style: {
                                        width: '100%',
                                        padding: '10px 12px',
                                        backgroundColor: '#1e293b',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '8px',
                                        color: '#f8fafc',
                                        fontSize: '13px',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                    } })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: '12px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' }, children: "Password" }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", style: {
                                        width: '100%',
                                        padding: '10px 12px',
                                        backgroundColor: '#1e293b',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '8px',
                                        color: '#f8fafc',
                                        fontSize: '13px',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                    } })] }), _jsx("button", { type: "submit", disabled: loading, style: {
                                marginTop: '6px',
                                padding: '11px',
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
                                transition: 'background-color 0.2s',
                            }, children: loading ? (_jsxs(_Fragment, { children: [_jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", style: { animation: 'spin 1s linear infinite' }, children: _jsx("circle", { cx: "12", cy: "12", r: "10", strokeDasharray: "30", strokeDashoffset: "10" }) }), "Authenticating..."] })) : ('Sign In & Open Desk') })] })] }) }));
};
