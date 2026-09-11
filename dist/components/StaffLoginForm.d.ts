import React from 'react';
import { ChatUser } from '../types';
interface StaffLoginFormProps {
    authRoute?: string | string[];
    primaryColor?: string;
    onBack: () => void;
    onSuccess: (user: ChatUser) => void;
}
export declare const StaffLoginForm: React.FC<StaffLoginFormProps>;
export {};
