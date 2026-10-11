import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Deployment settings live in .env (see .env.example). Node loads it here for
// the build-time values below; `npm start` loads the same file for runtime.
try {
	process.loadEnvFile('.env');
} catch {
	// no .env — fine for `npm run dev`
}

// Origins the browser may POST multipart forms from (floorplan upload, backup
// restore). SvelteKit's CSRF check compares the request's Origin header with
// the server's origin, but adapter-node assumes https when it isn't behind a
// proxy, so plain-http LAN access must be listed here explicitly. Baked in at
// build time: rebuild after changing it.
const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-node: `npm run build` emits a standalone Node server in build/
			// (run with `npm start`). This app needs a long-lived Node process for
			// the background Modbus poller and scheduler, so serverless adapters
			// are not an option.
			adapter: adapter(),

			csrf: { trustedOrigins }
		})
	]
});
