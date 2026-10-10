import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSpace, listCircuitsBySpace } from '#lib/server/repo.ts';
import { setCircuitValue } from '#lib/server/circuit-control.ts';
import { parseIdParam, ValidationError } from '#lib/server/validation.ts';

// Space-wide "all on" / "all off" shortcut for the Operation View. Same
// "partial failure is fine" philosophy as scene apply / CSV import: one
// offline device must not block the rest of the space from being set.
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseIdParam(params.id);
		const space = getSpace(id);
		if (!space) return json({ error: 'space not found' }, { status: 404 });

		const body = await request.json().catch(() => ({}));
		if (typeof body.value !== 'boolean') {
			throw new ValidationError('value is required and must be a boolean (true or false)');
		}
		const targetValue: boolean = body.value;

		const circuits = listCircuitsBySpace(id);
		const settled = await Promise.allSettled(
			circuits.map((c) => setCircuitValue(c.id, targetValue))
		);

		const results = settled.map((s, i) => {
			if (s.status === 'fulfilled') return s.value;
			const message = s.reason instanceof Error ? s.reason.message : 'set failed: unknown error';
			return { ok: false as const, circuit_id: circuits[i].id, error: message };
		});

		const success_count = results.filter((r) => r.ok).length;
		const error_count = results.length - success_count;

		return json({ space_id: id, results, success_count, error_count });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
