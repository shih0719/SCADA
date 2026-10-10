import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCircuit } from '#lib/server/repo.ts';
import { getRawState, setCircuitOptimistic } from '#lib/server/runtime-state.ts';
import { writeCoilForCircuit } from '#lib/server/modbus-poller.ts';
import { parseIdParam, ValidationError } from '#lib/server/validation.ts';

export const POST: RequestHandler = async ({ params }) => {
	try {
		const id = parseIdParam(params.id);
		const circuit = getCircuit(id);
		if (!circuit) return json({ error: 'circuit not found' }, { status: 404 });

		const raw = getRawState(id);
		if (!raw || raw.value === null || raw.status === 'error') {
			return json(
				{ error: 'circuit current state is unknown; cannot toggle until next successful read' },
				{ status: 409 }
			);
		}

		const currentValue = raw.value;
		const nextValue = !currentValue;

		// Optimistic update: the frontend should reflect this immediately.
		// Source of truth remains the next poll cycle, which will overwrite
		// this if the real device disagrees.
		setCircuitOptimistic(id, nextValue);

		try {
			await writeCoilForCircuit(id, nextValue);
			return json({ ok: true, circuit_id: id, value: nextValue });
		} catch (err) {
			// Roll back the optimistic update on failure.
			setCircuitOptimistic(id, currentValue);
			const message = err instanceof Error ? err.message : 'write failed';
			return json({ error: `toggle failed: ${message}` }, { status: 502 });
		}
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
