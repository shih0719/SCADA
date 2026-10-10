import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSpace, listCircuitsBySpace, getDevice } from '#lib/server/repo.ts';
import { getDisplayState } from '#lib/server/runtime-state.ts';
import { staleThresholdFor } from '#lib/server/modbus-poller.ts';
import { parseIdParam, ValidationError } from '#lib/server/validation.ts';

// Reads only the in-memory runtime cache — never triggers a live Modbus
// read. The background poller (src/lib/server/modbus-poller.ts) is the only
// thing that talks to Modbus.
export const GET: RequestHandler = async ({ params }) => {
	try {
		const spaceId = parseIdParam(params.id);
		const space = getSpace(spaceId);
		if (!space) return json({ error: 'space not found' }, { status: 404 });

		const circuits = listCircuitsBySpace(spaceId);
		const states = circuits.map((c) => {
			const device = getDevice(c.device_id);
			const threshold = staleThresholdFor(device);
			return getDisplayState(c.id, threshold);
		});
		return json(states);
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
