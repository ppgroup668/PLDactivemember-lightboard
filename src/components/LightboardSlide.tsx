import React from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import {
  MemberGroup,
  MemberRecord,
  TeamBoard,
  getTeamMetrics,
} from '../shared/teamsData.ts';

interface LightboardSlideProps {
  team: TeamBoard;
  reportDate: string;
  showFyccOverlay: boolean;
  isRosterEditMode?: boolean;
  onMemberClick: (member: MemberRecord, team: TeamBoard) => void;
  onEditTeamDenominators?: (team: TeamBoard) => void;
  onAddDownline?: (group: MemberGroup, team: TeamBoard) => void;
  onAddManagerGroup?: (column: 'left' | 'right', team: TeamBoard) => void;
  onDeleteMember?: (member: MemberRecord, team: TeamBoard) => void;
  compactMode?: boolean;
}

export const LightboardSlide: React.FC<LightboardSlideProps> = ({
  team,
  reportDate,
  showFyccOverlay,
  isRosterEditMode = false,
  onMemberClick,
  onEditTeamDenominators,
  onAddDownline,
  onAddManagerGroup,
  onDeleteMember,
  compactMode = false,
}) => {
  const metrics = getTeamMetrics(team);

  const leftRowCount = team.leftColumnGroups.reduce(
    (acc, g) => acc + g.members.length,
    0
  );
  const rightRowCount = team.rightColumnGroups.reduce(
    (acc, g) => acc + g.members.length,
    0
  );
  const maxRows = Math.max(leftRowCount, rightRowCount);
  const isDense = maxRows >= 9 || team.leftColumnGroups.length >= 4;
  const isMediumDense = maxRows >= 7;

  const rowPy = compactMode
    ? 'py-1.5'
    : isDense
    ? 'py-1.5 md:py-2'
    : isMediumDense
    ? 'py-2.5'
    : 'py-3';

  const rowTextSize = compactMode
    ? 'text-xs sm:text-sm'
    : isDense
    ? 'text-sm sm:text-base md:text-[19px]'
    : 'text-base sm:text-lg md:text-[21px]';

  const groupGap = compactMode
    ? 'mb-2.5'
    : isDense
    ? 'mb-3.5'
    : 'mb-6';

  // Color rules:
  // Active Member 亮燈率: < 45% Red, 45-80% Yellow, >= 80% Green
  const activeMemberPctColor =
    metrics.activeMemberPct >= 80
      ? 'text-[#4EA72E]'
      : metrics.activeMemberPct >= 45
      ? 'text-[#D69600]'
      : 'text-[#C00000]';

  // Team Headcount 亮燈率: < 45% Red, >= 45% Green
  const headcountPctColor =
    metrics.headcountPct >= 45
      ? 'text-[#4EA72E]'
      : 'text-[#C00000]';

  const renderGroup = (group: MemberGroup) => {
    const managerName =
      group.members.find((m) => m.isLeaderRow)?.nickname ||
      group.members[0]?.fullName ||
      '經理';

    return (
      <div key={group.id} className={`${groupGap} last:mb-0`}>
        {group.members.map((member, idx) => {
          const isLastInGroup = idx === group.members.length - 1;
          const isLeader = member.isLeaderRow;
          const isActive = member.isActive;

          const borderClasses = isLeader
            ? 'border-t-[2.5px] border-b-[2.5px] border-black'
            : isLastInGroup
            ? 'border-b-[2.5px] border-black'
            : 'border-b border-transparent';

          const bgClasses = isLeader
            ? 'bg-[#E87722] hover:bg-[#df6f1b]'
            : 'bg-[#F8F8F8] hover:bg-[#EFEFEF]';

          // Text color rules ("亮燈表"):
          // Default: Dark Navy (#182650). When Active (FYCC > 0): Green!
          const textColorClasses = isActive
            ? isLeader
              ? 'text-[#68E334] [text-shadow:0_1px_1.5px_rgba(0,0,0,0.45)]'
              : 'text-[#53A630]'
            : 'text-[#182650]';

          return (
            <div
              key={member.id}
              className={`w-full grid grid-cols-12 items-center px-3 sm:px-5 ${rowPy} ${borderClasses} ${bgClasses} transition-colors group relative`}
            >
              {/* Main clickable area for editing member / FYCC / status */}
              <button
                type="button"
                onClick={() => onMemberClick(member, team)}
                title={
                  isLeader
                    ? `橙色底：經理 (${member.fullName} ${member.nickname}) · 點擊編輯`
                    : `白色底：下線 (${member.fullName} ${member.nickname}) · 點擊編輯`
                }
                className="col-span-12 grid grid-cols-12 items-center text-left cursor-pointer focus:outline-none"
              >
                {/* Left side of table: Full Name */}
                <span
                  className={`col-span-7 font-bold tracking-wide uppercase truncate pr-2 ${rowTextSize} ${textColorClasses}`}
                >
                  {member.fullName}
                </span>

                {/* Right side of table: Nickname */}
                <span
                  className={`col-span-5 font-bold tracking-wide uppercase text-center truncate ${rowTextSize} ${textColorClasses}`}
                >
                  {member.nickname}
                </span>
              </button>

              {/* Right-side overlay: either Roster Edit Delete button OR FYCC badge */}
              {isRosterEditMode && onDeleteMember ? (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      isLeader
                        ? 'bg-black/25 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isLeader ? '經理' : '下線'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteMember(member, team);
                    }}
                    title={`刪除 ${member.fullName} (未參加本季 Active Member)`}
                    className="p-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span
                  onClick={() => onMemberClick(member, team)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums transition-opacity cursor-pointer ${
                    showFyccOverlay
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  } ${
                    member.fycc > 0
                      ? 'bg-emerald-950/85 text-emerald-300'
                      : 'bg-slate-900/75 text-slate-300'
                  }`}
                >
                  {member.fycc > 0
                    ? `FYCC ${member.fycc.toLocaleString()}`
                    : 'FYCC 0'}
                </span>
              )}
            </div>
          );
        })}

        {/* In Roster Edit Mode: button to add a new white-background downline under this orange Manager */}
        {isRosterEditMode && onAddDownline && (
          <button
            type="button"
            onClick={() => onAddDownline(group, team)}
            className="w-full py-1.5 px-3 mt-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-dashed border-slate-300 rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#E87722]" />
            <span>+ 新增【{managerName}】的下線 (白色底格)</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className={`w-full rounded-2xl bg-gradient-to-br from-[#F4EBDC] via-[#FAF6EE] to-[#F3E9D8] ${
        compactMode ? 'p-3 sm:p-4' : 'p-4 sm:p-7 md:p-9'
      } shadow-sm border border-[#E6DEC8] select-none`}
    >
      {/* Inner White Slide Frame */}
      <div
        className={`w-full bg-[#FDFDFD] rounded-xl ${
          compactMode
            ? 'px-4 py-4 min-h-[380px]'
            : 'px-6 sm:px-12 md:px-16 py-6 sm:py-9 min-h-[600px] lg:min-h-[680px]'
        } flex flex-col justify-between relative shadow-[0_2px_12px_rgba(0,0,0,0.03)]`}
      >
        {/* Top Header Row: Gray Dot + "Active Member – Team" on left, Underlined Date on right */}
        <div>
          <div
            className={`flex flex-wrap items-start justify-between gap-4 ${
              compactMode ? 'mb-4' : isDense ? 'mb-5' : 'mb-8'
            }`}
          >
            <div className="flex items-center gap-3.5 mt-1">
              <span
                className={`${
                  compactMode ? 'w-6 h-6' : 'w-9 h-9 sm:w-11 sm:h-11'
                } rounded-full bg-[#B5A8A3] shrink-0 inline-block`}
                aria-hidden="true"
              />
              <h2
                className={`${
                  compactMode
                    ? 'text-lg sm:text-xl'
                    : 'text-2xl sm:text-3xl md:text-[33px]'
                } font-bold tracking-tight text-[#2E3338]`}
              >
                {team.title}
              </h2>
            </div>

            <div className="text-right">
              <span
                className={`${
                  compactMode
                    ? 'text-base sm:text-lg'
                    : 'text-xl sm:text-2xl md:text-[28px]'
                } font-bold text-[#2E3338] underline decoration-2 underline-offset-4 tabular-nums`}
              >
                {reportDate}
              </span>
            </div>
          </div>

          {/* Main 2-Column Member Lightboard Grid */}
          <div
            className={`grid grid-cols-1 lg:grid-cols-2 ${
              compactMode ? 'gap-6' : 'gap-8 lg:gap-14'
            } items-start`}
          >
            {/* Left Column */}
            <div className="w-full">
              {team.leftColumnGroups.map((g) => renderGroup(g))}
              {isRosterEditMode && onAddManagerGroup && (
                <button
                  type="button"
                  onClick={() => onAddManagerGroup('left', team)}
                  className="w-full mt-3 py-2.5 px-4 text-xs font-bold text-white bg-[#E87722] hover:bg-[#d16819] rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ 於左欄新增【橙色底經理】組別</span>
                </button>
              )}
            </div>

            {/* Right Column */}
            <div className="w-full">
              {team.rightColumnGroups.map((g) => renderGroup(g))}
              {isRosterEditMode && onAddManagerGroup && (
                <button
                  type="button"
                  onClick={() => onAddManagerGroup('right', team)}
                  className="w-full mt-3 py-2.5 px-4 text-xs font-bold text-white bg-[#E87722] hover:bg-[#d16819] rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ 於右欄新增【橙色底經理】組別</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Summary Section & PLD Logo */}
        <div
          className={`mt-8 pt-4 flex flex-col items-end justify-end ${
            isDense && !compactMode && !isRosterEditMode ? 'lg:-mt-6' : ''
          }`}
        >
          <div
            onClick={() => onEditTeamDenominators && onEditTeamDenominators(team)}
            title={
              onEditTeamDenominators
                ? '點擊調整團隊分母人數 (Active Member / Team Headcount)'
                : undefined
            }
            className={`text-right space-y-1 ${
              onEditTeamDenominators
                ? 'cursor-pointer hover:opacity-90 transition-opacity'
                : ''
            }`}
          >
            {/* Formula Line 1: X Active / Y Active Member = Z% */}
            <div
              className={`${
                compactMode
                  ? 'text-lg sm:text-xl'
                  : isDense
                  ? 'text-xl sm:text-2xl md:text-[28px]'
                  : 'text-2xl sm:text-4xl md:text-[42px]'
              } font-semibold leading-tight tracking-tight text-[#D69600] [text-shadow:0_1px_1px_rgba(0,0,0,0.12)] tabular-nums`}
            >
              <span>
                {metrics.activeCount} Active / {metrics.activeMemberDenominator}{' '}
                Active Member ={' '}
              </span>
              <span className={`font-bold ${activeMemberPctColor}`}>
                {metrics.activeMemberPct}%
              </span>
            </div>

            {/* Formula Line 2: A Active / B Team Headcount = C% */}
            <div
              className={`${
                compactMode
                  ? 'text-lg sm:text-xl'
                  : isDense
                  ? 'text-xl sm:text-2xl md:text-[28px]'
                  : 'text-2xl sm:text-4xl md:text-[42px]'
              } font-semibold leading-tight tracking-tight text-[#D69600] [text-shadow:0_1px_1px_rgba(0,0,0,0.12)] tabular-nums`}
            >
              <span>
                {metrics.totalHeadcountActive} Active /{' '}
                {metrics.teamHeadcountDenominator} Team Headcount ={' '}
              </span>
              <span className={`font-bold ${headcountPctColor}`}>
                {metrics.headcountPct}%
              </span>
            </div>
          </div>

          {/* Bottom-Right Caption & PLD Geometric Wordmark */}
          <div className="mt-3 flex items-end gap-3 self-end">
            <div className="text-right text-[11px] sm:text-xs font-semibold text-[#2E3338] leading-snug">
              <div>以公司Submissions Report計算Submission Active</div>
            </div>

            {/* PLD Geometric Logo SVG */}
            <svg
              width={compactMode ? 52 : 76}
              height={compactMode ? 32 : 46}
              viewBox="0 0 110 66"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0"
              aria-label="PLD Logo"
            >
              {/* 'p' */}
              <circle
                cx="22"
                cy="32"
                r="14"
                stroke="#E87722"
                strokeWidth="5.5"
              />
              <line
                x1="8"
                y1="30"
                x2="8"
                y2="62"
                stroke="#E87722"
                strokeWidth="5.5"
                strokeLinecap="round"
              />
              {/* 'l' */}
              <line
                x1="50"
                y1="8"
                x2="50"
                y2="48"
                stroke="#E87722"
                strokeWidth="5.5"
                strokeLinecap="round"
              />
              {/* 'd' */}
              <circle
                cx="78"
                cy="32"
                r="14"
                stroke="#E87722"
                strokeWidth="5.5"
              />
              <line
                x1="92"
                y1="8"
                x2="92"
                y2="48"
                stroke="#E87722"
                strokeWidth="5.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
