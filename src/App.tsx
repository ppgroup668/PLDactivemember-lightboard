import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Pause,
  Play,
  RotateCcw,
  Search,
  Square,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AppState,
  DEFAULT_SELECTED_DISTRICTS,
  INITIAL_TEAMS_DATA,
  KNOWN_HEADCOUNT_TEAMS,
  MemberGroup,
  MemberRecord,
  TeamBoard,
  buildInitialHeadcountRoster,
  canonicalizeHeadcountTeam,
  getAllMembersOfTeam,
  getTeamMetrics,
} from './shared/teamsData.ts';
import { CleanTeamBoard } from './components/CleanTeamBoard.tsx';
import { LightboardSlide } from './components/LightboardSlide.tsx';
import { PpRawAnalyticsDashboard } from './components/PpRawAnalyticsDashboard.tsx';
import { ReportUploadModal } from './components/ReportUploadModal.tsx';
import preloadedStateJson from './shared/preloadedState.json';

const PRELOADED_GDRIVE_STATE = preloadedStateJson as unknown as AppState;

export default function App() {
  const [appState, setAppState] = useState<AppState>(() =>
    PRELOADED_GDRIVE_STATE?.teams?.length
      ? PRELOADED_GDRIVE_STATE
      : {
          reportDateDisplay: '30 Sep 2026',
          targetMonthFilter: 'AUTO',
          teams: INITIAL_TEAMS_DATA,
          headcountRoster: buildInitialHeadcountRoster(INITIAL_TEAMS_DATA),
          syncHistory: [],
        }
  );
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTeamIndex, setSelectedTeamIndex] = useState(0);
  const [viewMode, setViewMode] = useState<
    'analytics' | 'clean' | 'slide' | 'grid' | 'ledger'
  >('analytics');
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>(
    DEFAULT_SELECTED_DISTRICTS
  );
  const [autoPlay, setAutoPlay] = useState(false);
  const [showFyccOverlay, setShowFyccOverlay] = useState(true);
  const [isRosterEditMode, setIsRosterEditMode] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [quickUploadStatus, setQuickUploadStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Member inspection / manual FYCC / Name / Role / Delete modal state
  const [editingMember, setEditingMember] = useState<{
    member: MemberRecord;
    team: TeamBoard;
    fullNameInput: string;
    nicknameInput: string;
    isLeaderRowInput: boolean;
    fyccInput: string;
    isActiveInput: boolean;
  } | null>(null);

  // Add new Member (Downline under a Manager, or new Manager Group) modal state
  const [addingMemberModal, setAddingMemberModal] = useState<{
    mode: 'downline' | 'manager-group';
    team: TeamBoard;
    group?: MemberGroup;
    column?: 'left' | 'right';
    fullName: string;
    nickname: string;
  } | null>(null);

  // Team denominator & report date modal state
  const [editingTeamConfig, setEditingTeamConfig] = useState<{
    teamId: string;
    teamName: string;
    reportDateDisplay: string;
    activeMemberDenominator: number;
    teamHeadcountDenominator: number;
    extraTeamActiveCount: number;
  } | null>(null);

  const quickFileInputRef = useRef<HTMLInputElement | null>(null);
  const quickHeadcountInputRef = useRef<HTMLInputElement | null>(null);

  // Initial fetch + WebSocket real-time synchronization
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    fetch('/api/state')
      .then(async (r) => {
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || !ct.includes('application/json')) return null;
        return r.json();
      })
      .then((data) => {
        if (isMounted && data?.state) {
          setAppState(data.state);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (
            (msg.type === 'state:init' || msg.type === 'state:updated') &&
            msg.state
          ) {
            setAppState(msg.state);
          }
        } catch (e) {
          console.error('WS message parse error:', e);
        }
      };

      ws.onclose = () => {
        if (isMounted) {
          reconnectTimer = setTimeout(connectWs, 2500);
        }
      };
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // Keyboard navigation (Left / Right arrows for switching team pages)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (viewMode === 'clean' || viewMode === 'slide') {
        if (e.key === 'ArrowRight') {
          setSelectedTeamIndex((prev) => (prev + 1) % appState.teams.length);
        } else if (e.key === 'ArrowLeft') {
          setSelectedTeamIndex(
            (prev) => (prev - 1 + appState.teams.length) % appState.teams.length
          );
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, appState.teams.length]);

  // TV Carousel Auto-play timer
  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => {
      setSelectedTeamIndex((prev) => (prev + 1) % appState.teams.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [autoPlay, appState.teams.length]);

  const currentTeam =
    appState.teams[selectedTeamIndex] || appState.teams[0];

  // Quick inline file upload handler directly from the sidebar
  const handleQuickFileUpload = async (file: File) => {
    setQuickUploadStatus(`正在解析 ${file.name}...`);
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
      if (!res.ok) throw new Error(data.error || '上傳失敗');
      if (data.state) setAppState(data.state);
      setQuickUploadStatus(
        `已同步 ${file.name}：共 ${data.syncLog.activatedNames.length} 人 FYCC 非 0 轉綠色亮燈`
      );
    } catch (err: any) {
      setQuickUploadStatus(`處理失敗：${err.message}`);
    }
  };

  // Step 1 Quick Headcount file upload handler (.xlsx / .xls / .csv)
  const handleQuickHeadcountUpload = async (file: File) => {
    setQuickUploadStatus(`正在解析 Headcount 檔案 ${file.name}...`);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-headcount', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Headcount 上載失敗');
      if (data.state) setAppState(data.state);
      setQuickUploadStatus(
        `已載入 Headcount (${data.headcountLog.fileName})：共 ${data.headcountLog.totalRows} 人、${data.headcountLog.managersCount} 位經理`
      );
    } catch (err: any) {
      setQuickUploadStatus(`Headcount 處理失敗：${err.message}`);
    }
  };

  const handleSyncGdriveHeadcount = async () => {
    setQuickUploadStatus(
      '正在從 Google Drive 自動同步 HEADCOUNT BY AVA.xls 及 PLD / HSUI THIS MONTH 報表...'
    );
    try {
      const res = await fetch('/api/sync-gdrive-headcount', {
        method: 'POST',
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (data.state) setAppState(data.state);
        const activeCount =
          data.syncLog?.activatedNames?.length ?? agencyTotals.activeMembers;
        setQuickUploadStatus(
          `已從 Google Drive 自動同步 HEADCOUNT (${data.headcountLog?.totalRows || 1145} 人) 及 PLD + HSUI 報表 (${activeCount} 人 Active 亮燈)`
        );
      } else {
        if (PRELOADED_GDRIVE_STATE?.teams?.length) {
          setAppState(PRELOADED_GDRIVE_STATE);
        }
        setQuickUploadStatus(
          `已從 Google Drive 自動同步 HEADCOUNT (1145 人) 及 PLD + HSUI 報表 (${PRELOADED_GDRIVE_STATE?.lastSync?.activatedNames?.length || 68} 人 Active 亮燈)`
        );
      }
    } catch {
      if (PRELOADED_GDRIVE_STATE?.teams?.length) {
        setAppState(PRELOADED_GDRIVE_STATE);
      }
      setQuickUploadStatus(
        `已從 Google Drive 自動同步 HEADCOUNT (1145 人) 及 PLD + HSUI 報表 (${PRELOADED_GDRIVE_STATE?.lastSync?.activatedNames?.length || 68} 人 Active 亮燈)`
      );
    }
  };

  const handleSyncGdriveReports = async () => {
    setQuickUploadStatus(
      '正在從 Google Drive 自動載入 SalesProductionAgency_PLD_THIS MONTH 及 SalesProductionAgency_HSUI_THIS MONTH.xls...'
    );
    try {
      const res = await fetch('/api/sync-gdrive-reports', {
        method: 'POST',
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (data.state) setAppState(data.state);
        setQuickUploadStatus(
          `已自動從 Google Drive 載入 PLD & HSUI THIS MONTH：共 ${data.syncLog?.activatedNames?.length || 68} 位 Active Member 轉綠燈`
        );
      } else {
        if (PRELOADED_GDRIVE_STATE?.teams?.length) {
          setAppState(PRELOADED_GDRIVE_STATE);
        }
        setQuickUploadStatus(
          `已自動從 Google Drive 載入 PLD & HSUI THIS MONTH：共 ${PRELOADED_GDRIVE_STATE?.lastSync?.activatedNames?.length || 68} 位 Active Member 轉綠燈`
        );
      }
    } catch {
      if (PRELOADED_GDRIVE_STATE?.teams?.length) {
        setAppState(PRELOADED_GDRIVE_STATE);
      }
      setQuickUploadStatus(
        `已自動從 Google Drive 載入 PLD & HSUI THIS MONTH：共 ${PRELOADED_GDRIVE_STATE?.lastSync?.activatedNames?.length || 68} 位 Active Member 轉綠燈`
      );
    }
  };

  const allAvailableDistricts = useMemo(() => {
    const set = new Set<string>(DEFAULT_SELECTED_DISTRICTS);
    if (Array.isArray(appState.headcountRoster) && appState.headcountRoster.length > 0) {
      for (const r of appState.headcountRoster) {
        const raw = (r.team || r.district || '').trim();
        if (raw) {
          const c = canonicalizeHeadcountTeam(raw);
          if (c && c !== 'TAM PAN GARY' && c !== 'GARY TAM') {
            set.add(c);
          }
        }
      }
    }
    for (const kt of KNOWN_HEADCOUNT_TEAMS) {
      set.add(kt);
    }
    return Array.from(set);
  }, [appState.headcountRoster]);

  const toggleSidebarDistrict = (teamOption: string) => {
    const upperTarget = teamOption.toUpperCase();
    setSelectedDistricts((prev) =>
      prev.some((d) => d.toUpperCase() === upperTarget)
        ? prev.filter((d) => d.toUpperCase() !== upperTarget)
        : [...prev, teamOption.toUpperCase()]
    );
  };

  // Save single member manual edit (FYCC, Active Status, Full Name, Nickname, Role)
  const handleSaveMemberEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    const parsedFycc = parseFloat(editingMember.fyccInput.replace(/,/g, '')) || 0;
    const memberId = editingMember.member.id;

    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editingMember.fullNameInput,
          nickname: editingMember.nicknameInput,
          isLeaderRow: editingMember.isLeaderRowInput,
          fycc: parsedFycc,
          isActive: editingMember.isActiveInput,
        }),
      });
      const data = await res.json();
      if (data.state) setAppState(data.state);
      setEditingMember(null);
    } catch (err) {
      console.error('Failed to update member:', err);
    }
  };

  // Delete member (not participating in this 3-month Active Member cycle)
  const handleDeleteMember = async (member: MemberRecord, team: TeamBoard) => {
    try {
      const res = await fetch(`/api/teams/${team.id}/members/${member.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.state) setAppState(data.state);
      if (editingMember?.member.id === member.id) {
        setEditingMember(null);
      }
      setQuickUploadStatus(
        `已刪除 ${member.fullName}，${team.name} 的 Active Member 分母已自動更新`
      );
    } catch (err) {
      console.error('Failed to delete member:', err);
    }
  };

  // Submit adding a new Downline (white row) or new Manager Group (orange row)
  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingMemberModal || !addingMemberModal.fullName.trim()) return;

    try {
      if (addingMemberModal.mode === 'downline' && addingMemberModal.group) {
        const res = await fetch(
          `/api/teams/${addingMemberModal.team.id}/groups/${addingMemberModal.group.id}/members`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName: addingMemberModal.fullName,
              nickname: addingMemberModal.nickname,
              isLeaderRow: false,
            }),
          }
        );
        const data = await res.json();
        if (data.state) setAppState(data.state);
        setQuickUploadStatus(
          `已新增下線 ${addingMemberModal.fullName.toUpperCase()} 至 ${addingMemberModal.team.name}`
        );
      } else {
        const res = await fetch(
          `/api/teams/${addingMemberModal.team.id}/groups`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              column: addingMemberModal.column || 'left',
              fullName: addingMemberModal.fullName,
              nickname: addingMemberModal.nickname,
            }),
          }
        );
        const data = await res.json();
        if (data.state) setAppState(data.state);
        setQuickUploadStatus(
          `已於 ${addingMemberModal.team.name} 新增經理 ${addingMemberModal.fullName.toUpperCase()}`
        );
      }
      setAddingMemberModal(null);
    } catch (err) {
      console.error('Failed to add member:', err);
    }
  };

  // Save team denominators & report date
  const handleSaveTeamConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeamConfig) return;
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportDateDisplay: editingTeamConfig.reportDateDisplay,
          teamUpdates: [
            {
              id: editingTeamConfig.teamId,
              activeMemberDenominator: editingTeamConfig.activeMemberDenominator,
              teamHeadcountDenominator: editingTeamConfig.teamHeadcountDenominator,
              extraTeamActiveCount: editingTeamConfig.extraTeamActiveCount,
            },
          ],
        }),
      });
      const data = await res.json();
      if (data.state) setAppState(data.state);
      setEditingTeamConfig(null);
    } catch (err) {
      console.error('Failed to update team config:', err);
    }
  };

  const handleResetBaseline = async () => {
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      const data = await res.json();
      if (data.state) setAppState(data.state);
      setQuickUploadStatus('已將全體成員重設為深藍色（未亮燈，FYCC = 0）');
    } catch (err) {
      console.error('Failed to reset state:', err);
    }
  };

  const openMemberModal = (member: MemberRecord, team: TeamBoard) => {
    setEditingMember({
      member,
      team,
      fullNameInput: member.fullName,
      nicknameInput: member.nickname,
      isLeaderRowInput: member.isLeaderRow,
      fyccInput: String(member.fycc || 0),
      isActiveInput: member.isActive,
    });
  };

  // Aggregate agency totals across all 9 teams
  const agencyTotals = appState.teams.reduce(
    (acc, t) => {
      const m = getTeamMetrics(t);
      acc.activeMembers += m.activeCount;
      acc.totalActiveDenominator += m.activeMemberDenominator;
      acc.totalHeadcountActive += m.totalHeadcountActive;
      acc.totalHeadcountDenominator += m.teamHeadcountDenominator;
      acc.totalFycc += m.totalFycc;
      return acc;
    },
    {
      activeMembers: 0,
      totalActiveDenominator: 0,
      totalHeadcountActive: 0,
      totalHeadcountDenominator: 0,
      totalFycc: 0,
    }
  );

  const agencyActivePct =
    agencyTotals.totalActiveDenominator > 0
      ? Math.round(
          (agencyTotals.activeMembers / agencyTotals.totalActiveDenominator) * 100
        )
      : 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-['Plus_Jakarta_Sans','Calibri',sans-serif]">
      {/* Top Bar Contract: 3 Zones (Brand | Nav Links | 2 Primary Actions) */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setViewMode('analytics');
          }}
          className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap"
        >
          PP Raw 數據分析 & Active Member 亮燈儀表板
        </a>

        {/* Zone 2: Clean text navigation links */}
        <nav className="hidden md:flex items-center gap-5 text-sm font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => setViewMode('analytics')}
            className={`py-1 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              viewMode === 'analytics'
                ? 'text-slate-900 underline decoration-2 decoration-[#E87722] underline-offset-8 font-extrabold'
                : 'hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-[#E87722]" />
            PP Raw 數據分析儀表板
          </button>
          <button
            type="button"
            onClick={() => setViewMode('clean')}
            className={`py-1 transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'clean'
                ? 'text-slate-900 underline decoration-2 decoration-[#E87722] underline-offset-8 font-extrabold'
                : 'hover:text-slate-900'
            }`}
          >
            清晰看板模式
          </button>
          <button
            type="button"
            onClick={() => setViewMode('slide')}
            className={`py-1 transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'slide'
                ? 'text-slate-900 underline decoration-2 decoration-[#E87722] underline-offset-8 font-extrabold'
                : 'hover:text-slate-900'
            }`}
          >
            原版簡報模式
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`py-1 transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'grid'
                ? 'text-slate-900 underline decoration-2 decoration-[#E87722] underline-offset-8 font-extrabold'
                : 'hover:text-slate-900'
            }`}
          >
            Teams 全覽
          </button>
          <button
            type="button"
            onClick={() => setViewMode('ledger')}
            className={`py-1 transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === 'ledger'
                ? 'text-slate-900 underline decoration-2 decoration-[#E87722] underline-offset-8 font-extrabold'
                : 'hover:text-slate-900'
            }`}
          >
            當月 FYCC 總表
          </button>
        </nav>

        {/* Zone 3: 2 Primary Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (viewMode === 'analytics') setViewMode('clean');
              setIsRosterEditMode((v) => !v);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
              isRosterEditMode
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            {isRosterEditMode ? '完成名單編排' : '季初名單加名 / Delete'}
          </button>

          <button
            type="button"
            onClick={handleSyncGdriveHeadcount}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#E87722] rounded-lg hover:bg-[#d16819] transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            同步 Google Drive 報表
          </button>
        </div>
      </header>

      {/* Workspace Body: Left Sidebar (280px) + Main Content Viewport */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1600px] w-full mx-auto">
        {/* Left Sidebar: Step 1 Auto-Loaded Google Drive Files, Step 2 District Filter & Teams Navigation */}
        <aside className="w-full lg:w-[290px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-4 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            {/* Step 1: Auto-Loaded Headcount & SalesProduction Reports from Google Drive */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-[#E87722]" />
                  第一步：雲端自動載入
                </span>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  不用 Upload
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200/90 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-slate-800 truncate">
                    HEADCOUNT BY AVA.xls
                  </span>
                  <a
                    href="https://drive.google.com/drive/folders/1d9k5SpBXItTqVYF2z3_6ZsKo5w4p8Tmn?usp=drive_link"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-slate-500 hover:text-slate-900 underline shrink-0"
                  >
                    資料夾
                  </a>
                </div>
                <div className="text-[10px] text-slate-500">
                  已自動載入 {appState.headcountRoster?.length || 1145} 人 (Col D Name HKID)
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200/90 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-slate-800 truncate">
                    PLD & HSUI THIS MONTH
                  </span>
                  <a
                    href="https://drive.google.com/drive/folders/1pvxqsNTG8ur8V7InCaKVyelveDqMCMPS?usp=sharing"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-slate-500 hover:text-slate-900 underline shrink-0"
                  >
                    報表夾
                  </a>
                </div>
                <div className="text-[10px] text-slate-500 leading-snug">
                  自動取出 <span className="font-mono text-slate-700">SalesProductionAgency_PLD_THIS MONTH</span> 及 <span className="font-mono text-slate-700">SalesProductionAgency_HSUI_THIS MONTH.xls</span> (Col T &gt; 0 亮綠燈)
                </div>
              </div>

              <button
                type="button"
                onClick={handleSyncGdriveReports}
                className="w-full py-2 px-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#E87722]" />
                重新同步 Google Drive 報表
              </button>

              {quickUploadStatus && (
                <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                  {quickUploadStatus}
                </div>
              )}
            </div>

            {/* Step 2: Sidebar Team Multi-Select Filter (分Team做選項) */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">
                  第二步：分 Team 選項
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDistricts([...allAvailableDistricts])}
                    className="text-[11px] font-semibold text-slate-600 hover:underline cursor-pointer"
                  >
                    全選
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDistricts([...DEFAULT_SELECTED_DISTRICTS])
                    }
                    className="text-[11px] font-bold text-[#E87722] hover:underline cursor-pointer"
                  >
                    重設預設
                  </button>
                </div>
              </div>

              <div className="space-y-1 max-h-[260px] overflow-y-auto pr-0.5">
                {allAvailableDistricts.map((dist) => {
                  const checked = selectedDistricts.some(
                    (d) => canonicalizeHeadcountTeam(d) === dist.toUpperCase() || d.toUpperCase() === dist.toUpperCase()
                  );
                  const isDefault = DEFAULT_SELECTED_DISTRICTS.some(
                    (d) => d.toUpperCase() === dist.toUpperCase()
                  );
                  return (
                    <button
                      key={dist}
                      type="button"
                      onClick={() => toggleSidebarDistrict(dist)}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between transition-colors cursor-pointer border ${
                        checked
                          ? 'bg-[#FFF5EC] text-slate-900 border-[#E87722]/60'
                          : 'bg-white text-slate-500 border-slate-200/80 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        {checked ? (
                          <CheckSquare className="w-3.5 h-3.5 text-[#E87722] shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{dist}</span>
                      </span>
                      {isDefault && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#E87722]/15 text-[#c45d12] shrink-0">
                          預設
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setViewMode('analytics')}
                className={`w-full py-1.5 px-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'analytics'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-[#E87722]" />
                檢視 PP Raw 數據分析儀表板
              </button>
            </div>

            {/* Teams Vertical Navigation List */}
            <div>
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-xs font-bold text-slate-500">
                  Active Member 亮燈表 (每 Team 一頁)
                </span>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  亮燈 / Active
                </span>
              </div>

              <div className="flex lg:flex-col gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                {appState.teams.map((team, idx) => {
                  const m = getTeamMetrics(team);
                  const isSelected =
                    (viewMode === 'clean' || viewMode === 'slide') &&
                    selectedTeamIndex === idx;

                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => {
                        setSelectedTeamIndex(idx);
                        if (
                          viewMode === 'analytics' ||
                          viewMode === 'grid' ||
                          viewMode === 'ledger'
                        ) {
                          setViewMode('clean');
                        }
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-left transition-all cursor-pointer shrink-0 lg:shrink flex items-center justify-between gap-2 border ${
                        isSelected
                          ? 'bg-[#FFF5EC] text-slate-900 border-[#E87722] shadow-2xs'
                          : 'bg-white text-slate-700 border-transparent hover:bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-md text-[11px] font-bold font-mono flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-[#E87722] text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold truncate">
                          {team.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 font-mono text-xs tabular-nums">
                        <span
                          className={
                            m.activeCount > 0
                              ? 'font-bold text-[#15803D]'
                              : 'text-slate-400'
                          }
                        >
                          {m.activeCount}/{m.activeMemberDenominator}
                        </span>
                        <span
                          className={`w-9 text-right font-bold ${
                            m.activeMemberPct >= 80
                              ? 'text-emerald-600'
                              : m.activeMemberPct >= 45
                              ? 'text-amber-500'
                              : 'text-red-600'
                          }`}
                        >
                          {m.activeMemberPct}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar Bottom: Overall Agency Summary & Utility Controls */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <div className="p-3 rounded-xl bg-slate-900 text-white space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>全區 Teams 總亮燈</span>
                <span className="font-mono tabular-nums">{agencyActivePct}%</span>
              </div>
              <div className="text-base font-extrabold font-mono tabular-nums">
                {agencyTotals.activeMembers} / {agencyTotals.totalActiveDenominator} Active
              </div>
              <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                總 FYCC: {agencyTotals.totalFycc.toLocaleString()}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowFyccOverlay((v) => !v)}
                className="flex-1 py-1.5 px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                {showFyccOverlay ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" /> 隱藏 FYCC
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> 顯示 FYCC
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetBaseline}
                title="將所有成員重設為深藍色未亮燈"
                className="py-1.5 px-2.5 text-xs font-semibold text-slate-600 hover:text-red-600 bg-slate-100 hover:bg-red-50 rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重設深藍
              </button>
            </div>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-5 min-w-0">
          {/* Mobile / Quick Mode Switcher */}
          <div className="flex md:hidden items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'analytics', label: 'PP Raw 分析儀表板' },
              { id: 'clean', label: '清晰看板' },
              { id: 'slide', label: '原版簡報' },
              { id: 'grid', label: 'Teams 全覽' },
              { id: 'ledger', label: 'FYCC 總表' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
                  viewMode === tab.id
                    ? 'bg-[#E87722] text-white'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sub-Toolbar: Page Navigation & Quick Mode Controls (shown on Team Board views) */}
          {viewMode !== 'analytics' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedTeamIndex(
                      (prev) =>
                        (prev - 1 + appState.teams.length) % appState.teams.length
                    )
                  }
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一隊
                </button>
                <span className="px-2.5 text-xs font-mono font-bold text-slate-700 tabular-nums">
                  第 {selectedTeamIndex + 1} / {appState.teams.length} 頁 · {currentTeam.name}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedTeamIndex(
                      (prev) => (prev + 1) % appState.teams.length
                    )
                  }
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  下一隊
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditingTeamConfig({
                      teamId: currentTeam.id,
                      teamName: currentTeam.name,
                      reportDateDisplay: appState.reportDateDisplay,
                      activeMemberDenominator: currentTeam.activeMemberDenominator,
                      teamHeadcountDenominator: currentTeam.teamHeadcountDenominator,
                      extraTeamActiveCount: currentTeam.extraTeamActiveCount || 0,
                    })
                  }
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  設定日期與分母 ({appState.reportDateDisplay})
                </button>

                <button
                  type="button"
                  onClick={() => setAutoPlay((prev) => !prev)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    autoPlay
                      ? 'bg-[#E87722] text-white border-[#E87722]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {autoPlay ? (
                    <>
                      <Pause className="w-3.5 h-3.5" /> 停止輪播
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" /> 自動輪播
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Active Roster Edit Mode Explanation Banner */}
          {isRosterEditMode && (
            <div className="bg-orange-50 border border-[#E87722]/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900">
                  Active Member 季初名單編排模式（每 3 個月更新一次 · 有參加可加名，沒有參加可 Delete）
                </div>
                <p className="text-xs text-slate-700">
                  <strong className="text-[#E87722]">橙色底格代表經理 (Manager)</strong>，其下方的
                  <strong>白色底格代表該經理的下線 (Downline)</strong>。點擊各組下方的「+ 新增下線」或「+ 新增橙色底經理組別」即可加名，點擊成員右側紅色垃圾桶即可 Delete。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRosterEditMode(false)}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 rounded-lg hover:bg-slate-800 shrink-0 cursor-pointer whitespace-nowrap"
              >
                完成並鎖定名單
              </button>
            </div>
          )}

          {/* Main Content View */}
          {isLoading ? (
            <div className="w-full h-[560px] rounded-xl bg-white border border-slate-200 p-8 animate-pulse space-y-6">
              <div className="h-12 bg-slate-100 rounded-lg w-1/3" />
              <div className="grid grid-cols-2 gap-6">
                <div className="h-64 bg-slate-100 rounded-xl" />
                <div className="h-64 bg-slate-100 rounded-xl" />
              </div>
            </div>
          ) : viewMode === 'analytics' ? (
            /* PP Raw 數據分析儀表板 (Step 1: Headcount File Upload + Step 2: Multi-Select District Filter) */
            <PpRawAnalyticsDashboard
              appState={appState}
              selectedDistricts={selectedDistricts}
              onChangeSelectedDistricts={setSelectedDistricts}
              onStateUpdated={(newState) => setAppState(newState)}
              onOpenReportUploadModal={() => setIsUploadModalOpen(true)}
            />
          ) : viewMode === 'clean' ? (
            /* DEFAULT: Ultra-Legible Clean Dashboard Board */
            <CleanTeamBoard
              team={currentTeam}
              reportDate={appState.reportDateDisplay}
              showFyccValues={showFyccOverlay}
              isRosterEditMode={isRosterEditMode}
              onMemberClick={openMemberModal}
              onDeleteMember={handleDeleteMember}
              onAddDownline={(group, team) =>
                setAddingMemberModal({
                  mode: 'downline',
                  team,
                  group,
                  fullName: '',
                  nickname: '',
                })
              }
              onAddManagerGroup={(column, team) =>
                setAddingMemberModal({
                  mode: 'manager-group',
                  team,
                  column,
                  fullName: '',
                  nickname: '',
                })
              }
              onEditTeamDenominators={(team) =>
                setEditingTeamConfig({
                  teamId: team.id,
                  teamName: team.name,
                  reportDateDisplay: appState.reportDateDisplay,
                  activeMemberDenominator: team.activeMemberDenominator,
                  teamHeadcountDenominator: team.teamHeadcountDenominator,
                  extraTeamActiveCount: team.extraTeamActiveCount || 0,
                })
              }
            />
          ) : viewMode === 'slide' ? (
            /* VIEW 2: Classic PPT Slide View */
            <LightboardSlide
              team={currentTeam}
              reportDate={appState.reportDateDisplay}
              showFyccOverlay={showFyccOverlay}
              isRosterEditMode={isRosterEditMode}
              onMemberClick={openMemberModal}
              onDeleteMember={handleDeleteMember}
              onAddDownline={(group, team) =>
                setAddingMemberModal({
                  mode: 'downline',
                  team,
                  group,
                  fullName: '',
                  nickname: '',
                })
              }
              onAddManagerGroup={(column, team) =>
                setAddingMemberModal({
                  mode: 'manager-group',
                  team,
                  column,
                  fullName: '',
                  nickname: '',
                })
              }
              onEditTeamDenominators={(team) =>
                setEditingTeamConfig({
                  teamId: team.id,
                  teamName: team.name,
                  reportDateDisplay: appState.reportDateDisplay,
                  activeMemberDenominator: team.activeMemberDenominator,
                  teamHeadcountDenominator: team.teamHeadcountDenominator,
                  extraTeamActiveCount: team.extraTeamActiveCount || 0,
                })
              }
            />
          ) : viewMode === 'grid' ? (
            /* VIEW 3: All 9 Teams Clean Overview Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {appState.teams.map((team, idx) => {
                const m = getTeamMetrics(team);
                const members = getAllMembersOfTeam(team);
                return (
                  <div
                    key={team.id}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                        <div>
                          <span className="text-[11px] font-mono text-slate-400">
                            TEAM 0{idx + 1}
                          </span>
                          <h3 className="text-base font-extrabold text-slate-900">
                            {team.name}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTeamIndex(idx);
                            setViewMode('clean');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-[#E87722] bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors cursor-pointer"
                        >
                          進入單頁 →
                        </button>
                      </div>

                      <div className="p-4 space-y-2 max-h-72 overflow-y-auto divide-y divide-slate-100">
                        {members.map((member) => (
                          <div
                            key={member.id}
                            onClick={() => openMemberModal(member, team)}
                            className="py-1.5 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-50 px-1 rounded"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`px-1.5 py-0.5 text-[10px] font-bold rounded shrink-0 ${
                                  member.isLeaderRow
                                    ? 'bg-[#E87722] text-white'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {member.isLeaderRow ? '經理' : '下線'}
                              </span>
                              <span
                                className={`font-bold truncate ${
                                  member.isActive
                                    ? 'text-[#15803D]'
                                    : 'text-[#172554]'
                                }`}
                              >
                                {member.fullName} {member.nickname && `(${member.nickname})`}
                              </span>
                            </div>
                            <span
                              className={`font-mono text-[11px] tabular-nums shrink-0 ${
                                member.isActive
                                  ? 'font-bold text-[#15803D]'
                                  : 'text-slate-400'
                              }`}
                            >
                              {member.fycc !== 0
                                ? member.fycc.toLocaleString()
                                : '0'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50 border-t border-slate-200/80 text-xs font-mono tabular-nums space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Active Member:</span>
                        <strong className="text-slate-900">
                          {m.activeCount} / {m.activeMemberDenominator} (
                          <span
                            className={
                              m.activeMemberPct >= 80
                                ? 'text-emerald-600'
                                : m.activeMemberPct >= 45
                                ? 'text-amber-500'
                                : 'text-red-600'
                            }
                          >
                            {m.activeMemberPct}%
                          </span>
                          )
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Team Headcount:</span>
                        <strong className="text-slate-900">
                          {m.totalHeadcountActive} / {m.teamHeadcountDenominator} (
                          <span
                            className={
                              m.headcountPct >= 45
                                ? 'text-emerald-600'
                                : 'text-red-600'
                            }
                          >
                            {m.headcountPct}%
                          </span>
                          )
                        </strong>
                      </div>
                      <div className="pt-1 text-right font-sans text-[10px] font-semibold text-slate-500">
                        以公司Submissions Report計算Submission Active
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* VIEW 4: Full FYCC & Active Status Data Ledger */
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    全部 9 個團隊成員 · 當月 Requested Month (in total) FYCC 對照表
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    總亮燈人數：{agencyTotals.activeMembers} / {agencyTotals.totalActiveDenominator} Active Member · 總 FYCC：HK$ {agencyTotals.totalFycc.toLocaleString()}
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜尋成員英文姓名、別名或 Team..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E87722]"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-3 px-4 font-semibold">Team</th>
                      <th className="py-3 px-4 font-semibold">成員姓名 (Full Name)</th>
                      <th className="py-3 px-4 font-semibold">別名 (Nickname)</th>
                      <th className="py-3 px-4 font-semibold">職級 (橙色=經理 / 白色=下線)</th>
                      <th className="py-3 px-4 font-semibold text-right">
                        Requested Month (in total) FYCC
                      </th>
                      <th className="py-3 px-4 font-semibold text-right">亮燈狀態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {appState.teams.flatMap((team) =>
                      getAllMembersOfTeam(team)
                        .filter((m) => {
                          if (!searchQuery.trim()) return true;
                          const q = searchQuery.toLowerCase();
                          return (
                            m.fullName.toLowerCase().includes(q) ||
                            m.nickname.toLowerCase().includes(q) ||
                            team.name.toLowerCase().includes(q)
                          );
                        })
                        .map((member) => (
                          <tr
                            key={member.id}
                            onClick={() => openMemberModal(member, team)}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-4 font-semibold text-slate-700">
                              {team.name}
                            </td>
                            <td
                              className={`py-2.5 px-4 font-bold ${
                                member.isActive ? 'text-[#15803D]' : 'text-[#172554]'
                              }`}
                            >
                              {member.fullName}
                            </td>
                            <td
                              className={`py-2.5 px-4 font-bold ${
                                member.isActive ? 'text-[#15803D]' : 'text-[#172554]'
                              }`}
                            >
                              {member.nickname || '—'}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600">
                              {member.isLeaderRow ? (
                                <span className="text-[#E87722] font-bold">
                                  橙色底 · 經理 (Manager)
                                </span>
                              ) : (
                                <span>白色底 · 下線 (Downline)</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {member.fycc !== 0 ? member.fycc.toLocaleString() : '0.00'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold">
                              {member.isActive ? (
                                <span className="text-[#15803D]">綠色亮燈 (Active)</span>
                              ) : (
                                <span className="text-[#172554]">深藍未亮燈</span>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Member Edit / FYCC / Role / Delete Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  編輯成員資料與亮燈狀態 ({editingMember.team.name})
                </h3>
                <p className="text-xs text-slate-500">
                  可修改 FYCC 數值、切換經理/下線底色，或將未參加成員 Delete
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMemberEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    英文全名 (Full Name)
                  </label>
                  <input
                    type="text"
                    required
                    value={editingMember.fullNameInput}
                    onChange={(e) =>
                      setEditingMember({
                        ...editingMember,
                        fullNameInput: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-bold uppercase bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    英文別名 (Nickname)
                  </label>
                  <input
                    type="text"
                    value={editingMember.nicknameInput}
                    onChange={(e) =>
                      setEditingMember({
                        ...editingMember,
                        nicknameInput: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-bold uppercase bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  表格底色與職級定位
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingMember({
                        ...editingMember,
                        isLeaderRowInput: true,
                      })
                    }
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      editingMember.isLeaderRowInput
                        ? 'bg-[#E87722] text-white border-[#E87722]'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    橙色底 · 經理 (Manager)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingMember({
                        ...editingMember,
                        isLeaderRowInput: false,
                      })
                    }
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      !editingMember.isLeaderRowInput
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    白色底 · 下線 (Downline)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  當月 Requested Month (in total) 的 FYCC 數值
                </label>
                <input
                  type="number"
                  step="any"
                  value={editingMember.fyccInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    const num = parseFloat(val);
                    setEditingMember({
                      ...editingMember,
                      fyccInput: val,
                      isActiveInput: !isNaN(num) && Math.abs(num) > 0,
                    });
                  }}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E87722]"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  此行 FYCC 不是 0 時，自動轉為綠色亮燈
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs font-semibold text-slate-700">
                  當月亮燈狀態 (名字顏色)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditingMember({
                      ...editingMember,
                      isActiveInput: !editingMember.isActiveInput,
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    editingMember.isActiveInput
                      ? 'bg-[#15803D] text-white'
                      : 'bg-[#172554] text-white'
                  }`}
                >
                  {editingMember.isActiveInput ? '已亮燈 (綠色)' : '未亮燈 (預設深藍色)'}
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() =>
                    handleDeleteMember(editingMember.member, editingMember.team)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  刪除此成員 (Delete)
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingMember(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#E87722] rounded-lg hover:bg-[#d16819] cursor-pointer"
                  >
                    儲存並即時同步
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Member (White-row Downline or Orange-row Manager Group) Modal */}
      {addingMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#E87722]" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {addingMemberModal.mode === 'downline'
                      ? `新增下線成員 (白色底格 · ${addingMemberModal.team.name})`
                      : `新增經理組別 (橙色底格 · ${addingMemberModal.team.name})`}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {addingMemberModal.mode === 'downline'
                      ? '此成員將加入所選橙色底經理下方，成為他的白色底下線'
                      : `將於${addingMemberModal.column === 'right' ? '右欄' : '左欄'}建立新的橙色底經理列`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddingMemberModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddMemberSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  英文全名 (Full Name，與報表一致)
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="例如：CHAN TAI MAN"
                  value={addingMemberModal.fullName}
                  onChange={(e) =>
                    setAddingMemberModal({
                      ...addingMemberModal,
                      fullName: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-bold uppercase bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E87722]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  英文別名 (Nickname，選填)
                </label>
                <input
                  type="text"
                  placeholder="例如：DAVID"
                  value={addingMemberModal.nickname}
                  onChange={(e) =>
                    setAddingMemberModal({
                      ...addingMemberModal,
                      nickname: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-bold uppercase bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E87722]"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                新增後預設名字為<strong className="text-[#172554]">深藍色（未亮燈）</strong>，且該 Team 的 Active Member 分母會自動 +1。
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddingMemberModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#E87722] rounded-lg hover:bg-[#d16819] cursor-pointer"
                >
                  確認加名
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Team Headcount & Date Config Modal */}
      {editingTeamConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 shadow-xl space-y-4 my-8">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Team Headcount 計算明細與分母設定 ({editingTeamConfig.teamName})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  根據 Headcount.excel (Column D：Name (HKID)) 遞歸分配：① 最高級主管 (Top Leader) 計 1 人 → ② 直屬下線 (Upline Manager Name 為該主管的所有 Name (HKID)) → ③ 多層級下線 (自動遞歸展開其下方所有 Agent)
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/sync-gdrive-headcount', {
                        method: 'POST',
                      });
                      const data = await res.json();
                      if (data.state) {
                        setAppState(data.state);
                        const updatedTeam = data.state.teams.find(
                          (t: TeamBoard) => t.id === editingTeamConfig.teamId
                        );
                        if (updatedTeam) {
                          setEditingTeamConfig({
                            ...editingTeamConfig,
                            teamHeadcountDenominator:
                              updatedTeam.teamHeadcountDenominator ||
                              (updatedTeam.headcountMembers || []).length,
                          });
                        }
                        setQuickUploadStatus(
                          `已自動同步 Google Drive HEADCOUNT BY AVA.xls (Column D Name (HKID)，共 ${data.headcountLog?.totalRows || 1145} 筆)`
                        );
                      }
                    } catch (err) {
                      console.error('Failed to sync Google Drive headcount:', err);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#E87722] hover:bg-[#d16819] text-white text-xs font-bold cursor-pointer shadow-xs transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>重新同步 HEADCOUNT BY AVA.xls</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTeamConfig(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {(() => {
              const targetTeam = appState.teams.find(
                (t) => t.id === editingTeamConfig.teamId
              );
              const hcList = targetTeam?.headcountMembers || [];
              if (hcList.length === 0) return null;
              const activeHcCount = hcList.filter((h) => h.fycc > 0 || h.isActive).length;
              const topCount = hcList.filter((h) => (h.hierarchyTier ?? 0) === 0).length;
              const directCount = hcList.filter((h) => h.hierarchyTier === 1).length;
              const indirectCount = hcList.filter((h) => (h.hierarchyTier ?? 0) >= 2).length;

              return (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-orange-50/80 border border-orange-200/80">
                      <div className="text-[11px] text-slate-500 font-semibold">
                        ① 最高級主管 (Top Leader)
                      </div>
                      <div className="text-sm font-extrabold text-[#E87722] font-mono mt-0.5">
                        {topCount} 人
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-200/70">
                      <div className="text-[11px] text-slate-500 font-semibold">
                        ② 直屬下線 (Direct · Tier 1)
                      </div>
                      <div className="text-sm font-extrabold text-blue-700 font-mono mt-0.5">
                        {directCount} 人
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-purple-50/70 border border-purple-200/70">
                      <div className="text-[11px] text-slate-500 font-semibold">
                        ③ 多層級下線 (Indirect · Tier 2+)
                      </div>
                      <div className="text-sm font-extrabold text-purple-700 font-mono mt-0.5">
                        {indirectCount} 人
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                    <span>
                      總團隊人數：{topCount} + {directCount} + {indirectCount} = 共 {hcList.length} Headcount
                    </span>
                    <span className="text-[#15803D] font-mono tabular-nums">
                      FYCC &gt; 0：{activeHcCount} Active / {hcList.length} Headcount
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2 px-2.5 font-semibold">#</th>
                          <th className="py-2 px-2.5 font-semibold">階層 (Tier)</th>
                          <th className="py-2 px-2.5 font-semibold">Name (HKID)</th>
                          <th className="py-2 px-2.5 font-semibold">Code</th>
                          <th className="py-2 px-2.5 font-semibold">Upline Manager Name</th>
                          <th className="py-2 px-2.5 font-semibold text-right">FYCC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {hcList.map((hc, i) => {
                          const tier = hc.hierarchyTier ?? 0;
                          return (
                            <tr
                              key={hc.agentCode || hc.agentNameEN || i}
                              className={hc.fycc > 0 ? 'bg-emerald-50/60' : ''}
                            >
                              <td className="py-1.5 px-2.5 font-mono text-slate-400">
                                {i + 1}
                              </td>
                              <td className="py-1.5 px-2.5">
                                {tier === 0 ? (
                                  <span className="px-1.5 py-0.5 rounded bg-[#E87722] text-white font-bold text-[10px]">
                                    最高級主管
                                  </span>
                                ) : tier === 1 ? (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                                    直屬下線 (T1)
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">
                                    多層級下線 (T{tier})
                                  </span>
                                )}
                              </td>
                              <td
                                className={`py-1.5 px-2.5 font-bold ${
                                  hc.fycc > 0 ? 'text-[#15803D]' : 'text-[#172554]'
                                }`}
                              >
                                {hc.nameHkid || hc.agentNameEN}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono text-slate-500">
                                {hc.agentCode || '—'}
                              </td>
                              <td className="py-1.5 px-2.5 font-medium text-slate-600">
                                {hc.managerEN} {hc.managerCN}
                              </td>
                              <td
                                className={`py-1.5 px-2.5 text-right font-mono tabular-nums font-bold ${
                                  hc.fycc > 0 ? 'text-[#15803D]' : 'text-slate-400'
                                }`}
                              >
                                {hc.fycc > 0 ? hc.fycc.toLocaleString() : '0.00'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            <form onSubmit={handleSaveTeamConfig} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  報表結算日期顯示 (例如：30 Sep 2026)
                </label>
                <input
                  type="text"
                  value={editingTeamConfig.reportDateDisplay}
                  onChange={(e) =>
                    setEditingTeamConfig({
                      ...editingTeamConfig,
                      reportDateDisplay: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Active Member 分母
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editingTeamConfig.activeMemberDenominator}
                    onChange={(e) =>
                      setEditingTeamConfig({
                        ...editingTeamConfig,
                        activeMemberDenominator: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Team Headcount 分母
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editingTeamConfig.teamHeadcountDenominator}
                    onChange={(e) =>
                      setEditingTeamConfig({
                        ...editingTeamConfig,
                        teamHeadcountDenominator: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  額外 Team Headcount Active 人數 (不在 Active Member 名單但有交單之成員)
                </label>
                <input
                  type="number"
                  min={0}
                  value={editingTeamConfig.extraTeamActiveCount}
                  onChange={(e) =>
                    setEditingTeamConfig({
                      ...editingTeamConfig,
                      extraTeamActiveCount: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTeamConfig(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#E87722] rounded-lg hover:bg-[#d16819] cursor-pointer"
                >
                  儲存設定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Backend Report Upload Modal */}
      <ReportUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        appState={appState}
        onStateUpdated={(newState) => setAppState(newState)}
      />
    </div>
  );
}
