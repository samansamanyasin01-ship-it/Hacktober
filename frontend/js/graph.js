/**
 * CaseBoard AI - Interactive Evidence Link Graph
 * Renders an animated force-directed node-link network of People, Documents, Facts, and Contradictions.
 */

class EvidenceGraph {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.nodes = [];
    this.edges = [];
    this.hoveredNode = null;
    this.draggedNode = null;
    this.animationFrame = null;
    this.dpr = window.devicePixelRatio || 1;

    this.initEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : { width: 0, height: 0 };
    this.width = rect.width > 0 ? rect.width : (window.innerWidth ? Math.min(window.innerWidth - 60, 1100) : 800);
    this.height = rect.height > 0 ? rect.height : Math.max(550, window.innerHeight - 250);
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(this.dpr, this.dpr);
  }

  loadData(caseData) {
    if (!caseData) return;
    this.resize();
    this.nodes = [];
    this.edges = [];

    const nodeMap = new Map();

    // 1. People Nodes
    (caseData.people || []).forEach((p, idx) => {
      const node = {
        id: `person-${p.id}`,
        label: p.display_alias || p.name,
        type: 'person',
        role: p.role,
        color: p.role === 'victim' ? '#F59E0B' : (p.role === 'suspect' ? '#EF4444' : '#3B82F6'),
        radius: 16,
        x: this.width * 0.15 + (idx * 60) % 200,
        y: 100 + idx * 75,
        vx: 0,
        vy: 0
      };
      this.nodes.push(node);
      nodeMap.set(p.id, node);
    });

    // 2. Document Nodes
    (caseData.documents || []).forEach((d, idx) => {
      const node = {
        id: `doc-${d.id}`,
        label: d.title.length > 22 ? d.title.substring(0, 20) + '...' : d.title,
        fullTitle: d.title,
        type: 'document',
        docType: d.type,
        color: d.type === 'cctv' ? '#8B5CF6' : (d.type === 'phone log' ? '#10B981' : '#64748B'),
        radius: 13,
        x: this.width * 0.45 + (idx % 2 ? 40 : -40),
        y: 80 + idx * 60,
        vx: 0,
        vy: 0
      };
      this.nodes.push(node);
      nodeMap.set(d.id, node);

      if (d.person_id && nodeMap.has(d.person_id)) {
        this.edges.push({
          source: nodeMap.get(d.person_id),
          target: node,
          color: '#374151',
          width: 1.5
        });
      }
    });

    // 3. Contradiction Nodes (Red alert nodes linking conflicting facts)
    (caseData.contradictions || []).forEach((c, idx) => {
      const node = {
        id: `contra-${c.id}`,
        label: `ALERT #${idx + 1}`,
        explanation: c.explanation,
        type: 'contradiction',
        color: '#EF4444',
        radius: 18,
        x: this.width * 0.8,
        y: 110 + idx * 105,
        vx: 0,
        vy: 0,
        pulse: true
      };
      this.nodes.push(node);

      // Find documents for facts A and B
      const factA = (caseData.facts || []).find(f => f.id === c.fact_a_id);
      const factB = (caseData.facts || []).find(f => f.id === c.fact_b_id);

      if (factA && nodeMap.has(factA.document_id)) {
        this.edges.push({
          source: nodeMap.get(factA.document_id),
          target: node,
          color: 'rgba(239, 68, 68, 0.65)',
          width: 2.5,
          dashed: true
        });
      }
      if (factB && nodeMap.has(factB.document_id)) {
        this.edges.push({
          source: nodeMap.get(factB.document_id),
          target: node,
          color: 'rgba(239, 68, 68, 0.65)',
          width: 2.5,
          dashed: true
        });
      }
    });

    this.startSimulation();
  }

  startSimulation() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);

    const step = () => {
      this.updatePhysics();
      this.render();
      this.animationFrame = requestAnimationFrame(step);
    };
    step();
  }

  updatePhysics() {
    // Basic force-directed simulation
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const na = this.nodes[i];
        const nb = this.nodes[j];
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 140) {
          const force = (140 - dist) / 140 * 0.8;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (na !== this.draggedNode) { na.vx -= fx; na.vy -= fy; }
          if (nb !== this.draggedNode) { nb.vx += fx; nb.vy += fy; }
        }
      }
    }

    // Spring forces on edges
    this.edges.forEach(e => {
      const dx = e.target.x - e.source.x;
      const dy = e.target.y - e.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetDist = 130;
      const force = (dist - targetDist) * 0.005;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (e.source !== this.draggedNode) { e.source.vx += fx; e.source.vy += fy; }
      if (e.target !== this.draggedNode) { e.target.vx -= fx; e.target.vy -= fy; }
    });

    // Update positions & friction
    this.nodes.forEach(n => {
      if (n === this.draggedNode) return;
      n.vx *= 0.88;
      n.vy *= 0.88;
      n.x += n.vx;
      n.y += n.vy;

      // Keep within bounds
      n.x = Math.max(n.radius + 10, Math.min(this.width - n.radius - 10, n.x));
      n.y = Math.max(n.radius + 10, Math.min(this.height - n.radius - 10, n.y));
    });
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw Edges
    this.edges.forEach(e => {
      this.ctx.beginPath();
      this.ctx.strokeStyle = e.color || '#374151';
      this.ctx.lineWidth = e.width || 1.5;
      if (e.dashed) {
        this.ctx.setLineDash([4, 4]);
      } else {
        this.ctx.setLineDash([]);
      }
      this.ctx.moveTo(e.source.x, e.source.y);
      this.ctx.lineTo(e.target.x, e.target.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    });

    // Draw Nodes
    const now = Date.now() / 400;
    this.nodes.forEach(n => {
      // Draw pulse glow for contradiction alerts
      if (n.pulse) {
        const glowRadius = n.radius + 4 + Math.sin(now) * 3;
        this.ctx.beginPath();
        this.ctx.arc(n.x, n.y, glowRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        this.ctx.fill();
      }

      this.ctx.beginPath();
      this.ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = n.color;
      this.ctx.fill();
      this.ctx.lineWidth = n === this.hoveredNode ? 3 : 1.5;
      this.ctx.strokeStyle = n === this.hoveredNode ? '#FFFFFF' : '#1F2937';
      this.ctx.stroke();

      // Node Label
      this.ctx.fillStyle = '#E5E7EB';
      this.ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(n.label, n.x, n.y + n.radius + 14);
    });

    // Draw Hover Tooltip
    if (this.hoveredNode) {
      const n = this.hoveredNode;
      const text = n.explanation || n.fullTitle || n.label;
      this.ctx.font = '11px sans-serif';
      const textWidth = this.ctx.measureText(text).width;
      const boxWidth = Math.min(320, textWidth + 24);
      const boxX = Math.min(this.width - boxWidth - 10, Math.max(10, n.x - boxWidth / 2));
      const boxY = Math.max(10, n.y - n.radius - 34);

      this.ctx.fillStyle = '#111827';
      this.ctx.strokeStyle = '#4B5563';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(boxX, boxY, boxWidth, 26, 4);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = '#F9FAFB';
      this.ctx.textAlign = 'left';
      const displayText = text.length > 45 ? text.substring(0, 42) + '...' : text;
      this.ctx.fillText(displayText, boxX + 8, boxY + 17);
    }
  }

  initEvents() {
    if (!this.canvas) return;

    const getPos = e => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    this.canvas.addEventListener('mousemove', e => {
      const pos = getPos(e);
      if (this.draggedNode) {
        this.draggedNode.x = pos.x;
        this.draggedNode.y = pos.y;
        return;
      }

      this.hoveredNode = null;
      for (const n of this.nodes) {
        const dx = pos.x - n.x;
        const dy = pos.y - n.y;
        if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 4) {
          this.hoveredNode = n;
          break;
        }
      }
      this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'default';
    });

    this.canvas.addEventListener('mousedown', e => {
      const pos = getPos(e);
      for (const n of this.nodes) {
        const dx = pos.x - n.x;
        const dy = pos.y - n.y;
        if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 4) {
          this.draggedNode = n;
          break;
        }
      }
    });

    window.addEventListener('mouseup', () => {
      this.draggedNode = null;
    });
  }
}
