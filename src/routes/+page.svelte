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

	// UI-only summary derived from the existing states Map — no new API calls or data flow.
	const offlineCount = $derived(
		Array.from(states.values()).filter((s) => s.status === 'error').length
	);

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
		<p class="summary">
			<span class="summary-item">{states.size} 個迴路</span>
			{#if offlineCount > 0}
				<span class="summary-item summary-offline">{offlineCount} 個離線</span>
			{/if}
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
		font-family: var(--font-ui);
		background: var(--color-bg);
		color: var(--color-text);
	}
	.layout {
		display: flex;
		height: 100vh;
	}
	.sidebar {
		width: 320px;
		flex-shrink: 0;
		overflow-y: auto;
		padding: var(--space-4);
		border-right: 1px solid var(--color-border);
		box-sizing: border-box;
		background: var(--color-surface);
	}
	.sidebar h1 {
		font-size: 1.1rem;
		margin-top: 0;
		color: var(--color-text);
	}
	.nav {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0 0 var(--space-3);
	}
	.nav a {
		color: var(--color-accent);
		text-decoration: none;
		font-size: 13px;
	}
	.nav a:hover {
		color: var(--color-accent-hover);
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0 0 var(--space-4);
	}
	.summary-item {
		font-size: 12px;
		font-family: var(--font-mono);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--color-surface-elevated);
		color: var(--color-text-secondary);
	}
	.summary-offline {
		background: var(--color-status-error-bg);
		color: var(--color-status-error);
	}
	.main {
		flex: 1;
		padding: var(--space-4);
		overflow-y: auto;
		background: var(--color-bg);
		color: var(--color-text);
	}
	.main h2 {
		color: var(--color-text);
	}
	.error-banner {
		background: var(--color-danger-bg);
		color: var(--color-danger-text);
		border: 1px solid var(--color-danger-border);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
	}
	.restart-banner {
		background: var(--color-warning-bg);
		color: var(--color-warning-text);
		border: 1px solid var(--color-warning-border);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
	}
</style>
