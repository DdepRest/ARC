import { ref } from 'vue';

export function useObjectiveRouteLayout() {
  const containerRef = ref<HTMLDivElement | null>(null);
  const draggingNodeId = ref<string | null>(null);
  let dragFrameId: number | null = null;

  const startDrag = (_event: MouseEvent, nodeId: string) => {
    draggingNodeId.value = nodeId;
  };

  const onDragMove = (event: MouseEvent, currentRouteMap: any) => {
    if (!draggingNodeId.value || !containerRef.value || !currentRouteMap) return;

    if (dragFrameId !== null) {
      cancelAnimationFrame(dragFrameId);
    }

    const clientX = event.clientX;
    const clientY = event.clientY;

    dragFrameId = requestAnimationFrame(() => {
      if (!draggingNodeId.value || !containerRef.value || !currentRouteMap) return;
      const rect = containerRef.value.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const posX = ((clientX - rect.left) / rect.width) * 100;
      const posY = ((clientY - rect.top) / rect.height) * 100;

      // Clamp 5% to 95%
      const clampedX = Math.max(5, Math.min(95, posX));
      const clampedY = Math.max(5, Math.min(95, posY));

      const node = currentRouteMap.nodes?.find((n: any) => n.id === draggingNodeId.value);
      if (node) {
        node.x = clampedX;
        node.y = clampedY;
      }
    });
  };

  const stopDrag = () => {
    draggingNodeId.value = null;
    if (dragFrameId !== null) {
      cancelAnimationFrame(dragFrameId);
      dragFrameId = null;
    }
  };

  const getNodeCoords = (id: string, currentRouteMap: any) => {
    if (!currentRouteMap?.nodes) return null;
    const node = currentRouteMap.nodes.find((n: any) => n.id === id);
    if (!node) return null;
    return { x: node.x || 0, y: node.y || 0 };
  };

  const applyRouteLayout = (nodes: any[], edges: any[]) => {
    const levelNodes: Record<number, string[]> = {};
    const visited: Record<string, boolean> = {};

    const traverse = (nodeId: string, level: number) => {
      if (visited[nodeId]) return;
      visited[nodeId] = true;

      if (!levelNodes[level]) levelNodes[level] = [];
      if (!levelNodes[level].includes(nodeId)) {
        levelNodes[level].push(nodeId);
      }

      const outEdges = edges.filter(e => e.source === nodeId);
      outEdges.forEach(e => traverse(e.target, level + 1));
    };

    const startNodes = nodes.filter(n => !edges.some(e => e.target === n.id)).map(n => n.id);
    startNodes.forEach(id => traverse(id, 0));

    const maxLevel = Math.max(...Object.keys(levelNodes).map(Number), 0);
    const stepX = maxLevel > 0 ? 80 / maxLevel : 0;

    Object.keys(levelNodes).forEach(lvlStr => {
      const lvl = Number(lvlStr);
      const lvlNodeIds = levelNodes[lvl] || [];
      const count = lvlNodeIds.length;
      const posX = 10 + lvl * stepX;

      lvlNodeIds.forEach((id, index) => {
        const node = nodes.find(n => n.id === id);
        if (node) {
          if (node.x === undefined || node.y === undefined) {
            const posY = count > 1 ? 15 + (index * 70) / (count - 1) : 50;
            node.x = posX;
            node.y = posY;
          }
        }
      });
    });
  };

  const cleanupDrag = () => {
    if (dragFrameId !== null) {
      cancelAnimationFrame(dragFrameId);
      dragFrameId = null;
    }
  };

  return {
    containerRef,
    draggingNodeId,
    startDrag,
    onDragMove,
    stopDrag,
    getNodeCoords,
    applyRouteLayout,
    cleanupDrag
  };
}
