import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDeviceHealthSnapshot } from '#lib/server/modbus-poller.ts';
import { serverStartedAt } from '#lib/server/runtime-state.ts';

const DEGRADED_FAILURE_THRESHOLD = 3;

// Local health-check endpoint. Always responds HTTP 200 — the status
// ("ok" | "degraded") is carried in the body, not the status code, since
// this is a personal/local tool with no load balancer in front of it.
export const GET: RequestHandler = async () => {
	const devices = getDeviceHealthSnapshot();
	const degraded = devices.some(
		(d) => d.is_enabled && d.consecutive_failures >= DEGRADED_FAILURE_THRESHOLD
	);
	const startedMs = new Date(serverStartedAt).getTime();
	return json({
		status: degraded ? 'degraded' : 'ok',
		server_started_at: serverStartedAt,
		uptime_ms: Date.now() - startedMs,
		devices
	});
};
