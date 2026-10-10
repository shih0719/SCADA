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
	.panel { margin-bottom: 1rem; }
	.space-list { list-style: none; padding: 0; margin: 0 0 0.5rem; }
	.space-list li { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
	.space-list li.selected .space-btn { font-weight: bold; background: #e7f5ff; }
	.space-btn { flex: 1; text-align: left; padding: 4px 8px; border: 1px solid #ddd; background: white; cursor: pointer; }
	.row { display: flex; gap: 4px; margin-top: 4px; }
	.row input { flex: 1; }
	.danger { color: #e03131; border-color: #e03131; }
	.small { padding: 2px 6px; }
	.error { color: #e03131; font-size: 13px; }
</style>
