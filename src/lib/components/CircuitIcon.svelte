<script lang="ts">
	import type { Circuit, CircuitRuntimeState } from '#lib/types.ts';

	let {
		circuit,
		runtimeState,
		left,
		top,
		placing = false,
		draggable = true,
		flashError = false,
		onDragEnd,
		onToggle
	}: {
		circuit: Circuit;
		runtimeState: CircuitRuntimeState | undefined;
		left: number;
		top: number;
		placing?: boolean;
		draggable?: boolean;
		flashError?: boolean;
		onDragEnd: (circuitId: number, clientDx: number, clientDy: number) => void;
		onToggle: (circuitId: number) => void;
	} = $props();

	const DRAG_THRESHOLD_PX = 6;

	let dragging = $state(false);
	let dragDx = $state(0);
	let dragDy = $state(0);
	let startX = $state(0);
	let startY = $state(0);
	let moved = $state(false);

	function onPointerDown(e: PointerEvent) {
		if (placing) return;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		dragging = true;
		moved = false;
		startX = e.clientX;
		startY = e.clientY;
		dragDx = 0;
		dragDy = 0;
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		dragDx = e.clientX - startX;
		dragDy = e.clientY - startY;
		if (Math.abs(dragDx) > DRAG_THRESHOLD_PX || Math.abs(dragDy) > DRAG_THRESHOLD_PX) {
			moved = true;
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		try {
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// ignore
		}
		if (moved) {
			onDragEnd(circuit.id, dragDx, dragDy);
		} else {
			onToggle(circuit.id);
		}
		dragDx = 0;
		dragDy = 0;
	}

	const status = $derived(runtimeState?.status ?? 'error');
	const value = $derived(runtimeState?.value ?? null);
</script>

{#if draggable}
	<button
		type="button"
		class="icon status-{status}"
		class:is-on={value === true}
		class:is-off={value === false}
		class:dragging
		class:flash-error={flashError}
		style="left: {left + dragDx}px; top: {top + dragDy}px;"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		title="{circuit.name} (coil {circuit.coil_address}) — {status}"
	>
		<span class="bulb"></span>
		<span class="label">{circuit.name}</span>
		{#if status === 'stale'}<span class="badge stale-badge" title="stale">!</span>{/if}
		{#if status === 'error'}<span class="badge error-badge" title="offline/unknown">?</span>{/if}
	</button>
{:else}
	<button
		type="button"
		class="icon static status-{status}"
		class:is-on={value === true}
		class:is-off={value === false}
		class:flash-error={flashError}
		style="left: {left}px; top: {top}px;"
		onclick={() => onToggle(circuit.id)}
		title="{circuit.name} (coil {circuit.coil_address}) — {status}"
	>
		<span class="bulb"></span>
		<span class="label">{circuit.name}</span>
		{#if status === 'stale'}<span class="badge stale-badge" title="stale">!</span>{/if}
		{#if status === 'error'}<span class="badge error-badge" title="offline/unknown">?</span>{/if}
	</button>
{/if}

<style>
	.icon {
		position: absolute;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		border: none;
		background: transparent;
		cursor: grab;
		touch-action: none;
		user-select: none;
		padding: 0;
	}
	.icon.static {
		cursor: pointer;
		touch-action: auto;
	}
	.icon.dragging {
		cursor: grabbing;
		z-index: 10;
	}
	.icon.flash-error .bulb {
		animation: flash-error-anim 0.5s ease-in-out 0s 5;
	}
	@keyframes flash-error-anim {
		0%, 100% { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); border-color: inherit; }
		50% { box-shadow: 0 0 0 4px rgba(224, 49, 49, 0.9); border-color: #e03131; }
	}
	.bulb {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid #333;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
		position: relative;
	}
	.status-ok.is-on .bulb {
		background: #ffd43b;
		border-color: #e8a400;
		box-shadow: 0 0 10px 3px rgba(255, 212, 59, 0.8);
	}
	.status-ok.is-off .bulb {
		background: #495057;
		border-color: #212529;
	}
	.status-stale .bulb {
		border-style: dashed;
	}
	.status-error .bulb {
		background: repeating-linear-gradient(
			45deg,
			#adb5bd,
			#adb5bd 4px,
			#e9ecef 4px,
			#e9ecef 8px
		);
		border-color: #868e96;
	}
	.badge {
		position: absolute;
		top: -6px;
		right: -6px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		font-size: 11px;
		line-height: 16px;
		text-align: center;
		font-weight: bold;
		color: white;
	}
	.stale-badge {
		background: #f08c00;
	}
	.error-badge {
		background: #e03131;
	}
	.label {
		font-size: 11px;
		background: rgba(255, 255, 255, 0.85);
		padding: 0 4px;
		border-radius: 3px;
		white-space: nowrap;
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
