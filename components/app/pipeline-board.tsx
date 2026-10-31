"use client";

import { useState } from "react";
import { STAGE_LABEL, STAGES, stageOf, type PipelineRow, type Stage } from "@/lib/pipeline";
import { Fit, VisaProof, where } from "./pipeline-table";

/** Stages as columns. Drag a card to move it; the drawer's stage picker does the same from the keyboard. */
export function PipelineBoard({ rows, onMove, onOpen }: { rows: PipelineRow[]; onMove: (jobId: string, stage: Stage) => void; onOpen: (jobId: string) => void }) {
  const [over, setOver] = useState<Stage | null>(null);
  return (
    <div className="mt-5 flex gap-3 overflow-x-auto pb-3">
      {STAGES.map((stage) => {
        const cards = rows.filter((r) => stageOf(r.status) === stage).sort((a, b) => b.score - a.score);
        return (
          <section
            key={stage}
            aria-label={STAGE_LABEL[stage]}
            onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
            onDragLeave={() => setOver((s) => (s === stage ? null : s))}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/job"); if (id) onMove(id, stage); }}
            className={`flex w-64 shrink-0 flex-col rounded-2xl border p-2 transition-colors ${over === stage ? "border-sodium/60 bg-sodium/[0.04]" : "border-haze bg-night-2/30"}`}
          >
            <h2 className="flex items-center justify-between px-1.5 pb-2 pt-1 text-sm">
              <span className="font-semibold">{STAGE_LABEL[stage]}</span><span className="text-mist">{cards.length}</span>
            </h2>
            <div className="min-h-24 space-y-2">
              {cards.map((r) => (
                <button
                  key={r.jobId}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/job", r.jobId); e.dataTransfer.effectAllowed = "move"; }}
                  onClick={() => onOpen(r.jobId)}
                  className="block w-full cursor-grab rounded-xl border border-haze bg-night-2 p-3 text-left transition-colors hover:border-moon/25 active:cursor-grabbing"
                >
                  <span className="block font-semibold leading-tight">{r.company}</span>
                  <span className="mt-0.5 block truncate text-xs text-mist">{r.title}</span>
                  <span className="mt-2 flex items-center justify-between gap-2"><VisaProof row={r} /><Fit score={r.score} /></span>
                  <span className="mt-1.5 block truncate text-xs text-mist">{where(r)}{r.contact?.name ? ` · ${r.contact.name}` : ""}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
