import React from 'react';
import {
  CheckCircle2,
  Edit3,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  MemberGroup,
  MemberRecord,
  TeamBoard,
  getTeamMetrics,
} from '../shared/teamsData.ts';

interface CleanTeamBoardProps {
  team: TeamBoard;
  reportDate: string;
  showFyccValues: boolean;
  isRosterEditMode: boolean;
  onMemberClick: (member: MemberRecord, team: TeamBoard) => void;
  onEditTeamDenominators: (team: TeamBoard) => void;
  onAddDownline: (group: MemberGroup, team: TeamBoard) => void;
  onAddManagerGroup: (column: 'left' | 'right', team: TeamBoard) => void;
  onDeleteMember: (member: MemberRecord, team: TeamBoard) => void;
}

export const CleanTeamBoard: React.FC<CleanTeamBoardProps> = ({
  team,
  reportDate,
  showFyccValues,
  isRosterEditMode,
  onMemberClick,
  onEditTeamDenominators,
  onAddDownline,
  onAddManagerGroup,
  onDeleteMember,
}) => {
  const metrics = getTeamMetrics(team);

  const activeMemberPctColor =
    metrics.activeMemberPct >= 80
      ? 'text-emerald-600'
      : metrics.activeMemberPct >= 45
      ? 'text-amber-500'
      : 'text-red-600';

  const activeMemberBarColor =
    metrics.activeMemberPct >= 80
      ? 'bg-[#16A34A]'
      : metrics.activeMemberPct >= 45
      ? 'bg-amber-500'
      : 'bg-red-600';

  const headcountPctColor =
    metrics.headcountPct >= 45
      ? 'text-emerald-600'
      : 'text-red-600';

  const headcountBarColor =
    metrics.headcountPct >= 45
      ? 'bg-[#16A34A]'
      : 'bg-red-600';

  const renderGroupCard = (group: MemberGroup) => {
    const manager = group.members.find((m) => m.isLeaderRow) || group.members[0];
    const managerLabel = manager?.nickname || manager?.fullName || '經理';
    const groupActiveCount = group.members.filter((m) => m.isActive).length;

    return (
      <div
        key={group.id}
        className="bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden transition-all"
      >
        {/* Top Orange Accent Bar signifying a Manager Unit */}
        <div className="h-1.5 w-full bg-[#E87722]" />

        <div className="divide-y divide-slate-200/80">
          {group.members.map((member, idx) => {
            const isLeader = member.isLeaderRow;
            const isActive = member.isActive;

            // Background:
            // Manager (橙色底代表經理): Warm high-contrast orange surface (#FFF4EB) or subtle emerald-tinted orange when lit
            // Downline (白色底代表下線): Clean white surface (#FFFFFF) or subtle emerald tint when lit
            const rowBgClass = isLeader
              ? isActive
                ? 'bg-[#ECFDF3] hover:bg-[#DCFCE7]'
                : 'bg-[#FFF5EC] hover:bg-[#FFEDD5]'
              : isActive
              ? 'bg-[#F0FDF4]/80 hover:bg-[#DCFCE7]/70'
              : 'bg-white hover:bg-slate-50';

            // Name Text Color:
            // Default: Deep Navy Blue (#172554)
            // Active (FYCC !== 0): Vibrant Emerald Green (#15803D)
            const nameColorClass = isActive
              ? 'text-[#15803D]'
              : 'text-[#172554]';

            return (
              <div
                key={member.id}
                onClick={() => onMemberClick(member, team)}
                className={`px-4 sm:px-5 ${
                  isLeader ? 'py-3.5' : 'py-3'
                } ${rowBgClass} transition-colors cursor-pointer flex items-center justify-between gap-3 group`}
              >
                {/* Left: Role Indicator + Full Name + Nickname */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {isLeader ? (
                    <span className="px-2 py-0.5 text-[11px] font-extrabold tracking-wide rounded bg-[#E87722] text-white shrink-0 shadow-2xs">
                      經理
                    </span>
                  ) : (
                    <span
                      className="w-11 text-center text-[11px] font-semibold text-slate-400 shrink-0 select-none"
                      title="下線成員"
                    >
                      └ 下線
                    </span>
                  )}

                  {/* Full Name & Nickname Grid */}
                  <div className="grid grid-cols-12 items-center gap-2 flex-1 min-w-0">
                    <span
                      className={`col-span-7 sm:col-span-8 font-bold tracking-wide uppercase truncate ${
                        isLeader ? 'text-base sm:text-[17px]' : 'text-[15px]'
                      } ${nameColorClass}`}
                    >
                      {member.fullName}
                    </span>

                    <span
                      className={`col-span-5 sm:col-span-4 font-bold tracking-wide uppercase truncate ${
                        isLeader ? 'text-base sm:text-[17px]' : 'text-[15px]'
                      } ${nameColorClass}`}
                    >
                      {member.nickname || '—'}
                    </span>
                  </div>
                </div>

                {/* Right: Status Light / FYCC Value / Roster Delete Button */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {showFyccValues && (
                    <span
                      className={`font-mono text-xs font-semibold tabular-nums ${
                        member.fycc !== 0 ? 'text-[#15803D]' : 'text-slate-400'
                      }`}
                    >
                      {member.fycc !== 0
                        ? `FYCC ${member.fycc.toLocaleString()}`
                        : '0.00'}
                    </span>
                  )}

                  {/* Light-up Status Indicator */}
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#15803D]">
                      <CheckCircle2 className="w-4 h-4 fill-[#16A34A] text-white shrink-0" />
                      <span className="hidden sm:inline">已亮燈</span>
                    </span>
                  ) : (
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-[#172554]/25 group-hover:bg-[#172554]/50 transition-colors"
                      title="預設深藍色（未亮燈）"
                    />
                  )}

                  {/* Delete button in Roster Edit Mode */}
                  {isRosterEditMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteMember(member, team);
                      }}
                      title={`刪除 ${member.fullName}`}
                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Group Footer: either Roster Add Downline button or subtle group count */}
        {isRosterEditMode ? (
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200/80">
            <button
              type="button"
              onClick={() => onAddDownline(group, team)}
              className="w-full py-1.5 px-3 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-dashed border-slate-300 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#E87722]" />
              <span>+ 新增【{managerLabel}】的下線 (白色底格)</span>
            </button>
          </div>
        ) : (
          group.members.length > 1 && (
            <div className="px-4 py-1.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>經理組別共 {group.members.length} 人（1 經理 + {group.members.length - 1} 下線）</span>
              <span className="font-mono tabular-nums">
                已亮燈 {groupActiveCount} / {group.members.length}
              </span>
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Team Header & High-Legibility KPI Summary Cards */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Team Title & Date */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-500">
              <span>當月 ACTIVE MEMBER 亮燈表</span>
              <span aria-hidden="true">·</span>
              <span>報表結算日：{reportDate}</span>
              <span aria-hidden="true">·</span>
              <span>以公司 Submissions Report 計算</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-8 rounded-full bg-[#E87722] shrink-0" />
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                {team.title}
              </h1>
            </div>
          </div>

          {/* 2 Clear Formula KPI Blocks (Click to edit denominators) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 lg:min-w-[540px]">
            {/* KPI 1: Active Member Ratio */}
            <div
              onClick={() => onEditTeamDenominators(team)}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 hover:border-slate-300 transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                <span>Active Member 亮燈率</span>
                <Edit3 className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm sm:text-base font-bold text-slate-800 font-mono tabular-nums">
                  {metrics.activeCount} Active / {metrics.activeMemberDenominator} Active Member
                </div>
                <div
                  className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums ${activeMemberPctColor}`}
                >
                  {metrics.activeMemberPct}%
                </div>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2.5">
                <div
                  className={`h-full ${activeMemberBarColor} transition-all duration-300`}
                  style={{ width: `${Math.min(100, metrics.activeMemberPct)}%` }}
                />
              </div>
            </div>

            {/* KPI 2: Team Headcount Ratio */}
            <div
              onClick={() => onEditTeamDenominators(team)}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 hover:border-slate-300 transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                <span>Team Headcount 亮燈率</span>
                <Edit3 className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm sm:text-base font-bold text-slate-800 font-mono tabular-nums">
                  {metrics.totalHeadcountActive} Active / {metrics.teamHeadcountDenominator} Headcount
                </div>
                <div
                  className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums ${headcountPctColor}`}
                >
                  {metrics.headcountPct}%
                </div>
              </div>
              {metrics.topLeaderCount > 0 && (
                <div className="mt-1.5 text-[11px] font-medium text-slate-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-slate-700 font-semibold">
                    最高級主管 {metrics.topLeaderCount}
                  </span>
                  <span>+</span>
                  <span>直屬下線 {metrics.directDownlineCount}</span>
                  <span>+</span>
                  <span>多層級下線 {metrics.indirectDownlineCount}</span>
                  <span className="font-mono font-bold text-[#E87722]">
                    = {metrics.teamHeadcountDenominator} 人
                  </span>
                </div>
              )}
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                <div
                  className={`h-full ${headcountBarColor} transition-all duration-300`}
                  style={{ width: `${Math.min(100, metrics.headcountPct)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Visual Legend Bar */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#E87722] text-white">
                經理
              </span>
              <span>橙色底代表經理 (Manager)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400 font-mono">└ 下線</span>
              <span>下方白色格代表該經理的下線</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#172554]" />
              <strong className="text-[#172554]">深藍色姓名</strong>
              <span>= 預設未亮燈 (FYCC 為 0)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
              <strong className="text-[#15803D]">綠色姓名</strong>
              <span>= 當月 FYCC 非 0 已亮燈</span>
            </span>
          </div>

          <span className="text-slate-400">
            點擊任一成員可手動調整 FYCC 或修改姓名/職級
          </span>
        </div>
      </div>

      {/* Main 2-Column Manager & Downline Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column */}
        <div className="space-y-4">
          {team.leftColumnGroups.map((g) => renderGroupCard(g))}
          {isRosterEditMode && (
            <button
              type="button"
              onClick={() => onAddManagerGroup('left', team)}
              className="w-full py-3 px-4 text-xs font-bold text-[#E87722] bg-orange-50/70 hover:bg-orange-100/80 border-2 border-dashed border-[#E87722]/50 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ 於左欄新增【橙色底經理】組別</span>
            </button>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {team.rightColumnGroups.map((g) => renderGroupCard(g))}
          {isRosterEditMode && (
            <button
              type="button"
              onClick={() => onAddManagerGroup('right', team)}
              className="w-full py-3 px-4 text-xs font-bold text-[#E87722] bg-orange-50/70 hover:bg-orange-100/80 border-2 border-dashed border-[#E87722]/50 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ 於右欄新增【橙色底經理】組別</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom-Right Caption on every Active Member Lightboard page */}
      <div className="pt-2 flex justify-end">
        <span className="text-xs font-bold text-slate-600 tracking-wide">
          以公司Submissions Report計算Submission Active
        </span>
      </div>
    </div>
  );
};
