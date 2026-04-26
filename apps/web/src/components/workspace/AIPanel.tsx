'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useMediaStore } from '@/store/media.store';

type AiTab = 'summary' | 'qa';

type IngestStats = {
  canvasEvents: number;
  chatMessages: number;
  transcriptSegments: number;
  chunks: number;
};

type QuerySource = {
  type: 'canvas' | 'chat' | 'speech' | 'timeline';
  content: string;
  score: number;
  startMs: number;
  endMs: number;
};

const IconAI = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    <circle cx="12" cy="12" r="4" />
  </svg>
);

function SourceBadge({ type }: { type: QuerySource['type'] }) {
  return (
    <span className="rounded-full border border-[rgba(13,91,215,.25)] bg-[rgba(13,91,215,.08)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--brand-strong)]">
      {type}
    </span>
  );
}

export function AIPanel({ roomId }: { roomId: string }) {
  const [tab, setTab] = useState<AiTab>('summary');
  const [busy, setBusy] = useState(false);
  const includeTranscript = useMediaStore((s) => s.transcriptEnabled);
  const setIncludeTranscript = useMediaStore((s) => s.setTranscriptEnabled);
  const [summary, setSummary] = useState('');
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [stats, setStats] = useState<IngestStats | null>(null);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<QuerySource[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [failureCount, setFailureCount] = useState(0);
  const isDegraded = failureCount >= 3;

  const getCanvasImage = () => {
    const canvas = document.getElementById('main-drawing-canvas') as HTMLCanvasElement | null;
    if (!canvas) return null;
    try {
      // Export at lower quality/size to stay within payload limits
      return canvas.toDataURL('image/jpeg', 0.6);
    } catch (e) {
      console.warn('Failed to capture canvas image:', e);
      return null;
    }
  };

  const generateSummary = async () => {
    setBusy(true);
    setSummaryError(null);
    try {
      const canvasImage = getCanvasImage();
      const res = await api.post(
        `/api/v1/rooms/${roomId}/ai/summary?refresh=true&includeTranscript=${includeTranscript ? 'true' : 'false'}`,
        { canvasImage }
      );
      setSummary(String(res?.summary ?? 'No summary returned.'));
      setFailureCount(0); // Reset on success
      if (res?.counts) {
        setStats({
          canvasEvents: Number(res.counts.canvasEvents ?? 0),
          chatMessages: Number(res.counts.chatMessages ?? 0),
          transcriptSegments: Number(res.counts.transcriptSegments ?? 0),
          chunks: Number(res.counts.chunks ?? 0),
        });
      }
    } catch (error: any) {
      setSummaryError(error?.message || 'Failed to generate summary.');
      setFailureCount((prev) => prev + 1);
    } finally {
      setBusy(false);
    }
  };

  const askQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setBusy(true);
    setQueryError(null);
    try {
      const canvasImage = getCanvasImage();
      const res = await api.post(`/api/v1/rooms/${roomId}/ai/query`, {
        question: trimmed,
        includeTranscript,
        canvasImage,
      });
      setAnswer(String(res?.answer ?? 'No answer returned.'));
      setSources(Array.isArray(res?.sources) ? res.sources : []);
      setFailureCount(0); // Reset on success
    } catch (error: any) {
      setQueryError(error?.message || 'Failed to answer the question.');
      setFailureCount((prev) => prev + 1);
    } finally {
      setBusy(false);
    }
  };

  const toggleTranscript = async () => {
    const nextValue = !includeTranscript;
    setIncludeTranscript(nextValue);
    if (nextValue) {
      try {
        await api.post(`/api/v1/rooms/${roomId}/transcribe`);
      } catch (error) {
        console.error('Failed to start transcription agent:', error);
        setIncludeTranscript(false);
      }
      return;
    }

    try {
      await api.post(`/api/v1/rooms/${roomId}/transcribe/stop`);
    } catch (error) {
      console.error('Failed to stop transcription agent:', error);
      setIncludeTranscript(true);
      }
  };

  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-[20px]">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[rgba(13,91,215,.12)] text-[var(--brand)]">
            <IconAI />
          </span>
          <span className="panel-header-title">Session AI</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void toggleTranscript()}
            className={`btn btn-sm ${includeTranscript ? 'btn-primary' : 'btn-outline'}`}
            title="Toggle whether transcript segments are included when building AI chunks"
          >
            Transcript: {includeTranscript ? 'On' : 'Off'}
          </button>
          <span className="status-pill status-pill-blue">{busy ? 'Working…' : 'Ready'}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--border-subtle)] px-3 py-2">
        <button
          type="button"
          onClick={() => setTab('summary')}
          className={`btn btn-sm ${tab === 'summary' ? 'btn-primary' : 'btn-outline'}`}
          disabled={isDegraded}
        >
          Summary
        </button>
        <button
          type="button"
          onClick={() => setTab('qa')}
          className={`btn btn-sm ${tab === 'qa' ? 'btn-primary' : 'btn-outline'}`}
          disabled={isDegraded}
        >
          Q&A
        </button>
      </div>

      {isDegraded ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(172,56,48,0.1)] text-[#8c2317]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <div className="space-y-2">
            <h3 className="text-[1rem] font-bold text-[#1a1a1a]">AI Services Resting</h3>
            <p className="text-[0.82rem] leading-relaxed text-[#666]">
              We're experiencing temporary difficulty connecting to our AI brain. High-performance mode will resume shortly.
            </p>
          </div>
          <button 
            type="button" 
            className="btn btn-outline btn-sm"
            onClick={() => setFailureCount(0)}
          >
            Try Reconnecting
          </button>
        </div>
      ) : tab === 'summary' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-3">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.7)] px-3 py-2 text-[0.76rem] text-[var(--ink-soft)]">
            Context is built automatically when you generate a summary or ask a question.
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void generateSummary()} disabled={busy}>
              Generate Summary
            </button>
          </div>

          {stats && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.75)] px-3 py-2 text-[0.76rem] text-[var(--ink-soft)]">
              {stats.canvasEvents} canvas events · {stats.chatMessages} chat messages · {stats.transcriptSegments} transcript segments · {stats.chunks} chunks
            </div>
          )}

          {summaryError && (
            <div className="rounded-xl border border-[rgba(172,56,48,.24)] bg-[rgba(172,56,48,.1)] px-3 py-2 text-[0.78rem] text-[#8c2317]">
              {summaryError}
            </div>
          )}

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.82)] px-3 py-2 text-[0.86rem] leading-6 text-[var(--ink)]">
            {summary || 'Build context first, then generate the session summary.'}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about this session…"
            className="input min-h-[92px] resize-none"
          />
          <div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void askQuestion()} disabled={busy || !question.trim()}>
              Ask
            </button>
          </div>

          {queryError && (
            <div className="rounded-xl border border-[rgba(172,56,48,.24)] bg-[rgba(172,56,48,.1)] px-3 py-2 text-[0.78rem] text-[#8c2317]">
              {queryError}
            </div>
          )}

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.82)] px-3 py-2 text-[0.86rem] leading-6 text-[var(--ink)]">
            {answer || 'Ask a grounded question to get an answer from canvas, chat, and speech context.'}
          </div>

          {sources.length > 0 && (
            <div className="scroll-thin max-h-[30%] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,250,241,.62)] px-2 py-2">
              <div className="flex flex-col gap-2">
                {sources.map((source, index) => (
                  <div key={`${source.type}-${index}`} className="rounded-lg border border-[rgba(26,26,26,.1)] bg-[rgba(255,255,255,.5)] px-2 py-1.5">
                    <div className="mb-1 flex items-center gap-1.5">
                      <SourceBadge type={source.type} />
                    </div>
                    <div className="text-[0.74rem] text-[var(--ink-soft)]">{source.content}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
