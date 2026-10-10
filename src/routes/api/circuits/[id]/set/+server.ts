import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCircuit } from '#lib/server/repo.ts';
import { setCircuitValue } from '#lib/server/circuit-control.ts';
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

		// setCircuitValue does the optimistic update + Modbus FC5 write; the
		// core logic here is shared with bulk-set and scene-apply, but the
		// request/response contract of this endpoint stays exactly as before.
		const result = await setCircuitValue(id, targetValue);
		if (!result.ok) {
			return json({ error: result.error }, { status: 502 });
		}
		return json({ ok: true, circuit_id: result.circuit_id, value: result.value });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
