<script lang="ts">
	import type { Space, Circuit, SceneSummary } from '#lib/types.ts';
	import { api } from '#lib/client/api.ts';

	// Scene create/edit/delete management for the Layout Editor (/edit).
	// Scenes can span multiple Spaces, so the circuit picker below shows
	// every Circuit across every Space (labeled "Space - Circuit") rather
	// than being scoped to whichever Space happens to be selected elsewhere
	// on this page.
	let {
		scenes,
		spaces,
		allCircuits,
		onChanged
	}: {
		scenes: SceneSummary[];
		spaces: Space[];
		allCircuits: Circuit[];
		onChanged: () => void;
	} = $props();

	type Selection = 'none' | 'on' | 'off';

	let editingSceneId = $state<number | null>(null); // null = creating a new scene
	let name = $state('');
	let selections = $state<Map<number, Selection>>(new Map());
	let error = $state('');
	let busy = $state(false);

	function spaceName(spaceId: number): string {
		return spaces.find((s) => s.id === spaceId)?.name ?? `space ${spaceId}`;
	}

	function resetForm() {
		editingSceneId = null;
		name = '';
		selections = new Map();
		error = '';
	}

	function setSelection(circuitId: number, value: Selection) {
		const next = new Map(selections);
		next.set(circuitId, value);
		selections = next;
	}

	async function startEdit(sceneId: number) {
		error = '';
		busy = true;
		try {
			const scene = await api.getScene(sceneId);
			editingSceneId = scene.id;
			name = scene.name;
			const next = new Map<number, Selection>();
			for (const a of scene.actions) next.set(a.circuit_id, a.value ? 'on' : 'off');
			selections = next;
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to load scene';
		} finally {
			busy = false;
		}
	}

	function buildActions() {
		const actions: { circuit_id: number; value: boolean }[] = [];
		for (const [circuitId, sel] of selections) {
			if (sel === 'none') continue;
			actions.push({ circuit_id: circuitId, value: sel === 'on' });
		}
		return actions;
	}

	async function save() {
		error = '';
		if (name.trim().length === 0) {
			error = 'scene name is required';
			return;
		}
		const actions = buildActions();
		busy = true;
		try {
			if (editingSceneId === null) {
				await api.createScene(name.trim(), actions);
			} else {
				await api.updateScene(editingSceneId, { name: name.trim(), actions });
			}
			resetForm();
			await onChanged();
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to save scene';
		} finally {
			busy = false;
		}
	}

	async function removeScene(id: number, name: string) {
		if (!confirm(`刪除場景「${name}」？此操作無法復原。`)) return;
		error = '';
		try {
			await api.deleteScene(id);
			if (editingSceneId === id) resetForm();
			await onChanged();
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to delete scene';
		}
	}
</script>

<section class="panel">
	<h2 class="section-title">場景 / 群組控制 <span class="count-badge">{scenes.length}</span></h2>

	<ul class="list">
		{#each scenes as scene (scene.id)}
			<li class:editing={editingSceneId === scene.id}>
				<span class="scene-icon" aria-hidden="true">✦</span>
				<span class="name">{scene.name}</span>
				<span class="meta">{scene.action_count} 個動作</span>
				<button type="button" class="small ghost" onclick={() => startEdit(scene.id)}>編輯</button>
				<button type="button" class="danger small" title="刪除場景" aria-label="刪除 {scene.name}" onclick={() => removeScene(scene.id, scene.name)}>✕</button>
			</li>
		{/each}
		{#if scenes.length === 0}
			<li class="empty-row">尚無場景</li>
		{/if}
	</ul>

	<form class="scene-form" onsubmit={(e) => { e.preventDefault(); save(); }}>
		<p class="form-title" class:is-editing={editingSceneId !== null}>{editingSceneId === null ? '＋ 新增場景' : `✎ 編輯場景 #${editingSceneId}`}</p>
		<input placeholder="場景名稱" bind:value={name} />

		<div class="circuit-list">
			{#each allCircuits as c (c.id)}
				{@const sel = selections.get(c.id) ?? 'none'}
				<div class="circuit-row">
					<span class="circuit-label">{spaceName(c.space_id)} - {c.name}</span>
					<div class="tri-toggle">
						<button
							type="button"
							class:active={sel === 'none'}
							onclick={() => setSelection(c.id, 'none')}
						>不設定</button>
						<button
							type="button"
							class:active={sel === 'on'}
							class="on"
							onclick={() => setSelection(c.id, 'on')}
						>開</button>
						<button
							type="button"
							class:active={sel === 'off'}
							class="off"
							onclick={() => setSelection(c.id, 'off')}
						>關</button>
					</div>
				</div>
			{/each}
			{#if allCircuits.length === 0}
				<p class="empty">尚無可用的 Circuit</p>
			{/if}
		</div>

		<div class="form-actions">
			<button type="submit" disabled={busy}>{editingSceneId === null ? '建立場景' : '儲存變更'}</button>
			{#if editingSceneId !== null}
				<button type="button" class="secondary" onclick={resetForm} disabled={busy}>取消編輯</button>
			{/if}
		</div>
	</form>
	{#if error}<p class="error">{error}</p>{/if}
</section>

<style>
	.panel { margin-bottom: 0; }
	.panel h2 { color: var(--color-text); font-size: 1rem; margin-top: 0; }
	.list { list-style: none; padding: 0; margin: 0 0 var(--space-3); font-size: 13px; }
	.list li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		transition: border-color 120ms;
	}
	.list li:hover { border-color: var(--color-border-strong); }
	.list li.editing { border-color: var(--color-accent); box-shadow: inset 3px 0 0 var(--color-accent); }
	.list li.empty-row { justify-content: center; color: var(--color-text-muted); border-style: dashed; background: none; }
	.scene-icon { color: var(--color-status-on); font-size: 12px; }
	.name { font-weight: 600; min-width: 80px; color: var(--color-text); }
	.meta { color: var(--color-text-secondary); font-family: var(--font-mono); font-size: 11px; flex: 1; }
	.empty { color: var(--color-text-muted); font-size: 13px; }

	.scene-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px dashed var(--color-border-strong);
		border-radius: var(--radius-md);
		background: rgba(15, 20, 25, 0.35);
	}
	.form-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--color-text); }
	.form-title.is-editing { color: var(--color-accent-hover); }

	.circuit-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-height: 300px;
		scrollbar-width: thin;
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-1);
		background: var(--color-surface);
	}
	.circuit-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		font-size: 12px;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
	}
	.circuit-row:hover { background: var(--color-surface-elevated); }
	.circuit-label { color: var(--color-text); flex: 1; }
	.tri-toggle {
		display: flex;
		flex-shrink: 0;
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}
	.tri-toggle button {
		padding: 3px var(--space-2);
		font-size: 11px;
		border: none;
		border-radius: 0;
		min-width: 34px;
	}
	.tri-toggle button + button { border-left: 1px solid var(--color-border-strong); }

	.form-actions { display: flex; gap: var(--space-2); }

	input {
		background: var(--color-surface-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text);
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-ui);
	}
	input:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: -1px;
	}
	button {
		background: var(--color-accent);
		color: var(--color-bg);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-ui);
		cursor: pointer;
	}
	button:hover { background: var(--color-accent-hover); }
	button:disabled { opacity: 0.6; cursor: not-allowed; }
	button.active { background: var(--color-accent-hover); color: var(--color-bg); }
	.tri-toggle button:not(.active) { background: transparent; color: var(--color-text-secondary); }
	.tri-toggle button:not(.active):hover { background: var(--color-surface-elevated); color: var(--color-text); }
	.tri-toggle button.active { background: var(--color-border-strong); color: var(--color-text); }
	/* on = lit-bulb amber, matching the floorplan icons; off = unlit grey */
	.tri-toggle button.on.active { background: var(--color-status-on); color: var(--color-bg); font-weight: 600; }
	.tri-toggle button.off.active { background: var(--color-status-off); color: var(--color-text); font-weight: 600; }
	.secondary { background: transparent; color: var(--color-text-secondary); }
	.secondary:hover { background: var(--color-surface-elevated); }
	.danger { background: transparent; color: var(--color-status-error); border-color: var(--color-status-error); }
	.danger:hover { background: var(--color-status-error-bg); }
	.small { padding: var(--space-1) var(--space-2); font-size: 11px; }
	.ghost { background: transparent; color: var(--color-accent); }
	.ghost:hover { background: var(--color-accent-muted); }
	.error { color: var(--color-status-error); font-size: 13px; }
</style>
