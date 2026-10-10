import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSchedules, createSchedule, getScheduleWithSceneName } from '#lib/server/schedules-repo.ts';
import { getScene } from '#lib/server/scenes-repo.ts';
import { requireString, ValidationError } from '#lib/server/validation.ts';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseSceneId(raw: unknown): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n <= 0) {
		throw new ValidationError('scene_id must be a positive integer');
	}
	if (!getScene(n)) {
		throw new ValidationError(`scene_id ${n} does not exist`);
	}
	return n;
}

function parseTimeOfDay(raw: unknown): string {
	if (typeof raw !== 'string' || !TIME_RE.test(raw)) {
		throw new ValidationError('time_of_day must be in "HH:MM" 24-hour format');
	}
	return raw;
}

function parseDaysOfWeek(raw: unknown): number[] {
	if (!Array.isArray(raw) || raw.length === 0) {
		throw new ValidationError('days_of_week must be a non-empty array of integers 0-6');
	}
	const days = raw.map((v) => Number(v));
	for (const d of days) {
		if (!Number.isInteger(d) || d < 0 || d > 6) {
			throw new ValidationError('days_of_week entries must be integers between 0 and 6');
		}
	}
	return Array.from(new Set(days)).sort((a, b) => a - b);
}

export const GET: RequestHandler = async () => {
	return json(listSchedules());
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const name = requireString(body.name, 'name');
		const scene_id = parseSceneId(body.scene_id);
		const time_of_day = parseTimeOfDay(body.time_of_day);
		const days_of_week = parseDaysOfWeek(body.days_of_week);
		const is_enabled = body.is_enabled === undefined ? true : Boolean(body.is_enabled);

		const schedule = createSchedule({ name, scene_id, time_of_day, days_of_week, is_enabled });
		return json(getScheduleWithSceneName(schedule.id), { status: 201 });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
