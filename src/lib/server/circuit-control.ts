import { getCircuit } from './repo';
import { setCircuitOptimistic } from './runtime-state';
import { writeCoilForCircuit } from './modbus-poller';

// Shared core used by /api/circuits/[id]/set, /api/spaces/[id]/bulk-set, and
// /api/scenes/[id]/apply. Behavior must stay identical to what the original
// /set endpoint did inline: optimistic update first (so the UI can reflect
// it immediately), then an actual Modbus FC5 write. We don't know a prior
// value here (that's the point of "set", unlike "toggle"), so there is
// nothing meaningful to roll the optimistic state back to on failure — the
// next poll cycle will correct it regardless.
export type SetCircuitResult =
	| { ok: true; circuit_id: number; value: boolean }
	| { ok: false; circuit_id: number; error: string; notFound?: boolean };

export async function setCircuitValue(circuitId: number, value: boolean): Promise<SetCircuitResult> {
	const circuit = getCircuit(circuitId);
	if (!circuit) {
		return { ok: false, circuit_id: circuitId, error: 'circuit not found', notFound: true };
	}

	setCircuitOptimistic(circuitId, value);

	try {
		await writeCoilForCircuit(circuitId, value);
		return { ok: true, circuit_id: circuitId, value };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'write failed';
		return { ok: false, circuit_id: circuitId, error: `set failed: ${message}` };
	}
}
