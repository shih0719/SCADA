<script lang="ts">
	import { onMount } from 'svelte';
	import type { Space, Circuit, SceneSummary, ScheduleWithSceneName } from '#lib/types.ts';
	import { api } from '#lib/client/api.ts';
	import ScenePanel from '#lib/components/ScenePanel.svelte';
	import SchedulePanel from '#lib/components/SchedulePanel.svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';

	let spaces = $state<Space[]>([]);
	let allCircuits = $state<Circuit[]>([]);
	let scenes = $state<SceneSummary[]>([]);
	let schedules = $state<ScheduleWithSceneName[]>([]);
	let loadError = $state('');

	async function reloadSpaces() {
		spaces = await api.listSpaces();
	}

	async function reloadAllCircuits() {
		allCircuits = await api.listAllCircuits();
	}

	async function reloadScenes() {
		scenes = await api.listScenes();
	}

	async function reloadSchedules() {
		schedules = await api.listSchedules();
	}

	async function onScenesChanged() {
		await reloadScenes();
		// Deleting a scene cascades to any schedules that applied it (FK ON
		// DELETE CASCADE), so refresh the schedule list too.
		await reloadSchedules();
	}

	async function onSchedulesChanged() {
		await reloadSchedules();
	}

	onMount(async () => {
		try {
			await reloadSpaces();
			await reloadAllCircuits();
			await reloadScenes();
			await reloadSchedules();
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'failed to load';
		}
	});
</script>

<svelte:head>
	<title>燈控 SCADA — 場景與排程</title>
</svelte:head>

<div class="page blueprint-bg">
	<header class="page-header">
		<AppHeader mode="AUTOMATION" tone="accent" subtitle="場景群組控制與定時排程" />
	</header>

	{#if loadError}<p class="error-banner">{loadError}</p>{/if}

	<div class="grid">
		<div class="ui-card">
			<ScenePanel {scenes} {spaces} {allCircuits} onChanged={onScenesChanged} />
		</div>
		<div class="ui-card">
			<SchedulePanel {schedules} {scenes} onChanged={onSchedulesChanged} />
		</div>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: var(--font-ui);
		background: var(--color-bg);
		color: var(--color-text);
	}
	.page {
		min-height: 100vh;
		padding: var(--space-6);
		box-sizing: border-box;
		max-width: 1400px;
		margin: 0 auto;
	}
	.page-header {
		margin-bottom: var(--space-6);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
		gap: var(--space-6);
		align-items: start;
	}
	.error-banner {
		background: var(--color-danger-bg);
		color: var(--color-danger-text);
		border: 1px solid var(--color-danger-border);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		margin-bottom: var(--space-4);
	}
</style>
