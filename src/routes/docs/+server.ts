import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// The user docs are static HTML in static/docs/. Static files are only served
// by exact path, so send a bare /docs (or /docs/) to the index page.
export const GET: RequestHandler = () => {
	redirect(308, '/docs/index.html');
};
