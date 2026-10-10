import type { Handle } from '@sveltejs/kit/hooks';
import './lib/server/db';
import { startPolling } from './lib/server/modbus-poller';

// This module is evaluated once when the SvelteKit Node server process
// starts (both in `vite dev` and in the built/preview server). That makes
// it the right place to kick off the background Modbus polling loop: it is
// NOT triggered by any incoming HTTP request, it just runs on a timer for
// as long as the server process is alive. See src/lib/server/modbus-poller.ts.
startPolling();

export const handle: Handle = async ({ event, resolve }) => {
	return resolve(event);
};
