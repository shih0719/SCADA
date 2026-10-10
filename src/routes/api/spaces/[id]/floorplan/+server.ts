import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { imageSize } from 'image-size';
import { getSpace, updateSpace } from '#lib/server/repo.ts';
import { parseIdParam, ValidationError } from '#lib/server/validation.ts';
import { UPLOADS_DIR, MAX_UPLOAD_BYTES, ALLOWED_MIME, extForMime, publicUploadPath } from '#lib/server/uploads.ts';

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseIdParam(params.id);
		const space = getSpace(id);
		if (!space) return json({ error: 'space not found' }, { status: 404 });

		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) {
			return json({ error: 'file field is required (multipart/form-data)' }, { status: 400 });
		}
		if (!ALLOWED_MIME.has(file.type)) {
			return json({ error: `unsupported file type: ${file.type}. Allowed: PNG, JPG` }, { status: 400 });
		}
		if (file.size > MAX_UPLOAD_BYTES) {
			return json({ error: `file too large: max ${MAX_UPLOAD_BYTES} bytes` }, { status: 400 });
		}

		const buf = Buffer.from(await file.arrayBuffer());
		const dims = imageSize(buf);
		const fileName = `space-${id}-${Date.now()}${extForMime(file.type)}`;
		const filePath = path.join(UPLOADS_DIR, fileName);
		fs.writeFileSync(filePath, buf);

		const urlPath = publicUploadPath(fileName);
		const updated = updateSpace(id, {
			floorplan_image_path: urlPath,
			floorplan_width: dims.width,
			floorplan_height: dims.height
		});

		return json(updated);
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
