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
		margin-bottom: var(--space-4);
	}
	.panel h2 {
		color: var(--color-text);
		font-size: 1rem;
	}
	.space-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.space-list li.selected .space-btn {
		font-weight: 600;
		background: var(--color-accent-muted);
		border-color: var(--color-accent);
		color: var(--color-accent-hover);
	}
	.space-btn {
		width: 100%;
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-elevated);
		color: var(--color-text);
		cursor: pointer;
		box-shadow: var(--shadow-card);
	}
	.space-btn:hover {
		border-color: var(--color-border-strong);
	}
	.empty {
		color: var(--color-text-muted);
		font-size: 13px;
	}
</style>
