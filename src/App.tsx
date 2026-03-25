/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, Panel, Node, Edge, useReactFlow, getNodesBounds, getViewportForBounds } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Download, Code2, Undo2, Redo2, LayoutTemplate } from 'lucide-react';
import { toPng, toSvg } from 'html-to-image';
import { parseToAST } from './lib/parser';
import { astToGraph } from './lib/graph';
import { StartNode, EndNode, ProcessNode, DecisionNode, IONode, LoopNode } from './components/nodes';
import { CustomEdge } from './components/edges';

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  process: ProcessNode,
  decision: DecisionNode,
  io: IONode,
  loop: LoopNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

function ExportButtons() {
  const { getNodes } = useReactFlow();

  const downloadImage = async (format: 'png' | 'svg') => {
    const nodes = getNodes();
    if (nodes.length === 0) return;

    const nodesBounds = getNodesBounds(nodes);
    const padding = 50;
    const width = Math.ceil(nodesBounds.width) + padding * 2;
    const height = Math.ceil(nodesBounds.height) + padding * 2;

    const viewportElement = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!viewportElement) return;

    const viewport = getViewportForBounds(
      nodesBounds,
      width,
      height,
      0.5,
      2,
      padding
    );

    const options = {
      backgroundColor: '#f8fafc',
      width,
      height,
      pixelRatio: 3, // Збільшуємо роздільну здатність у 3 рази для високої якості
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    };

    try {
      const dataUrl = format === 'png' 
        ? await toPng(viewportElement, options)
        : await toSvg(viewportElement, options);
        
      const a = document.createElement('a');
      a.setAttribute('download', `flowchart.${format}`);
      a.setAttribute('href', dataUrl);
      a.click();
    } catch (err) {
      console.error('Export error:', err);
      alert('Помилка експорту. Спробуйте ще раз.');
    }
  };

  return (
    <div className="flex gap-2">
      <button 
        onClick={() => downloadImage('png')}
        className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 font-medium rounded-lg shadow-md hover:bg-slate-50 hover:text-slate-900 transition-colors border border-slate-200"
        title="Завантажити як PNG"
      >
        <Download className="w-4 h-4" />
        <span>PNG</span>
      </button>
      <button 
        onClick={() => downloadImage('svg')}
        className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 font-medium rounded-lg shadow-md hover:bg-slate-50 hover:text-slate-900 transition-colors border border-slate-200"
        title="Завантажити як SVG"
      >
        <Download className="w-4 h-4" />
        <span>SVG</span>
      </button>
    </div>
  );
}

const defaultCode = `#include <iostream>
#include <cmath>

using namespace std;

int main() {
    double x, y, a, b, t;
    cout << "Введіть параметри: x, y, a, b, t: ";
    cin >> x >> y >> a >> b >> t;

    double part1 = x * sin(a * t);
    double part2 = y * sin(b * t);
    double sum = part1 + part2;
    double diff = part2 - part1;

    double numerator;
    if (sum < 0) {
        numerator = -pow(-sum, 1.0 / 5.0);
    } else {
        numerator = pow(sum, 1.0 / 5.0);
    }

    double denominator;
    if (diff < 0) {
        denominator = -pow(-diff, 1.0 / 5.0);
    } else {
        denominator = pow(diff, 1.0 / 5.0);
    }

    if (denominator == 0) {
        cout << "Помилка: ділення на нуль!";
    } else {
        double z = numerator / denominator;
        cout << "Результат z = " << z;
    }

    double A[5] = {2.5, -1.2, 0.5, 3.3, -4.1};
    double maxNeg = 0;
    
    for (int i = 0; i < 5; i++) {
        if (A[i] < 0) {
            if (maxNeg == 0) {
                maxNeg = A[i];
            } else if (A[i] > maxNeg) {
                maxNeg = A[i];
            }
        }
    }

    cout << "Найбільший від'ємний елемент: " << maxNeg;
    return 0;
}`;

export default function App() {
  const [code, setCode] = useState(defaultCode);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState<string | null>(null);
  const [layoutTrigger, setLayoutTrigger] = useState(0);
  const [forceLayout, setForceLayout] = useState(false);

  const [past, setPast] = useState<{nodes: Node[], edges: Edge[]}[]>([]);
  const [future, setFuture] = useState<{nodes: Node[], edges: Edge[]}[]>([]);

  const nodePrefsRef = useRef<Record<string, boolean>>({});
  const edgeOffsetsRef = useRef<Record<string, {x: number, y: number}>>({});

  const saveHistory = useCallback(() => {
    setPast((p) => [...p, { nodes, edges }]);
    setFuture([]);
  }, [nodes, edges]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [{ nodes, edges }, ...f]);
    setNodes(previous.nodes);
    setEdges(previous.edges);
  }, [past, nodes, edges, setNodes, setEdges]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, { nodes, edges }]);
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [future, nodes, edges, setNodes, setEdges]);

  const handleToggleDirection = useCallback((id: string) => {
    saveHistory();
    nodePrefsRef.current[id] = !nodePrefsRef.current[id];
    setLayoutTrigger(prev => prev + 1);
  }, [saveHistory]);

  const handleEdgeOffsetChange = useCallback((id: string, offset: {x: number, y: number}) => {
    edgeOffsetsRef.current[id] = offset;
  }, []);

  const generateFlowchart = useCallback(() => {
    try {
      setError(null);
      const ast = parseToAST(code);
      const { nodes: layoutedNodes, edges: layoutedEdges } = astToGraph(
        ast,
        nodePrefsRef.current,
        handleToggleDirection,
        edgeOffsetsRef.current,
        handleEdgeOffsetChange
      );
      
      setNodes((currentNodes) => {
        if (forceLayout) return layoutedNodes;
        
        const positionMap = new Map(currentNodes.map(n => [n.id, n.position]));
        return layoutedNodes.map(node => {
          if (positionMap.has(node.id)) {
            return { ...node, position: positionMap.get(node.id)! };
          }
          return node;
        });
      });
      setEdges(layoutedEdges);
      setForceLayout(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Помилка парсингу коду');
    }
  }, [code, setNodes, setEdges, handleToggleDirection, handleEdgeOffsetChange, forceLayout]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      generateFlowchart();
    }, 500);
    return () => clearTimeout(timeout);
  }, [code, layoutTrigger, generateFlowchart]);

  const handleAutoLayout = () => {
    saveHistory();
    setForceLayout(true);
    setLayoutTrigger(prev => prev + 1);
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar Editor */}
      <div className="w-[400px] flex-shrink-0 flex flex-col border-r border-slate-200 bg-slate-900 shadow-xl z-10">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2 text-slate-200 font-semibold">
            <Code2 className="w-5 h-5 text-emerald-400" />
            <span>C++ Редактор</span>
          </div>
          <div className="flex items-center gap-2">
            {error ? (
              <span className="text-xs text-red-400 font-medium px-2 py-1 bg-red-400/10 rounded">Помилка</span>
            ) : (
              <span className="text-xs text-emerald-400 font-medium px-2 py-1 bg-emerald-400/10 rounded">Оновлено</span>
            )}
          </div>
        </div>
        <textarea
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setForceLayout(true); // Auto-layout when code changes
          }}
          className="flex-1 w-full p-4 bg-transparent text-slate-300 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-0"
          spellCheck={false}
        />
      </div>

      {/* Flowchart Canvas */}
      <div className="flex-1 relative h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={saveHistory}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          className="bg-slate-50"
          minZoom={0.1}
        >
          <Background color="#cbd5e1" gap={24} size={1.5} />
          <Controls className="bg-white shadow-md border-none rounded-lg overflow-hidden" />
          <MiniMap 
            className="bg-white shadow-md rounded-lg border-none" 
            nodeColor={(n) => {
              if (n.type === 'start' || n.type === 'end') return '#10b981';
              if (n.type === 'decision') return '#ef4444';
              if (n.type === 'io') return '#f59e0b';
              if (n.type === 'loop') return '#d946ef';
              return '#3b82f6';
            }}
          />
          <Panel position="top-right" className="m-4 flex gap-2">
            <button 
              onClick={undo}
              disabled={past.length === 0}
              className="flex items-center justify-center w-10 h-10 bg-white text-slate-700 rounded-lg shadow-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-200"
              title="Скасувати (Undo)"
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button 
              onClick={redo}
              disabled={future.length === 0}
              className="flex items-center justify-center w-10 h-10 bg-white text-slate-700 rounded-lg shadow-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-200"
              title="Повторити (Redo)"
            >
              <Redo2 className="w-5 h-5" />
            </button>
            <div className="w-px h-10 bg-slate-300 mx-1"></div>
            <button 
              onClick={handleAutoLayout}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 font-medium rounded-lg shadow-md hover:bg-slate-50 hover:text-slate-900 transition-colors border border-slate-200"
              title="Автоматично вирівняти всі блоки"
            >
              <LayoutTemplate className="w-4 h-4" />
              <span>Вирівняти</span>
            </button>
            <ExportButtons />
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}
