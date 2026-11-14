<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../i18n';
  import type { DeckType, KiezFeature, KiezMastery, Lang, PersistedState } from '../types';

  interface Props {
    lang: Lang;
    deck: DeckType;
    features: KiezFeature[];
    stateData: PersistedState;
    onSelectFilter: (filter: string) => void;
    onToggleMasteryMap: () => void;
    onResetProgress: () => void;
    onResetCamera: () => void;
  }

  let {
    lang,
    deck,
    features,
    stateData,
    onSelectFilter,
    onToggleMasteryMap,
    onResetProgress,
    onResetCamera
  }: Props = $props();

  let dialogEl: HTMLDialogElement;
  let confirmReset = $state(false);

  export function open() {
    confirmReset = false;
    dialogEl?.showModal();
  }

  export function close() {
    dialogEl?.close();
  }

  function handleClose() {
    if (dialogEl) {
      dialogEl.returnValue = '';
    }
    confirmReset = false;
  }

  // Mandatory light-dismiss fallback for browsers without <dialog closedby>
  onMount(() => {
    if (!dialogEl) return;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const r = dialogEl.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      const onDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) dialogEl.close();
      };
      dialogEl.addEventListener('pointerdown', onDown);
      dialogEl.addEventListener('pointerup', onUp);
      return () => {
        dialogEl.removeEventListener('pointerdown', onDown);
        dialogEl.removeEventListener('pointerup', onUp);
      };
    }
  });

  const bezirke = $derived.by(() => {
    const set = new Set<string>();
    for (const f of features) set.add(f.properties.bezirk);
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  });

  const masteryCounts = $derived.by(() => {
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const f of features) {
      const m: KiezMastery | undefined = stateData.mastery[f.properties.id];
      const lvl = m?.level ?? 0;
      counts[lvl]++;
    }
    return counts;
  });

  const masteredPercent = $derived.by(() => {
    if (features.length === 0) return 0;
    const weighted = masteryCounts[1] * 0.35 + masteryCounts[2] * 0.7 + masteryCounts[3];
    return Math.round((weighted / features.length) * 100);
  });
</script>

<dialog bind:this={dialogEl} closedby="any" aria-labelledby="atlas-dialog-title" onclose={handleClose}>
  <div class="dialog-shell">
    <header class="dialog-header">
      <div>
        <h2 id="atlas-dialog-title">{t(lang, 'atlasTitle')}</h2>
        <p class="dialog-sub">
          {deck === 'ortsteile' ? t(lang, 'deckOrtsteile') : t(lang, 'deckKieze')} · {t(lang, 'atlasSubtitle')}
        </p>
      </div>
      <button type="button" class="icon-close tap-target" onclick={close} aria-label={t(lang, 'atlasClose')}>
        ✕
      </button>
    </header>

    <div class="dialog-body">
      <section class="stats-row">
        <div class="stat-box">
          <span class="stat-val">{masteredPercent}%</span>
          <span class="stat-lbl">{t(lang, 'overallProgress')}</span>
        </div>
        <div class="stat-box">
          <span class="stat-val">🔥 {stateData.dailyStreak}</span>
          <span class="stat-lbl">{t(lang, 'dailyStreak')}</span>
        </div>
        <div class="stat-box">
          <span class="stat-val">{stateData.stats[stateData.mode].highScore}</span>
          <span class="stat-lbl">{t(lang, 'bestLabel')}</span>
        </div>
      </section>

      <section class="mastery-panel">
        <div class="progress-bar" aria-label={t(lang, 'overallProgress')}>
          <span class="seg-3" style:inline-size="{(masteryCounts[3] / Math.max(features.length, 1)) * 100}%"></span>
          <span class="seg-2" style:inline-size="{(masteryCounts[2] / Math.max(features.length, 1)) * 100}%"></span>
          <span class="seg-1" style:inline-size="{(masteryCounts[1] / Math.max(features.length, 1)) * 100}%"></span>
        </div>
        <div class="legend-grid">
          <span class="legend-item"><i class="dot l0"></i> {t(lang, 'mastery0')}: {masteryCounts[0]}</span>
          <span class="legend-item"><i class="dot l1"></i> {t(lang, 'mastery1')}: {masteryCounts[1]}</span>
          <span class="legend-item"><i class="dot l2"></i> {t(lang, 'mastery2')}: {masteryCounts[2]}</span>
          <span class="legend-item"><i class="dot l3"></i> {t(lang, 'mastery3')}: {masteryCounts[3]}</span>
        </div>
      </section>

      <div class="action-pair">
        <button
          type="button"
          class="action-btn tap-target"
          class:active={stateData.masteryColorMode}
          onclick={() => {
            onToggleMasteryMap();
            close();
          }}
        >
          🎨 {stateData.masteryColorMode ? t(lang, 'atlasColorMapActive') : t(lang, 'atlasColorMap')}
        </button>
        <button
          type="button"
          class="action-btn tap-target"
          onclick={() => {
            onResetCamera();
            close();
          }}
        >
          🗺️ {t(lang, 'resetCamera')}
        </button>
      </div>

      <section class="filter-section">
        <h3>{t(lang, 'atlasFilterTitle')}</h3>
        <div class="chip-grid">
          <button
            type="button"
            class="filter-chip tap-target"
            class:selected={stateData.bezirkFilter === 'all'}
            onclick={() => onSelectFilter('all')}
          >
            {t(lang, 'filterAll')} ({features.length})
          </button>
          {#if deck === 'ortsteile'}
            <button
              type="button"
              class="filter-chip tap-target"
              class:selected={stateData.bezirkFilter === 'ring'}
              onclick={() => onSelectFilter('ring')}
            >
              ⭕ {t(lang, 'filterRing')}
            </button>
          {/if}
          {#each bezirke as bez}
            <button
              type="button"
              class="filter-chip tap-target"
              class:selected={stateData.bezirkFilter === bez}
              onclick={() => onSelectFilter(bez)}
            >
              {bez}
            </button>
          {/each}
        </div>
      </section>

      <footer class="danger-zone">
        {#if !confirmReset}
          <button type="button" class="reset-btn tap-target" onclick={() => (confirmReset = true)}>
            {t(lang, 'atlasResetBtn')}
          </button>
        {:else}
          <div class="confirm-row">
            <span>{t(lang, 'atlasResetConfirm')}</span>
            <button
              type="button"
              class="reset-confirm-btn tap-target"
              onclick={() => {
                onResetProgress();
                confirmReset = false;
              }}
            >
              OK
            </button>
            <button type="button" class="cancel-btn tap-target" onclick={() => (confirmReset = false)}>
              ✕
            </button>
          </div>
        {/if}
      </footer>
    </div>
  </div>
</dialog>

<style>
  .dialog-shell {
    display: flex;
    flex-direction: column;
    max-block-size: 86dvh;
  }

  .dialog-header {
    display: flex;
    align-items: safe center;
    justify-content: space-between;
    gap: 12px;
    padding-block: 14px;
    padding-inline: 18px;
    border-block-end: 1px solid var(--border);
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 800;
  }

  .dialog-sub {
    margin: 2px 0 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .icon-close {
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text-primary);
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-grid;
    place-items: center;
  }

  .dialog-body {
    padding: 16px 18px 20px;
    overflow-y: auto;
    scrollbar-gutter: stable;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .stat-box {
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .stat-val {
    font-size: 1.1rem;
    font-weight: 800;
  }

  .stat-lbl {
    font-size: 0.72rem;
    color: var(--text-muted);
    text-align: center;
  }

  .mastery-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .progress-bar {
    display: flex;
    block-size: 12px;
    border-radius: 999px;
    overflow: clip;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
  }

  .seg-3 {
    background: #10b981;
  }
  .seg-2 {
    background: #3b82f6;
  }
  .seg-1 {
    background: #f59e0b;
  }

  .legend-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px 12px;
    font-size: 0.8rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dot {
    inline-size: 10px;
    block-size: 10px;
    border-radius: 999px;
    display: inline-block;
  }
  .dot.l0 {
    background: var(--surface-elevated);
    border: 1px solid var(--border);
  }
  .dot.l1 {
    background: #f59e0b;
  }
  .dot.l2 {
    background: #3b82f6;
  }
  .dot.l3 {
    background: #10b981;
  }

  .action-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .action-btn {
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text-primary);
    border-radius: 12px;
    padding: 10px 12px;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
  }

  .action-btn.active {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }

  .filter-section h3 {
    margin: 0 0 8px;
    font-size: 0.88rem;
    color: var(--text-muted);
    font-weight: 700;
  }

  .chip-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .filter-chip {
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    color: var(--text-primary);
    border-radius: 999px;
    padding: 8px 14px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }

  .filter-chip.selected {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }

  .danger-zone {
    padding-block-start: 6px;
    border-block-start: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
  }

  .reset-btn,
  .cancel-btn {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    border-radius: 10px;
    padding: 8px 14px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .confirm-row {
    display: flex;
    align-items: safe center;
    gap: 8px;
    font-size: 0.82rem;
    inline-size: 100%;
    justify-content: flex-end;
  }

  .reset-confirm-btn {
    border: none;
    background: var(--danger);
    color: #ffffff;
    border-radius: 10px;
    padding: 8px 14px;
    font-weight: 700;
    cursor: pointer;
  }
</style>
