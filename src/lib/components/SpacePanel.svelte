<script lang="ts">
	import type { Space } from '#lib/types.ts';
	import { api } from '#lib/client/api.ts';

	let {
		spaces,
		selectedId,
		onSelect,
		onChanged
	}: {
		spaces: Space[];
		selectedId: number | null;
		onSelect: (id: number) => void;
		onChanged: () => void;
	} = $props();

	let newName = $state('');
	let error = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	async function createSpace() {
		error = '';
		if (!newName.trim()) return;
		try {
			const space = await api.createSpace(newName.trim());
			newName = '';
			await onChanged();
			onSelect(space.id);
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to create space';
		}
	}

	async function uploadFloorplan() {
		error = '';
		if (!selectedId || !fileInput?.files?.[0]) return;
		try {
			await api.uploadFloorplan(selectedId, fileInput.files[0]);
			fileInput.value = '';
			await onChanged();
		} catch (e) {
			error = e instanceof Error ? e.message : 'upload failed';
		}
	}

	async function deleteSpace(id: number, cascade = false) {
		error = '';
		try {
			await api.deleteSpace(id, cascade);
			await onChanged();
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'delete failed';
			if (msg.includes('associated circuits')) {
				if (confirm(`${msg}\n\nDelete this Space AND all its circuits?`)) {
					await deleteSpace(id, true);
					return;
				}
			} else {
				error = msg;
			}
		}
	}
</script>

<section class="panel">
	<h2>Spaces</h2>
	<ul class="space-list">
		{#each spaces as space (space.id)}
			<li class:selected={space.id === selectedId}>
				<button type="button" class="space-btn" onclick={() => onSelect(space.id)}>
					{space.name}
				</button>
				<button type="button" class="danger small" onclick={() => deleteSpace(space.id)}>✕</button>
			</li>
		{/each}
	</ul>

	<form class="row" onsubmit={(e) => { e.preventDefault(); createSpace(); }}>
		<input placeholder="New space name" bind:value={newName} />
		<button type="submit">Add Space</button>
	</form>

	{#if selectedId}
		<div class="row">
			<input type="file" accept="image/png,image/jpeg" bind:this={fileInput} />
			<button type="button" onclick={uploadFloorplan}>Upload Floorplan</button>
		</div>
	{/if}

	{#if error}<p class="error">{error}</p>{/if}
</section>

<style>
	.panel { margin-bottom: 0; }
	.panel h2 { color: var(--color-text); font-size: 1rem; margin-top: 0; }
	.space-list { list-style: none; padding: 0; margin: 0 0 var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
	.space-list li { display: flex; align-items: center; gap: var(--space-2); }
	.space-list li.selected .space-btn { font-weight: 600; background: var(--color-accent-muted); border-color: var(--color-accent); color: var(--color-accent-hover); }
	.space-btn {
		flex: 1;
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-elevated);
		color: var(--color-text);
		cursor: pointer;
	}
	.space-btn:hover { border-color: var(--color-border-strong); }
	.row { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
	.row input { flex: 1; }
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
