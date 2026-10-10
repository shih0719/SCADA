import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCircuit, updateCircuit, deleteCircuit, getDevice } from '#lib/server/repo.ts';
import { reloadPollers } from '#lib/server/modbus-poller.ts';
import { removeCircuit } from '#lib/server/runtime-state.ts';
import {
	parseIdParam,
	optionalString,
	requireNonNegativeInt,
	requirePositiveInt,
	ValidationError
} from '#lib/server/validation.ts';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const id = parseIdParam(params.id);
		const circuit = getCircuit(id);
		if (!circuit) return json({ error: 'circuit not found' }, { status: 404 });
		return json(circuit);
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseIdParam(params.id);
		const existing = getCircuit(id);
		if (!existing) return json({ error: 'circuit not found' }, { status: 404 });
		const body = await request.json().catch(() => ({}));

		const patch: Record<string, unknown> = {};
		const name = optionalString(body.name, 'name');
		if (name !== undefined) patch.name = name;
		if (body.coil_address !== undefined) {
			patch.coil_address = requireNonNegativeInt(body.coil_address, 'coil_address');
		}
		if (body.device_id !== undefined) {
			const deviceId = requirePositiveInt(body.device_id, 'device_id');
			if (!getDevice(deviceId)) return json({ error: 'device not found' }, { status: 404 });
			patch.device_id = deviceId;
		}

		const updated = updateCircuit(id, patch);
		reloadPollers();
		return json(updated);
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const id = parseIdParam(params.id);
		const existing = getCircuit(id);
		if (!existing) return json({ error: 'circuit not found' }, { status: 404 });
		deleteCircuit(id);
		removeCircuit(id);
		reloadPollers();
		return json({ ok: true });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
