export class ValidationError extends Error {}

const IPV4_RE =
	/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function requireString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new ValidationError(`${field} is required and must be a non-empty string`);
	}
	return value.trim();
}

export function optionalString(value: unknown, field: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
	return value;
}

const DOTTED_NUMERIC_RE = /^\d+(\.\d+){3}$/;

export function requireIp(value: unknown): string {
	const s = requireString(value, 'ip_address');
	// A dotted-numeric-looking string must be validated strictly as IPv4 — it
	// must not be allowed to slip through as a "hostname" just because every
	// label happens to be digits (e.g. "999.1.1.1" is not a valid hostname).
	if (DOTTED_NUMERIC_RE.test(s)) {
		if (!IPV4_RE.test(s)) {
			throw new ValidationError('ip_address is not a valid IPv4 address');
		}
		return s;
	}
	if (!HOSTNAME_RE.test(s)) {
		throw new ValidationError('ip_address must be a valid IPv4 address or hostname');
	}
	return s;
}

export function requirePort(value: unknown): number {
	const n = Number(value);
	if (!Number.isInteger(n) || n < 1 || n > 65535) {
		throw new ValidationError('port must be an integer between 1 and 65535');
	}
	return n;
}

export function requireNonNegativeInt(value: unknown, field: string): number {
	const n = Number(value);
	if (!Number.isInteger(n) || n < 0) {
		throw new ValidationError(`${field} must be a non-negative integer`);
	}
	return n;
}

export function requirePositiveInt(value: unknown, field: string): number {
	const n = Number(value);
	if (!Number.isInteger(n) || n <= 0) {
		throw new ValidationError(`${field} must be a positive integer`);
	}
	return n;
}

export function optionalPositiveInt(value: unknown, field: string): number | undefined {
	if (value === undefined || value === null) return undefined;
	return requirePositiveInt(value, field);
}

export function parseIdParam(raw: string | undefined): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n <= 0) {
		throw new ValidationError('invalid id in path');
	}
	return n;
}
