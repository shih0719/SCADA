<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Space, Circuit, CircuitRuntimeState } from '#lib/types.ts';
	import { api } from '#lib/client/api.ts';
	import SpaceSelector from '#lib/components/SpaceSelector.svelte';
	import FloorplanCanvas from '#lib/components/FloorplanCanvas.svelte';

	const STATUS_POLL_MS = 1500;
	const RESTART_NOTICE_UPTIME_THRESHOLD_MS = 10000;
	const FLASH_ERROR_MS = 3000;

	let spaces = $state<Space[]>([]);
	let circuits = $state<Circuit[]>([]);
	let states = $state<Map<number, CircuitRuntimeState>>(new Map());
	let selectedSpaceId = $state<number | null>(null);
	let loadError = $state('');
	let restartNotice = $state('');
	let flashErrorIds = $state<Set<number>>(new Set());

	const selectedSpace = $derived(spaces.find((s) => s.id === selectedSpaceId) ?? null);

	let statusTimer: ReturnType<typeof setInterval> | undefined;
	let restartNoticeTimer: ReturnType<typeof setTimeout> | undefined;

	async function reloadSpaces() {
		spaces = await api.listSpaces();
		if (selectedSpaceId === null && spaces.length > 0) {
			selectedSpaceId = spaces[0].id;
		}
		if (selectedSpaceId !== null && !spaces.some((s) => s.id === selectedSpaceId)) {
			selectedSpaceId = spaces.length > 0 ? spaces[0].id : null;
		}
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
			clearRestartNotice();
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
	}

	function clearRestartNotice() {
		restartNotice = '';
		if (restartNoticeTimer) {
			clearTimeout(restartNoticeTimer);
			restartNoticeTimer = undefined;
		}
	}

	async function checkServerRestart() {
		try {
			const health = await api.healthz();
			if (health.uptime_ms < RESTART_NOTICE_UPTIME_THRESHOLD_MS) {
				restartNotice = '伺服器剛重啟，狀態同步中...';
				restartNoticeTimer = setTimeout(clearRestartNotice, RESTART_NOTICE_UPTIME_THRESHOLD_MS);
			}
		} catch {
			// healthz itself failing is not critical here; loadError/pollStatus covers connectivity issues
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

			// Brief visual flash on the icon itself, independent of the banner.
			const next = new Set(flashErrorIds);
			next.add(circuitId);
			flashErrorIds = next;
			setTimeout(() => {
				const after = new Set(flashErrorIds);
				after.delete(circuitId);
				flashErrorIds = after;
			}, FLASH_ERROR_MS);
		}
	}

	// No-op handlers for the read-only FloorplanCanvas (editable=false ignores these).
	function noopPositionChange() {}
	function noopPlaceAt() {}

	onMount(async () => {
		await reloadSpaces();
		await reloadCircuits();
		restartStatusPolling();
		void checkServerRestart();
	});

	onDestroy(() => {
		if (statusTimer) clearInterval(statusTimer);
		if (restartNoticeTimer) clearTimeout(restartNoticeTimer);
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
	<title>燈控 SCADA</title>
</svelte:head>

<div class="layout">
	<aside class="sidebar">
		<h1>燈控 SCADA</h1>
		<p class="nav">
			<a href="/edit">編輯模式 →</a>
			<a href="/status">系統狀態 →</a>
		</p>
		<SpaceSelector spaces={spaces} selectedId={selectedSpaceId} onSelect={selectSpace} />
	</aside>

	<main class="main">
		{#if restartNotice}<p class="restart-banner">{restartNotice}</p>{/if}
		{#if loadError}<p class="error-banner">{loadError}</p>{/if}
		{#if selectedSpace}
			<h2>{selectedSpace.name}</h2>
			<FloorplanCanvas
				space={selectedSpace}
				{circuits}
				{states}
				editable={false}
				{flashErrorIds}
				onPositionChange={noopPositionChange}
				onToggle={handleToggle}
				onPlaceAt={noopPlaceAt}
			/>
		{:else}
			<p>No Space selected. Use the Layout Editor to create one.</p>
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
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 0 0 1rem;
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
	.restart-banner {
		background: #fff9db;
		color: #997404;
		border: 1px solid #ffe066;
		padding: 6px 10px;
		border-radius: 4px;
	}
</style>
