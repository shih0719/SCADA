<script lang="ts">
	import type { Device } from '#lib/types.ts';
	import { api } from '#lib/client/api.ts';

	let { devices, onChanged }: { devices: Device[]; onChanged: () => void } = $props();

	let name = $state('');
	let ip = $state('127.0.0.1');
	let port = $state(15020);
	let slaveId = $state(1);
	let pollMs = $state(1500);
	let timeoutMs = $state(1000);
	let error = $state('');
	let open = $state(false);

	async function createDevice() {
		error = '';
		try {
			await api.createDevice({
				name: name.trim(),
				ip_address: ip.trim(),
				port: Number(port),
				slave_id: Number(slaveId),
				poll_interval_ms: Number(pollMs),
				timeout_ms: Number(timeoutMs)
			});
			name = '';
			await onChanged();
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to create device';
		}
	}

	async function toggleEnabled(device: Device) {
		await api.updateDevice(device.id, { is_enabled: device.is_enabled ? false : true });
		await onChanged();
	}

	async function removeDevice(id: number, cascade = false) {
		error = '';
		try {
			await api.deleteDevice(id, cascade);
			await onChanged();
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'delete failed';
			if (msg.includes('associated circuits')) {
				if (confirm(`${msg}\n\nDelete this Device AND all its circuits?`)) {
					await removeDevice(id, true);
					return;
				}
			} else {
				error = msg;
			}
		}
	}
</script>

<section class="panel">
	<button type="button" class="toggle-open" onclick={() => (open = !open)}>
		{open ? '▾' : '▸'} Devices ({devices.length})
	</button>
	{#if open}
		<ul class="list">
			{#each devices as device (device.id)}
				<li>
					<span class="name">{device.name}</span>
					<span class="meta">{device.ip_address}:{device.port} #{device.slave_id}</span>
					<label class="enabled">
						<input
							type="checkbox"
							checked={!!device.is_enabled}
							onchange={() => toggleEnabled(device)}
						/> enabled
					</label>
					<button type="button" class="danger small" onclick={() => removeDevice(device.id)}>✕</button>
				</li>
			{/each}
		</ul>

		<form class="grid" onsubmit={(e) => { e.preventDefault(); createDevice(); }}>
			<input placeholder="Device name" bind:value={name} />
			<input placeholder="IP address" bind:value={ip} />
			<input placeholder="Port" type="number" bind:value={port} />
			<input placeholder="Slave ID" type="number" bind:value={slaveId} />
			<input placeholder="Poll ms" type="number" bind:value={pollMs} />
			<input placeholder="Timeout ms" type="number" bind:value={timeoutMs} />
			<button type="submit">Add Device</button>
		</form>
		{#if error}<p class="error">{error}</p>{/if}
	{/if}
</section>

<style>
	.panel { margin-bottom: 0; }
	.toggle-open {
		background: none;
		border: none;
		color: var(--color-text);
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		padding: 0;
	}
	.list { list-style: none; padding: 0; margin: var(--space-3) 0 var(--space-2); font-size: 13px; }
	.list li { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); }
	.name { font-weight: 600; min-width: 80px; color: var(--color-text); }
	.meta { color: var(--color-text-secondary); font-family: var(--font-mono); flex: 1; }
	.enabled { font-size: 12px; display: flex; align-items: center; gap: 2px; color: var(--color-text-secondary); }
	.grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-top: var(--space-2); }
	.grid button { grid-column: span 2; }
	input {
		background: var(--color-surface-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text);
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-ui);
	}
	input:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: -1px;
	}
	button {
		background: var(--color-accent);
		color: var(--color-bg);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-ui);
		cursor: pointer;
	}
	button:hover { background: var(--color-accent-hover); }
	.danger { background: transparent; color: var(--color-status-error); border-color: var(--color-status-error); }
	.danger:hover { background: var(--color-status-error-bg); }
	.small { padding: var(--space-1) var(--space-2); }
	.error { color: var(--color-status-error); font-size: 13px; }
</style>
