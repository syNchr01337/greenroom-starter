/**
 * Deal calculation logic for the in-app settlement tool.
 *
 * IMPORTANT — DELIBERATELY INCOMPLETE.
 *
 * This is the existing Greenroom settlement engine. It was built early in
 * the company's life, when most deals were flat guarantees. It currently
 * handles two deal types end-to-end:
 *
 *   1. flat                 — $X guaranteed, optional sellout bonus
 *   2. percentage_of_gross  — X% of gross, no expense deductions, optional sellout bonus
 *
 * For both, it reads `bonusesJson` and applies bonuses where it can — but
 * only the structured ones. Bonuses that exist only in `dealNotesFreetext`
 * are invisible to this engine.
 *
 * It does NOT handle:
 *
 *   - vs deals (guarantee vs % of net, whichever greater)
 *   - percentage_of_net deals (with expense deductions)
 *   - door deals
 *   - recoups (those flow separately through the settlement record)
 *   - tier ratchets (would need vs-deal support first)
 *   - comps that count toward gross
 *
 * For unsupported deals, the tool returns { supported: false } and the UI
 * shows the "this deal type isn't yet supported" empty state. About 82% of
 * Greenroom's customers default to spreadsheets because of this.
 */

import type { Deal, Expense, TicketSale, Bonus, Recoup } from "@/db/schema";

export type VsSettlementVariant = "vs_net" | "vs_gross";
export type VsWinningBranch = "guarantee" | "percentage";
export type RecoupPlacementHint = "inside_cap" | "outside_cap" | "unknown";

export interface VsSettlementBreakdown {
  variant: VsSettlementVariant;
  grossBoxOffice: number;
  feesTotal: number;
  eligibleExpensesCapped: number;
  expenseCap: number | null;
  overCapAbsorbedByVenue: number;
  outsideCapRecoupsTotal: number;
  recoupsTotal: number;
  recoupPlacementHint: RecoupPlacementHint;
  netBasis: number | null;
  grossBasis: number | null;
  guaranteeAmount: number;
  percentage: number;
  percentageBranchAmount: number;
  guaranteeBranchAmount: number;
  winningBranch: VsWinningBranch;
  finalPayoutToArtist: number;
  flags: string[];
}

export type SettlementCalculation =
  | {
      supported: true;
      grossBoxOffice: number;
      netBoxOffice: number;
      totalExpenses: number;
      totalToArtist: number;
      steps: { label: string; value: number; note?: string }[];
      finalFormula: string;
      vsBreakdown?: VsSettlementBreakdown;
      // Bonuses that were applied. Empty array if no bonuses on the deal,
      // or if no bonuses triggered.
      bonusesApplied: { label: string; amount: number; reason: string }[];
      // Bonuses that exist on the deal but didn't trigger (helpful context).
      bonusesNotTriggered: { label: string; amount: number; reason: string }[];
    }
  | {
      supported: false;
      reason: string;
      dealType: Deal["dealType"];
    };

interface CalcInput {
  deal: Deal;
  ticketSales: TicketSale[];
  expenses: Expense[];
  recoups?: Recoup[];
  recoupPlacementHint?: RecoupPlacementHint;
  // Capacity is needed to evaluate sellout bonuses. Optional — if omitted,
  // sellout bonuses are reported as "can't determine".
  venueCapacity?: number;
  ticketsSold?: number;
}

interface CalculateVsNetInput {
  grossBoxOffice: number;
  feesTotal: number;
  expenses: Expense[];
  expenseCap: number | null;
  guaranteeAmount: number;
  percentage: number;
  outsideCapRecoupsTotal?: number;
  recoupsTotal?: number;
  recoupPlacementHint?: RecoupPlacementHint;
}

interface CalculateVsGrossInput {
  grossBoxOffice: number;
  guaranteeAmount: number;
  percentage: number;
  recoupsTotal?: number;
  recoupPlacementHint?: RecoupPlacementHint;
}

export function parseBonuses(deal: Deal): Bonus[] {
  if (!deal.bonusesJson) return [];
  try {
    const parsed = JSON.parse(deal.bonusesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function calculateSettlement(input: CalcInput): SettlementCalculation {
  const { deal, ticketSales, expenses, venueCapacity, ticketsSold } = input;
  const bonuses = parseBonuses(deal);
  const recoupsTotal = (input.recoups ?? [])
    .filter((r) => r.status !== "withdrawn")
    .reduce((sum, r) => sum + r.amount, 0);
  const recoupPlacementHint = input.recoupPlacementHint ?? "unknown";

  const grossBoxOffice = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  const totalFees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  const netBoxOffice = grossBoxOffice - totalFees;
  const totalExpenses = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);

  const tickets =
    ticketsSold ?? ticketSales.reduce((sum, t) => sum + (t.qty ?? 0), 0);

  // ---------- flat guarantee ----------
  if (deal.dealType === "flat") {
    if (deal.guaranteeAmount == null) {
      return {
        supported: false,
        reason: "Flat deal is missing a guarantee amount.",
        dealType: deal.dealType,
      };
    }
    const bonusResult = applyBonuses(bonuses, {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: deal.guaranteeAmount + bonusResult.totalApplied,
      steps: [
        {
          label: "Flat guarantee",
          value: deal.guaranteeAmount,
          note: "No expense deductions. The guarantee is the floor.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `flat ${deal.guaranteeAmount} + bonuses ${bonusResult.totalApplied} = ${(deal.guaranteeAmount + bonusResult.totalApplied).toFixed(2)}`
        : `flat guarantee = ${deal.guaranteeAmount}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- percentage of gross ----------
  if (deal.dealType === "percentage_of_gross") {
    if (deal.percentage == null) {
      return {
        supported: false,
        reason: "Percentage-of-gross deal is missing a percentage.",
        dealType: deal.dealType,
      };
    }
    const payout = grossBoxOffice * deal.percentage;
    const bonusResult = applyBonuses(bonuses, {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: payout + bonusResult.totalApplied,
      steps: [
        { label: "Gross box office", value: grossBoxOffice },
        {
          label: `× ${(deal.percentage * 100).toFixed(0)}%`,
          value: payout,
          note: "Percentage of gross — no expense deductions.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `gross × ${deal.percentage} + bonuses = ${(payout + bonusResult.totalApplied).toFixed(2)}`
        : `gross × ${deal.percentage} = ${payout.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- percentage of net ----------
  if (deal.dealType === "percentage_of_net") {
    if (hasUnsupportedExoticStructure(deal, bonuses)) {
      return unsupportedExoticStructure(deal);
    }

    if (deal.percentage == null) {
      return {
        supported: false,
        reason: "Percentage-of-net deal is missing a percentage.",
        dealType: deal.dealType,
      };
    }

    const bonusResult = applyBonuses(bonuses, {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });
    const guaranteeAmount = deal.guaranteeAmount ?? 0;
    const breakdown = calculateVsNet({
      grossBoxOffice,
      feesTotal: totalFees,
      expenses,
      expenseCap: deal.expenseCap,
      guaranteeAmount,
      percentage: deal.percentage,
      recoupsTotal,
      recoupPlacementHint,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: breakdown.finalPayoutToArtist + bonusResult.totalApplied,
      steps: [
        { label: "Gross box office", value: breakdown.grossBoxOffice },
        {
          label: "Less fees",
          value: -breakdown.feesTotal,
          note: "Fees are removed before calculating the net basis.",
        },
        {
          label: "Less eligible expenses",
          value: -breakdown.eligibleExpensesCapped,
          note:
            breakdown.expenseCap == null
              ? "No expense cap was entered for this percentage-of-net deal."
              : `Expenses capped at ${breakdown.expenseCap.toFixed(2)}; ${breakdown.overCapAbsorbedByVenue.toFixed(2)} absorbed by venue.`,
        },
        {
          label: "Net basis",
          value: breakdown.netBasis ?? 0,
          note: "The percentage branch is calculated from this basis.",
        },
        {
          label: `${(deal.percentage * 100).toFixed(0)}% of net`,
          value: breakdown.percentageBranchAmount,
          note: "No guarantee was entered, so the percentage branch sets the payout.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: `net ${(breakdown.netBasis ?? 0).toFixed(2)} × ${deal.percentage} = ${breakdown.finalPayoutToArtist.toFixed(2)}`,
      vsBreakdown: breakdown,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- vs deal ----------
  if (deal.dealType === "vs") {
    if (hasUnsupportedExoticStructure(deal, bonuses)) {
      return unsupportedExoticStructure(deal);
    }

    if (deal.guaranteeAmount == null || deal.percentage == null) {
      return {
        supported: false,
        reason: "Vs deal is missing a guarantee amount or percentage.",
        dealType: deal.dealType,
      };
    }

    const bonusResult = applyBonuses(bonuses, {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    if (deal.percentageBasis === "gross") {
      const breakdown = calculateVsGross({
        grossBoxOffice,
        guaranteeAmount: deal.guaranteeAmount,
        percentage: deal.percentage,
        recoupsTotal,
        recoupPlacementHint,
      });

      return {
        supported: true,
        grossBoxOffice,
        netBoxOffice,
        totalExpenses,
        totalToArtist: breakdown.finalPayoutToArtist + bonusResult.totalApplied,
        steps: [
          {
            label: "Gross box office",
            value: breakdown.grossBasis ?? grossBoxOffice,
            note: "Vs gross deal — no expense deductions before the percentage branch.",
          },
          {
            label: "Guarantee branch",
            value: breakdown.guaranteeBranchAmount,
            note: "The guaranteed floor for the artist.",
          },
          {
            label: `${(deal.percentage * 100).toFixed(0)}% of gross branch`,
            value: breakdown.percentageBranchAmount,
            note: "The percentage branch is compared against the guarantee.",
          },
          {
            label:
              breakdown.winningBranch === "percentage"
                ? "Percentage branch wins"
                : "Guarantee branch wins",
            value: breakdown.finalPayoutToArtist,
            note: "Greenroom pays the greater of the two branches.",
          },
          ...bonusResult.applied.map((b) => ({
            label: b.label,
            value: b.amount,
            note: b.reason,
          })),
        ],
        finalFormula: `max(${deal.guaranteeAmount}, gross ${grossBoxOffice.toFixed(2)} × ${deal.percentage}) = ${breakdown.finalPayoutToArtist.toFixed(2)}`,
        vsBreakdown: breakdown,
        bonusesApplied: bonusResult.applied,
        bonusesNotTriggered: bonusResult.notTriggered,
      };
    }

    if (deal.percentageBasis === "net") {
      const breakdown = calculateVsNet({
        grossBoxOffice,
        feesTotal: totalFees,
        expenses,
        expenseCap: deal.expenseCap,
        guaranteeAmount: deal.guaranteeAmount,
        percentage: deal.percentage,
        recoupsTotal,
        recoupPlacementHint,
      });

      return {
        supported: true,
        grossBoxOffice,
        netBoxOffice,
        totalExpenses,
        totalToArtist: breakdown.finalPayoutToArtist + bonusResult.totalApplied,
        steps: [
          { label: "Gross box office", value: breakdown.grossBoxOffice },
          {
            label: "Less fees",
            value: -breakdown.feesTotal,
            note: "Fees are removed before calculating the net basis.",
          },
          {
            label: "Less eligible expenses",
            value: -breakdown.eligibleExpensesCapped,
            note:
              breakdown.expenseCap == null
                ? "No expense cap was entered for this Vs net deal."
                : `Expenses capped at ${breakdown.expenseCap.toFixed(2)}; ${breakdown.overCapAbsorbedByVenue.toFixed(2)} absorbed by venue.`,
          },
          {
            label: "Net basis",
            value: breakdown.netBasis ?? 0,
            note: "The percentage branch is calculated from this basis.",
          },
          {
            label: "Guarantee branch",
            value: breakdown.guaranteeBranchAmount,
            note: "The guaranteed floor for the artist.",
          },
          {
            label: `${(deal.percentage * 100).toFixed(0)}% of net branch`,
            value: breakdown.percentageBranchAmount,
            note: "The percentage branch is compared against the guarantee.",
          },
          {
            label:
              breakdown.winningBranch === "percentage"
                ? "Percentage branch wins"
                : "Guarantee branch wins",
            value: breakdown.finalPayoutToArtist,
            note: "Greenroom pays the greater of the two branches.",
          },
          ...bonusResult.applied.map((b) => ({
            label: b.label,
            value: b.amount,
            note: b.reason,
          })),
        ],
        finalFormula: `max(${deal.guaranteeAmount}, net ${(breakdown.netBasis ?? 0).toFixed(2)} × ${deal.percentage}) = ${breakdown.finalPayoutToArtist.toFixed(2)}`,
        vsBreakdown: breakdown,
        bonusesApplied: bonusResult.applied,
        bonusesNotTriggered: bonusResult.notTriggered,
      };
    }

    return {
      supported: false,
      reason: "Vs deal is missing a percentage basis. Expected gross or net.",
      dealType: deal.dealType,
    };
  }

  // ---------- everything else: not supported ----------
  const friendlyName: Record<Deal["dealType"], string> = {
    flat: "Flat guarantee",
    percentage_of_gross: "Percentage of gross",
    percentage_of_net: "Percentage of net",
    vs: "Vs deal (guarantee vs %)",
    door: "Door deal",
  };

  return {
    supported: false,
    dealType: deal.dealType,
    reason:
      `${friendlyName[deal.dealType]} deals aren't supported in the in-app tool yet. ` +
      `Power users at venues like The Crescent default to spreadsheets for these.`,
  };
}

function unsupportedExoticStructure(deal: Deal): SettlementCalculation {
  return {
    supported: false,
    reason:
      "unsupported_exotic_structure: walkout pots, ratchets, breakeven structures, and escalators require manual settlement.",
    dealType: deal.dealType,
  };
}

function hasUnsupportedExoticStructure(deal: Deal, bonuses: Bonus[]): boolean {
  if (bonuses.some((bonus) => bonus.type === "tier_ratchet")) {
    return true;
  }

  const textToInspect = [
    deal.dealNotesFreetext ?? "",
    ...bonuses.map((bonus) => bonus.label),
  ]
    .join(" ")
    .toLowerCase();

  return /\b(walkout|walk out|ratchet|escalator|breakeven|break even|walkout pot|pot deal)\b/.test(
    textToInspect,
  );
}

export function calculateVsNet({
  grossBoxOffice,
  feesTotal,
  expenses,
  expenseCap,
  guaranteeAmount,
  percentage,
  outsideCapRecoupsTotal = 0,
  recoupsTotal = outsideCapRecoupsTotal,
  recoupPlacementHint = outsideCapRecoupsTotal > 0 ? "outside_cap" : "unknown",
}: CalculateVsNetInput): VsSettlementBreakdown {
  const eligibleExpensesRaw = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);
  const eligibleExpensesCapped =
    expenseCap == null
      ? eligibleExpensesRaw
      : Math.min(eligibleExpensesRaw, expenseCap);
  const overCapAbsorbedByVenue =
    expenseCap == null ? 0 : Math.max(eligibleExpensesRaw - expenseCap, 0);
  const netBasis =
    grossBoxOffice - feesTotal - eligibleExpensesCapped - outsideCapRecoupsTotal;
  const percentageBranchAmount = netBasis * percentage;
  const guaranteeBranchAmount = guaranteeAmount;
  const winningBranch =
    percentageBranchAmount >= guaranteeBranchAmount ? "percentage" : "guarantee";
  const finalPayoutToArtist = Math.max(
    guaranteeBranchAmount,
    percentageBranchAmount,
  );
  const flags = settlementFlags({ recoupsTotal, recoupPlacementHint });

  return {
    variant: "vs_net",
    grossBoxOffice,
    feesTotal,
    eligibleExpensesCapped,
    expenseCap,
    overCapAbsorbedByVenue,
    outsideCapRecoupsTotal,
    recoupsTotal,
    recoupPlacementHint,
    netBasis,
    grossBasis: null,
    guaranteeAmount,
    percentage,
    percentageBranchAmount,
    guaranteeBranchAmount,
    winningBranch,
    finalPayoutToArtist,
    flags,
  };
}

export function calculateVsGross({
  grossBoxOffice,
  guaranteeAmount,
  percentage,
  recoupsTotal = 0,
  recoupPlacementHint = "unknown",
}: CalculateVsGrossInput): VsSettlementBreakdown {
  const grossBasis = grossBoxOffice;
  const percentageBranchAmount = grossBasis * percentage;
  const guaranteeBranchAmount = guaranteeAmount;
  const winningBranch =
    percentageBranchAmount >= guaranteeBranchAmount ? "percentage" : "guarantee";
  const finalPayoutToArtist = Math.max(
    guaranteeBranchAmount,
    percentageBranchAmount,
  );

  return {
    variant: "vs_gross",
    grossBoxOffice,
    feesTotal: 0,
    eligibleExpensesCapped: 0,
    expenseCap: null,
    overCapAbsorbedByVenue: 0,
    outsideCapRecoupsTotal: 0,
    recoupsTotal,
    recoupPlacementHint,
    netBasis: null,
    grossBasis,
    guaranteeAmount,
    percentage,
    percentageBranchAmount,
    guaranteeBranchAmount,
    winningBranch,
    finalPayoutToArtist,
    flags: settlementFlags({ recoupsTotal, recoupPlacementHint }),
  };
}

function settlementFlags({
  recoupsTotal,
  recoupPlacementHint,
}: {
  recoupsTotal: number;
  recoupPlacementHint: RecoupPlacementHint;
}): string[] {
  if (recoupsTotal > 0 && recoupPlacementHint === "unknown") {
    return [
      "Recoup placement ambiguous - confirm whether it is inside or outside the expense cap before finalizing settlement.",
    ];
  }
  return [];
}

/** Evaluate a list of bonuses against the show's actual numbers. */
function applyBonuses(
  bonuses: Bonus[],
  ctx: { gross: number; tickets: number; capacity?: number },
) {
  const applied: { label: string; amount: number; reason: string }[] = [];
  const notTriggered: { label: string; amount: number; reason: string }[] = [];

  for (const b of bonuses) {
    if (b.type === "gross_threshold") {
      if (ctx.gross >= b.threshold) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `Gross ${ctx.gross.toLocaleString()} ≥ ${b.threshold.toLocaleString()}`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason: `Gross ${ctx.gross.toLocaleString()} < ${b.threshold.toLocaleString()}`,
        });
      }
    } else if (b.type === "sellout") {
      if (ctx.capacity != null && ctx.tickets >= ctx.capacity * 0.95) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} of ${ctx.capacity} sold`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason:
            ctx.capacity != null
              ? `${ctx.tickets} of ${ctx.capacity} sold (sellout = ≥95%)`
              : `Capacity unknown — can't evaluate`,
        });
      }
    } else if (b.type === "attendance_threshold") {
      if (ctx.tickets >= b.threshold) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} ≥ ${b.threshold}`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} < ${b.threshold}`,
        });
      }
    } else if (b.type === "tier_ratchet") {
      // Tier ratchets fundamentally change the percentage structure. The
      // current engine only supports flat % of gross — we can't apply a
      // ratcheting structure on top of it without knowing which deal type
      // it's modifying. Report as not-applicable.
      notTriggered.push({
        label: b.label,
        amount: 0,
        reason: "Tier ratchets need vs-deal or % of net support — not yet handled",
      });
    }
  }

  return {
    applied,
    notTriggered,
    totalApplied: applied.reduce((s, b) => s + b.amount, 0),
  };
}
