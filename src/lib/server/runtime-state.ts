import type { CircuitRuntimeState, CircuitStatus } from './types';

// Fixed once when this module is first loaded by the server process.
// Used by the frontend to detect "server just restarted" and show a
// transient notice instead of treating fresh data as a device error.
export const serverStartedAt = new Date().toISOString();

// In-memory, non-persistent runtime cache: circuit_id -> state
const states = new Map<number, CircuitRuntimeState>();

export function setCircuitOk(circuitId: number, value: boolean) {
	states.set(circuitId, {
		circuit_id: circuitId,
		value,
		status: 'ok',
		last_updated_at: new Date().toISOString()
	});
}

export function setCircuitError(circuitId: number) {
	const existing = states.get(circuitId);
	states.set(circuitId, {
		circuit_id: circuitId,
		value: null,
		status: 'error',
		last_updated_at: existing?.last_updated_at ?? null
	});
}

export function setCircuitOptimistic(circuitId: number, value: boolean) {
	const existing = states.get(circuitId);
	if (!existing) return;
	states.set(circuitId, { ...existing, value });
}

export function getRawState(circuitId: number): CircuitRuntimeState | undefined {
	return states.get(circuitId);
}

/**
 * Returns the display state for a circuit, applying staleness logic:
 * if last successful update is older than the staleness threshold, downgrade
 * an "ok" status to "stale" (keeping the last known value as a secondary hint).
 * Circuits never polled yet, or in "error", are reported accordingly.
 */
export function getDisplayState(
	circuitId: number,
	staleThresholdMs: number
): CircuitRuntimeState {
	const s = states.get(circuitId);
	if (!s) {
		return { circuit_id: circuitId, value: null, status: 'error', last_updated_at: null };
	}
	if (s.status === 'error') return s;
	if (s.last_updated_at) {
		const age = Date.now() - new Date(s.last_updated_at).getTime();
		if (age > staleThresholdMs) {
			return { ...s, status: 'stale' as CircuitStatus };
		}
	}
	return s;
}

export function removeCircuit(circuitId: number) {
	states.delete(circuitId);
}
