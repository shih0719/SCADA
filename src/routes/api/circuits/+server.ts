import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listCircuitsBySpace, listAllCircuits, createCircuit, getSpace, getDevice } from '#lib/server/repo.ts';
import { reloadPollers } from '#lib/server/modbus-poller.ts';
import {
	requireString,
	requirePositiveInt,
	requireNonNegativeInt,
	ValidationError
} from '#lib/server/validation.ts';

export const GET: RequestHandler = async ({ url }) => {
	// Scenes span multiple Spaces, so the scene editor UI needs the full list
	// of Circuits across every Space. ?all=true opts into that; the default
	// (space_id required) behavior for the per-Space circuit list is unchanged.
	if (url.searchParams.get('all') === 'true') {
		return json(listAllCircuits());
	}

	const spaceIdRaw = url.searchParams.get('space_id');
	if (!spaceIdRaw) {
		return json({ error: 'space_id query parameter is required' }, { status: 400 });
	}
	const spaceId = Number(spaceIdRaw);
	if (!Number.isInteger(spaceId) || spaceId <= 0) {
		return json({ error: 'space_id must be a positive integer' }, { status: 400 });
	}
	return json(listCircuitsBySpace(spaceId));
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const space_id = requirePositiveInt(body.space_id, 'space_id');
		const device_id = requirePositiveInt(body.device_id, 'device_id');
		const coil_address = requireNonNegativeInt(body.coil_address, 'coil_address');
		const name = requireString(body.name, 'name');

		if (!getSpace(space_id)) return json({ error: 'space not found' }, { status: 404 });
		if (!getDevice(device_id)) return json({ error: 'device not found' }, { status: 404 });

		const circuit = createCircuit({ space_id, device_id, coil_address, name });
		reloadPollers();
		return json(circuit, { status: 201 });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
