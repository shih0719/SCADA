import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listDevices, createDevice } from '#lib/server/repo.ts';
import { reloadPollers } from '#lib/server/modbus-poller.ts';
import {
	requireString,
	requireIp,
	requirePort,
	requireNonNegativeInt,
	optionalPositiveInt,
	ValidationError
} from '#lib/server/validation.ts';

export const GET: RequestHandler = async () => {
	return json(listDevices());
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const name = requireString(body.name, 'name');
		const ip_address = requireIp(body.ip_address);
		const port = requirePort(body.port);
		const slave_id = requireNonNegativeInt(body.slave_id ?? 1, 'slave_id');
		const poll_interval_ms = optionalPositiveInt(body.poll_interval_ms, 'poll_interval_ms');
		const timeout_ms = optionalPositiveInt(body.timeout_ms, 'timeout_ms');
		const is_enabled = body.is_enabled === undefined ? true : Boolean(body.is_enabled);

		const device = createDevice({
			name,
			ip_address,
			port,
			slave_id,
			poll_interval_ms,
			timeout_ms,
			is_enabled
		});
		reloadPollers();
		return json(device, { status: 201 });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
