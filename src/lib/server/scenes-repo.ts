import { db } from './db';
import type { Scene, SceneSummary, SceneWithActions, SceneActionDetail } from './types';

const nowIso = () => new Date().toISOString();

export function getScene(id: number): Scene | undefined {
	return db.prepare('SELECT * FROM scenes WHERE id = ?').get(id) as Scene | undefined;
}

export function listScenes(): SceneSummary[] {
	return db
		.prepare(
			`SELECT s.*, (SELECT COUNT(*) FROM scene_actions sa WHERE sa.scene_id = s.id) as action_count
			 FROM scenes s ORDER BY s.id`
		)
		.all() as SceneSummary[];
}

export function getSceneWithActions(id: number): SceneWithActions | undefined {
	const scene = getScene(id);
	if (!scene) return undefined;
	const actions = db
		.prepare(
			`SELECT sa.circuit_id as circuit_id, sa.value as value,
			        c.name as circuit_name, c.space_id as space_id, sp.name as space_name
			 FROM scene_actions sa
			 JOIN circuits c ON c.id = sa.circuit_id
			 JOIN spaces sp ON sp.id = c.space_id
			 WHERE sa.scene_id = ?
			 ORDER BY sa.id`
		)
		.all(id) as (Omit<SceneActionDetail, 'value'> & { value: number })[];
	return {
		...scene,
		actions: actions.map((a) => ({ ...a, value: Boolean(a.value) }))
	};
}

function insertActions(sceneId: number, actions: { circuit_id: number; value: boolean }[]) {
	const stmt = db.prepare(
		'INSERT INTO scene_actions (scene_id, circuit_id, value) VALUES (?, ?, ?)'
	);
	for (const a of actions) {
		stmt.run(sceneId, a.circuit_id, a.value ? 1 : 0);
	}
}

export function createScene(
	name: string,
	actions: { circuit_id: number; value: boolean }[]
): Scene {
	const ts = nowIso();
	const tx = db.transaction(() => {
		const info = db
			.prepare('INSERT INTO scenes (name, created_at, updated_at) VALUES (?, ?, ?)')
			.run(name, ts, ts);
		const sceneId = info.lastInsertRowid as number;
		insertActions(sceneId, actions);
		return sceneId;
	});
	const sceneId = tx();
	return getScene(sceneId)!;
}

export function updateScene(
	id: number,
	patch: { name?: string; actions?: { circuit_id: number; value: boolean }[] }
): Scene | undefined {
	const existing = getScene(id);
	if (!existing) return undefined;
	const tx = db.transaction(() => {
		if (patch.name !== undefined) {
			db.prepare('UPDATE scenes SET name = ?, updated_at = ? WHERE id = ?').run(
				patch.name,
				nowIso(),
				id
			);
		} else {
			db.prepare('UPDATE scenes SET updated_at = ? WHERE id = ?').run(nowIso(), id);
		}
		if (patch.actions !== undefined) {
			db.prepare('DELETE FROM scene_actions WHERE scene_id = ?').run(id);
			insertActions(id, patch.actions);
		}
	});
	tx();
	return getScene(id);
}

export function deleteScene(id: number): boolean {
	// scene_actions rows are removed automatically via ON DELETE CASCADE
	// (foreign_keys = ON is set globally in db.ts).
	const info = db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
	return info.changes > 0;
}
