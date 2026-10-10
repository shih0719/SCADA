<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '#lib/client/api.ts';
	import type { HealthzResponse, DeviceMetricsEntry } from '#lib/types.ts';

	const POLL_MS = 4000;

	let health = $state<HealthzResponse | null>(null);
	let metrics = $state<DeviceMetricsEntry[]>([]);
	let error = $state('');

	let timer: ReturnType<typeof setInterval> | undefined;

	async function refresh() {
		try {
			const [h, m] = await Promise.all([api.healthz(), api.metrics()]);
			health = h;
			metrics = m;
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to load status';
		}
	}

	function metricsFor(deviceId: number): DeviceMetricsEntry | undefined {
		return metrics.find((m) => m.device_id === deviceId);
	}

	function fmtPercent(v: number | null): string {
		return v === null ? '—' : `${Math.round(v * 100)}%`;
	}

	function fmtMs(v: number | null): string {
		return v === null ? '—' : `${Math.round(v)} ms`;
	}

	function fmtTime(v: string | null): string {
		return v === null ? '—' : new Date(v).toLocaleTimeString();
	}

	onMount(() => {
		void refresh();
		timer = setInterval(refresh, POLL_MS);
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});
</script>

<svelte:head>
	<title>燈控 SCADA — 系統狀態</title>
</svelte:head>

<div class="page">
	<p class="nav"><a href="/">← 返回操作頁面</a></p>
	<h1>系統狀態</h1>

	{#if error}<p class="error-banner">{error}</p>{/if}

	{#if health}
		<p class="overall">
			整體狀態：
			<span class="status-badge status-{health.status}">{health.status}</span>
			（server_started_at: {health.server_started_at}, uptime: {Math.round(
				health.uptime_ms / 1000
			)}s）
		</p>
	{/if}

	<table>
		<thead>
			<tr>
				<th>Device</th>
				<th>連線狀態</th>
				<th>成功率</th>
				<th>平均延遲</th>
				<th>連續失敗次數</th>
				<th>最後成功時間</th>
			</tr>
		</thead>
		<tbody>
			{#if health}
				{#each health.devices as d (d.device_id)}
					{@const m = metricsFor(d.device_id)}
					{@const successPct = m?.success_rate !== null && m?.success_rate !== undefined ? Math.round(m.success_rate * 100) : null}
					<tr>
						<td>{d.name}</td>
						<td>
							<span class="dot" class:dot-ok={d.connected} class:dot-down={!d.connected}></span>
							<span class:ok={d.connected} class:down={!d.connected}>
								{d.connected ? 'connected' : 'disconnected'}
							</span>
						</td>
						<td class="num-cell">
							<div class="rate-cell">
								<span class="num">{fmtPercent(m?.success_rate ?? null)}</span>
								{#if successPct !== null}
									<div class="rate-bar">
										<div class="rate-bar-fill" style="width: {successPct}%;"></div>
									</div>
								{/if}
							</div>
						</td>
						<td class="num">{fmtMs(m?.avg_latency_ms ?? null)}</td>
						<td class="num" class:warn={d.consecutive_failures >= 3}>{d.consecutive_failures}</td>
						<td class="num">{fmtTime(d.last_success_at)}</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
	{#if health && health.devices.length === 0}
		<p>No devices configured yet.</p>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: var(--font-ui);
		background: var(--color-bg);
		color: var(--color-text);
	}
	.page {
		padding: var(--space-4) var(--space-6);
	}
	.page h1 {
		color: var(--color-text);
	}
	.nav a {
		color: var(--color-accent);
		text-decoration: none;
		font-size: 13px;
	}
	.nav a:hover {
		color: var(--color-accent-hover);
	}
	.overall {
		color: var(--color-text-secondary);
		font-size: 14px;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		margin-top: var(--space-4);
		background: var(--color-surface);
		border-radius: var(--radius-md);
		overflow: hidden;
		box-shadow: var(--shadow-card);
	}
	th,
	td {
		border: 1px solid var(--color-border);
		padding: var(--space-2) var(--space-3);
		text-align: left;
		font-size: 14px;
		color: var(--color-text);
	}
	th {
		background: var(--color-surface-elevated);
		color: var(--color-text-secondary);
		font-weight: 600;
	}
	.num,
	.num-cell {
		font-family: var(--font-mono);
		text-align: right;
	}
	.dot {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		margin-right: var(--space-2);
	}
	.dot-ok {
		background: var(--color-status-ok);
		box-shadow: 0 0 6px 1px var(--color-status-ok);
	}
	.dot-down {
		background: var(--color-status-error);
		box-shadow: 0 0 6px 1px var(--color-status-error);
	}
	.rate-cell {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.rate-bar {
		width: 80px;
		height: 6px;
		border-radius: var(--radius-sm);
		background: var(--color-surface-elevated);
		overflow: hidden;
	}
	.rate-bar-fill {
		height: 100%;
		background: var(--color-status-ok);
	}
	.ok {
		color: var(--color-status-ok);
		font-weight: 600;
	}
	.down {
		color: var(--color-status-error);
		font-weight: 600;
	}
	.warn {
		color: var(--color-status-error);
		font-weight: 600;
	}
	.status-badge {
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-weight: 600;
	}
	.status-ok {
		background: var(--color-status-ok-bg);
		color: var(--color-status-ok);
	}
	.status-degraded {
		background: var(--color-status-error-bg);
		color: var(--color-status-error);
	}
	.error-banner {
		background: var(--color-danger-bg);
		color: var(--color-danger-text);
		border: 1px solid var(--color-danger-border);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
	}
</style>
