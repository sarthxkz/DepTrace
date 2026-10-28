/**
 * The Cytoscape.js adapter. Elements change → relayout; highlight changes only
 * toggle classes, so selecting and hovering stay fast on large graphs.
 */
import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from 'cytoscape';
import { useEffect, useRef, useState } from 'react';
import { useEffectiveTheme } from '../lib/theme';

export interface CanvasNode {
  id: string;
  label: string;
  /** `band`: a text-only label naming a row of the grouped layout. */
  kind: 'module' | 'package' | 'folder' | 'band';
  /** Layer colour slot (0-based), or null for unclassified / no layer. */
  slot: number | null;
  size: number;
  severity: 'error' | 'warning' | null;
  title: string;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  typeOnly: boolean;
  cycle: boolean;
  violation: boolean;
  external: boolean;
  label?: string;
  /** Curve offset for edges between nodes on one row, so they do not run over each other. */
  bend?: number;
}

export type CanvasLayout = 'grouped' | 'hierarchy' | 'force';

export type ViewportRequest =
  { kind: 'fit' } | { kind: 'zoomIn' } | { kind: 'zoomOut' } | { kind: 'center'; id: string };
/** `n` makes a repeated request (e.g. two clicks on "Fit") a new value. */
export type ViewportCommand = ViewportRequest & { n: number };

export interface CanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  layout: CanvasLayout;
  positions: Map<string, { x: number; y: number }> | null;
  highlight: { nodes: Set<string>; edges: Set<string> } | null;
  selected: string | null;
  command: ViewportCommand | null;
  onSelect: (target: { kind: 'node' | 'edge'; id: string } | null) => void;
  label: string;
}

const css = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

function stylesheet(large: boolean): StylesheetJson {
  const layer = (slot: number | null) =>
    slot === null ? css('--layer-none') : css(`--layer-${String(slot + 1)}`);
  return [
    {
      selector: 'node',
      style: {
        width: 'data(size)',
        height: 'data(size)',
        'background-color': (node: cytoscape.NodeSingular) =>
          layer(node.data('slot') as number | null),
        'border-width': 1,
        'border-color': css('--graph-node-ring'),
        label: 'data(label)',
        'font-family': css('--font-mono'),
        'font-size': 13,
        color: css('--ink-2'),
        'text-valign': 'bottom',
        'text-margin-y': 4,
        'text-outline-color': css('--graph-ground'),
        'text-outline-width': 2,
        'min-zoomed-font-size': large ? 10 : 6,
        'transition-property': 'opacity',
        'transition-duration': 150,
      },
    },
    {
      selector: 'node[kind = "package"]',
      style: { shape: 'diamond', 'background-color': css('--graph-package') },
    },
    {
      selector: 'node[kind = "folder"]',
      style: {
        shape: 'round-rectangle',
        'text-valign': 'center',
        'text-margin-y': 0,
        'font-size': 12,
      },
    },
    {
      selector: 'node[kind = "band"]',
      style: {
        shape: 'rectangle',
        'background-opacity': 0,
        'border-width': 0,
        width: 1,
        height: 1,
        'font-family': css('--font-sans'),
        'font-size': 13,
        'font-weight': 650,
        color: css('--ink-2'),
        'text-valign': 'center',
        'text-halign': 'left',
        'text-margin-y': 0,
        'text-outline-width': 0,
        'min-zoomed-font-size': 0,
        events: 'no',
      },
    },
    {
      selector: 'node[severity = "warning"]',
      style: { 'border-width': 3, 'border-color': css('--warning') },
    },
    {
      selector: 'node[severity = "error"]',
      style: { 'border-width': 3, 'border-color': css('--critical') },
    },
    {
      selector: 'edge',
      style: {
        width: 1.25,
        'line-color': css('--graph-edge'),
        'target-arrow-color': css('--graph-edge'),
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': large ? 'straight' : 'bezier',
        // Plain imports recede so cycles and violations read first.
        opacity: 0.6,
        'transition-property': 'opacity',
        'transition-duration': 150,
      },
    },
    {
      selector: 'edge[bend]',
      style: {
        'curve-style': 'unbundled-bezier',
        'control-point-distances': 'data(bend)',
        'control-point-weights': 0.5,
      },
    },
    { selector: 'edge[?typeOnly]', style: { 'line-style': 'dashed', 'line-dash-pattern': [5, 4] } },
    {
      selector: 'edge[?external]',
      style: {
        'line-style': 'dotted',
        'line-color': css('--graph-package'),
        'target-arrow-color': css('--graph-package'),
      },
    },
    {
      selector: 'edge[?cycle]',
      style: {
        width: 2,
        opacity: 1,
        'line-color': css('--cycle'),
        'target-arrow-color': css('--cycle'),
      },
    },
    {
      selector: 'edge[?violation]',
      style: {
        width: 2.5,
        opacity: 1,
        'line-color': css('--critical'),
        'target-arrow-color': css('--critical'),
      },
    },
    {
      selector: 'edge[label]',
      style: {
        label: 'data(label)',
        'font-size': 10,
        color: css('--ink-2'),
        'text-outline-color': css('--graph-ground'),
        'text-outline-width': 2,
      },
    },
    { selector: '.dim', style: { opacity: 0.12 } },
    { selector: 'edge.lit', style: { width: 3, opacity: 1, 'z-index': 10 } },
    { selector: 'node.lit', style: { opacity: 1, 'z-index': 10 } },
    {
      selector: 'node.selected',
      style: {
        'overlay-color': css('--accent'),
        'overlay-opacity': 0.18,
        'overlay-padding': 6,
        'border-width': 3,
        'border-color': css('--accent'),
      },
    },
  ];
}

function layoutOptions(
  layout: CanvasLayout,
  positions: CanvasProps['positions'],
): cytoscape.LayoutOptions {
  if (layout === 'grouped' && positions) {
    return {
      name: 'preset',
      positions: (node: cytoscape.NodeSingular) => positions.get(node.id()) ?? { x: 0, y: 0 },
      fit: true,
      padding: 40,
    } as cytoscape.LayoutOptions;
  }
  if (layout === 'force') {
    return {
      name: 'cose',
      animate: false,
      fit: true,
      padding: 40,
      nodeDimensionsIncludeLabels: true,
    };
  }
  return {
    name: 'breadthfirst',
    directed: true,
    spacingFactor: 1.15,
    fit: true,
    padding: 40,
    avoidOverlap: true,
    animate: false,
  };
}

export function GraphCanvas({
  nodes,
  edges,
  layout,
  positions,
  highlight,
  selected,
  command,
  onSelect,
  label,
}: CanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  // The Cytoscape listeners are registered once; they call the latest callback.
  const handlers = useRef(onSelect);
  useEffect(() => {
    handlers.current = onSelect;
  }, [onSelect]);
  const theme = useEffectiveTheme();
  const [hover, setHover] = useState<{ text: string; x: number; y: number } | null>(null);
  const large = nodes.length > 400 || edges.length > 1500;

  useEffect(() => {
    if (!container.current) return;
    const instance = cytoscape({
      container: container.current,
      minZoom: 0.05,
      maxZoom: 4,
      boxSelectionEnabled: false,
      autounselectify: true,
      textureOnViewport: large,
      hideEdgesOnViewport: large,
      pixelRatio: large ? 1 : 'auto',
    });
    instance.on('tap', 'node', (event) => {
      handlers.current({ kind: 'node', id: (event.target as cytoscape.NodeSingular).id() });
    });
    instance.on('tap', 'edge', (event) => {
      handlers.current({ kind: 'edge', id: (event.target as cytoscape.EdgeSingular).id() });
    });
    instance.on('tap', (event) => {
      if (event.target === instance) handlers.current(null);
    });
    instance.on('mouseover', 'node, edge', (event) => {
      const target = event.target as cytoscape.SingularElementArgument;
      const point = event.renderedPosition;
      setHover({ text: String(target.data('title') ?? ''), x: point.x, y: point.y });
    });
    instance.on('mouseout', 'node, edge', () => {
      setHover(null);
    });
    instance.on('viewport', () => {
      setHover(null);
    });
    cy.current = instance;
    return () => {
      instance.destroy();
      cy.current = null;
    };
  }, [large]);

  // New elements or layout: replace and lay out again.
  useEffect(() => {
    const instance = cy.current;
    if (!instance) return;
    const elements: ElementDefinition[] = [
      ...nodes.map((node) => ({ group: 'nodes' as const, data: { ...node } })),
      ...edges.map((edge) => ({
        group: 'edges' as const,
        data: {
          ...edge,
          title: `${edge.source} → ${edge.target}${edge.typeOnly ? ' (type-only)' : ''}`,
        },
      })),
    ];
    instance.batch(() => {
      instance.elements().remove();
      instance.add(elements);
    });
    instance.style(stylesheet(large));
    instance.layout(layoutOptions(layout, positions)).run();
  }, [nodes, edges, layout, positions, large]);

  useEffect(() => {
    cy.current?.style(stylesheet(large));
  }, [theme, large]);

  useEffect(() => {
    const instance = cy.current;
    if (!instance) return;
    instance.batch(() => {
      instance.elements().removeClass('dim lit selected');
      if (highlight) {
        instance.nodes('[kind != "band"]').forEach((node) => {
          node.addClass(highlight.nodes.has(node.id()) ? 'lit' : 'dim');
        });
        instance.edges().forEach((edge) => {
          edge.addClass(highlight.edges.has(edge.id()) ? 'lit' : 'dim');
        });
      }
      if (selected) instance.getElementById(selected).addClass('selected');
    });
    // nodes and edges: classes are reapplied after the elements are replaced.
  }, [highlight, selected, nodes, edges]);

  useEffect(() => {
    const instance = cy.current;
    if (!instance || !command) return;
    if (command.kind === 'fit') {
      const lit = instance.elements('.lit');
      instance.animate({
        fit: { eles: lit.nonempty() ? lit : instance.elements(), padding: 48 },
        duration: 200,
      });
    } else if (command.kind === 'center') {
      const node = instance.getElementById(command.id);
      if (node.nonempty())
        instance.animate({
          center: { eles: node },
          zoom: Math.max(instance.zoom(), 1),
          duration: 200,
        });
    } else {
      const factor = command.kind === 'zoomIn' ? 1.25 : 0.8;
      instance.zoom({
        level: instance.zoom() * factor,
        renderedPosition: { x: instance.width() / 2, y: instance.height() / 2 },
      });
    }
  }, [command]);

  return (
    <div className="graph-canvas-wrap">
      <div ref={container} className="graph-canvas" role="img" aria-label={label} />
      {hover && hover.text && (
        <div
          className="graph-tooltip"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
          role="tooltip"
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}
