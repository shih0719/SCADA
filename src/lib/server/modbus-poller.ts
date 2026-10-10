import ModbusRTU from 'modbus-serial';
import { listDevices, listAllCircuits, getDevice, getCircuit } from './repo';
import { setCircuitOk, setCircuitError } from './runtime-state';
import { logger } from './logger';
import type { Device } from './types';

const MODULE = 'modbus-poller';
const MAX_BACKOFF_MS = 30000;
const METRICS_HISTORY_LEN = 20;

/** Minimum time a stale threshold should allow: 3 poll cycles or 5s, whichever is larger. */
export function staleThresholdFor(device: Device | undefined): number {
	const interval = device?.poll_interval_ms ?? 1500;
	return Math.max(interval * 3, 5000);
}

interface PollResult {
	ok: boolean;
	latencyMs: number;
	at: string;
}

interface DeviceRuntime {
	client: ModbusRTU;
	connected: boolean;
	connecting: boolean;
	timer: ReturnType<typeof setInterval> | null;
	lastSuccessAt: string | null;
	consecutiveFailures: number;
	nextRetryAt: number;
	backoffMs: number;
	recentPolls: PollResult[];
}

const deviceRuntimes = new Map<number, DeviceRuntime>();

function newRuntime(pollIntervalMs: number): DeviceRuntime {
	return {
		client: new ModbusRTU(),
		connected: false,
		connecting: false,
		timer: null,
		lastSuccessAt: null,
		consecutiveFailures: 0,
		nextRetryAt: 0,
		backoffMs: pollIntervalMs,
		recentPolls: []
	};
}

function recordPoll(rt: DeviceRuntime, ok: boolean, latencyMs: number) {
	rt.recentPolls.push({ ok, latencyMs, at: new Date().toISOString() });
	if (rt.recentPolls.length > METRICS_HISTORY_LEN) rt.recentPolls.shift();
}

async function ensureConnected(deviceId: number, device: Device): Promise<ModbusRTU | null> {
	let rt = deviceRuntimes.get(deviceId);
	if (!rt) {
		rt = newRuntime(device.poll_interval_ms || 1500);
		rt.client.on('error', () => {
			rt!.connected = false;
		});
		rt.client.on('close', () => {
			rt!.connected = false;
		});
		deviceRuntimes.set(deviceId, rt);
	}
	if (rt.connected && rt.client.isOpen) return rt.client;
	if (rt.connecting) return null;
	if (Date.now() < rt.nextRetryAt) return null; // backing off, skip this attempt
	rt.connecting = true;
	try {
		rt.client.setID(device.slave_id);
		rt.client.setTimeout(device.timeout_ms);
		await rt.client.connectTCP(device.ip_address, { port: device.port });
		rt.connected = true;
		rt.backoffMs = device.poll_interval_ms || 1500;
		rt.nextRetryAt = 0;
		return rt.client;
	} catch (err) {
		rt.connected = false;
		rt.backoffMs = Math.min(rt.backoffMs * 2, MAX_BACKOFF_MS);
		rt.nextRetryAt = Date.now() + rt.backoffMs;
		logger.warn('modbus connect failed', {
			module: MODULE,
			device_id: deviceId,
			ip_address: device.ip_address,
			port: device.port,
			next_retry_in_ms: rt.backoffMs,
			error: err instanceof Error ? err.message : String(err)
		});
		return null;
	} finally {
		rt.connecting = false;
	}
}

async function pollDeviceOnce(deviceId: number) {
	const device = getDevice(deviceId);
	if (!device) return;

	const circuits = listAllCircuits().filter((c) => c.device_id === deviceId);
	if (circuits.length === 0) return;

	if (!device.is_enabled) {
		for (const c of circuits) setCircuitError(c.id);
		return;
	}

	const client = await ensureConnected(deviceId, device);
	if (!client) {
		for (const c of circuits) setCircuitError(c.id);
		const rt = deviceRuntimes.get(deviceId);
		if (rt) {
			rt.consecutiveFailures++;
			recordPoll(rt, false, 0);
		}
		return;
	}

	const addresses = circuits.map((c) => c.coil_address);
	const min = Math.min(...addresses);
	const max = Math.max(...addresses);
	const length = max - min + 1;

	const startedAt = Date.now();
	try {
		client.setTimeout(device.timeout_ms);
		const result = await client.readCoils(min, length);
		const latencyMs = Date.now() - startedAt;
		for (const c of circuits) {
			const bit = result.data[c.coil_address - min];
			setCircuitOk(c.id, Boolean(bit));
		}
		const r = deviceRuntimes.get(deviceId);
		if (r) {
			r.lastSuccessAt = new Date().toISOString();
			r.consecutiveFailures = 0;
			r.backoffMs = device.poll_interval_ms || 1500;
			r.nextRetryAt = 0;
			recordPoll(r, true, latencyMs);
		}
	} catch (err) {
		const latencyMs = Date.now() - startedAt;
		const r = deviceRuntimes.get(deviceId);
		if (r) {
			r.connected = false;
			r.consecutiveFailures++;
			r.backoffMs = Math.min(r.backoffMs * 2, MAX_BACKOFF_MS);
			r.nextRetryAt = Date.now() + r.backoffMs;
			recordPoll(r, false, latencyMs);
			try {
				r.client.close(() => {});
			} catch (closeErr) {
				logger.warn('modbus client close failed', {
					module: MODULE,
					device_id: deviceId,
					ip_address: device.ip_address,
					error: closeErr instanceof Error ? closeErr.message : String(closeErr)
				});
			}
		}
		logger.error('modbus read coils failed', {
			module: MODULE,
			device_id: deviceId,
			ip_address: device.ip_address,
			port: device.port,
			error: err instanceof Error ? err.message : String(err)
		});
		for (const c of circuits) setCircuitError(c.id);
	}
}

function scheduleDevice(device: Device) {
	let rt = deviceRuntimes.get(device.id);
	if (rt?.timer) {
		clearInterval(rt.timer);
		rt.timer = null;
	}
	if (!rt) {
		rt = newRuntime(device.poll_interval_ms || 1500);
		deviceRuntimes.set(device.id, rt);
	}
	const interval = device.poll_interval_ms || 1500;
	// fire immediately, then on interval
	void pollDeviceOnce(device.id);
	rt.timer = setInterval(() => void pollDeviceOnce(device.id), interval);
}

/**
 * (Re)builds the set of per-device polling loops based on the current device
 * list in the database. Safe to call repeatedly (e.g. after device CRUD) —
 * it reschedules intervals so new settings take effect without a restart.
 */
export function reloadPollers() {
	const devices = listDevices();
	const currentIds = new Set(devices.map((d) => d.id));

	// stop/remove runtimes for devices that no longer exist
	for (const [id, rt] of deviceRuntimes) {
		if (!currentIds.has(id)) {
			if (rt.timer) clearInterval(rt.timer);
			try {
				rt.client.close(() => {});
			} catch (err) {
				logger.warn('modbus client close failed during cleanup', {
					module: MODULE,
					device_id: id,
					error: err instanceof Error ? err.message : String(err)
				});
			}
			deviceRuntimes.delete(id);
		}
	}

	for (const device of devices) {
		scheduleDevice(device);
	}
}

let started = false;

/** Starts the background Modbus polling service. Idempotent. */
export function startPolling() {
	if (started) return;
	started = true;
	logger.info('server starting', { module: MODULE });
	reloadPollers();
}

/**
 * Sends FC5 writeCoil for a circuit's current device/address, flipping to
 * `nextValue`. Pure Modbus I/O — does not touch runtime state; the caller
 * (the toggle API route) owns optimistic update / rollback.
 */
export async function writeCoilForCircuit(circuitId: number, nextValue: boolean): Promise<void> {
	const circuit = getCircuit(circuitId);
	if (!circuit) throw new Error('circuit not found');
	const device = getDevice(circuit.device_id);
	if (!device) throw new Error('device not found');
	if (!device.is_enabled) throw new Error('device disabled');

	const client = await ensureConnected(device.id, device);
	if (!client) throw new Error('device unreachable');

	try {
		client.setTimeout(device.timeout_ms);
		await client.writeCoil(circuit.coil_address, nextValue);
	} catch (err) {
		logger.error('modbus write coil failed', {
			module: MODULE,
			device_id: device.id,
			ip_address: device.ip_address,
			coil_address: circuit.coil_address,
			error: err instanceof Error ? err.message : String(err)
		});
		throw err;
	}
}

// ---- Health / metrics snapshots (B-8 / C-12) ----

export interface DeviceHealthEntry {
	device_id: number;
	name: string;
	is_enabled: boolean;
	connected: boolean;
	last_success_at: string | null;
	consecutive_failures: number;
}

export function getDeviceHealthSnapshot(): DeviceHealthEntry[] {
	return listDevices().map((device) => {
		const rt = deviceRuntimes.get(device.id);
		return {
			device_id: device.id,
			name: device.name,
			is_enabled: Boolean(device.is_enabled),
			connected: rt?.connected ?? false,
			last_success_at: rt?.lastSuccessAt ?? null,
			consecutive_failures: rt?.consecutiveFailures ?? 0
		};
	});
}

export interface DeviceMetricsEntry {
	device_id: number;
	name: string;
	success_rate: number | null;
	avg_latency_ms: number | null;
	last_poll_at: string | null;
	recent: PollResult[];
}

export function getDeviceMetrics(): DeviceMetricsEntry[] {
	return listDevices().map((device) => {
		const rt = deviceRuntimes.get(device.id);
		const recent = rt?.recentPolls ?? [];
		const successCount = recent.filter((p) => p.ok).length;
		const okLatencies = recent.filter((p) => p.ok).map((p) => p.latencyMs);
		return {
			device_id: device.id,
			name: device.name,
			success_rate: recent.length > 0 ? successCount / recent.length : null,
			avg_latency_ms:
				okLatencies.length > 0
					? okLatencies.reduce((a, b) => a + b, 0) / okLatencies.length
					: null,
			last_poll_at: recent.length > 0 ? recent[recent.length - 1].at : null,
			recent
		};
	});
}
