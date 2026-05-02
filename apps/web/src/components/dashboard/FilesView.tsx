"use client";

import React, { useState } from "react";
import { 
  FileText, 
  Image as ImageIcon, 
  File as FileIcon, 
  MoreVertical, 
  Search, 
  Plus, 
  Download, 
  Trash2,
  Filter,
  Grid,
  List
} from "lucide-react";

interface FileItem {
  id: string;
  name: string;
  size: string;
  type: "document" | "image" | "pdf" | "other";
  updatedAt: string;
  owner: string;
}

const MOCK_FILES: FileItem[] = [
  { id: "1", name: "Project_Proposal.pdf", size: "2.4 MB", type: "pdf", updatedAt: "2024-05-15T10:30:00Z", owner: "Ritesh" },
  { id: "2", name: "Studio_Layout_v2.png", size: "5.1 MB", type: "image", updatedAt: "2024-05-14T16:45:00Z", owner: "Ritesh" },
  { id: "3", name: "Meeting_Notes.docx", size: "45 KB", type: "document", updatedAt: "2024-05-12T09:15:00Z", owner: "System" },
  { id: "4", name: "Reference_Assets.zip", size: "128 MB", type: "other", updatedAt: "2024-05-10T14:20:00Z", owner: "Ritesh" },
];

export const FilesView = () => {
  const [files, setFiles] = useState<FileItem[]>(MOCK_FILES);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFileIcon = (type: string) => {
    switch (type) {
      case "pdf": return <FileText className="text-red-500" />;
      case "image": return <ImageIcon className="text-blue-500" />;
      case "document": return <FileText className="text-emerald-500" />;
      default: return <FileIcon className="text-slate-400" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="ink-title m-0 text-[1.8rem]">Shared Workspace</h2>
          <p className="soft-copy mt-1">
            Access and manage all project assets in one secure place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost p-2" onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}>
            {viewMode === "grid" ? <List className="w-5 h-5" /> : <Grid className="w-5 h-5" />}
          </button>
          <button className="btn btn-primary flex items-center gap-2 px-4 py-2 text-sm shadow-lg shadow-indigo-500/20">
            <Plus className="w-4 h-4" />
            Upload File
          </button>
        </div>
      </header>

      <div className="flex items-center gap-3 bg-[rgba(26,26,26,0.03)] p-2 rounded-2xl border border-[rgba(26,26,26,0.05)]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-soft)] opacity-40" />
          <input 
            type="text" 
            placeholder="Search files..."
            className="w-full bg-transparent border-none pl-10 pr-4 py-1.5 text-sm focus:ring-0 placeholder:text-[var(--ink-soft)] placeholder:opacity-40"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors border-l border-[rgba(26,26,26,0.1)]">
          <Filter className="w-3.5 h-3.5" />
          Filter
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        {filteredFiles.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 border border-dashed border-[rgba(26,26,26,0.1)] rounded-[32px] bg-[rgba(26,26,26,0.01)] min-h-[300px]">
            <FileIcon className="w-12 h-12 text-[var(--ink-soft)] opacity-10 mb-4" />
            <p className="soft-copy text-center">No files found matching your search.</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredFiles.map((file) => (
              <FileGridCard key={file.id} file={file} icon={getFileIcon(file.type)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col border border-[rgba(26,26,26,0.06)] rounded-2xl overflow-hidden bg-[var(--bg-surface)]">
            {filteredFiles.map((file, idx) => (
              <FileListRow key={file.id} file={file} icon={getFileIcon(file.type)} isLast={idx === filteredFiles.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const FileGridCard = ({ file, icon }: { file: FileItem, icon: React.ReactElement<{ className?: string }> }) => (
  <div className="bg-[var(--bg-surface)] group border border-[rgba(26,26,26,0.06)] p-5 rounded-[32px] hover:border-[var(--brand-soft)] transition-all relative overflow-hidden shadow-sm hover:shadow-xl hover:shadow-indigo-500/5">
    <div className="flex justify-between items-start mb-3">
      <div className="p-3 bg-white rounded-2xl shadow-sm border border-[rgba(26,26,26,0.03)]">
        {React.cloneElement(icon, { className: "w-6 h-6" })}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-1.5 rounded-lg hover:bg-[rgba(26,26,26,0.05)] text-[var(--ink-soft)]">
          <Download className="w-4 h-4" />
        </button>
        <button className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
    <div className="flex flex-col gap-0.5">
      <h3 className="m-0 text-sm font-bold text-[var(--ink)] truncate" title={file.name}>
        {file.name}
      </h3>
      <span className="text-[11px] soft-copy uppercase font-medium tracking-tight">
        {file.size} • {new Date(file.updatedAt).toLocaleDateString()}
      </span>
    </div>
    <div className="mt-3 flex items-center gap-2 pt-3 border-t border-[rgba(26,26,26,0.03)]">
      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] text-white font-bold">
        {file.owner[0]}
      </div>
      <span className="text-[11px] font-medium text-[var(--ink-soft)]">{file.owner}</span>
    </div>
  </div>
);

const FileListRow = ({ file, icon, isLast }: { file: FileItem, icon: React.ReactElement<{ className?: string }>, isLast: boolean }) => (
  <div className={`flex items-center gap-4 p-4 hover:bg-[rgba(26,26,26,0.02)] transition-colors ${!isLast ? 'border-bottom border-[rgba(26,26,26,0.03)]' : ''}`}>
    <div className="p-2 bg-white rounded-xl shadow-sm border border-[rgba(26,26,26,0.03)]">
      {React.cloneElement(icon, { className: "w-5 h-5" })}
    </div>
    <div className="flex-1 flex flex-col">
      <span className="text-sm font-bold text-[var(--ink)]">{file.name}</span>
      <span className="text-[11px] soft-copy uppercase font-medium">{file.owner}</span>
    </div>
    <div className="hidden md:block text-[11px] font-medium text-[var(--ink-soft)] uppercase w-24">
      {file.size}
    </div>
    <div className="hidden sm:block text-[11px] font-medium text-[var(--ink-soft)] uppercase w-32">
      {new Date(file.updatedAt).toLocaleDateString()}
    </div>
    <div className="flex items-center gap-1">
      <button className="p-2 rounded-lg hover:bg-[rgba(26,26,26,0.05)] text-[var(--ink-soft)]">
        <Download className="w-4 h-4" />
      </button>
      <button className="p-2 rounded-lg hover:bg-[rgba(26,26,26,0.05)] text-[var(--ink-soft)]">
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  </div>
);
