<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Space, Circuit, CircuitRuntimeState, SceneSummary } from '#lib/types.ts';
	import { api } from '#lib/client/api.ts';
	import SpaceSelector from '#lib/components/SpaceSelector.svelte';
	import FloorplanCanvas from '#lib/components/FloorplanCanvas.svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';

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

	let scenes = $state<SceneSummary[]>([]);
	let bulkSetBusy = $state(false);
	let bulkSetMessage = $state('');
	let sceneBusyId = $state<number | null>(null);
	let sceneMessage = $state('');

	const selectedSpace = $derived(spaces.find((s) => s.id === selectedSpaceId) ?? null);

	// UI-only summary derived from the existing states Map — no new API calls or data flow.
	const offlineCount = $derived(
		Array.from(states.values()).filter((s) => s.status === 'error').length
	);
	const onCount = $derived(Array.from(states.values()).filter((s) => s.value === true).length);
	const offCount = $derived(Array.from(states.values()).filter((s) => s.value === false).length);

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

	// Scenes can span multiple Spaces, so error reporting after "apply" needs
	// a name for any circuit_id, not just circuits in the currently selected
	// Space. Loaded once (and refreshed on scene-list reload) — this is
	// static circuit metadata, not runtime state, so it doesn't need polling.
	let allCircuitLabels = $state<Map<number, string>>(new Map());

	async function reloadAllCircuitLabels() {
		const [allCircuits, allSpaces] = await Promise.all([api.listAllCircuits(), api.listSpaces()]);
		const spaceNameById = new Map(allSpaces.map((s) => [s.id, s.name]));
		const map = new Map<number, string>();
		for (const c of allCircuits) {
			map.set(c.id, `${spaceNameById.get(c.space_id) ?? ''} - ${c.name}`);
		}
		allCircuitLabels = map;
	}

	async function reloadScenes() {
		scenes = await api.listScenes();
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

	function formatApplyResult(
		results: { circuit_id: number; ok: boolean; error?: string }[],
		successCount: number,
		errorCount: number
	): string {
		if (errorCount === 0) return `全部成功（${successCount}/${results.length}）`;
		const failedNames = results
			.filter((r) => !r.ok)
			.map((r) => allCircuitLabels.get(r.circuit_id) ?? `circuit ${r.circuit_id}`)
			.join('、');
		return `${successCount}/${results.length} 成功，失敗：${failedNames}`;
	}

	async function handleBulkSet(value: boolean) {
		if (selectedSpaceId === null) return;
		const spaceName = selectedSpace?.name ?? '這個空間';
		const actionLabel = value ? '全部開' : '全部關';
		if (!confirm(`確定要把「${spaceName}」底下所有迴路${actionLabel}嗎？`)) return;
		bulkSetBusy = true;
		bulkSetMessage = '';
		try {
			const result = await api.bulkSetSpace(selectedSpaceId, value);
			bulkSetMessage = formatApplyResult(result.results, result.success_count, result.error_count);
		} catch (e) {
			bulkSetMessage = e instanceof Error ? e.message : 'bulk set failed';
		} finally {
			bulkSetBusy = false;
		}
	}

	async function handleApplyScene(sceneId: number) {
		sceneBusyId = sceneId;
		sceneMessage = '';
		try {
			const result = await api.applyScene(sceneId);
			sceneMessage = formatApplyResult(result.results, result.success_count, result.error_count);
		} catch (e) {
			sceneMessage = e instanceof Error ? e.message : 'apply scene failed';
		} finally {
			sceneBusyId = null;
		}
	}

	onMount(async () => {
		await reloadSpaces();
		await reloadCircuits();
		await reloadScenes();
		void reloadAllCircuitLabels();
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
	<aside class="sidebar thin-scroll">
		<AppHeader mode="OPERATE" tone="ok" subtitle="即時監控與迴路控制" />

		<div class="ui-card">
			<SpaceSelector spaces={spaces} selectedId={selectedSpaceId} onSelect={selectSpace} />
		</div>

		<section class="ui-card scene-panel">
			<h2 class="section-title">場景 <span class="count-badge">{scenes.length}</span></h2>
			<ul class="scene-list">
				{#each scenes as scene (scene.id)}
					<li>
						<span class="scene-icon" aria-hidden="true">✦</span>
						<span class="scene-name">{scene.name}</span>
						<button
							type="button"
							class="apply-btn"
							disabled={sceneBusyId === scene.id}
							onclick={() => handleApplyScene(scene.id)}
						>
							{sceneBusyId === scene.id ? '套用中…' : '套用'}
						</button>
					</li>
				{/each}
			</ul>
			{#if scenes.length === 0}
				<p class="empty">尚無場景，請至<a href="/automation">場景與排程</a>建立。</p>
			{/if}
			{#if sceneMessage}<p class="result-message">{sceneMessage}</p>{/if}
		</section>
	</aside>

	<main class="main blueprint-bg">
		{#if restartNotice}<p class="restart-banner">{restartNotice}</p>{/if}
		{#if loadError}<p class="error-banner">{loadError}</p>{/if}
		{#if selectedSpace}
			<header class="main-header">
				<div class="title-block">
					<p class="eyebrow">Space #{selectedSpace.id}</p>
					<h2>{selectedSpace.name}</h2>
					<div class="stats">
						<span class="stat"><b>{states.size}</b> 迴路</span>
						<span class="stat on"><span class="dot"></span><b>{onCount}</b> 亮燈</span>
						<span class="stat"><span class="dot"></span><b>{offCount}</b> 熄燈</span>
						{#if offlineCount > 0}
							<span class="stat err"><b>{offlineCount}</b> 離線</span>
						{/if}
						<span class="stat live" class:stale={!!loadError}>
							<span class="pulse"></span>
							{loadError ? '輪詢失敗' : `即時 · 每 ${STATUS_POLL_MS / 1000}s`}
						</span>
					</div>
				</div>
				<div class="bulk-actions">
					<button
						type="button"
						class="bulk-on"
						disabled={bulkSetBusy}
						onclick={() => handleBulkSet(true)}
					>
						<span class="bulb" aria-hidden="true"></span>全部開
					</button>
					<button
						type="button"
						class="bulk-off"
						disabled={bulkSetBusy}
						onclick={() => handleBulkSet(false)}
					>
						<span class="bulb" aria-hidden="true"></span>全部關
					</button>
				</div>
			</header>
			{#if bulkSetMessage}<p class="result-message">{bulkSetMessage}</p>{/if}
			<div class="canvas-panel">
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
			</div>
		{:else}
			<div class="empty-state">
				<div class="empty-icon" aria-hidden="true">▦</div>
				<h2>尚未選擇空間</h2>
				<p>目前沒有可顯示的空間，請先到<a href="/edit">編輯模式</a>建立空間並上傳平面圖。</p>
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
		width: 340px;
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
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}
	.main-header h2 {
		margin: 2px 0 var(--space-3);
		font-size: 1.5rem;
		color: var(--color-text);
	}
	.error-banner,
	.restart-banner {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		margin-top: 0;
	}
	.error-banner {
		background: var(--color-danger-bg);
		color: var(--color-danger-text);
		border: 1px solid var(--color-danger-border);
	}
	.restart-banner {
		background: var(--color-warning-bg);
		color: var(--color-warning-text);
		border: 1px solid var(--color-warning-border);
	}

	/* ---- Bulk on/off: the two most consequential buttons on the page ---- */
	.bulk-actions {
		display: flex;
		gap: var(--space-2);
	}
	.bulk-actions button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-4);
		font-family: var(--font-ui);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 120ms,
			box-shadow 120ms;
	}
	.bulk-actions button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.bulb {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.bulk-on {
		background: rgba(255, 212, 59, 0.12);
		color: var(--color-status-on);
		border: 1px solid rgba(255, 212, 59, 0.5);
	}
	.bulk-on .bulb {
		background: var(--color-status-on);
		box-shadow: 0 0 8px var(--color-status-on-glow);
	}
	.bulk-on:hover:not(:disabled) {
		background: rgba(255, 212, 59, 0.2);
		box-shadow: 0 0 16px rgba(255, 212, 59, 0.2);
	}
	.bulk-off {
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border-strong);
	}
	.bulk-off .bulb {
		background: var(--color-status-off);
	}
	.bulk-off:hover:not(:disabled) {
		background: var(--color-surface-elevated);
	}
	.result-message {
		display: inline-block;
		font-size: 13px;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-3);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		border-left: 2px solid var(--color-accent);
	}

	/* ---- Scenes ---- */
	.scene-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.scene-list li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		transition: border-color 120ms;
	}
	.scene-list li:hover {
		border-color: var(--color-border-strong);
	}
	.scene-icon {
		color: var(--color-status-on);
		font-size: 12px;
	}
	.scene-name {
		flex: 1;
		color: var(--color-text);
		font-size: 13px;
	}
	.apply-btn {
		background: transparent;
		color: var(--color-accent);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-3);
		font-family: var(--font-ui);
		font-size: 12px;
		cursor: pointer;
	}
	.apply-btn:hover:not(:disabled) {
		background: var(--color-accent);
		color: var(--color-bg);
	}
	.apply-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.scene-panel .result-message {
		margin: var(--space-3) 0 0;
	}
	.empty {
		color: var(--color-text-muted);
		font-size: 13px;
		margin: 0;
	}
	.empty a,
	.empty-state a {
		color: var(--color-accent);
	}
</style>
