import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { db, DB_PATH, DATA_DIR } from './db';
import { UPLOADS_DIR } from './uploads';
import { pendingRestoreMarkerPath } from './pending-restore';

const APP_ID = 'scada-lighting-control';
const MANIFEST_VERSION = 1;

const PENDING_RESTORE_MARKER = pendingRestoreMarkerPath(DATA_DIR);

interface Manifest {
	app: string;
	version: number;
	created_at: string;
}

/** Recursively collects every file under `dir`, returning paths relative to `dir`. */
function listFilesRecursive(dir: string): string[] {
	const results: string[] = [];
	if (!fs.existsSync(dir)) return results;

	function walk(current: string) {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile()) {
				results.push(path.relative(dir, full));
			}
		}
	}

	walk(dir);
	return results;
}

/**
 * Builds a full backup zip in memory: scada.db (flushed via WAL checkpoint),
 * every file under UPLOADS_DIR (under an `uploads/` prefix), and a manifest.json
 * used by restoreBackupZip() to sanity-check the file before trusting it.
 */
export function createBackupZip(): Buffer {
	// Flush the WAL back into the main db file so the bytes we zip are complete
	// and self-contained (no separate -wal/-shm files needed in the backup).
	db.pragma('wal_checkpoint(TRUNCATE)');

	const zip = new AdmZip();

	const dbBuf = fs.readFileSync(DB_PATH);
	zip.addFile('scada.db', dbBuf);

	for (const rel of listFilesRecursive(UPLOADS_DIR)) {
		const full = path.join(UPLOADS_DIR, rel);
		const zipPath = path.posix.join('uploads', rel.split(path.sep).join('/'));
		zip.addFile(zipPath, fs.readFileSync(full));
	}

	const manifest: Manifest = {
		app: APP_ID,
		version: MANIFEST_VERSION,
		created_at: new Date().toISOString()
	};
	zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

	return zip.toBuffer();
}

/**
 * Validates and stages a backup zip for restore. Because the running process
 * holds a single long-lived better-sqlite3 connection for its whole lifetime,
 * we deliberately do NOT hot-swap the database file here. Instead:
 *   1. the restored scada.db is written next to the real one as `<DB_PATH>.restoring`
 *   2. uploads/ is restored immediately (no file-locking concerns there)
 *   3. a marker file is written recording the `.restoring` path
 *   4. db.ts checks for that marker BEFORE opening its better-sqlite3 connection
 *      on the next process start, and if present, swaps the files in then.
 * The caller (the API route) is responsible for telling the user a restart is
 * required before the restored data actually takes effect.
 */
export function restoreBackupZip(buf: Buffer): { ok: true } | { ok: false; error: string } {
	let zip: AdmZip;
	try {
		zip = new AdmZip(buf);
	} catch {
		return { ok: false, error: '不是有效的備份檔' };
	}

	const manifestEntry = zip.getEntry('manifest.json');
	if (!manifestEntry) {
		return { ok: false, error: '不是有效的備份檔' };
	}

	let manifest: Manifest;
	try {
		manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
	} catch {
		return { ok: false, error: '不是有效的備份檔' };
	}

	if (!manifest || manifest.app !== APP_ID) {
		return { ok: false, error: '不是有效的備份檔' };
	}

	const dbEntry = zip.getEntry('scada.db');
	if (!dbEntry) {
		return { ok: false, error: '不是有效的備份檔（缺少 scada.db）' };
	}

	// Stage the restored db next to the real file — never touch DB_PATH directly
	// while the process has it open.
	const restoringPath = `${DB_PATH}.restoring`;
	fs.writeFileSync(restoringPath, dbEntry.getData());

	// Sanity-check that the staged file is actually a readable, non-corrupt
	// SQLite database before committing to it via the pending-restore marker.
	// Without this, a corrupt/truncated "scada.db" entry would only be
	// discovered on the *next* server start — i.e. it would brick the server
	// instead of failing this request. better-sqlite3's own open validates the
	// file header; `PRAGMA quick_check` additionally catches structural
	// corruption that a bare open wouldn't.
	try {
		const probe = new Database(restoringPath, { readonly: true });
		try {
			// { simple: true } returns the raw pragma value ("ok") directly
			// instead of an array of { quick_check: ... } row objects.
			const result = probe.pragma('quick_check', { simple: true });
			if (result !== 'ok') {
				throw new Error(`quick_check failed: ${String(result)}`);
			}
		} finally {
			probe.close();
		}
	} catch {
		// Clean up the staged file and any WAL/SHM sidecar files the failed
		// probe-open may have created alongside it.
		fs.rmSync(restoringPath, { force: true });
		fs.rmSync(`${restoringPath}-wal`, { force: true });
		fs.rmSync(`${restoringPath}-shm`, { force: true });
		return { ok: false, error: '備份檔內的資料庫檔案已損毀或格式不正確' };
	}

	// Replace uploads/ contents. Only ever touch paths strictly inside
	// UPLOADS_DIR (resolved + prefix-checked) to avoid any path-traversal
	// surprises from a crafted zip.
	clearDirectoryContents(UPLOADS_DIR);

	const uploadsPrefix = 'uploads/';
	for (const entry of zip.getEntries()) {
		if (entry.isDirectory) continue;
		if (!entry.entryName.startsWith(uploadsPrefix)) continue;
		const relPath = entry.entryName.slice(uploadsPrefix.length);
		if (!relPath) continue;

		const destPath = path.resolve(UPLOADS_DIR, relPath);
		const uploadsResolved = path.resolve(UPLOADS_DIR);
		if (destPath !== uploadsResolved && !destPath.startsWith(uploadsResolved + path.sep)) {
			// Path traversal attempt inside the zip — skip this entry.
			continue;
		}

		fs.mkdirSync(path.dirname(destPath), { recursive: true });
		fs.writeFileSync(destPath, entry.getData());
	}

	fs.writeFileSync(PENDING_RESTORE_MARKER, restoringPath, 'utf-8');

	return { ok: true };
}

/** Deletes all files/subdirectories inside `dir`, but never `dir` itself. */
function clearDirectoryContents(dir: string): void {
	const resolved = path.resolve(dir);
	if (!fs.existsSync(resolved)) return;
	for (const entry of fs.readdirSync(resolved)) {
		const full = path.join(resolved, entry);
		fs.rmSync(full, { recursive: true, force: true });
	}
}
