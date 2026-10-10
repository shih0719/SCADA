import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listScenes, createScene } from '#lib/server/scenes-repo.ts';
import { getCircuit } from '#lib/server/repo.ts';
import { requireString, ValidationError } from '#lib/server/validation.ts';

interface ActionInput {
	circuit_id: number;
	value: boolean;
}

function parseActions(raw: unknown): ActionInput[] {
	if (!Array.isArray(raw)) {
		throw new ValidationError('actions must be an array');
	}
	const actions: ActionInput[] = [];
	for (const item of raw) {
		const circuitId = Number((item as Record<string, unknown>)?.circuit_id);
		if (!Number.isInteger(circuitId) || circuitId <= 0) {
			throw new ValidationError(
				`actions contains an invalid circuit_id: ${JSON.stringify((item as Record<string, unknown>)?.circuit_id)}`
			);
		}
		if (!getCircuit(circuitId)) {
			throw new ValidationError(`circuit_id ${circuitId} does not exist`);
		}
		const value = (item as Record<string, unknown>)?.value;
		if (typeof value !== 'boolean') {
			throw new ValidationError(`actions entry for circuit_id ${circuitId} must have a boolean value`);
		}
		actions.push({ circuit_id: circuitId, value });
	}
	return actions;
}

export const GET: RequestHandler = async () => {
	return json(listScenes());
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const name = requireString(body.name, 'name');
		const actions = parseActions(body.actions ?? []);
		const scene = createScene(name, actions);
		return json(scene, { status: 201 });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
