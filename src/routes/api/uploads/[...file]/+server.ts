import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOADS_DIR } from '#lib/server/uploads.ts';

const MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg'
};

export const GET: RequestHandler = async ({ params }) => {
	const fileName = params.file ?? '';
	// Prevent path traversal: only allow a bare filename inside UPLOADS_DIR.
	const safeName = path.basename(fileName);
	if (safeName !== fileName) {
		return new Response('not found', { status: 404 });
	}
	const filePath = path.join(UPLOADS_DIR, safeName);
	if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath)) {
		return new Response('not found', { status: 404 });
	}
	const ext = path.extname(safeName).toLowerCase();
	const body = fs.readFileSync(filePath);
	return new Response(body, {
		headers: {
			'content-type': MIME[ext] ?? 'application/octet-stream',
			'cache-control': 'no-cache'
		}
	});
};
