<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Space, Device, Circuit, CircuitRuntimeState } from '#lib/types.ts';
	import { api } from '#lib/client/api.ts';
	import SpacePanel from '#lib/components/SpacePanel.svelte';
	import DevicePanel from '#lib/components/DevicePanel.svelte';
	import CircuitPanel from '#lib/components/CircuitPanel.svelte';
	import ImportCsvPanel from '#lib/components/ImportCsvPanel.svelte';
	import FloorplanCanvas from '#lib/components/FloorplanCanvas.svelte';

	const STATUS_POLL_MS = 1500;

	let spaces = $state<Space[]>([]);
	let devices = $state<Device[]>([]);
	let circuits = $state<Circuit[]>([]);
	let states = $state<Map<number, CircuitRuntimeState>>(new Map());
	let selectedSpaceId = $state<number | null>(null);
	let placingCircuitId = $state<number | null>(null);
	let loadError = $state('');

	const selectedSpace = $derived(spaces.find((s) => s.id === selectedSpaceId) ?? null);

	let statusTimer: ReturnType<typeof setInterval> | undefined;

	async function reloadSpaces() {
		spaces = await api.listSpaces();
		if (selectedSpaceId === null && spaces.length > 0) {
			selectedSpaceId = spaces[0].id;
		}
		if (selectedSpaceId !== null && !spaces.some((s) => s.id === selectedSpaceId)) {
			selectedSpaceId = spaces.length > 0 ? spaces[0].id : null;
		}
	}

	async function reloadDevices() {
		devices = await api.listDevices();
	}

	async function reloadCircuits() {
		if (selectedSpaceId === null) {
			circuits = [];
			return;
		}
		circuits = await api.listCircuits(selectedSpaceId);
	}

	async function pollStatus() {
		if (selectedSpaceId === null) return;
		try {
			const list = await api.spaceStatus(selectedSpaceId);
			const map = new Map<number, CircuitRuntimeState>();
			for (const s of list) map.set(s.circuit_id, s);
			states = map;
			loadError = '';
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'status poll failed';
		}
	}

	function restartStatusPolling() {
		if (statusTimer) clearInterval(statusTimer);
		states = new Map();
		void pollStatus();
		statusTimer = setInterval(pollStatus, STATUS_POLL_MS);
	}

	function selectSpace(id: number) {
		selectedSpaceId = id;
		placingCircuitId = null;
	}

	async function onSpacesChanged() {
		await reloadSpaces();
		await reloadCircuits();
	}

	async function onCircuitsChanged() {
		await reloadCircuits();
	}

	// CSV import may create new Spaces/Devices too (not just Circuits), so
	// reload everything the sidebar and canvas depend on.
	async function onCsvImported() {
		await reloadSpaces();
		await reloadDevices();
		await reloadCircuits();
	}

	async function handlePositionChange(circuitId: number, pos_x: number, pos_y: number) {
		// Update local state immediately for a smooth drag release, then persist.
		circuits = circuits.map((c) => (c.id === circuitId ? { ...c, pos_x, pos_y } : c));
		try {
			await api.updateCircuitPosition(circuitId, pos_x, pos_y);
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'failed to save position';
			await reloadCircuits();
		}
	}

	async function handleToggle(circuitId: number) {
		const prev = states.get(circuitId);
		if (!prev || prev.value === null) return; // nothing known to toggle
		// Optimistic UI update.
		const optimistic = new Map(states);
		optimistic.set(circuitId, { ...prev, value: !prev.value });
		states = optimistic;
		try {
			await api.toggleCircuit(circuitId);
		} catch (e) {
			// Roll back on failure.
			const rolledBack = new Map(states);
			rolledBack.set(circuitId, prev);
			states = rolledBack;
			loadError = e instanceof Error ? e.message : 'toggle failed';
		}
	}

	function startPlacing(circuitId: number) {
		placingCircuitId = circuitId;
	}

	async function handlePlaceAt(pos_x: number, pos_y: number) {
		if (placingCircuitId === null) return;
		const id = placingCircuitId;
		placingCircuitId = null;
		await handlePositionChange(id, pos_x, pos_y);
	}

	onMount(async () => {
		await reloadSpaces();
		await reloadDevices();
		await reloadCircuits();
		restartStatusPolling();
	});

	onDestroy(() => {
		if (statusTimer) clearInterval(statusTimer);
	});

	// Re-fetch circuits and restart status polling whenever the selected space changes.
	let lastSpaceId: number | null = null;
	$effect(() => {
		if (selectedSpaceId !== lastSpaceId) {
			lastSpaceId = selectedSpaceId;
			void reloadCircuits();
			restartStatusPolling();
		}
	});
</script>

<svelte:head>
	<title>燈控 SCADA — 編輯模式</title>
</svelte:head>

<div class="layout">
	<aside class="sidebar">
		<p class="nav"><a href="/">← 返回操作頁面</a></p>
		<h1>燈控 SCADA — 編輯模式</h1>
		<SpacePanel
			{spaces}
			selectedId={selectedSpaceId}
			onSelect={selectSpace}
			onChanged={onSpacesChanged}
		/>
		<DevicePanel {devices} onChanged={reloadDevices} />
		{#if selectedSpace}
			<CircuitPanel
				spaceId={selectedSpace.id}
				{circuits}
				{devices}
				{placingCircuitId}
				onChanged={onCircuitsChanged}
				onStartPlacing={startPlacing}
			/>
		{/if}
		<ImportCsvPanel onImported={onCsvImported} />
	</aside>

	<main class="main">
		{#if loadError}<p class="error-banner">{loadError}</p>{/if}
		{#if selectedSpace}
			<h2>{selectedSpace.name}</h2>
			<FloorplanCanvas
				space={selectedSpace}
				{circuits}
				{states}
				{placingCircuitId}
				editable={true}
				onPositionChange={handlePositionChange}
				onToggle={handleToggle}
				onPlaceAt={handlePlaceAt}
			/>
		{:else}
			<p>Create a Space to get started.</p>
		{/if}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
	}
	.layout {
		display: flex;
		height: 100vh;
	}
	.sidebar {
		width: 320px;
		flex-shrink: 0;
		overflow-y: auto;
		padding: 1rem;
		border-right: 1px solid #ddd;
		box-sizing: border-box;
	}
	.sidebar h1 {
		font-size: 1.1rem;
		margin-top: 0;
	}
	.nav {
		margin: 0 0 0.5rem;
	}
	.nav a {
		color: #1971c2;
		text-decoration: none;
		font-size: 13px;
	}
	.main {
		flex: 1;
		padding: 1rem;
		overflow-y: auto;
	}
	.error-banner {
		background: #fff5f5;
		color: #c92a2a;
		border: 1px solid #ffc9c9;
		padding: 6px 10px;
		border-radius: 4px;
	}
</style>
