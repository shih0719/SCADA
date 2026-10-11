<script lang="ts">
	/*
	 * Shared page header: shader banner + mode badge + cross-page nav.
	 * The current page's nav pill is highlighted instead of hidden so the
	 * nav reads the same on every page.
	 */
	import { page } from '$app/state';
	import ShaderBanner from './ShaderBanner.svelte';

	let {
		mode,
		tone = 'accent',
		subtitle
	}: {
		mode: string;
		/** badge color: operate = ok green, edit = lamp amber, automation = accent blue */
		tone?: 'ok' | 'amber' | 'accent';
		subtitle: string;
	} = $props();

	const links = [
		{ href: '/', label: '操作頁面' },
		{ href: '/edit', label: '編輯模式' },
		{ href: '/automation', label: '場景與排程' },
		{ href: '/status', label: '系統狀態' }
	];
</script>

<ShaderBanner>
	<div class="brand">
		<div class="brand-row">
			<span class="mode-badge {tone}">{mode}</span>
			<!-- static HTML docs in static/docs/; full page load, not a SvelteKit route -->
			<a class="docs-link" href="/docs/index.html" data-sveltekit-reload>
				<span aria-hidden="true">?</span> 使用說明
			</a>
		</div>
		<h1>燈控 SCADA</h1>
		<p class="subtitle">{subtitle}</p>
	</div>
	<nav class="nav">
		{#each links as link (link.href)}
			<a
				href={link.href}
				class:current={page.url.pathname === link.href}
				aria-current={page.url.pathname === link.href ? 'page' : undefined}>{link.label}</a
			>
		{/each}
	</nav>
</ShaderBanner>

<style>
	.brand h1 {
		font-size: 1.35rem;
		letter-spacing: 0.02em;
		margin: var(--space-2) 0 2px;
		color: var(--color-text);
	}
	.subtitle {
		margin: 0;
		font-size: 12px;
		color: var(--color-text-secondary);
	}
	.brand-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.docs-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--color-text-secondary);
		text-decoration: none;
		padding: 2px 10px 2px 3px;
		border-radius: 999px;
		background: rgba(15, 20, 25, 0.55);
		border: 1px solid var(--color-border-strong);
		backdrop-filter: blur(4px);
	}
	.docs-link span {
		display: inline-grid;
		place-items: center;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		font-size: 11px;
		font-weight: 700;
		color: var(--color-bg);
		background: var(--color-text-secondary);
	}
	.docs-link:hover {
		color: var(--color-accent-hover);
		border-color: var(--color-accent);
	}
	.docs-link:hover span {
		background: var(--color-accent);
	}
	.mode-badge {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		padding: 2px 8px;
		border-radius: 999px;
	}
	.mode-badge.amber {
		color: var(--color-status-on);
		background: rgba(255, 212, 59, 0.12);
		border: 1px solid rgba(255, 212, 59, 0.35);
	}
	.mode-badge.ok {
		color: var(--color-status-ok);
		background: var(--color-status-ok-bg);
		border: 1px solid rgba(81, 207, 102, 0.35);
	}
	.mode-badge.accent {
		color: var(--color-accent-hover);
		background: var(--color-accent-muted);
		border: 1px solid rgba(77, 171, 247, 0.35);
	}
	.nav {
		/* 2×2 in a sidebar, one row in a full-width header */
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: var(--space-2);
		margin-top: var(--space-4);
		max-width: 600px;
	}
	.nav a {
		text-align: center;
		color: var(--color-text);
		text-decoration: none;
		font-size: 12px;
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(15, 20, 25, 0.55);
		border: 1px solid var(--color-border-strong);
		backdrop-filter: blur(4px);
		transition:
			border-color 120ms,
			color 120ms;
	}
	.nav a:hover {
		color: var(--color-accent-hover);
		border-color: var(--color-accent);
	}
	.nav a.current {
		color: var(--color-bg);
		background: var(--color-accent);
		border-color: var(--color-accent);
		font-weight: 600;
	}
</style>
