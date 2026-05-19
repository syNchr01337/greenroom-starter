import type { RecoupPlacementHint, VsSettlementVariant } from "@/lib/dealMath";

export type SuggestedDealVariant =
  | VsSettlementVariant
  | "percentage_of_net"
  | "unknown";

export interface DealNotesAiRequest {
  dealNotesFreetext?: string | null;
  dealType?: string | null;
  guaranteeAmount?: number | null;
  percentage?: number | null;
  expenseCap?: number | null;
}

export interface DealNotesAiResponse {
  suggestedVariant: SuggestedDealVariant;
  suggestedGuarantee: number | null;
  suggestedPercentage: number | null;
  suggestedExpenseCap: number | null;
  suggestedRecoupPlacement: RecoupPlacementHint;
  ambiguities: string[];
}

export function interpretDealNotesMock(
  input: DealNotesAiRequest,
): DealNotesAiResponse {
  const notes = input.dealNotesFreetext?.trim() ?? "";
  if (!notes) {
    return emptyInterpretation();
  }

  const lower = notes.toLowerCase();
  const suggestedPercentage = parsePercentage(notes) ?? input.percentage ?? null;
  const suggestedExpenseCap = parseExpenseCap(notes) ?? input.expenseCap ?? null;
  const noGuarantee = /\bno guarantee\b/i.test(notes);
  const suggestedGuarantee = noGuarantee
    ? null
    : parseGuarantee(notes) ?? input.guaranteeAmount ?? null;
  const suggestedVariant = inferVariant(lower, noGuarantee);
  const suggestedRecoupPlacement = inferRecoupPlacement(lower);
  const ambiguities = inferAmbiguities({
    lower,
    suggestedExpenseCap,
    suggestedRecoupPlacement,
  });

  return {
    suggestedVariant,
    suggestedGuarantee,
    suggestedPercentage,
    suggestedExpenseCap,
    suggestedRecoupPlacement,
    ambiguities,
  };
}

function emptyInterpretation(): DealNotesAiResponse {
  return {
    suggestedVariant: "unknown",
    suggestedGuarantee: null,
    suggestedPercentage: null,
    suggestedExpenseCap: null,
    suggestedRecoupPlacement: "unknown",
    ambiguities: [],
  };
}

function parseMoney(raw: string): number | null {
  const value = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function parsePercentage(notes: string): number | null {
  const match = notes.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) / 100 : null;
}

function parseGuarantee(notes: string): number | null {
  const match =
    notes.match(/\$([\d,]+(?:\.\d+)?)\s*(?:guarantee\s*)?(?:vs|versus)\b/i) ??
    notes.match(/\$([\d,]+(?:\.\d+)?)\s+guarantee\b/i);
  return match ? parseMoney(match[1]) : null;
}

function parseExpenseCap(notes: string): number | null {
  const match =
    notes.match(/expenses?\s+capped(?:\s+at)?\s+\$([\d,]+(?:\.\d+)?)/i) ??
    notes.match(/expense\s+cap\s+\$?([\d,]+(?:\.\d+)?)/i);
  return match ? parseMoney(match[1]) : null;
}

function inferVariant(lower: string, noGuarantee: boolean): SuggestedDealVariant {
  if (lower.includes("gross") && /vs|versus/.test(lower)) {
    return "vs_gross";
  }
  if (lower.includes("net") && noGuarantee) {
    return "percentage_of_net";
  }
  if (lower.includes("net") && /vs|versus/.test(lower)) {
    return "vs_net";
  }
  return "unknown";
}

function inferRecoupPlacement(lower: string): RecoupPlacementHint {
  if (!lower.includes("recoup")) return "unknown";
  if (/(inside|included in|part of).{0,60}(cap|expense cap)/.test(lower)) {
    return "inside_cap";
  }
  if (/(outside|in addition to|separate from).{0,60}(cap|expense cap)/.test(lower)) {
    return "outside_cap";
  }
  return "unknown";
}

function inferAmbiguities({
  lower,
  suggestedExpenseCap,
  suggestedRecoupPlacement,
}: {
  lower: string;
  suggestedExpenseCap: number | null;
  suggestedRecoupPlacement: RecoupPlacementHint;
}): string[] {
  const ambiguities: string[] = [];
  if (lower.includes("recoup") && suggestedRecoupPlacement === "unknown") {
    const capText =
      suggestedExpenseCap == null ? "the expense cap" : `$${suggestedExpenseCap.toLocaleString()} expense cap`;
    ambiguities.push(
      `Marketing recoup is not clearly inside or outside ${capText}. Confirm this before sending the final statement.`,
    );
  }
  if (lower.includes("net") && suggestedExpenseCap == null) {
    ambiguities.push(
      "The notes mention net, but I could not find a clear expense cap. Confirm which expenses are allowed before settling.",
    );
  }
  return ambiguities;
}
