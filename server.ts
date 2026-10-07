import express from 'express';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  AppState,
  HeadcountMemberRecord,
  HeadcountRosterEntry,
  HeadcountSyncLog,
  INITIAL_TEAMS_DATA,
  MemberRecord,
  STATE_VERSION,
  SyncLogEntry,
  TeamBoard,
  allocateTeamHeadcountsFromRoster,
  buildInitialHeadcountRoster,
  canonicalizeHeadcountTeam,
  extractChineseName,
  extractEnglishName,
  getAllMembersOfTeam,
} from './src/shared/teamsData.ts';

dotenv.config();

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'lightboard-state.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ensureInitialMembersPresent(teams: TeamBoard[], roster?: HeadcountRosterEntry[]) {
  for (const initTeam of INITIAL_TEAMS_DATA) {
    const savedTeam = teams.find(
      (t) => t.id === initTeam.id || t.name.toLowerCase() === initTeam.name.toLowerCase()
    );
    if (!savedTeam) {
      teams.push(JSON.parse(JSON.stringify(initTeam)));
      continue;
    }

    const existingMembers = getAllMembersOfTeam(savedTeam);
    const initGroups = [
      ...initTeam.leftColumnGroups.map((g) => ({ col: 'left' as const, group: g })),
      ...initTeam.rightColumnGroups.map((g) => ({ col: 'right' as const, group: g })),
    ];

    let addedAny = false;
    for (const { col, group: initGroup } of initGroups) {
      const initLeader = initGroup.members.find((m) => m.isLeaderRow) || initGroup.members[0];
      for (const initMember of initGroup.members) {
        const alreadyExists = existingMembers.some(
          (em) =>
            (initMember.agentCode && em.agentCode === initMember.agentCode) ||
            em.id === initMember.id ||
            em.fullName.trim().toUpperCase() === initMember.fullName.trim().toUpperCase()
        );
        if (!alreadyExists) {
          // Find target manager group in savedTeam
          const allSavedGroups = [
            ...savedTeam.leftColumnGroups,
            ...savedTeam.rightColumnGroups,
          ];
          let targetGroup = allSavedGroups.find((g) => g.id === initGroup.id);
          if (!targetGroup && initLeader) {
            targetGroup = allSavedGroups.find((g) =>
              g.members.some(
                (m) =>
                  m.fullName.trim().toUpperCase() ===
                  initLeader.fullName.trim().toUpperCase()
              )
            );
          }
          if (!targetGroup) {
            targetGroup =
              col === 'left'
                ? savedTeam.leftColumnGroups[0]
                : savedTeam.rightColumnGroups[savedTeam.rightColumnGroups.length - 1] ||
                  savedTeam.leftColumnGroups[0];
          }
          if (targetGroup) {
            const newMember: MemberRecord = JSON.parse(JSON.stringify(initMember));
            if (roster && roster.length > 0) {
              const matchedHc = roster.find(
                (r) =>
                  (newMember.agentCode && r.agentCode === newMember.agentCode) ||
                  r.araName.trim().toUpperCase() === newMember.fullName.trim().toUpperCase()
              );
              if (matchedHc) {
                newMember.fycc = matchedHc.fyc || 0;
                newMember.fyp = matchedHc.fyp || 0;
                newMember.cases = matchedHc.cases || 0;
                newMember.isActive = (matchedHc.fyc || 0) > 0;
              }
            }
            targetGroup.members.push(newMember);
            existingMembers.push(newMember);
            addedAny = true;
          }
        }
      }
    }

    const totalMembersNow = getAllMembersOfTeam(savedTeam).length;
    if (addedAny || savedTeam.activeMemberDenominator < totalMembersNow) {
      savedTeam.activeMemberDenominator = totalMembersNow;
    }
  }
}

function loadInitialState(): AppState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as AppState;
      if (
        parsed &&
        parsed.version === STATE_VERSION &&
        Array.isArray(parsed.teams) &&
        parsed.teams.length > 0
      ) {
        ensureInitialMembersPresent(parsed.teams, parsed.headcountRoster);
        if (!Array.isArray(parsed.headcountRoster) || parsed.headcountRoster.length === 0) {
          parsed.headcountRoster = buildInitialHeadcountRoster(parsed.teams);
        } else {
          parsed.headcountRoster = parsed.headcountRoster.map((r) => {
            const cTeam = canonicalizeHeadcountTeam(r.team || r.district || 'PAGGIE LAW');
            return {
              ...r,
              team: cTeam,
              district: cTeam,
            };
          });
          if (parsed.lastHeadcountSync) {
            allocateTeamHeadcountsFromRoster(parsed.teams, parsed.headcountRoster);
          }
        }
        saveState(parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read saved state, using initial state:', err);
  }
  const initialTeams = JSON.parse(JSON.stringify(INITIAL_TEAMS_DATA)) as TeamBoard[];
  const initial: AppState = {
    version: STATE_VERSION,
    reportDateDisplay: '30 Sep 2026',
    targetMonthFilter: 'AUTO',
    teams: initialTeams,
    headcountRoster: buildInitialHeadcountRoster(initialTeams),
    syncHistory: [],
  };
  saveState(initial);
  return initial;
}

function saveState(state: AppState) {
  try {
    if (Array.isArray(state.syncHistory) && state.syncHistory.length > 3) {
      state.syncHistory = state.syncHistory.slice(0, 3);
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf-8');
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

let appState: AppState = loadInitialState();

// Normalize string for matching agent names
function normalizeName(str: string): string {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse numeric FYCC value from string or number
function parseFyccValue(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  const str = String(val).trim();
  if (!str || str === '-' || str === '--' || str === 'N/A' || str.toLowerCase() === 'null') {
    return null;
  }
  // Handle accounting negative like (1,234.50) or currency symbols like HK$12,345.00
  const isNegative = /^\(.*\)$/.test(str) || str.startsWith('-');
  const cleaned = str.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return isNegative ? -num : num;
}

// Check if a member matches a raw text cell
function matchMemberInCell(
  cellText: string,
  allMembers: Array<{ member: MemberRecord; team: TeamBoard }>
): { member: MemberRecord; team: TeamBoard } | null {
  const normCell = normalizeName(cellText);
  if (!normCell || normCell.length < 3) return null;

  // 1. Exact or substring match on fullName (longest fullName first to avoid partial collisions)
  const sorted = [...allMembers].sort(
    (a, b) => b.member.fullName.length - a.member.fullName.length
  );

  for (const item of sorted) {
    const normFull = normalizeName(item.member.fullName);
    const normNick = normalizeName(item.member.nickname);
    const combined = normNick ? `${normFull} ${normNick}` : normFull;

    if (
      normCell === normFull ||
      normCell === combined ||
      normCell.includes(normFull)
    ) {
      return item;
    }

    // Also handle comma-separated surname, given name where tokens match all words of fullName
    const fullTokens = normFull.split(' ').filter(Boolean);
    const cellTokens = normCell.split(' ').filter(Boolean);
    if (
      fullTokens.length >= 2 &&
      fullTokens.every((t) => cellTokens.includes(t))
    ) {
      // If there are multiple members with same full name (e.g., none in our 9 teams, or check nickname)
      if (!normNick || !cellTokens.some((t) => t.length > 2) || normCell.includes(normNick)) {
        return item;
      }
      return item;
    }
  }
  return null;
}

// Extract Month-Year or formatted date from report text if present
function extractReportDateFromGrid(rows: unknown[][]): {
  displayDate: string | null;
  monthKey: string | null; // e.g., "2026-09"
} {
  const monthNames = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
  ];
  const monthDisplay = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? '').trim();
      if (!cell) continue;

      // Match e.g. "30 Sep 2026" or "01 Sep 2026 - 30 Sep 2026"
      const dmyRegex = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(20\d{2})/gi;
      let match: RegExpExecArray | null;
      let lastMatch: RegExpExecArray | null = null;
      while ((match = dmyRegex.exec(cell)) !== null) {
        lastMatch = match;
      }
      if (lastMatch) {
        const day = lastMatch[1].padStart(2, '0');
        const mPrefix = lastMatch[2].toLowerCase().slice(0, 3);
        const mIdx = monthNames.indexOf(mPrefix);
        const year = lastMatch[3];
        if (mIdx !== -1) {
          return {
            displayDate: `${parseInt(day, 10)} ${monthDisplay[mIdx]} ${year}`,
            monthKey: `${year}-${String(mIdx + 1).padStart(2, '0')}`,
          };
        }
      }

      // Match e.g. "2026-09-30" or "30/09/2026" or "2026/09/30"
      const isoMatch = cell.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
      if (isoMatch) {
        const year = isoMatch[1];
        const mIdx = parseInt(isoMatch[2], 10) - 1;
        const day = parseInt(isoMatch[3], 10);
        if (mIdx >= 0 && mIdx < 12) {
          return {
            displayDate: `${day} ${monthDisplay[mIdx]} ${year}`,
            monthKey: `${year}-${String(mIdx + 1).padStart(2, '0')}`,
          };
        }
      }

      const slashMatch = cell.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
      if (slashMatch) {
        const d1 = parseInt(slashMatch[1], 10);
        const d2 = parseInt(slashMatch[2], 10);
        const year = slashMatch[3];
        // Assume DD/MM/YYYY (standard in HK insurance reports) unless d2 > 12
        const day = d2 <= 12 ? d1 : d2;
        const mIdx = (d2 <= 12 ? d2 : d1) - 1;
        if (mIdx >= 0 && mIdx < 12) {
          return {
            displayDate: `${day} ${monthDisplay[mIdx]} ${year}`,
            monthKey: `${year}-${String(mIdx + 1).padStart(2, '0')}`,
          };
        }
      }
    }
  }
  return { displayDate: null, monthKey: null };
}

/**
 * Core processor for SalesProductionAgencyPerfomanceReport
 * 1. Locates "Requested Month (in total)" -> "FYCC" column (strictly distinguishing FYCC from AFYCC).
 * 2. Distinguishes "ManagerEN" column from "Agent NameEN" column so ManagerEN never overwrites Agent NameEN.
 * 3. Active Member Board: If an Active Member's Requested Month (in total) FYCC > 0, their name turns GREEN.
 * 4. Team Headcount: For each Team's Orange-row Managers (e.g. LAM HIU YING & CHOI KAI WAI in Sparks),
 *    counts rows where Agent NameEN = Manager OR ManagerEN = Manager (excluding managers of other teams).
 *    Any Headcount person (whether Active Member or not) with Requested Month (in total) FYCC > 0 counts as 1 Active!
 */
function processReportGrid(
  rows: unknown[][],
  fileName: string,
  mode: 'replace' | 'additive',
  targetMonthOverride?: string
): SyncLogEntry {
  const allMembers: Array<{ member: MemberRecord; team: TeamBoard }> = [];
  for (const team of appState.teams) {
    for (const m of getAllMembersOfTeam(team)) {
      allMembers.push({ member: m, team });
    }
  }

  const extractedDate = extractReportDateFromGrid(rows);
  const effectiveTargetMonth =
    targetMonthOverride && targetMonthOverride !== 'AUTO'
      ? targetMonthOverride
      : appState.targetMonthFilter !== 'AUTO'
      ? appState.targetMonthFilter
      : extractedDate.monthKey || 'CURRENT';

  const isMonthMatch =
    effectiveTargetMonth === 'CURRENT' ||
    !extractedDate.monthKey ||
    extractedDate.monthKey === effectiveTargetMonth;

  // 1. Find all "Requested Month (in total)" header blocks and locate the exact "FYCC", "AFYP"/"FYP", and "Case" sub-columns,
  //    PLUS detect ManagerEN, Agent Code, Agent NameEN, and District columns.
  let requestedMonthFyccColIndices: number[] = [];
  let requestedMonthFypColIndices: number[] = [];
  let requestedMonthCaseColIndices: number[] = [];
  let fallbackFyccColIndices: number[] = [];
  let fallbackFypColIndices: number[] = [];
  let fallbackCaseColIndices: number[] = [];
  let dateRangeColIndex = -1;
  let managerEnColIndex = -1;
  let agentCodeColIndex = -1;
  let agentNameEnColIndex = -1;
  let districtColIndex = -1;
  let teamColIndex = -1;
  let lisDateColIndex = -1;

  for (let r = 0; r < Math.min(rows.length, 35); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cellStr = String(row[c] ?? '').trim();
      if (!cellStr) continue;
      const lower = cellStr.toLowerCase();
      const compact = lower.replace(/[\s_-]+/g, '');

      if (lower === 'date range' || lower.includes('date range') || lower === 'period') {
        if (dateRangeColIndex === -1) dateRangeColIndex = c;
      }

      if (
        compact === 'manageren' ||
        compact === 'managernameen' ||
        compact === 'managername' ||
        compact === 'uplinemanagername' ||
        compact === 'uplinemanager' ||
        lower === 'manager'
      ) {
        if (managerEnColIndex === -1) managerEnColIndex = c;
      }

      if (
        compact === 'agentcode' ||
        compact === 'producercode' ||
        compact === 'advisorcode' ||
        compact === 'aracode'
      ) {
        if (agentCodeColIndex === -1) agentCodeColIndex = c;
      }

      if (
        compact === 'agentnameen' ||
        compact === 'agentname(en)' ||
        compact === 'agentname' ||
        compact === 'araname' ||
        compact === 'producername' ||
        compact === 'nameen'
      ) {
        if (agentNameEnColIndex === -1) agentNameEnColIndex = c;
      }

      if (
        compact === 'district' ||
        compact === 'districtname' ||
        compact === 'districthead' ||
        lower === '區域'
      ) {
        if (districtColIndex === -1) districtColIndex = c;
      }

      if (compact === 'team' || compact === 'teamname' || lower === '團隊') {
        if (teamColIndex === -1) teamColIndex = c;
      }

      if (
        lower.includes('production start date') ||
        compact === 'lisdate' ||
        compact === 'productionstartdate(lis)'
      ) {
        if (lisDateColIndex === -1) lisDateColIndex = c;
      }

      // Check if this cell is the "Requested Month (in total)" group header
      if (lower.includes('requested month (in total)') || lower === 'requested month') {
        let endCol = c;
        while (endCol + 1 < row.length && !String(row[endCol + 1] ?? '').trim()) {
          endCol++;
        }
        const maxSpanCol = Math.max(endCol, c + 4);

        for (let subR = r + 1; subR <= Math.min(rows.length - 1, r + 2); subR++) {
          const subRow = rows[subR] || [];
          for (let subC = c; subC <= Math.min(subRow.length - 1, maxSpanCol); subC++) {
            const subCell = String(subRow[subC] ?? '').trim().toUpperCase();
            if (subCell === 'FYCC' || subCell === 'FYC' || subCell.startsWith('FYCC ')) {
              if (!requestedMonthFyccColIndices.includes(subC)) {
                requestedMonthFyccColIndices.push(subC);
              }
            } else if (subCell === 'AFYP' || subCell === 'FYP' || subCell.startsWith('AFYP')) {
              if (!requestedMonthFypColIndices.includes(subC)) {
                requestedMonthFypColIndices.push(subC);
              }
            } else if (
              subCell === 'CASE' ||
              subCell === 'CASES' ||
              subCell === '件數' ||
              subCell.startsWith('CASE ')
            ) {
              if (!requestedMonthCaseColIndices.includes(subC)) {
                requestedMonthCaseColIndices.push(subC);
              }
            }
          }
        }
      }

      const upper = cellStr.toUpperCase();
      if (
        upper === 'FYCC' ||
        upper === 'FYC' ||
        (upper.includes('FYCC') && !upper.includes('AFYCC'))
      ) {
        if (!fallbackFyccColIndices.includes(c)) {
          fallbackFyccColIndices.push(c);
        }
      } else if (upper === 'AFYP' || upper === 'FYP') {
        if (!fallbackFypColIndices.includes(c)) {
          fallbackFypColIndices.push(c);
        }
      } else if (upper === 'CASE' || upper === 'CASES' || upper === '件數') {
        if (!fallbackCaseColIndices.includes(c)) {
          fallbackCaseColIndices.push(c);
        }
      }
    }
  }

  // Fallback pattern detection for ManagerEN / Agent Code / Agent NameEN when headers are merged or omitted:
  if (agentNameEnColIndex === -1 || managerEnColIndex === -1) {
    for (let r = 0; r < Math.min(rows.length, 60); r++) {
      const row = rows[r] || [];
      for (let c = 2; c < Math.min(row.length - 1, 10); c++) {
        const codeCandidate = String(row[c] ?? '').trim();
        if (/^\d{5,8}$/.test(codeCandidate)) {
          const prev2 = String(row[c - 2] ?? '').trim();
          const next1 = String(row[c + 1] ?? '').trim();
          if (
            /^[A-Za-z\s]{3,}$/.test(prev2) &&
            /^[A-Za-z\s]{3,}$/.test(next1)
          ) {
            if (managerEnColIndex === -1) managerEnColIndex = c - 2;
            if (agentCodeColIndex === -1) agentCodeColIndex = c;
            if (agentNameEnColIndex === -1) agentNameEnColIndex = c + 1;
            break;
          }
        }
      }
      if (agentNameEnColIndex !== -1 && managerEnColIndex !== -1) break;
    }
  }

  const hasColT =
    requestedMonthFyccColIndices.includes(19) || fallbackFyccColIndices.includes(19);

  const activeFyccCols = hasColT
    ? [19]
    : requestedMonthFyccColIndices.length > 0
    ? [requestedMonthFyccColIndices[0]]
    : fallbackFyccColIndices.length > 0
    ? [fallbackFyccColIndices[0]]
    : [];

  const activeFypCols = hasColT
    ? [17]
    : requestedMonthFypColIndices.length > 0
    ? [requestedMonthFypColIndices[0]]
    : fallbackFypColIndices.length > 0
    ? [fallbackFypColIndices[0]]
    : [];

  const activeCaseCols = hasColT
    ? [18]
    : requestedMonthCaseColIndices.length > 0
    ? [requestedMonthCaseColIndices[0]]
    : fallbackCaseColIndices.length > 0
    ? [fallbackCaseColIndices[0]]
    : [];

  const extractNumericFromCols = (
    row: unknown[],
    cols: number[],
    preferredIdx?: number
  ): number | null => {
    if (cols.length > 0) {
      const orderedCols = [...cols].sort((a, b) =>
        preferredIdx !== undefined
          ? a === preferredIdx
            ? -1
            : b === preferredIdx
            ? 1
            : a - b
          : a - b
      );
      const primaryCol = orderedCols[0];
      if (primaryCol < row.length) {
        const val = parseFyccValue(row[primaryCol]);
        return val !== null ? val : 0;
      }
      return 0;
    }
    return null;
  };

  // Helper to extract FYCC from a row (Strictly Column T = index 19 when present)
  const extractRowFycc = (row: unknown[]): number | null => {
    if (hasColT || agentNameEnColIndex !== -1) {
      if (19 < row.length) {
        const val = parseFyccValue(row[19]);
        return val !== null ? val : 0;
      }
    }
    const fromCols = extractNumericFromCols(row, activeFyccCols, 19);
    if (fromCols !== null) return fromCols;
    if (activeFyccCols.length === 0) {
      for (let c = row.length - 1; c >= 0; c--) {
        const parsed = parseFyccValue(row[c]);
        if (parsed !== null && String(row[c]).trim() !== '') {
          return parsed;
        }
      }
    }
    return null;
  };

  const extractRowFyp = (row: unknown[]): number => {
    if (hasColT || agentNameEnColIndex !== -1) {
      if (17 < row.length) {
        const val = parseFyccValue(row[17]);
        return val !== null ? val : 0;
      }
    }
    const fromCols = extractNumericFromCols(row, activeFypCols, 17);
    if (fromCols !== null) return fromCols;
    // In standard Requested Month (in total): Col R (fyccCol - 2) is AFYP
    if (activeFyccCols.length > 0 && activeFyccCols[0] >= 2) {
      const val = parseFyccValue(row[activeFyccCols[0] - 2]);
      if (val !== null) return val;
    }
    return 0;
  };

  const extractRowCases = (row: unknown[]): number => {
    if (hasColT || agentNameEnColIndex !== -1) {
      if (18 < row.length) {
        const val = parseFyccValue(row[18]);
        return val !== null ? val : 0;
      }
    }
    const fromCols = extractNumericFromCols(row, activeCaseCols, 18);
    if (fromCols !== null) return fromCols;
    // In standard Requested Month (in total): Col S (fyccCol - 1) is Case
    if (activeFyccCols.length > 0 && activeFyccCols[0] >= 1) {
      const val = parseFyccValue(row[activeFyccCols[0] - 1]);
      if (val !== null) return val;
    }
    return 0;
  };

  // Collect structured report rows (when ManagerEN & Agent NameEN exist) for Team Headcount & PP Raw Analytics
  interface ParsedAgentRow {
    agentCode: string;
    agentNameEN: string;
    agentNameCN: string;
    managerEN: string;
    managerCN: string;
    district?: string;
    team?: string;
    lisDate?: string;
    fycc: number;
    fyp: number;
    cases: number;
  }
  const structuredAgentRows: ParsedAgentRow[] = [];

  // Map from member.id -> parsed result for Active Member board
  const memberResults = new Map<
    string,
    {
      member: MemberRecord;
      team: TeamBoard;
      fycc: number;
      fyp: number;
      cases: number;
      dateRange: string;
    }
  >();

  let currentCarryAgent: { member: MemberRecord; team: TeamBoard } | null = null;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row || row.length === 0) continue;

    let rowAgent: { member: MemberRecord; team: TeamBoard } | null = null;

    if (agentNameEnColIndex !== -1) {
      // Structured report mode: ONLY match Agent from Agent NameEN column (never from ManagerEN column!)
      const rawAgentName = String(row[agentNameEnColIndex] ?? '').trim();
      const rawManagerName =
        managerEnColIndex !== -1 ? String(row[managerEnColIndex] ?? '').trim() : '';
      const rawAgentCode =
        agentCodeColIndex !== -1 ? String(row[agentCodeColIndex] ?? '').trim() : '';
      const rawDistrict =
        districtColIndex !== -1 ? String(row[districtColIndex] ?? '').trim() : '';
      const rawTeam =
        teamColIndex !== -1 ? String(row[teamColIndex] ?? '').trim() : '';
      const rawLisDate =
        lisDateColIndex !== -1 ? String(row[lisDateColIndex] ?? '').trim() : '';

      const upperAgent = rawAgentName.toUpperCase();
      const upperMgr = rawManagerName.toUpperCase();
      const isHeaderOrTotal =
        !rawAgentName ||
        upperAgent === 'AGENT NAMEEN' ||
        upperAgent === 'AGENT NAME' ||
        upperAgent === 'ARA NAME' ||
        upperAgent === 'MERGE' ||
        rawAgentCode.toLowerCase() === 'merge' ||
        upperMgr.includes('WHOLE TREE') ||
        upperMgr.includes('TOTAL') ||
        upperAgent.includes('TOTAL') ||
        upperAgent.includes('SUB-TOTAL') ||
        upperAgent.includes('SUBTOTAL') ||
        upperAgent === 'NAME';

      if (!isHeaderOrTotal && /^[A-Za-z]/.test(rawAgentName)) {
        const fyccVal = extractRowFycc(row) ?? 0;
        const fypVal = extractRowFyp(row);
        const caseVal = extractRowCases(row);
        structuredAgentRows.push({
          agentCode: rawAgentCode,
          agentNameEN: normalizeName(rawAgentName),
          agentNameCN:
            agentNameEnColIndex + 1 < row.length
              ? String(row[agentNameEnColIndex + 1] ?? '').trim()
              : '',
          managerEN: normalizeName(rawManagerName),
          managerCN:
            managerEnColIndex !== -1 && managerEnColIndex + 1 < row.length
              ? String(row[managerEnColIndex + 1] ?? '').trim()
              : '',
          district: rawDistrict || undefined,
          team: rawTeam || undefined,
          lisDate: rawLisDate || undefined,
          fycc: fyccVal,
          fyp: fypVal,
          cases: caseVal,
        });

        // Match against Active Member board
        rowAgent = matchMemberInCell(rawAgentName, allMembers);
        if (!rowAgent && rawAgentCode) {
          rowAgent =
            allMembers.find((item) => item.member.agentCode === rawAgentCode) || null;
        }
      }
    } else {
      // Generic / Pasted mode without a separate ManagerEN column
      for (let c = 0; c < row.length; c++) {
        if (activeFyccCols.includes(c)) continue;
        const val = String(row[c] ?? '').trim();
        if (!val || val.length < 3) continue;
        const matched = matchMemberInCell(val, allMembers);
        if (matched) {
          rowAgent = matched;
          currentCarryAgent = matched;
          break;
        }
      }
    }

    let rowHasRequestedMonthLabel = false;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] ?? '').trim().toLowerCase();
      if (val.includes('requested month (in total)')) {
        rowHasRequestedMonthLabel = true;
        break;
      }
    }

    if (rowHasRequestedMonthLabel && !rowAgent && !currentCarryAgent) {
      continue;
    }

    const activeAgentForRow =
      rowAgent ||
      (agentNameEnColIndex === -1 && rowHasRequestedMonthLabel
        ? currentCarryAgent
        : null);
    if (!activeAgentForRow) continue;

    const extractedFycc = extractRowFycc(row);
    if (extractedFycc === null) continue;
    const extractedFyp = extractRowFyp(row);
    const extractedCases = extractRowCases(row);

    const existing = memberResults.get(activeAgentForRow.member.id);
    if (!existing) {
      memberResults.set(activeAgentForRow.member.id, {
        member: activeAgentForRow.member,
        team: activeAgentForRow.team,
        fycc: extractedFycc,
        fyp: extractedFyp,
        cases: extractedCases,
        dateRange: 'Requested Month (in total)',
      });
    } else {
      if (rowHasRequestedMonthLabel) {
        existing.fycc = extractedFycc;
        existing.fyp = extractedFyp;
        existing.cases = extractedCases;
      } else if (Math.abs(extractedFycc) > 0 || Math.abs(extractedFyp) > 0 || Math.abs(extractedCases) > 0) {
        existing.fycc = existing.fycc + extractedFycc;
        existing.fyp = existing.fyp + extractedFyp;
        existing.cases = existing.cases + extractedCases;
      }
    }
  }

  // Apply updates if the report matches target month
  const nowIso = new Date().toISOString();
  const details: SyncLogEntry['details'] = [];
  const activatedNames: string[] = [];

  if (isMonthMatch) {
    if (extractedDate.displayDate) {
      appState.reportDateDisplay = extractedDate.displayDate;
    }

    // 1. Update Active Member Board status (FYCC > 0 -> Green!)
    for (const { member, team } of allMembers) {
      const matched = memberResults.get(member.id);
      if (matched) {
        const isPositiveFycc = matched.fycc > 0;
        if (mode === 'replace') {
          member.isActive = isPositiveFycc;
          member.fycc = matched.fycc;
          member.fyp = matched.fyp;
          member.cases = matched.cases;
        } else {
          if (isPositiveFycc) {
            member.isActive = true;
            member.fycc = matched.fycc;
            member.fyp = matched.fyp;
            member.cases = matched.cases;
          }
        }
        member.dateRange = matched.dateRange;
        member.lastUpdated = nowIso;

        if (member.isActive) {
          activatedNames.push(`${member.fullName} (${member.nickname || team.name})`);
        }

        details.push({
          memberName: `${member.fullName}${member.nickname ? ' ' + member.nickname : ''}`,
          teamName: team.name,
          dateRange: matched.dateRange,
          fycc: matched.fycc,
          fyp: matched.fyp,
          cases: matched.cases,
          turnedGreen: isPositiveFycc,
        });
      } else if (mode === 'replace' && memberResults.size > 0) {
        member.isActive = false;
        member.fycc = 0;
        member.fyp = 0;
        member.cases = 0;
        member.lastUpdated = nowIso;
      }
    }

    // 2. Calculate Team Headcount & Active for each Team when structured ManagerEN + Agent NameEN rows are present!
    const nameMatchesMember = (rowName: string, memberFullName: string): boolean => {
      const nRow = normalizeName(rowName);
      const nMem = normalizeName(memberFullName);
      if (!nRow || !nMem) return false;
      if (nRow === nMem || nRow.includes(nMem) || nMem.includes(nRow)) return true;
      const memTokens = nMem.split(' ').filter(Boolean);
      const rowTokens = nRow.split(' ').filter(Boolean);
      return memTokens.length >= 2 && memTokens.every((t) => rowTokens.includes(t));
    };

    if (structuredAgentRows.length > 0) {
      for (const team of appState.teams) {
        const teamBoardMembers = getAllMembersOfTeam(team);
        const teamManagers = teamBoardMembers.filter((m) => m.isLeaderRow);
        const otherTeamsMembers = allMembers
          .filter((item) => item.team.id !== team.id)
          .map((item) => item.member);

        const matchedHeadcountMap = new Map<string, HeadcountMemberRecord>();

        for (const rRow of structuredAgentRows) {
          const isThisTeamManager = teamManagers.some((mgr) =>
            nameMatchesMember(rRow.agentNameEN, mgr.fullName)
          );

          const isOnThisTeamBoard = teamBoardMembers.some((bm) =>
            nameMatchesMember(rRow.agentNameEN, bm.fullName)
          );

          const belongsToOtherTeam =
            !isOnThisTeamBoard &&
            otherTeamsMembers.some((om) =>
              nameMatchesMember(rRow.agentNameEN, om.fullName)
            );

          if (belongsToOtherTeam) continue;

          const managerIsThisTeamManager = teamManagers.some((mgr) =>
            nameMatchesMember(rRow.managerEN, mgr.fullName)
          );

          if (isThisTeamManager || isOnThisTeamBoard || managerIsThisTeamManager) {
            const key = rRow.agentCode || rRow.agentNameEN;
            const existing = matchedHeadcountMap.get(key);
            if (!existing) {
              matchedHeadcountMap.set(key, {
                agentCode: rRow.agentCode,
                agentNameEN: rRow.agentNameEN,
                agentNameCN: rRow.agentNameCN,
                managerEN: rRow.managerEN,
                managerCN: rRow.managerCN,
                fycc: rRow.fycc,
                fyp: rRow.fyp,
                cases: rRow.cases,
                team: team.name,
                district: team.district || 'Paggie Law',
                isActive: rRow.fycc > 0,
                isOnActiveBoard: isOnThisTeamBoard,
                isTeamManager: isThisTeamManager,
              });
            } else if (rRow.fycc > 0 || rRow.fyp > 0 || rRow.cases > 0) {
              existing.fycc += rRow.fycc;
              existing.fyp = (existing.fyp || 0) + rRow.fyp;
              existing.cases = (existing.cases || 0) + rRow.cases;
              existing.isActive = existing.fycc > 0;
            }
          }
        }

        if (matchedHeadcountMap.size > 0) {
          team.headcountMembers = Array.from(matchedHeadcountMap.values());
          team.teamHeadcountDenominator = team.headcountMembers.length;
        }
      }
    }

    // 3. Also sync FYC / FYP / Cases into appState.headcountRoster for the PP Raw & Headcount Dashboard
    if (!Array.isArray(appState.headcountRoster) || appState.headcountRoster.length === 0) {
      appState.headcountRoster = buildInitialHeadcountRoster(appState.teams);
    }

    if (mode === 'replace' && (memberResults.size > 0 || structuredAgentRows.length > 0)) {
      for (const hc of appState.headcountRoster) {
        hc.fyc = 0;
        hc.fyp = 0;
        hc.cases = 0;
        hc.isActive = false;
      }
    }

    // First sync from structuredAgentRows if available
    if (structuredAgentRows.length > 0) {
      for (const rRow of structuredAgentRows) {
        let foundHc = appState.headcountRoster.find(
          (hc) =>
            (rRow.agentCode && hc.agentCode === rRow.agentCode) ||
            nameMatchesMember(rRow.agentNameEN, hc.araName)
        );
        if (foundHc) {
          foundHc.fyc = rRow.fycc;
          foundHc.fyp = rRow.fyp;
          foundHc.cases = rRow.cases;
          foundHc.isActive = rRow.fycc > 0;
          if (!foundHc.araName && rRow.agentNameEN) {
            foundHc.araName = rRow.agentNameEN;
            foundHc.nameHkid = rRow.agentNameEN;
          }
          if (rRow.managerEN && !foundHc.uplineManagerName) {
            foundHc.uplineManagerName = rRow.managerEN;
          }
          if (rRow.team && !foundHc.team) {
            const cTeam = canonicalizeHeadcountTeam(rRow.team);
            foundHc.team = cTeam;
            foundHc.district = cTeam;
          }
          if (rRow.lisDate && !foundHc.productionStartDateLis) {
            foundHc.productionStartDateLis = rRow.lisDate;
          }
        } else if (!appState.lastHeadcountSync) {
          // Resolve which Headcount Team this agent belongs to via managerEN only when no Headcount Excel is loaded
          const resolved = resolveTeamAndDistrictForAgent(
            rRow.agentNameEN,
            rRow.managerEN,
            rRow.team,
            rRow.district
          );
          appState.headcountRoster.push({
            id: `hc-raw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            agentCode: rRow.agentCode || '',
            araName: rRow.agentNameEN,
            nameHkid: rRow.agentNameEN,
            nickname: '',
            uplineManagerName: rRow.managerEN || resolved.defaultManager,
            team: resolved.teamName,
            district: resolved.districtName,
            productionStartDateLis: rRow.lisDate || '15/05/2025',
            rank: 'Advisor',
            fyc: rRow.fycc,
            fyp: rRow.fyp,
            cases: rRow.cases,
            isActive: rRow.fycc > 0,
          });
        }
      }
    } else {
      // Otherwise sync from memberResults
      for (const [, resItem] of memberResults.entries()) {
        const foundHc = appState.headcountRoster.find(
          (hc) =>
            (resItem.member.agentCode && hc.agentCode === resItem.member.agentCode) ||
            nameMatchesMember(resItem.member.fullName, hc.araName)
        );
        if (foundHc) {
          foundHc.fyc = resItem.fycc;
          foundHc.fyp = resItem.fyp;
          foundHc.cases = resItem.cases;
          foundHc.isActive = resItem.fycc > 0;
        }
      }
    }

    // Re-run recursive Team Headcount allocation so Active counts on Team Headcount cards stay synced
    if (appState.lastHeadcountSync && appState.headcountRoster.length > 0) {
      allocateTeamHeadcountsFromRoster(appState.teams, appState.headcountRoster);
    }
  }

  const logEntry: SyncLogEntry = {
    id: `sync-${Date.now()}`,
    timestamp: nowIso,
    fileName,
    reportDateRange: extractedDate.displayDate || 'Requested Month (in total)',
    targetMonth: effectiveTargetMonth,
    isCurrentMonthMatch: isMonthMatch,
    matchedCount: memberResults.size,
    activatedNames,
    mode,
    details,
  };

  appState.lastSync = logEntry;
  appState.syncHistory = [logEntry, ...appState.syncHistory.slice(0, 19)];
  saveState(appState);

  return logEntry;
}

/**
 * Helper: Resolve Headcount Team (from Column B "Team" of Headcount file, e.g.
 * "PAGGIE LAW", "JERRY LO", "LAW SUK MING", "JACKY YEUNG", "TSE MAN PO ANDY",
 * "LAU KA HIN ANTHONY", "KENNY KWONG", "CLOVIS CHANG", "CECI CHAN", "WINNIE WONG", "LINCOLN TZAN")
 */
function resolveTeamAndDistrictForAgent(
  araName: string,
  uplineManagerName: string,
  explicitTeam?: string,
  explicitDistrict?: string
): { teamName: string; districtName: string; defaultManager: string } {
  const normAra = normalizeName(araName);
  const normMgr = normalizeName(uplineManagerName);
  const rawTeamTrimmed = (explicitTeam || explicitDistrict || '').trim();

  // 1. If the Headcount file explicitly provides a Team in Column B, ALWAYS preserve it!
  if (rawTeamTrimmed) {
    const canonical = canonicalizeHeadcountTeam(rawTeamTrimmed);
    return {
      teamName: canonical,
      districtName: canonical,
      defaultManager: uplineManagerName || canonical,
    };
  }

  // 2. If syncing from SalesProductionReport without a Team column, check if manager/agent is already in headcountRoster
  if (Array.isArray(appState.headcountRoster) && appState.headcountRoster.length > 0) {
    const byMgr = appState.headcountRoster.find(
      (hc) =>
        hc.team &&
        (normalizeName(hc.uplineManagerName) === normMgr ||
          normalizeName(hc.araName) === normMgr)
    );
    if (byMgr && byMgr.team) {
      const cTeam = canonicalizeHeadcountTeam(byMgr.team);
      return {
        teamName: cTeam,
        districtName: cTeam,
        defaultManager: uplineManagerName || byMgr.uplineManagerName,
      };
    }
  }

  // 3. Match by known Upline Manager hierarchy for the agency's Teams
  const combined = `${normAra} ${normMgr}`;
  if (
    combined.includes('LO CHAK WAI') ||
    combined.includes('JERRY') ||
    combined.includes('TSE WAI KONG') ||
    combined.includes('YU ZHILEI') ||
    combined.includes('NG KA LEUNG') ||
    combined.includes('LOH SOO PENG') ||
    combined.includes('CHAN CHI CHUEN')
  ) {
    return {
      teamName: 'JERRY LO',
      districtName: 'JERRY LO',
      defaultManager: uplineManagerName || 'LO CHAK WAI',
    };
  }
  if (
    combined.includes('LAW SUK MING') ||
    combined.includes('SO KIT YEE') ||
    combined.includes('CHEUK YUE NING')
  ) {
    return {
      teamName: 'LAW SUK MING',
      districtName: 'LAW SUK MING',
      defaultManager: uplineManagerName || 'LAW SUK MING',
    };
  }
  if (
    combined.includes('JACKY YEUNG') ||
    combined.includes('YEUNG WAI HUNG') ||
    combined.includes('CHAN HIU MING') ||
    combined.includes('YING HUNG HIU') ||
    combined.includes('WONG SUET YING') ||
    combined.includes('WONG YAT LONG') ||
    combined.includes('CHOI CHUNG YAN') ||
    combined.includes('NG PAK LAM') ||
    combined.includes('NG WAI TING') ||
    combined.includes('WANG WENLI')
  ) {
    return {
      teamName: 'JACKY YEUNG',
      districtName: 'JACKY YEUNG',
      defaultManager: uplineManagerName || 'JACKY YEUNG',
    };
  }
  if (
    combined.includes('TSE MAN PO') ||
    combined.includes('YUN SHING HUNG') ||
    combined.includes('IU KAR CHEUK') ||
    combined.includes('MOK PAK YUEN') ||
    combined.includes('HO WA KIT') ||
    combined.includes('WONG TSZ CHIU')
  ) {
    return {
      teamName: 'TSE MAN PO ANDY',
      districtName: 'TSE MAN PO ANDY',
      defaultManager: uplineManagerName || 'TSE MAN PO ANDY',
    };
  }
  if (
    combined.includes('LAU KA HIN') ||
    combined.includes('WU JINGHUA') ||
    combined.includes('CHEUNG KAR PO')
  ) {
    return {
      teamName: 'LAU KA HIN ANTHONY',
      districtName: 'LAU KA HIN ANTHONY',
      defaultManager: uplineManagerName || 'LAU KA HIN ANTHONY',
    };
  }
  if (
    combined.includes('WONG WAI YEE') ||
    combined.includes('WINNIE WONG') ||
    combined.includes('NG KA LAI') ||
    combined.includes('CHAN KWOK CHING') ||
    combined.includes('LUI KAM YEE') ||
    combined.includes('NGAI HIU WA') ||
    combined.includes('CHOW TSZ HIM')
  ) {
    return {
      teamName: 'WINNIE WONG',
      districtName: 'WINNIE WONG',
      defaultManager: uplineManagerName || 'WONG WAI YEE',
    };
  }
  if (
    combined.includes('KWONG KA MING') ||
    combined.includes('KENNY KWONG') ||
    combined.includes('WEI GUOJIN') ||
    combined.includes('WU TSZ YAN') ||
    combined.includes('PANG YIU KEI') ||
    combined.includes('CHAN KA YAN') ||
    combined.includes('WONG LAI YUE') ||
    combined.includes('CHEUNG CHI MAN')
  ) {
    return {
      teamName: 'KENNY KWONG',
      districtName: 'KENNY KWONG',
      defaultManager: uplineManagerName || 'KWONG KA MING',
    };
  }
  if (
    combined.includes('CHANG KWOK HO') ||
    combined.includes('CLOVIS CHANG') ||
    combined.includes('CHEN YUEN FONG') ||
    combined.includes('LAM TAK SHING') ||
    combined.includes('CHUNG YUEN MAN') ||
    combined.includes('LEUNG SHEK MAN') ||
    combined.includes('TSUI PUI CHI') ||
    combined.includes('PENG HO MAN') ||
    combined.includes('ZHANG MEIJIA')
  ) {
    return {
      teamName: 'CLOVIS CHANG',
      districtName: 'CLOVIS CHANG',
      defaultManager: uplineManagerName || 'CHANG KWOK HO',
    };
  }
  if (
    combined.includes('CHAN CHI FAI') ||
    combined.includes('CECI CHAN') ||
    combined.includes('CHAN WING SEE') ||
    combined.includes('TAK MAN HIN') ||
    combined.includes('SIU CHUN HO')
  ) {
    return {
      teamName: 'CECI CHAN',
      districtName: 'CECI CHAN',
      defaultManager: uplineManagerName || 'CHAN CHI FAI ELLIS',
    };
  }
  if (
    combined.includes('LINCOLN TZAN') ||
    combined.includes('LEUNG CHING YAN') ||
    combined.includes('LO KI KI')
  ) {
    return {
      teamName: 'LINCOLN TZAN',
      districtName: 'LINCOLN TZAN',
      defaultManager: uplineManagerName || 'LINCOLN TZAN',
    };
  }

  return {
    teamName: 'PAGGIE LAW',
    districtName: 'PAGGIE LAW',
    defaultManager: uplineManagerName || 'LAW SUK KING',
  };
}

/**
 * Step 1 Processor: Headcount File Upload (.xlsx / .xls / .csv)
 * Automatically reads:
 * - Upline Manager Name
 * - ARA Name (and/or Agent Name)
 * - Team (Column B: e.g. PAGGIE LAW, JERRY LO, LAW SUK MING, JACKY YEUNG, TSE MAN PO ANDY, etc.)
 * - Production Start Date (LIS)
 * Builds the team hierarchy structure, calculates recruitment & downline stats,
 * and populates the Team multi-select options.
 */
function processHeadcountGrid(rows: unknown[][], fileName: string): HeadcountSyncLog {
  let headerRowIdx = -1;
  let nameHkidCol = -1;
  let chineseNameCol = -1;
  let uplineCol = -1;
  let uplineCodeCol = -1;
  let araNameCol = -1;
  let agentNameCol = -1;
  let teamCol = -1;
  let lisDateCol = -1;
  let districtCol = -1;
  let codeCol = -1;
  let nicknameCol = -1;
  let rankCol = -1;
  let fycCol = -1;
  let fypCol = -1;
  let caseCol = -1;

  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r] || [];
    let matchedHeaders = 0;

    for (let c = 0; c < row.length; c++) {
      const raw = String(row[c] ?? '').trim();
      if (!raw) continue;
      const lower = raw.toLowerCase();
      const compact = lower.replace(/[\s_()/-]+/g, '');

      if (
        compact.includes('namehkid') ||
        lower.includes('name (hkid)') ||
        lower.includes('name(hkid)') ||
        compact === 'hkidname' ||
        (lower.includes('hkid') && lower.includes('name'))
      ) {
        nameHkidCol = c;
        matchedHeaders++;
      } else if (
        compact === 'chinesename' ||
        lower === 'chinese name' ||
        lower.includes('中文姓名')
      ) {
        if (chineseNameCol === -1) chineseNameCol = c;
      } else if (
        compact.includes('uplinemanager') ||
        compact === 'managername' ||
        compact === 'manageren' ||
        compact === 'managernameen' ||
        compact === 'managercode' ||
        compact === 'uplinecode' ||
        compact === 'supervisor' ||
        lower === 'upline manager name' ||
        lower === 'manager' ||
        lower.includes('上線經理') ||
        lower.includes('主管')
      ) {
        const isCodeHeader =
          compact.includes('code') || compact.includes('id') || compact.includes('no');
        const isNameHeader = compact.includes('name') || lower.includes('name');
        if (isCodeHeader) {
          if (uplineCodeCol === -1) uplineCodeCol = c;
        } else if (isNameHeader) {
          if (uplineCol !== -1 && uplineCodeCol === -1) {
            uplineCodeCol = uplineCol;
          }
          uplineCol = c;
        } else {
          if (uplineCol === -1) uplineCol = c;
        }
        matchedHeaders++;
      } else if (
        compact === 'araname' ||
        compact.includes('araname') ||
        lower === 'ara name' ||
        compact === 'ara'
      ) {
        if (araNameCol === -1) araNameCol = c;
        matchedHeaders++;
      } else if (
        compact === 'englishname' ||
        compact === 'engname' ||
        compact === 'nickname' ||
        compact === 'preferredname' ||
        compact === 'alias' ||
        lower.includes('別名')
      ) {
        if (nicknameCol === -1) nicknameCol = c;
      } else if (
        compact === 'agentname' ||
        compact === 'agentnameen' ||
        compact === 'agentenglishname' ||
        compact === 'fullname' ||
        compact === 'advisorname' ||
        compact === 'producername' ||
        compact === 'membername' ||
        compact === 'staffname' ||
        compact === 'wmname' ||
        compact === 'roname' ||
        lower === 'name' ||
        lower.includes('顧問姓名') ||
        lower === '姓名'
      ) {
        if (agentNameCol === -1) agentNameCol = c;
        matchedHeaders++;
      } else if (
        compact === 'team' ||
        compact === 'teamname' ||
        compact === 'agencyteam' ||
        compact === 'unit' ||
        lower.includes('團隊') ||
        lower.includes('組別')
      ) {
        if (teamCol === -1) teamCol = c;
        matchedHeaders++;
      } else if (
        compact.includes('productionstartdate') ||
        compact.includes('lisdate') ||
        compact === 'lis' ||
        compact === 'joindate' ||
        compact === 'startdate' ||
        compact === 'appointmentdate' ||
        lower.includes('入職日期') ||
        lower.includes('生效日期')
      ) {
        if (lisDateCol === -1) lisDateCol = c;
        matchedHeaders++;
      } else if (
        compact === 'district' ||
        compact === 'districtname' ||
        compact === 'districthead' ||
        compact === 'zone' ||
        compact === 'region' ||
        lower.includes('區域') ||
        lower.includes('分區')
      ) {
        if (districtCol === -1) districtCol = c;
        matchedHeaders++;
      } else if (
        compact === 'agentcode' ||
        compact === 'aracode' ||
        compact === 'code' ||
        compact === 'producercode' ||
        lower.includes('編號')
      ) {
        if (codeCol === -1) codeCol = c;
      } else if (compact === 'rank' || compact === 'title' || compact === 'grade' || lower.includes('職級')) {
        if (rankCol === -1) rankCol = c;
      } else if (compact === 'fyc' || compact === 'fycc') {
        if (fycCol === -1) fycCol = c;
      } else if (compact === 'fyp' || compact === 'afyp') {
        if (fypCol === -1) fypCol = c;
      } else if (compact === 'case' || compact === 'cases' || lower.includes('件數')) {
        if (caseCol === -1) caseCol = c;
      }
    }

    if (
      matchedHeaders >= 2 &&
      (nameHkidCol !== -1 || araNameCol !== -1 || agentNameCol !== -1 || teamCol !== -1)
    ) {
      headerRowIdx = r;
      break;
    }
  }

  // Fallback column positions if header names were custom or missing
  if (headerRowIdx === -1) {
    headerRowIdx = 0;
    uplineCol = 0;
    araNameCol = 1;
    teamCol = 2;
    lisDateCol = 3;
    districtCol = 4;
  }

  // If uplineCol points to 6-digit codes and the next column has manager names, separate uplineCodeCol and uplineCol
  if (uplineCol !== -1 && rows.length > headerRowIdx + 3) {
    let codeCount = 0;
    for (let r = headerRowIdx + 1; r < Math.min(rows.length, headerRowIdx + 12); r++) {
      const v = String(rows[r]?.[uplineCol] ?? '').trim();
      if (/^\d{5,7}$/.test(v)) codeCount++;
    }
    if (codeCount >= 3) {
      if (uplineCodeCol === -1) uplineCodeCol = uplineCol;
      // Check if uplineCol + 1 has manager names
      const nextCol = uplineCol + 1;
      let nextHasText = 0;
      for (let r = headerRowIdx + 1; r < Math.min(rows.length, headerRowIdx + 12); r++) {
        const nv = extractEnglishName(String(rows[r]?.[nextCol] ?? ''));
        if (nv.length >= 3) nextHasText++;
      }
      if (nextHasText >= 3 && nextCol !== nameHkidCol && nextCol !== teamCol && nextCol !== araNameCol) {
        uplineCol = nextCol;
      }
    }
  }

  // Explicitly prioritize Column D (0-indexed column 3) of Headcount Excel for Name (HKID)
  if (nameHkidCol === -1 && rows.length > headerRowIdx + 2) {
    let colDNameCount = 0;
    for (let r = headerRowIdx + 1; r < Math.min(rows.length, headerRowIdx + 30); r++) {
      const colDCell = String(rows[r]?.[3] ?? '').trim();
      const eng = extractEnglishName(colDCell);
      if (eng.length >= 3 && !/^\d+$/.test(colDCell)) {
        colDNameCount++;
      }
    }
    if (colDNameCount >= 3) {
      nameHkidCol = 3; // Column D of Headcount Excel
    }
  }

  // If neither nameHkidCol nor agentNameCol was detected by header keyword or Column D,
  // scan data columns to find the column containing individual agent names
  if (nameHkidCol === -1 && agentNameCol === -1 && rows.length > headerRowIdx + 5) {
    const usedCols = new Set(
      [
        uplineCol,
        uplineCodeCol,
        araNameCol,
        teamCol,
        lisDateCol,
        districtCol,
        codeCol,
        nicknameCol,
        rankCol,
        fycCol,
        fypCol,
        caseCol,
      ].filter((idx) => idx !== -1)
    );
    const sampleLimit = Math.min(rows.length, headerRowIdx + 120);
    const maxCols = Math.max(
      ...rows.slice(headerRowIdx, sampleLimit).map((r) => (r ? r.length : 0)),
      0
    );
    let bestCol = -1;
    let bestUniqueCount = 0;

    for (let c = 0; c < maxCols; c++) {
      if (usedCols.has(c)) continue;
      let validNameRows = 0;
      const uniqueVals = new Set<string>();
      for (let r = headerRowIdx + 1; r < sampleLimit; r++) {
        const rawCell = String(rows[r]?.[c] ?? '').trim();
        const eng = extractEnglishName(rawCell);
        if (eng.length >= 4 && eng.includes(' ')) {
          validNameRows++;
          uniqueVals.add(eng);
        }
      }
      if (
        validNameRows >= 15 &&
        uniqueVals.size > bestUniqueCount &&
        uniqueVals.size >= validNameRows * 0.5
      ) {
        bestUniqueCount = uniqueVals.size;
        bestCol = c;
      }
    }
    if (bestCol !== -1) {
      nameHkidCol = bestCol;
    }
  }

  // Build maps of existing FYC / FYP / Cases by Name AND by Agent Code
  const existingMetricsByName = new Map<
    string,
    { fyc: number; fyp: number; cases: number; agentCode: string; nickname: string; name: string }
  >();
  const existingMetricsByCode = new Map<
    string,
    { fyc: number; fyp: number; cases: number; agentCode: string; nickname: string; name: string }
  >();

  if (Array.isArray(appState.headcountRoster)) {
    for (const item of appState.headcountRoster) {
      const entry = {
        fyc: item.fyc,
        fyp: item.fyp,
        cases: item.cases,
        agentCode: item.agentCode,
        nickname: item.nickname || '',
        name: item.araName,
      };
      existingMetricsByName.set(normalizeName(item.araName), entry);
      if (item.agentCode) {
        existingMetricsByCode.set(item.agentCode.trim(), entry);
      }
    }
  }
  for (const team of appState.teams) {
    for (const m of getAllMembersOfTeam(team)) {
      const key = normalizeName(m.fullName);
      const prev = existingMetricsByName.get(key);
      const entry = {
        fyc: m.fycc || prev?.fyc || 0,
        fyp: m.fyp || prev?.fyp || (m.fycc ? m.fycc * 2.5 : 0),
        cases: m.cases || prev?.cases || (m.fycc > 0 ? 1 : 0),
        agentCode: m.agentCode || prev?.agentCode || '',
        nickname: m.nickname || prev?.nickname || '',
        name: m.fullName,
      };
      existingMetricsByName.set(key, entry);
      if (entry.agentCode) {
        existingMetricsByCode.set(entry.agentCode.trim(), entry);
      }
    }
  }

  const parsedEntries: HeadcountRosterEntry[] = [];
  const seenKeys = new Set<string>();

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row || row.length === 0) continue;

    const rawColD = row.length > 3 ? String(row[3] ?? '').trim() : '';
    const rawNameHkid =
      (nameHkidCol !== -1 ? String(row[nameHkidCol] ?? '').trim() : '') || rawColD;
    const rawChineseName =
      chineseNameCol !== -1 ? String(row[chineseNameCol] ?? '').trim() : '';
    const rawAgentName = agentNameCol !== -1 ? String(row[agentNameCol] ?? '').trim() : '';
    const rawAraName = araNameCol !== -1 ? String(row[araNameCol] ?? '').trim() : '';
    const rawUpline = uplineCol !== -1 ? String(row[uplineCol] ?? '').trim() : '';
    const rawUplineCode = uplineCodeCol !== -1 ? String(row[uplineCodeCol] ?? '').trim() : '';
    const rawTeam = teamCol !== -1 ? String(row[teamCol] ?? '').trim() : '';
    const rawLis = lisDateCol !== -1 ? String(row[lisDateCol] ?? '').trim() : '';
    const rawDistrict = districtCol !== -1 ? String(row[districtCol] ?? '').trim() : '';
    const rawCode = codeCol !== -1 ? String(row[codeCol] ?? '').trim() : '';
    const rawNick = nicknameCol !== -1 ? String(row[nicknameCol] ?? '').trim() : '';
    const rawRank = rankCol !== -1 ? String(row[rankCol] ?? '').trim() : '';

    const byCode = rawCode ? existingMetricsByCode.get(rawCode) : undefined;
    const hkidEng = extractEnglishName(rawNameHkid);
    const hkidCn = rawChineseName || extractChineseName(rawNameHkid);
    const agentEng = extractEnglishName(rawAgentName);

    // Strictly map Name (HKID) to Column D (rawNameHkid) without falling back to Recruiter ARA Name or "AGENT <code>"
    const cleanColumnDName = hkidEng || rawNameHkid.toUpperCase();
    const primaryName =
      cleanColumnDName ||
      agentEng ||
      rawAgentName ||
      byCode?.name ||
      rawNick;
    if (!primaryName && !rawCode && !rawTeam) continue;

    const upperPrimary = (primaryName || '').toUpperCase();
    if (
      upperPrimary === 'NAME (HKID)' ||
      upperPrimary === 'NAME HKID' ||
      upperPrimary === 'ARA NAME' ||
      upperPrimary === 'AGENT NAME' ||
      upperPrimary === 'AGENT NAMEEN' ||
      upperPrimary === 'TEAM' ||
      upperPrimary.includes('TOTAL') ||
      upperPrimary.includes('SUBTOTAL')
    ) {
      continue;
    }

    const normPrimary = normalizeName(primaryName) || rawCode;
    if (!normPrimary) continue;

    const prevMetrics = byCode || (primaryName ? existingMetricsByName.get(normPrimary) : undefined);
    const parsedFyc =
      fycCol !== -1 && parseFyccValue(row[fycCol]) !== null
        ? parseFyccValue(row[fycCol])!
        : prevMetrics?.fyc ?? 0;
    const parsedFyp =
      fypCol !== -1 && parseFyccValue(row[fypCol]) !== null
        ? parseFyccValue(row[fypCol])!
        : prevMetrics?.fyp ?? 0;
    const parsedCases =
      caseCol !== -1 && parseFyccValue(row[caseCol]) !== null
        ? parseFyccValue(row[caseCol])!
        : prevMetrics?.cases ?? 0;

    // Preserve exact Team from Column B of the Headcount file!
    const explicitTeamName = rawTeam
      ? canonicalizeHeadcountTeam(rawTeam)
      : '';
    const resolved = explicitTeamName
      ? {
          teamName: explicitTeamName,
          districtName: explicitTeamName,
          defaultManager: rawUpline || rawUplineCode || explicitTeamName,
        }
      : resolveTeamAndDistrictForAgent(primaryName, rawUpline, rawTeam, rawDistrict);

    const dedupeKey = rawCode
      ? `code-${rawCode}`
      : `row-${r}-${normPrimary}-${resolved.teamName}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const cleanUplineEng = extractEnglishName(rawUpline);
    const effectiveUplineName =
      cleanUplineEng || rawUpline.toUpperCase() || rawUplineCode || resolved.defaultManager.toUpperCase();
    const effectiveUplineCode =
      rawUplineCode || (/^\d{5,7}$/.test(rawUpline) ? rawUpline : undefined);

    parsedEntries.push({
      id: `hc-${Date.now()}-${r}`,
      agentCode: rawCode || prevMetrics?.agentCode || '',
      araName: cleanColumnDName || primaryName.toUpperCase(),
      nameHkid: cleanColumnDName || primaryName.toUpperCase(),
      chineseName: hkidCn || undefined,
      recruiterAraName: rawAraName ? rawAraName.toUpperCase() : undefined,
      nickname: rawNick.toUpperCase() || byCode?.nickname || '',
      uplineManagerName: effectiveUplineName,
      uplineManagerCode: effectiveUplineCode,
      team: resolved.teamName,
      district: resolved.districtName,
      productionStartDateLis: rawLis || '01/01/2025',
      rank: rawRank || 'Advisor',
      fyc: parsedFyc,
      fyp: parsedFyp,
      cases: parsedCases,
      isActive: parsedFyc > 0,
    });
  }

  if (parsedEntries.length > 0) {
    appState.headcountRoster = parsedEntries;
    // Allocate each TeamBoard's Headcount using the recursive 3-tier tree rule:
    // Top Leader (1) + Direct Downlines (Tier 1) + Multi-tier Indirect Downlines (Tier 2+)
    allocateTeamHeadcountsFromRoster(appState.teams, appState.headcountRoster);
  }

  const uniqueTeams = Array.from(new Set(parsedEntries.map((e) => e.team).filter(Boolean)));
  const uniqueManagers = Array.from(
    new Set(parsedEntries.map((e) => e.uplineManagerName).filter(Boolean))
  );
  const uniqueDistricts = Array.from(
    new Set(parsedEntries.map((e) => e.district).filter(Boolean))
  );
  const recruitsCount = parsedEntries.filter(
    (e) =>
      e.productionStartDateLis.includes('2025') ||
      e.productionStartDateLis.includes('2026')
  ).length;

  const hcLog: HeadcountSyncLog = {
    id: `hc-sync-${Date.now()}`,
    timestamp: new Date().toISOString(),
    fileName,
    totalRows: parsedEntries.length,
    teamsCount: uniqueTeams.length,
    managersCount: uniqueManagers.length,
    recruitsCount,
    districts: uniqueDistricts,
  };

  appState.lastHeadcountSync = hcLog;
  saveState(appState);
  return hcLog;
}

const GDRIVE_FOLDER_ID = '1d9k5SpBXItTqVYF2z3_6ZsKo5w4p8Tmn';
const GDRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${GDRIVE_FOLDER_ID}?usp=drive_link`;
const DEFAULT_GDRIVE_HEADCOUNT_FILE_ID = '1ZIk8n5xbiJY1FEHuD4vCMGMkcQZYTGR0';
const LOCAL_HEADCOUNT_AVA_FILE = path.join(DATA_DIR, 'HEADCOUNT_BY_AVA.xls');
const LOCAL_HEADCOUNT_LATEST_FILE = path.join(DATA_DIR, 'headcount-latest.xls');

const GDRIVE_REPORTS_FOLDER_ID = '1pvxqsNTG8ur8V7InCaKVyelveDqMCMPS';
const GDRIVE_REPORTS_FOLDER_URL = `https://drive.google.com/drive/folders/${GDRIVE_REPORTS_FOLDER_ID}?usp=sharing`;
const DEFAULT_GDRIVE_PLD_REPORT_FILE_ID = '1vsxKta1Mj0tQaVYU54axInP1Tbh_aa89';
const DEFAULT_GDRIVE_HSUI_REPORT_FILE_ID = '1EDPFrpEiztfyq-kzt5AeDfkcvVJL5yEM';
const LOCAL_PLD_REPORT_FILE = path.join(DATA_DIR, 'SalesProductionAgency_PLD_THIS_MONTH.xls');
const LOCAL_HSUI_REPORT_FILE = path.join(DATA_DIR, 'SalesProductionAgency_HSUI_THIS_MONTH.xls');

function parseBufferToRows(buf: Buffer): unknown[][] {
  const allRows: unknown[][] = [];
  const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });
    allRows.push(...rows);
  }
  return allRows;
}

function discoverGoogleDriveFilesFromHtml(html: string): Array<{ id: string; label: string }> {
  const results: Array<{ id: string; label: string }> = [];
  const blocks = html.split('data-id="');
  for (let i = 1; i < blocks.length; i++) {
    const id = blocks[i].split('"')[0];
    if (!id || id === '_gd' || id.length < 15) continue;
    const prev = blocks[i - 1].slice(-600);
    const next = blocks[i].slice(0, 300);
    const ariaMatches = [...prev.matchAll(/aria-label="([^"]+)"/gi)];
    const tooltipMatch = next.match(/data-tooltip="([^"]+)"/i);
    const label =
      (ariaMatches.length > 0 ? ariaMatches[ariaMatches.length - 1][1] : '') ||
      (tooltipMatch ? tooltipMatch[1] : '');
    if (label) {
      results.push({ id, label });
    }
  }
  return results;
}

function loadHeadcountFromLocalDiskIfAvailable(): HeadcountSyncLog | null {
  try {
    const targetPath = fs.existsSync(LOCAL_HEADCOUNT_AVA_FILE)
      ? LOCAL_HEADCOUNT_AVA_FILE
      : fs.existsSync(LOCAL_HEADCOUNT_LATEST_FILE)
      ? LOCAL_HEADCOUNT_LATEST_FILE
      : null;
    if (!targetPath) return null;
    const buf = fs.readFileSync(targetPath);
    if (buf.length < 500) return null;
    const rows = parseBufferToRows(buf);
    if (rows.length > 1) {
      return processHeadcountGrid(rows, 'HEADCOUNT BY AVA.xls');
    }
  } catch (err) {
    console.error('Failed to load local HEADCOUNT BY AVA.xls:', err);
  }
  return null;
}

function loadSalesReportsFromLocalDiskIfAvailable(): SyncLogEntry | null {
  try {
    const hasPld = fs.existsSync(LOCAL_PLD_REPORT_FILE);
    const hasHsui = fs.existsSync(LOCAL_HSUI_REPORT_FILE);
    if (!hasPld && !hasHsui) return null;

    let combinedRows: unknown[][] = [];
    if (hasPld) {
      const pldBuf = fs.readFileSync(LOCAL_PLD_REPORT_FILE);
      if (pldBuf.length > 500) {
        combinedRows.push(...parseBufferToRows(pldBuf));
      }
    }
    if (hasHsui) {
      const hsuiBuf = fs.readFileSync(LOCAL_HSUI_REPORT_FILE);
      if (hsuiBuf.length > 500) {
        const hsuiRows = parseBufferToRows(hsuiBuf);
        combinedRows.push(...(combinedRows.length > 0 ? hsuiRows.slice(5) : hsuiRows));
      }
    }

    if (combinedRows.length > 5) {
      return processReportGrid(
        combinedRows,
        'SalesProductionAgency_PLD_THIS MONTH + SalesProductionAgency_HSUI_THIS MONTH.xls',
        'replace',
        'AUTO'
      );
    }
  } catch (err) {
    console.error('Failed to load local SalesProduction reports:', err);
  }
  return null;
}

async function syncHeadcountFromGoogleDrive(): Promise<HeadcountSyncLog | null> {
  try {
    let fileId = DEFAULT_GDRIVE_HEADCOUNT_FILE_ID;
    let fileName = 'HEADCOUNT BY AVA.xls';

    // 1. Dynamically check Google Drive folder for the latest HEADCOUNT BY AVA.xls file ID
    try {
      const folderRes = await fetch(GDRIVE_FOLDER_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (folderRes.ok) {
        const html = await folderRes.text();
        const items = discoverGoogleDriveFilesFromHtml(html);
        for (const item of items) {
          if (
            /headcount\s*by\s*ava/i.test(item.label) ||
            /headcount.*\.(xls|xlsx|csv)/i.test(item.label)
          ) {
            fileId = item.id;
            const cleanName = item.label.replace(/\s+Microsoft Excel.*$/i, '').trim();
            if (cleanName) fileName = cleanName;
            break;
          }
        }
      }
    } catch {
      // Ignore folder discovery error and use default fileId
    }

    // 2. Download the file directly from Google Drive
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const fileRes = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (fileRes.ok) {
      const arrayBuf = await fileRes.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (buf.length > 1000) {
        fs.writeFileSync(LOCAL_HEADCOUNT_AVA_FILE, buf);
        fs.writeFileSync(LOCAL_HEADCOUNT_LATEST_FILE, buf);
        const rows = parseBufferToRows(buf);
        if (rows.length > 1) {
          return processHeadcountGrid(rows, fileName);
        }
      }
    }
  } catch (err) {
    console.error('Google Drive HEADCOUNT BY AVA.xls sync fallback to local:', err);
  }

  return loadHeadcountFromLocalDiskIfAvailable();
}

async function syncSalesReportsFromGoogleDrive(): Promise<SyncLogEntry | null> {
  try {
    let pldFileId = DEFAULT_GDRIVE_PLD_REPORT_FILE_ID;
    let hsuiFileId = DEFAULT_GDRIVE_HSUI_REPORT_FILE_ID;

    // 1. Dynamically discover SalesProductionAgency_PLD_THIS MONTH and SalesProductionAgency_HSUI_THIS MONTH.xls in folder
    try {
      const folderRes = await fetch(GDRIVE_REPORTS_FOLDER_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (folderRes.ok) {
        const html = await folderRes.text();
        const items = discoverGoogleDriveFilesFromHtml(html);
        for (const item of items) {
          if (/SalesProductionAgency_PLD_THIS\s*MONTH/i.test(item.label)) {
            pldFileId = item.id;
          } else if (/SalesProductionAgency_HSUI_THIS\s*MONTH/i.test(item.label)) {
            hsuiFileId = item.id;
          }
        }
      }
    } catch {
      // Fallback to default file IDs
    }

    // 2. Download both files from Google Drive
    const [pldRes, hsuiRes] = await Promise.allSettled([
      fetch(`https://drive.google.com/uc?export=download&id=${pldFileId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }),
      fetch(`https://drive.google.com/uc?export=download&id=${hsuiFileId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }),
    ]);

    if (pldRes.status === 'fulfilled' && pldRes.value.ok) {
      const buf = Buffer.from(await pldRes.value.arrayBuffer());
      if (buf.length > 1000) {
        fs.writeFileSync(LOCAL_PLD_REPORT_FILE, buf);
      }
    }

    if (hsuiRes.status === 'fulfilled' && hsuiRes.value.ok) {
      const buf = Buffer.from(await hsuiRes.value.arrayBuffer());
      if (buf.length > 1000) {
        fs.writeFileSync(LOCAL_HSUI_REPORT_FILE, buf);
      }
    }
  } catch (err) {
    console.error('Google Drive SalesProduction reports sync fallback to local:', err);
  }

  return loadSalesReportsFromLocalDiskIfAvailable();
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  app.use(express.json({ limit: '25mb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  function broadcastState(eventType = 'state:updated') {
    const payload = JSON.stringify({
      type: eventType,
      state: appState,
      connectedClients: wss.clients.size,
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'state:init',
        state: appState,
        connectedClients: wss.clients.size,
      })
    );
    // Notify others of updated client count
    broadcastState('presence:updated');

    ws.on('close', () => {
      broadcastState('presence:updated');
    });
  });

  // GET current state
  app.get('/api/state', (_req, res) => {
    res.json({
      state: appState,
      connectedClients: wss.clients.size,
    });
  });

  // POST upload SalesProductionAgencyPerfomanceReport file (.xlsx, .xls, .csv, .json, .txt)
  app.post('/api/upload-report', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: '請選擇要上傳的報表檔案 (No file uploaded)' });
        return;
      }

      const mode = (req.body?.mode === 'additive' ? 'additive' : 'replace') as
        | 'replace'
        | 'additive';
      const targetMonth = req.body?.targetMonth || 'AUTO';
      const originalName = req.file.originalname || 'SalesProductionAgencyPerfomanceReport.xlsx';

      let allRows: unknown[][] = [];

      // Parse via SheetJS (handles xlsx, xls, csv, tsv, html tables, xml)
      try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: '',
            raw: false,
          });
          allRows.push(...rows);
        }
      } catch {
        // Fallback: parse as plain UTF-8 lines split by tab, comma, or multiple spaces
        const text = req.file.buffer.toString('utf-8');
        allRows = text
          .split(/\r?\n/)
          .map((line) => line.split(/\t|,|\s{2,}/).map((s) => s.trim()));
      }

      // Check if the uploaded file is actually a Headcount Excel file (by filename or header columns)
      const isHeadcountFile =
        originalName.toLowerCase().includes('headcount') ||
        allRows.slice(0, 15).some((r) => {
          const joined = (r || []).map((c) => String(c ?? '').toLowerCase()).join(' | ');
          return (
            (joined.includes('name (hkid)') || joined.includes('name(hkid)')) &&
            (joined.includes('upline') || joined.includes('lis') || joined.includes('production start'))
          );
        });

      if (isHeadcountFile) {
        try {
          fs.writeFileSync(path.join(DATA_DIR, 'headcount-latest.xls'), req.file.buffer);
        } catch {}
        const hcLog = processHeadcountGrid(allRows, originalName);
        broadcastState('state:updated');
        res.json({
          success: true,
          headcountLog: hcLog,
          syncLog: {
            id: hcLog.id,
            timestamp: hcLog.timestamp,
            fileName: hcLog.fileName,
            mode: 'replace',
            matchedCount: hcLog.totalRows,
            activatedCount: (appState.headcountRoster || []).filter((r) => r.fyc > 0).length,
            unmatchedReportNames: [],
            matches: [],
          },
          state: appState,
        });
        return;
      }

      const syncLog = processReportGrid(allRows, originalName, mode, targetMonth);
      broadcastState('state:updated');

      res.json({
        success: true,
        syncLog,
        state: appState,
      });
    } catch (err: any) {
      console.error('Report upload processing error:', err);
      res.status(500).json({
        error: err?.message || '報表解析失敗，請檢查檔案格式',
      });
    }
  });

  // POST raw pasted table/CSV text from SalesProductionAgencyPerfomanceReport
  app.post('/api/parse-text-report', (req, res) => {
    try {
      const { rawText, mode = 'replace', targetMonth = 'AUTO', fileName = 'Pasted_SalesProductionAgencyPerfomanceReport' } = req.body || {};
      if (!rawText || typeof rawText !== 'string') {
        res.status(400).json({ error: '請貼上報表內容' });
        return;
      }

      let rows: unknown[][] = [];
      try {
        const wb = XLSX.read(rawText, { type: 'string' });
        for (const name of wb.SheetNames) {
          const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
            header: 1,
            defval: '',
            raw: false,
          });
          rows.push(...sheetRows);
        }
      } catch {
        rows = rawText
          .split(/\r?\n/)
          .map((line: string) => line.split(/\t|,|\s{2,}/).map((s) => s.trim()));
      }

      const syncLog = processReportGrid(
        rows,
        fileName,
        mode === 'additive' ? 'additive' : 'replace',
        targetMonth
      );
      broadcastState('state:updated');

      res.json({
        success: true,
        syncLog,
        state: appState,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '解析貼上資料失敗' });
    }
  });

  // PATCH toggle or update a single member's active state / FYCC / Name / Role (Manager vs Downline)
  app.patch('/api/members/:memberId', (req, res) => {
    const { memberId } = req.params;
    const { isActive, fycc, fullName, nickname, isLeaderRow } = req.body || {};

    let foundMember: MemberRecord | null = null;
    for (const team of appState.teams) {
      for (const m of getAllMembersOfTeam(team)) {
        if (m.id === memberId) {
          foundMember = m;
          break;
        }
      }
      if (foundMember) break;
    }

    if (!foundMember) {
      res.status(404).json({ error: '找不到該成員 (Member not found)' });
      return;
    }

    if (typeof fullName === 'string' && fullName.trim()) {
      foundMember.fullName = fullName.trim().toUpperCase();
    }
    if (typeof nickname === 'string') {
      foundMember.nickname = nickname.trim().toUpperCase();
    }
    if (typeof isLeaderRow === 'boolean') {
      foundMember.isLeaderRow = isLeaderRow;
    }
    if (typeof fycc === 'number') {
      foundMember.fycc = fycc;
      foundMember.isActive = Math.abs(fycc) > 0;
    }
    if (typeof isActive === 'boolean') {
      foundMember.isActive = isActive;
      if (!isActive && foundMember.fycc > 0 && typeof fycc !== 'number') {
        foundMember.fycc = 0;
      }
    }
    foundMember.lastUpdated = new Date().toISOString();

    saveState(appState);
    broadcastState('state:updated');
    res.json({ success: true, member: foundMember, state: appState });
  });

  // POST add a new member (e.g. White-row Downline under an Orange-row Manager) into an existing group
  app.post('/api/teams/:teamId/groups/:groupId/members', (req, res) => {
    const { teamId, groupId } = req.params;
    const { fullName, nickname = '', isLeaderRow = false } = req.body || {};

    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      res.status(400).json({ error: '請輸入成員英文全名 (Full Name)' });
      return;
    }

    const team = appState.teams.find((t) => t.id === teamId);
    if (!team) {
      res.status(404).json({ error: '找不到該團隊 (Team not found)' });
      return;
    }

    const allGroups = [...team.leftColumnGroups, ...team.rightColumnGroups];
    const group = allGroups.find((g) => g.id === groupId);
    if (!group) {
      res.status(404).json({ error: '找不到該經理組別 (Group not found)' });
      return;
    }

    const newMember: MemberRecord = {
      id: `${teamId}-m-${Date.now()}`,
      fullName: fullName.trim().toUpperCase(),
      nickname: String(nickname || '').trim().toUpperCase(),
      isLeaderRow: Boolean(isLeaderRow),
      isActive: false, // Default dark navy blue
      fycc: 0,
      lastUpdated: new Date().toISOString(),
    };

    group.members.push(newMember);
    // Automatically sync Active Member denominator with total Active Members on the board
    team.activeMemberDenominator = getAllMembersOfTeam(team).length;

    saveState(appState);
    broadcastState('state:updated');
    res.json({ success: true, member: newMember, state: appState });
  });

  // POST add a new Manager Group (Orange row Manager + their future white row downlines) to Left or Right column
  app.post('/api/teams/:teamId/groups', (req, res) => {
    const { teamId } = req.params;
    const { column = 'left', fullName, nickname = '' } = req.body || {};

    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      res.status(400).json({ error: '請輸入經理英文全名 (Manager Full Name)' });
      return;
    }

    const team = appState.teams.find((t) => t.id === teamId);
    if (!team) {
      res.status(404).json({ error: '找不到該團隊 (Team not found)' });
      return;
    }

    const newManager: MemberRecord = {
      id: `${teamId}-mgr-${Date.now()}`,
      fullName: fullName.trim().toUpperCase(),
      nickname: String(nickname || '').trim().toUpperCase(),
      isLeaderRow: true, // Orange background = Manager (經理)
      isActive: false,   // Default dark navy blue
      fycc: 0,
      lastUpdated: new Date().toISOString(),
    };

    const newGroup = {
      id: `${teamId}-grp-${Date.now()}`,
      members: [newManager],
    };

    if (column === 'right') {
      team.rightColumnGroups.push(newGroup);
    } else {
      team.leftColumnGroups.push(newGroup);
    }

    team.activeMemberDenominator = getAllMembersOfTeam(team).length;

    saveState(appState);
    broadcastState('state:updated');
    res.json({ success: true, group: newGroup, state: appState });
  });

  // DELETE remove a member who is not participating in this 3-month cycle
  app.delete('/api/teams/:teamId/members/:memberId', (req, res) => {
    const { teamId, memberId } = req.params;
    const team = appState.teams.find((t) => t.id === teamId);
    if (!team) {
      res.status(404).json({ error: '找不到該團隊 (Team not found)' });
      return;
    }

    let removed = false;
    const cleanGroups = (groups: typeof team.leftColumnGroups) => {
      for (const g of groups) {
        const idx = g.members.findIndex((m) => m.id === memberId);
        if (idx !== -1) {
          g.members.splice(idx, 1);
          removed = true;
        }
      }
      return groups.filter((g) => g.members.length > 0);
    };

    team.leftColumnGroups = cleanGroups(team.leftColumnGroups);
    team.rightColumnGroups = cleanGroups(team.rightColumnGroups);

    if (!removed) {
      res.status(404).json({ error: '找不到該成員' });
      return;
    }

    team.activeMemberDenominator = getAllMembersOfTeam(team).length;

    saveState(appState);
    broadcastState('state:updated');
    res.json({ success: true, state: appState });
  });

  // PATCH update team metadata (report date display, denominators, extra headcount active)
  app.patch('/api/settings', (req, res) => {
    const { reportDateDisplay, targetMonthFilter, teamUpdates } = req.body || {};
    if (typeof reportDateDisplay === 'string' && reportDateDisplay.trim()) {
      appState.reportDateDisplay = reportDateDisplay.trim();
    }
    if (typeof targetMonthFilter === 'string') {
      appState.targetMonthFilter = targetMonthFilter;
    }
    if (Array.isArray(teamUpdates)) {
      for (const upd of teamUpdates) {
        const team = appState.teams.find((t) => t.id === upd.id);
        if (team) {
          if (typeof upd.activeMemberDenominator === 'number') {
            team.activeMemberDenominator = upd.activeMemberDenominator;
          }
          if (typeof upd.teamHeadcountDenominator === 'number') {
            team.teamHeadcountDenominator = upd.teamHeadcountDenominator;
          }
          if (typeof upd.extraTeamActiveCount === 'number') {
            team.extraTeamActiveCount = upd.extraTeamActiveCount;
          }
        }
      }
    }
    saveState(appState);
    broadcastState('state:updated');
    res.json({ success: true, state: appState });
  });

  // POST/GET auto-sync HEADCOUNT BY AVA.xls from Google Drive folder (instant response + background refresh)
  app.all('/api/sync-gdrive-headcount', async (_req, res) => {
    try {
      const headcountLog =
        appState.lastHeadcountSync || loadHeadcountFromLocalDiskIfAvailable();
      const syncLog =
        appState.lastSync || loadSalesReportsFromLocalDiskIfAvailable();

      // Trigger background Google Drive refresh without blocking the HTTP response
      (async () => {
        try {
          const bgHc = await syncHeadcountFromGoogleDrive();
          const bgRep = await syncSalesReportsFromGoogleDrive();
          if (bgHc || bgRep) broadcastState('state:updated');
        } catch {}
      })();

      broadcastState('state:updated');
      res.json({
        success: true,
        headcountLog,
        syncLog,
        state: appState,
      });
    } catch (err: any) {
      console.error('Google Drive headcount sync error:', err);
      res.status(500).json({
        error: err?.message || 'Google Drive 同步失敗',
      });
    }
  });

  // POST/GET auto-sync SalesProductionAgency_PLD_THIS MONTH & SalesProductionAgency_HSUI_THIS MONTH.xls from Google Drive folder (instant response + background refresh)
  app.all('/api/sync-gdrive-reports', async (_req, res) => {
    try {
      const syncLog =
        appState.lastSync || loadSalesReportsFromLocalDiskIfAvailable();

      // Trigger background Google Drive refresh without blocking the HTTP response
      (async () => {
        try {
          const bgRep = await syncSalesReportsFromGoogleDrive();
          if (bgRep) broadcastState('state:updated');
        } catch {}
      })();

      broadcastState('state:updated');
      res.json({
        success: true,
        syncLog,
        state: appState,
      });
    } catch (err: any) {
      console.error('Google Drive reports sync error:', err);
      res.status(500).json({
        error: err?.message || 'Google Drive SalesProduction 報表同步失敗',
      });
    }
  });

  // POST upload Headcount file (.xlsx, .xls, .csv)
  app.post('/api/upload-headcount', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: '請選擇要上載的 Headcount 檔案' });
        return;
      }

      const originalName = req.file.originalname || 'HEADCOUNT BY AVA.xls';
      try {
        fs.writeFileSync(LOCAL_HEADCOUNT_AVA_FILE, req.file.buffer);
        fs.writeFileSync(LOCAL_HEADCOUNT_LATEST_FILE, req.file.buffer);
      } catch {}
      let allRows: unknown[][] = [];

      try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: '',
            raw: false,
          });
          allRows.push(...rows);
        }
      } catch {
        const text = req.file.buffer.toString('utf-8');
        allRows = text
          .split(/\r?\n/)
          .map((line) => line.split(/\t|,|\s{2,}/).map((s) => s.trim()));
      }

      const headcountLog = processHeadcountGrid(allRows, originalName);
      broadcastState('state:updated');

      res.json({
        success: true,
        headcountLog,
        state: appState,
      });
    } catch (err: any) {
      console.error('Headcount upload processing error:', err);
      res.status(500).json({
        error: err?.message || 'Headcount 檔案解析失敗，請檢查檔案格式',
      });
    }
  });

  // POST raw pasted Headcount table/CSV text
  app.post('/api/parse-text-headcount', (req, res) => {
    try {
      const { rawText, fileName = 'Pasted_Headcount_File' } = req.body || {};
      if (!rawText || typeof rawText !== 'string') {
        res.status(400).json({ error: '請貼上 Headcount 資料內容' });
        return;
      }

      let rows: unknown[][] = [];
      try {
        const wb = XLSX.read(rawText, { type: 'string' });
        for (const name of wb.SheetNames) {
          const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
            header: 1,
            defval: '',
            raw: false,
          });
          rows.push(...sheetRows);
        }
      } catch {
        rows = rawText
          .split(/\r?\n/)
          .map((line: string) => line.split(/\t|,|\s{2,}/).map((s) => s.trim()));
      }

      const headcountLog = processHeadcountGrid(rows, fileName);
      broadcastState('state:updated');

      res.json({
        success: true,
        headcountLog,
        state: appState,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '解析貼上 Headcount 資料失敗' });
    }
  });

  // GET downloadable sample Headcount_Latest.xlsx
  app.get('/api/sample-headcount', (_req, res) => {
    const roster =
      Array.isArray(appState.headcountRoster) && appState.headcountRoster.length > 0
        ? appState.headcountRoster
        : buildInitialHeadcountRoster(appState.teams);

    const sheetRows: unknown[][] = [
      [
        'District',
        'Team',
        'Upline Manager Name',
        'Agent Code',
        'ARA Name',
        'Nickname',
        'Production Start Date (LIS)',
        'FYC',
        'FYP',
        'Case',
      ],
    ];

    roster.forEach((entry, idx) => {
      const sampleFyc =
        entry.fyc > 0 ? entry.fyc : idx % 3 === 0 ? (idx === 0 ? 602208 : 28500) : 0;
      const sampleFyp =
        entry.fyp > 0 ? entry.fyp : sampleFyc > 0 ? sampleFyc * 2.8 : 0;
      const sampleCase =
        entry.cases > 0 ? entry.cases : sampleFyc > 0 ? (idx === 0 ? 2 : 1) : 0;

      sheetRows.push([
        entry.district,
        entry.team,
        entry.uplineManagerName,
        entry.agentCode,
        entry.araName,
        entry.nickname || '',
        entry.productionStartDateLis,
        sampleFyc,
        sampleFyp,
        sampleCase,
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Headcount');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Headcount_Latest.xlsx"'
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.send(buf);
  });

  // POST reset to default all-navy state (while keeping HEADCOUNT BY AVA.xls roster)
  app.post('/api/reset', (_req, res) => {
    const resetTeams = JSON.parse(JSON.stringify(INITIAL_TEAMS_DATA)) as TeamBoard[];
    appState = {
      version: STATE_VERSION,
      reportDateDisplay: '30 Sep 2026',
      targetMonthFilter: 'AUTO',
      teams: resetTeams,
      headcountRoster: (appState.headcountRoster || []).map((r) => ({
        ...r,
        fyc: 0,
        fyp: 0,
        cases: 0,
        isActive: false,
      })),
      lastHeadcountSync: appState.lastHeadcountSync,
      syncHistory: appState.syncHistory,
    };
    loadHeadcountFromLocalDiskIfAvailable();
    saveState(appState);
    broadcastState('state:updated');
    res.json({ success: true, state: appState });
  });

  // GET downloadable sample SalesProductionAgencyPerfomanceReport_1791171184814.xlsx
  app.get('/api/sample-report', (_req, res) => {
    const sheetRows: unknown[][] = [
      ['Sales Production Agency Performance Report', '', '', 'DATE RANGE:', appState.reportDateDisplay || '30 Sep 2026'],
      ['', '', '', 'Submission', '', '', ''],
      ['', '', '', 'Requested Month (in total)', '', '', ''],
      ['Team Name', 'Agent Name', 'Nickname', 'AFYP', 'Case', 'FYCC', 'AFYCC'],
    ];

    for (const team of appState.teams) {
      const members = getAllMembersOfTeam(team);
      members.forEach((m, idx) => {
        const sampleFycc = m.fycc !== 0 ? m.fycc : idx % 2 === 0 ? (idx === 0 ? 602208 : 13750) : 0;
        const sampleAfyp = sampleFycc !== 0 ? sampleFycc * 3 : 0;
        const sampleCase = sampleFycc !== 0 ? (idx === 0 ? 1.0 : 0.5) : 0;
        sheetRows.push([
          team.name,
          m.fullName,
          m.nickname,
          sampleAfyp,
          sampleCase,
          sampleFycc,
          sampleFycc,
        ]);
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws['!merges'] = [
      { s: { r: 1, c: 3 }, e: { r: 1, c: 6 } }, // Submission
      { s: { r: 2, c: 3 }, e: { r: 2, c: 6 } }, // Requested Month (in total)
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'AgencyPerformance');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="SalesProductionAgencyPerfomanceReport_1791171184814.xlsx"'
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.send(buf);
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PLD Active Member Lightboard server listening on http://0.0.0.0:${PORT}`);

    // Run local disk check if state wasn't already populated, then refresh from Google Drive in background
    setTimeout(async () => {
      try {
        if (!appState.lastHeadcountSync) {
          loadHeadcountFromLocalDiskIfAvailable();
        }
        if (!appState.lastSync) {
          loadSalesReportsFromLocalDiskIfAvailable();
        }
        const hcLog = await syncHeadcountFromGoogleDrive();
        const repLog = await syncSalesReportsFromGoogleDrive();
        if (hcLog || repLog) broadcastState('state:updated');
      } catch {}
    }, 1500);

    // Periodically refresh HEADCOUNT BY AVA.xls & SalesProduction reports from Google Drive every 10 minutes
    setInterval(async () => {
      try {
        const hcLog = await syncHeadcountFromGoogleDrive();
        const repLog = await syncSalesReportsFromGoogleDrive();
        if (hcLog || repLog) broadcastState('state:updated');
      } catch {}
    }, 10 * 60 * 1000);
  });
}

startServer();
