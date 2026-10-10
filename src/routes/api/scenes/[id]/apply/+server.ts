import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSceneWithActions } from '#lib/server/scenes-repo.ts';
import { setCircuitValue } from '#lib/server/circuit-control.ts';
import { parseIdParam, ValidationError } from '#lib/server/validation.ts';

// Applies a scene: fires setCircuitValue for every action in parallel. One
// failing circuit (e.g. its device is offline) must not prevent the others
// from being applied — same "partial failure is fine" philosophy as CSV
// import. If the same circuit_id appears more than once in a scene's
// actions, the last one wins.
//
// "Last one wins" has to be resolved here, before firing anything — the
// writes themselves are concurrent network I/O (Modbus FC5 over TCP), so
// the order two competing writes to the *same* coil actually land in is not
// guaranteed to match array order. Deduping up front means we only ever
// send one write per circuit_id, which is both correct and avoids a race
// against our own request.
export const POST: RequestHandler = async ({ params }) => {
	try {
		const id = parseIdParam(params.id);
		const scene = getSceneWithActions(id);
		if (!scene) return json({ error: 'scene not found' }, { status: 404 });

		const dedupedByCircuitId = new Map<number, boolean>();
		for (const a of scene.actions) dedupedByCircuitId.set(a.circuit_id, a.value);
		const actions = Array.from(dedupedByCircuitId, ([circuit_id, value]) => ({ circuit_id, value }));

		const settled = await Promise.allSettled(
			actions.map((a) => setCircuitValue(a.circuit_id, a.value))
		);

		const results = settled.map((s, i) => {
			if (s.status === 'fulfilled') return s.value;
			const action = actions[i];
			const message = s.reason instanceof Error ? s.reason.message : 'set failed: unknown error';
			return { ok: false as const, circuit_id: action.circuit_id, error: message };
		});

		const success_count = results.filter((r) => r.ok).length;
		const error_count = results.length - success_count;

		return json({ scene_id: id, results, success_count, error_count });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
