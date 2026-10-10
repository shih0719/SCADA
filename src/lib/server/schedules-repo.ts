import { db } from './db';
import type { Schedule, ScheduleWithSceneName } from './types';

const nowIso = () => new Date().toISOString();

function toClient(row: Schedule & { scene_name: string | null }): ScheduleWithSceneName {
	return {
		...row,
		days_of_week: row.days_of_week
			.split(',')
			.map((s) => Number(s.trim()))
			.filter((n) => Number.isInteger(n))
	};
}

export function getSchedule(id: number): Schedule | undefined {
	return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Schedule | undefined;
}

export function getScheduleWithSceneName(id: number): ScheduleWithSceneName | undefined {
	const row = db
		.prepare(
			`SELECT sch.*, sc.name as scene_name
			 FROM schedules sch
			 LEFT JOIN scenes sc ON sc.id = sch.scene_id
			 WHERE sch.id = ?`
		)
		.get(id) as (Schedule & { scene_name: string | null }) | undefined;
	return row ? toClient(row) : undefined;
}

export function listSchedules(): ScheduleWithSceneName[] {
	const rows = db
		.prepare(
			`SELECT sch.*, sc.name as scene_name
			 FROM schedules sch
			 LEFT JOIN scenes sc ON sc.id = sch.scene_id
			 ORDER BY sch.id`
		)
		.all() as (Schedule & { scene_name: string | null })[];
	return rows.map(toClient);
}

/**
 * Returns all enabled schedules as raw rows (days_of_week still the
 * comma-separated string form) — used by the scheduler's tick(), which
 * doesn't need the scene name and works directly against the stored format.
 */
export function listEnabledSchedulesRaw(): Schedule[] {
	return db.prepare('SELECT * FROM schedules WHERE is_enabled = 1').all() as Schedule[];
}

export function createSchedule(input: {
	name: string;
	scene_id: number;
	time_of_day: string;
	days_of_week: number[];
	is_enabled?: boolean;
}): Schedule {
	const ts = nowIso();
	const info = db
		.prepare(
			`INSERT INTO schedules (name, scene_id, time_of_day, days_of_week, is_enabled, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			input.name,
			input.scene_id,
			input.time_of_day,
			input.days_of_week.join(','),
			input.is_enabled === false ? 0 : 1,
			ts,
			ts
		);
	return getSchedule(info.lastInsertRowid as number)!;
}

export function updateSchedule(
	id: number,
	patch: {
		name?: string;
		scene_id?: number;
		time_of_day?: string;
		days_of_week?: number[];
		is_enabled?: boolean;
	}
): Schedule | undefined {
	const existing = getSchedule(id);
	if (!existing) return undefined;

	const fields: string[] = [];
	const values: unknown[] = [];
	if (patch.name !== undefined) {
		fields.push('name = ?');
		values.push(patch.name);
	}
	if (patch.scene_id !== undefined) {
		fields.push('scene_id = ?');
		values.push(patch.scene_id);
	}
	if (patch.time_of_day !== undefined) {
		fields.push('time_of_day = ?');
		values.push(patch.time_of_day);
	}
	if (patch.days_of_week !== undefined) {
		fields.push('days_of_week = ?');
		values.push(patch.days_of_week.join(','));
	}
	if (patch.is_enabled !== undefined) {
		fields.push('is_enabled = ?');
		values.push(patch.is_enabled ? 1 : 0);
	}
	fields.push('updated_at = ?');
	values.push(nowIso());

	db.prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
	return getSchedule(id);
}

export function setScheduleLastTriggeredAt(id: number, isoTimestamp: string): void {
	db.prepare('UPDATE schedules SET last_triggered_at = ? WHERE id = ?').run(isoTimestamp, id);
}

export function deleteSchedule(id: number): boolean {
	const info = db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
	return info.changes > 0;
}
