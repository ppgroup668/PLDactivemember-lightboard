import { jsPDF } from 'jspdf';
import { TeamBoard, getTeamMetrics } from '../shared/teamsData.ts';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawPldLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#E87722';
  ctx.lineWidth = 5.5;
  ctx.lineCap = 'round';

  // 'p' circle (cx=22, cy=32, r=14)
  ctx.beginPath();
  ctx.arc(22, 32, 14, 0, Math.PI * 2);
  ctx.stroke();

  // 'p' stem (x=8, y1=30, y2=62)
  ctx.beginPath();
  ctx.moveTo(8, 30);
  ctx.lineTo(8, 62);
  ctx.stroke();

  // 'l' stem (x=50, y1=8, y2=48)
  ctx.beginPath();
  ctx.moveTo(50, 8);
  ctx.lineTo(50, 48);
  ctx.stroke();

  // 'd' circle (cx=78, cy=32, r=14)
  ctx.beginPath();
  ctx.arc(78, 32, 14, 0, Math.PI * 2);
  ctx.stroke();

  // 'd' stem (x=92, y1=8, y2=48)
  ctx.beginPath();
  ctx.moveTo(92, 8);
  ctx.lineTo(92, 48);
  ctx.stroke();

  ctx.restore();
}

function renderTeamSlideToCanvas(
  team: TeamBoard,
  reportDate: string
): HTMLCanvasElement {
  const W = 2400;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const fontStack =
    '"Plus Jakarta Sans", "Calibri", "PingFang HK", "Microsoft JhengHei", "Heiti TC", sans-serif';

  // 1. Outer Warm Cream Frame Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#F4EBDC');
  bgGrad.addColorStop(0.5, '#FAF6EE');
  bgGrad.addColorStop(1, '#F3E9D8');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Inner White Slide Card
  const padX = 48;
  const padY = 42;
  const cardX = padX;
  const cardY = padY;
  const cardW = W - padX * 2;
  const cardH = H - padY * 2;

  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fillStyle = '#FDFDFD';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.04)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.fill();
  ctx.restore();

  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.strokeStyle = '#E6DEC8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const innerLeft = cardX + 76;
  const innerRight = cardX + cardW - 76;
  const innerWidth = innerRight - innerLeft;

  // 3. Top Header Row: Gray Dot + Title on Left, Enlarged Underlined Report Date on Right
  const headerY = cardY + 68;

  // Gray Circle Dot (#B5A8A3)
  const dotRadius = 24;
  ctx.beginPath();
  ctx.arc(innerLeft + dotRadius, headerY, dotRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#B5A8A3';
  ctx.fill();

  // Slide Title (e.g. "Active Member – PL Direct")
  ctx.font = `700 44px ${fontStack}`;
  ctx.fillStyle = '#2E3338';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(team.title, innerLeft + dotRadius * 2 + 22, headerY + 2);

  // Top-Right Enlarged & Underlined Report Date ("報表結算日：6 Oct 2026")
  const formattedDate = (reportDate || '6 Oct 2026').startsWith('報表結算日')
    ? reportDate
    : `報表結算日：${reportDate || '6 Oct 2026'}`;
  ctx.font = `800 42px ${fontStack}`;
  ctx.fillStyle = '#2E3338';
  ctx.textAlign = 'right';
  ctx.fillText(formattedDate, innerRight, headerY + 2);

  const dateTextWidth = ctx.measureText(formattedDate).width;
  ctx.beginPath();
  ctx.moveTo(innerRight - dateTextWidth, headerY + 28);
  ctx.lineTo(innerRight, headerY + 28);
  ctx.strokeStyle = '#2E3338';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 4. Calculate Dynamic Row Sizing for 2-Column Member Grid
  const leftRows = team.leftColumnGroups.reduce((s, g) => s + g.members.length, 0);
  const rightRows = team.rightColumnGroups.reduce((s, g) => s + g.members.length, 0);
  const maxRows = Math.max(leftRows, rightRows, 1);
  const maxGroups = Math.max(
    team.leftColumnGroups.length,
    team.rightColumnGroups.length,
    1
  );

  // Available vertical area between header and bottom formulas
  const gridTopY = headerY + 62;
  const bottomSectionHeight = 235;
  const availableGridHeight = cardY + cardH - gridTopY - bottomSectionHeight;

  const groupGap = maxRows >= 11 ? 22 : maxRows >= 8 ? 28 : 38;
  const totalGroupGaps = Math.max(0, maxGroups - 1) * groupGap;
  const computedRowH = Math.floor((availableGridHeight - totalGroupGaps) / maxRows);
  const rowH = Math.max(46, Math.min(68, computedRowH));
  const rowFontSize = rowH <= 50 ? 25 : rowH <= 56 ? 27 : 29;

  const colGap = 76;
  const colW = (innerWidth - colGap) / 2;
  const leftColX = innerLeft;
  const rightColX = innerLeft + colW + colGap;

  const renderColumnGroups = (
    groups: typeof team.leftColumnGroups,
    colX: number
  ) => {
    let currY = gridTopY;

    for (const group of groups) {
      for (let idx = 0; idx < group.members.length; idx++) {
        const member = group.members[idx];
        const isLastInGroup = idx === group.members.length - 1;
        const isLeader = member.isLeaderRow;
        const isActive = member.isActive;

        // Row Background: Orange (#E87722) for Manager, Light Gray/White (#F8F8F8) for Downline
        ctx.fillStyle = isLeader ? '#E87722' : '#F8F8F8';
        ctx.fillRect(colX, currY, colW, rowH);

        // Top & Bottom Black Borders (3.5px solid black on leader rows and bottom of group)
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3.2;
        if (isLeader) {
          ctx.beginPath();
          ctx.moveTo(colX, currY);
          ctx.lineTo(colX + colW, currY);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(colX, currY + rowH);
          ctx.lineTo(colX + colW, currY + rowH);
          ctx.stroke();
        } else if (isLastInGroup) {
          ctx.beginPath();
          ctx.moveTo(colX, currY + rowH);
          ctx.lineTo(colX + colW, currY + rowH);
          ctx.stroke();
        }

        // Text Color: Dark Navy (#182650) default, Vibrant Green when Active (FYCC > 0)
        ctx.save();
        ctx.font = `700 ${rowFontSize}px ${fontStack}`;
        ctx.textBaseline = 'middle';

        if (isActive) {
          if (isLeader) {
            ctx.fillStyle = '#68E334';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = 2.5;
            ctx.shadowOffsetY = 1.5;
          } else {
            ctx.fillStyle = '#53A630';
          }
        } else {
          ctx.fillStyle = '#182650';
        }

        const textCenterY = currY + rowH / 2 + 1;
        const fullNameX = colX + 26;
        const maxFullNameW = colW * 0.62 - 32;

        // Draw Full Name (left-aligned, clipped to left 62% of column)
        ctx.save();
        ctx.beginPath();
        ctx.rect(colX, currY, colW * 0.63, rowH);
        ctx.clip();
        ctx.textAlign = 'left';
        ctx.fillText(
          (member.fullName || '').toUpperCase(),
          fullNameX,
          textCenterY,
          maxFullNameW
        );
        ctx.restore();

        // Draw Nickname (center-aligned in right 38% of column)
        const nickCenterX = colX + colW * 0.81;
        ctx.textAlign = 'center';
        ctx.fillText(
          (member.nickname || '').toUpperCase(),
          nickCenterX,
          textCenterY,
          colW * 0.35
        );

        ctx.restore();
        currY += rowH;
      }

      currY += groupGap;
    }
  };

  renderColumnGroups(team.leftColumnGroups, leftColX);
  renderColumnGroups(team.rightColumnGroups, rightColX);

  // 5. Bottom-Right Summary Formulas & PLD Logo
  const metrics = getTeamMetrics(team);

  // Active Member 亮燈率 color: < 45% Red (#C00000), 45-80% Yellow (#D69600), >= 80% Green (#4EA72E)
  const activeMemberPctColor =
    metrics.activeMemberPct >= 80
      ? '#4EA72E'
      : metrics.activeMemberPct >= 45
      ? '#D69600'
      : '#C00000';

  // Team Headcount 亮燈率 color: < 45% Red (#C00000), >= 45% Green (#4EA72E)
  const headcountPctColor =
    metrics.headcountPct >= 45 ? '#4EA72E' : '#C00000';

  const formulaFontSize = maxRows >= 11 ? 44 : 50;
  const line1Y = cardY + cardH - 172;
  const line2Y = cardY + cardH - 110;

  const drawFormulaLine = (
    prefixText: string,
    pctText: string,
    pctColor: string,
    y: number
  ) => {
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 1.5;
    ctx.shadowOffsetY = 1;

    // Measure percentage width first so we can right-align the whole line at innerRight
    ctx.font = `700 ${formulaFontSize}px ${fontStack}`;
    const pctWidth = ctx.measureText(pctText).width;

    // Draw percentage on the far right
    ctx.fillStyle = pctColor;
    ctx.textAlign = 'right';
    ctx.fillText(pctText, innerRight, y);

    // Draw gold prefix text to the left of percentage
    ctx.font = `600 ${formulaFontSize}px ${fontStack}`;
    ctx.fillStyle = '#D69600';
    ctx.fillText(prefixText, innerRight - pctWidth, y);
    ctx.restore();
  };

  drawFormulaLine(
    `${metrics.activeCount} Active / ${metrics.activeMemberDenominator} Active Member = `,
    `${metrics.activeMemberPct}%`,
    activeMemberPctColor,
    line1Y
  );

  drawFormulaLine(
    `${metrics.totalHeadcountActive} Active / ${metrics.teamHeadcountDenominator} Team Headcount = `,
    `${metrics.headcountPct}%`,
    headcountPctColor,
    line2Y
  );

  // 6. Bottom-Right Caption ("以公司Submissions Report計算Submission Active") + PLD Logo
  const logoScale = 0.88;
  const logoW = 110 * logoScale;
  const logoX = innerRight - logoW;
  const logoY = cardY + cardH - 76;

  drawPldLogo(ctx, logoX, logoY, logoScale);

  ctx.save();
  ctx.font = `600 18px ${fontStack}`;
  ctx.fillStyle = '#2E3338';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    '以公司Submissions Report計算Submission Active',
    logoX - 16,
    cardY + cardH - 28
  );
  ctx.restore();

  return canvas;
}

export async function exportAllTeamsOriginalPdf(
  teams: TeamBoard[],
  reportDate: string
): Promise<void> {
  if (!teams || teams.length === 0) return;

  // Ensure web fonts are ready before rendering to canvas
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  // 16:9 Widescreen Presentation Page (1600 x 900 pt)
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [1600, 900],
    compress: true,
  });

  for (let i = 0; i < teams.length; i++) {
    if (i > 0) {
      pdf.addPage([1600, 900], 'landscape');
    }
    const canvas = renderTeamSlideToCanvas(teams[i], reportDate);
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, 1600, 900, undefined, 'FAST');
  }

  const cleanDate = (reportDate || '6_Oct_2026')
    .replace(/^報表結算日[：:]\s*/, '')
    .trim()
    .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, '_');

  pdf.save(`PLD_Active_Member_亮燈表_全套${teams.length}頁_${cleanDate}.pdf`);
}
