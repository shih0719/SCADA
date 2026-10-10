import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCircuit, updateCircuitPosition } from '#lib/server/repo.ts';
import { parseIdParam, ValidationError } from '#lib/server/validation.ts';

// Lightweight, high-frequency-friendly endpoint: called once when the user
// releases a dragged circuit icon (not on every mousemove frame).
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseIdParam(params.id);
		const existing = getCircuit(id);
		if (!existing) return json({ error: 'circuit not found' }, { status: 404 });

		const body = await request.json().catch(() => ({}));
		const pos_x = Number(body.pos_x);
		const pos_y = Number(body.pos_y);
		if (!Number.isFinite(pos_x) || !Number.isFinite(pos_y)) {
			throw new ValidationError('pos_x and pos_y must be finite numbers');
		}

		const updated = updateCircuitPosition(id, pos_x, pos_y);
		return json(updated);
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
