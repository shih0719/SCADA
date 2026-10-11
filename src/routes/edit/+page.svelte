<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Space, Device, Circuit, CircuitRuntimeState } from '#lib/types.ts';
	import { api } from '#lib/client/api.ts';
	import SpacePanel from '#lib/components/SpacePanel.svelte';
	import DevicePanel from '#lib/components/DevicePanel.svelte';
	import CircuitPanel from '#lib/components/CircuitPanel.svelte';
	import ImportCsvPanel from '#lib/components/ImportCsvPanel.svelte';
	import BackupPanel from '#lib/components/BackupPanel.svelte';
	import FloorplanCanvas from '#lib/components/FloorplanCanvas.svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';

	const STATUS_POLL_MS = 1500;

	let spaces = $state<Space[]>([]);
	let devices = $state<Device[]>([]);
	let circuits = $state<Circuit[]>([]);
	let states = $state<Map<number, CircuitRuntimeState>>(new Map());
	let selectedSpaceId = $state<number | null>(null);
	let placingCircuitId = $state<number | null>(null);
	let loadError = $state('');

	const selectedSpace = $derived(spaces.find((s) => s.id === selectedSpaceId) ?? null);
	const placedCount = $derived(circuits.filter((c) => c.pos_x !== null && c.pos_y !== null).length);
	const onCount = $derived(circuits.filter((c) => states.get(c.id)?.value === true).length);
	const unknownCount = $derived(circuits.filter((c) => (states.get(c.id)?.value ?? null) === null).length);

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
	<aside class="sidebar thin-scroll">
		<AppHeader mode="EDIT MODE" tone="amber" subtitle="空間、設備與迴路配置" />

		<div class="ui-card">
			<SpacePanel
				{spaces}
				selectedId={selectedSpaceId}
				onSelect={selectSpace}
				onChanged={onSpacesChanged}
			/>
		</div>
		<div class="ui-card">
			<DevicePanel {devices} onChanged={reloadDevices} />
		</div>
		{#if selectedSpace}
			<div class="ui-card">
				<CircuitPanel
					spaceId={selectedSpace.id}
					{circuits}
					{devices}
					{placingCircuitId}
					onChanged={onCircuitsChanged}
					onStartPlacing={startPlacing}
				/>
			</div>
		{/if}
		<div class="ui-card">
			<ImportCsvPanel onImported={onCsvImported} />
		</div>
		<div class="ui-card">
			<BackupPanel />
		</div>
	</aside>

	<main class="main blueprint-bg">
		{#if loadError}<p class="error-banner">{loadError}</p>{/if}
		{#if selectedSpace}
			<header class="main-header">
				<div>
					<p class="eyebrow">Space #{selectedSpace.id}</p>
					<h2>{selectedSpace.name}</h2>
				</div>
				<div class="stats">
					<span class="stat"><b>{circuits.length}</b> 迴路</span>
					<span class="stat"><b>{placedCount}</b> 已放置</span>
					{#if circuits.length - placedCount > 0}
						<span class="stat warn"><b>{circuits.length - placedCount}</b> 未放置</span>
					{/if}
					<span class="stat on"><span class="dot"></span><b>{onCount}</b> 亮燈</span>
					{#if unknownCount > 0}
						<span class="stat err"><b>{unknownCount}</b> 無資料</span>
					{/if}
					<span class="stat live" class:stale={!!loadError}>
						<span class="pulse"></span>
						{loadError ? '輪詢失敗' : `即時 · 每 ${STATUS_POLL_MS / 1000}s`}
					</span>
				</div>
			</header>
			<div class="canvas-panel">
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
			</div>
		{:else}
			<div class="empty-state">
				<div class="empty-icon" aria-hidden="true">▦</div>
				<h2>尚未建立任何空間</h2>
				<p>在左側「Spaces」輸入名稱並新增，再上傳平面圖即可開始放置迴路。</p>
			</div>
		{/if}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: var(--font-ui);
		background: var(--color-bg);
		color: var(--color-text);
	}
	.layout {
		display: flex;
		height: 100vh;
	}
	.sidebar {
		width: 380px;
		flex-shrink: 0;
		overflow-y: auto;
		padding: var(--space-4);
		border-right: 1px solid var(--color-border);
		box-sizing: border-box;
		background: linear-gradient(180deg, var(--color-surface), #161b21);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.main {
		flex: 1;
		min-width: 0;
		padding: var(--space-6);
		overflow-y: auto;
		color: var(--color-text);
	}
	.main-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.main-header h2 {
		margin: 2px 0 0;
		font-size: 1.5rem;
		color: var(--color-text);
	}
	.error-banner {
		background: var(--color-danger-bg);
		color: var(--color-danger-text);
		border: 1px solid var(--color-danger-border);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		margin-top: 0;
	}
</style>
