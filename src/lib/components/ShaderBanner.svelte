<script lang="ts">
	/*
	 * Decorative WebGPU backdrop (shaders library). Purely cosmetic: a CSS
	 * gradient is always painted underneath, so browsers without WebGPU, or
	 * users who prefer reduced motion, still get a finished-looking banner.
	 * Telemetry is disabled — this UI runs on plant networks.
	 *
	 * The library is ~2.5MB, so it is dynamically imported only once we know
	 * the browser can use it; it never blocks first paint.
	 */
	import { onMount, type Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();

	let fx = $state<typeof import('shaders/svelte') | null>(null);
	let ready = $state(false);

	onMount(() => {
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduceMotion || !('gpu' in navigator)) return;
		import('shaders/svelte')
			.then((mod) => (fx = mod))
			.catch(() => {
				// cosmetic only — the CSS fallback is already showing
			});
	});
</script>

<div class="banner">
	{#if fx}
		{@const { Shader, FlowingGradient, DotGrid } = fx}
		<div class="fx" class:ready>
			<Shader
				disableTelemetry
				style="width: 100%; height: 100%;"
				onready={() => (ready = true)}
				onunavailable={() => (fx = null)}
			>
				<!-- dark navy → accent blue → a hint of lamp amber, drifting slowly -->
				<FlowingGradient
					colorA="#0f1419"
					colorB="#1c3d5a"
					colorC="#2f7fc4"
					colorD="#6b5320"
					colorSpace="linear"
					speed={0.4}
					distortion={0.6}
				/>
				<DotGrid color="#9aa4b2" density={16} dotSize={0.18} opacity={0.25} />
			</Shader>
		</div>
	{/if}
	<div class="content">
		{@render children?.()}
	</div>
</div>

<style>
	.banner {
		position: relative;
		/* overflow:hidden drops the flex min-height, so a scrolling flex parent
		   would otherwise squash the banner to nothing */
		flex-shrink: 0;
		overflow: hidden;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background:
			radial-gradient(120% 90% at 85% 0%, rgba(77, 171, 247, 0.28), transparent 60%),
			radial-gradient(80% 70% at 10% 100%, rgba(255, 212, 59, 0.14), transparent 65%),
			linear-gradient(160deg, #16202b, var(--color-surface));
		box-shadow: var(--shadow-card);
	}
	.fx {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 600ms ease;
		pointer-events: none;
	}
	.fx.ready {
		opacity: 1;
	}
	.content {
		position: relative;
		padding: var(--space-4);
		/* keep text legible: shade only the left side, where the text sits */
		background: linear-gradient(90deg, rgba(15, 20, 25, 0.6), rgba(15, 20, 25, 0) 75%);
	}
</style>
