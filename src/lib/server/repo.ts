import { db } from './db';
import type { Space, Device, Circuit } from './types';

const nowIso = () => new Date().toISOString();

// ---------- Space ----------

export function listSpaces(): Space[] {
	return db.prepare('SELECT * FROM spaces ORDER BY id').all() as Space[];
}

export function getSpace(id: number): Space | undefined {
	return db.prepare('SELECT * FROM spaces WHERE id = ?').get(id) as Space | undefined;
}

export function createSpace(name: string): Space {
	const ts = nowIso();
	const info = db
		.prepare(
			'INSERT INTO spaces (name, created_at, updated_at) VALUES (?, ?, ?)'
		)
		.run(name, ts, ts);
	return getSpace(info.lastInsertRowid as number)!;
}

export function updateSpace(
	id: number,
	patch: Partial<Pick<Space, 'name' | 'floorplan_image_path' | 'floorplan_width' | 'floorplan_height'>>
): Space | undefined {
	const existing = getSpace(id);
	if (!existing) return undefined;
	const merged = { ...existing, ...patch, updated_at: nowIso() };
	db.prepare(
		`UPDATE spaces SET name = ?, floorplan_image_path = ?, floorplan_width = ?, floorplan_height = ?, updated_at = ? WHERE id = ?`
	).run(
		merged.name,
		merged.floorplan_image_path,
		merged.floorplan_width,
		merged.floorplan_height,
		merged.updated_at,
		id
	);
	return getSpace(id);
}

export function countCircuitsForSpace(spaceId: number): number {
	const row = db
		.prepare('SELECT COUNT(*) as c FROM circuits WHERE space_id = ?')
		.get(spaceId) as { c: number };
	return row.c;
}

export function deleteSpace(id: number, cascade: boolean): { ok: boolean; circuitCount: number } {
	const circuitCount = countCircuitsForSpace(id);
	if (circuitCount > 0 && !cascade) {
		return { ok: false, circuitCount };
	}
	const tx = db.transaction(() => {
		if (cascade) db.prepare('DELETE FROM circuits WHERE space_id = ?').run(id);
		db.prepare('DELETE FROM spaces WHERE id = ?').run(id);
	});
	tx();
	return { ok: true, circuitCount };
}

// ---------- Device ----------

export function listDevices(): Device[] {
	return db.prepare('SELECT * FROM devices ORDER BY id').all() as Device[];
}

export function getDevice(id: number): Device | undefined {
	return db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as Device | undefined;
}

export function createDevice(input: {
	name: string;
	ip_address: string;
	port: number;
	slave_id: number;
	poll_interval_ms?: number;
	timeout_ms?: number;
	is_enabled?: boolean;
}): Device {
	const ts = nowIso();
	const info = db
		.prepare(
			`INSERT INTO devices (name, ip_address, port, slave_id, poll_interval_ms, timeout_ms, is_enabled, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			input.name,
			input.ip_address,
			input.port,
			input.slave_id,
			input.poll_interval_ms ?? 1500,
			input.timeout_ms ?? 1000,
			input.is_enabled === false ? 0 : 1,
			ts,
			ts
		);
	return getDevice(info.lastInsertRowid as number)!;
}

export function updateDevice(
	id: number,
	patch: Partial<{
		name: string;
		ip_address: string;
		port: number;
		slave_id: number;
		poll_interval_ms: number;
		timeout_ms: number;
		is_enabled: boolean;
	}>
): Device | undefined {
	const existing = getDevice(id);
	if (!existing) return undefined;
	const merged = {
		...existing,
		...patch,
		is_enabled: patch.is_enabled === undefined ? existing.is_enabled : patch.is_enabled ? 1 : 0,
		updated_at: nowIso()
	};
	db.prepare(
		`UPDATE devices SET name=?, ip_address=?, port=?, slave_id=?, poll_interval_ms=?, timeout_ms=?, is_enabled=?, updated_at=? WHERE id=?`
	).run(
		merged.name,
		merged.ip_address,
		merged.port,
		merged.slave_id,
		merged.poll_interval_ms,
		merged.timeout_ms,
		merged.is_enabled,
		merged.updated_at,
		id
	);
	return getDevice(id);
}

export function countCircuitsForDevice(deviceId: number): number {
	const row = db
		.prepare('SELECT COUNT(*) as c FROM circuits WHERE device_id = ?')
		.get(deviceId) as { c: number };
	return row.c;
}

export function deleteDevice(id: number, cascade: boolean): { ok: boolean; circuitCount: number } {
	const circuitCount = countCircuitsForDevice(id);
	if (circuitCount > 0 && !cascade) {
		return { ok: false, circuitCount };
	}
	const tx = db.transaction(() => {
		if (cascade) db.prepare('DELETE FROM circuits WHERE device_id = ?').run(id);
		db.prepare('DELETE FROM devices WHERE id = ?').run(id);
	});
	tx();
	return { ok: true, circuitCount };
}

// ---------- Circuit ----------

export function listCircuitsBySpace(spaceId: number): Circuit[] {
	return db
		.prepare('SELECT * FROM circuits WHERE space_id = ? ORDER BY id')
		.all(spaceId) as Circuit[];
}

export function listAllCircuits(): Circuit[] {
	return db.prepare('SELECT * FROM circuits ORDER BY id').all() as Circuit[];
}

export function getCircuit(id: number): Circuit | undefined {
	return db.prepare('SELECT * FROM circuits WHERE id = ?').get(id) as Circuit | undefined;
}

export function createCircuit(input: {
	space_id: number;
	device_id: number;
	coil_address: number;
	name: string;
	pos_x?: number | null;
	pos_y?: number | null;
}): Circuit {
	const ts = nowIso();
	const info = db
		.prepare(
			`INSERT INTO circuits (space_id, device_id, coil_address, name, pos_x, pos_y, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			input.space_id,
			input.device_id,
			input.coil_address,
			input.name,
			input.pos_x ?? null,
			input.pos_y ?? null,
			ts,
			ts
		);
	return getCircuit(info.lastInsertRowid as number)!;
}

export function updateCircuit(
	id: number,
	patch: Partial<{
		space_id: number;
		device_id: number;
		coil_address: number;
		name: string;
		pos_x: number | null;
		pos_y: number | null;
	}>
): Circuit | undefined {
	const existing = getCircuit(id);
	if (!existing) return undefined;
	const merged = { ...existing, ...patch, updated_at: nowIso() };
	db.prepare(
		`UPDATE circuits SET space_id=?, device_id=?, coil_address=?, name=?, pos_x=?, pos_y=?, updated_at=? WHERE id=?`
	).run(
		merged.space_id,
		merged.device_id,
		merged.coil_address,
		merged.name,
		merged.pos_x,
		merged.pos_y,
		merged.updated_at,
		id
	);
	return getCircuit(id);
}

export function updateCircuitPosition(id: number, pos_x: number, pos_y: number): Circuit | undefined {
	const existing = getCircuit(id);
	if (!existing) return undefined;
	db.prepare('UPDATE circuits SET pos_x=?, pos_y=?, updated_at=? WHERE id=?').run(
		pos_x,
		pos_y,
		nowIso(),
		id
	);
	return getCircuit(id);
}

export function deleteCircuit(id: number): boolean {
	const info = db.prepare('DELETE FROM circuits WHERE id = ?').run(id);
	return info.changes > 0;
}
