import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDevice, updateDevice, deleteDevice, countCircuitsForDevice } from '#lib/server/repo.ts';
import { reloadPollers } from '#lib/server/modbus-poller.ts';
import {
	parseIdParam,
	optionalString,
	requireIp,
	requirePort,
	requireNonNegativeInt,
	optionalPositiveInt,
	ValidationError
} from '#lib/server/validation.ts';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const id = parseIdParam(params.id);
		const device = getDevice(id);
		if (!device) return json({ error: 'device not found' }, { status: 404 });
		return json({ ...device, circuit_count: countCircuitsForDevice(id) });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseIdParam(params.id);
		const existing = getDevice(id);
		if (!existing) return json({ error: 'device not found' }, { status: 404 });
		const body = await request.json().catch(() => ({}));

		const patch: Record<string, unknown> = {};
		const name = optionalString(body.name, 'name');
		if (name !== undefined) patch.name = name;
		if (body.ip_address !== undefined) patch.ip_address = requireIp(body.ip_address);
		if (body.port !== undefined) patch.port = requirePort(body.port);
		if (body.slave_id !== undefined) patch.slave_id = requireNonNegativeInt(body.slave_id, 'slave_id');
		const pi = optionalPositiveInt(body.poll_interval_ms, 'poll_interval_ms');
		if (pi !== undefined) patch.poll_interval_ms = pi;
		const to = optionalPositiveInt(body.timeout_ms, 'timeout_ms');
		if (to !== undefined) patch.timeout_ms = to;
		if (body.is_enabled !== undefined) patch.is_enabled = Boolean(body.is_enabled);

		const updated = updateDevice(id, patch);
		reloadPollers();
		return json(updated);
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const id = parseIdParam(params.id);
		const existing = getDevice(id);
		if (!existing) return json({ error: 'device not found' }, { status: 404 });
		const cascade = url.searchParams.get('cascade') === 'true';
		const result = deleteDevice(id, cascade);
		if (!result.ok) {
			return json(
				{
					error: 'device has associated circuits',
					circuit_count: result.circuitCount,
					hint: 'retry with ?cascade=true to delete the device and its circuits together'
				},
				{ status: 409 }
			);
		}
		reloadPollers();
		return json({ ok: true, deleted_circuits: cascade ? result.circuitCount : 0 });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
