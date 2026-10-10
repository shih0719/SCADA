import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getScene, getSceneWithActions, updateScene, deleteScene } from '#lib/server/scenes-repo.ts';
import { getCircuit } from '#lib/server/repo.ts';
import { parseIdParam, optionalString, ValidationError } from '#lib/server/validation.ts';

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

export const GET: RequestHandler = async ({ params }) => {
	try {
		const id = parseIdParam(params.id);
		const scene = getSceneWithActions(id);
		if (!scene) return json({ error: 'scene not found' }, { status: 404 });
		return json(scene);
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const id = parseIdParam(params.id);
		const existing = getScene(id);
		if (!existing) return json({ error: 'scene not found' }, { status: 404 });

		const body = await request.json().catch(() => ({}));
		const patch: { name?: string; actions?: ActionInput[] } = {};
		const name = optionalString(body.name, 'name');
		if (name !== undefined) {
			if (name.trim().length === 0) throw new ValidationError('name must be a non-empty string');
			patch.name = name;
		}
		if (body.actions !== undefined) {
			patch.actions = parseActions(body.actions);
		}
		updateScene(id, patch);
		return json(getSceneWithActions(id));
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const id = parseIdParam(params.id);
		const existing = getScene(id);
		if (!existing) return json({ error: 'scene not found' }, { status: 404 });
		deleteScene(id);
		return json({ ok: true });
	} catch (e) {
		if (e instanceof ValidationError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
