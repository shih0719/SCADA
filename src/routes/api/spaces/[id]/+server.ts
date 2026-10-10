import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSpace, updateSpace, deleteSpace } from '#lib/server/repo.ts';
import { parseIdParam, optionalString, ValidationError } from '#lib/server/validation.ts';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const id = parseIdParam(params.id);
		const space = getSpace(id);
		if (!space) return json({ error: 'space not found' }, { status: 404 });
		return json(space);
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseIdParam(params.id);
		const existing = getSpace(id);
		if (!existing) return json({ error: 'space not found' }, { status: 404 });
		const body = await request.json().catch(() => ({}));
		const name = optionalString(body.name, 'name');
		const updated = updateSpace(id, { name: name ?? existing.name });
		return json(updated);
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const id = parseIdParam(params.id);
		const existing = getSpace(id);
		if (!existing) return json({ error: 'space not found' }, { status: 404 });
		const cascade = url.searchParams.get('cascade') === 'true';
		const result = deleteSpace(id, cascade);
		if (!result.ok) {
			return json(
				{
					error: 'space has associated circuits',
					circuit_count: result.circuitCount,
					hint: 'retry with ?cascade=true to delete the space and its circuits together'
				},
				{ status: 409 }
			);
		}
		return json({ ok: true, deleted_circuits: cascade ? result.circuitCount : 0 });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
