import React from 'react';
import { ConciergeChatProps } from '../types';
/**
 * Universal Concierge Chat component.
 * Automatically resolves user identity & roles via agnostic authRoutes,
 * supporting guests, authenticated clients, and staff/admin desks.
 */
export declare const ConciergeChat: React.FC<ConciergeChatProps>;
