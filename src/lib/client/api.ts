import type {
	Space,
	Device,
	Circuit,
	CircuitRuntimeState,
	HealthzResponse,
	DeviceMetricsEntry,
	ImportResult,
	SceneSummary,
	SceneWithActions,
	SceneApplyResult,
	SpaceBulkSetResult,
	ScheduleWithSceneName
} from '#lib/types.ts';

async function handle<T>(res: Response): Promise<T> {
	if (!res.ok) {
		let message = `request failed (${res.status})`;
		try {
			const body = await res.json();
			if (body?.error) message = body.error;
		} catch {
			// ignore
		}
		throw new Error(message);
	}
	return res.json() as Promise<T>;
}

// ---- Spaces ----
export const api = {
	listSpaces: () => fetch('/api/spaces').then((r) => handle<Space[]>(r)),
	createSpace: (name: string) =>
		fetch('/api/spaces', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name })
		}).then((r) => handle<Space>(r)),
	updateSpace: (id: number, patch: Partial<{ name: string }>) =>
		fetch(`/api/spaces/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(patch)
		}).then((r) => handle<Space>(r)),
	deleteSpace: (id: number, cascade = false) =>
		fetch(`/api/spaces/${id}${cascade ? '?cascade=true' : ''}`, { method: 'DELETE' }).then((r) =>
			handle<{ ok: boolean }>(r)
		),
	uploadFloorplan: (id: number, file: File) => {
		const form = new FormData();
		form.append('file', file);
		return fetch(`/api/spaces/${id}/floorplan`, { method: 'POST', body: form }).then((r) =>
			handle<Space>(r)
		);
	},
	spaceStatus: (id: number) => fetch(`/api/spaces/${id}/status`).then((r) => handle<CircuitRuntimeState[]>(r)),
	bulkSetSpace: (id: number, value: boolean) =>
		fetch(`/api/spaces/${id}/bulk-set`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ value })
		}).then((r) => handle<SpaceBulkSetResult>(r)),

	// ---- Devices ----
	listDevices: () => fetch('/api/devices').then((r) => handle<Device[]>(r)),
	createDevice: (input: {
		name: string;
		ip_address: string;
		port: number;
		slave_id: number;
		poll_interval_ms?: number;
		timeout_ms?: number;
		is_enabled?: boolean;
	}) =>
		fetch('/api/devices', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(input)
		}).then((r) => handle<Device>(r)),
	updateDevice: (id: number, patch: Record<string, unknown>) =>
		fetch(`/api/devices/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(patch)
		}).then((r) => handle<Device>(r)),
	deleteDevice: (id: number, cascade = false) =>
		fetch(`/api/devices/${id}${cascade ? '?cascade=true' : ''}`, { method: 'DELETE' }).then((r) =>
			handle<{ ok: boolean }>(r)
		),

	// ---- Circuits ----
	listCircuits: (spaceId: number) =>
		fetch(`/api/circuits?space_id=${spaceId}`).then((r) => handle<Circuit[]>(r)),
	listAllCircuits: () => fetch('/api/circuits?all=true').then((r) => handle<Circuit[]>(r)),
	createCircuit: (input: { space_id: number; device_id: number; coil_address: number; name: string }) =>
		fetch('/api/circuits', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(input)
		}).then((r) => handle<Circuit>(r)),
	updateCircuit: (id: number, patch: Record<string, unknown>) =>
		fetch(`/api/circuits/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(patch)
		}).then((r) => handle<Circuit>(r)),
	deleteCircuit: (id: number) =>
		fetch(`/api/circuits/${id}`, { method: 'DELETE' }).then((r) => handle<{ ok: boolean }>(r)),
	updateCircuitPosition: (id: number, pos_x: number, pos_y: number) =>
		fetch(`/api/circuits/${id}/position`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ pos_x, pos_y })
		}).then((r) => handle<Circuit>(r)),
	toggleCircuit: (id: number) =>
		fetch(`/api/circuits/${id}/toggle`, { method: 'POST' }).then((r) =>
			handle<{ ok: boolean; value: boolean }>(r)
		),

	// ---- CSV bulk import (Circuit + auto-create Space/Device) ----
	importCsv: (csvText: string, dryRun: boolean) =>
		fetch(`/api/circuits/import?dryRun=${dryRun}`, {
			method: 'POST',
			headers: { 'content-type': 'text/plain' },
			body: csvText
		}).then((r) => handle<ImportResult>(r)),

	// ---- CSV export ----
	// Returns the download URL (GET + Content-Disposition: attachment, so
	// navigating to it triggers a browser download rather than a page nav).
	exportCircuitsCsvUrl: (spaceId: number) => `/api/circuits/export?space_id=${spaceId}`,

	// ---- Observability (B-8 / C-12) ----
	healthz: () => fetch('/api/healthz').then((r) => handle<HealthzResponse>(r)),
	metrics: () => fetch('/api/metrics').then((r) => handle<DeviceMetricsEntry[]>(r)),

	// ---- Scenes / group control ----
	listScenes: () => fetch('/api/scenes').then((r) => handle<SceneSummary[]>(r)),
	getScene: (id: number) => fetch(`/api/scenes/${id}`).then((r) => handle<SceneWithActions>(r)),
	createScene: (name: string, actions: { circuit_id: number; value: boolean }[]) =>
		fetch('/api/scenes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, actions })
		}).then((r) => handle<SceneWithActions>(r)),
	updateScene: (
		id: number,
		patch: { name?: string; actions?: { circuit_id: number; value: boolean }[] }
	) =>
		fetch(`/api/scenes/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(patch)
		}).then((r) => handle<SceneWithActions>(r)),
	deleteScene: (id: number) =>
		fetch(`/api/scenes/${id}`, { method: 'DELETE' }).then((r) => handle<{ ok: boolean }>(r)),
	applyScene: (id: number) =>
		fetch(`/api/scenes/${id}/apply`, { method: 'POST' }).then((r) => handle<SceneApplyResult>(r)),

	// ---- Backup / Restore ----
	// Download URL, same pattern as exportCircuitsCsvUrl (GET + Content-Disposition: attachment).
	backupExportUrl: () => '/api/backup/export',
	restoreBackup: (file: File) => {
		const form = new FormData();
		form.append('file', file);
		return fetch('/api/backup/restore', { method: 'POST', body: form }).then((r) =>
			handle<{ ok: true; action_required: string }>(r)
		);
	},

	// ---- Schedules ----
	listSchedules: () => fetch('/api/schedules').then((r) => handle<ScheduleWithSceneName[]>(r)),
	getSchedule: (id: number) => fetch(`/api/schedules/${id}`).then((r) => handle<ScheduleWithSceneName>(r)),
	createSchedule: (input: {
		name: string;
		scene_id: number;
		time_of_day: string;
		days_of_week: number[];
		is_enabled?: boolean;
	}) =>
		fetch('/api/schedules', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(input)
		}).then((r) => handle<ScheduleWithSceneName>(r)),
	updateSchedule: (id: number, patch: Record<string, unknown>) =>
		fetch(`/api/schedules/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(patch)
		}).then((r) => handle<ScheduleWithSceneName>(r)),
	deleteSchedule: (id: number) =>
		fetch(`/api/schedules/${id}`, { method: 'DELETE' }).then((r) => handle<{ ok: boolean }>(r))
};
