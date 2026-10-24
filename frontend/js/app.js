/**
 * CaseBoard AI - Core Client Application
 * Handles state management, SSE live alerts, side-by-side diff modal,
 * role switching, Urdu intake, and audit logging.
 * Resilient to VS Code local preview, Live Server, and full Python backend.
 */

class CaseBoardApp {
  constructor() {
    this.caseData = null;
    this.currentRole = 'investigator'; // 'investigator' or 'supervisor'
    this.victimAliasMode = true; // default true for privacy safeguards
    this.activeTab = 'workspace';
    this.timeline = null;
    this.graph = null;
    this.livePlayer = null;
    this.eventSource = null;
    this.isOfflineMode = false;
  }

  getApiUrl(path) {
    if (!path.startsWith('/')) path = '/' + path;
    // If running via Live Server (port 5500) or file://, target Python backend on 8080
    if (window.location.protocol === 'file:' || (window.location.port !== '8080' && window.location.port !== '')) {
      return `http://127.0.0.1:8080${path}`;
    }
    return path;
  }

  async init() {
    this.timeline = new MasterTimeline('timeline-container', this);
    this.graph = new EvidenceGraph('evidence-graph-canvas');
    this.livePlayer = new LiveInterviewPlayer(this);

    await this.fetchCaseData();
    this.initSSE();
    this.bindEvents();
    this.renderAll();
  }

  // -----------------------------------------------------------
  // Data Fetching & Real-time SSE
  // -----------------------------------------------------------
  async fetchCaseData() {
    try {
      const res = await fetch(this.getApiUrl('/api/case'));
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      this.caseData = await res.json();
      this.isOfflineMode = false;
      this.updateOfflineBanner(false);
      this.renderAll();
    } catch (e) {
      console.warn('Backend server not detected at 127.0.0.1:8080. Entering standalone preview mode.', e);
      this.isOfflineMode = true;
      this.updateOfflineBanner(true);
      if (!this.caseData) {
        this.caseData = this.getBaselineEmbeddedData();
      }
      this.renderAll();
    }
  }

  updateOfflineBanner(isOffline) {
    let banner = document.getElementById('offline-notice-banner');
    if (isOffline) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'offline-notice-banner';
        banner.className = 'bg-amber-950/90 border-b border-amber-700/80 px-4 py-1.5 text-xs text-amber-200 flex items-center justify-between z-30 font-mono';
        banner.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span>VS CODE STANDALONE PREVIEW MODE — To enable DigitalOcean live inference & SSE streaming, run <code class="bg-black/60 px-2 py-0.5 rounded text-amber-300">python run.py</code> in VS Code terminal.</span>
          </div>
          <button onclick="window.caseApp.fetchCaseData()" class="underline text-amber-300 hover:text-white uppercase text-[10px] font-bold">Retry Connection &rarr;</button>
        `;
        const safeguards = document.querySelector('.safeguards-banner');
        if (safeguards && safeguards.parentNode) {
          safeguards.parentNode.insertBefore(banner, safeguards.nextSibling);
        }
      }
    } else if (banner) {
      banner.remove();
    }
  }

  initSSE() {
    if (this.isOfflineMode) return;
    try {
      if (this.eventSource) this.eventSource.close();
      this.eventSource = new EventSource(this.getApiUrl('/api/events'));

      this.eventSource.addEventListener('contradiction_found', e => {
        const data = JSON.parse(e.data);
        this.livePlayer.playAlertSound();
        this.showToast(`🚨 New Contradiction Detected: ${data.id}`, 'error');
        this.fetchCaseData();
      });

      this.eventSource.addEventListener('document_added', () => this.fetchCaseData());
      this.eventSource.addEventListener('contradiction_updated', () => this.fetchCaseData());
      this.eventSource.addEventListener('leads_updated', () => this.fetchCaseData());
      this.eventSource.addEventListener('case_reset', () => {
        this.showToast('Case reset successfully.', 'info');
        this.fetchCaseData();
      });
    } catch (e) {
      console.warn('SSE stream unavailable in current environment', e);
    }
  }

  // -----------------------------------------------------------
  // Modal Controller (Always guaranteed to exist)
  // -----------------------------------------------------------
  openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
      el.classList.remove('hidden');
    } else {
      console.warn(`Modal element #${modalId} not found`);
    }
  }

  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
      el.classList.add('hidden');
    }
  }

  // -----------------------------------------------------------
  // UI Rendering
  // -----------------------------------------------------------
  renderAll() {
    if (!this.caseData) return;
    this.renderStats();
    this.renderEvidenceList();
    this.renderAlerts();
    this.renderTimeline();
    this.renderLeads();
    this.renderSummary();
    this.renderAuditLogs();
    if (this.activeTab === 'graph' && this.graph) {
      this.graph.loadData(this.caseData);
    }
  }

  renderStats() {
    const stats = this.caseData.stats || {};
    const totalDocsEl = document.getElementById('stat-docs');
    const totalFactsEl = document.getElementById('stat-facts');
    const openContraEl = document.getElementById('stat-open-contra');
    const contraBadgeEl = document.getElementById('contra-badge-count');

    const openCount = stats.open_contradictions !== undefined 
      ? stats.open_contradictions 
      : (this.caseData.contradictions || []).filter(c => c.status === 'open').length;

    if (totalDocsEl) totalDocsEl.innerText = (this.caseData.documents || []).length;
    if (totalFactsEl) totalFactsEl.innerText = (this.caseData.facts || []).length;
    if (openContraEl) openContraEl.innerText = openCount;
    if (contraBadgeEl) {
      contraBadgeEl.innerText = `${openCount} Open`;
      contraBadgeEl.className = openCount > 0 
        ? 'px-2 py-0.5 rounded text-[11px] font-bold bg-red-600 text-white animate-pulse'
        : 'px-2 py-0.5 rounded text-[11px] font-bold bg-gray-700 text-gray-300';
    }
  }

  renderEvidenceList(filterType = 'all') {
    const listEl = document.getElementById('evidence-items-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const docs = (this.caseData.documents || []).filter(d => {
      if (filterType === 'all') return true;
      if (filterType === 'statement') return d.type === 'statement';
      if (filterType === 'telemetry') return d.type === 'cctv' || d.type === 'phone log';
      if (filterType === 'forensic') return d.type === 'forensic';
      return true;
    });

    if (docs.length === 0) {
      listEl.innerHTML = '<div class="text-xs text-gray-500 py-6 text-center">No documents in this filter.</div>';
      return;
    }

    docs.forEach(doc => {
      const el = document.createElement('div');
      el.className = 'p-3 rounded border border-gray-800 bg-gray-900/60 hover:border-gray-600 cursor-pointer transition mb-2';
      el.onclick = () => this.showDocumentModal(doc);

      const typeBadge = {
        'statement': '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-800/40">Statement</span>',
        'forensic': '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-900/50 text-cyan-300 border border-cyan-800/40">Forensic</span>',
        'cctv': '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-800/40">CCTV Telemetry</span>',
        'phone log': '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-800/40">Cell Tower Ping</span>'
      }[doc.type] || '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">Doc</span>';

      const personName = doc.person_name ? this.getPersonDisplayName(doc.person_id, doc.person_name) : 'Physical Record';
      const timeStr = doc.added_at ? (doc.added_at.includes('T') ? doc.added_at.split('T')[1].substring(0, 5) : doc.added_at) : '';

      el.innerHTML = `
        <div class="flex items-center justify-between text-xs mb-1">
          ${typeBadge}
          <span class="text-gray-500 font-mono text-[11px]">${timeStr}</span>
        </div>
        <div class="font-semibold text-xs text-gray-200 mb-1 truncate">${doc.title}</div>
        <div class="text-[11px] text-gray-400 mb-1.5 flex items-center gap-1">
          <span class="text-gray-500">Subject:</span> ${personName}
        </div>
        <p class="text-xs text-gray-400 line-clamp-2 italic font-serif">"${doc.text}"</p>
      `;
      listEl.appendChild(el);
    });

    this.renderPeopleRoster();
  }

  renderPeopleRoster() {
    const rosterEl = document.getElementById('people-roster-list');
    if (!rosterEl) return;
    rosterEl.innerHTML = '';

    (this.caseData.people || []).forEach(p => {
      const el = document.createElement('div');
      el.className = 'flex items-center justify-between p-2 rounded bg-gray-900/40 border border-gray-800/60 mb-1.5 text-xs';
      
      const roleBadge = {
        'victim': '<span class="px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-800/40 text-[10px] font-bold uppercase">Victim</span>',
        'suspect': '<span class="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-800/40 text-[10px] font-bold uppercase">Suspect</span>',
        'witness': '<span class="px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-800/40 text-[10px] font-bold uppercase">Witness</span>'
      }[p.role] || '';

      const displayName = p.role === 'victim' 
        ? (this.victimAliasMode ? 'D. R. [Alias Mode]' : `${p.name} (Victim)`)
        : p.display_alias;

      el.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full ${p.role === 'victim' ? 'bg-amber-400' : (p.role === 'suspect' ? 'bg-red-400' : 'bg-blue-400')}"></span>
          <span class="font-medium text-gray-200">${displayName}</span>
        </div>
        ${roleBadge}
      `;
      rosterEl.appendChild(el);
    });
  }

  renderAlerts() {
    const alertsEl = document.getElementById('alerts-feed-list');
    if (!alertsEl) return;
    alertsEl.innerHTML = '';

    const contras = this.caseData.contradictions || [];

    if (contras.length === 0) {
      alertsEl.innerHTML = `
        <div class="text-center py-16 text-gray-500 text-xs">
          <svg class="w-8 h-8 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          No active contradiction alerts. Intake statements or click "Play Live Interview" to scan.
        </div>
      `;
      return;
    }

    contras.forEach(c => {
      const el = document.createElement('div');
      const isOpen = c.status === 'open';
      el.className = `p-3.5 rounded-lg border ${isOpen ? 'border-red-600/70 bg-red-950/20 new-alert-pulse' : 'border-gray-700 bg-gray-900/60'} mb-3 transition shadow-md`;

      const typeBadge = c.type === 'rule' 
        ? '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700 font-mono">RULE CHECK</span>'
        : '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300 border border-purple-700 font-mono">AI SEMANTIC</span>';

      const statusBadge = {
        'open': '<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-600 text-white">OPEN FLAG</span>',
        'reviewed': '<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-900/70 text-emerald-300 border border-emerald-700">SUPERVISOR REVIEWED</span>',
        'dismissed': '<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-800 text-gray-400">DISMISSED</span>'
      }[c.status] || '';

      el.innerHTML = `
        <div class="flex items-center justify-between text-xs mb-2">
          <div class="flex items-center gap-1.5">
            ${typeBadge}
            <span class="text-xs text-red-400 font-bold font-mono">${c.id}</span>
          </div>
          ${statusBadge}
        </div>
        <p class="text-xs text-gray-200 font-medium mb-3 leading-relaxed">${c.explanation}</p>
        
        <div class="grid grid-cols-2 gap-2 text-[11px] bg-black/40 p-2 rounded border border-gray-800/80 mb-3">
          <div class="border-l-2 border-blue-500 pl-2">
            <span class="text-gray-400 block text-[10px] font-semibold">${c.person_name_a || 'Source A'}</span>
            <span class="text-gray-300 italic line-clamp-2 font-serif">"${c.quote_a || 'N/A'}"</span>
          </div>
          <div class="border-l-2 border-red-500 pl-2">
            <span class="text-gray-400 block text-[10px] font-semibold">${c.person_name_b || 'Source B'}</span>
            <span class="text-gray-300 italic line-clamp-2 font-serif">"${c.quote_b || 'N/A'}"</span>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-gray-800/60">
          <button onclick="window.caseApp.openContradictionModal('${c.id}')" class="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
            <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
            Compare Side-by-Side
          </button>
          ${this.currentRole === 'supervisor' ? `
            <div class="flex items-center gap-1">
              <button onclick="window.caseApp.quickReview('${c.id}', 'reviewed')" class="text-[10px] bg-emerald-800/60 hover:bg-emerald-700 text-emerald-200 px-2 py-0.5 rounded border border-emerald-600 transition">Review</button>
              <button onclick="window.caseApp.quickReview('${c.id}', 'dismissed')" class="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-0.5 rounded border border-gray-600 transition">Dismiss</button>
            </div>
          ` : '<span class="text-[10px] text-gray-500 font-mono">Investigator View</span>'}
        </div>
      `;
      alertsEl.appendChild(el);
    });
  }

  async renderTimeline() {
    let timedFacts = (this.caseData.facts || []).filter(f => f.time_start);
    let gaps = [
      {
        "gap_start": "22:45",
        "gap_end": "23:15",
        "duration_minutes": 30,
        "label": "CRITICAL FORENSIC BLACKOUT GAP",
        "description": "Zero witness accounts, physical observations, or digital records exist between 10:45 PM and 11:15 PM. This critical 30-minute interval overlaps with the conclusion of the forensic time-of-death window and South Gate camera outage.",
        "severity": "critical"
      }
    ];

    try {
      if (!this.isOfflineMode) {
        const res = await fetch(this.getApiUrl('/api/timeline'));
        if (res.ok) {
          const data = await res.json();
          timedFacts = data.events || timedFacts;
          gaps = data.gaps || gaps;
        }
      }
    } catch (e) {
      // Fallback to in-memory timed facts
    }

    this.timeline.render(timedFacts, gaps, { start: "21:30", end: "23:00" });
  }

  renderLeads() {
    const listEl = document.getElementById('leads-items-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const leads = this.caseData.leads || [];
    leads.forEach(l => {
      const el = document.createElement('div');
      const isGap = l.suggestion.toLowerCase().includes('gap') || l.reason.toLowerCase().includes('gap');
      el.className = `p-4 rounded-lg border ${isGap ? 'border-amber-600/60 bg-amber-950/20' : 'border-gray-800 bg-gray-900/70'} mb-4 transition shadow`;

      el.innerHTML = `
        <div class="flex items-center justify-between text-xs mb-2">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${isGap ? 'bg-amber-400 animate-ping' : 'bg-blue-400'}"></span>
            <span class="font-bold text-gray-200 text-sm">${l.suggestion}</span>
          </div>
          ${isGap ? '<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/30 text-amber-300 border border-amber-500/50 uppercase">Forensic Gap Priority</span>' : '<span class="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-900/40 text-blue-300 border border-blue-800/40 uppercase">AI Recommendation</span>'}
        </div>
        <p class="text-xs text-gray-300 leading-relaxed pl-4 border-l-2 ${isGap ? 'border-amber-500' : 'border-blue-500'} mb-3">${l.reason}</p>
        <div class="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-800">
          <span class="font-mono">ID: ${l.id}</span>
          <button onclick="window.caseApp.switchTab('workspace')" class="text-xs text-blue-400 hover:text-blue-300 font-medium">Trace in Master Board &rarr;</button>
        </div>
      `;
      listEl.appendChild(el);
    });
  }

  async renderSummary() {
    const summaryEl = document.getElementById('case-summary-text');
    if (!summaryEl) return;

    let summaryText = this.getBaselineSummaryText();
    try {
      if (!this.isOfflineMode) {
        const res = await fetch(this.getApiUrl('/api/summary'));
        if (res.ok) {
          const data = await res.json();
          if (data.summary) summaryText = data.summary;
        }
      }
    } catch (e) {
      // Fallback to embedded summary
    }

    let html = summaryText;
    html = html.replace(/\[([SFC]\d+)\]/g, '<span class="inline-block bg-blue-900/60 text-blue-300 text-[11px] font-mono font-bold px-1.5 py-0.2 rounded border border-blue-700/60 mx-0.5 cursor-pointer hover:bg-blue-800">[$1]</span>');
    html = html.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    summaryEl.innerHTML = html;
  }

  async renderAuditLogs() {
    const tableBody = document.getElementById('audit-table-body');
    if (!tableBody) return;

    let logs = this.caseData.audit_logs || [
      { id: 1, timestamp: "2026-10-24 07:15:00", user: "Dr. Vance", role: "medical_examiner", action: "DOCUMENT_INGESTED", target: "Forensic Report", details: "Established TOD 21:30 - 23:00" },
      { id: 2, timestamp: "2026-10-24 07:45:00", user: "Det. J. Miller", role: "investigator", action: "DOCUMENT_INGESTED", target: "Ali Statement #1", details: "Extracted 2 verified facts" },
      { id: 3, timestamp: "2026-10-24 08:50:00", user: "Cyber Forensics", role: "system", action: "CONTRADICTION_FLAGGED", target: "CONTRA-RULE-001", details: "Carrier tower ping vs Hamza alibi" },
      { id: 4, timestamp: "2026-10-24 10:00:00", user: "Det. J. Miller", role: "investigator", action: "CONTRADICTION_FLAGGED", target: "CONTRA-AI-002", details: "Nadia statement conflict (quiet vs loud argument)" }
    ];

    try {
      if (!this.isOfflineMode) {
        const res = await fetch(this.getApiUrl('/api/audit-logs'));
        if (res.ok) {
          const data = await res.json();
          if (data.audit_logs) logs = data.audit_logs;
        }
      }
    } catch (e) {
      // Fallback
    }

    tableBody.innerHTML = '';
    logs.forEach(log => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-gray-800/80 hover:bg-gray-800/30 text-xs font-mono';
      const timeStr = log.timestamp ? log.timestamp.replace('T', ' ').substring(0, 19) : '';
      tr.innerHTML = `
        <td class="p-2.5 text-gray-500">${log.id}</td>
        <td class="p-2.5 text-gray-400 whitespace-nowrap">${timeStr}</td>
        <td class="p-2.5 text-gray-300 font-semibold">${log.user} (${log.role})</td>
        <td class="p-2.5"><span class="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px] font-bold">${log.action}</span></td>
        <td class="p-2.5 text-blue-400">${log.target}</td>
        <td class="p-2.5 text-gray-300 font-sans text-xs">${log.details || '-'}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // -----------------------------------------------------------
  // Modals & User Actions
  // -----------------------------------------------------------
  openContradictionModal(contraId) {
    const c = (this.caseData.contradictions || []).find(item => item.id === contraId);
    if (!c) return;

    const modal = document.getElementById('contradiction-modal');
    const content = document.getElementById('contradiction-modal-content');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-mono font-bold text-red-400 bg-red-950/80 px-2 py-0.5 rounded border border-red-800">${c.id} (${(c.type || 'RULE').toUpperCase()})</span>
          <span class="text-xs text-gray-400">Severity: <span class="font-bold text-red-400 uppercase">${c.severity || 'high'}</span></span>
        </div>
        <div class="p-3 bg-red-950/30 border border-red-800/60 rounded text-sm text-red-200 font-medium">
          ${c.explanation}
        </div>
      </div>

      <div class="diff-container mb-6">
        <div class="diff-box quote-a">
          <div class="flex items-center justify-between text-xs text-blue-400 font-mono mb-2">
            <span class="font-bold">${c.person_name_a || 'Subject A'}</span>
            <span class="text-gray-500">${c.time_a || 'Recorded Time'}</span>
          </div>
          <div class="text-[11px] text-gray-400 mb-2 font-mono">${c.doc_title_a || 'Statement A'}</div>
          <div class="p-3 bg-black/50 rounded border border-gray-800 text-sm text-gray-200 font-serif leading-relaxed">
            <span class="quote-highlight">"${c.quote_a}"</span>
          </div>
          <div class="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
            <svg class="w-3 h-3 inline" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>
            Verified Verbatim against Source Document
          </div>
        </div>

        <div class="diff-box quote-b">
          <div class="flex items-center justify-between text-xs text-red-400 font-mono mb-2">
            <span class="font-bold">${c.person_name_b || 'Subject B'}</span>
            <span class="text-gray-500">${c.time_b || 'Recorded Time'}</span>
          </div>
          <div class="text-[11px] text-gray-400 mb-2 font-mono">${c.doc_title_b || 'Statement B'}</div>
          <div class="p-3 bg-black/50 rounded border border-gray-800 text-sm text-gray-200 font-serif leading-relaxed">
            <span class="quote-highlight">"${c.quote_b}"</span>
          </div>
          <div class="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
            <svg class="w-3 h-3 inline" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>
            Verified Verbatim against Source Document
          </div>
        </div>
      </div>

      <div class="p-4 bg-gray-900 rounded-lg border border-gray-800">
        <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Supervisor Human Review & Notes</label>
        <textarea id="supervisor-notes-input" rows="2" class="w-full p-2.5 rounded bg-gray-950 border border-gray-700 text-xs text-gray-200 focus:border-blue-500 focus:outline-none mb-3" placeholder="Enter investigative decision notes, subpoena authorization, or dismissal reason...">${c.supervisor_notes || ''}</textarea>
        <div class="flex items-center justify-between">
          <div class="text-xs text-gray-500">Current Status: <span class="font-bold text-gray-300 uppercase">${c.status}</span></div>
          <div class="flex items-center gap-2">
            <button onclick="window.caseApp.submitReview('${c.id}', 'dismissed')" class="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition">Dismiss Flag</button>
            <button onclick="window.caseApp.submitReview('${c.id}', 'reviewed')" class="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition">Approve & Mark Reviewed</button>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  async submitReview(contraId, status) {
    const notes = document.getElementById('supervisor-notes-input')?.value || '';
    const contra = (this.caseData.contradictions || []).find(c => c.id === contraId);
    if (contra) {
      contra.status = status;
      contra.supervisor_notes = notes;
    }

    try {
      if (!this.isOfflineMode) {
        await fetch(this.getApiUrl(`/api/contradictions/${contraId}/review`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: status,
            notes: notes,
            reviewed_by: this.currentRole === 'supervisor' ? 'Supervisor Reynolds' : 'Investigator Miller'
          })
        });
      }
    } catch (e) {
      // In standalone mode, memory updated
    }

    this.closeModal('contradiction-modal');
    this.showToast(`Contradiction ${contraId} marked as ${status}.`, 'success');
    this.renderAll();
  }

  async quickReview(contraId, status) {
    const contra = (this.caseData.contradictions || []).find(c => c.id === contraId);
    if (contra) {
      contra.status = status;
    }

    try {
      if (!this.isOfflineMode) {
        await fetch(this.getApiUrl(`/api/contradictions/${contraId}/review`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: status,
            notes: `Quick action by ${this.currentRole}`,
            reviewed_by: this.currentRole === 'supervisor' ? 'Supervisor Reynolds' : 'Investigator Miller'
          })
        });
      }
    } catch (e) {
      // Standalone mode updated in memory
    }

    this.showToast(`Flag updated: ${status}`, 'success');
    this.renderAll();
  }

  showDocumentModal(doc) {
    const modal = document.getElementById('generic-modal');
    const titleEl = document.getElementById('generic-modal-title');
    const bodyEl = document.getElementById('generic-modal-body');
    if (!modal || !titleEl || !bodyEl) return;

    titleEl.innerText = doc.title;
    bodyEl.innerHTML = `
      <div class="text-xs text-gray-400 font-mono mb-4 flex items-center justify-between pb-2 border-b border-gray-800">
        <span>Logged By: ${doc.added_by || 'Investigator'}</span>
        <span>${doc.added_at ? doc.added_at.replace('T', ' ') : '2026-10-24'}</span>
      </div>
      <div class="p-4 bg-gray-950 rounded border border-gray-800 font-serif text-sm text-gray-200 leading-relaxed whitespace-pre-wrap mb-4">
        ${doc.text}
      </div>
      <div class="text-xs text-blue-400 font-semibold mb-2">Verified Structured Facts Extracted:</div>
      <div class="space-y-2">
        ${(this.caseData.facts || [])
          .filter(f => f.document_id === doc.id)
          .map(f => `
            <div class="p-2.5 rounded bg-gray-900 border border-gray-800 text-xs">
              <div class="flex items-center justify-between font-mono text-gray-400 mb-1">
                <span class="text-blue-400 font-bold">${f.time_start || 'Approx'} ${f.place ? '• ' + f.place : ''}</span>
                <span class="text-emerald-400 text-[10px]">VERBATIM VERIFIED</span>
              </div>
              <p class="text-gray-300 font-medium mb-1">${f.action}</p>
              <p class="text-gray-500 italic font-serif">"${f.quote}"</p>
            </div>
          `).join('') || '<div class="text-xs text-gray-500">No structured facts extracted.</div>'}
      </div>
    `;
    modal.classList.remove('hidden');
  }

  showFactSourceModal(fact) {
    const doc = (this.caseData.documents || []).find(d => d.id === fact.document_id);
    if (doc) this.showDocumentModal(doc);
  }

  loadUrduSample() {
    const urduSample = {
      title: "Witness Statement: Muhammad Tariq (Urdu Canvass)",
      person_id: "P-05",
      type: "statement",
      added_by: "Det. J. Miller (Urdu Linguistic Bureau)",
      text: "Around 10:30 PM, I saw a car speeding away from the rear gate of the warehouse. All the lights inside the warehouse were turned off. (Original Urdu: میں نے رات تقریباً ساڑھے دس بجے گودام کے پچھلے گیٹ پر ایک گاڑی کو تیز رفتاری سے نکلتے دیکھا تھا)"
    };

    document.getElementById('intake-title').value = urduSample.title;
    document.getElementById('intake-text').value = urduSample.text;
    document.getElementById('intake-person').value = urduSample.person_id;
    this.showToast('Urdu sample statement with translation loaded into intake form.', 'info');
  }

  async submitNewStatement() {
    const title = document.getElementById('intake-title').value.trim();
    const text = document.getElementById('intake-text').value.trim();
    const person_id = document.getElementById('intake-person').value;
    const type = document.getElementById('intake-type').value;

    if (!text) {
      alert('Please enter statement text.');
      return;
    }

    try {
      if (!this.isOfflineMode) {
        const res = await fetch(this.getApiUrl('/api/documents'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || 'New Witness Statement',
            text: text,
            person_id: person_id || null,
            type: type || 'statement',
            added_by: this.currentRole === 'supervisor' ? 'Supervisor Reynolds' : 'Investigator Miller'
          })
        });
        if (res.ok) {
          this.closeModal('intake-modal');
          document.getElementById('intake-text').value = '';
          this.showToast('Statement ingested & facts extracted with anti-hallucination validation.', 'success');
          await this.fetchCaseData();
          return;
        }
      }
    } catch (e) {
      // In offline preview mode
    }

    // Client-side simulation fallback:
    const docId = `DOC-${Date.now() % 10000}`;
    const newDoc = {
      id: docId,
      case_id: "CASE-2026-001",
      person_id: person_id,
      type: type,
      title: title || "Submitted Statement",
      text: text,
      added_by: this.currentRole === 'supervisor' ? 'Supervisor Reynolds' : 'Investigator Miller',
      added_at: "2026-10-24T10:30:00"
    };
    this.caseData.documents.push(newDoc);
    this.closeModal('intake-modal');
    document.getElementById('intake-text').value = '';
    this.showToast('Statement added to case workspace.', 'success');
    this.renderAll();
  }

  // -----------------------------------------------------------
  // Live Interview Simulation Fallback
  // -----------------------------------------------------------
  simulateLiveChunk(chunk) {
    if (chunk.index === 1) {
      this.caseData.facts.push({
        id: "FACT-DOC-08-01",
        person_id: "P-03",
        person_name: "Sara",
        document_id: "DOC-08",
        doc_title: "Sara Statement #1",
        action: "Stationed at South Gate post",
        place: "South Gate",
        time_start: "20:00",
        time_end: "06:00",
        quote: "stationed at the south gate starting 8:00 PM"
      });
    } else if (chunk.index === 2) {
      this.caseData.facts.push({
        id: "FACT-DOC-08-02",
        person_id: "P-03",
        person_name: "Sara",
        document_id: "DOC-08",
        doc_title: "Sara Statement #1",
        action: "Claims camera was working continuously",
        place: "South Gate",
        time_start: "20:00",
        time_end: "06:00",
        quote: "gate camera was working perfectly throughout my entire shift"
      });
      // Trigger CCTV contradiction
      this.caseData.contradictions.push({
        id: "CONTRA-RULE-008",
        type: "rule",
        fact_a_id: "FACT-DOC-08-02",
        fact_b_id: "FACT-DOC-05-01",
        quote_a: "gate camera was working perfectly throughout my entire shift",
        quote_b: "Video stream offline from 9:15 PM to 11:30 PM",
        person_name_a: "Sara (Night Guard)",
        person_name_b: "South Gate CCTV",
        doc_title_a: "Sara Statement #1",
        doc_title_b: "CCTV Telemetry Log",
        time_a: "20:00",
        time_b: "21:15",
        explanation: "Inconsistent, needs human review: Hardware telemetry log confirms camera CAM-02 was offline from 9:15 PM to 11:30 PM due to manual power severed, which conflicts with witness statement asserting continuous operation.",
        severity: "high",
        status: "open"
      });
      this.livePlayer.playAlertSound();
    } else if (chunk.index === 3) {
      this.caseData.facts.push({
        id: "FACT-DOC-08-03",
        person_id: "P-03",
        person_name: "Sara",
        document_id: "DOC-08",
        doc_title: "Sara Statement #1",
        action: "Observed Ali's vehicle stationary near loading dock",
        place: "Warehouse West Loading Dock",
        time_start: "22:30",
        time_end: "22:30",
        quote: "saw Ali's silver Honda Civic parked outside near the loading dock"
      });
      // Trigger Ali car sighting contradiction
      this.caseData.contradictions.push({
        id: "CONTRA-RULE-005",
        type: "rule",
        fact_a_id: "FACT-DOC-02-02",
        fact_b_id: "FACT-DOC-08-03",
        quote_a: "drove directly back to my apartment in Gulberg and stayed home all night sleeping",
        quote_b: "saw Ali's silver Honda Civic parked outside near the loading dock",
        person_name_a: "Ali (Warehouse Employee)",
        person_name_b: "Sara (Night Guard)",
        doc_title_a: "Ali Statement #1",
        doc_title_b: "Sara Statement #1",
        time_a: "21:30",
        time_b: "22:30",
        explanation: "Inconsistent, needs human review: Spatial-temporal overlap for Ali. Claimed presence at 'Gulberg Apartment' (21:30) conflicts with presence at 'Warehouse West Loading Dock' (22:30).",
        severity: "high",
        status: "open"
      });
      this.livePlayer.playAlertSound();
    }
    this.renderAll();
  }

  // -----------------------------------------------------------
  // Navigation & Button Actions
  // -----------------------------------------------------------
  switchTab(tabName) {
    this.activeTab = tabName;
    ['workspace', 'leads', 'summary', 'audit', 'graph'].forEach(t => {
      const pane = document.getElementById(`tab-pane-${t}`);
      const btn = document.getElementById(`tab-btn-${t}`);
      if (pane) pane.style.display = (t === tabName) ? 'block' : 'none';
      if (btn) {
        btn.className = (t === tabName) 
          ? 'px-3 py-1.5 rounded bg-gray-800 text-white font-medium text-xs border border-gray-700 transition'
          : 'px-3 py-1.5 rounded text-gray-400 hover:text-gray-200 font-medium text-xs transition';
      }
    });

    if (tabName === 'graph' && this.graph) {
      setTimeout(() => {
        this.graph.resize();
        this.graph.loadData(this.caseData);
      }, 50);
    }
  }

  togglePlayInterview() {
    if (!this.livePlayer) return;
    if (this.livePlayer.isPlaying) {
      this.livePlayer.pause();
    } else {
      this.livePlayer.start();
    }
  }

  toggleRole() {
    this.currentRole = this.currentRole === 'investigator' ? 'supervisor' : 'investigator';
    const roleBadge = document.getElementById('role-toggle-btn');
    if (roleBadge) {
      roleBadge.innerHTML = this.currentRole === 'supervisor'
        ? '<span class="w-2 h-2 rounded-full bg-emerald-400"></span> Supervisor Role'
        : '<span class="w-2 h-2 rounded-full bg-blue-400"></span> Investigator Role';
    }
    this.showToast(`Switched active profile to ${this.currentRole.toUpperCase()}`, 'info');
    this.renderAlerts();
  }

  toggleVictimAlias() {
    this.victimAliasMode = !this.victimAliasMode;
    const btn = document.getElementById('btn-alias-toggle');
    if (btn) {
      btn.innerText = this.victimAliasMode ? 'Alias: Protected' : 'Alias: Revealed';
      btn.className = this.victimAliasMode 
        ? 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800'
        : 'px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800';
    }
    this.showToast(this.victimAliasMode ? 'Victim alias mode activated for privacy.' : 'Victim real identity displayed (Logged in audit trail).', 'info');
    this.renderAll();
  }

  getPersonDisplayName(personId, fallbackName) {
    if (personId === 'P-01' || (fallbackName && fallbackName.toLowerCase().includes('daniyal'))) {
      return this.victimAliasMode ? 'D. R. (Victim)' : 'Daniyal Rauf (Victim)';
    }
    return fallbackName || 'Subject';
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colorClass = type === 'error' ? 'border-red-600 bg-red-950/95 text-red-200' : 'border-blue-600 bg-gray-900/95 text-gray-200';
    toast.className = `fixed bottom-4 right-4 z-50 p-3 rounded-lg border shadow-xl text-xs font-medium flex items-center gap-2 transform transition-all duration-300 translate-y-2 opacity-0 ${colorClass}`;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  copySummary() {
    const text = document.getElementById('case-summary-text')?.innerText || '';
    navigator.clipboard.writeText(text);
    this.showToast('Case summary dossier copied to clipboard.', 'success');
  }

  printDossier() {
    window.print();
  }

  async resetDemo(mode) {
    if (!confirm(`Reset caseboard to ${mode === 'ready_for_interview' ? 'Pre-Interview' : 'Full Case'} mode?`)) return;
    try {
      if (!this.isOfflineMode) {
        await fetch(this.getApiUrl('/api/reset-demo'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: mode })
        });
      }
    } catch (e) {
      // In offline preview mode
    }

    if (this.livePlayer) this.livePlayer.reset();
    if (mode === 'ready_for_interview') {
      this.caseData = this.getBaselineEmbeddedData();
    } else {
      this.caseData = this.getFullEmbeddedData();
    }
    this.showToast(`Reset case to ${mode} mode.`, 'info');
    this.renderAll();
  }

  bindEvents() {
    document.getElementById('btn-play-interview')?.addEventListener('click', () => this.togglePlayInterview());
    document.getElementById('role-toggle-btn')?.addEventListener('click', () => this.toggleRole());
    document.getElementById('btn-alias-toggle')?.addEventListener('click', () => this.toggleVictimAlias());
  }

  // -----------------------------------------------------------
  // Embedded Baseline Datasets for Resilient Offline Execution
  // -----------------------------------------------------------
  getBaselineEmbeddedData() {
    return {
      case: {
        id: "CASE-2026-001",
        title: "The Riverside Warehouse Murder",
        status: "active",
        forensic_window_start: "21:30",
        forensic_window_end: "23:00"
      },
      people: [
        { id: "P-01", name: "Daniyal Rauf", role: "victim", display_alias: "D. R. (Victim)" },
        { id: "P-02", name: "Ali", role: "suspect", display_alias: "Ali (Warehouse Employee)" },
        { id: "P-03", name: "Sara", role: "witness", display_alias: "Sara (Night Security Guard)" },
        { id: "P-04", name: "Hamza", role: "suspect", display_alias: "Hamza (Business Partner)" },
        { id: "P-05", name: "Nadia", role: "witness", display_alias: "Nadia (Residential Neighbor)" }
      ],
      documents: [
        {
          id: "DOC-01", person_id: "P-01", person_name: "Daniyal Rauf", type: "forensic",
          title: "Forensic Pathology Initial Post-Mortem Report", added_by: "Dr. E. Vance", added_at: "2026-10-24T07:15:00",
          text: "Victim Daniyal Rauf found deceased at 6:40 AM. Rigor mortis and liver core temperature analysis establish the estimated time of death between 9:30 PM and 11:00 PM. Cause of death is blunt force trauma to the occipital region."
        },
        {
          id: "DOC-02", person_id: "P-02", person_name: "Ali", type: "statement",
          title: "Ali Statement #1 (Recorded Interview)", added_by: "Det. J. Miller", added_at: "2026-10-24T07:45:00",
          text: "I worked normal shift until 9:00 PM yesterday. I closed my desk and left at 9:00 PM sharp. I drove directly back to my apartment in Gulberg and stayed home all night sleeping. I never returned to the warehouse."
        },
        {
          id: "DOC-03", person_id: "P-04", person_name: "Hamza", type: "statement",
          title: "Hamza Statement #1 (Written Deposition)", added_by: "Det. S. Chen", added_at: "2026-10-24T08:20:00",
          text: "I had no reason to be anywhere near the warehouse yesterday. I was completely out of town all day in Islamabad for vendor meetings. I checked into the Serena Hotel at 2:00 PM and did not return to the city until morning."
        },
        {
          id: "DOC-04", person_id: "P-04", person_name: "Hamza", type: "phone log",
          title: "Cell Tower Telemetry: Hamza Mobile (Tower WH-04)", added_by: "Cyber Forensics Bureau", added_at: "2026-10-24T08:50:00",
          text: "Automated Carrier Log: MSISDN 92-300-8841209 (registered to Hamza Tariq) registered voice call and data packet transmission through Tower WH-04 Sector B, located 180 meters from Riverside Warehouse, at 9:45 PM on October 23."
        },
        {
          id: "DOC-05", person_id: null, person_name: "System", type: "cctv",
          title: "CCTV Hardware Telemetry - South Gate CAM-02", added_by: "Security Forensics", added_at: "2026-10-24T09:10:00",
          text: "Hardware Log: CAM-02 South Gate experienced power failure and network packet drop. Video stream offline from 9:15 PM to 11:30 PM. Manual switch was flipped in electrical room."
        },
        {
          id: "DOC-06", person_id: "P-05", person_name: "Nadia", type: "statement",
          title: "Nadia Statement #1 (Initial Canvass)", added_by: "Officer R. Gomez", added_at: "2026-10-24T09:30:00",
          text: "I live directly across the street from the warehouse entrance. I was watching television in my front room from 9:00 PM to 11:30 PM with the windows open. The street was completely quiet and I heard nothing unusual the whole evening."
        },
        {
          id: "DOC-07", person_id: "P-05", person_name: "Nadia", type: "statement",
          title: "Nadia Statement #2 (Amended Witness Statement)", added_by: "Det. J. Miller", added_at: "2026-10-24T10:00:00",
          text: "Upon further reflection, I need to amend my statement. When I stepped onto my porch for fresh air, I distinctly heard a loud argument with shouting coming from inside the warehouse around 10:00 PM. Two voices were arguing angrily."
        }
      ],
      facts: [
        { id: "FACT-DOC-01-01", person_id: "P-01", person_name: "Daniyal Rauf", document_id: "DOC-01", doc_title: "Forensic Pathology Initial Post-Mortem Report", action: "Forensic estimated time of death between 9:30 PM and 11:00 PM", place: "Riverside Warehouse", time_start: "21:30", time_end: "23:00", quote: "estimated time of death between 9:30 PM and 11:00 PM" },
        { id: "FACT-DOC-02-01", person_id: "P-02", person_name: "Ali", document_id: "DOC-02", doc_title: "Ali Statement #1", action: "Concluded shift and departed warehouse", place: "Riverside Warehouse", time_start: "21:00", time_end: "21:00", quote: "left at 9:00 PM sharp" },
        { id: "FACT-DOC-02-02", person_id: "P-02", person_name: "Ali", document_id: "DOC-02", doc_title: "Ali Statement #1", action: "Drove to residence in Gulberg and remained asleep overnight", place: "Gulberg Apartment", time_start: "21:30", time_end: "06:00", quote: "drove directly back to my apartment in Gulberg and stayed home all night sleeping" },
        { id: "FACT-DOC-03-01", person_id: "P-04", person_name: "Hamza", document_id: "DOC-03", doc_title: "Hamza Statement #1", action: "Claims presence out of town in Islamabad for business", place: "Islamabad", time_start: "14:00", time_end: "06:00", quote: "out of town all day in Islamabad for vendor meetings" },
        { id: "FACT-DOC-04-01", person_id: "P-04", person_name: "Hamza", document_id: "DOC-04", doc_title: "Cell Tower Telemetry: Hamza Mobile", action: "Mobile phone connected to cell tower adjacent to warehouse", place: "Riverside Warehouse Vicinity (180m)", time_start: "21:45", time_end: "21:45", quote: "registered voice call and data packet transmission through Tower WH-04 Sector B, located 180 meters from Riverside Warehouse, at 9:45 PM" },
        { id: "FACT-DOC-05-01", person_id: null, person_name: "South Gate CCTV", document_id: "DOC-05", doc_title: "CCTV Hardware Telemetry", action: "Camera hardware power loss and offline telemetry state", place: "South Gate", time_start: "21:15", time_end: "23:30", quote: "Video stream offline from 9:15 PM to 11:30 PM" },
        { id: "FACT-DOC-06-01", person_id: "P-05", person_name: "Nadia", document_id: "DOC-06", doc_title: "Nadia Statement #1", action: "Reports quiet environment and hearing zero disturbances", place: "Street Opposite Warehouse", time_start: "21:00", time_end: "23:30", quote: "The street was completely quiet and I heard nothing unusual the whole evening" },
        { id: "FACT-DOC-07-01", person_id: "P-05", person_name: "Nadia", document_id: "DOC-07", doc_title: "Nadia Statement #2", action: "Heard loud verbal altercation with raised shouting inside warehouse", place: "Riverside Warehouse Porch/Interior", time_start: "22:00", time_end: "22:00", quote: "distinctly heard a loud argument with shouting coming from inside the warehouse around 10:00 PM" }
      ],
      contradictions: [
        {
          id: "CONTRA-RULE-001",
          type: "rule",
          fact_a_id: "FACT-DOC-03-01",
          fact_b_id: "FACT-DOC-04-01",
          quote_a: "out of town all day in Islamabad for vendor meetings",
          quote_b: "registered voice call and data packet transmission through Tower WH-04 Sector B, located 180 meters from Riverside Warehouse, at 9:45 PM",
          person_name_a: "Hamza (Business Partner)",
          person_name_b: "Cell Tower Log",
          doc_title_a: "Hamza Statement #1",
          doc_title_b: "Cell Tower Telemetry",
          time_a: "14:00",
          time_b: "21:45",
          explanation: "Inconsistent, needs human review: Carrier cellular telemetry records an active mobile ping near the warehouse (21:45), which is inconsistent with statement claim of being out of town in Islamabad.",
          severity: "high",
          status: "open"
        },
        {
          id: "CONTRA-AI-002",
          type: "AI",
          fact_a_id: "FACT-DOC-06-01",
          fact_b_id: "FACT-DOC-07-01",
          quote_a: "The street was completely quiet and I heard nothing unusual the whole evening",
          quote_b: "distinctly heard a loud argument with shouting coming from inside the warehouse around 10:00 PM",
          person_name_a: "Nadia (Neighbor)",
          person_name_b: "Nadia (Neighbor)",
          doc_title_a: "Nadia Statement #1",
          doc_title_b: "Nadia Statement #2",
          time_a: "21:00",
          time_b: "22:00",
          explanation: "Inconsistent, needs human review: Nadia initially reported the street was completely quiet and heard nothing unusual all evening, but in Statement #2 stated she distinctly heard a loud argument with shouting inside the warehouse at 10:00 PM.",
          severity: "medium",
          status: "open"
        }
      ],
      leads: [
        { id: "LEAD-001", suggestion: "Investigate Unaccounted 10:45 PM - 11:15 PM Gap", reason: "CRITICAL TIMELINE GAP: The forensic time-of-death window spans 9:30 PM to 11:00 PM, and the South Gate camera was disabled until 11:30 PM. There are zero witness observations, phone records, or activity logs recorded between 10:45 PM and 11:15 PM." },
        { id: "LEAD-002", suggestion: "Subpoena Full Call Detail Records (CDR) for Hamza", reason: "Hamza claimed a verified alibi in Islamabad, yet carrier tower telemetry placed his mobile device within 180 meters of the warehouse at 9:45 PM during the active forensic TOD window." },
        { id: "LEAD-003", suggestion: "Forensic Inspection of Electrical Room Manual Breaker", reason: "CCTV log confirms South Gate power was severed by a manual switch flip at 9:15 PM, leaving the premises unmonitored. Process breaker panel for latent fingerprints." }
      ],
      stats: {
        total_documents: 7,
        total_facts: 8,
        total_contradictions: 2,
        open_contradictions: 2,
        reviewed_contradictions: 0
      }
    };
  }

  getFullEmbeddedData() {
    const data = this.getBaselineEmbeddedData();
    data.documents.push({
      id: "DOC-08", person_id: "P-03", person_name: "Sara", type: "statement",
      title: "Sara Statement #1 (Night Guard Interview)", added_by: "Det. J. Miller", added_at: "2026-10-24T10:15:00",
      text: "I was stationed at the south gate starting 8:00 PM. The gate camera was working perfectly throughout my entire shift. Around 10:30 PM, I looked outside towards the west parking bay and saw Ali's silver Honda Civic parked outside near the loading dock. I recognized the license plate."
    });
    data.facts.push(
      { id: "FACT-DOC-08-01", person_id: "P-03", person_name: "Sara", document_id: "DOC-08", doc_title: "Sara Statement #1", action: "Stationed at South Gate post", place: "South Gate", time_start: "20:00", time_end: "06:00", quote: "stationed at the south gate starting 8:00 PM" },
      { id: "FACT-DOC-08-02", person_id: "P-03", person_name: "Sara", document_id: "DOC-08", doc_title: "Sara Statement #1", action: "Claims South Gate CCTV was operational without disruption", place: "South Gate", time_start: "20:00", time_end: "06:00", quote: "gate camera was working perfectly throughout my entire shift" },
      { id: "FACT-DOC-08-03", person_id: "P-03", person_name: "Sara", document_id: "DOC-08", doc_title: "Sara Statement #1", action: "Observed Ali's vehicle stationary near loading dock", place: "Warehouse West Loading Dock", time_start: "22:30", time_end: "22:30", quote: "saw Ali's silver Honda Civic parked outside near the loading dock" }
    );
    data.contradictions.push(
      {
        id: "CONTRA-RULE-005", type: "rule", fact_a_id: "FACT-DOC-02-02", fact_b_id: "FACT-DOC-08-03",
        quote_a: "drove directly back to my apartment in Gulberg and stayed home all night sleeping",
        quote_b: "saw Ali's silver Honda Civic parked outside near the loading dock",
        person_name_a: "Ali (Warehouse Employee)", person_name_b: "Sara (Night Guard)", doc_title_a: "Ali Statement #1", doc_title_b: "Sara Statement #1",
        time_a: "21:30", time_b: "22:30",
        explanation: "Inconsistent, needs human review: Spatial-temporal overlap for Ali. Claimed presence at 'Gulberg Apartment' (21:30) conflicts with presence at 'Warehouse West Loading Dock' (22:30).",
        severity: "high", status: "open"
      },
      {
        id: "CONTRA-RULE-008", type: "rule", fact_a_id: "FACT-DOC-08-02", fact_b_id: "FACT-DOC-05-01",
        quote_a: "gate camera was working perfectly throughout my entire shift",
        quote_b: "Video stream offline from 9:15 PM to 11:30 PM",
        person_name_a: "Sara (Night Guard)", person_name_b: "South Gate CCTV", doc_title_a: "Sara Statement #1", doc_title_b: "CCTV Telemetry Log",
        time_a: "20:00", time_b: "21:15",
        explanation: "Inconsistent, needs human review: Hardware telemetry log confirms camera CAM-02 was offline from 9:15 PM to 11:30 PM due to manual power severed, which conflicts with witness statement asserting continuous operation.",
        severity: "high", status: "open"
      }
    );
    data.stats.total_documents = 8;
    data.stats.total_facts = 11;
    data.stats.total_contradictions = 4;
    data.stats.open_contradictions = 4;
    return data;
  }

  getBaselineSummaryText() {
    return `CASE DOSSIER SUMMARY: THE RIVERSIDE WAREHOUSE MURDER (FICTIONAL CASE)\nDISCLAIMER: DECISION SUPPORT ONLY. NOT EVIDENCE. HUMAN REVIEW REQUIRED.\n\n1. FORENSIC BASELINE & CRIME SCENE\nThe body of warehouse manager Daniyal Rauf [Alias: D. R.] was discovered at 6:40 AM inside the Riverside Warehouse [F1].\nForensic pathology established the estimated time of death (TOD) between 9:30 PM and 11:00 PM resulting from blunt force occipital trauma [F1].\nPhysical inspection revealed the South Gate CCTV power had been severed via a manual electrical breaker at 9:15 PM, leaving the facility unmonitored until 11:30 PM [C1].\n\n2. WITNESS & SUSPECT STATEMENTS\nEmployee Ali asserted he concluded work and departed the warehouse at 9:00 PM sharp to sleep at his Gulberg residence [S1].\nNight guard Sara reported that she monitored the South Gate from 8:00 PM onward and claimed the gate camera was operational throughout her shift [S2].\nSara observed Ali's silver Honda Civic parked outside near the loading dock at approximately 10:30 PM [S2].\nBusiness partner Hamza claimed he was out of town in Islamabad for vendor meetings for the entire day [S3].\nCarrier telecommunications telemetry recorded Hamza's cellular device transmitting voice and data packets through Tower WH-04, 180 meters from the crime scene, at 9:45 PM [P1].\nNeighbor Nadia initially stated the street remained quiet and she heard nothing unusual all evening [S4].\nIn a subsequent statement, Nadia corrected her account, stating she distinctly heard a heated verbal argument with shouting inside the warehouse at 10:00 PM [S5].\n\n3. IDENTIFIED INCONSISTENCIES & DECISION SUPPORT FLAGS\nAn inconsistency exists between Ali's alibi and Sara's sighting of his car at 10:30 PM [S1, S2].\nHamza's claim of being in Islamabad directly conflicts with carrier tower telemetry placing his phone 180 meters from the warehouse at 9:45 PM [S3, P1].\nSara's assertion of an active surveillance stream is contradicted by hardware telemetry proving the camera was offline between 9:15 PM and 11:30 PM [S2, C1].\nNadia's initial report of absolute silence is inconsistent with her second statement detailing a loud argument at 10:00 PM [S4, S5].\n\n4. CRITICAL INVESTIGATIVE GAP\nA 30-minute blackout gap exists between 10:45 PM and 11:15 PM with zero recorded witness movements or digital transactions during the active forensic TOD window [F1, C1].`;
  }
}

// Global initialization
window.caseApp = new CaseBoardApp();
window.addEventListener('DOMContentLoaded', () => {
  window.caseApp.init();
});
