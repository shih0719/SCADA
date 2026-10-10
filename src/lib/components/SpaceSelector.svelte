<script lang="ts">
	import type { Space } from '#lib/types.ts';

	// Read-only space picker for the Operation View. No create/delete/upload
	// actions here — those live only in the Layout Editor (/edit).
	let {
		spaces,
		selectedId,
		onSelect
	}: {
		spaces: Space[];
		selectedId: number | null;
		onSelect: (id: number) => void;
	} = $props();
</script>

<section class="panel">
	<h2>Spaces</h2>
	<ul class="space-list">
		{#each spaces as space (space.id)}
			<li class:selected={space.id === selectedId}>
				<button type="button" class="space-btn" onclick={() => onSelect(space.id)}>
					{space.name}
				</button>
			</li>
		{/each}
	</ul>
	{#if spaces.length === 0}
		<p class="empty">No spaces yet. Use the Layout Editor to create one.</p>
	{/if}
</section>

<style>
	.panel {
		margin-bottom: 1rem;
	}
	.space-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.space-list li {
		margin-bottom: 2px;
	}
	.space-list li.selected .space-btn {
		font-weight: bold;
		background: #e7f5ff;
	}
	.space-btn {
		width: 100%;
		text-align: left;
		padding: 4px 8px;
		border: 1px solid #ddd;
		background: white;
		cursor: pointer;
	}
	.empty {
		color: #555;
		font-size: 13px;
	}
</style>
