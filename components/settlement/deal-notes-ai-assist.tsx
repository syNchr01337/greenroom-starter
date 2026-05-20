"use client";

import { useState } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
} from "@/components/ui/card";
import { PlainBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type {
  DealNotesAiRequest,
  DealNotesAiResponse,
} from "@/lib/dealNotesAi";

interface DealNotesAiAssistProps extends DealNotesAiRequest {
  onApply: (suggestions: DealNotesAiResponse) => void;
  onReset: () => void;
  onAmbiguitiesChange?: (ambiguities: string[]) => void;
  usingAiInterpretation: boolean;
  locked?: boolean;
}

export function DealNotesAiAssist({
  dealNotesFreetext,
  dealType,
  guaranteeAmount,
  percentage,
  expenseCap,
  onApply,
  onReset,
  onAmbiguitiesChange,
  usingAiInterpretation,
  locked = false,
}: DealNotesAiAssistProps) {
  const [result, setResult] = useState<DealNotesAiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    // TODO: track_event("deal_notes_ai_analyze_clicked", { showId })
    setLoading(true);
    setError(null);
    onAmbiguitiesChange?.([]);
    try {
      const response = await fetch("/api/deal-notes-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealNotesFreetext,
          dealType,
          guaranteeAmount,
          percentage,
          expenseCap,
        } satisfies DealNotesAiRequest),
      });
      if (!response.ok) throw new Error("Request failed");
      const parsed = (await response.json()) as DealNotesAiResponse;
      setResult(parsed);
      onAmbiguitiesChange?.(parsed.ambiguities ?? []);
    } catch {
      // TODO: track_event("deal_notes_ai_failed", { showId })
      setError(
        "Couldn't get suggestions right now - you can still settle using the breakdown above.",
      );
      onAmbiguitiesChange?.([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <div>
          <CardTitle>Deal notes assistant</CardTitle>
          <CardDescription>
            Catch unclear terms before they turn into a 2am argument.
          </CardDescription>
        </div>
        <Sparkles className="h-4 w-4 text-brand-700 shrink-0" />
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="eyebrow text-[10px] text-ink-500 mb-2">
            Original notes from agent
          </div>
          <p className="text-[11.5px] text-ink-500 mb-2">
            What was agreed in email or the offer sheet.
          </p>
          <div className="rounded-lg bg-canvas-soft p-3 text-[12.5px] leading-relaxed text-ink-800 ring-1 ring-ink-200/70">
            {dealNotesFreetext?.trim() || "No free-text deal notes entered."}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={analyze}
            disabled={loading || locked}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {loading ? "Analyzing..." : "Analyze deal notes"}
          </Button>
          {usingAiInterpretation && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={locked}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to original terms
            </Button>
          )}
        </div>
        <p className="text-[11.5px] text-ink-500 -mt-2">
          We&apos;ll propose a structured reading; you decide whether to apply
          it.
        </p>

        {error && (
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 p-3 text-[12.5px] leading-relaxed text-ink-700">
            {error}
          </div>
        )}

        {result && (
          <>
            <div className="rounded-lg border border-ink-200/80 p-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-[13px] font-semibold text-ink-900">
                    Here&apos;s how we read this deal email
                  </div>
                  <div className="text-[11.5px] text-ink-500 mt-0.5">
                    Suggestions only. Nothing changes until you apply them.
                  </div>
                </div>
                {usingAiInterpretation && (
                  <PlainBadge variant="brand">Using AI-assisted interpretation</PlainBadge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Variant" value={prettyVariant(result.suggestedVariant)} />
                <Field
                  label="Guarantee"
                  mono
                  value={
                    result.suggestedGuarantee == null
                      ? "No guarantee"
                      : `${formatMoney(result.suggestedGuarantee)} guarantee`
                  }
                />
                <Field
                  label="Percentage"
                  mono
                  value={
                    result.suggestedPercentage == null
                      ? "-"
                      : `${(result.suggestedPercentage * 100).toFixed(0)}% artist share`
                  }
                />
                <Field
                  label="Expense cap"
                  mono
                  value={
                    result.suggestedExpenseCap == null
                      ? "No cap found"
                      : `${formatMoney(result.suggestedExpenseCap)} expense cap`
                  }
                />
                <Field
                  label="Recoup placement"
                  value={prettyRecoupPlacement(result.suggestedRecoupPlacement)}
                  className="col-span-2"
                />
              </div>
            </div>

            {result.ambiguities.length > 0 && (
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 p-4">
                <div className="text-[13px] font-semibold text-amber-900">
                  Things to clarify before the show
                </div>
                <ul className="mt-2 space-y-1.5">
                  {result.ambiguities.map((ambiguity) => (
                    <li
                      key={ambiguity}
                      className="text-[12.5px] leading-relaxed text-ink-700"
                    >
                      {ambiguity}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => onApply(result)}
                disabled={locked}
              >
                Apply suggestions to this settlement
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  // TODO: track_event("deal_notes_ai_ignored", { showId })
                  setResult(null);
                  onAmbiguitiesChange?.([]);
                }}
                disabled={locked}
              >
                Ignore for now
              </Button>
            </div>
            <p className="text-[11.5px] text-ink-500 -mt-1">
              Updates tonight&apos;s worksheet; you can reset to the original
              terms at any time.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function prettyVariant(value: string) {
  const labels: Record<string, string> = {
    vs_net: "Vs net",
    vs_gross: "Vs gross",
    percentage_of_net: "% of net",
    unknown: "Unknown",
  };
  return labels[value] ?? value;
}

function prettyRecoupPlacement(value: string) {
  const labels: Record<string, string> = {
    inside_cap: "Inside cap",
    outside_cap: "Outside cap",
    unknown: "Needs confirmation",
  };
  return labels[value] ?? value;
}
