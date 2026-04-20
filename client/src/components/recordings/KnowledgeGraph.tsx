import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, Handle, Position,
  Edge, Node, MarkerType, ReactFlowInstance, BackgroundVariant,
  EdgeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  MessageSquare, MessageSquareOff, X,
  Search, SlidersHorizontal, Maximize2, LocateFixed, BookOpen,
  ChevronRight, ChevronDown, EyeOff, Eye, GraduationCap, FlaskConical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { KnowledgeGraphChat } from '../chat/KnowledgeGraphChat';

// ─── Types ───────────────────────────────────────────────────────────────────
interface KGEntity {
  id: string;
  label: string;
  type: 'entity' | 'event' | 'interaction' | 'concept' | 'outcome';
  description?: string;
  properties?: any;
  weight?: number;
}
interface KGRelation {
  source: string;
  target: string;
  label?: string;
  strength?: number;
}
interface KnowledgeGraphProps {
  recordingId?: number;
  entities: KGEntity[];
  relations: KGRelation[];
  rawEntities?: KGEntity[];
  rawRelations?: KGRelation[];
}

// ─── Design tokens ───────────────────────────────────────────────────────────
const NODE_CFG: Record<string, { bg: string; border: string; text: string; ring: string; map: string }> = {
  entity:      { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a', ring: '#93c5fd', map: '#3b82f6' },
  event:       { bg: '#fed7aa', border: '#f97316', text: '#7c2d12', ring: '#fdba74', map: '#f97316' },
  concept:     { bg: '#fef08a', border: '#eab308', text: '#713f12', ring: '#fde047', map: '#eab308' },
  interaction: { bg: '#bbf7d0', border: '#22c55e', text: '#14532d', ring: '#86efac', map: '#22c55e' },
  outcome:     { bg: '#e9d5ff', border: '#a855f7', text: '#581c87', ring: '#c4b5fd', map: '#a855f7' },
};
const FALLBACK_CFG = NODE_CFG.concept;

// 24-colour palette — vivid but readable on a light canvas
const EDGE_PALETTE = [
  '#e11d48', '#f97316', '#eab308', '#16a34a', '#0ea5e9',
  '#6366f1', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b',
  '#84cc16', '#06b6d4', '#8b5cf6', '#ef4444', '#10b981',
  '#3b82f6', '#d946ef', '#059669', '#0891b2', '#dc2626',
  '#7c3aed', '#c2410c', '#0284c7', '#15803d',
];

function edgeColor(rel: KGRelation): string {
  const key = rel.source + '|' + rel.target + '|' + (rel.label ?? '');
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return EDGE_PALETTE[Math.abs(h) % EDGE_PALETTE.length];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cleanLabel(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/_/g, ' ')
    .replace(/\bmay use type of\b/gi, 'can use')
    .replace(/\bstructures component\b/gi, 'organises')
    .replace(/\bcan be implemented as\b/gi, 'implemented as')
    .replace(/\bacts as\b/gi, 'acts as')
    .replace(/\bconnects to\b/gi, 'connects to')
    .trim();
}

function strengthCategory(s?: number): 'strong' | 'moderate' | 'weak' {
  if ((s ?? 0.8) >= 0.7) return 'strong';
  if ((s ?? 0.8) >= 0.4) return 'moderate';
  return 'weak';
}

function edgeVisualStyle(s: number | undefined, color: string) {
  const cat  = strengthCategory(s);
  const base = { stroke: color, strokeWidth: cat === 'strong' ? 2.5 : 1.5 };
  if (cat === 'moderate') return { ...base, strokeDasharray: '7 4' };
  if (cat === 'weak')     return { ...base, strokeDasharray: '2 5' };
  return base;
}

// ─── Custom Edge (curved, label-on-hover) ────────────────────────────────────
const KGEdge = ({
  id, sourceX, sourceY, targetX, targetY, data, markerEnd,
}: EdgeProps) => {
  const [hovered, setHovered] = useState(false);
  const label      = data?.label ?? '';
  const offset     = data?.curveOffset ?? 0;
  const style      = data?.style ?? {};
  const bundleCount = data?.bundleCount ?? 1;
  const color      = data?.color as string | undefined;

  // Quadratic bezier control point — arcs upward, offset for parallel bundles
  const cx = (sourceX + targetX) / 2 + offset;
  const cy = (sourceY + targetY) / 2 - 80 - Math.abs(offset) * 0.3;
  const d  = `M${sourceX},${sourceY} Q${cx},${cy} ${targetX},${targetY}`;

  // Label midpoint (along bezier at t=0.5)
  const lx = 0.25 * sourceX + 0.5 * cx + 0.25 * targetX;
  const ly = 0.25 * sourceY + 0.5 * cy + 0.25 * targetY;

  const chars   = label.length;
  const lw      = Math.max(chars * 7.5 + 18, 36);
  const lh      = 22;

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hit area */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={18} />
      {/* Edge line */}
      <path
        d={d}
        fill="none"
        style={style}
        markerEnd={markerEnd}
        opacity={hovered ? 1 : 0.55}
        className="transition-opacity duration-150"
      />
      {/* Bundle badge */}
      {bundleCount > 1 && !hovered && (
        <g>
          <circle cx={(sourceX + targetX) / 2} cy={(sourceY + targetY) / 2 - 40} r={9} fill="#4f46e5" />
          <text
            x={(sourceX + targetX) / 2} y={(sourceY + targetY) / 2 - 36}
            textAnchor="middle" fontSize={9} fontWeight={700} fill="white"
          >+{bundleCount}</text>
        </g>
      )}
      {/* Edge label — always visible, tinted with edge colour on hover */}
      {label && (
        <g opacity={hovered ? 1 : 0.78} style={{ pointerEvents: 'none' }}>
          <rect
            x={lx - lw / 2} y={ly - lh / 2}
            width={lw} height={lh}
            rx={5}
            fill={hovered ? (color ?? '#1e293b') : '#f8fafc'}
            stroke={hovered ? 'none' : (color ?? '#cbd5e1')}
            strokeWidth={hovered ? 0 : 1.5}
            opacity={hovered ? 0.95 : 0.88}
          />
          <text
            x={lx} y={ly + 5}
            textAnchor="middle"
            fontSize={hovered ? 13 : 12}
            fontWeight={hovered ? 700 : 600}
            fill={hovered ? '#ffffff' : '#1e293b'}
          >{label}</text>
        </g>
      )}
    </g>
  );
};

// ─── Custom Node ──────────────────────────────────────────────────────────────
const KGNode = ({ data }: any) => {
  const cfg         = NODE_CFG[data.type] ?? FALLBACK_CFG;
  // isRoot: ONLY use the layout-computed flag — never the raw AI `root` field
  // because the LLM sometimes sets root:true on all entities.
  const isRoot      = !!data.isRoot;
  const readingOrder= data.readingOrder as number | undefined;
  const size        = Math.max(isRoot ? 150 : 110, Math.min(isRoot ? 230 : 210, (isRoot ? 140 : 110) + (data.degree ?? 0) * 12));
  const highlighted = data.highlighted;
  const dimmed      = data.dimmed;
  const searched    = data.searched;

  const bg          = isRoot ? '#fef3c7' : cfg.bg;
  const borderColor = isRoot ? '#f59e0b' : (highlighted || searched ? cfg.border : '#d1d5db');
  const borderWidth = isRoot ? 4 : (highlighted || searched ? 3 : 2);

  const boxShadow = isRoot
    ? `0 0 0 6px rgba(245,158,11,0.25), 0 0 0 12px rgba(245,158,11,0.10), 0 6px 24px rgba(0,0,0,0.18)`
    : highlighted
    ? `0 0 0 5px ${cfg.ring}, 0 4px 16px rgba(0,0,0,0.18)`
    : searched
    ? `0 0 0 4px #fbbf24, 0 4px 16px rgba(0,0,0,0.12)`
    : '0 2px 8px rgba(0,0,0,0.1)';

  return (
    <div
      style={{
        width: size, height: size,
        background: bg,
        border: `${borderWidth}px solid ${borderColor}`,
        borderRadius: '50%',
        boxShadow,
        opacity: dimmed ? 0.2 : 1,
        transition: 'all 180ms ease',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'grab',
        padding: 10,
        position: 'relative',
        animation: isRoot ? 'kgRootPulse 2.4s ease-in-out infinite' : undefined,
      }}
      onClick={() => data.onDetails()}
    >
      <Handle type="target" position={Position.Top}    style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Left}   style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0, pointerEvents: 'none' }} />

      {/* Root "Start" pill — rendered inside the node circle, at the top */}
      {isRoot && (
        <span style={{
          fontSize: 10, fontWeight: 900, letterSpacing: 0.8,
          color: '#92400e', textTransform: 'uppercase',
          background: '#fde68a', borderRadius: 8,
          padding: '2px 7px', marginBottom: 3,
          whiteSpace: 'nowrap', border: '1px solid #f59e0b',
        }}>⭐ Start here</span>
      )}

      {/* Type badge (hidden for root to save space — role is shown by colour) */}
      {!isRoot && (
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
          color: cfg.text, textTransform: 'uppercase',
          background: 'rgba(255,255,255,0.55)', borderRadius: 8,
          padding: '2px 6px', marginBottom: 4, whiteSpace: 'nowrap',
        }}>{data.type}</span>
      )}

      {/* Label */}
      <span style={{
        fontSize: Math.max(12, Math.min(16, size / 9)),
        fontWeight: isRoot ? 800 : 700,
        color: isRoot ? '#78350f' : cfg.text,
        textAlign: 'center', lineHeight: 1.25,
        wordBreak: 'break-word',
        maxWidth: size - 24,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical' as any,
        overflow: 'hidden',
      }}>{data.label}</span>

      {/* Reading-order badge (inside, bottom-right) */}
      {readingOrder != null && (
        <div style={{
          position: 'absolute', bottom: 7, right: 7,
          background: isRoot ? '#f59e0b' : '#6366f1',
          color: '#fff', fontSize: 11, fontWeight: 800,
          width: 20, height: 20, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}>{readingOrder}</div>
      )}

      {/* Info button */}
      {data.description && (
        <button
          onClick={(e) => { e.stopPropagation(); data.onDetails(); }}
          style={{
            marginTop: 3, background: 'rgba(255,255,255,0.75)',
            border: `1px solid ${isRoot ? '#f59e0b' : cfg.border}`, borderRadius: '50%',
            width: 20, height: 20, cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isRoot ? '#92400e' : cfg.text, fontWeight: 700, lineHeight: 1,
            flexShrink: 0,
          }}
        >ⓘ</button>
      )}
    </div>
  );
};

const nodeTypes = { entity: KGNode };
const edgeTypes = { kg: KGEdge };

// ─── Layout ───────────────────────────────────────────────────────────────────
function computeLayout(entities: KGEntity[], relations: KGRelation[]) {
  const degree: Record<string, number> = {};
  const neighbors: Record<string, Set<string>> = {};

  entities.forEach(e => { degree[e.id] = 0; neighbors[e.id] = new Set(); });
  relations.forEach(r => {
    if (degree[r.source] !== undefined) { degree[r.source]++; neighbors[r.source].add(r.target); }
    if (degree[r.target] !== undefined) { degree[r.target]++; neighbors[r.target].add(r.source); }
  });

  // Find the designated root (data.root flag, or fall back to highest-degree entity)
  const rootId: string = (() => {
    const tagged = entities.find(e => (e as any).root === true);
    if (tagged) return tagged.id;
    const sorted = [...entities].sort((a, b) => (degree[b.id] ?? 0) - (degree[a.id] ?? 0));
    return sorted[0]?.id ?? '';
  })();

  // Separate root, other non-events, and events
  const nonEvents = [...entities]
    .filter(e => e.type !== 'event' && e.id !== rootId)
    .sort((a, b) => (degree[b.id] ?? 0) - (degree[a.id] ?? 0));
  const events = entities.filter(e => e.type === 'event' && e.id !== rootId);
  const positions: Record<string, { x: number; y: number }> = {};

  // Root always at center
  if (rootId) positions[rootId] = { x: 0, y: 0 };

  // Place non-event non-root nodes in concentric rings.
  // Arc gap of 380 px between nodes keeps them well separated.
  const ARC_GAP  = 380;
  const ringRadii = [580, 1100, 1640, 2180, 2720];
  const ringCaps  = ringRadii.map(r => Math.max(1, Math.floor((2 * Math.PI * r) / ARC_GAP)));

  let ringIdx = 0, slotInRing = 0;

  nonEvents.forEach(e => {
    const radius = ringRadii[Math.min(ringIdx, ringRadii.length - 1)];
    const cap    = ringCaps[Math.min(ringIdx, ringCaps.length - 1)];
    // Stagger alternate rings by half a slot to break up radial corridors
    const offset = ringIdx % 2 === 1 ? Math.PI / cap : 0;
    const angle  = (slotInRing / cap) * 2 * Math.PI - Math.PI / 2 + offset;
    positions[e.id] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    slotInRing++;
    if (slotInRing >= cap) { ringIdx++; slotInRing = 0; }
  });

  // Place event nodes near the centroid of their entity neighbors, offset outward
  events.forEach((e, i) => {
    const nbrs = [...(neighbors[e.id] ?? [])].filter(n => positions[n]);
    if (nbrs.length > 0) {
      const cx  = nbrs.reduce((s, n) => s + positions[n].x, 0) / nbrs.length;
      const cy  = nbrs.reduce((s, n) => s + positions[n].y, 0) / nbrs.length;
      const ang = Math.atan2(cy, cx) + ((i % 3) - 1) * 0.5;
      const r   = 280 + (i % 4) * 80;
      positions[e.id] = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
    } else {
      const ang = (i / Math.max(events.length, 1)) * 2 * Math.PI;
      positions[e.id] = { x: Math.cos(ang) * 420, y: Math.sin(ang) * 420 };
    }
  });

  // ── Repulsion pass ──────────────────────────────────────────────────────────
  // Push nodes apart until no two are closer than MIN_DIST.
  // Runs in O(n² × iterations) — fine for graphs up to ~150 nodes.
  const MIN_DIST   = 420;
  const ids        = Object.keys(positions);
  const ITERATIONS = 80;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a  = positions[ids[i]];
        const b  = positions[ids[j]];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist >= MIN_DIST) continue;

        const push  = (MIN_DIST - dist) * 0.5;
        const nx    = (dx / dist) * push;
        const ny    = (dy / dist) * push;

        // Root stays pinned at (0,0); only non-root nodes move
        if (ids[j] !== rootId) { b.x += nx; b.y += ny; }
        if (ids[i] !== rootId) { a.x -= nx; a.y -= ny; }
      }
    }
  }

  return { positions, degree, neighbors, rootId };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function KnowledgeGraph({ recordingId, entities: learnerEntities, relations: learnerRelations, rawEntities, rawRelations }: KnowledgeGraphProps) {
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  // View mode: learner-friendly vs semantic strict
  const [semanticMode, setSemanticMode] = useState(false);
  const hasRaw = !!(rawEntities?.length && rawRelations?.length);

  // Active data based on mode
  const entities = (semanticMode && hasRaw) ? rawEntities! : learnerEntities;
  const relations = (semanticMode && hasRaw) ? rawRelations! : learnerRelations;

  // Defensive mapping to handle both 'source/target' and 'from/to' keys
  const normalizedEntities = useMemo(() => {
    return (entities || []).map(e => ({
      ...e,
      id: e.entityId || (typeof e.id === 'number' ? String(e.id) : e.id),
      description: e.description || (e as any).explanation || (e as any).content || "",
    }));
  }, [entities]);

  const normalizedRelations = useMemo(() => {
    return (relations || []).map(r => ({
      ...r,
      source: String(r.source || (r as any).sourceId || (r as any).from),
      target: String(r.target || (r as any).targetId || (r as any).to),
    })).filter(r => r.source && r.target);
  }, [relations]);

  // UI state
  const [selectedEntity, setSelectedEntity]   = useState<KGEntity | null>(null);
  const [hoveredNodeId, setHoveredNodeId]     = useState<string | null>(null);
  const [searchQuery, setSearchQuery]         = useState('');
  const [showLegend, setShowLegend]           = useState(false);
  const [showFilters, setShowFilters]         = useState(false);
  const [activeTypes, setActiveTypes]         = useState<Set<string>>(new Set());
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const [chatbotEnabled, setChatbotEnabled]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('chatbotEnabled') ?? 'false'); } catch { return false; }
  });

  // User-dragged node positions (overrides layout positions)
  const [draggedPositions, setDraggedPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Reset dragged positions and clear selection when mode switches
  useEffect(() => {
    setDraggedPositions({});
    setSelectedEntity(null);
  }, [semanticMode]);

  // Progressive reveal state
  const [hideAllEdges, setHideAllEdges]       = useState(false);
  const [progressiveNodeId, setProgressiveNodeId] = useState<string | null>(null);
  const [progressiveCount, setProgressiveCount]   = useState(0);
  const progressiveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    localStorage.setItem('chatbotEnabled', JSON.stringify(chatbotEnabled));
  }, [chatbotEnabled]);

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (progressiveTimerRef.current) clearInterval(progressiveTimerRef.current);
  }, []);

  // Layout + degree
  const { positions, degree, neighbors, rootId } = useMemo(
    () => computeLayout(normalizedEntities, normalizedRelations),
    [normalizedEntities, normalizedRelations]
  );

  // All unique relation type labels (for filter chips)
  const allRelTypes = useMemo(() => {
    const s = new Set<string>();
    normalizedRelations.forEach(r => { if (r.label) s.add(cleanLabel(r.label)); });
    return [...s].sort();
  }, [normalizedRelations]);

  // Search matches
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(normalizedEntities.filter(e => e.label.toLowerCase().includes(q)).map(e => e.id));
  }, [searchQuery, normalizedEntities]);

  // Connected nodes to hovered
  const hoveredNeighbors = useMemo((): Set<string> => {
    if (!hoveredNodeId) return new Set();
    return neighbors[hoveredNodeId] ?? new Set();
  }, [hoveredNodeId, neighbors]);

  // Build parallel edge bundles
  const edgeBundles = useMemo(() => {
    const bundles: Record<string, KGRelation[]> = {};
    normalizedRelations.forEach(r => {
      const key = [r.source, r.target].sort().join('|');
      if (!bundles[key]) bundles[key] = [];
      bundles[key].push(r);
    });
    return bundles;
  }, [normalizedRelations]);

  // Sorted edges for the progressively-revealed node (strength desc)
  const progressiveEdgeList = useMemo(() => {
    if (!hideAllEdges || !progressiveNodeId) return [];
    const allIds = new Set(normalizedEntities.map(e => e.id));
    const collected: Array<{ bundleKey: string; rel: KGRelation; idx: number }> = [];

    Object.entries(edgeBundles).forEach(([bundleKey, bundleRels]) => {
      const [sA, sB] = bundleKey.split('|');
      if (!allIds.has(sA) || !allIds.has(sB)) return;
      if (sA !== progressiveNodeId && sB !== progressiveNodeId) return;

      const visibleRels = bundleRels.filter(r =>
        activeTypes.size === 0 || activeTypes.has(cleanLabel(r.label ?? ''))
      );
      if (!visibleRels.length) return;

      (expandedBundles.has(bundleKey) ? visibleRels : visibleRels.slice(0, 1))
        .forEach((rel, idx) => collected.push({ bundleKey, rel, idx }));
    });

    return collected.sort((a, b) => (b.rel.strength ?? 0.5) - (a.rel.strength ?? 0.5));
  }, [hideAllEdges, progressiveNodeId, normalizedEntities, edgeBundles, activeTypes, expandedBundles]);

  // Node IDs that have been revealed so far in progressive mode
  const progressiveRevealedNodeIds = useMemo(() => {
    if (!hideAllEdges || !progressiveNodeId) return new Set<string>();
    const ids = new Set<string>([progressiveNodeId]);
    progressiveEdgeList.slice(0, progressiveCount).forEach(({ rel }) => {
      ids.add(rel.source);
      ids.add(rel.target);
    });
    return ids;
  }, [hideAllEdges, progressiveNodeId, progressiveEdgeList, progressiveCount]);

  // Build ReactFlow nodes
  const rfNodes: Node[] = useMemo(() => {
    if (!normalizedEntities.length) return [];
    const isHovering        = hoveredNodeId !== null;
    const isProgressiveMode = hideAllEdges && progressiveNodeId !== null;

    return normalizedEntities.map(e => {
      const pos        = draggedPositions[e.id] ?? positions[e.id] ?? { x: 0, y: 0 };
      const isSearched = searchMatches.has(e.id);

      let dimmed: boolean;
      let highlighted: boolean;

      if (isProgressiveMode) {
        const revealed = progressiveRevealedNodeIds.has(e.id);
        dimmed      = !revealed;
        highlighted = revealed;
      } else {
        const isHovered  = e.id === hoveredNodeId;
        const isNeighbor = hoveredNeighbors.has(e.id);
        dimmed      = isHovering && !isHovered && !isNeighbor;
        highlighted = isHovered || isNeighbor;
      }

      return {
        id:   e.id,
        type: 'entity',
        position: pos,
        draggable: true,
        data: {
          ...e,
          degree:    degree[e.id] ?? 0,
          highlighted,
          dimmed,
          searched:  isSearched,
          isRoot:    e.id === rootId,
          onDetails: () => setSelectedEntity({ ...e, isRoot: e.id === rootId } as any),
        },
      };
    });
  }, [normalizedEntities, positions, draggedPositions, degree, hoveredNodeId, hoveredNeighbors, searchMatches,
      hideAllEdges, progressiveNodeId, progressiveRevealedNodeIds, rootId]);

  // Build ReactFlow edges
  const rfEdges: Edge[] = useMemo(() => {
    if (!normalizedEntities.length) return [];

    // ── Progressive / hide-all mode ────────────────────────────────────────
    if (hideAllEdges) {
      if (!progressiveNodeId) return [];
      const offsets = [-80, 80, -140, 140, 0];
      return progressiveEdgeList.slice(0, progressiveCount).map(({ bundleKey, rel, idx }) => {
        const color  = edgeColor(rel);
        const vstyle = edgeVisualStyle(rel.strength, color);
        // Count how many edges share this bundle (for offset calc)
        const bundleSize = progressiveEdgeList.filter(e => e.bundleKey === bundleKey).length;
        const offset = bundleSize > 1 ? (offsets[idx] ?? idx * 70) : 0;
        return {
          id:        `edge-${bundleKey}-${idx}`,
          source:    rel.source,
          target:    rel.target,
          type:      'kg',
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          style:     vstyle,
          data: { label: cleanLabel(rel.label ?? ''), curveOffset: offset, bundleCount: 1, style: vstyle, color },
        };
      });
    }

    // ── Normal mode — show all edges ───────────────────────────────────────
    const allIds  = new Set(normalizedEntities.map(e => e.id));
    const result: Edge[] = [];

    Object.entries(edgeBundles).forEach(([bundleKey, bundleRels]) => {
      const [sA, sB] = bundleKey.split('|');
      if (!allIds.has(sA) || !allIds.has(sB)) return;

      const visibleRels = bundleRels.filter(r => {
        if (activeTypes.size === 0) return true;
        return activeTypes.has(cleanLabel(r.label ?? ''));
      });
      if (!visibleRels.length) return;

      const isExpanded = expandedBundles.has(bundleKey);
      const relsToShow = (isExpanded || visibleRels.length === 1) ? visibleRels : [visibleRels[0]];

      relsToShow.forEach((rel, idx) => {
        const color   = edgeColor(rel);
        const vstyle  = edgeVisualStyle(rel.strength, color);
        const offsets = [-80, 80, -140, 140, 0];
        const offset  = relsToShow.length > 1 ? (offsets[idx] ?? idx * 70) : 0;
        result.push({
          id:        `edge-${bundleKey}-${idx}`,
          source:    rel.source,
          target:    rel.target,
          type:      'kg',
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          style:     vstyle,
          data: {
            label:       cleanLabel(rel.label ?? ''),
            curveOffset: offset,
            bundleCount: isExpanded ? 1 : visibleRels.length,
            style:       vstyle,
            color,
            onExpandBundle: () => setExpandedBundles(prev => {
              const n = new Set(prev);
              n.has(bundleKey) ? n.delete(bundleKey) : n.add(bundleKey);
              return n;
            }),
          },
        });
      });
    });

    return result;
  }, [entities, edgeBundles, activeTypes, expandedBundles,
      hideAllEdges, progressiveNodeId, progressiveEdgeList, progressiveCount]);

  // Fit view on load
  useEffect(() => {
    if (rfInstance.current && rfNodes.length > 0) {
      const t = setTimeout(() => rfInstance.current?.fitView({ padding: 0.18 }), 120);
      return () => clearTimeout(t);
    }
  }, [rfNodes.length]);

  const handleNodeHover = useCallback((id: string | null) => setHoveredNodeId(id), []);

  const handleNodeClick = useCallback((_: any, node: Node) => {
    // Use normalizedEntities so the computed `isRoot` flag is included
    const entity = normalizedEntities.find(e => e.id === node.id);
    const enriched = entity ? { ...entity, isRoot: entity.id === rootId } : null;
    setSelectedEntity(enriched as any);

    if (hideAllEdges) {
      // Clear any in-flight timer and reset count
      if (progressiveTimerRef.current) clearInterval(progressiveTimerRef.current);
      setProgressiveNodeId(node.id);
      setProgressiveCount(0);

      // Count visible edges connected to this node
      const visibleRelCount = normalizedRelations.filter(r =>
        (r.source === node.id || r.target === node.id) &&
        (activeTypes.size === 0 || activeTypes.has(cleanLabel(r.label ?? '')))
      ).length;

      if (visibleRelCount === 0) return;

      let fired = 0;
      progressiveTimerRef.current = setInterval(() => {
        fired++;
        setProgressiveCount(c => c + 1);
        if (fired >= visibleRelCount) {
          clearInterval(progressiveTimerRef.current!);
          progressiveTimerRef.current = null;
        }
      }, 320);
    }
  }, [entities, hideAllEdges, normalizedRelations, activeTypes]);

  const handlePaneClick = useCallback(() => {
    setSelectedEntity(null);
    setHoveredNodeId(null);
    if (hideAllEdges) {
      if (progressiveTimerRef.current) clearInterval(progressiveTimerRef.current);
      setProgressiveNodeId(null);
      setProgressiveCount(0);
    }
  }, [hideAllEdges]);

  const centerOnSelected = useCallback(() => {
    if (!selectedEntity || !rfInstance.current) return;
    const pos = positions[selectedEntity.id];
    if (pos) rfInstance.current.setCenter(pos.x, pos.y, { zoom: 1.2, duration: 500 });
  }, [selectedEntity, positions]);

  // Related nodes for detail panel
  const relatedNodes = useMemo(() => {
    if (!selectedEntity) return [];
    const nbrs = [...(neighbors[selectedEntity.id] ?? [])];
    return nbrs.map(id => entities.find(e => e.id === id)).filter(Boolean) as KGEntity[];
  }, [selectedEntity, neighbors, entities]);

  const entityTypes = useMemo(() => [...new Set(entities.map(e => e.type))], [entities]);

  return (
    <div className="flex flex-col h-[900px] w-full bg-muted/5 rounded-xl border border-border overflow-hidden">
      {/* ── Title + Toolbar ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background/80 backdrop-blur-sm flex-wrap">
        <div className="flex items-center gap-2 mr-1">
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">Knowledge Graph</span>
          <Badge variant="secondary" className="text-xs">{entities.length} nodes · {normalizedRelations.length} edges</Badge>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-[240px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search nodes…"
            className="pl-7 h-7 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Learner / Semantic toggle */}
        {hasRaw && (
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            <button
              onClick={() => setSemanticMode(false)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${!semanticMode ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <GraduationCap className="w-3 h-3" />
              Learner
            </button>
            <button
              onClick={() => setSemanticMode(true)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${semanticMode ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <FlaskConical className="w-3 h-3" />
              Semantic
            </button>
          </div>
        )}

        {/* Filter toggle */}
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs gap-1 px-2"
          onClick={() => setShowFilters(v => !v)}
        >
          <SlidersHorizontal className="w-3 h-3" />
          Filters
          {activeTypes.size > 0 && <Badge className="ml-1 h-4 text-[10px] px-1">{activeTypes.size}</Badge>}
        </Button>

        {/* Hide All Connections */}
        <Button
          variant={hideAllEdges ? 'default' : 'outline'}
          size="sm"
          className={`h-7 text-xs gap-1 px-2 ${hideAllEdges ? 'bg-orange-500 hover:bg-orange-600 border-orange-500 text-white' : ''}`}
          onClick={() => {
            const next = !hideAllEdges;
            setHideAllEdges(next);
            if (!next) {
              if (progressiveTimerRef.current) clearInterval(progressiveTimerRef.current);
              setProgressiveNodeId(null);
              setProgressiveCount(0);
            }
          }}
        >
          {hideAllEdges ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {hideAllEdges ? 'Connections Off' : 'Hide Connections'}
        </Button>

        {/* Legend */}
        <Button
          variant={showLegend ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs gap-1 px-2"
          onClick={() => setShowLegend(v => !v)}
        >
          {showLegend ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Legend
        </Button>

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2"
            onClick={() => rfInstance.current?.fitView({ padding: 0.18, duration: 400 })}>
            <Maximize2 className="w-3 h-3" /> Fit
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2"
            onClick={centerOnSelected} disabled={!selectedEntity}>
            <LocateFixed className="w-3 h-3" /> Center
          </Button>
          <Button
            variant={chatbotEnabled ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs gap-1 px-2"
            onClick={() => setChatbotEnabled((v: boolean) => !v)}
          >
            {chatbotEnabled ? <MessageSquare className="w-3 h-3" /> : <MessageSquareOff className="w-3 h-3" />}
            AI Chat
          </Button>
        </div>
      </div>

      {/* ── Filter chips ─────────────────────────────────────────── */}
      {showFilters && allRelTypes.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground">Edge types:</span>
          <button
            onClick={() => setActiveTypes(new Set())}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${activeTypes.size === 0 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
          >all</button>
          {allRelTypes.map(t => (
            <button key={t}
              onClick={() => setActiveTypes(prev => {
                const n = new Set(prev);
                n.has(t) ? n.delete(t) : n.add(t);
                return n;
              })}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors max-w-[180px] truncate ${activeTypes.has(t) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
            >{t}</button>
          ))}
        </div>
      )}

      {/* ── Progressive-reveal hint strip ───────────────────────── */}
      {hideAllEdges && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-orange-50 dark:bg-orange-950/30 border-b border-orange-200 dark:border-orange-800 text-xs text-orange-700 dark:text-orange-300">
          <EyeOff className="w-3 h-3 flex-shrink-0" />
          {progressiveNodeId
            ? `Revealing connections… ${Math.min(progressiveCount, progressiveEdgeList.length)} / ${progressiveEdgeList.length} — click another node or the background to reset`
            : 'Click any node to progressively reveal its connections one by one'}
        </div>
      )}

      {/* ── Legend ───────────────────────────────────────────────── */}
      {showLegend && (
        <div className="flex items-start gap-6 px-4 py-3 border-b bg-background/60 flex-wrap text-xs">
          <div>
            <p className="font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontSize: 10 }}>Node Types</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(NODE_CFG).map(([type, cfg]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: cfg.bg, border: `2px solid ${cfg.border}` }} />
                  <span className="capitalize">{type}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontSize: 10 }}>Edge Strength</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" stroke="#4f46e5" strokeWidth="2.5" /></svg>
                <span>Strong (≥ 0.7)</span>
              </div>
              <div className="flex items-center gap-2">
                <svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="7 4" /></svg>
                <span>Moderate (0.4–0.7)</span>
              </div>
              <div className="flex items-center gap-2">
                <svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" stroke="#a78bfa" strokeWidth="1" strokeDasharray="2 5" /></svg>
                <span>Weak / inferred (&lt; 0.4)</span>
              </div>
            </div>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontSize: 10 }}>Node Size</p>
            <p className="text-muted-foreground" style={{ maxWidth: 160 }}>Larger nodes have more connections (hub nodes).</p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontSize: 10 }}>ⓘ button</p>
            <p className="text-muted-foreground" style={{ maxWidth: 160 }}>Click to open node details & related nodes.</p>
          </div>
        </div>
      )}

      {/* ── Graph + Panels ───────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ReactFlow wrapper: takes remaining width; detail panel overlays inside */}
        <div className="flex-1 relative min-h-0">
          <div className="absolute inset-0">
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={inst => { rfInstance.current = inst; }}
              onNodeClick={handleNodeClick}
              onNodeDragStop={(_, node) =>
                setDraggedPositions(prev => ({ ...prev, [node.id]: { x: node.position.x, y: node.position.y } }))
              }
              onNodeMouseEnter={(_, node) => handleNodeHover(node.id)}
              onNodeMouseLeave={() => handleNodeHover(null)}
              onPaneClick={handlePaneClick}
              fitView
              minZoom={0.05}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(100,100,100,0.12)" />
              <Controls position="bottom-left" showInteractive={false} />
              <MiniMap
                position="bottom-right"
                nodeColor={n => {
                  const type = (n.data as any)?.type;
                  return NODE_CFG[type]?.map ?? '#94a3b8';
                }}
                maskColor="rgba(255,255,255,0.65)"
                style={{ width: 140, height: 90, border: '1px solid #e2e8f0', borderRadius: 8 }}
              />
            </ReactFlow>
          </div>

          {/* ── Detail Panel — absolute overlay inside the canvas wrapper so the canvas width never changes ── */}
          {selectedEntity && (
            <div className="absolute top-0 right-0 bottom-0 w-[300px] border-l bg-background/98 backdrop-blur-sm flex flex-col animate-in slide-in-from-right duration-250 shadow-xl z-10">
            <div className="flex items-start justify-between gap-2 p-4 border-b">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <span
                    className="inline-block text-[9px] uppercase font-black px-2 py-0.5 rounded text-white"
                    style={{ background: NODE_CFG[selectedEntity.type]?.border ?? '#6366f1' }}
                  >{selectedEntity.type}</span>
                  {(selectedEntity as any).isRoot && (
                    <span className="inline-block text-[9px] uppercase font-black px-2 py-0.5 rounded text-white"
                      style={{ background: '#f59e0b' }}>⭐ Entry Point</span>
                  )}
                  {(selectedEntity as any).readingOrder != null && (
                    <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded border border-border text-muted-foreground">
                      Step {(selectedEntity as any).readingOrder}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-base leading-snug">{selectedEntity.label}</h3>
                {(degree[selectedEntity.id] ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{degree[selectedEntity.id]} connection{degree[selectedEntity.id] !== 1 ? 's' : ''}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSelectedEntity(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedEntity.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {selectedEntity.description}
                </p>
              )}

              {/* Related nodes */}
              {relatedNodes.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Related Nodes
                  </h4>
                  <div className="space-y-1">
                    {relatedNodes.map(rn => {
                      const cfg = NODE_CFG[rn.type] ?? FALLBACK_CFG;
                      // Find the edge label between selected and this node
                      const edgeRel = relations.find(r =>
                        (r.source === selectedEntity.id && r.target === rn.id) ||
                        (r.target === selectedEntity.id && r.source === rn.id)
                      );
                      return (
                        <button
                          key={rn.id}
                          className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/60 transition-colors group"
                          onClick={() => {
                            setSelectedEntity(rn);
                            const pos = positions[rn.id];
                            if (pos && rfInstance.current) {
                              rfInstance.current.setCenter(pos.x, pos.y, { zoom: 1.2, duration: 400 });
                            }
                          }}
                        >
                          <div style={{
                            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                            background: cfg.bg, border: `2px solid ${cfg.border}`,
                          }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium truncate block">{rn.label}</span>
                            {edgeRel?.label && (
                              <span className="text-[10px] text-muted-foreground">{cleanLabel(edgeRel.label)}</span>
                            )}
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Properties */}
              {selectedEntity.properties && Object.keys(selectedEntity.properties).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Properties</h4>
                  <div className="space-y-2">
                    {Object.entries(selectedEntity.properties).map(([k, v]) => (
                      <div key={k} className="bg-muted/40 px-3 py-2 rounded-md">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold block">{k}</span>
                        <span className="text-xs break-words">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>{/* end flex-1 relative — ReactFlow wrapper */}

        {/* ── AI Chatbot Panel ─────────────────────────────────── */}
        {chatbotEnabled && (
          <div className="w-[340px] shrink-0 border-l animate-in slide-in-from-right duration-250">
            <KnowledgeGraphChat recordingId={recordingId} />
          </div>
        )}
      </div>
    </div>
  );
}
