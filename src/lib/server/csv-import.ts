// CSV bulk import for Circuits (with auto-create of missing Space/Device).
//
// Supports a two-phase workflow:
//   - dryRun = true  -> parse + validate + simulate, no DB writes at all.
//   - dryRun = false -> same logic, but wrapped in a single SQLite transaction
//                       that actually creates the Spaces/Devices/Circuits.
//                       Rows with validation errors are skipped (not inserted)
//                       without aborting the whole transaction; only a genuine
//                       DB write failure would roll the transaction back.
//
// CSV format: header row + data rows, comma separated, with basic support for
// double-quote-wrapped fields (so a cell may contain a literal comma) and ""
// as an escaped quote inside a quoted field. Column order is irrelevant —
// columns are matched by header name.

import { db } from './db';
import {
	listSpaces,
	listDevices,
	createSpace,
	createDevice,
	createCircuit,
	getCircuit,
	updateCircuit,
	listCircuitsBySpace,
	getSpace,
	getDevice
} from './repo';
import { requireIp, requirePort, requireNonNegativeInt } from './validation';
import { reloadPollers } from './modbus-poller';
import type { ImportResult, ImportRowResult, ImportNewSpace, ImportNewDevice } from '#lib/types.ts';

export class CsvFormatError extends Error {}

const REQUIRED_HEADERS = [
	'space_name',
	'device_name',
	'device_ip',
	'device_port',
	'device_slave_id',
	'coil_address',
	'name'
] as const;

/**
 * Minimal CSV parser: splits on commas, honors double-quoted fields (which
 * may contain commas and newlines), and "" as an escaped literal quote.
 * Handles \n and \r\n line endings. Returns the header row and the data rows
 * (both as arrays of trimmed-where-appropriate raw strings; trimming of
 * individual field values happens by the caller).
 */
export function parseCsv(text: string): { header: string[]; records: string[][] } {
	const rows: string[][] = [];
	let field = '';
	let row: string[] = [];
	let inQuotes = false;
	let i = 0;
	let rowHasContent = false;

	const pushField = () => {
		row.push(field);
		field = '';
	};
	const pushRow = () => {
		pushField();
		rows.push(row);
		row = [];
		rowHasContent = false;
	};

	while (i < text.length) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += c;
			i++;
			continue;
		}
		if (c === '"') {
			inQuotes = true;
			rowHasContent = true;
			i++;
			continue;
		}
		if (c === ',') {
			rowHasContent = true;
			pushField();
			i++;
			continue;
		}
		if (c === '\r') {
			i++;
			continue;
		}
		if (c === '\n') {
			if (rowHasContent || field.length > 0) pushRow();
			i++;
			continue;
		}
		field += c;
		rowHasContent = true;
		i++;
	}
	if (rowHasContent || field.length > 0) pushRow();

	if (rows.length === 0) {
		throw new CsvFormatError('CSV is empty');
	}

	const header = rows[0].map((h) => h.trim());
	const records = rows.slice(1);
	return { header, records };
}

function validateHeader(header: string[]) {
	for (const required of REQUIRED_HEADERS) {
		if (!header.includes(required)) {
			throw new CsvFormatError(`CSV missing required header column: ${required}`);
		}
	}
}

export function runCsvImport(csvText: string, dryRun: boolean): ImportResult {
	const { header, records } = parseCsv(csvText);
	validateHeader(header);

	const colIndex: Record<string, number> = {};
	header.forEach((h, i) => {
		colIndex[h] = i;
	});

	// circuit_id is an optional column. When present (e.g. a file re-exported
	// via GET /api/circuits/export), a non-empty value on a row switches that
	// row from "create a new Circuit" to "update the existing Circuit in
	// place" (preserving its pos_x/pos_y). Its absence, or an empty value on a
	// given row, keeps the legacy create-only behavior.
	const hasCircuitIdColumn = colIndex['circuit_id'] !== undefined;

	const getField = (rec: string[], field: string): string => {
		const i = colIndex[field];
		if (i === undefined) return '';
		return (rec[i] ?? '').trim();
	};

	// Seed name->id maps with existing Spaces/Devices, then let newly created
	// ones (within this same import run) be added to the same maps so repeated
	// names across rows reuse the same id instead of creating duplicates.
	const spaceNameToId = new Map<string, number>();
	for (const s of listSpaces()) spaceNameToId.set(s.name, s.id);
	const deviceNameToId = new Map<string, number>();
	for (const d of listDevices()) deviceNameToId.set(d.name, d.id);

	const newSpaces: ImportNewSpace[] = [];
	const newDevices: ImportNewDevice[] = [];

	// For dry-run we never touch the DB, so newly "created" Space/Device rows
	// need placeholder ids to keep later rows consistent; real ids are only
	// assigned once the row is actually inserted (non-dry-run).
	let tempSpaceId = -1;
	let tempDeviceId = -1;

	const rows: ImportRowResult[] = [];

	const process = () => {
		for (let r = 0; r < records.length; r++) {
			const rec = records[r];
			const line = r + 2; // header occupies line 1

			const space_name = getField(rec, 'space_name');
			const device_name = getField(rec, 'device_name');
			const device_ip = getField(rec, 'device_ip');
			const device_port_raw = getField(rec, 'device_port');
			const device_slave_raw = getField(rec, 'device_slave_id');
			const coil_raw = getField(rec, 'coil_address');
			const name = getField(rec, 'name');

			const circuit_id_raw = hasCircuitIdColumn ? getField(rec, 'circuit_id') : '';

			const result: ImportRowResult = {
				line,
				space_name,
				device_name,
				coil_address: null,
				name,
				status: 'ok'
			};

			try {
				// ---- resolve update-vs-create mode from circuit_id ----
				let existingCircuitId: number | null = null;
				if (circuit_id_raw) {
					const parsed = requireNonNegativeInt(circuit_id_raw, 'circuit_id');
					if (!getCircuit(parsed)) {
						throw new Error(`circuit_id ${parsed} not found`);
					}
					existingCircuitId = parsed;
				}

				if (!space_name) throw new Error('space_name is required');
				if (!device_name) throw new Error('device_name is required');
				if (!name) throw new Error('name is required');
				if (!coil_raw) throw new Error('coil_address is required');
				const coil_address = requireNonNegativeInt(coil_raw, 'coil_address');
				result.coil_address = coil_address;

				// ---- resolve Space ----
				let spaceId: number;
				if (spaceNameToId.has(space_name)) {
					spaceId = spaceNameToId.get(space_name)!;
				} else {
					if (dryRun) {
						spaceId = tempSpaceId--;
					} else {
						spaceId = createSpace(space_name).id;
					}
					spaceNameToId.set(space_name, spaceId);
					newSpaces.push({ name: space_name, id: dryRun ? undefined : spaceId });
				}

				// ---- resolve Device ----
				let deviceId: number;
				if (deviceNameToId.has(device_name)) {
					// Existing device: ip/port/slave_id columns (if present) are
					// intentionally ignored so we never clobber a live connection
					// setting via a bulk import.
					deviceId = deviceNameToId.get(device_name)!;
				} else {
					if (!device_ip || !device_port_raw || !device_slave_raw) {
						throw new Error(
							'device_ip, device_port and device_slave_id are required when creating a new device'
						);
					}
					const ip_address = requireIp(device_ip);
					const port = requirePort(device_port_raw);
					const slave_id = requireNonNegativeInt(device_slave_raw, 'device_slave_id');
					if (dryRun) {
						deviceId = tempDeviceId--;
					} else {
						deviceId = createDevice({
							name: device_name,
							ip_address,
							port,
							slave_id,
							is_enabled: true
						}).id;
					}
					deviceNameToId.set(device_name, deviceId);
					newDevices.push({
						name: device_name,
						ip_address,
						port,
						slave_id,
						id: dryRun ? undefined : deviceId
					});
				}

				result.space_id = spaceId;
				result.device_id = deviceId;

				if (existingCircuitId !== null) {
					result.action = 'update';
					result.circuit_id = existingCircuitId;
					if (!dryRun) {
						// pos_x/pos_y intentionally omitted from the patch so the
						// Circuit's existing floorplan placement is preserved.
						updateCircuit(existingCircuitId, {
							space_id: spaceId,
							device_id: deviceId,
							coil_address,
							name
						});
					}
				} else {
					result.action = 'create';
					if (!dryRun) {
						const circuit = createCircuit({
							space_id: spaceId,
							device_id: deviceId,
							coil_address,
							name,
							pos_x: null,
							pos_y: null
						});
						result.circuit_id = circuit.id;
					}
				}
			} catch (e) {
				result.status = 'error';
				result.error = e instanceof Error ? e.message : 'unknown error';
			}

			rows.push(result);
		}
	};

	if (dryRun) {
		process();
	} else {
		const tx = db.transaction(process);
		tx();
		reloadPollers();
	}

	// Duplicate coil_address within the same device: warn (don't block), on
	// every row in the duplicate group, not just the 2nd+ occurrence.
	const dupCounts = new Map<string, number>();
	for (const r of rows) {
		if (r.status === 'ok' && r.device_id !== undefined && r.coil_address !== null) {
			const key = `${r.device_id}:${r.coil_address}`;
			dupCounts.set(key, (dupCounts.get(key) ?? 0) + 1);
		}
	}
	for (const r of rows) {
		if (r.status === 'ok' && r.device_id !== undefined && r.coil_address !== null) {
			const key = `${r.device_id}:${r.coil_address}`;
			const count = dupCounts.get(key) ?? 0;
			if (count > 1) {
				r.warning = `duplicate coil_address ${r.coil_address} on this device (appears in ${count} rows of this import)`;
			}
		}
	}

	const successCount = rows.filter((r) => r.status === 'ok').length;
	const errorCount = rows.length - successCount;

	return {
		dryRun,
		totalRows: rows.length,
		successCount,
		errorCount,
		newSpaces,
		newDevices,
		rows
	};
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * Encodes a single CSV field value, quoting it (and escaping embedded quotes
 * as "") whenever it contains a comma, double quote, or newline — the
 * inverse of the quoting convention parseCsv() understands above.
 */
export function encodeCsvField(value: string | number): string {
	const s = String(value);
	if (/[",\n\r]/.test(s)) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

const EXPORT_HEADERS = [
	'circuit_id',
	'space_name',
	'device_name',
	'device_ip',
	'device_port',
	'device_slave_id',
	'coil_address',
	'name'
] as const;

/**
 * Builds the exportable CSV text (header + one row per Circuit) for every
 * Circuit belonging to the given Space. Re-importing this text unmodified
 * should resolve every row as an "update" of the same Circuit (since
 * circuit_id round-trips), per the circuit_id upsert behavior above.
 *
 * device_ip/device_port/device_slave_id are Device-level attributes, not
 * Circuit-level ones, so they would otherwise be repeated identically on
 * every row that shares the same device_name. To make it visually obvious
 * that only one row's values actually matter (the import logic ignores
 * these columns entirely for a device_name it has already resolved — see
 * runCsvImport above), only the first row for a given device_name within
 * this export carries them; subsequent rows for the same device leave them
 * blank. Re-importing still works unmodified: a blank device_ip/port/slave
 * is only ever required when a device_name is being resolved for the very
 * first time, and by then the earlier row has already established it.
 */
export function buildCircuitsExportCsv(spaceId: number): string {
	const space = getSpace(spaceId);
	const spaceName = space?.name ?? '';
	const circuits = listCircuitsBySpace(spaceId);

	const lines = [EXPORT_HEADERS.join(',')];
	const deviceInfoEmitted = new Set<number>();
	for (const c of circuits) {
		const device = getDevice(c.device_id);
		const showDeviceInfo = device !== undefined && !deviceInfoEmitted.has(device.id);
		if (device !== undefined) deviceInfoEmitted.add(device.id);
		const fields = [
			encodeCsvField(c.id),
			encodeCsvField(spaceName),
			encodeCsvField(device?.name ?? ''),
			encodeCsvField(showDeviceInfo ? device?.ip_address ?? '' : ''),
			encodeCsvField(showDeviceInfo ? device?.port ?? '' : ''),
			encodeCsvField(showDeviceInfo ? device?.slave_id ?? '' : ''),
			encodeCsvField(c.coil_address),
			encodeCsvField(c.name)
		];
		lines.push(fields.join(','));
	}
	return lines.join('\r\n') + '\r\n';
}
