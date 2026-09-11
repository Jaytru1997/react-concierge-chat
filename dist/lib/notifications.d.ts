export declare function requestNotificationPermission(): Promise<NotificationPermission>;
export declare function playNotificationSound(): void;
export declare function triggerNativeNotification(title: string, body: string, iconUrl?: string, onClick?: () => void): void;
