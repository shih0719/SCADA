import fs from 'node:fs';
import path from 'node:path';

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'floorplans');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_MIME = new Set(['image/png', 'image/jpeg']);

export function extForMime(mime: string): string {
	if (mime === 'image/png') return '.png';
	if (mime === 'image/jpeg') return '.jpg';
	return '';
}

/** Public URL path (served by src/routes/api/uploads/[...file]/+server.ts) for a stored file name. */
export function publicUploadPath(fileName: string): string {
	return `/api/uploads/${fileName}`;
}
