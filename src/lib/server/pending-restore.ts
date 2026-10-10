import fs from 'node:fs';
import path from 'node:path';

/**
 * Applying a staged backup restore has to happen BEFORE db.ts opens its
 * single long-lived better-sqlite3 connection, so this module intentionally
 * has NO dependency on db.ts (that would create an import cycle, since
 * backup.ts — which stages the restore — imports DB_PATH/db from db.ts).
 * db.ts computes DATA_DIR/DB_PATH itself and passes them in here before
 * calling `new Database(DB_PATH)`.
 */
export function pendingRestoreMarkerPath(dataDir: string): string {
	return path.join(dataDir, '.pending-restore');
}

export function applyPendingRestoreIfAny(dataDir: string, dbPath: string): void {
	const markerPath = pendingRestoreMarkerPath(dataDir);
	if (!fs.existsSync(markerPath)) return;

	const restoringPath = fs.readFileSync(markerPath, 'utf-8').trim();
	if (restoringPath && fs.existsSync(restoringPath)) {
		if (fs.existsSync(dbPath)) {
			const bakPath = `${dbPath}.bak`;
			fs.rmSync(bakPath, { force: true });
			fs.renameSync(dbPath, bakPath);
		}
		// Clean up any stale WAL/SHM files so the restored db starts fresh.
		for (const suffix of ['-wal', '-shm']) {
			fs.rmSync(`${dbPath}${suffix}`, { force: true });
		}
		fs.renameSync(restoringPath, dbPath);
	}

	fs.rmSync(markerPath, { force: true });
}
