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
	.panel { margin-bottom: 0; }
	.panel h2 { color: var(--color-text); font-size: 1rem; margin-top: 0; }
	.export { margin-bottom: var(--space-2); font-size: 12px; padding: var(--space-1) var(--space-2); }
	.list { list-style: none; padding: 0; margin: 0 0 var(--space-2); font-size: 13px; }
	.list li { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); }
	.name { font-weight: 600; min-width: 80px; color: var(--color-text); }
	.meta { color: var(--color-text-secondary); font-family: var(--font-mono); flex: 1; }
	.unpositioned {
		background: var(--color-warning-bg);
		border: 1px solid var(--color-warning-border);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		margin-bottom: var(--space-3);
	}
	.unpositioned p { margin: 0 0 var(--space-1); font-size: 13px; font-weight: 600; color: var(--color-warning-text); }
	.grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-top: var(--space-2); }
	.grid button { grid-column: span 2; }
	input, select {
		background: var(--color-surface-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text);
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-ui);
	}
	input:focus, select:focus {
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
	button.active { background: var(--color-accent-hover); color: var(--color-bg); }
	.danger { background: transparent; color: var(--color-status-error); border-color: var(--color-status-error); }
	.danger:hover { background: var(--color-status-error-bg); }
	.small { padding: var(--space-1) var(--space-2); }
	.error { color: var(--color-status-error); font-size: 13px; }
</style>
