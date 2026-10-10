import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getSchedule,
	getScheduleWithSceneName,
	updateSchedule,
	deleteSchedule
} from '#lib/server/schedules-repo.ts';
import { getScene } from '#lib/server/scenes-repo.ts';
import { parseIdParam, optionalString, ValidationError } from '#lib/server/validation.ts';

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

export const GET: RequestHandler = async ({ params }) => {
	try {
		const id = parseIdParam(params.id);
		const schedule = getScheduleWithSceneName(id);
		if (!schedule) return json({ error: 'schedule not found' }, { status: 404 });
		return json(schedule);
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseIdParam(params.id);
		const existing = getSchedule(id);
		if (!existing) return json({ error: 'schedule not found' }, { status: 404 });

		const body = await request.json().catch(() => ({}));
		const patch: {
			name?: string;
			scene_id?: number;
			time_of_day?: string;
			days_of_week?: number[];
			is_enabled?: boolean;
		} = {};

		const name = optionalString(body.name, 'name');
		if (name !== undefined) {
			if (name.trim().length === 0) throw new ValidationError('name must be a non-empty string');
			patch.name = name;
		}
		if (body.scene_id !== undefined) patch.scene_id = parseSceneId(body.scene_id);
		if (body.time_of_day !== undefined) patch.time_of_day = parseTimeOfDay(body.time_of_day);
		if (body.days_of_week !== undefined) patch.days_of_week = parseDaysOfWeek(body.days_of_week);
		if (body.is_enabled !== undefined) patch.is_enabled = Boolean(body.is_enabled);

		updateSchedule(id, patch);
		return json(getScheduleWithSceneName(id));
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const id = parseIdParam(params.id);
		const existing = getSchedule(id);
		if (!existing) return json({ error: 'schedule not found' }, { status: 404 });
		deleteSchedule(id);
		return json({ ok: true });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
