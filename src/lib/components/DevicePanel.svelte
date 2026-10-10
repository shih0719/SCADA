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
	.panel { margin-bottom: 1rem; }
	.toggle-open { background: none; border: none; font-weight: bold; cursor: pointer; padding: 4px 0; }
	.list { list-style: none; padding: 0; margin: 0 0 0.5rem; font-size: 13px; }
	.list li { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
	.name { font-weight: 600; min-width: 80px; }
	.meta { color: #555; flex: 1; }
	.enabled { font-size: 12px; display: flex; align-items: center; gap: 2px; }
	.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 4px; }
	.grid button { grid-column: span 2; }
	.danger { color: #e03131; border-color: #e03131; }
	.small { padding: 2px 6px; }
	.error { color: #e03131; font-size: 13px; }
</style>
