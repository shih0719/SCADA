import { listEnabledSchedulesRaw, setScheduleLastTriggeredAt } from './schedules-repo';
import { applySceneById } from './scene-apply';
import { logger } from './logger';

const MODULE = 'scheduler';
const TICK_INTERVAL_MS = 30_000;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local "HH:MM" for a given Date, matching the stored time_of_day format. */
function timeOfDay(d: Date): string {
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Local "YYYY-MM-DD HH:MM" minute bucket. Used to detect whether a schedule
 * already fired within the current minute (tick() runs every 30s, so a
 * matching minute is seen by roughly two ticks). Date's local getters
 * normalize correctly regardless of how the Date was originally constructed
 * (e.g. from an ISO-8601 UTC string), so this is safe to use on both "now"
 * and a parsed last_triggered_at.
 */
function minuteBucket(d: Date): string {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseDaysOfWeek(raw: string): number[] {
	return raw
		.split(',')
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

export async function tick(): Promise<void> {
	const now = new Date();
	const nowTime = timeOfDay(now);
	const nowDow = now.getDay();
	const nowBucket = minuteBucket(now);

	const schedules = listEnabledSchedulesRaw();

	for (const schedule of schedules) {
		try {
			if (schedule.time_of_day !== nowTime) continue;
			const days = parseDaysOfWeek(schedule.days_of_week);
			if (!days.includes(nowDow)) continue;

			if (schedule.last_triggered_at) {
				const lastBucket = minuteBucket(new Date(schedule.last_triggered_at));
				if (lastBucket === nowBucket) continue; // already fired this minute
			}

			const result = await applySceneById(schedule.scene_id);
			const triggeredAt = new Date().toISOString();
			setScheduleLastTriggeredAt(schedule.id, triggeredAt);

			if (!result) {
				// Scene was deleted but the schedule row survived somehow (FK
				// cascade should normally prevent this). Don't let it crash the
				// tick — just log and move on to the next schedule.
				logger.warn('schedule fired but scene no longer exists', {
					module: MODULE,
					schedule_id: schedule.id,
					scene_id: schedule.scene_id
				});
				continue;
			}

			logger.info('schedule triggered scene apply', {
				module: MODULE,
				schedule_id: schedule.id,
				scene_id: schedule.scene_id,
				success_count: result.success_count,
				error_count: result.error_count
			});
		} catch (err) {
			logger.error('schedule tick failed for schedule', {
				module: MODULE,
				schedule_id: schedule.id,
				error: err instanceof Error ? err.message : String(err)
			});
		}
	}
}

let started = false;

/** Starts the background scheduler loop. Idempotent — safe even if this
 * module is imported more than once (e.g. by both hooks.server.ts and a
 * route), only the first call actually sets up the interval. */
export function startScheduler(): void {
	if (started) return;
	started = true;
	logger.info('scheduler starting', { module: MODULE });
	setInterval(() => void tick(), TICK_INTERVAL_MS);
}
