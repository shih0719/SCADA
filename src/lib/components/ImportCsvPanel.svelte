<script lang="ts">
	import type { ImportResult } from '#lib/types.ts';
	import { api } from '#lib/client/api.ts';

	let { onImported }: { onImported: () => Promise<void> | void } = $props();

	let fileInputEl: HTMLInputElement | undefined;
	let csvText = $state('');
	let fileName = $state('');
	let preview = $state<ImportResult | null>(null);
	let finalResult = $state<ImportResult | null>(null);
	let error = $state('');
	let busy = $state(false);

	async function handleFileChange(e: Event) {
		error = '';
		preview = null;
		finalResult = null;
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		fileName = file.name;
		try {
			csvText = await file.text();
		} catch {
			error = 'failed to read file';
			return;
		}
		await runDryRun();
	}

	async function runDryRun() {
		if (!csvText.trim()) return;
		busy = true;
		error = '';
		try {
			preview = await api.importCsv(csvText, true);
		} catch (e) {
			error = e instanceof Error ? e.message : 'preview failed';
			preview = null;
		} finally {
			busy = false;
		}
	}

	async function confirmImport() {
		if (!csvText.trim()) return;
		busy = true;
		error = '';
		try {
			finalResult = await api.importCsv(csvText, false);
			preview = null;
			csvText = '';
			fileName = '';
			if (fileInputEl) fileInputEl.value = '';
			await onImported();
		} catch (e) {
			error = e instanceof Error ? e.message : 'import failed';
		} finally {
			busy = false;
		}
	}

	function cancelPreview() {
		preview = null;
		csvText = '';
		fileName = '';
		if (fileInputEl) fileInputEl.value = '';
	}
</script>

<section class="panel">
	<h2>CSV 批量匯入 Circuit</h2>
	<p class="hint">
		header: space_name, device_name, device_ip, device_port, device_slave_id, coil_address, name
		（選填 circuit_id：若填且比對到現有 Circuit，該行視為更新而非新建）
	</p>
	<input
		bind:this={fileInputEl}
		type="file"
		accept=".csv"
		onchange={handleFileChange}
		disabled={busy}
	/>
	{#if fileName}<p class="filename">已選擇檔案：{fileName}</p>{/if}
	{#if busy}<p class="busy">處理中…</p>{/if}
	{#if error}<p class="error">{error}</p>{/if}

	{#if preview}
		<div class="preview">
			<h3>預覽結果（尚未寫入資料庫）</h3>
			<p class="summary">
				總行數 {preview.totalRows}，成功 {preview.successCount}（新建 {preview.rows.filter(
					(r) => r.action === 'create'
				).length} 筆，更新 {preview.rows.filter((r) => r.action === 'update').length} 筆），錯誤 {preview.errorCount}，
				會新建 Space {preview.newSpaces.length} 個，會新建 Device {preview.newDevices.length} 個
			</p>

			{#if preview.newSpaces.length > 0}
				<div class="block new">
					<strong>會新建的 Space：</strong>
					<ul>
						{#each preview.newSpaces as s (s.name)}
							<li>{s.name}</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if preview.newDevices.length > 0}
				<div class="block new">
					<strong>會新建的 Device：</strong>
					<ul>
						{#each preview.newDevices as d (d.name)}
							<li>{d.name}（{d.ip_address}:{d.port}, slave {d.slave_id}）</li>
						{/each}
					</ul>
				</div>
			{/if}

			<div class="block">
				<strong>逐行結果：</strong>
				<table>
					<thead>
						<tr>
							<th>行</th>
							<th>動作</th>
							<th>Space</th>
							<th>Device</th>
							<th>Coil</th>
							<th>名稱</th>
							<th>狀態</th>
						</tr>
					</thead>
					<tbody>
						{#each preview.rows as r (r.line)}
							<tr
								class:err={r.status === 'error'}
								class:warn={r.status === 'ok' && !!r.warning}
								class:update={r.status === 'ok' && r.action === 'update'}
							>
								<td>{r.line}</td>
								<td>
									{#if r.status === 'error'}
										<span class="tag tag-err">錯誤</span>
									{:else if r.action === 'update'}
										<span class="tag tag-update">更新 #{r.circuit_id}</span>
									{:else}
										<span class="tag tag-create">新建</span>
									{/if}
								</td>
								<td>{r.space_name}</td>
								<td>{r.device_name}</td>
								<td>{r.coil_address ?? '-'}</td>
								<td>{r.name}</td>
								<td>
									{#if r.status === 'error'}
										<span class="tag tag-err">錯誤</span> {r.error}
									{:else if r.warning}
										<span class="tag tag-warn">警告</span> {r.warning}
									{:else}
										OK
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="actions">
				<button
					type="button"
					onclick={confirmImport}
					disabled={busy || preview.successCount === 0}
				>
					確認匯入（{preview.successCount} 筆）
				</button>
				<button type="button" onclick={cancelPreview} disabled={busy}>取消</button>
			</div>
		</div>
	{/if}

	{#if finalResult}
		<div class="result">
			<h3>匯入完成</h3>
			<p class="summary">
				已處理 Circuit {finalResult.successCount} 筆（新建 {finalResult.rows.filter(
					(r) => r.action === 'create'
				).length} 筆，更新 {finalResult.rows.filter((r) => r.action === 'update').length} 筆；新建 Space {finalResult
					.newSpaces.length} 個，新建 Device {finalResult.newDevices.length} 個），錯誤 {finalResult.errorCount} 筆
			</p>
			{#if finalResult.errorCount > 0}
				<div class="block err">
					<strong>未匯入的行：</strong>
					<ul>
						{#each finalResult.rows.filter((r) => r.status === 'error') as r (r.line)}
							<li>第 {r.line} 行：{r.error}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.panel {
		margin-bottom: 0;
	}
	.panel h2 {
		color: var(--color-text);
		font-size: 1rem;
		margin-top: 0;
	}
	.panel h3 {
		color: var(--color-text);
		font-size: 0.95rem;
	}
	.hint {
		font-size: 12px;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2);
	}
	.filename {
		font-size: 12px;
		margin: var(--space-1) 0;
		color: var(--color-text-secondary);
	}
	.busy {
		font-size: 12px;
		color: var(--color-accent);
	}
	.error {
		color: var(--color-status-error);
		font-size: 13px;
	}
	.summary {
		font-size: 13px;
		font-weight: 600;
		color: var(--color-text);
	}
	.block {
		margin: var(--space-2) 0;
		font-size: 12px;
		color: var(--color-text);
	}
	.block ul {
		margin: var(--space-1) 0;
		padding-left: 18px;
	}
	.block.new {
		background: var(--color-accent-muted);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
	}
	.block.err {
		background: var(--color-danger-bg);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
		margin-top: var(--space-2);
	}
	th,
	td {
		border: 1px solid var(--color-border);
		padding: var(--space-1) var(--space-2);
		text-align: left;
		color: var(--color-text);
	}
	th {
		background: var(--color-surface-elevated);
		color: var(--color-text-secondary);
	}
	tr.err {
		background: var(--color-danger-bg);
		color: var(--color-danger-text);
	}
	tr.warn {
		background: var(--color-warning-bg);
		color: var(--color-warning-text);
	}
	tr.update {
		background: var(--color-accent-muted);
	}
	.tag {
		display: inline-block;
		font-size: 11px;
		font-weight: 600;
		padding: 1px 5px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
	}
	.tag-create {
		background: var(--color-accent-muted);
		color: var(--color-accent-hover);
	}
	.tag-update {
		background: var(--color-status-ok-bg);
		color: var(--color-status-ok);
	}
	.tag-err {
		background: var(--color-status-error-bg);
		color: var(--color-status-error);
	}
	.tag-warn {
		background: var(--color-warning-bg);
		color: var(--color-warning-text);
	}
	.actions {
		margin-top: var(--space-3);
		display: flex;
		gap: var(--space-2);
	}
	.actions button,
	.panel > input[type='file'] {
		background: var(--color-accent);
		color: var(--color-bg);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-ui);
		cursor: pointer;
	}
	.actions button:hover {
		background: var(--color-accent-hover);
	}
	.actions button:last-child {
		background: transparent;
		color: var(--color-text-secondary);
		border-color: var(--color-border);
	}
	.result {
		margin-top: var(--space-3);
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-2);
	}
</style>
