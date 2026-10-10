import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applySceneById } from '#lib/server/scene-apply.ts';
import { parseIdParam, ValidationError } from '#lib/server/validation.ts';

// Applies a scene. The actual logic (dedupe actions, parallel
// setCircuitValue, assemble results) lives in applySceneById() so the
// background scheduler can call the same core without going through HTTP.
export const POST: RequestHandler = async ({ params }) => {
	try {
		const id = parseIdParam(params.id);
		const result = await applySceneById(id);
		if (!result) return json({ error: 'scene not found' }, { status: 404 });
		return json(result);
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
