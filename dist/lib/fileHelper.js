export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 MB per attachment
export function formatBytes(bytes, decimals = 1) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
export function getAttachmentType(mimeType, fileName) {
    const lowerMime = (mimeType || '').toLowerCase();
    const lowerName = (fileName || '').toLowerCase();
    if (lowerMime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(lowerName)) {
        return 'image';
    }
    if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
        return 'pdf';
    }
    return 'file';
}
export function validateFile(file, maxSizeBytes = MAX_ATTACHMENT_SIZE) {
    if (!file) {
        return { valid: false, error: 'No file selected' };
    }
    if (file.size > maxSizeBytes) {
        return {
            valid: false,
            error: `File exceeds maximum size limit of ${formatBytes(maxSizeBytes)}`,
        };
    }
    const type = getAttachmentType(file.type, file.name);
    if (type !== 'image' && type !== 'pdf') {
        return {
            valid: false,
            error: 'Only image files (PNG, JPG, WEBP, GIF) and PDF documents are supported.',
        };
    }
    return { valid: true };
}
/**
 * Encodes a local File into an in-memory Base64 Data URL.
 * Strictly in-memory — never uploaded to external cloud buckets.
 */
export function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            const type = getAttachmentType(file.type, file.name);
            resolve({
                name: file.name,
                type,
                mimeType: file.type || (type === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
                size: file.size,
                data: result,
            });
        };
        reader.onerror = () => {
            reject(new Error('Failed to encode file in memory'));
        };
        reader.readAsDataURL(file);
    });
}
/**
 * Triggers instant browser download of an in-memory encoded attachment.
 */
export function downloadAttachment(attachment) {
    if (typeof window === 'undefined')
        return;
    try {
        const link = document.createElement('a');
        link.href = attachment.data;
        link.download = attachment.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    catch (err) {
        console.error('Failed to download attachment:', err);
    }
}
