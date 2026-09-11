import React from 'react';
import { ChatUser } from '../types';
interface StaffLoginModalProps {
    authRoute?: string | string[];
    primaryColor?: string;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (user: ChatUser) => void;
}
export declare const StaffLoginModal: React.FC<StaffLoginModalProps>;
export {};
