import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDeviceMetrics } from '#lib/server/modbus-poller.ts';

// Minimal local polling-health metrics (recent success rate / latency per
// device), read from an in-memory ring buffer maintained by the poller.
export const GET: RequestHandler = async () => {
	return json(getDeviceMetrics());
};
