<script lang="ts">
	import type { Space, Circuit, CircuitRuntimeState } from '#lib/types.ts';
	import CircuitIcon from './CircuitIcon.svelte';

	let {
		space,
		circuits,
		states,
		placingCircuitId = null,
		editable,
		flashErrorIds = undefined,
		onPositionChange,
		onToggle,
		onPlaceAt
	}: {
		space: Space;
		circuits: Circuit[];
		states: Map<number, CircuitRuntimeState>;
		placingCircuitId?: number | null;
		editable: boolean;
		flashErrorIds?: Set<number>;
		onPositionChange: (circuitId: number, pos_x: number, pos_y: number) => void;
		onToggle: (circuitId: number) => void;
		onPlaceAt: (pos_x: number, pos_y: number) => void;
	} = $props();

	let wrapperEl: HTMLDivElement | undefined = $state();
	let displayWidth = $state(0);

	const scale = $derived(
		space.floorplan_width && displayWidth > 0 ? displayWidth / space.floorplan_width : 1
	);
	const displayHeight = $derived(
		space.floorplan_width && space.floorplan_height
			? displayWidth * (space.floorplan_height / space.floorplan_width)
			: 0
	);

	const positioned = $derived(circuits.filter((c) => c.pos_x !== null && c.pos_y !== null));

	function handleDragEnd(circuitId: number, clientDx: number, clientDy: number) {
		const circuit = circuits.find((c) => c.id === circuitId);
		if (!circuit || circuit.pos_x === null || circuit.pos_y === null) return;
		const newX = circuit.pos_x + clientDx / scale;
		const newY = circuit.pos_y + clientDy / scale;
		const clampedX = Math.max(0, Math.min(space.floorplan_width ?? newX, newX));
		const clampedY = Math.max(0, Math.min(space.floorplan_height ?? newY, newY));
		onPositionChange(circuitId, clampedX, clampedY);
	}

	function handleCanvasClick(e: MouseEvent) {
		if (!editable) return;
		if (placingCircuitId === null || !wrapperEl) return;
		const rect = wrapperEl.getBoundingClientRect();
		const x = (e.clientX - rect.left) / scale;
		const y = (e.clientY - rect.top) / scale;
		onPlaceAt(x, y);
	}
</script>

<div class="canvas-outer">
	{#if !space.floorplan_image_path}
		<p class="hint">This Space has no floorplan image yet. Upload one to place circuits.</p>
	{:else}
		<div
			class="canvas-wrapper"
			role="button"
			tabindex="0"
			bind:this={wrapperEl}
			bind:clientWidth={displayWidth}
			class:placing={editable && placingCircuitId !== null}
			style="height: {displayHeight}px;"
			onclick={handleCanvasClick}
			onkeydown={(e) => {
				if (editable && (e.key === 'Enter' || e.key === ' '))
					handleCanvasClick(e as unknown as MouseEvent);
			}}
		>
			<img src={space.floorplan_image_path} alt={space.name} draggable="false" />
			{#each positioned as circuit (circuit.id)}
				<CircuitIcon
					{circuit}
					runtimeState={states.get(circuit.id)}
					left={(circuit.pos_x ?? 0) * scale}
					top={(circuit.pos_y ?? 0) * scale}
					placing={editable && placingCircuitId !== null}
					draggable={editable}
					flashError={flashErrorIds?.has(circuit.id) ?? false}
					onDragEnd={handleDragEnd}
					onToggle={onToggle}
				/>
			{/each}
		</div>
		{#if editable && placingCircuitId !== null}
			<p class="hint placing-hint">Click anywhere on the floorplan to place the selected circuit.</p>
		{/if}
	{/if}
</div>

<style>
	.canvas-outer {
		width: 100%;
	}
	.canvas-wrapper {
		position: relative;
		width: 100%;
		border: 1px solid #ccc;
		overflow: hidden;
		background: #f1f3f5;
	}
	.canvas-wrapper.placing {
		cursor: crosshair;
		outline: 2px dashed #1971c2;
	}
	.canvas-wrapper img {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: contain;
		pointer-events: none;
	}
	.hint {
		color: #555;
		font-size: 14px;
	}
	.placing-hint {
		color: #1971c2;
		font-weight: 600;
	}
</style>
