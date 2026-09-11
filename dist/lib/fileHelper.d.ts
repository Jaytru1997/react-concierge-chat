import { ChatAttachment } from '../types';
export declare const MAX_ATTACHMENT_SIZE: number;
export declare function formatBytes(bytes: number, decimals?: number): string;
export declare function getAttachmentType(mimeType: string, fileName: string): 'image' | 'pdf' | 'file';
export declare function validateFile(file: File, maxSizeBytes?: number): {
    valid: boolean;
    error?: string;
};
/**
 * Encodes a local File into an in-memory Base64 Data URL.
 * Strictly in-memory — never uploaded to external cloud buckets.
 */
export declare function readFileAsBase64(file: File): Promise<ChatAttachment>;
/**
 * Triggers instant browser download of an in-memory encoded attachment.
 */
export declare function downloadAttachment(attachment: ChatAttachment): void;
