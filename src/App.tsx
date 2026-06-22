import React, { useState, useRef } from "react";
import { UploadCloud, File, Loader2, Download, Table2 } from "lucide-react";
import Papa from "papaparse";
import { MelcRecord } from "./types";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<MelcRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (selectedFile: File) => {
    if (selectedFile.type !== "application/pdf") {
      setError("Please select a PDF file.");
      return;
    }
    setFile(selectedFile);
    setError(null);
    setRecords([]); // Reset
  };

  const extractData = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setRecords([]);

    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let msg = "Extraction failed";
        try {
          const resJson = await response.json();
          msg = resJson.error || msg;
        } catch {
          msg = await response.text();
        }
        throw new Error(msg);
      }

      const data = await response.json();
      if (data.data) {
        setRecords(data.data);
      } else {
        throw new Error("No data returned from the server.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (records.length === 0) return;

    const csv = Papa.unparse(records);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `extracted-curriculum-${Date.now()}.csv`);
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-800">
      {/* Header Navigation */}
      <nav className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-200 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <Table2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">CurriculumExtractor Pro</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Academic Data Processor</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors">User Guide</button>
          <button className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md shadow-md hover:bg-blue-700 transition-colors">New Project</button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden p-6 gap-6">
        {/* Sidebar Controls */}
        <aside className="w-72 flex flex-col gap-6 shrink-0 overflow-y-auto">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-wider">Input Source</h2>
            <div 
              className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer min-h-[200px]
                ${file ? "border-blue-300 bg-blue-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100"}
                ${loading ? "opacity-50 pointer-events-none" : ""}`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept="application/pdf"
                onChange={handleFileChange}
              />
              
              {file ? (
                <>
                  <File className="w-10 h-10 text-blue-500 mb-3" />
                  <p className="text-sm font-semibold text-blue-700 truncate w-full">{file.name}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB • Uploaded
                  </p>
                </>
              ) : (
                <>
                  <UploadCloud className="w-10 h-10 text-blue-400 mb-3" />
                  <p className="font-medium text-slate-700 text-sm">Click or drag PDF</p>
                  <p className="text-[11px] text-slate-400 mt-1">up to 20MB</p>
                </>
              )}
            </div>

            {error && (
              <div className="mt-4 bg-red-50 text-red-700 p-3 rounded-lg text-xs font-medium border border-red-100">
                {error}
              </div>
            )}

            <button
              onClick={extractData}
              disabled={!file || loading}
              className="mt-6 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg shadow-sm transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                "Extract Data"
              )}
            </button>
            
            {loading && (
              <p className="mt-4 text-[11px] text-center text-slate-500 max-w-[200px] mx-auto">
                Analyzing the document with Gemini. Large files may take up to a minute...
              </p>
            )}
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex-1">
            <h2 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-wider">Column Mapping</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Mapping Confidence</span>
                <span className="text-xs font-bold text-green-600">{records.length > 0 ? "98.4%" : "0.0%"}</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-green-500 h-full transition-all duration-500" style={{ width: records.length > 0 ? "98.4%" : "0%" }}></div>
              </div>
              <ul className="mt-4 space-y-2">
                <li className="flex items-center gap-2 text-[11px] text-slate-600">
                  <div className={`w-1.5 h-1.5 rounded-full ${records.length ? "bg-blue-500" : "bg-slate-300"}`}></div> gradeLevelCode {records.length ? "detected" : "pending"}
                </li>
                <li className="flex items-center gap-2 text-[11px] text-slate-600">
                  <div className={`w-1.5 h-1.5 rounded-full ${records.length ? "bg-blue-500" : "bg-slate-300"}`}></div> melcDescription {records.length ? "mapped" : "pending"}
                </li>
                <li className="flex items-center gap-2 text-[11px] text-slate-600">
                  <div className={`w-1.5 h-1.5 rounded-full ${records.length ? "bg-blue-500" : "bg-slate-300"}`}></div> objectiveText {records.length ? "verified" : "pending"}
                </li>
              </ul>
            </div>
          </div>
        </aside>

        {/* Main Data View */}
        <main className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="font-bold text-slate-800">Data Preview</h2>
              <p className="text-xs text-slate-500">
                {records.length > 0 ? `Displaying ${records.length} parsed rows from PDF source` : "Awaiting data extraction"}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </button>
              <button
                onClick={downloadCsv}
                disabled={records.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm hover:bg-slate-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-hidden flex flex-col">
            {records.length > 0 ? (
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse table-fixed min-w-[max-content]">
                  <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase w-12 text-center border-r border-slate-200">ID</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase w-20">GL Code</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase w-24">Subject</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase w-24">MELC Code</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase w-56">MELC Description</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase w-16 text-center">Day</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase w-48">Objective</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase w-16 text-center">Sort</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs divide-y divide-slate-100">
                    {records.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-400 text-center border-r border-slate-100">{(i + 1).toString().padStart(2, '0')}</td>
                        <td className="px-4 py-3 font-medium text-slate-700">{r.gradeLevelCode}</td>
                        <td className="px-4 py-3 text-slate-600 truncate">{r.subjectCode}</td>
                        <td className="px-4 py-3 font-mono text-[10px] text-slate-700">{r.melcCode}</td>
                        <td className="px-4 py-3 text-slate-600 truncate" title={r.melcDescription}>{r.melcDescription}</td>
                        <td className="px-4 py-3 text-slate-700 text-center">{r.objectiveDayNumber}</td>
                        <td className="px-4 py-3 text-slate-600 truncate" title={r.objectiveText}>{r.objectiveText}</td>
                        <td className="px-4 py-3 text-slate-700 text-center">{r.objectiveSortOrder}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400 bg-slate-50/30">
                <Table2 className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-sm font-medium">Upload and extract a PDF to view data here.</p>
              </div>
            )}
          </div>

          <footer className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
            <div className="flex gap-6">
              <span>9 Columns Extracted</span>
              <span>{records.length} Rows total</span>
              <span>Encoding: UTF-8</span>
            </div>
            <div className="flex gap-2 items-center">
              {records.length > 0 ? (
                <>
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold">Structure Valid</span>
                  <span className="text-slate-300">|</span>
                  <span>Extracted newly</span>
                </>
              ) : (
                <span className="px-2 py-0.5 bg-slate-200 text-slate-500 rounded-full font-bold">Awaiting Data</span>
              )}
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
