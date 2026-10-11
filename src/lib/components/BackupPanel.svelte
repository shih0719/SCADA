<script lang="ts">
	import { api } from '#lib/client/api.ts';

	let fileInputEl: HTMLInputElement | undefined;
	let busy = $state(false);
	let error = $state('');
	let successMessage = $state('');

	function downloadBackup() {
		const url = api.backupExportUrl();
		const a = document.createElement('a');
		a.href = url;
		a.download = '';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	async function handleFileChange(e: Event) {
		error = '';
		successMessage = '';
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const confirmed = confirm(
			'還原備份會覆蓋目前的所有資料跟底圖圖片，且需要重啟伺服器才會套用，確定要繼續？'
		);
		if (!confirmed) {
			if (fileInputEl) fileInputEl.value = '';
			return;
		}

		busy = true;
		try {
			const result = await api.restoreBackup(file);
			successMessage = `還原成功，${result.action_required}`;
		} catch (e) {
			error = e instanceof Error ? e.message : '還原失敗';
		} finally {
			busy = false;
			if (fileInputEl) fileInputEl.value = '';
		}
	}
</script>

<section class="panel">
	<h2>備份與還原</h2>
	<p class="hint">
		下載完整系統備份（資料庫 + 底圖圖片），或上傳備份檔還原。還原後需要重啟伺服器才會套用。
	</p>

	<div class="actions">
		<button type="button" onclick={downloadBackup} disabled={busy}>⇩ 下載備份</button>
	</div>

	<div class="restore">
		<label class="restore-label" for="backup-restore-input">還原備份（.zip）</label>
		<input
			id="backup-restore-input"
			bind:this={fileInputEl}
			type="file"
			accept=".zip"
			onchange={handleFileChange}
			disabled={busy}
		/>
	</div>

	{#if busy}<p class="busy">處理中…</p>{/if}
	{#if error}<p class="error">{error}</p>{/if}
	{#if successMessage}<p class="success">{successMessage}</p>{/if}
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
	.hint {
		font-size: 12px;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2);
	}
	.actions {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	.actions button {
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
	.actions button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.restore {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.restore-label {
		font-size: 12px;
		color: var(--color-text-secondary);
	}
	.restore input[type='file'] {
		font-size: 12px;
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-ui);
	}
	.restore input[type='file']::file-selector-button {
		margin-right: var(--space-2);
		background: transparent;
		color: var(--color-status-stale);
		border: 1px solid var(--color-status-stale);
		border-radius: var(--radius-sm);
		padding: 4px 10px;
		font-family: var(--font-ui);
		cursor: pointer;
	}
	.restore input[type='file']::file-selector-button:hover {
		background: var(--color-status-warning-bg);
	}
	.restore {
		padding-top: var(--space-3);
		border-top: 1px dashed var(--color-border);
	}
	.busy {
		font-size: 12px;
		color: var(--color-accent);
		margin-top: var(--space-2);
	}
	.error {
		color: var(--color-status-error);
		font-size: 13px;
		margin-top: var(--space-2);
	}
	.success {
		color: var(--color-status-ok);
		font-size: 13px;
		margin-top: var(--space-2);
	}
</style>
