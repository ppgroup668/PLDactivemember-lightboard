import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
  AlertCircle,
  ClipboardPaste,
} from 'lucide-react';
import { AppState, SyncLogEntry } from '../shared/teamsData.ts';

interface ReportUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  appState: AppState;
  onStateUpdated: (newState: AppState) => void;
}

export const ReportUploadModal: React.FC<ReportUploadModalProps> = ({
  isOpen,
  onClose,
  appState,
  onStateUpdated,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<'file' | 'paste' | 'history'>('file');
  const [syncMode, setSyncMode] = useState<'replace' | 'additive'>('replace');
  const [targetMonth, setTargetMonth] = useState<string>(
    appState.targetMonthFilter || 'AUTO'
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latestSync, setLatestSync] = useState<SyncLogEntry | null>(
    appState.lastSync || null
  );
  const [rawPasteText, setRawPasteText] = useState('');

  if (!isOpen) return null;

  const handleFileUpload = async (file: File) => {
    setErrorMsg(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', syncMode);
      formData.append('targetMonth', targetMonth);

      const res = await fetch('/api/upload-report', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '上傳處理失敗');
      }
      setLatestSync(data.syncLog);
      if (data.state) {
        onStateUpdated(data.state);
      }
    } catch (err: any) {
      setErrorMsg(err.message || '上傳報表時發生錯誤');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawPasteText.trim()) {
      setErrorMsg('請先貼上報表內容');
      return;
    }
    setErrorMsg(null);
    setIsUploading(true);
    try {
      const res = await fetch('/api/parse-text-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: rawPasteText,
          mode: syncMode,
          targetMonth,
          fileName: 'SalesProductionAgencyPerfomanceReport_1791171184814 (貼上資料)',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '解析失敗');
      }
      setLatestSync(data.syncLog);
      if (data.state) {
        onStateUpdated(data.state);
      }
      setRawPasteText('');
    } catch (err: any) {
      setErrorMsg(err.message || '解析報表內容時發生錯誤');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full overflow-hidden shadow-xl my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              後端報表處理器 · SalesProductionAgencyPerfomanceReport
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              自動檢驗當月 DATE RANGE 並讀取 Requested Month (in total) 的 FYCC 數值，有數值即刻轉綠色亮燈
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs & Sample Download */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 bg-slate-100/70 border-b border-slate-200">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('file')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'file'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              檔案上傳 (.xlsx / .csv)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'paste'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              直接貼上報表內容
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              同步紀錄 ({appState.syncHistory.length})
            </button>
          </div>

          <a
            href="/api/sample-report"
            download="SalesProductionAgencyPerfomanceReport_1791171184814.xlsx"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            下載測試報表範本 (.xlsx)
          </a>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Processor Options */}
          {activeTab !== 'history' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  同步模式 (Sync Mode)
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setSyncMode('replace')}
                    className={`py-1.5 px-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      syncMode === 'replace'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    完整報表同步
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncMode('additive')}
                    className={`py-1.5 px-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      syncMode === 'additive'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    累加亮燈模式
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {syncMode === 'replace'
                    ? '有 FYCC 數值轉綠色，0 或無數值則重設為未亮燈（深藍）'
                    : '有 FYCC 數值轉綠色，原本已亮燈的成員保持綠色'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  當月 DATE RANGE 驗證條件
                </label>
                <select
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E87722]"
                >
                  <option value="AUTO">自動偵測報表當月 (推薦)</option>
                  <option value="2026-09">指定 2026年 9月 (Sep 2026)</option>
                  <option value="2026-10">指定 2026年 10月 (Oct 2026)</option>
                  <option value="2026-11">指定 2026年 11月 (Nov 2026)</option>
                  <option value="2026-12">指定 2026年 12月 (Dec 2026)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  檢驗報表內 Requested Month (in total) 列的 FYCC 欄位
                </p>
              </div>
            </div>
          )}

          {/* File Upload Dropzone */}
          {activeTab === 'file' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.txt,.html,.xml,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                  e.target.value = '';
                }}
                className="hidden"
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFileUpload(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-[#E87722] bg-orange-50/50'
                    : 'border-slate-300 hover:border-[#E87722] bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <FileSpreadsheet className="w-10 h-10 text-[#E87722] mx-auto mb-3" />
                <div className="text-sm font-bold text-slate-900">
                  {isUploading
                    ? '正在上傳並由後端處理器解析中...'
                    : '點擊選擇或拖曳 SalesProductionAgencyPerfomanceReport_1791171184814 至此處'}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  支援 Excel (.xlsx, .xls)、CSV (.csv) 及報表匯出檔 · 自動配對 9 個 Team 固定名單
                </p>
                <button
                  type="button"
                  disabled={isUploading}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#E87722] rounded-lg hover:bg-[#d16819] transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isUploading ? '後端處理中...' : '選擇報表檔案上傳'}
                </button>
              </div>
            </div>
          )}

          {/* Paste Raw Data Tab */}
          {activeTab === 'paste' && (
            <form onSubmit={handlePasteSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  從 Excel 或報表複製貼上 (包含姓名、Requested Month (in total) 及 FYCC 數值)
                </label>
                <textarea
                  rows={6}
                  value={rawPasteText}
                  onChange={(e) => setRawPasteText(e.target.value)}
                  placeholder={`範例格式 (支援直接從 Excel 複製貼上)：\nLAW SUK KING\tPAGGIE\tRequested Month (in total)\t18,500\nTANG SAU WAI\tANGELA\tRequested Month (in total)\t9,600\nLAM HIU YING\tRONNIE\tRequested Month (in total)\t15,200`}
                  className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E87722]"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isUploading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#E87722] rounded-lg hover:bg-[#d16819] transition-colors cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  {isUploading ? '解析同步中...' : '傳送至後端處理器並更新亮燈表'}
                </button>
              </div>
            </form>
          )}

          {/* Error Alert */}
          {errorMsg && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Latest Sync Result Summary */}
          {latestSync && activeTab !== 'history' && (
            <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-900">
                    最新報表處理結果：{latestSync.fileName}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                  {new Date(latestSync.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
                <span>
                  報表日期：<strong className="font-mono">{latestSync.reportDateRange}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  配對成員：<strong className="font-mono tabular-nums">{latestSync.matchedCount}</strong> 人
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  FYCC &gt; 0 轉綠色亮燈：
                  <strong className="font-mono text-emerald-700 tabular-nums">
                    {latestSync.activatedNames.length}
                  </strong>{' '}
                  人
                </span>
              </div>

              {latestSync.details.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="py-2 px-3 font-semibold">Team</th>
                        <th className="py-2 px-3 font-semibold">成員姓名</th>
                        <th className="py-2 px-3 font-semibold">Date Range</th>
                        <th className="py-2 px-3 font-semibold text-right">FYCC</th>
                        <th className="py-2 px-3 font-semibold text-right">狀態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {latestSync.details.map((d, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 text-slate-600">{d.teamName}</td>
                          <td className="py-1.5 px-3 font-semibold text-slate-900">
                            {d.memberName}
                          </td>
                          <td className="py-1.5 px-3 text-slate-500 font-mono text-[11px]">
                            {d.dateRange}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono tabular-nums font-medium">
                            {d.fycc.toLocaleString()}
                          </td>
                          <td className="py-1.5 px-3 text-right font-semibold">
                            {d.turnedGreen ? (
                              <span className="text-emerald-600">綠色亮燈 (Active)</span>
                            ) : (
                              <span className="text-slate-500">未亮燈 (0)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Sync History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {appState.syncHistory.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  尚無上傳紀錄，請切回「檔案上傳」上傳 SalesProductionAgencyPerfomanceReport
                </div>
              ) : (
                appState.syncHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 border border-slate-200 rounded-lg bg-slate-50/60 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{item.fileName}</div>
                      <div className="text-slate-500 mt-0.5">
                        報表日期：{item.reportDateRange} · 配對 {item.matchedCount} 人 · 亮燈{' '}
                        <span className="text-emerald-700 font-semibold">
                          {item.activatedNames.length} 人
                        </span>
                      </div>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            所有更改透過 WebSocket 即時同步至所有連線畫面
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  );
};
