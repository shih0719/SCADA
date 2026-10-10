import { getSceneWithActions } from './scenes-repo';
import { setCircuitValue } from './circuit-control';
import type { SetCircuitResult } from './circuit-control';

// Shared core for applying a scene: fires setCircuitValue for every action in
// parallel. One failing circuit (e.g. its device is offline) must not
// prevent the others from being applied — same "partial failure is fine"
// philosophy as CSV import. If the same circuit_id appears more than once in
// a scene's actions, the last one wins.
//
// "Last one wins" has to be resolved here, before firing anything — the
// writes themselves are concurrent network I/O (Modbus FC5 over TCP), so the
// order two competing writes to the *same* coil actually land in is not
// guaranteed to match array order. Deduping up front means we only ever send
// one write per circuit_id, which is both correct and avoids a race against
// our own request.
//
// Used by both POST /api/scenes/:id/apply (manual trigger) and the
// background scheduler (src/lib/server/scheduler.ts) — the HTTP route must
// not call itself over HTTP to reuse this, it calls this function directly.
export interface SceneApplyResult {
	scene_id: number;
	results: SetCircuitResult[];
	success_count: number;
	error_count: number;
}

export async function applySceneById(sceneId: number): Promise<SceneApplyResult | null> {
	const scene = getSceneWithActions(sceneId);
	if (!scene) return null;

	const dedupedByCircuitId = new Map<number, boolean>();
	for (const a of scene.actions) dedupedByCircuitId.set(a.circuit_id, a.value);
	const actions = Array.from(dedupedByCircuitId, ([circuit_id, value]) => ({ circuit_id, value }));

	const settled = await Promise.allSettled(actions.map((a) => setCircuitValue(a.circuit_id, a.value)));

	const results = settled.map((s, i) => {
		if (s.status === 'fulfilled') return s.value;
		const action = actions[i];
		const message = s.reason instanceof Error ? s.reason.message : 'set failed: unknown error';
		return { ok: false as const, circuit_id: action.circuit_id, error: message };
	});

	const success_count = results.filter((r) => r.ok).length;
	const error_count = results.length - success_count;

	return { scene_id: sceneId, results, success_count, error_count };
}
