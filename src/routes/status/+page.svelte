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
					<tr>
						<td>{d.name}</td>
						<td class:ok={d.connected} class:down={!d.connected}>
							{d.connected ? 'connected' : 'disconnected'}
						</td>
						<td>{fmtPercent(m?.success_rate ?? null)}</td>
						<td>{fmtMs(m?.avg_latency_ms ?? null)}</td>
						<td class:warn={d.consecutive_failures >= 3}>{d.consecutive_failures}</td>
						<td>{fmtTime(d.last_success_at)}</td>
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
		font-family: system-ui, sans-serif;
	}
	.page {
		padding: 1rem 1.5rem;
	}
	.nav a {
		color: #1971c2;
		text-decoration: none;
		font-size: 13px;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		margin-top: 1rem;
	}
	th,
	td {
		border: 1px solid #ddd;
		padding: 6px 10px;
		text-align: left;
		font-size: 14px;
	}
	th {
		background: #f1f3f5;
	}
	.ok {
		color: #2b8a3e;
		font-weight: 600;
	}
	.down {
		color: #c92a2a;
		font-weight: 600;
	}
	.warn {
		color: #c92a2a;
		font-weight: 600;
	}
	.status-badge {
		padding: 2px 8px;
		border-radius: 4px;
		font-weight: 600;
	}
	.status-ok {
		background: #d3f9d8;
		color: #2b8a3e;
	}
	.status-degraded {
		background: #ffe3e3;
		color: #c92a2a;
	}
	.error-banner {
		background: #fff5f5;
		color: #c92a2a;
		border: 1px solid #ffc9c9;
		padding: 6px 10px;
		border-radius: 4px;
	}
</style>
