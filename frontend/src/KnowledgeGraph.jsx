import { useEffect, useMemo, useRef, useState } from 'react';

const typeColor = {
  concept: '#1f4b3a',
  topic: '#8a5a12',
  resource: '#3d4f73',
};

const layoutGraph = (nodes, edges) => {
  const placed = nodes.map((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
    const radius = 180 + (index % 5) * 18;
    return {
      ...node,
      x: 360 + Math.cos(angle) * radius,
      y: 280 + Math.sin(angle) * radius,
    };
  });
  const byId = new Map(placed.map((node) => [node.id, node]));

  for (let step = 0; step < 70; step += 1) {
    placed.forEach((node) => {
      let fx = (360 - node.x) * 0.01;
      let fy = (280 - node.y) * 0.01;
      placed.forEach((other) => {
        if (other.id === node.id) return;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const distance = Math.max(Math.hypot(dx, dy), 24);
        const force = 900 / (distance * distance);
        fx += (dx / distance) * force;
        fy += (dy / distance) * force;
      });
      node.x += fx;
      node.y += fy;
    });

    edges.forEach((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) return;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      source.x += dx * 0.02;
      source.y += dy * 0.02;
      target.x -= dx * 0.02;
      target.y -= dy * 0.02;
    });
  }

  return placed;
};

function KnowledgeGraph({ graph, onOpenResource }) {
  const frameRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef(null);

  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const placed = useMemo(() => layoutGraph(nodes, edges), [nodes, edges]);
  const byId = useMemo(() => new Map(placed.map((node) => [node.id, node])), [placed]);
  const selected = byId.get(selectedId) || null;
  const conceptDetail = selected?.type === 'concept'
    ? (graph.concepts || []).find((concept) => concept.name === selected.label)
    : null;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const onWheel = (event) => {
      event.preventDefault();
      const next = event.deltaY > 0 ? 0.9 : 1.1;
      setView((current) => ({
        ...current,
        scale: Math.min(2.4, Math.max(0.45, current.scale * next)),
      }));
    };

    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, []);

  if (!nodes.length) {
    return <p className="empty-note">Process a resource to build the knowledge map.</p>;
  }

  return (
    <div className="graph-layout">
      <div
        className="graph-frame"
        ref={frameRef}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget && event.target.tagName !== 'svg') return;
          dragRef.current = { x: event.clientX, y: event.clientY, view };
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          const dx = event.clientX - dragRef.current.x;
          const dy = event.clientY - dragRef.current.y;
          setView({
            ...dragRef.current.view,
            x: dragRef.current.view.x + dx,
            y: dragRef.current.view.y + dy,
          });
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerLeave={() => { dragRef.current = null; }}
      >
        <svg viewBox="0 0 720 560" role="img" aria-label="Knowledge graph">
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {edges.map((edge) => {
              const source = byId.get(edge.source);
              const target = byId.get(edge.target);
              if (!source || !target) return null;
              return (
                <line
                  key={edge.id || `${edge.source}-${edge.target}-${edge.type}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  className={`graph-edge edge-${edge.type || 'related'}`}
                />
              );
            })}
            {placed.map((node) => (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                className="graph-node"
                onClick={() => setSelectedId(node.id)}
              >
                <circle r={node.type === 'resource' ? 7 : 11} fill={typeColor[node.type] || '#333'} />
                <text x="14" y="4">{String(node.label || '').slice(0, 22)}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <aside className="graph-detail">
        {selected ? (
          <>
            <p className="eyebrow">{selected.type}</p>
            <h3>{selected.label}</h3>
            {selected.band && <p className="hint">{selected.band} · coverage {selected.coverageScore}</p>}
            {conceptDetail && (
              <>
                <p>Related: {conceptDetail.related.length ? conceptDetail.related.join(', ') : 'none yet'}.</p>
                <div className="list-stack">
                  {conceptDetail.resources.map((resource) => (
                    <button key={resource.id} type="button" className="text-button" onClick={() => onOpenResource(resource.id)}>
                      {resource.title}
                    </button>
                  ))}
                </div>
              </>
            )}
            {selected.type === 'resource' && (
              <button type="button" className="text-button" onClick={() => onOpenResource(String(selected.id).replace('resource:', ''))}>
                Open resource
              </button>
            )}
          </>
        ) : (
          <p className="empty-note">Select a node to see its connections. Drag to pan. Scroll to zoom.</p>
        )}
      </aside>
    </div>
  );
}

export default KnowledgeGraph;
