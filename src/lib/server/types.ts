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
	is_enabled: number; // sqlite stores boolean as 0/1
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
