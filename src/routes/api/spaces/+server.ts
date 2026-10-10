import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSpaces, createSpace } from '#lib/server/repo.ts';
import { requireString, ValidationError } from '#lib/server/validation.ts';

export const GET: RequestHandler = async () => {
	return json(listSpaces());
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const name = requireString(body.name, 'name');
		const space = createSpace(name);
		return json(space, { status: 201 });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
