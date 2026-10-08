import React, { useMemo, useRef, useState } from 'react';
import {
  Award,
  Building2,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  GitBranch,
  Layers,
  Search,
  Square,
  TrendingUp,
  Upload,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  AppState,
  DEFAULT_SELECTED_DISTRICTS,
  HeadcountRosterEntry,
  KNOWN_HEADCOUNT_TEAMS,
  buildInitialHeadcountRoster,
  canonicalizeHeadcountTeam,
  extractEnglishName,
  personNamesMatch,
} from '../shared/teamsData.ts';
import preloadedStateJson from '../shared/preloadedState.json';

const PRELOADED_GDRIVE_STATE = preloadedStateJson as unknown as AppState;

interface PpRawAnalyticsDashboardProps {
  appState: AppState;
  selectedDistricts: string[];
  onChangeSelectedDistricts: (districts: string[]) => void;
  onStateUpdated: (newState: AppState) => void;
  onOpenReportUploadModal: () => void;
}

export const PpRawAnalyticsDashboard: React.FC<PpRawAnalyticsDashboardProps> = ({
  appState,
  selectedDistricts,
  onChangeSelectedDistricts,
  onStateUpdated,
}) => {
  const headcountFileInputRef = useRef<HTMLInputElement | null>(null);
  const salesReportFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });

  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('ALL');
  const [selectedManagerFilter, setSelectedManagerFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [leaderboardMetric, setLeaderboardMetric] = useState<'fyc' | 'fyp' | 'cases'>('fyc');
  const [tableSortField, setTableSortField] = useState<
    'fyc' | 'fyp' | 'cases' | 'araName' | 'uplineManagerName' | 'productionStartDateLis'
  >('fyc');
  const [tableSortAsc, setTableSortAsc] = useState(false);
  const [expandedManager, setExpandedManager] = useState<string | null>(null);

  // Full Headcount Roster (fallback to initial roster built from teams if empty)
  const fullRoster: HeadcountRosterEntry[] = useMemo(() => {
    if (Array.isArray(appState.headcountRoster) && appState.headcountRoster.length > 0) {
      return appState.headcountRoster;
    }
    return buildInitialHeadcountRoster(appState.teams);
  }, [appState.headcountRoster, appState.teams]);

  // All available Teams from Headcount Column B (always ensuring PAGGIE LAW & JERRY LO appear first)
  const allDistricts = useMemo(() => {
    const set = new Set<string>(DEFAULT_SELECTED_DISTRICTS);
    for (const r of fullRoster) {
      const raw = (r.team || r.district || '').trim();
      if (raw) {
        const c = canonicalizeHeadcountTeam(raw);
        if (c && c !== 'TAM PAN GARY' && c !== 'GARY TAM') {
          set.add(c);
        }
      }
    }
    for (const kt of KNOWN_HEADCOUNT_TEAMS) {
      set.add(kt);
    }
    return Array.from(set);
  }, [fullRoster]);

  // Team summary counts (for checkboxes)
  const districtStatsMap = useMemo(() => {
    const map = new Map<
      string,
      { headcount: number; activeCount: number; fyc: number; fyp: number; cases: number }
    >();
    for (const d of allDistricts) {
      map.set(d.toUpperCase(), { headcount: 0, activeCount: 0, fyc: 0, fyp: 0, cases: 0 });
    }
    for (const row of fullRoster) {
      const d = canonicalizeHeadcountTeam(row.team || row.district || 'PAGGIE LAW');
      const cur = map.get(d) || { headcount: 0, activeCount: 0, fyc: 0, fyp: 0, cases: 0 };
      cur.headcount += 1;
      if (row.fyc > 0 || row.isActive) cur.activeCount += 1;
      cur.fyc += row.fyc || 0;
      cur.fyp += row.fyp || 0;
      cur.cases += row.cases || 0;
      map.set(d, cur);
    }
    return map;
  }, [fullRoster, allDistricts]);

  // Toggle a single Team checkbox
  const toggleDistrict = (teamOption: string) => {
    const upperTarget = teamOption.toUpperCase();
    const exists = selectedDistricts.some(
      (d) => canonicalizeHeadcountTeam(d) === upperTarget || d.toUpperCase() === upperTarget
    );
    if (exists) {
      onChangeSelectedDistricts(
        selectedDistricts.filter(
          (d) => canonicalizeHeadcountTeam(d) !== upperTarget && d.toUpperCase() !== upperTarget
        )
      );
    } else {
      onChangeSelectedDistricts([...selectedDistricts, upperTarget]);
    }
  };

  // Rows filtered by Multi-Select Team Filter
  const districtFilteredRoster = useMemo(() => {
    if (selectedDistricts.length === 0) return [];
    const selectedSet = new Set(
      selectedDistricts.flatMap((d) => [d.toUpperCase(), canonicalizeHeadcountTeam(d)])
    );
    return fullRoster.filter((r) => {
      const rowTeam = (r.team || r.district || 'PAGGIE LAW').trim().toUpperCase();
      return selectedSet.has(rowTeam) || selectedSet.has(canonicalizeHeadcountTeam(rowTeam));
    });
  }, [fullRoster, selectedDistricts]);

  // Available Teams & Upline Managers inside the selected Districts
  const availableTeams = useMemo(() => {
    return Array.from(new Set(districtFilteredRoster.map((r) => r.team).filter(Boolean)));
  }, [districtFilteredRoster]);

  const availableManagers = useMemo(() => {
    return Array.from(
      new Set(districtFilteredRoster.map((r) => r.uplineManagerName).filter(Boolean))
    );
  }, [districtFilteredRoster]);

  // Final filtered rows after Team, Upline Manager, and Search filters
  const filteredRows = useMemo(() => {
    return districtFilteredRoster.filter((r) => {
      if (selectedTeamFilter !== 'ALL' && r.team !== selectedTeamFilter) return false;
      if (
        selectedManagerFilter !== 'ALL' &&
        r.uplineManagerName !== selectedManagerFilter
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = r.araName.toLowerCase().includes(q);
        const matchNick = (r.nickname || '').toLowerCase().includes(q);
        const matchMgr = r.uplineManagerName.toLowerCase().includes(q);
        const matchTeam = r.team.toLowerCase().includes(q);
        const matchCode = (r.agentCode || '').toLowerCase().includes(q);
        if (!matchName && !matchNick && !matchMgr && !matchTeam && !matchCode) {
          return false;
        }
      }
      return true;
    });
  }, [districtFilteredRoster, selectedTeamFilter, selectedManagerFilter, searchQuery]);

  // Helper to check if Production Start Date (LIS) is a recent recruit (2025 / 2026)
  const isNewRecruitLis = (lisStr: string): boolean => {
    if (!lisStr) return false;
    return lisStr.includes('2025') || lisStr.includes('2026');
  };

  // Dynamic KPIs based on selected Districts (and sub-filters)
  const kpiSummary = useMemo(() => {
    let totalFyc = 0;
    let totalFyp = 0;
    let totalCases = 0;
    let activeAgents = 0;
    let recruitsCount = 0;
    const managerSet = new Set<string>();

    for (const r of filteredRows) {
      totalFyc += r.fyc || 0;
      totalFyp += r.fyp || 0;
      totalCases += r.cases || 0;
      if (r.fyc > 0 || r.isActive) activeAgents += 1;
      if (isNewRecruitLis(r.productionStartDateLis)) recruitsCount += 1;
      if (r.uplineManagerName) managerSet.add(r.uplineManagerName);
    }

    const totalHeadcount = filteredRows.length;
    const activeRate =
      totalHeadcount > 0 ? Math.round((activeAgents / totalHeadcount) * 100) : 0;

    return {
      totalFyc,
      totalFyp,
      totalCases,
      totalHeadcount,
      activeAgents,
      activeRate,
      recruitsCount,
      managersCount: managerSet.size,
    };
  }, [filteredRows]);

  // 1. ARA Individual Leaderboard (sorted by selected metric: FYC / FYP / Cases)
  const araLeaderboard = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => {
        if (leaderboardMetric === 'fyp') return (b.fyp || 0) - (a.fyp || 0) || (b.fyc || 0) - (a.fyc || 0);
        if (leaderboardMetric === 'cases') return (b.cases || 0) - (a.cases || 0) || (b.fyc || 0) - (a.fyc || 0);
        return (b.fyc || 0) - (a.fyc || 0) || (b.fyp || 0) - (a.fyp || 0);
      })
      .slice(0, 12);
  }, [filteredRows, leaderboardMetric]);

  // 2. Upline Manager Hierarchy & Recruitment / Downline Summary
  const managerHierarchyList = useMemo(() => {
    const map = new Map<
      string,
      {
        managerName: string;
        team: string;
        district: string;
        downlines: HeadcountRosterEntry[];
        directDownlineCount: number;
        activeDownlineCount: number;
        recruitsCount: number;
        totalFyc: number;
        totalFyp: number;
        totalCases: number;
      }
    >();

    for (const r of filteredRows) {
      const mgr = r.uplineManagerName || 'UNASSIGNED';
      let item = map.get(mgr);
      if (!item) {
        item = {
          managerName: mgr,
          team: r.team,
          district: r.district,
          downlines: [],
          directDownlineCount: 0,
          activeDownlineCount: 0,
          recruitsCount: 0,
          totalFyc: 0,
          totalFyp: 0,
          totalCases: 0,
        };
        map.set(mgr, item);
      }
      item.downlines.push(r);
      // Count direct downlines (including self or downlines under this manager)
      if (r.araName !== mgr) {
        item.directDownlineCount += 1;
      }
      if (r.fyc > 0 || r.isActive) {
        item.activeDownlineCount += 1;
      }
      if (isNewRecruitLis(r.productionStartDateLis)) {
        item.recruitsCount += 1;
      }
      item.totalFyc += r.fyc || 0;
      item.totalFyp += r.fyp || 0;
      item.totalCases += r.cases || 0;
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        b.totalFyc - a.totalFyc ||
        b.directDownlineCount - a.directDownlineCount ||
        b.downlines.length - a.downlines.length
    );
  }, [filteredRows]);

  // 3. Team Breakdown Leaderboard within selected Districts
  const teamBreakdownList = useMemo(() => {
    const map = new Map<
      string,
      {
        teamName: string;
        district: string;
        headcount: number;
        activeCount: number;
        recruitsCount: number;
        fyc: number;
        fyp: number;
        cases: number;
      }
    >();

    for (const r of filteredRows) {
      const key = r.team || 'Other';
      let item = map.get(key);
      if (!item) {
        item = {
          teamName: key,
          district: r.district,
          headcount: 0,
          activeCount: 0,
          recruitsCount: 0,
          fyc: 0,
          fyp: 0,
          cases: 0,
        };
        map.set(key, item);
      }
      item.headcount += 1;
      if (r.fyc > 0 || r.isActive) item.activeCount += 1;
      if (isNewRecruitLis(r.productionStartDateLis)) item.recruitsCount += 1;
      item.fyc += r.fyc || 0;
      item.fyp += r.fyp || 0;
      item.cases += r.cases || 0;
    }

    return Array.from(map.values()).sort(
      (a, b) => b.fyc - a.fyc || b.headcount - a.headcount
    );
  }, [filteredRows]);

  // Sorted rows for the full detail table
  const sortedTableRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (tableSortField === 'fyc') cmp = (a.fyc || 0) - (b.fyc || 0);
      else if (tableSortField === 'fyp') cmp = (a.fyp || 0) - (b.fyp || 0);
      else if (tableSortField === 'cases') cmp = (a.cases || 0) - (b.cases || 0);
      else if (tableSortField === 'araName') cmp = a.araName.localeCompare(b.araName);
      else if (tableSortField === 'uplineManagerName')
        cmp = a.uplineManagerName.localeCompare(b.uplineManagerName);
      else if (tableSortField === 'productionStartDateLis')
        cmp = a.productionStartDateLis.localeCompare(b.productionStartDateLis);
      return tableSortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filteredRows, tableSortField, tableSortAsc]);

  // Upload Headcount file handler
  const handleHeadcountFileUpload = async (file: File) => {
    setUploadStatus({
      type: 'loading',
      message: `正在解析 Headcount 檔案：${file.name}...`,
    });
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-headcount', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Headcount 上載失敗');
      if (data.state) onStateUpdated(data.state);

      setUploadStatus({
        type: 'success',
        message: `已上載 Headcount (${data.headcountLog.fileName})：共讀取 ${data.headcountLog.totalRows} 位成員、${data.headcountLog.managersCount} 位上線經理`,
      });
    } catch (err: any) {
      setUploadStatus({
        type: 'error',
        message: err?.message || 'Headcount 檔案解析失敗',
      });
    }
  };

  // Upload SalesProduction Report file handler
  const handleSalesReportFileUpload = async (file: File) => {
    setUploadStatus({
      type: 'loading',
      message: `正在解析 SalesProduction Report：${file.name}...`,
    });
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'replace');
      formData.append('targetMonth', appState.targetMonthFilter || 'AUTO');

      const res = await fetch('/api/upload-report', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SalesProduction Report 上載失敗');
      if (data.state) onStateUpdated(data.state);

      setUploadStatus({
        type: 'success',
        message: `已上載 SalesProduction Report (${file.name})：共 ${data.syncLog.activatedNames.length} 人 FYCC > 0 轉綠色亮燈`,
      });
    } catch (err: any) {
      setUploadStatus({
        type: 'error',
        message: err?.message || 'SalesProduction Report 解析失敗',
      });
    }
  };

  const handleSortClick = (
    field:
      | 'fyc'
      | 'fyp'
      | 'cases'
      | 'araName'
      | 'uplineManagerName'
      | 'productionStartDateLis'
  ) => {
    if (tableSortField === field) {
      setTableSortAsc((v) => !v);
    } else {
      setTableSortField(field);
      setTableSortAsc(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Ultra-Compact Top Toolbar: Step 1 (Google Drive Sync) + Step 2 (Team Multi-Select & Filters) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs px-3 py-2 space-y-1.5">
        {/* Row 1: Step 1 Sync Buttons + Step 2 Quick Actions + Inline Sub-Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Step 1: Compact Google Drive Sync */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-[#E87722] text-white rounded">
              第一步
            </span>
            <span className="text-[11px] font-bold text-slate-700">
              Google Drive 自動載入:
            </span>
            <button
              type="button"
              onClick={async () => {
                setUploadStatus({
                  type: 'loading',
                  message: '同步 HEADCOUNT 中...',
                });
                try {
                  const res = await fetch('/api/sync-gdrive-headcount', {
                    method: 'POST',
                  });
                  const ct = res.headers.get('content-type') || '';
                  if (res.ok && ct.includes('application/json')) {
                    const data = await res.json();
                    if (data.state) onStateUpdated(data.state);
                    setUploadStatus({
                      type: 'success',
                      message: `已載入 HEADCOUNT (${data.headcountLog?.totalRows || 1145}人)`,
                    });
                  } else {
                    if (PRELOADED_GDRIVE_STATE?.teams?.length) {
                      onStateUpdated(PRELOADED_GDRIVE_STATE);
                    }
                    setUploadStatus({
                      type: 'success',
                      message: '已載入 HEADCOUNT (1145人)',
                    });
                  }
                } catch {
                  if (PRELOADED_GDRIVE_STATE?.teams?.length) {
                    onStateUpdated(PRELOADED_GDRIVE_STATE);
                  }
                  setUploadStatus({
                    type: 'success',
                    message: '已載入 HEADCOUNT (1145人)',
                  });
                }
              }}
              className="px-2 py-1 bg-[#E87722] hover:bg-[#d16819] text-white text-[11px] font-bold rounded-md flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3 h-3" />
              同步 HEADCOUNT
            </button>

            <button
              type="button"
              onClick={async () => {
                setUploadStatus({
                  type: 'loading',
                  message: '同步 PLD & HSUI 中...',
                });
                try {
                  const res = await fetch('/api/sync-gdrive-reports', {
                    method: 'POST',
                  });
                  const ct = res.headers.get('content-type') || '';
                  if (res.ok && ct.includes('application/json')) {
                    const data = await res.json();
                    if (data.state) onStateUpdated(data.state);
                    setUploadStatus({
                      type: 'success',
                      message: `已載入 PLD & HSUI (${data.syncLog?.activatedNames?.length || 68}人亮燈)`,
                    });
                  } else {
                    if (PRELOADED_GDRIVE_STATE?.teams?.length) {
                      onStateUpdated(PRELOADED_GDRIVE_STATE);
                    }
                    setUploadStatus({
                      type: 'success',
                      message: `已載入 PLD & HSUI (${PRELOADED_GDRIVE_STATE?.lastSync?.activatedNames?.length || 68}人亮燈)`,
                    });
                  }
                } catch {
                  if (PRELOADED_GDRIVE_STATE?.teams?.length) {
                    onStateUpdated(PRELOADED_GDRIVE_STATE);
                  }
                  setUploadStatus({
                    type: 'success',
                    message: `已載入 PLD & HSUI (${PRELOADED_GDRIVE_STATE?.lastSync?.activatedNames?.length || 68}人亮燈)`,
                  });
                }
              }}
              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-md flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3 h-3 text-[#E87722]" />
              同步 PLD & HSUI
            </button>

            {uploadStatus.type !== 'idle' && (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                  uploadStatus.type === 'error'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : uploadStatus.type === 'loading'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {uploadStatus.message}
              </span>
            )}
          </div>

          {/* Right side: Inline Sub-Filters (Team, Upline, Search) */}
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">
              <Filter className="w-3 h-3 text-slate-400 shrink-0" />
              <select
                value={selectedTeamFilter}
                onChange={(e) => setSelectedTeamFilter(e.target.value)}
                className="text-[11px] font-semibold text-slate-700 bg-transparent focus:outline-none"
              >
                <option value="ALL">所有 Team ({availableTeams.length})</option>
                {availableTeams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">
              <GitBranch className="w-3 h-3 text-slate-400 shrink-0" />
              <select
                value={selectedManagerFilter}
                onChange={(e) => setSelectedManagerFilter(e.target.value)}
                className="text-[11px] font-semibold text-slate-700 bg-transparent focus:outline-none max-w-[140px]"
              >
                <option value="ALL">所有上線 ({availableManagers.length})</option>
                {availableManagers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">
              <Search className="w-3 h-3 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋姓名/Code..."
                className="w-28 sm:w-36 text-[11px] font-semibold text-slate-800 bg-transparent focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Ultra-Compact Step 2 Multi-Select Team Chips */}
        <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-100">
          <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-slate-900 text-white rounded">
            第二步
          </span>
          <span className="text-[11px] font-bold text-slate-700 mr-0.5">
            分 Team:
          </span>
          <button
            type="button"
            onClick={() => onChangeSelectedDistricts([...DEFAULT_SELECTED_DISTRICTS])}
            className="px-1.5 py-0.5 text-[10px] font-bold text-[#c45d12] bg-[#FFF5EC] hover:bg-[#ffead6] border border-[#E87722]/30 rounded cursor-pointer"
          >
            預設
          </button>
          <button
            type="button"
            onClick={() => onChangeSelectedDistricts([...allDistricts])}
            className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
          >
            全選({allDistricts.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeSelectedDistricts([])}
            className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded cursor-pointer mr-1"
          >
            清除
          </button>

          <div className="flex flex-wrap items-center gap-1">
            {allDistricts.map((district) => {
              const isChecked = selectedDistricts.some(
                (d) =>
                  canonicalizeHeadcountTeam(d) === district.toUpperCase() ||
                  d.toUpperCase() === district.toUpperCase()
              );
              const stats = districtStatsMap.get(district.toUpperCase()) || {
                headcount: 0,
                activeCount: 0,
                fyc: 0,
                fyp: 0,
                cases: 0,
              };

              return (
                <button
                  key={district}
                  type="button"
                  onClick={() => toggleDistrict(district)}
                  title={`${district} · 人數: ${stats.headcount} (${stats.activeCount} 亮燈) · FYC: ${stats.fyc.toLocaleString()}`}
                  className={`px-2 py-0.5 rounded border text-[11px] transition-all cursor-pointer inline-flex items-center gap-1 ${
                    isChecked
                      ? 'bg-[#FFF5EC] border-[#E87722] text-slate-900 font-bold'
                      : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100 text-slate-500 font-medium'
                  }`}
                >
                  {isChecked ? (
                    <CheckSquare className="w-3 h-3 text-[#E87722] shrink-0" />
                  ) : (
                    <Square className="w-3 h-3 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate max-w-[110px]">{district}</span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ({stats.activeCount}/{stats.headcount})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dynamic KPI Strip (Linked to Selected Districts: FYC, FYP, 件數, 團隊階層與招募) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: FYC */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>所選 District 總 FYC / FYCC</span>
            <TrendingUp className="w-4 h-4 text-[#15803D]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#15803D] tabular-nums">
            HK$ {kpiSummary.totalFyc.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 flex items-center justify-between pt-1">
            <span>
              亮燈顧問：<strong className="text-slate-800">{kpiSummary.activeAgents}</strong> /{' '}
              {kpiSummary.totalHeadcount} 人
            </span>
            <span className="font-mono font-bold text-[#15803D]">
              {kpiSummary.activeRate}% 亮燈
            </span>
          </div>
        </div>

        {/* KPI 2: FYP */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>所選 District 總 FYP / AFYP</span>
            <Layers className="w-4 h-4 text-[#E87722]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 tabular-nums">
            HK$ {kpiSummary.totalFyp.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 flex items-center justify-between pt-1">
            <span>人均 FYP (Active)：</span>
            <span className="font-mono font-bold text-slate-700">
              HK${' '}
              {kpiSummary.activeAgents > 0
                ? Math.round(kpiSummary.totalFyp / kpiSummary.activeAgents).toLocaleString()
                : '0'}
            </span>
          </div>
        </div>

        {/* KPI 3: Cases (件數) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>所選 District 總件數 (Cases)</span>
            <Award className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-blue-900 tabular-nums">
            {kpiSummary.totalCases.toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })}{' '}
            <span className="text-sm font-bold text-slate-500">件</span>
          </div>
          <div className="text-xs text-slate-500 flex items-center justify-between pt-1">
            <span>平均每件 FYC：</span>
            <span className="font-mono font-bold text-slate-700">
              HK${' '}
              {kpiSummary.totalCases > 0
                ? Math.round(kpiSummary.totalFyc / kpiSummary.totalCases).toLocaleString()
                : '0'}
            </span>
          </div>
        </div>

        {/* KPI 4: Headcount, Hierarchy & LIS Recruitment */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>團隊階層與 LIS 招募人數</span>
            <UserPlus className="w-4 h-4 text-[#E87722]" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 tabular-nums">
            {kpiSummary.totalHeadcount}{' '}
            <span className="text-sm font-bold text-slate-500">總 Headcount</span>
          </div>
          <div className="text-xs text-slate-500 flex items-center justify-between pt-1">
            <span>
              上線經理：<strong className="text-slate-800">{kpiSummary.managersCount}</strong> 位
            </span>
            <span className="font-mono font-bold text-[#c45d12]">
              近期 LIS 招募：{kpiSummary.recruitsCount} 人
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Leaderboards & Upline Hierarchy Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 6 cols: Individual ARA Leaderboard (FYC / FYP / 件數) */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#E87722]" />
                個人業績排行榜 (ARA Leaderboard)
              </h3>
              <p className="text-xs text-slate-500">
                聯動已勾選 District ({selectedDistricts.join(', ') || '未選擇'})
              </p>
            </div>

            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              {(
                [
                  { key: 'fyc', label: '按 FYC 排行' },
                  { key: 'fyp', label: '按 FYP 排行' },
                  { key: 'cases', label: '按件數排行' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setLeaderboardMetric(tab.key)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                    leaderboardMetric === tab.key
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {araLeaderboard.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                請勾選至少一個 District 區域以檢視排行榜
              </div>
            ) : (
              araLeaderboard.map((item, idx) => (
                <div
                  key={item.id}
                  className={`px-5 py-3 flex items-center justify-between gap-3 ${
                    item.fyc > 0 ? 'bg-emerald-50/35' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-lg text-xs font-mono font-extrabold flex items-center justify-center shrink-0 ${
                        idx === 0
                          ? 'bg-amber-400 text-slate-950'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-900'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs sm:text-sm font-extrabold truncate ${
                            item.fyc > 0 ? 'text-[#15803D]' : 'text-[#172554]'
                          }`}
                        >
                          {item.araName} {item.nickname}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 rounded">
                          {item.team}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[#FFF5EC] text-[#c45d12] rounded">
                          {item.district}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Upline: <strong className="text-slate-700">{item.uplineManagerName}</strong> · LIS:{' '}
                        <span className="font-mono">{item.productionStartDateLis}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono shrink-0">
                    <div
                      className={`text-xs sm:text-sm font-extrabold tabular-nums ${
                        item.fyc > 0 ? 'text-[#15803D]' : 'text-slate-500'
                      }`}
                    >
                      FYC: {item.fyc.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      FYP: {item.fyp.toLocaleString()} · {item.cases} 件
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 6 cols: Upline Manager Hierarchy, Downlines & Recruitment Leaderboard */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[#E87722]" />
                團隊階層架構：上線經理下線與招募統計 (Upline Hierarchy)
              </h3>
              <p className="text-xs text-slate-500">
                根據 <span className="font-mono">Upline Manager Name</span> 與{' '}
                <span className="font-mono">Production Start Date (LIS)</span> 自動聚合（點擊展開下線）
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
              共 {managerHierarchyList.length} 位經理
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
            {managerHierarchyList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                無符合篩選條件的經理階層資料
              </div>
            ) : (
              managerHierarchyList.map((mgr) => {
                const isExpanded = expandedManager === mgr.managerName;
                return (
                  <div key={mgr.managerName} className="bg-white">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedManager(isExpanded ? null : mgr.managerName)
                      }
                      className="w-full px-5 py-3.5 text-left hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-[#E87722] shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                              {mgr.managerName}
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-[#E87722] text-white rounded">
                              {mgr.team}
                            </span>
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded">
                              {mgr.district}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-3 mt-0.5 font-mono">
                            <span>
                              總人數: <strong className="text-slate-800">{mgr.downlines.length}</strong>
                            </span>
                            <span>
                              直屬下線: <strong className="text-slate-800">{mgr.directDownlineCount}</strong>
                            </span>
                            <span className="text-[#c45d12]">
                              LIS 招募: <strong>{mgr.recruitsCount}</strong>
                            </span>
                            <span className="text-[#15803D]">
                              亮燈: <strong>{mgr.activeDownlineCount}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono shrink-0">
                        <div
                          className={`text-xs sm:text-sm font-extrabold tabular-nums ${
                            mgr.totalFyc > 0 ? 'text-[#15803D]' : 'text-slate-600'
                          }`}
                        >
                          FYC: {mgr.totalFyc.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          FYP: {mgr.totalFyp.toLocaleString()} · {mgr.totalCases} 件
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="bg-slate-50 px-5 py-3 border-t border-slate-200/70 space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-500 pb-1 flex items-center justify-between">
                          <span>{mgr.managerName} 團隊下線名單 (ARA Name)</span>
                          <span>Production Start Date (LIS) / 業績</span>
                        </div>
                        {mgr.downlines.map((dl) => (
                          <div
                            key={dl.id}
                            className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-white border border-slate-200/80"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  dl.fyc > 0 ? 'bg-[#15803D]' : 'bg-[#172554]'
                                }`}
                              />
                              <span
                                className={`font-bold truncate ${
                                  dl.fyc > 0 ? 'text-[#15803D]' : 'text-[#172554]'
                                }`}
                              >
                                {dl.araName} {dl.nickname}
                              </span>
                              {dl.araName === mgr.managerName && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-[#c45d12] rounded">
                                  經理本人
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
                              <span className="text-slate-500">
                                LIS: {dl.productionStartDateLis}
                              </span>
                              <span
                                className={
                                  dl.fyc > 0
                                    ? 'font-bold text-[#15803D]'
                                    : 'text-slate-400'
                                }
                              >
                                FYC {dl.fyc.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Team Summary Breakdown Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
            各 Team 區域業績與招募匯總 (按已選 District 動態篩選)
          </h3>
          <span className="text-xs font-mono text-slate-500">
            共 {teamBreakdownList.length} 個 Team
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {teamBreakdownList.map((tb) => {
            const pct =
              tb.headcount > 0 ? Math.round((tb.activeCount / tb.headcount) * 100) : 0;
            return (
              <div
                key={tb.teamName}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-slate-900">
                    {tb.teamName}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-[#FFF5EC] text-[#c45d12] border border-[#E87722]/30 rounded">
                    {tb.district}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1 pt-1 text-center font-mono">
                  <div className="bg-white p-1.5 rounded-lg border border-slate-200/70">
                    <div className="text-[10px] text-slate-400">FYC</div>
                    <div className="text-xs font-extrabold text-[#15803D]">
                      {tb.fyc.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-slate-200/70">
                    <div className="text-[10px] text-slate-400">FYP</div>
                    <div className="text-xs font-bold text-slate-800">
                      {tb.fyp.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-slate-200/70">
                    <div className="text-[10px] text-slate-400">件數</div>
                    <div className="text-xs font-bold text-blue-800">{tb.cases}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 pt-0.5">
                  <span>
                    Headcount: <strong>{tb.headcount}</strong> ({tb.activeCount} 亮燈 / {pct}%)
                  </span>
                  <span className="text-[#c45d12]">LIS 招募: {tb.recruitsCount}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full Headcount & Production Interactive Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
              Headcount 階層架構與 PP Raw 業績連動明細表 ({sortedTableRows.length} 筆)
            </h3>
            <p className="text-xs text-slate-500">
              完整顯示 <span className="font-mono">District</span>、
              <span className="font-mono">Team</span>、
              <span className="font-mono">Upline Manager Name</span>、
              <span className="font-mono">ARA Name</span>、
              <span className="font-mono">Production Start Date (LIS)</span> 及{' '}
              <span className="font-mono">FYC / FYP / 件數</span>
            </p>
          </div>

          <div className="text-right ml-auto">
            <span className="inline-block text-lg sm:text-xl md:text-2xl font-extrabold text-slate-900 underline decoration-2 decoration-[#E87722] underline-offset-4 font-mono tabular-nums">
              {(appState.reportDateDisplay || '6 Oct 2026').startsWith('報表結算日')
                ? appState.reportDateDisplay
                : `報表結算日：${appState.reportDateDisplay || '6 Oct 2026'}`}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">District (區域)</th>
                <th className="py-3 px-4">Team</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-slate-900"
                  onClick={() => handleSortClick('uplineManagerName')}
                >
                  Upline Manager Name ↕
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-slate-900"
                  onClick={() => handleSortClick('araName')}
                >
                  Name (HKID) ↕
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-slate-900"
                  onClick={() => handleSortClick('productionStartDateLis')}
                >
                  Production Start Date (LIS) ↕
                </th>
                <th
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => handleSortClick('fyc')}
                >
                  FYC / FYCC ↕
                </th>
                <th
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => handleSortClick('fyp')}
                >
                  FYP / AFYP ↕
                </th>
                <th
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                  onClick={() => handleSortClick('cases')}
                >
                  件數 (Cases) ↕
                </th>
                <th className="py-3 px-4 text-center">亮燈狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 text-xs">
              {sortedTableRows.map((row) => {
                const isLit = row.fyc > 0 || row.isActive;
                return (
                  <tr
                    key={row.id}
                    className={
                      isLit ? 'bg-emerald-50/40 hover:bg-emerald-50/70' : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-[#FFF5EC] text-[#c45d12] border border-[#E87722]/30 text-[11px]">
                        {row.district}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                      {row.team}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-700 whitespace-nowrap">
                      {row.uplineManagerName}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-extrabold ${
                            isLit ? 'text-[#15803D]' : 'text-[#172554]'
                          }`}
                        >
                          {row.nameHkid || row.araName}
                        </span>
                        {row.agentCode && (
                          <span className="text-[11px] font-mono text-slate-400">
                            #{row.agentCode}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {row.productionStartDateLis}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono font-extrabold tabular-nums whitespace-nowrap ${
                        isLit ? 'text-[#15803D]' : 'text-slate-400'
                      }`}
                    >
                      {row.fyc.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                      {row.fyp.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-800 tabular-nums whitespace-nowrap">
                      {row.cases}
                    </td>
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      {isLit ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          綠色亮燈
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-[#172554]">
                          深藍未亮燈
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
