import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { restoreBackupZip } from '#lib/server/backup.ts';

// POST /api/backup/restore
//   multipart/form-data, field name `file` (a .zip produced by GET /api/backup/export).
//   Stages the restore (db file + uploads) on disk; the restored database
//   only takes effect after the server process is restarted, since the
//   running process holds a single long-lived better-sqlite3 connection
//   that is never hot-swapped. See src/lib/server/backup.ts.
export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) {
		return json({ error: 'file field is required (multipart/form-data)' }, { status: 400 });
	}

	const buf = Buffer.from(await file.arrayBuffer());
	const result = restoreBackupZip(buf);

	if (!result.ok) {
		return json({ error: result.error }, { status: 400 });
	}

	return json({
		ok: true,
		action_required: '請重新啟動伺服器（或重新啟動系統服務）以套用還原的資料'
	});
};
