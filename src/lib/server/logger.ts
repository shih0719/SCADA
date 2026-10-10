import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const LOG_PATH = path.join(DATA_DIR, 'app.log');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const envLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const configuredLevel: Level = (envLevel in LEVELS ? envLevel : 'info') as Level;
const threshold = LEVELS[configuredLevel];

function rotateIfNeeded() {
	try {
		const stat = fs.statSync(LOG_PATH);
		if (stat.size > MAX_LOG_BYTES) {
			const rotated = `${LOG_PATH}.1`;
			try {
				fs.rmSync(rotated, { force: true });
			} catch {
				// ignore
			}
			fs.renameSync(LOG_PATH, rotated);
		}
	} catch {
		// file does not exist yet — nothing to rotate
	}
}

function write(level: Level, message: string, meta?: Record<string, unknown>) {
	if (LEVELS[level] < threshold) return;
	const module = (meta?.module as string | undefined) ?? 'app';
	const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${module}] ${message}${
		meta ? ' ' + JSON.stringify(meta) : ''
	}`;
	const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
	consoleFn(line);
	try {
		rotateIfNeeded();
		fs.appendFileSync(LOG_PATH, line + '\n');
	} catch {
		// ignore file write failures — console output above still happened
	}
}

/**
 * Minimal local logger for a single-machine SCADA tool. Writes to console
 * and appends to data/app.log (rotates to app.log.1 past ~5MB). Pass a
 * `module` field in meta to tag the source, e.g.
 * logger.warn('connect failed', { module: 'modbus-poller', device_id, ip_address }).
 * Threshold configurable via LOG_LEVEL env var (default: info).
 */
export const logger = {
	debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
	info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
	warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
	error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta)
};
