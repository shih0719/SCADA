<script lang="ts">
	import type { SceneSummary, ScheduleWithSceneName } from '#lib/types.ts';
	import { api } from '#lib/client/api.ts';

	// Schedule CRUD for the Layout Editor (/edit). A schedule only ever does
	// one thing: apply an existing Scene at a given time-of-day on given
	// days-of-week. Triggering happens in the background (src/lib/server/scheduler.ts)
	// — this panel is config-only, same reasoning as why ScenePanel's apply
	// button lives on the operate page but not here.
	let {
		schedules,
		scenes,
		onChanged
	}: {
		schedules: ScheduleWithSceneName[];
		scenes: SceneSummary[];
		onChanged: () => void;
	} = $props();

	const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

	let editingScheduleId = $state<number | null>(null); // null = creating a new schedule
	let name = $state('');
	let sceneId = $state<number | null>(null);
	let timeOfDay = $state('18:00');
	let selectedDays = $state<Set<number>>(new Set());
	let isEnabled = $state(true);
	let error = $state('');
	let busy = $state(false);

	function resetForm() {
		editingScheduleId = null;
		name = '';
		sceneId = scenes.length > 0 ? scenes[0].id : null;
		timeOfDay = '18:00';
		selectedDays = new Set();
		isEnabled = true;
		error = '';
	}
	resetForm();

	function toggleDay(day: number) {
		const next = new Set(selectedDays);
		if (next.has(day)) next.delete(day);
		else next.add(day);
		selectedDays = next;
	}

	function startEdit(schedule: ScheduleWithSceneName) {
		error = '';
		editingScheduleId = schedule.id;
		name = schedule.name;
		sceneId = schedule.scene_id;
		timeOfDay = schedule.time_of_day;
		selectedDays = new Set(schedule.days_of_week);
		isEnabled = Boolean(schedule.is_enabled);
	}

	function daysSummary(days: number[]): string {
		if (days.length === 0) return '(無)';
		const sorted = [...days].sort((a, b) => a - b);
		return sorted.map((d) => DAY_LABELS[d]).join('');
	}

	async function save() {
		error = '';
		if (name.trim().length === 0) {
			error = '排程名稱必填';
			return;
		}
		if (sceneId === null) {
			error = '請選擇要套用的場景';
			return;
		}
		if (selectedDays.size === 0) {
			error = '請至少勾選一個星期幾';
			return;
		}
		const payload = {
			name: name.trim(),
			scene_id: sceneId,
			time_of_day: timeOfDay,
			days_of_week: Array.from(selectedDays),
			is_enabled: isEnabled
		};
		busy = true;
		try {
			if (editingScheduleId === null) {
				await api.createSchedule(payload);
			} else {
				await api.updateSchedule(editingScheduleId, payload);
			}
			resetForm();
			await onChanged();
		} catch (e) {
			error = e instanceof Error ? e.message : '儲存排程失敗';
		} finally {
			busy = false;
		}
	}

	async function toggleEnabled(schedule: ScheduleWithSceneName) {
		error = '';
		try {
			await api.updateSchedule(schedule.id, { is_enabled: !schedule.is_enabled });
			await onChanged();
		} catch (e) {
			error = e instanceof Error ? e.message : '更新排程失敗';
		}
	}

	async function removeSchedule(id: number, scheduleName: string) {
		if (!confirm(`刪除排程「${scheduleName}」？此操作無法復原。`)) return;
		error = '';
		try {
			await api.deleteSchedule(id);
			if (editingScheduleId === id) resetForm();
			await onChanged();
		} catch (e) {
			error = e instanceof Error ? e.message : '刪除排程失敗';
		}
	}
</script>

<section class="panel">
	<h2 class="section-title">定時排程 <span class="count-badge">{schedules.length}</span></h2>
	<p class="hint">時間為伺服器本機時間。排程只能套用已建立的場景——若要排程某個空間全開/全關，請先建立一個對應的場景。</p>

	<ul class="list">
		{#each schedules as schedule (schedule.id)}
			<li class:disabled={!schedule.is_enabled} class:editing={editingScheduleId === schedule.id}>
				<div class="time-tile">
					<span class="time">{schedule.time_of_day}</span>
					<span class="led" class:on={Boolean(schedule.is_enabled)}></span>
				</div>
				<div class="row-body">
				<div class="row-main">
					<span class="name">{schedule.name}</span>
					<span class="meta">→ {schedule.scene_name ?? `場景 #${schedule.scene_id}`}</span>
				</div>
				<div class="row-sub">
					<span class="day-dots" title={daysSummary(schedule.days_of_week)}>
						{#each DAY_LABELS as label, day (day)}
							<span class="day-dot" class:active={schedule.days_of_week.includes(day)}>{label}</span>
						{/each}
					</span>
					<span class="last-triggered">
						最後觸發：{schedule.last_triggered_at ?? '從未'}
					</span>
				</div>
				<div class="row-actions">
					<label class="enabled-toggle">
						<input
							type="checkbox"
							checked={Boolean(schedule.is_enabled)}
							onchange={() => toggleEnabled(schedule)}
						/>
						啟用
					</label>
					<button type="button" class="small ghost" onclick={() => startEdit(schedule)}>編輯</button>
					<button
						type="button"
						class="danger small"
						title="刪除排程"
						aria-label="刪除 {schedule.name}"
						onclick={() => removeSchedule(schedule.id, schedule.name)}>✕</button
					>
				</div>
				</div>
			</li>
		{/each}
		{#if schedules.length === 0}
			<li class="empty-row">尚無排程</li>
		{/if}
	</ul>

	{#if scenes.length === 0}
		<p class="empty">請先到上面建立場景，才能設定排程。</p>
	{:else}
		<form class="schedule-form" onsubmit={(e) => { e.preventDefault(); save(); }}>
			<p class="form-title" class:is-editing={editingScheduleId !== null}>{editingScheduleId === null ? '＋ 新增排程' : `✎ 編輯排程 #${editingScheduleId}`}</p>
			<input placeholder="排程名稱" bind:value={name} />

			<label class="field">
				<span>套用場景</span>
				<select bind:value={sceneId}>
					{#each scenes as scene (scene.id)}
						<option value={scene.id}>{scene.name}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span>時間</span>
				<input type="time" bind:value={timeOfDay} />
			</label>

			<div class="field">
				<span>星期幾</span>
				<div class="day-checkboxes">
					{#each DAY_LABELS as label, day (day)}
						<label class="day-checkbox">
							<input
								type="checkbox"
								checked={selectedDays.has(day)}
								onchange={() => toggleDay(day)}
							/>
							{label}
						</label>
					{/each}
				</div>
			</div>

			<label class="enabled-toggle">
				<input type="checkbox" bind:checked={isEnabled} />
				啟用
			</label>

			<div class="form-actions">
				<button type="submit" disabled={busy}>{editingScheduleId === null ? '建立排程' : '儲存變更'}</button>
				{#if editingScheduleId !== null}
					<button type="button" class="secondary" onclick={resetForm} disabled={busy}>取消編輯</button>
				{/if}
			</div>
		</form>
	{/if}
	{#if error}<p class="error">{error}</p>{/if}
</section>

<style>
	.panel { margin-bottom: 0; }
	.panel h2 { color: var(--color-text); font-size: 1rem; margin-top: 0; }
	.hint {
		color: var(--color-text-secondary);
		font-size: 12px;
		line-height: 1.6;
		margin: 0 0 var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		border-left: 2px solid var(--color-accent);
	}
	.list { list-style: none; padding: 0; margin: 0 0 var(--space-3); font-size: 13px; }
	.list li {
		display: flex;
		gap: var(--space-3);
		align-items: stretch;
		padding: var(--space-2);
		margin-bottom: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		transition: border-color 120ms, opacity 120ms;
	}
	.list li:hover { border-color: var(--color-border-strong); }
	.list li.disabled { opacity: 0.55; }
	.list li.editing { border-color: var(--color-accent); box-shadow: inset 3px 0 0 var(--color-accent); }
	.list li.empty-row { justify-content: center; color: var(--color-text-muted); border-style: dashed; background: none; }
	.time-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-width: 72px;
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
	}
	.led { width: 8px; height: 8px; border-radius: 50%; background: var(--color-status-off); }
	.led.on { background: var(--color-status-ok); box-shadow: 0 0 6px var(--color-status-ok); }
	.row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
	.row-main { display: flex; align-items: baseline; gap: var(--space-2); }
	.name { font-weight: 600; color: var(--color-text); }
	.meta { color: var(--color-text-secondary); }
	.row-sub { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font-size: 11px; color: var(--color-text-muted); }
	.time { font-family: var(--font-mono); font-size: 18px; font-weight: 600; color: var(--color-text); letter-spacing: 0.02em; }
	.day-dots { display: inline-flex; gap: 3px; }
	.day-dot {
		width: 18px;
		height: 18px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-size: 10px;
		color: var(--color-text-muted);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
	}
	.day-dot.active { color: var(--color-bg); background: var(--color-accent); border-color: var(--color-accent); font-weight: 700; }
	.last-triggered { flex: 1; min-width: 0; }
	.row-actions { display: flex; align-items: center; gap: var(--space-2); }
	.empty { color: var(--color-text-muted); font-size: 13px; }

	.schedule-form {
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
	.field { display: flex; flex-direction: column; gap: var(--space-1); font-size: 12px; color: var(--color-text-secondary); }
	.day-checkboxes { display: flex; gap: var(--space-1); flex-wrap: wrap; }
	.day-checkbox {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 30px;
		font-size: 12px;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		cursor: pointer;
		user-select: none;
		transition: background 120ms, color 120ms;
	}
	.day-checkbox:hover { color: var(--color-text); border-color: var(--color-accent); }
	.day-checkbox input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
	.day-checkbox:has(input:checked) { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-bg); font-weight: 700; }
	.day-checkbox:has(input:focus-visible) { outline: 2px solid var(--color-accent-hover); outline-offset: 2px; }
	.enabled-toggle { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--color-text); }

	.form-actions { display: flex; gap: var(--space-2); }

	input, select {
		background: var(--color-surface-elevated);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text);
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-ui);
	}
	input:focus, select:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: -1px;
	}
	input[type="checkbox"] {
		padding: 0;
		width: auto;
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
	.secondary { background: transparent; color: var(--color-text-secondary); }
	.secondary:hover { background: var(--color-surface-elevated); }
	.danger { background: transparent; color: var(--color-status-error); border-color: var(--color-status-error); }
	.danger:hover { background: var(--color-status-error-bg); }
	.small { padding: var(--space-1) var(--space-2); font-size: 11px; }
	.ghost { background: transparent; color: var(--color-accent); }
	.ghost:hover { background: var(--color-accent-muted); }
	.error { color: var(--color-status-error); font-size: 13px; }
</style>
