<script setup lang="ts">
// A node-link graph of the schema's RDF, rendered as an overlay. Built from the
// parsed quads with a small hand-rolled force layout + SVG (no graph library),
// styled in Contour's palette: shapes (navy), property/blank nodes (teal),
// classes/IRIs (outlined), literals (sand). Pan, zoom, and drag nodes.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { shorten } from '../rdf';
import type { Quad } from '../rdf';
import type { Prefix } from '../types';
import { useI18n } from '../composables/useI18n';
import Icon from './Icon.vue';

const props = defineProps<{ quads: Quad[]; prefixes: Prefix[] }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SH = 'http://www.w3.org/ns/shacl#';

type NodeKind = 'shape' | 'group' | 'bnode' | 'iri' | 'literal';
interface GNode { id: string; label: string; kind: NodeKind; x: number; y: number; vx: number; vy: number; w: number; fx: number | null; fy: number | null; }
interface GLink { s: string; tg: string; label: string; }

const short = (iri: string) => shorten(iri, props.prefixes);
const truncate = (s: string, n = 26) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ── Build graph from quads ───────────────────────────────────────────────────
const nodes: GNode[] = [];
const links: GLink[] = [];
const byId = new Map<string, GNode>();

// Mark which subjects are NodeShapes / PropertyGroups for emphasis.
const shapeIds = new Set<string>();
const groupIds = new Set<string>();
for (const q of props.quads) {
  if (q.predicate.value === RDF_TYPE) {
    if (q.object.value === SH + 'NodeShape') shapeIds.add(q.subject.id);
    if (q.object.value === SH + 'PropertyGroup') groupIds.add(q.subject.id);
  }
}

function ensure(term: Quad['object']): GNode {
  let n = byId.get(term.id);
  if (n) return n;
  let kind: NodeKind;
  let label: string;
  if (term.termType === 'Literal') {
    kind = 'literal';
    label = `"${truncate(term.value)}"`;
  } else if (term.termType === 'BlankNode') {
    kind = shapeIds.has(term.id) ? 'shape' : groupIds.has(term.id) ? 'group' : 'bnode';
    label = kind === 'bnode' ? '' : short((term as { value: string }).value) || '[ ]';
  } else {
    kind = shapeIds.has(term.id) ? 'shape' : groupIds.has(term.id) ? 'group' : 'iri';
    label = short(term.value);
  }
  const i = nodes.length;
  // Deterministic seed positions on a spiral so layout is reproducible.
  const a = i * 2.399;
  const r = 24 * Math.sqrt(i + 1);
  n = { id: term.id, label, kind, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, fx: null, fy: null,
        w: kind === 'bnode' ? 16 : Math.max(46, label.length * 7 + 18) };
  nodes.push(n);
  byId.set(term.id, n);
  return n;
}

for (const q of props.quads) {
  const s = ensure(q.subject);
  const o = ensure(q.object);
  links.push({ s: s.id, tg: o.id, label: short(q.predicate.value) });
}

const empty = computed(() => nodes.length === 0);

// ── Force simulation ─────────────────────────────────────────────────────────
const LINK_DIST = 78, SPRING = 0.04, REPULSE = 5200, GRAVITY = 0.015, DAMP = 0.88, VMAX = 40;
let alpha = 1;
let raf = 0;
const view = reactive({ x: 0, y: 0, k: 1 });
const svgEl = ref<SVGSVGElement | null>(null);
const tickFlag = ref(0); // bump to re-render (node positions are plain, not reactive)

const clamp = (v: number, m: number) => (v > m ? m : v < -m ? -m : v);

function physics() {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d2 = dx * dx + dy * dy || 0.01;
      const d = Math.sqrt(d2);
      const f = (REPULSE / d2) * alpha;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
  }
  for (const l of links) {
    const a = byId.get(l.s)!, b = byId.get(l.tg)!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const f = (d - LINK_DIST) * SPRING * alpha;
    const fx = (dx / d) * f, fy = (dy / d) * f;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  }
  for (const n of nodes) {
    if (n.fx !== null) { n.x = n.fx; n.y = n.fy!; n.vx = 0; n.vy = 0; continue; }
    n.vx = clamp((n.vx - n.x * GRAVITY * alpha) * DAMP, VMAX);
    n.vy = clamp((n.vy - n.y * GRAVITY * alpha) * DAMP, VMAX);
    n.x += n.vx; n.y += n.vy;
  }
  alpha *= 0.985;
}

function step() {
  if (alpha > 0.02) { physics(); tickFlag.value++; }
  raf = requestAnimationFrame(step);
}

function fit() {
  if (!nodes.length || !svgEl.value) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y); }
  const pad = 80;
  const w = svgEl.value.clientWidth, h = svgEl.value.clientHeight;
  const gw = (maxX - minX) + pad * 2, gh = (maxY - minY) + pad * 2;
  const k = Math.min(2, Math.max(0.2, Math.min(w / gw, h / gh)));
  view.k = k;
  view.x = w / 2 - ((minX + maxX) / 2) * k;
  view.y = h / 2 - ((minY + maxY) / 2) * k;
}

onMounted(() => {
  // Pre-settle synchronously so the first paint is already laid out, then fit.
  alpha = 1;
  for (let i = 0; i < 320 && alpha > 0.02; i++) physics();
  tickFlag.value++;
  fit();
  alpha = 0; // idle until a drag reheats it
  raf = requestAnimationFrame(step);
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); });

function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close'); }

// ── Interaction: pan, zoom, drag ─────────────────────────────────────────────
function toGraph(clientX: number, clientY: number) {
  const r = svgEl.value!.getBoundingClientRect();
  return { x: (clientX - r.left - view.x) / view.k, y: (clientY - r.top - view.y) / view.k };
}

let dragNode: GNode | null = null;
let panning = false;
let last = { x: 0, y: 0 };

function onNodeDown(e: PointerEvent, n: GNode) {
  e.stopPropagation();
  (e.target as Element).setPointerCapture?.(e.pointerId);
  dragNode = n;
  const g = toGraph(e.clientX, e.clientY);
  n.fx = g.x; n.fy = g.y;
  alpha = Math.max(alpha, 0.4);
}
function onBgDown(e: PointerEvent) {
  panning = true; last = { x: e.clientX, y: e.clientY };
  (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
}
function onMove(e: PointerEvent) {
  if (dragNode) {
    const g = toGraph(e.clientX, e.clientY);
    dragNode.fx = g.x; dragNode.fy = g.y;
    alpha = Math.max(alpha, 0.2);
  } else if (panning) {
    view.x += e.clientX - last.x; view.y += e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
  }
}
function onUp() {
  if (dragNode) { dragNode.fx = null; dragNode.fy = null; }
  dragNode = null; panning = false;
}
function onWheel(e: WheelEvent) {
  e.preventDefault();
  const r = svgEl.value!.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const nk = Math.min(4, Math.max(0.15, view.k * factor));
  view.x = mx - ((mx - view.x) * nk) / view.k;
  view.y = my - ((my - view.y) * nk) / view.k;
  view.k = nk;
}

// edge midpoint for label placement
function mid(l: GLink) {
  const a = byId.get(l.s)!, b = byId.get(l.tg)!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
</script>

<template>
  <Teleport to="body">
    <div class="graph-overlay" @click.self="emit('close')">
      <div class="graph-modal">
        <div class="graph-modal__bar">
          <div class="graph-modal__title">{{ t('graph.title') }}</div>
          <div class="graph-legend">
            <span><i class="lg lg--shape" />{{ t('graph.legend.shape') }}</span>
            <span><i class="lg lg--bnode" />{{ t('graph.legend.property') }}</span>
            <span><i class="lg lg--iri" />{{ t('graph.legend.iri') }}</span>
            <span><i class="lg lg--literal" />{{ t('graph.legend.literal') }}</span>
          </div>
          <div class="graph-modal__actions">
            <button class="btn btn-ghost btn-sm" @click="fit">{{ t('graph.fit') }}</button>
            <button class="btn btn-ghost btn-xs" :title="t('graph.close')" @click="emit('close')">
              <Icon name="x" :size="14" />
            </button>
          </div>
        </div>

        <div v-if="empty" class="graph-empty">{{ t('graph.empty') }}</div>
        <svg
          v-else
          ref="svgEl"
          class="graph-svg"
          @pointerdown="onBgDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointerleave="onUp"
          @wheel="onWheel"
        >
          <defs>
            <marker id="gv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="var(--color-text-light)" />
            </marker>
          </defs>
          <g :transform="`translate(${view.x},${view.y}) scale(${view.k})`" :data-t="tickFlag">
            <!-- edges -->
            <g class="gv-edges">
              <template v-for="(l, i) in links" :key="i">
                <line
                  class="gv-edge"
                  :x1="byId.get(l.s)!.x" :y1="byId.get(l.s)!.y"
                  :x2="byId.get(l.tg)!.x" :y2="byId.get(l.tg)!.y"
                  marker-end="url(#gv-arrow)"
                />
                <text class="gv-edge-label" :x="mid(l).x" :y="mid(l).y">{{ l.label }}</text>
              </template>
            </g>
            <!-- nodes -->
            <g
              v-for="n in nodes"
              :key="n.id"
              class="gv-node"
              :class="`gv-node--${n.kind}`"
              :transform="`translate(${n.x},${n.y})`"
              @pointerdown="onNodeDown($event, n)"
            >
              <circle v-if="n.kind === 'bnode'" r="8" />
              <rect v-else :x="-n.w / 2" y="-13" :width="n.w" height="26" rx="7" />
              <text v-if="n.kind !== 'bnode'" text-anchor="middle" dy="0.32em">{{ n.label }}</text>
            </g>
          </g>
        </svg>
        <div class="graph-hint">{{ t('graph.hint') }}</div>
      </div>
    </div>
  </Teleport>
</template>
