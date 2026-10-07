export interface MemberRecord {
  id: string;
  agentCode?: string;
  fullName: string;
  nickname: string;
  isLeaderRow: boolean; // Orange background header row in the block (經理)
  isActive: boolean;    // Green text when active ("亮燈"), dark navy when inactive
  fycc: number;         // Synced FYCC / FYC from Requested Month (in total)
  fyp?: number;         // Synced AFYP / FYP from Requested Month (in total)
  cases?: number;       // Synced Case / 件數 from Requested Month (in total)
  uplineManagerName?: string;
  productionStartDateLis?: string;
  district?: string;
  q4PaymentDate?: string;
  dateRange?: string;   // Synced Date Range
  lastUpdated?: string;
}

export interface HeadcountMemberRecord {
  agentCode?: string;
  agentNameEN: string;
  agentNameCN?: string;
  nameHkid?: string;
  nickname?: string;
  managerEN: string;
  managerCode?: string;
  managerCN?: string;
  fycc: number;
  fyp?: number;
  cases?: number;
  team?: string;
  district?: string;
  productionStartDateLis?: string;
  isActive: boolean;        // Requested Month (in total) FYCC > 0
  isOnActiveBoard: boolean; // Whether this person is also on the Active Member board
  isTeamManager: boolean;   // Whether this person is one of the team's Orange-row Managers
  hierarchyTier?: number;   // 0 = 最高級主管 (Top Leader), 1 = 直屬下線 (Direct Downline), >=2 = 多層級下線 (Indirect Sub-tier)
  hierarchyRoleLabel?: string;
}

/**
 * Row parsed from the Headcount file upload (.xlsx / .xls / .csv)
 * Columns supported: Name (HKID), Upline Manager Name, Upline Manager Code, ARA Name, Team, Production Start Date (LIS), Agent Code
 */
export interface HeadcountRosterEntry {
  id: string;
  agentCode: string;
  araName: string;               // Agent Full Name / Name (HKID) (e.g. "LAM HIU YING")
  nameHkid?: string;             // Original Name (HKID) cell (e.g. "Lam Hiu Ying 林海英")
  chineseName?: string;          // Chinese Name if present (e.g. "林海英")
  recruiterAraName?: string;     // Recruiter ARA Name (from ARA Name column)
  nickname?: string;             // English Nickname (from English Name / Nickname column)
  uplineManagerName: string;     // Upline Manager Name (e.g. "LAM HIU YING")
  uplineManagerCode?: string;    // Upline Manager Code (e.g. "603864")
  team: string;                  // Headcount Column B Team (e.g. "PAGGIE LAW", "JERRY LO", "LAW SUK MING", "JACKY YEUNG", "TSE MAN PO ANDY")
  subTeam?: string;              // Lightboard sub-team if applicable (e.g. "Sparks", "Sigma", "Braver")
  district: string;              // Same as canonical Team for filtering
  productionStartDateLis: string; // Production Start Date (LIS)
  rank?: string;
  fyc: number;                   // FYC / FYCC
  fyp: number;                   // FYP / AFYP
  cases: number;                 // 件數 (Case count)
  isActive: boolean;             // FYC > 0
  hierarchyTier?: number;        // 0 = Top Leader, 1 = Direct Downline, >=2 = Indirect Sub-tier Downline
}

export interface HeadcountSyncLog {
  id: string;
  timestamp: string;
  fileName: string;
  totalRows: number;
  teamsCount: number;
  managersCount: number;
  recruitsCount: number;
  districts: string[];
}

export interface MemberGroup {
  id: string;
  members: MemberRecord[];
}

export interface TeamBoard {
  id: string;
  name: string;
  title: string; // e.g., "Active Member – PL Direct"
  district?: string; // e.g., "PAGGIE LAW" or "JERRY LO"
  leftColumnGroups: MemberGroup[];
  rightColumnGroups: MemberGroup[];
  activeMemberDenominator: number;  // e.g., 6 in "1 Active / 6 Active Member = 17%"
  teamHeadcountDenominator: number; // e.g., 11 in "2 Active / 11 Team Headcount = 18%"
  extraTeamActiveCount: number;     // Unlisted headcount members who have FYCC > 0
  headcountMembers?: HeadcountMemberRecord[]; // Full list of headcount members calculated via ManagerEN / Agent NameEN
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  fileName: string;
  reportDateRange: string;
  targetMonth: string;
  isCurrentMonthMatch: boolean;
  matchedCount: number;
  activatedNames: string[];
  mode: 'replace' | 'additive';
  details: Array<{
    memberName: string;
    teamName: string;
    dateRange: string;
    fycc: number;
    fyp?: number;
    cases?: number;
    turnedGreen: boolean;
  }>;
}

export interface AppState {
  version?: number;
  reportDateDisplay: string; // e.g. "30 Sep 2026"
  targetMonthFilter: string; // e.g. "2026-09" or "AUTO"
  teams: TeamBoard[];
  headcountRoster?: HeadcountRosterEntry[];
  lastHeadcountSync?: HeadcountSyncLog;
  lastSync?: SyncLogEntry;
  syncHistory: SyncLogEntry[];
}

export const DEFAULT_SELECTED_TEAMS = ['PAGGIE LAW', 'JERRY LO'];
export const DEFAULT_SELECTED_DISTRICTS = DEFAULT_SELECTED_TEAMS;

export const KNOWN_HEADCOUNT_TEAMS = [
  'PAGGIE LAW',
  'JERRY LO',
  'LAW SUK MING',
  'JACKY YEUNG',
  'TSE MAN PO ANDY',
  'LAU KA HIN ANTHONY',
  'KENNY KWONG',
  'CLOVIS CHANG',
  'CECI CHAN',
  'WINNIE WONG',
  'LINCOLN TZAN',
];

export function canonicalizeHeadcountTeam(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'PAGGIE LAW';
  const upper = trimmed.toUpperCase().replace(/\s+/g, ' ');
  if (
    upper === 'PAGGIE LAW' ||
    upper === 'LAW SUK KING' ||
    upper === 'LAW SUK KING PAGGIE' ||
    upper === 'PL DIRECT' ||
    upper === 'SPARKS' ||
    upper === 'SIGMA' ||
    upper === 'CLARENCE' ||
    upper === 'TL TEAM' ||
    upper === 'LOIS TEAM' ||
    upper === 'UNIQUE' ||
    upper === 'SUPERB' ||
    upper === 'PINNACLE' ||
    upper === 'SUPREME' ||
    upper === 'GJALLARHORN'
  ) {
    return 'PAGGIE LAW';
  }
  if (
    upper === 'JERRY LO' ||
    upper === 'LO CHAK WAI' ||
    upper === 'LO CHAK WAI JERRY' ||
    upper === 'BRAVER'
  ) {
    return 'JERRY LO';
  }
  if (
    upper === 'ANDY TSE' ||
    upper === 'TSE MAN PO' ||
    upper === 'TSE MAN PO ANDY' ||
    upper === 'ASGARDIAN'
  ) {
    return 'TSE MAN PO ANDY';
  }
  if (
    upper === 'GARY TAM' ||
    upper === 'TAM PAN' ||
    upper === 'TAM PAN GARY' ||
    upper === 'INCREDIBLE'
  ) {
    return 'PAGGIE LAW';
  }
  return upper;
}

export const STATE_VERSION = 7;

export const INITIAL_TEAMS_DATA: TeamBoard[] = [
  {
    id: 'pl-direct',
    name: 'PL Direct',
    title: 'Active Member – PL Direct',
    district: 'Paggie Law',
    activeMemberDenominator: 8,
    teamHeadcountDenominator: 0,
    extraTeamActiveCount: 0,
    leftColumnGroups: [
      {
        id: 'pld-l1',
        members: [
          { id: 'pld-1', agentCode: '603207', fullName: 'LAW SUK KING', nickname: 'PAGGIE', isLeaderRow: true, isActive: false, fycc: 0 },
          { id: 'pld-2', agentCode: '606745', fullName: 'TANG SAU WAI', nickname: 'ANGELA', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: 'payme' },
          { id: 'pld-3', agentCode: '607070', fullName: 'YUEN WING CHI', nickname: 'REBECCA', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '25/9/2026' },
        ],
      },
    ],
    rightColumnGroups: [
      {
        id: 'pld-r1',
        members: [
          { id: 'pld-4', agentCode: '608806', fullName: 'KWOK TSAN HONG', nickname: 'HUGO', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'pld-5', agentCode: '609271', fullName: 'FU KAR LAI', nickname: 'JASON', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
      {
        id: 'pld-r2',
        members: [
          { id: 'pld-6', agentCode: '608428', fullName: 'CHONG CHUN TAK', nickname: 'JOHNNY', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'pld-7', agentCode: '609003', fullName: 'WONG JANIS', nickname: '', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'pld-8', agentCode: '609206', fullName: 'LAM CHI KONG', nickname: 'ALEX', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
    ],
  },
  {
    id: 'sparks',
    name: 'Sparks',
    title: 'Active Member – Sparks',
    district: 'Paggie Law',
    activeMemberDenominator: 5,
    teamHeadcountDenominator: 0,
    extraTeamActiveCount: 0,
    leftColumnGroups: [
      {
        id: 'sparks-l1',
        members: [
          { id: 'sparks-1', agentCode: '603864', fullName: 'LAM HIU YING', nickname: 'RONNIE', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'sparks-3', agentCode: '607888', fullName: 'LEE KA HEI', nickname: 'MARCO', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'sparks-4', agentCode: '609475', fullName: 'LAI KIT MAN', nickname: 'KATHY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
    ],
    rightColumnGroups: [
      {
        id: 'sparks-r1',
        members: [
          { id: 'sparks-5', agentCode: '606231', fullName: 'CHOI KAI WAI', nickname: 'LINDA', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
          { id: 'sparks-6', agentCode: '606840', fullName: 'LAM HO YIN', nickname: 'FOLEY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
        ],
      },
    ],
  },
  {
    id: 'sigma',
    name: 'Sigma',
    title: 'Active Member – Sigma',
    district: 'Paggie Law',
    activeMemberDenominator: 8,
    teamHeadcountDenominator: 0,
    extraTeamActiveCount: 0,
    leftColumnGroups: [
      {
        id: 'sigma-l1',
        members: [
          { id: 'sigma-1', agentCode: '603646', fullName: 'YEUNG WAI SIN', nickname: 'TEANNIE', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
          { id: 'sigma-2', agentCode: '606453', fullName: 'LEE KIN TING', nickname: 'MARTIN', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
          { id: 'sigma-3', agentCode: '606110', fullName: 'LEE WING YAN', nickname: 'VIVIAN', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
          { id: 'sigma-4', agentCode: '603961', fullName: 'YU YUEN MAY', nickname: 'FIONA', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
          { id: 'sigma-5', agentCode: '609461', fullName: 'HO CHOI LAM', nickname: 'GLORIA', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
          { id: 'sigma-6', agentCode: '609458', fullName: 'FANG JING', nickname: 'JANE', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
        ],
      },
    ],
    rightColumnGroups: [
      {
        id: 'sigma-r1',
        members: [
          { id: 'sigma-8', agentCode: '606367', fullName: 'MA SIU YIN', nickname: 'MURPHY', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'sigma-9', agentCode: '606870', fullName: 'WONG PUI SHAN', nickname: 'SHAN', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
    ],
  },
  {
    id: 'clarence',
    name: 'Clarence',
    title: 'Active Member – Clarence',
    district: 'Paggie Law',
    activeMemberDenominator: 8,
    teamHeadcountDenominator: 0,
    extraTeamActiveCount: 0,
    leftColumnGroups: [
      {
        id: 'clarence-l1',
        members: [
          { id: 'clarence-1', agentCode: '608216', fullName: 'LAI WAI HO', nickname: 'CLARENCE', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'clarence-2', agentCode: '608316', fullName: 'XU SHENGJIA', nickname: 'ERIC', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'clarence-3', agentCode: '608194', fullName: 'LAM CHI HUNG', nickname: 'DENNIS', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'clarence-4', agentCode: '608189', fullName: 'FUNG MAN HO', nickname: 'ROBERT', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'clarence-8', agentCode: '608953', fullName: 'LIANG NING', nickname: 'PACO', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
        ],
      },
    ],
    rightColumnGroups: [
      {
        id: 'clarence-r1',
        members: [
          { id: 'clarence-5', agentCode: '608552', fullName: 'MA YIKUN', nickname: 'STEVEN', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'clarence-6', agentCode: '608898', fullName: 'ZHANG XINWEI', nickname: 'MAGGIE', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
        ],
      },
      {
        id: 'clarence-r2',
        members: [
          { id: 'clarence-7', agentCode: '609001', fullName: 'WANG HUI', nickname: 'AURELIA', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
        ],
      },
    ],
  },
  {
    id: 'tl-team',
    name: 'TL Team',
    title: 'Active Member – TL Team',
    district: 'Paggie Law',
    activeMemberDenominator: 6,
    teamHeadcountDenominator: 0,
    extraTeamActiveCount: 0,
    leftColumnGroups: [
      {
        id: 'tl-l1',
        members: [
          { id: 'tl-1', agentCode: '603446', fullName: 'LAM WAN LOK', nickname: 'TIMOTHY', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'tl-2', agentCode: '603569', fullName: 'WONG MAN KUEN', nickname: 'KOJI', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'tl-3', agentCode: '609067', fullName: 'CHUNG CHIN PANG', nickname: 'DICK', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'tl-4', agentCode: '608918', fullName: 'ZENG HIU NGAI', nickname: 'NERO', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
    ],
    rightColumnGroups: [
      {
        id: 'tl-r1',
        members: [
          { id: 'tl-5', agentCode: '608190', fullName: 'CAI XINJIA', nickname: 'CATHERINE', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'tl-6', agentCode: '608671', fullName: 'JIANG YIWEN', nickname: 'MICHELLE', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
    ],
  },
  {
    id: 'lois-team',
    name: 'Lois Team',
    title: 'Active Member – Lois Team',
    district: 'Paggie Law',
    activeMemberDenominator: 3,
    teamHeadcountDenominator: 0,
    extraTeamActiveCount: 0,
    leftColumnGroups: [
      {
        id: 'lois-l1',
        members: [
          { id: 'lois-1', agentCode: '608348', fullName: 'LIU YAN TING', nickname: 'LOIS', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'lois-3', agentCode: '608351', fullName: 'YAU TSZ HO', nickname: 'STANLEY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
    ],
    rightColumnGroups: [
      {
        id: 'lois-r1',
        members: [
          { id: 'lois-4', agentCode: '608349', fullName: 'CHENG WAI YEE', nickname: 'DAISY', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '25/9/2026' },
        ],
      },
    ],
  },
  {
    id: 'unique',
    name: 'Unique',
    title: 'Active Member – Unique',
    district: 'Paggie Law',
    activeMemberDenominator: 8,
    teamHeadcountDenominator: 0,
    extraTeamActiveCount: 0,
    leftColumnGroups: [
      {
        id: 'unique-l1',
        members: [
          { id: 'unique-1', agentCode: '603489', fullName: 'LAU SAU YEE', nickname: 'YOKEI', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'unique-2', agentCode: '606618', fullName: 'NG CHUN TING', nickname: 'JUSTIN', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'unique-3', agentCode: '606473', fullName: 'CHIU CHI HANG', nickname: 'TOMMY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'unique-4', agentCode: '607385', fullName: 'WONG PIK KWAN', nickname: 'QUEENIE', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
    ],
    rightColumnGroups: [
      {
        id: 'unique-r1',
        members: [
          { id: 'unique-5', agentCode: '607494', fullName: 'CHAU WING HUNG', nickname: 'WINNIE', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'unique-6', agentCode: '608130', fullName: 'SIU HOI NAP', nickname: 'VINCENT', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'unique-7', agentCode: '609060', fullName: 'KONG CHING MAN', nickname: 'ASTOR', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'unique-8', agentCode: '609469', fullName: 'YAU SHUK LING', nickname: 'BETTY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '25/9/2026' },
        ],
      },
    ],
  },
  {
    id: 'braver',
    name: 'Braver',
    title: 'Active Member – Braver',
    district: 'LO CHAK WAI',
    activeMemberDenominator: 21,
    teamHeadcountDenominator: 0,
    extraTeamActiveCount: 0,
    leftColumnGroups: [
      {
        id: 'braver-l1',
        members: [
          { id: 'braver-1', agentCode: '603837', fullName: 'LO CHAK WAI', nickname: 'JERRY', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
      {
        id: 'braver-l2',
        members: [
          { id: 'braver-2', agentCode: '606606', fullName: 'LOH SOO PENG', nickname: 'JAYCE', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-3', agentCode: '608166', fullName: 'PAK CHUN MING', nickname: 'JASON', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-22', agentCode: '609605', fullName: 'CHEUNG KA HO', nickname: 'KEITH', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
      {
        id: 'braver-l3',
        members: [
          { id: 'braver-4', agentCode: '607657', fullName: 'NG KA LEUNG', nickname: 'ALEX', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-5', agentCode: '607827', fullName: 'LUN HO MAN', nickname: 'VINCENT', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-6', agentCode: '608007', fullName: 'NG YING SEE', nickname: 'ARIEL', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-7', agentCode: '608911', fullName: 'LEUNG KA YAN', nickname: 'KAREN', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-8', agentCode: '609110', fullName: 'LAM TIN YING', nickname: 'TERESA', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-9', agentCode: '608315', fullName: 'LAI NGAI TAK', nickname: 'VERONICA', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-10', agentCode: '609153', fullName: 'LAU NGAI MING', nickname: 'GARY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-11', agentCode: '609369', fullName: 'LEUNG CHIU YI', nickname: 'RITA', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-12', agentCode: '609434', fullName: 'YIU CHUNG MAN', nickname: 'LEO', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
    ],
    rightColumnGroups: [
      {
        id: 'braver-r1',
        members: [
          { id: 'braver-13', agentCode: '607777', fullName: 'CHAN CHI CHUEN', nickname: 'LARRY', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-14', agentCode: '609208', fullName: 'CHAN OI BING', nickname: 'EMILY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-15', agentCode: '609006', fullName: 'CHOW WHEY KOK', nickname: 'WILLIAM', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-16', agentCode: '609181', fullName: 'CHIU SIN FU', nickname: 'ARIES', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
        ],
      },
      {
        id: 'braver-r2',
        members: [
          { id: 'braver-18', agentCode: '608932', fullName: 'TSE WAI KONG', nickname: 'WILSON', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '29/9/2026' },
          { id: 'braver-19', agentCode: '609199', fullName: 'POON YAN WO', nickname: 'WALLACE', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'braver-21', agentCode: '609292', fullName: 'LAU SHAN YING', nickname: 'KENNIX', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'braver-23', agentCode: '609466', fullName: 'WU LOK YI', nickname: 'JOYCE', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
        ],
      },
    ],
  },
  {
    id: 'incredible',
    name: 'Incredible',
    title: 'Active Member – Incredible',
    district: 'HSUI MAN LAI',
    activeMemberDenominator: 10,
    teamHeadcountDenominator: 0,
    extraTeamActiveCount: 0,
    leftColumnGroups: [
      {
        id: 'inc-l1',
        members: [
          { id: 'inc-1', agentCode: '603277', fullName: 'HSUI MAN LAI', nickname: 'WINNIE', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'inc-2', agentCode: '607688', fullName: 'CHEUNG CHI HANG', nickname: 'RONALD', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
        ],
      },
      {
        id: 'inc-l2',
        members: [
          { id: 'inc-3', agentCode: '608864', fullName: 'TSUI JENNIFER', nickname: '', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
        ],
      },
      {
        id: 'inc-l3',
        members: [
          { id: 'inc-4', agentCode: '603279', fullName: 'TAM PAN', nickname: 'GARY', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
        ],
      },
      {
        id: 'inc-l4',
        members: [
          { id: 'inc-5', agentCode: '607457', fullName: 'WONG TSZ YAN', nickname: 'YANNES', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
        ],
      },
    ],
    rightColumnGroups: [
      {
        id: 'inc-r1',
        members: [
          { id: 'inc-6', agentCode: '608224', fullName: 'YAN TAT MAN', nickname: 'AMEN', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
          { id: 'inc-7', agentCode: '608213', fullName: 'LO MING WAI', nickname: 'MING WAI', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
        ],
      },
      {
        id: 'inc-r2',
        members: [
          { id: 'inc-8', agentCode: '607455', fullName: 'CHU WING WA', nickname: 'VINCENT', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
          { id: 'inc-9', agentCode: '609091', fullName: 'SO SIN CHING', nickname: 'SUZY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
        ],
      },
      {
        id: 'inc-r3',
        members: [
          { id: 'inc-10', agentCode: '607912', fullName: 'SIN CHERRY', nickname: 'CHERRY', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '24/9/2026' },
        ],
      },
    ],
  },
  {
    id: 'asgardian',
    name: 'Asgardian',
    title: 'Active Member – Asgardian',
    district: 'TSE MAN PO',
    activeMemberDenominator: 22,
    teamHeadcountDenominator: 0,
    extraTeamActiveCount: 0,
    leftColumnGroups: [
      {
        id: 'asg-l1',
        members: [
          { id: 'asg-1', agentCode: '603318', fullName: 'TSE MAN PO', nickname: 'ANDY', isLeaderRow: true, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-2', agentCode: '603310', fullName: 'CHOW YUEN LAM', nickname: 'SHARON', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-3', agentCode: '603307', fullName: 'CHU CHUN', nickname: 'MATTHEW', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-4', agentCode: '606070', fullName: 'CHIU PANG TAT', nickname: 'ANDREW', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-5', agentCode: '603309', fullName: 'CHAN CHUN YIN', nickname: 'BILLY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-6', agentCode: '603298', fullName: 'MOK PAK YUEN', nickname: 'RYAN', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-7', agentCode: '603306', fullName: 'YUN SHING HUNG', nickname: 'INSON', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-8', agentCode: '603313', fullName: 'CHAN CHUNG FAI', nickname: 'JADE', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-9', agentCode: '603394', fullName: 'IU KAR CHEUK', nickname: 'LEO', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-10', agentCode: '606574', fullName: 'NGAI CHUN SHING', nickname: 'EDISON', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-11', agentCode: '603818', fullName: 'LI CHUN', nickname: 'SANFORD', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
        ],
      },
    ],
    rightColumnGroups: [
      {
        id: 'asg-r1',
        members: [
          { id: 'asg-12', agentCode: '606356', fullName: 'TONG CHI YAN', nickname: 'JASON', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-13', agentCode: '607919', fullName: 'NGAN WAI LING', nickname: 'CINDY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-14', agentCode: '603410', fullName: 'LEUNG KWAN CHUN', nickname: 'ALVIN', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-15', agentCode: '607230', fullName: 'WONG TSZ CHIU', nickname: 'CHRIS', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-16', agentCode: '606496', fullName: 'CHOI KA HONG', nickname: 'ADRIAN', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-17', agentCode: '609450', fullName: 'FAN PAK KIN', nickname: 'MARTIN', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-18', agentCode: '609460', fullName: 'HU TING', nickname: 'TINA', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-19', agentCode: '609454', fullName: 'LIU HOI MING', nickname: 'JENNIFER', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-20', agentCode: '609567', fullName: 'NG TSOI PAN', nickname: 'ABBY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-21', agentCode: '609529', fullName: 'SAO HO CHUN', nickname: 'HENRY', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
          { id: 'asg-22', agentCode: '609551', fullName: 'TANG SHUK KWUN', nickname: 'SUSAN', isLeaderRow: false, isActive: false, fycc: 0, q4PaymentDate: '30/9/2026' },
        ],
      },
    ],
  },
];

/**
 * Generates an initial Headcount roster from the teams structure so the PP Raw & Headcount Dashboard
 * has full hierarchy data (Upline Manager Name, ARA Name, Team, District, Production Start Date (LIS))
 * ready before or after uploading a custom Headcount Excel/CSV file.
 */
export function buildInitialHeadcountRoster(teams: TeamBoard[]): HeadcountRosterEntry[] {
  const entries: HeadcountRosterEntry[] = [];
  for (const team of teams) {
    const canonicalTeam = canonicalizeHeadcountTeam(
      team.district ||
        (team.id === 'braver'
          ? 'JERRY LO'
          : team.id === 'asgardian'
          ? 'TSE MAN PO ANDY'
          : 'PAGGIE LAW')
    );

    // Find top leader of the team as fallback upline for other group leaders
    const allGroups = [...team.leftColumnGroups, ...team.rightColumnGroups];
    const primaryLeader =
      allGroups[0]?.members.find((m) => m.isLeaderRow) || allGroups[0]?.members[0];
    const primaryLeaderName = primaryLeader ? primaryLeader.fullName : canonicalTeam;

    for (const group of allGroups) {
      const groupLeader = group.members.find((m) => m.isLeaderRow);
      const groupLeaderName = groupLeader ? groupLeader.fullName : primaryLeaderName;

      group.members.forEach((m, idx) => {
        // Infer realistic LIS date based on agent code range
        const codeNum = parseInt(m.agentCode || '608000', 10);
        let lisDate = '15/03/2023';
        if (codeNum >= 609400) lisDate = '12/06/2026';
        else if (codeNum >= 609000) lisDate = '01/02/2026';
        else if (codeNum >= 608000) lisDate = '18/08/2024';
        else if (codeNum >= 606000) lisDate = '10/05/2022';
        else lisDate = '01/04/2019';

        const upline = m.isLeaderRow
          ? m.fullName === primaryLeaderName
            ? canonicalTeam === 'PAGGIE LAW'
              ? 'LAW SUK KING'
              : canonicalTeam === 'JERRY LO'
              ? 'LO CHAK WAI'
              : primaryLeaderName
            : primaryLeaderName
          : groupLeaderName;

        const memberCanonicalTeam = m.district
          ? canonicalizeHeadcountTeam(m.district)
          : canonicalTeam;

        entries.push({
          id: `hc-${m.id}-${idx}`,
          agentCode: m.agentCode || '',
          araName: m.fullName,
          nickname: m.nickname || '',
          uplineManagerName: m.uplineManagerName || upline,
          team: memberCanonicalTeam,
          subTeam: team.name,
          district: memberCanonicalTeam,
          productionStartDateLis: m.productionStartDateLis || lisDate,
          rank: m.isLeaderRow ? 'Unit Manager' : 'Advisor',
          fyc: m.fycc || 0,
          fyp: m.fyp ?? (m.fycc ? m.fycc * 2.5 : 0),
          cases: m.cases ?? (m.fycc > 0 ? 1 : 0),
          isActive: (m.fycc || 0) > 0 || m.isActive,
        });
      });
    }
  }
  return entries;
}

export function getAllMembersOfTeam(team: TeamBoard): MemberRecord[] {
  const list: MemberRecord[] = [];
  for (const g of team.leftColumnGroups) {
    list.push(...g.members);
  }
  for (const g of team.rightColumnGroups) {
    list.push(...g.members);
  }
  return list;
}

/**
 * Extract clean uppercase English name from a Name (HKID) or mixed English/Chinese cell
 * e.g. "Lam Hiu Ying 林海英" -> "LAM HIU YING"
 */
export function extractEnglishName(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim().toUpperCase();
  if (/^AGENT\s+\d+$/.test(trimmed) || trimmed === 'AGENT') {
    return '';
  }
  return raw
    .replace(/\([^)]*\d[^)]*\)/g, ' ')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract Chinese characters from a Name (HKID) cell if present
 * e.g. "Lam Hiu Ying 林海英" -> "林海英"
 */
export function extractChineseName(raw?: string): string {
  if (!raw) return '';
  const matches = raw.match(/[\u4e00-\u9fff]+/g);
  return matches ? matches.join('') : '';
}

/**
 * Match two person names from Headcount.excel (Name (HKID) vs Upline Manager Name)
 */
export function personNamesMatch(nameA?: string, nameB?: string): boolean {
  const normA = extractEnglishName(nameA);
  const normB = extractEnglishName(nameB);
  if (!normA || !normB || normA === 'AGENT' || normB === 'AGENT') return false;
  if (normA === normB) return true;

  const tokensA = normA.split(' ').filter(Boolean);
  const tokensB = normB.split(' ').filter(Boolean);
  if (tokensA.length >= 2 && tokensB.length >= 2) {
    const [shorter, longer] =
      tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
    if (shorter.join(' ').length >= 5 && shorter.every((t) => longer.includes(t))) {
      return true;
    }
  }
  return false;
}

/**
 * Known Agent Code -> Full Name (HKID) dictionary to enrich records when only code or nickname was present
 */
export const KNOWN_AGENT_FULL_NAMES_BY_CODE: Record<
  string,
  { fullName: string; chineseName?: string; nickname?: string }
> = {
  '603207': { fullName: 'LAW SUK KING', chineseName: '羅淑瓊', nickname: 'PAGGIE' },
  '603241': { fullName: 'LAW SUK MING', nickname: 'SUK MING' },
  '603277': { fullName: 'HSUI MAN LAI WINNIE', nickname: 'WINNIE' },
  '603279': { fullName: 'TAM PAN', nickname: 'GARY' },
  '603298': { fullName: 'MOK PAK YUEN', nickname: 'RYAN' },
  '603305': { fullName: 'YEUNG WAI HUNG', nickname: 'JACKY' },
  '603306': { fullName: 'YUN SHING HUNG', nickname: 'INSON' },
  '603307': { fullName: 'CHU CHUN', nickname: 'MATTHEW' },
  '603309': { fullName: 'CHAN CHUN YIN', nickname: 'BILLY' },
  '603310': { fullName: 'CHOW YUEN LAM SHARON', nickname: 'SHARON' },
  '603313': { fullName: 'CHAN CHUNG FAI', nickname: 'JADE' },
  '603318': { fullName: 'TSE MAN PO ANDY', nickname: 'ANDY' },
  '603356': { fullName: 'CHANG KWOK HO', nickname: 'CLOVIS' },
  '603394': { fullName: 'IU KAR CHEUK', nickname: 'LEO' },
  '603402': { fullName: 'CHAN WING SEE', nickname: 'CECI' },
  '603410': { fullName: 'LEUNG KWAN CHUN', nickname: 'ALVIN' },
  '603446': { fullName: 'LAM WAN LOK', nickname: 'TIMOTHY' },
  '603489': { fullName: 'LAU SAU YEE YOKEI', nickname: 'YOKEI' },
  '603569': { fullName: 'WONG MAN KUEN', nickname: 'KOJI' },
  '603607': { fullName: 'LAU KA HIN ANTHONY', nickname: 'ANTHONY' },
  '603646': { fullName: 'YEUNG WAI SIN TEANNIE', nickname: 'TEANNIE' },
  '603818': { fullName: 'LI CHUN', nickname: 'SANFORD' },
  '603837': { fullName: 'LO CHAK WAI', nickname: 'JERRY' },
  '603864': { fullName: 'LAM HIU YING', chineseName: '林海英', nickname: 'RONNIE' },
  '603893': { fullName: 'LAU CHUNG YAN CARRIE', nickname: 'CARRIE' },
  '603935': { fullName: 'WONG WAI YEE', nickname: 'WINNIE' },
  '603961': { fullName: 'YU YUEN MAY', nickname: 'FIONA' },
  '606024': { fullName: 'LIU WING YAN' },
  '606025': { fullName: 'HO CHUN YIN' },
  '606070': { fullName: 'CHIU PANG TAT', nickname: 'ANDREW' },
  '606110': { fullName: 'LEE WING YAN', nickname: 'VIVIAN' },
  '606211': { fullName: 'KWONG KA MING', nickname: 'KENNY' },
  '606231': { fullName: 'CHOI KAI WAI', nickname: 'LINDA' },
  '606356': { fullName: 'TONG CHI YAN', nickname: 'JASON' },
  '606367': { fullName: 'MA SIU YIN MURPHY', nickname: 'MURPHY' },
  '606453': { fullName: 'LEE KIN TING', nickname: 'MARTIN' },
  '606473': { fullName: 'CHIU CHI HANG', nickname: 'TOMMY' },
  '606496': { fullName: 'CHOI KA HONG', nickname: 'ADRIAN' },
  '606574': { fullName: 'NGAI CHUN SHING', nickname: 'EDISON' },
  '606606': { fullName: 'LOH SOO PENG', nickname: 'JAYCE' },
  '606618': { fullName: 'NG CHUN TING', nickname: 'JUSTIN' },
  '606745': { fullName: 'TANG SAU WAI ANGELA', nickname: 'ANGELA' },
  '606840': { fullName: 'LAM HO YIN', nickname: 'FOLEY' },
  '606870': { fullName: 'WONG PUI SHAN', nickname: 'SHAN' },
  '606952': { fullName: 'LI WAN YING', nickname: 'JACKIE' },
  '607070': { fullName: 'YUEN WING CHI REBECCA', nickname: 'REBECCA' },
  '607173': { fullName: 'TANG YU YIN', nickname: 'JOJO' },
  '607230': { fullName: 'WONG TSZ CHIU', nickname: 'CHRIS' },
  '607385': { fullName: 'WONG PIK KWAN', nickname: 'QUEENIE' },
  '607386': { fullName: 'LEUNG KA WING' },
  '607455': { fullName: 'CHU WING WA', nickname: 'VINCENT' },
  '607457': { fullName: 'WONG TSZ YAN', nickname: 'YANNES' },
  '607492': { fullName: 'LAM NGA MAN' },
  '607493': { fullName: 'LAM CHEUK WAI', nickname: 'DEREK' },
  '607494': { fullName: 'CHAU WING HUNG', nickname: 'WINNIE' },
  '607603': { fullName: 'CHENG WAI TING' },
  '607604': { fullName: 'LO WING YIN' },
  '607657': { fullName: 'NG KA LEUNG', nickname: 'ALEX' },
  '607688': { fullName: 'CHEUNG CHI HANG RONALD', nickname: 'RONALD' },
  '607777': { fullName: 'CHAN CHI CHUEN', nickname: 'LARRY' },
  '607789': { fullName: 'CHEUNG KWOK YUNG', nickname: 'RICKY' },
  '607827': { fullName: 'LUN HO MAN', nickname: 'VINCENT' },
  '607888': { fullName: 'LEE KA HEI', nickname: 'MARCO' },
  '607912': { fullName: 'SIN CHERRY', nickname: 'CHERRY' },
  '607919': { fullName: 'NGAN WAI LING', nickname: 'CINDY' },
  '607931': { fullName: 'HO WA KIT' },
  '607941': { fullName: 'KWOK KONG CHOI' },
  '608007': { fullName: 'NG YING SEE', nickname: 'ARIEL' },
  '608008': { fullName: 'LO KA YAN' },
  '608130': { fullName: 'SIU HOI NAP', nickname: 'VINCENT' },
  '608135': { fullName: 'LAW WING YAN' },
  '608166': { fullName: 'PAK CHUN MING', nickname: 'JASON' },
  '608189': { fullName: 'FUNG MAN HO', nickname: 'ROBERT' },
  '608190': { fullName: 'CAI XINJIA', nickname: 'CATHERINE' },
  '608194': { fullName: 'LAM CHI HUNG', nickname: 'DENNIS' },
  '608213': { fullName: 'LO MING WAI', nickname: 'MING WAI' },
  '608216': { fullName: 'LAI WAI HO', nickname: 'CLARENCE' },
  '608224': { fullName: 'YAN TAT MAN AMEN', nickname: 'AMEN' },
  '608301': { fullName: 'TSOI WING YIN' },
  '608315': { fullName: 'LAI NGAI TAK', nickname: 'VERONICA' },
  '608316': { fullName: 'XU SHENGJIA', nickname: 'ERIC' },
  '608348': { fullName: 'LIU YAN TING LOIS', nickname: 'LOIS' },
  '608349': { fullName: 'CHENG WAI YEE', nickname: 'DAISY' },
  '608351': { fullName: 'YAU TSZ HO', nickname: 'STANLEY' },
  '608412': { fullName: 'LINCOLN TZAN', nickname: 'LINCOLN' },
  '608428': { fullName: 'CHONG CHUN TAK', nickname: 'JOHNNY' },
  '608433': { fullName: 'TSOI KIT MAN', nickname: 'GLORIA' },
  '608552': { fullName: 'MA YIKUN', nickname: 'STEVEN' },
  '608570': { fullName: 'CHENG TSZ CHING', nickname: 'ANNA' },
  '608671': { fullName: 'JIANG YIWEN MICHELLE', nickname: 'MICHELLE' },
  '608690': { fullName: 'LIN LINA' },
  '608792': { fullName: 'LIU JIAHAO', nickname: 'TED' },
  '608806': { fullName: 'KWOK TSAN HONG', nickname: 'HUGO' },
  '608864': { fullName: 'TSUI JENNIFER', nickname: 'JENNIFER' },
  '608898': { fullName: 'ZHANG XINWEI', nickname: 'MAGGIE' },
  '608911': { fullName: 'LEUNG KA YAN', nickname: 'KAREN' },
  '608918': { fullName: 'ZENG HIU NGAI', nickname: 'NERO' },
  '608932': { fullName: 'TSE WAI KONG WILSON', nickname: 'WILSON' },
  '608953': { fullName: 'LIANG NING', nickname: 'PACO' },
  '608964': { fullName: 'LIN YANXIA' },
  '609001': { fullName: 'WANG HUI', nickname: 'AURELIA' },
  '609003': { fullName: 'WONG JANIS', nickname: 'JANIS' },
  '609006': { fullName: 'CHOW WHEY KOK WILLIAM', nickname: 'WILLIAM' },
  '609038': { fullName: 'CHEUK LAM YAN' },
  '609042': { fullName: 'SZE HO PUI' },
  '609044': { fullName: 'LAW MAN SZE' },
  '609053': { fullName: 'FAN SHAOYING', nickname: 'FRANDY' },
  '609054': { fullName: 'CHAN HO HIN' },
  '609055': { fullName: 'YANG KAIZHI' },
  '609058': { fullName: 'LAI WAI PAN', nickname: 'TONY' },
  '609060': { fullName: 'KONG CHING MAN', nickname: 'ASTOR' },
  '609066': { fullName: 'LIN SZE YAN', nickname: 'JENNIFER' },
  '609067': { fullName: 'CHUNG CHIN PANG', nickname: 'DICK' },
  '609074': { fullName: 'NG CHAN BRANDON' },
  '609091': { fullName: 'SO SIN CHING', nickname: 'SUZY' },
  '609110': { fullName: 'LAM TIN YING', nickname: 'TERESA' },
  '609153': { fullName: 'LAU NGAI MING', nickname: 'GARY' },
  '609181': { fullName: 'CHIU SIN FU ARIES', nickname: 'ARIES' },
  '609199': { fullName: 'POON YAN WO', nickname: 'WALLACE' },
  '609206': { fullName: 'LAM CHI KONG', nickname: 'ALEX' },
  '609208': { fullName: 'CHAN OI BING', nickname: 'EMILY' },
  '609261': { fullName: 'LEUNG SZE MAN', nickname: 'SARAH' },
  '609271': { fullName: 'FU KAR LAI', nickname: 'JASON' },
  '609281': { fullName: 'CHOW WING YEE', nickname: 'WINSY' },
  '609292': { fullName: 'LAU SHAN YING', nickname: 'KENNIX' },
  '609348': { fullName: 'HUI WAI YIN' },
  '609369': { fullName: 'LEUNG CHIU YI', nickname: 'RITA' },
  '609419': { fullName: 'JIANG MANQING', nickname: 'GRACE' },
  '609434': { fullName: 'YIU CHUNG MAN', nickname: 'LEO' },
  '609450': { fullName: 'FAN PAK KIN', nickname: 'MARTIN' },
  '609454': { fullName: 'LIU HOI MING', nickname: 'JENNIFER' },
  '609458': { fullName: 'FANG JING', nickname: 'JANE' },
  '609460': { fullName: 'HU TING', nickname: 'TINA' },
  '609461': { fullName: 'HO CHOI LAM', nickname: 'GLORIA' },
  '609466': { fullName: 'WU LOK YI', nickname: 'JOYCE' },
  '609469': { fullName: 'YAU SHUK LING', nickname: 'BETTY' },
  '609475': { fullName: 'LAI KIT MAN', nickname: 'KATHY' },
  '609489': { fullName: 'NG WEI', nickname: 'ADIAN' },
  '609518': { fullName: 'WONG TSZ MAN', nickname: 'CHERA' },
  '609519': { fullName: 'CHAN NGA MAN', nickname: 'CARMEN' },
  '609521': { fullName: 'TSOI KIT LING', nickname: 'HELEN' },
  '609525': { fullName: 'SUM SHUK YEE', nickname: 'ZOE' },
  '609526': { fullName: 'NG TSUN WAI', nickname: 'ERIC' },
  '609529': { fullName: 'SAO HO CHUN', nickname: 'HENRY' },
  '609536': { fullName: 'LUK HOI HONG', nickname: 'SAM' },
  '609549': { fullName: 'LO NGAN HI', nickname: 'YANCY' },
  '609551': { fullName: 'TANG SHUK KWUN', nickname: 'SUSAN' },
  '609555': { fullName: 'CHEUNG PAK NING', nickname: 'BOBBY' },
  '609564': { fullName: 'LEE TSZ KIU' },
  '609566': { fullName: 'YAN JIALANG', nickname: 'RICK' },
  '609567': { fullName: 'NG TSOI PAN', nickname: 'ABBY' },
  '609576': { fullName: 'CHENG PAK YUK', nickname: 'WILLIAM' },
  '609577': { fullName: 'LUK KA MING' },
  '609605': { fullName: 'CHEUNG KA HO', nickname: 'KEITH' },
};

/**
 * Recursive Team Headcount Allocation based on Headcount.excel:
 * 1. 最高級主管 (Top Leader): 計算 1 人 (e.g., Lam Hiu Ying 林海英)
 * 2. 直屬下線 (Direct Downlines): 自動掃描 Upline Manager Name (or Code) 為該主管的所有 Name (HKID) (e.g., Choi Kai Wai 等)
 * 3. 多層級下線 (Indirect Sub-tier Downlines): 若直屬 Agent (如 Choi Kai Wai) 本身也是其他 Agent 的 Upline Manager，
 *    系統自動遞歸展開，將其下方的所有 Agent 一併納入總團隊人數中。
 */
export function allocateTeamHeadcountsFromRoster(
  teams: TeamBoard[],
  roster: HeadcountRosterEntry[]
): void {
  if (!Array.isArray(roster) || roster.length === 0) return;

  // 1. Build lookup tables from board members & known dictionary
  const boardMemberByCode = new Map<string, MemberRecord>();
  const boardMemberByName = new Map<string, MemberRecord>();
  for (const t of teams) {
    for (const m of getAllMembersOfTeam(t)) {
      if (m.agentCode) boardMemberByCode.set(m.agentCode.trim(), m);
      boardMemberByName.set(extractEnglishName(m.fullName), m);
    }
  }

  // Enrich roster entries (restore full Name (HKID) if nickname/code was stored, and cross-link upline code <-> name)
  const entryByCode = new Map<string, HeadcountRosterEntry>();
  const entryByName = new Map<string, HeadcountRosterEntry>();

  for (const r of roster) {
    const code = (r.agentCode || '').trim();
    const known = code ? KNOWN_AGENT_FULL_NAMES_BY_CODE[code] : undefined;
    const bm = code ? boardMemberByCode.get(code) : undefined;

    // Clean up any record where recruiterAraName polluted araName/nickname or fake "AGENT 60xxxx" was generated
    const recName = ((r as any).recruiterAraName || '').trim();
    const recBm = recName ? boardMemberByName.get(extractEnglishName(recName)) : undefined;
    if (recBm && recBm.agentCode !== code && r.nickname && r.nickname === recBm.nickname) {
      r.nickname = '';
      if (r.araName === recBm.nickname) r.araName = '';
      if (r.nameHkid === recBm.nickname) r.nameHkid = '';
    }
    if (recName && r.araName === recName && (!known || known.fullName !== recName)) {
      r.araName = known?.fullName || r.nickname || '';
      r.nameHkid = r.araName;
    }
    if (/^AGENT\s+\d+$/i.test((r.araName || '').trim())) {
      r.araName = known?.fullName || bm?.fullName || r.nickname || '';
    }
    if (/^AGENT\s+\d+$/i.test((r.nameHkid || '').trim())) {
      r.nameHkid = known?.fullName || bm?.fullName || r.araName || '';
    }

    const currentAra = (r.araName || '').trim();
    const currentHkid = (r.nameHkid || '').trim();
    const hasValidMultiWordHkid =
      currentHkid &&
      !currentHkid.startsWith('AGENT ') &&
      currentHkid.includes(' ') &&
      !/[\u4e00-\u9fff]/.test(currentHkid) &&
      (!recName || currentHkid !== recName);

    if (hasValidMultiWordHkid) {
      r.araName = currentHkid;
      r.nameHkid = currentHkid;
    } else if (known?.fullName) {
      if (!r.nickname && currentAra && !currentAra.startsWith('AGENT ') && currentAra !== known.fullName) {
        r.nickname = currentAra;
      }
      r.araName = known.fullName;
      r.nameHkid = known.fullName;
    } else if (
      (!currentAra || currentAra.startsWith('AGENT ') || !currentAra.includes(' ')) &&
      bm?.fullName
    ) {
      if (!r.nickname && currentAra && !currentAra.startsWith('AGENT ')) {
        r.nickname = currentAra;
      }
      r.araName = bm.fullName;
      r.nameHkid = bm.fullName;
    }

    if (known?.chineseName && !r.chineseName) {
      r.chineseName = known.chineseName;
    }
    if ((bm?.nickname || known?.nickname) && !r.nickname) {
      r.nickname = bm?.nickname || known?.nickname || '';
    }
    if (!r.nameHkid || /[\u4e00-\u9fff]/.test(r.nameHkid) || /^AGENT\s+\d+$/i.test(r.nameHkid)) {
      r.nameHkid = r.araName && !/^AGENT\s+\d+$/i.test(r.araName) ? r.araName : r.nickname || '—';
    }

    // Sync active/FYCC status if board member is active
    if (bm && (bm.fycc > 0 || bm.isActive) && r.fyc === 0) {
      r.fyc = bm.fycc;
      r.fyp = bm.fyp || (bm.fycc > 0 ? bm.fycc * 2.5 : 0);
      r.cases = bm.cases || (bm.fycc > 0 ? 1 : 0);
      r.isActive = true;
    }

    if (code) entryByCode.set(code, r);
    const normName = extractEnglishName(r.araName);
    if (normName) entryByName.set(normName, r);
  }

  // Second pass: resolve uplineManagerCode <-> uplineManagerName on every roster entry
  for (const r of roster) {
    const rawUp = (r.uplineManagerName || '').trim();
    if (/^\d{5,7}$/.test(rawUp)) {
      r.uplineManagerCode = rawUp;
      const mgrEntry = entryByCode.get(rawUp);
      const mgrKnown = KNOWN_AGENT_FULL_NAMES_BY_CODE[rawUp];
      const mgrBm = boardMemberByCode.get(rawUp);
      if (mgrBm?.fullName) {
        r.uplineManagerName = mgrBm.fullName;
      } else if (mgrKnown?.fullName) {
        r.uplineManagerName = mgrKnown.fullName;
      } else if (mgrEntry?.araName) {
        r.uplineManagerName = mgrEntry.araName;
      }
    } else if (rawUp && !r.uplineManagerCode) {
      const normUp = extractEnglishName(rawUp);
      const mgrEntry = entryByName.get(normUp);
      const mgrBm = boardMemberByName.get(normUp);
      if (mgrEntry?.agentCode) {
        r.uplineManagerCode = mgrEntry.agentCode;
      } else if (mgrBm?.agentCode) {
        r.uplineManagerCode = mgrBm.agentCode;
      }
    }
  }

  // 2. Identify Top Leader (最高級主管) for each TeamBoard
  const teamTopLeaders = new Map<
    string,
    { code: string; name: string; member: MemberRecord }
  >();
  const allTopLeaderCodes = new Set<string>();
  const allTopLeaderNames: string[] = [];

  for (const team of teams) {
    const topMember =
      team.leftColumnGroups[0]?.members.find((m) => m.isLeaderRow) ||
      team.leftColumnGroups[0]?.members[0];
    if (!topMember) continue;
    const code = (topMember.agentCode || '').trim();
    const name = extractEnglishName(topMember.fullName);
    teamTopLeaders.set(team.id, { code, name, member: topMember });
    if (code) allTopLeaderCodes.add(code);
    if (name) allTopLeaderNames.push(name);
  }

  // Process sub-teams first, and PL Direct (District Head Law Suk King) last so sub-teams aren't swallowed
  const orderedTeams = [
    ...teams.filter((t) => t.id !== 'pl-direct'),
    ...teams.filter((t) => t.id === 'pl-direct'),
  ];

  const claimedEntryIds = new Set<string>();

  for (const team of orderedTeams) {
    const topInfo = teamTopLeaders.get(team.id);
    if (!topInfo) continue;

    const teamBoardMembers = getAllMembersOfTeam(team);
    const teamManagers = teamBoardMembers.filter((m) => m.isLeaderRow);

    // Find Top Leader row in roster
    const rootEntry = roster.find(
      (r) =>
        (topInfo.code && r.agentCode === topInfo.code) ||
        personNamesMatch(r.nameHkid || r.araName, topInfo.name)
    );

    if (!rootEntry) continue;

    const rootTeamColumnValue = (rootEntry.team || '').trim().toUpperCase();

    const subtree: Array<{
      entry: HeadcountRosterEntry;
      tier: number;
      uplineDisplay: string;
    }> = [];
    const visitedIds = new Set<string>();

    // Helper: find direct children of a given parent entry within the same team
    const getDirectChildren = (parentEntry: HeadcountRosterEntry): HeadcountRosterEntry[] => {
      const currCode = (parentEntry.agentCode || '').trim();
      const currName = extractEnglishName(parentEntry.nameHkid || parentEntry.araName);
      const children: HeadcountRosterEntry[] = [];

      for (const candidate of roster) {
        const candKey = candidate.agentCode || candidate.id;
        if (visitedIds.has(candKey) || claimedEntryIds.has(candKey)) continue;

        const candCode = (candidate.agentCode || '').trim();
        const candName = extractEnglishName(candidate.nameHkid || candidate.araName);
        const isOtherTeamTopLeader =
          (candCode && candCode !== topInfo.code && allTopLeaderCodes.has(candCode)) ||
          (candName &&
            !personNamesMatch(candName, topInfo.name) &&
            allTopLeaderNames.some((tlName) => personNamesMatch(candName, tlName)));
        if (isOtherTeamTopLeader) continue;

        const candTeamColumnValue = (candidate.team || '').trim().toUpperCase();
        if (
          rootTeamColumnValue &&
          candTeamColumnValue &&
          candTeamColumnValue !== rootTeamColumnValue
        ) {
          continue;
        }

        const upCode = (candidate.uplineManagerCode || '').trim();
        const upName = extractEnglishName(candidate.uplineManagerName);
        const matchesUplineByCode = Boolean(
          currCode && (upCode === currCode || candidate.uplineManagerName === currCode)
        );
        const matchesUplineByName = Boolean(
          (!currCode || !upCode) && currName && upName && personNamesMatch(upName, currName)
        );

        if (matchesUplineByCode || matchesUplineByName) {
          children.push(candidate);
        }
      }
      return children;
    };

    // Helper: check if an entry itself is an Upline Manager of any downline in this team
    const hasDownlinesInTeam = (entry: HeadcountRosterEntry): boolean => {
      const cCode = (entry.agentCode || '').trim();
      const cName = extractEnglishName(entry.nameHkid || entry.araName);
      return roster.some((r) => {
        if (r === entry) return false;
        const rTeam = (r.team || '').trim().toUpperCase();
        if (rootTeamColumnValue && rTeam && rTeam !== rootTeamColumnValue) return false;
        const upCode = (r.uplineManagerCode || '').trim();
        if (cCode && upCode) return cCode === upCode;
        const upName = extractEnglishName(r.uplineManagerName);
        return Boolean((!cCode || !upCode) && cName && upName && personNamesMatch(upName, cName));
      });
    };

    const isOnActiveBoard = (entry: HeadcountRosterEntry): boolean => {
      return teamBoardMembers.some(
        (bm) =>
          (entry.agentCode && bm.agentCode === entry.agentCode) ||
          personNamesMatch(bm.fullName, entry.nameHkid || entry.araName)
      );
    };

    // Recursive DFS traversal to order Team Headcount by multi-tier downlines (根據多層級下線重新排列)
    const traverseMultiTierDFS = (
      currentEntry: HeadcountRosterEntry,
      tier: number,
      uplineDisplay: string
    ) => {
      const currKey = currentEntry.agentCode || currentEntry.id;
      if (visitedIds.has(currKey)) return;
      visitedIds.add(currKey);
      claimedEntryIds.add(currKey);
      currentEntry.subTeam = team.name;
      currentEntry.hierarchyTier = tier;
      subtree.push({ entry: currentEntry, tier, uplineDisplay });

      const currDisplay = currentEntry.nameHkid || currentEntry.araName || currentEntry.agentCode || '';
      const children = getDirectChildren(currentEntry);

      // Sort direct children for clean multi-tier downline hierarchy display:
      // Group 0: Direct non-manager downlines on Active Board or with full Name (HKID)
      // Group 1: Sub-Managers on Active Board (immediately followed by their multi-tier subtree)
      // Group 2: Other Sub-Managers (immediately followed by their multi-tier subtree)
      // Group 3: Remaining direct non-manager downlines
      const getSortGroup = (item: HeadcountRosterEntry): number => {
        const isMgr = hasDownlinesInTeam(item);
        const onBoard = isOnActiveBoard(item);
        const hasFull = Boolean((item.nameHkid || '').includes(' '));
        if (!isMgr && (onBoard || hasFull)) return 0;
        if (isMgr && (onBoard || hasFull)) return 1;
        if (isMgr) return 2;
        return 3;
      };

      children.sort((a, b) => {
        const ga = getSortGroup(a);
        const gb = getSortGroup(b);
        if (ga !== gb) return ga - gb;
        const aOnBoard = isOnActiveBoard(a);
        const bOnBoard = isOnActiveBoard(b);
        if (aOnBoard !== bOnBoard) return aOnBoard ? -1 : 1;
        return (a.agentCode || '').localeCompare(b.agentCode || '');
      });

      for (const child of children) {
        traverseMultiTierDFS(child, tier + 1, currDisplay);
      }
    };

    traverseMultiTierDFS(
      rootEntry,
      0,
      rootEntry.uplineManagerName || 'Top Leader'
    );

    if (subtree.length > 0) {
      team.headcountMembers = subtree.map(({ entry, tier, uplineDisplay }) => {
        const boardMatch = teamBoardMembers.find(
          (bm) =>
            (entry.agentCode && bm.agentCode === entry.agentCode) ||
            personNamesMatch(bm.fullName, entry.nameHkid || entry.araName)
        );
        const isManagerRow =
          tier === 0 ||
          teamManagers.some(
            (mgr) =>
              (entry.agentCode && mgr.agentCode === entry.agentCode) ||
              personNamesMatch(mgr.fullName, entry.nameHkid || entry.araName)
          );
        const effectiveFycc =
          entry.fyc > 0
            ? entry.fyc
            : boardMatch && boardMatch.fycc > 0
            ? boardMatch.fycc
            : 0;
        const effectiveActive =
          effectiveFycc > 0 || entry.isActive || Boolean(boardMatch?.isActive);

        const roleLabel =
          tier === 0
            ? '最高級主管 (Top Leader)'
            : tier === 1
            ? '直屬下線 (Direct Downline)'
            : `多層級下線 (Tier ${tier} · ${uplineDisplay} 下線)`;

        return {
          agentCode: entry.agentCode,
          agentNameEN: entry.araName,
          agentNameCN: entry.chineseName,
          nameHkid: entry.nameHkid || entry.araName,
          nickname: entry.nickname || boardMatch?.nickname || '',
          managerEN: entry.uplineManagerName,
          managerCode: entry.uplineManagerCode,
          fycc: effectiveFycc,
          fyp: entry.fyp || boardMatch?.fyp || 0,
          cases: entry.cases || boardMatch?.cases || 0,
          team: entry.team,
          district: entry.district,
          productionStartDateLis: entry.productionStartDateLis,
          isActive: effectiveActive,
          isOnActiveBoard: Boolean(boardMatch),
          isTeamManager: isManagerRow,
          hierarchyTier: tier,
          hierarchyRoleLabel: roleLabel,
        };
      });
      team.teamHeadcountDenominator = team.headcountMembers.length;
    }
  }
}

export function getTeamMetrics(team: TeamBoard) {
  const members = getAllMembersOfTeam(team);
  // Active Member numerator: members on the Active Member board with isActive (FYCC > 0)
  const activeCount = members.filter((m) => m.isActive).length;
  const activeMemberPct =
    team.activeMemberDenominator > 0
      ? Math.round((activeCount / team.activeMemberDenominator) * 100)
      : 0;

  // Team Headcount numerator & denominator:
  // Allocated recursively from Headcount.excel:
  // Top Leader (1) + Direct Downlines (Tier 1) + Multi-tier Indirect Downlines (Tier 2+)
  const hasSyncedHeadcount =
    Array.isArray(team.headcountMembers) && team.headcountMembers.length > 0;

  const teamHeadcountDenominator = hasSyncedHeadcount
    ? team.headcountMembers!.length
    : team.teamHeadcountDenominator;

  const totalHeadcountActive = hasSyncedHeadcount
    ? team.headcountMembers!.filter((hm) => {
        if (hm.fycc > 0 || hm.isActive) return true;
        const boardMatch = members.find(
          (m) =>
            (hm.agentCode && m.agentCode === hm.agentCode) ||
            personNamesMatch(hm.agentNameEN, m.fullName)
        );
        return Boolean(boardMatch && (boardMatch.isActive || boardMatch.fycc > 0));
      }).length
    : teamHeadcountDenominator > 0
    ? activeCount + (team.extraTeamActiveCount || 0)
    : 0;

  const headcountPct =
    teamHeadcountDenominator > 0
      ? Math.round((totalHeadcountActive / teamHeadcountDenominator) * 100)
      : 0;

  const topLeaderCount = hasSyncedHeadcount
    ? team.headcountMembers!.filter((hm) => (hm.hierarchyTier ?? 0) === 0).length
    : 0;
  const directDownlineCount = hasSyncedHeadcount
    ? team.headcountMembers!.filter((hm) => hm.hierarchyTier === 1).length
    : 0;
  const indirectDownlineCount = hasSyncedHeadcount
    ? team.headcountMembers!.filter((hm) => (hm.hierarchyTier ?? 0) >= 2).length
    : 0;
  const topLeaderRecord = hasSyncedHeadcount
    ? team.headcountMembers!.find((hm) => (hm.hierarchyTier ?? 0) === 0)
    : undefined;

  const totalFycc = hasSyncedHeadcount
    ? team.headcountMembers!.reduce((sum, hm) => sum + (hm.fycc > 0 ? hm.fycc : 0), 0)
    : members.reduce((sum, m) => sum + (m.fycc || 0), 0);

  const totalFyp = hasSyncedHeadcount
    ? team.headcountMembers!.reduce((sum, hm) => sum + (hm.fyp && hm.fyp > 0 ? hm.fyp : 0), 0)
    : members.reduce((sum, m) => sum + (m.fyp || 0), 0);

  const totalCases = hasSyncedHeadcount
    ? team.headcountMembers!.reduce((sum, hm) => sum + (hm.cases && hm.cases > 0 ? hm.cases : 0), 0)
    : members.reduce((sum, m) => sum + (m.cases || 0), 0);

  return {
    activeCount,
    activeMemberDenominator: team.activeMemberDenominator,
    activeMemberPct,
    totalHeadcountActive,
    teamHeadcountDenominator,
    headcountPct,
    topLeaderCount,
    directDownlineCount,
    indirectDownlineCount,
    topLeaderName: topLeaderRecord?.nameHkid || topLeaderRecord?.agentNameEN || '',
    totalFycc,
    totalFyp,
    totalCases,
  };
}
