import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCircuit } from '#lib/server/repo.ts';
import { setCircuitOptimistic } from '#lib/server/runtime-state.ts';
import { writeCoilForCircuit } from '#lib/server/modbus-poller.ts';
import { parseIdParam, ValidationError } from '#lib/server/validation.ts';

// Unlike /toggle (which inverts the currently-known value and therefore
// requires a known current state), this endpoint sets an explicit target
// value regardless of what the circuit's current state is — useful for
// external integrations that want "make sure this light is ON" without
// first having to query and compare.
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseIdParam(params.id);
		const circuit = getCircuit(id);
		if (!circuit) return json({ error: 'circuit not found' }, { status: 404 });

		const body = await request.json().catch(() => ({}));
		if (typeof body.value !== 'boolean') {
			throw new ValidationError('value is required and must be a boolean (true or false)');
		}
		const targetValue: boolean = body.value;

		// Optimistic update: the frontend/caller should be able to reflect this
		// immediately. Source of truth remains the next poll cycle, which will
		// overwrite this if the real device disagrees.
		setCircuitOptimistic(id, targetValue);

		try {
			await writeCoilForCircuit(id, targetValue);
			return json({ ok: true, circuit_id: id, value: targetValue });
		} catch (err) {
			// We don't know the prior value here (that's the point of this
			// endpoint), so there is nothing meaningful to roll the optimistic
			// state back to; the next poll cycle will correct it regardless.
			const message = err instanceof Error ? err.message : 'write failed';
			return json({ error: `set failed: ${message}` }, { status: 502 });
		}
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
