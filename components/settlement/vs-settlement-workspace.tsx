"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlainBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import {
  calculateVsGross,
  calculateVsNet,
  type RecoupPlacementHint,
  type VsSettlementBreakdown,
} from "@/lib/dealMath";
import type { DealNotesAiResponse, SuggestedDealVariant } from "@/lib/dealNotesAi";
import { DealNotesAiAssist } from "@/components/settlement/deal-notes-ai-assist";

type SettlementStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "signed"
  | "disputed"
  | "revised"
  | "finalized"
  | "paid"
  | "voided";

interface VsSettlementWorkspaceProps {
  initialBreakdown: VsSettlementBreakdown;
  existingSettlement: { status: SettlementStatus } | null;
  dealNotesFreetext: string | null;
  dealType: string;
  structuredGuarantee: number | null;
  structuredPercentage: number | null;
  structuredExpenseCap: number | null;
}

interface AppliedInterpretation {
  variant: SuggestedDealVariant;
  guaranteeAmount: number | null;
  percentage: number | null;
  expenseCap: number | null;
  recoupPlacementHint: RecoupPlacementHint;
  ambiguities: string[];
}

export function VsSettlementWorkspace({
  initialBreakdown,
  existingSettlement,
  dealNotesFreetext,
  dealType,
  structuredGuarantee,
  structuredPercentage,
  structuredExpenseCap,
}: VsSettlementWorkspaceProps) {
  const [interpretation, setInterpretation] =
    useState<AppliedInterpretation | null>(null);
  const currentBreakdown = interpretation
    ? recalculateBreakdown(initialBreakdown, interpretation)
    : initialBreakdown;
  const displayFlags = mergeFlags(
    currentBreakdown.flags,
    interpretation?.ambiguities ?? [],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <VsSettlementWorksheet
        breakdown={currentBreakdown}
        existingSettlement={existingSettlement}
        flags={displayFlags}
        usingAiInterpretation={Boolean(interpretation)}
      />
      <DealNotesAiAssist
        dealNotesFreetext={dealNotesFreetext}
        dealType={dealType}
        guaranteeAmount={structuredGuarantee}
        percentage={structuredPercentage}
        expenseCap={structuredExpenseCap}
        usingAiInterpretation={Boolean(interpretation)}
        onApply={(suggestions) =>
          setInterpretation({
            variant: suggestions.suggestedVariant,
            guaranteeAmount: suggestions.suggestedGuarantee,
            percentage: suggestions.suggestedPercentage,
            expenseCap: suggestions.suggestedExpenseCap,
            recoupPlacementHint: suggestions.suggestedRecoupPlacement,
            ambiguities: suggestions.ambiguities,
          })
        }
        onReset={() => setInterpretation(null)}
      />
    </div>
  );
}

function recalculateBreakdown(
  initial: VsSettlementBreakdown,
  interpretation: AppliedInterpretation,
): VsSettlementBreakdown {
  const variant =
    interpretation.variant === "vs_gross"
      ? "vs_gross"
      : interpretation.variant === "vs_net" ||
          interpretation.variant === "percentage_of_net"
        ? "vs_net"
        : initial.variant;
  const guaranteeAmount =
    interpretation.guaranteeAmount ??
    (interpretation.variant === "percentage_of_net" ? 0 : initial.guaranteeAmount);
  const percentage = interpretation.percentage ?? initial.percentage;
  const expenseCap =
    interpretation.expenseCap ??
    (variant === "vs_net" ? initial.expenseCap : null);

  if (variant === "vs_gross") {
    return calculateVsGross({
      grossBoxOffice: initial.grossBoxOffice,
      guaranteeAmount,
      percentage,
      recoupsTotal: initial.recoupsTotal,
      recoupPlacementHint: interpretation.recoupPlacementHint,
    });
  }

  const rawExpenses =
    initial.eligibleExpensesCapped + initial.overCapAbsorbedByVenue;
  const outsideCapRecoupsTotal =
    interpretation.recoupPlacementHint === "outside_cap"
      ? initial.recoupsTotal
      : 0;

  return calculateVsNet({
    grossBoxOffice: initial.grossBoxOffice,
    feesTotal: initial.feesTotal,
    expenses: [syntheticExpense(rawExpenses)],
    expenseCap,
    guaranteeAmount,
    percentage,
    outsideCapRecoupsTotal,
    recoupsTotal: initial.recoupsTotal,
    recoupPlacementHint: interpretation.recoupPlacementHint,
  });
}

function syntheticExpense(amount: number) {
  return {
    id: "ai_assist_expense_total",
    showId: "ai_assist_show",
    category: "other" as const,
    amount,
    description: "Current settlement expense total",
    approved: true,
    absorbedByVenue: false,
    enteredByUserId: null,
    enteredAt: new Date(0),
  };
}

function mergeFlags(engineFlags: string[], ambiguityFlags: string[]) {
  return Array.from(new Set([...engineFlags, ...ambiguityFlags]));
}

function VsSettlementWorksheet({
  breakdown,
  existingSettlement,
  flags,
  usingAiInterpretation,
}: {
  breakdown: VsSettlementBreakdown;
  existingSettlement: { status: SettlementStatus } | null;
  flags: string[];
  usingAiInterpretation: boolean;
}) {
  const isNet = breakdown.variant === "vs_net";
  const basisValue = isNet
    ? (breakdown.netBasis ?? 0)
    : (breakdown.grossBasis ?? breakdown.grossBoxOffice);
  const percentageScopeText = isNet ? "net after expenses" : "gross";
  const branchText =
    breakdown.winningBranch === "percentage"
      ? `We're paying the artist ${formatMoney(breakdown.finalPayoutToArtist)} tonight - ${formatPercent(breakdown.percentage)} of ${percentageScopeText}${isNet && breakdown.expenseCap != null ? ` after ${formatMoney(breakdown.expenseCap)} in expenses` : ""} beat the ${formatMoney(breakdown.guaranteeAmount)} guarantee.`
      : `We're paying the artist ${formatMoney(breakdown.finalPayoutToArtist)} tonight - the ${formatMoney(breakdown.guaranteeAmount)} guarantee beat ${formatPercent(breakdown.percentage)} of ${percentageScopeText}.`;

  return (
    <div className="space-y-6">
      <Card accent="brand">
        <CardContent className="py-5">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="eyebrow text-[10px] text-ink-400">
                  GM sign-off summary
                </div>
                {usingAiInterpretation && (
                  <PlainBadge variant="sky">Using AI-assisted interpretation</PlainBadge>
                )}
              </div>
              <div className="text-[13px] text-ink-700 leading-relaxed">
                {branchText}
              </div>
            </div>
            <div className="md:text-right">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-400 mb-1">
                Final payout
              </div>
              <div className="text-[28px] font-mono tabular font-semibold text-ink-900">
                {formatMoney(breakdown.finalPayoutToArtist)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {flags.length > 0 && (
        <Card accent="amber">
          <CardHeader>
            <div>
              <CardTitle>Check before signing</CardTitle>
              <CardDescription>
                Double-check these before you and the tour manager sign the
                settlement sheet.
              </CardDescription>
            </div>
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {flags.map((flag) => (
                <li
                  key={flag}
                  className="text-[12.5px] text-ink-700 leading-relaxed"
                >
                  {flag}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="text-center py-10 mb-2">
        <div className="eyebrow text-[10px] text-ink-400 mb-3">
          Total to artist
        </div>
        <div
          className="text-[72px] font-mono tabular font-bold text-ink-900 leading-none"
          style={{ letterSpacing: "-0.03em" }}
        >
          {formatMoney(breakdown.finalPayoutToArtist)}
        </div>
        {existingSettlement && (
          <div className="mt-3">
            {existingSettlement.status === "paid" ? (
              <PlainBadge variant="brand">Paid</PlainBadge>
            ) : existingSettlement.status === "signed" ||
              existingSettlement.status === "finalized" ? (
              <PlainBadge variant="brand">Signed</PlainBadge>
            ) : existingSettlement.status === "disputed" ? (
              <PlainBadge variant="rose">Disputed</PlainBadge>
            ) : null}
          </div>
        )}
      </div>

      <Card accent="brand">
        <CardHeader>
          <div>
            <CardTitle>How we got to this number</CardTitle>
            <CardDescription>
              Line-by-line breakdown for tonight&apos;s settlement.
            </CardDescription>
          </div>
          <PlainBadge variant="brand">
            {breakdown.winningBranch === "percentage"
              ? "Percentage wins"
              : "Guarantee wins"}
          </PlainBadge>
        </CardHeader>
        <CardContent className="divide-y divide-ink-100/80">
          <Row
            label="Tickets in the room"
            value={formatMoney(breakdown.grossBoxOffice)}
            note="Gross box office from tickets before any deductions."
          />
          <Row
            label="Card & platform fees"
            value={formatMoney(-breakdown.feesTotal)}
            note="What goes to processors and the ticketing platform."
          />
          <Row
            label="Expenses counted toward the cap"
            value={formatMoney(-breakdown.eligibleExpensesCapped)}
            note={expenseCapNote(breakdown)}
          />
          {isNet && breakdown.overCapAbsorbedByVenue > 0 && (
            <Row
              label="Over-cap absorbed by the venue"
              value={formatMoney(breakdown.overCapAbsorbedByVenue)}
              note="Anything above the cap that the venue is eating."
            />
          )}
          <Row
            label={
              isNet
                ? "Net after expenses (what we're splitting)"
                : "Gross share basis (what we're splitting)"
            }
            value={formatMoney(basisValue)}
            note={
              isNet
                ? "Gross box office minus fees and capped expenses - the number we use for the artist's percentage."
                : "Gross box office after any agreed fees - used for the artist's percentage."
            }
          />
          <div className="pt-3" />
          <Row
            label="Guarantee floor"
            value={formatMoney(breakdown.guaranteeBranchAmount)}
            note={
              breakdown.guaranteeBranchAmount > 0
                ? "The minimum the artist is guaranteed, even on a soft night."
                : "No guarantee for this deal."
            }
          />
          <Row
            label={`% of ${isNet ? "net" : "gross"} share`}
            value={formatMoney(breakdown.percentageBranchAmount)}
            note={
              isNet
                ? "The artist's share if we use the percentage on net after expenses."
                : "The artist's share if we use the percentage on gross after fees."
            }
          />
          <Row
            label="Tonight, the better deal wins"
            value={
              breakdown.winningBranch === "percentage"
                ? "Percentage"
                : "Guarantee"
            }
            note="We pay whichever is higher so the artist gets the better of the two."
          />
          <div className="pt-3" />
          <div className="flex items-baseline justify-between py-3 font-semibold">
            <span className="text-[13px] text-ink-900">
              What we're paying the artist
            </span>
            <span className="text-[18px] font-mono tabular text-ink-900">
              {formatMoney(breakdown.finalPayoutToArtist)}
            </span>
          </div>
          <div className="pb-1 text-[11.5px] text-ink-500 leading-snug">
            This is the final number both sides are signing off on tonight.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function expenseCapNote(breakdown: VsSettlementBreakdown): string {
  if (breakdown.variant === "vs_gross") {
    return "No promoter expense deduction applies here because this deal is based on gross.";
  }
  if (breakdown.expenseCap == null) {
    return "Show expenses that count before we calculate artist share.";
  }
  return "Show expenses that count against the agreed expense cap.";
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function Row({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between py-2.5 gap-4">
      <div>
        <div className="text-[13px] text-ink-600">{label}</div>
        {note && (
          <div className="text-[11.5px] text-ink-400 mt-0.5 max-w-md leading-snug">
            {note}
          </div>
        )}
      </div>
      <div className="text-[13.5px] text-ink-900 font-mono tabular text-right">
        {value}
      </div>
    </div>
  );
}
