import type { RequestHandler } from './$types';
import { createBackupZip } from '#lib/server/backup.ts';

// GET /api/backup/export
//   Packages the whole app state (scada.db + uploads/) into a single zip
//   and streams it back as a download. See src/lib/server/backup.ts for
//   the format (manifest.json / scada.db / uploads/**).
export const GET: RequestHandler = async () => {
	const zipBuf = createBackupZip();

	const now = new Date();
	const stamp = now.toISOString().replace(/[:.]/g, '-');
	const fileName = `scada-backup-${stamp}.zip`;

	return new Response(new Uint8Array(zipBuf), {
		status: 200,
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${fileName}"`
		}
	});
};
