/**
 * CaseBoard AI - Master Timeline Component
 * Chronologically renders all evidence facts and highlights forensic windows & critical blackout gaps.
 */

class MasterTimeline {
  constructor(containerId, app) {
    this.container = document.getElementById(containerId);
    this.app = app;
  }

  render(events, gaps, forensicWindow) {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (!events || events.length === 0) {
      this.container.innerHTML = `
        <div class="text-center py-16 text-gray-500 text-sm">
          <svg class="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          No timestamped facts yet. Play live interview or ingest statements.
        </div>
      `;
      return;
    }

    const track = document.createElement('div');
    track.className = 'timeline-track pt-4 pb-12';

    // Forensic TOD Banner Marker
    const forensicBanner = document.createElement('div');
    forensicBanner.className = 'mb-6 p-3 rounded-lg border border-cyan-800/60 bg-cyan-950/30 flex items-center justify-between text-xs text-cyan-300';
    forensicBanner.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
        <span class="font-bold tracking-wider uppercase">Forensic Pathologist Time of Death Window:</span>
        <span class="font-mono bg-cyan-900/60 px-2 py-0.5 rounded text-cyan-200">21:30 - 23:00</span>
      </div>
      <span class="text-gray-400">Dr. Vance Post-Mortem [F1]</span>
    `;
    this.container.appendChild(forensicBanner);

    // Merge timed events with gap markers in chronological order
    const allItems = [];
    events.forEach(ev => allItems.push({ type: 'event', time: ev.time_start || '00:00', data: ev }));
    (gaps || []).forEach(gap => allItems.push({ type: 'gap', time: gap.gap_start, data: gap }));

    allItems.sort((a, b) => a.time.localeCompare(b.time));

    allItems.forEach(item => {
      if (item.type === 'gap') {
        const gapEl = this.createGapElement(item.data);
        track.appendChild(gapEl);
      } else {
        const eventEl = this.createEventElement(item.data);
        track.appendChild(eventEl);
      }
    });

    this.container.appendChild(track);
  }

  createEventElement(fact) {
    const el = document.createElement('div');
    
    // Check if fact is involved in any active contradiction
    const hasConflict = (this.app.caseData.contradictions || []).some(
      c => c.fact_a_id === fact.id || c.fact_b_id === fact.id
    );

    el.className = `timeline-item ${hasConflict ? 'has-conflict' : ''} group cursor-pointer`;
    el.onclick = () => this.app.showFactSourceModal(fact);

    const timeDisplay = fact.time_end && fact.time_end !== fact.time_start 
      ? `${fact.time_start} - ${fact.time_end}` 
      : (fact.time_start || 'Approximate');

    const personLabel = this.app.getPersonDisplayName(fact.person_id, fact.person_name || fact.person);

    el.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="p-3.5 rounded-lg border ${hasConflict ? 'border-red-900/80 bg-red-950/20' : 'border-gray-800 bg-gray-900/70'} hover:border-gray-600 transition shadow-sm">
        <div class="flex items-center justify-between text-xs mb-1.5 font-mono">
          <div class="flex items-center gap-2">
            <span class="text-blue-400 font-bold bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/50">${timeDisplay}</span>
            <span class="text-gray-300 font-semibold">${personLabel}</span>
            ${fact.place ? `<span class="text-gray-500 flex items-center gap-1"><svg class="w-3 h-3 inline text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path></svg>${fact.place}</span>` : ''}
          </div>
          <span class="text-xs text-gray-500 truncate max-w-[150px]">${fact.doc_title || 'Document'}</span>
        </div>
        <p class="text-sm text-gray-200 mb-2">${fact.action}</p>
        <div class="flex items-center justify-between pt-2 border-t border-gray-800/80 text-xs">
          <div class="text-gray-400 italic font-serif flex items-center gap-1.5">
            <span class="text-blue-400 font-sans text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-900/30">Exact Quote</span>
            "${fact.quote}"
          </div>
          ${hasConflict ? '<span class="text-red-400 font-bold text-[11px] bg-red-900/50 px-2 py-0.5 rounded border border-red-800 flex items-center gap-1"><svg class="w-3 h-3 inline" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>Flagged Inconsistency</span>' : ''}
        </div>
      </div>
    `;
    return el;
  }

  createGapElement(gap) {
    const el = document.createElement('div');
    el.className = 'timeline-gap-card';
    el.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="font-bold text-amber-400 text-sm tracking-wide font-mono">${gap.gap_start} - ${gap.gap_end} (${gap.duration_minutes} MIN BLACKOUT)</span>
            <span class="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/40 uppercase">Unaccounted Window</span>
          </div>
          <p class="text-xs text-amber-200/90 leading-relaxed">${gap.description}</p>
        </div>
        <button onclick="window.caseApp.switchTab('leads')" class="text-xs text-amber-400 hover:text-amber-200 underline whitespace-nowrap pl-3">
          View Suggested Leads &rarr;
        </button>
      </div>
    `;
    return el;
  }
}
