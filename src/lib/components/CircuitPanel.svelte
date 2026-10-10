<script lang="ts">
	import type { Circuit, Device } from '#lib/types.ts';
	import { api } from '#lib/client/api.ts';

	let {
		spaceId,
		circuits,
		devices,
		placingCircuitId,
		onChanged,
		onStartPlacing
	}: {
		spaceId: number;
		circuits: Circuit[];
		devices: Device[];
		placingCircuitId: number | null;
		onChanged: () => void;
		onStartPlacing: (id: number) => void;
	} = $props();

	let name = $state('');
	let deviceId = $state<number | ''>('');
	let coilAddress = $state(0);
	let error = $state('');

	const unpositioned = $derived(circuits.filter((c) => c.pos_x === null || c.pos_y === null));

	async function createCircuit() {
		error = '';
		if (!deviceId) {
			error = 'select a device';
			return;
		}
		try {
			await api.createCircuit({
				space_id: spaceId,
				device_id: Number(deviceId),
				coil_address: Number(coilAddress),
				name: name.trim()
			});
			name = '';
			coilAddress = 0;
			await onChanged();
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to create circuit';
		}
	}

	async function removeCircuit(id: number) {
		error = '';
		try {
			await api.deleteCircuit(id);
			await onChanged();
		} catch (e) {
			error = e instanceof Error ? e.message : 'delete failed';
		}
	}

	function exportCsv() {
		const url = api.exportCircuitsCsvUrl(spaceId);
		const a = document.createElement('a');
		a.href = url;
		a.download = '';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}
</script>

<section class="panel">
	<h2>Circuits</h2>
	<button type="button" class="export" onclick={exportCsv}>匯出 CSV</button>

	{#if unpositioned.length > 0}
		<div class="unpositioned">
			<p>Not yet placed on the floorplan:</p>
			<ul class="list">
				{#each unpositioned as c (c.id)}
					<li>
						<span>{c.name} (coil {c.coil_address})</span>
						<button
							type="button"
							class:active={placingCircuitId === c.id}
							onclick={() => onStartPlacing(c.id)}
						>
							{placingCircuitId === c.id ? 'Click map…' : 'Place on map'}
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<ul class="list">
		{#each circuits as c (c.id)}
			<li>
				<span class="name">{c.name}</span>
				<span class="meta">coil {c.coil_address}</span>
				<button type="button" class="danger small" onclick={() => removeCircuit(c.id)}>✕</button>
			</li>
		{/each}
	</ul>

	<form class="grid" onsubmit={(e) => { e.preventDefault(); createCircuit(); }}>
		<input placeholder="Circuit name" bind:value={name} />
		<select bind:value={deviceId}>
			<option value="">Device…</option>
			{#each devices as d (d.id)}
				<option value={d.id}>{d.name}</option>
			{/each}
		</select>
		<input placeholder="Coil address" type="number" min="0" bind:value={coilAddress} />
		<button type="submit">Add Circuit</button>
	</form>
	{#if error}<p class="error">{error}</p>{/if}
</section>

<style>
	.panel { margin-bottom: 1rem; }
	.export { margin-bottom: 6px; font-size: 12px; padding: 3px 8px; }
	.list { list-style: none; padding: 0; margin: 0 0 0.5rem; font-size: 13px; }
	.list li { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
	.name { font-weight: 600; min-width: 80px; }
	.meta { color: #555; flex: 1; }
	.unpositioned { background: #fff9db; padding: 6px; border-radius: 4px; margin-bottom: 8px; }
	.unpositioned p { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
	button.active { background: #1971c2; color: white; }
	.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 4px; }
	.grid button { grid-column: span 2; }
	.danger { color: #e03131; border-color: #e03131; }
	.small { padding: 2px 6px; }
	.error { color: #e03131; font-size: 13px; }
</style>
