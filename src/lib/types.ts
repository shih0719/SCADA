// Shared shapes for client-side code. Mirrors src/lib/server/types.ts but
// lives outside lib/server so it is safe to import from .svelte files.

export interface Space {
	id: number;
	name: string;
	floorplan_image_path: string | null;
	floorplan_width: number | null;
	floorplan_height: number | null;
	created_at: string;
	updated_at: string;
}

export interface Device {
	id: number;
	name: string;
	ip_address: string;
	port: number;
	slave_id: number;
	poll_interval_ms: number;
	timeout_ms: number;
	is_enabled: number;
	created_at: string;
	updated_at: string;
}

export interface Circuit {
	id: number;
	space_id: number;
	device_id: number;
	coil_address: number;
	name: string;
	pos_x: number | null;
	pos_y: number | null;
	created_at: string;
	updated_at: string;
}

export type CircuitStatus = 'ok' | 'stale' | 'error';

export interface CircuitRuntimeState {
	circuit_id: number;
	value: boolean | null;
	status: CircuitStatus;
	last_updated_at: string | null;
}

export interface DeviceHealthEntry {
	device_id: number;
	name: string;
	is_enabled: boolean;
	connected: boolean;
	last_success_at: string | null;
	consecutive_failures: number;
}

export interface HealthzResponse {
	status: 'ok' | 'degraded';
	server_started_at: string;
	uptime_ms: number;
	devices: DeviceHealthEntry[];
}

export interface DeviceMetricsEntry {
	device_id: number;
	name: string;
	success_rate: number | null;
	avg_latency_ms: number | null;
	last_poll_at: string | null;
	recent: { ok: boolean; latencyMs: number; at: string }[];
}

// ---- CSV bulk import (Circuit + auto-create Space/Device) ----

export interface ImportRowResult {
	line: number; // 1-based CSV line number (header is line 1)
	space_name: string;
	device_name: string;
	coil_address: number | null;
	name: string;
	status: 'ok' | 'error';
	// "create": row will/did create a new Circuit.
	// "update": row has a circuit_id that matched an existing Circuit and
	//   will/did update it in place (pos_x/pos_y preserved).
	// Only meaningful when status === 'ok'.
	action?: 'create' | 'update';
	error?: string;
	warning?: string;
	space_id?: number; // only populated for a real (non-dry-run) import
	device_id?: number; // only populated for a real (non-dry-run) import
	circuit_id?: number; // populated for update rows always; for create rows only on a real (non-dry-run) import
}

export interface ImportNewSpace {
	name: string;
	id?: number; // only populated for a real (non-dry-run) import
}

export interface ImportNewDevice {
	name: string;
	ip_address: string;
	port: number;
	slave_id: number;
	id?: number; // only populated for a real (non-dry-run) import
}

export interface ImportResult {
	dryRun: boolean;
	totalRows: number;
	successCount: number;
	errorCount: number;
	newSpaces: ImportNewSpace[];
	newDevices: ImportNewDevice[];
	rows: ImportRowResult[];
}
