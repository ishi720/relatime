'use client';
// 図の描画: グループの四角 → 関係の線 → グループ名の札 → 人物 の順に重ねる
import { memo, useMemo } from 'react';
import { NODE_COLOR, R, statusLabel, statusOf } from '@/lib/constants';
import { edgeGeometry, pairIndex } from '@/lib/edgeGeometry';
import { groupBoxes, type GroupBox } from '@/lib/model';
import type { Edge, Group, Pos, VNode } from '@/lib/types';
import { initial, textW, tint } from '@/lib/util';

const halo = { paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 4, strokeLinejoin: 'round' } as const;

const NodeView = memo(function NodeView({ n, idx, selected, from, hit, connecting }: { n: VNode; idx: number; selected: boolean; from: boolean; hit: boolean; connecting: boolean }) {
  const c = NODE_COLOR;
  const st = statusOf(n.status), label = statusLabel(n.status, n.statusText), bw = textW(label, 11) + 14;
  return (
    <g data-kind="node" data-id={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: connecting ? 'crosshair' : 'move' }}>
      {hit && !selected && <circle r={R + 8} fill="none" stroke="#F5B700" strokeWidth={4} opacity={0.9} />}
      {(selected || from) && <circle r={R + 7} fill="none" stroke={from ? '#E89B2D' : '#3D6BE0'} strokeWidth={3} strokeDasharray={from ? '5 4' : undefined} />}
      <g opacity={n.gray ? 0.45 : undefined}>
        {n.img ? (
          <>
            <clipPath id={`cp${idx}`}><circle r={R} /></clipPath>
            <circle r={R} fill="#ffffff" />
            <image href={n.img} x={-R} y={-R} width={R * 2} height={R * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#cp${idx})`} filter={n.gray ? 'url(#fGray)' : undefined} />
            <circle r={R} fill="none" stroke={c} strokeWidth={2.5} />
          </>
        ) : (
          <>
            <circle r={R} fill="#ffffff" stroke={c} strokeWidth={2.5} />
            <text fontSize={22} fontWeight={700} fill={c} textAnchor="middle" dominantBaseline="central">{initial(n.name)}</text>
          </>
        )}
        <text y={R + 21} fontSize={14} fontWeight={700} fill="#1f2430" textAnchor="middle" {...halo}>{n.name}</text>
        {n.sub && <text y={R + 39} fontSize={11.5} fill="#6b7280" textAnchor="middle" {...halo}>{n.sub}</text>}
      </g>
      {st.k && (
        <>
          <rect x={-bw / 2} y={-R - 13} width={bw} height={19} rx={9.5} fill={st.color} stroke="#ffffff" strokeWidth={2} />
          <text y={-R - 3.5} fontSize={11} fontWeight={700} fill="#ffffff" textAnchor="middle" dominantBaseline="central">{label}</text>
        </>
      )}
    </g>
  );
});

function EdgeView({ e, a, b, i, count, selected }: { e: Edge; a: VNode; b: VNode; i: number; count: number; selected: boolean }) {
  const g = edgeGeometry(e, a, b, i, count);
  const col = e.color;
  const w = textW(e.label, 12.5) + 20;
  return (
    <g data-kind="edge" data-id={e.id} style={{ cursor: 'pointer' }}>
      {selected && <path d={g.d} fill="none" stroke={col} strokeOpacity={0.2} strokeWidth={13} strokeLinecap="round" />}
      <path d={g.d} fill="none" stroke="rgba(0,0,0,0)" strokeWidth={18} />
      <path d={g.d} fill="none" stroke={col} strokeWidth={selected ? 3.4 : 2.4} strokeLinecap="round" strokeDasharray={e.style === 'dashed' ? '7 6' : undefined} />
      {g.arrows.map((d, k) => <path key={k} d={d} fill={col} />)}
      {g.label && (
        <>
          <rect x={g.label.x - w / 2} y={g.label.y - 12} width={w} height={24} rx={12} fill="#ffffff" stroke={col} strokeWidth={selected ? 2.2 : 1.4} />
          <text x={g.label.x} y={g.label.y} fontSize={12.5} fontWeight={500} fill={col} textAnchor="middle" dominantBaseline="central">{e.label}</text>
        </>
      )}
    </g>
  );
}

function GroupRect({ b }: { b: GroupBox }) {
  return <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={18} fill={tint(b.g.color, 0.9)} fillOpacity={0.55} stroke={b.g.color} strokeWidth={2} />;
}
function GroupTab({ b }: { b: GroupBox }) {
  const name = b.g.name || '(無題)', tw = textW(name, 12.5) + 24;
  return (
    <g data-kind="group" data-id={b.g.id} style={{ cursor: 'move' }}>
      <rect x={b.x + 14} y={b.y + 12} width={tw} height={24} rx={8} fill={b.g.color} />
      <text x={b.x + 14 + tw / 2} y={b.y + 24} fontSize={12.5} fontWeight={700} fill="#ffffff" textAnchor="middle" dominantBaseline="central">{name}</text>
    </g>
  );
}

type Props = {
  nodes: VNode[];
  byId: Map<string, VNode>;
  edges: Edge[];
  groups: Group[];
  selNode: string | null;
  selEdge: string | null;
  connectFrom: string | null;
  connecting: boolean;
  hits: Set<string>;
  tmpTo: Pos | null;
};

export default function GraphLayers({ nodes, byId, edges, groups, selNode, selEdge, connectFrom, connecting, hits, tmpTo }: Props) {
  const boxes = useMemo(() => groupBoxes(nodes, groups), [nodes, groups]);
  const pi = useMemo(() => pairIndex(edges), [edges]);
  const fromNode = connectFrom ? byId.get(connectFrom) : undefined;
  return (
    <>
      <g id="gG">{boxes.map((b) => <GroupRect key={b.g.id} b={b} />)}</g>
      <g id="gTmp">{fromNode && tmpTo && <line x1={fromNode.x} y1={fromNode.y} x2={tmpTo.x} y2={tmpTo.y} stroke="#E89B2D" strokeWidth={2.4} strokeDasharray="6 5" />}</g>
      <g id="gE">
        {edges.map((e) => {
          const a = byId.get(e.from), b = byId.get(e.to), [i, count] = pi.get(e.id) || [0, 1];
          return a && b ? <EdgeView key={e.id} e={e} a={a} b={b} i={i} count={count} selected={selEdge === e.id} /> : null;
        })}
      </g>
      <g id="gGL">{boxes.map((b) => <GroupTab key={b.g.id} b={b} />)}</g>
      <g id="gN">
        {nodes.map((n, idx) => (
          <NodeView key={n.id} n={n} idx={idx} selected={selNode === n.id} from={connectFrom === n.id} hit={hits.has(n.id)} connecting={connecting} />
        ))}
      </g>
    </>
  );
}
