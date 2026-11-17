'use client';
import { useEditor, useViewData } from '@/store/editor';
import AllPanel from './AllPanel';
import EdgePanel from './EdgePanel';
import NodePanel from './NodePanel';
import SheetPanel from './SheetPanel';

export default function Panel() {
  const sel = useEditor((s) => s.sel);
  const allMode = useEditor((s) => s.allMode);
  const vd = useViewData();
  let body: React.ReactNode;
  if (allMode) body = <AllPanel />;
  else if (sel?.type === 'node' && vd.byId.has(sel.id)) body = <NodePanel key={sel.id} n={vd.byId.get(sel.id)!} />;
  else if (sel?.type === 'edge' && vd.edges.some((e) => e.id === sel.id)) body = <EdgePanel key={sel.id} e={vd.edges.find((e) => e.id === sel.id)!} />;
  else body = <SheetPanel />;
  return <aside id="panel">{body}</aside>;
}
