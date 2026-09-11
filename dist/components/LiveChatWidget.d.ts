import React from 'react';
import { ChatUser, LiveChatWidgetProps } from '../types';
export declare const LiveChatWidget: React.FC<LiveChatWidgetProps & {
    authRoute?: string | string[];
    onAuthSuccess?: (user: ChatUser) => void;
}>;
