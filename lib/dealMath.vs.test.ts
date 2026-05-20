import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Deal, Expense, TicketSale } from "@/db/schema";
import { calculateSettlement, calculateVsGross, calculateVsNet } from "./dealMath";

function expense(amount: number, absorbedByVenue = false): Expense {
  return {
    id: `expense_${amount}_${absorbedByVenue ? "absorbed" : "passed"}`,
    showId: "show_test",
    category: "production",
    amount,
    description: null,
    approved: true,
    absorbedByVenue,
    enteredByUserId: null,
    enteredAt: new Date("2026-05-19T12:00:00Z"),
  };
}

function assertMoney(actual: number | null, expected: number) {
  assert.equal(Math.round((actual ?? 0) * 100), Math.round(expected * 100));
}

function deal(overrides: Partial<Deal>): Deal {
  return {
    id: "deal_test",
    showId: "show_test",
    dealType: "vs",
    guaranteeAmount: 5_000,
    percentage: 0.8,
    percentageBasis: "net",
    expenseCap: 2_500,
    hospitalityCap: null,
    bonusesJson: null,
    dealNotesFreetext: null,
    createdAt: new Date("2026-05-19T12:00:00Z"),
    ...overrides,
  };
}

function ticketSale(gross: number, fees: number, qty = 500): TicketSale {
  return {
    id: `ticket_${gross}_${fees}`,
    showId: "show_test",
    qty,
    gross,
    fees,
    capturedAt: new Date("2026-05-19T12:00:00Z"),
  };
}

describe("Vs settlement math", () => {
  it("calculates vs_net when expenses are below cap and percentage beats guarantee", () => {
    const breakdown = calculateVsNet({
      grossBoxOffice: 20_000,
      feesTotal: 2_000,
      expenses: [expense(1_200), expense(800)],
      expenseCap: 2_500,
      guaranteeAmount: 5_000,
      percentage: 0.8,
    });

    assert.equal(breakdown.variant, "vs_net");
    assertMoney(breakdown.eligibleExpensesCapped, 2_000);
    assertMoney(breakdown.overCapAbsorbedByVenue, 0);
    assertMoney(breakdown.netBasis, 16_000);
    assertMoney(breakdown.percentageBranchAmount, 12_800);
    assertMoney(breakdown.guaranteeBranchAmount, 5_000);
    assert.equal(breakdown.winningBranch, "percentage");
    assertMoney(breakdown.finalPayoutToArtist, 12_800);
    assert.deepEqual(breakdown.flags, []);
  });

  it("calculates vs_net with an expense cap and absorbs over-cap expenses", () => {
    const breakdown = calculateVsNet({
      grossBoxOffice: 19_840,
      feesTotal: 1_984,
      expenses: [expense(1_500), expense(1_200), expense(300)],
      expenseCap: 2_500,
      guaranteeAmount: 5_000,
      percentage: 0.8,
    });

    assertMoney(breakdown.eligibleExpensesCapped, 2_500);
    assertMoney(breakdown.overCapAbsorbedByVenue, 500);
    assertMoney(breakdown.netBasis, 15_356);
    assertMoney(breakdown.percentageBranchAmount, 12_284.8);
    assert.equal(breakdown.winningBranch, "percentage");
    assertMoney(breakdown.finalPayoutToArtist, 12_284.8);
  });

  it("calculates vs_net with outside-cap recoups reducing basis separately", () => {
    const breakdown = calculateVsNet({
      grossBoxOffice: 19_840,
      feesTotal: 1_984,
      expenses: [expense(1_500), expense(1_200)],
      expenseCap: 2_500,
      guaranteeAmount: 5_000,
      percentage: 0.8,
      outsideCapRecoupsTotal: 900,
    });

    assertMoney(breakdown.eligibleExpensesCapped, 2_500);
    assertMoney(breakdown.outsideCapRecoupsTotal, 900);
    assertMoney(breakdown.netBasis, 14_456);
    assertMoney(breakdown.percentageBranchAmount, 11_564.8);
    assert.equal(breakdown.winningBranch, "percentage");
    assertMoney(breakdown.finalPayoutToArtist, 11_564.8);
  });

  it("flags vs_net when recoups exist but placement is unknown", () => {
    const breakdown = calculateVsNet({
      grossBoxOffice: 19_840,
      feesTotal: 1_984,
      expenses: [expense(1_500), expense(1_000)],
      expenseCap: 2_500,
      guaranteeAmount: 5_000,
      percentage: 0.8,
      recoupsTotal: 900,
      recoupPlacementHint: "unknown",
    });

    assertMoney(breakdown.netBasis, 15_356);
    assert.deepEqual(breakdown.flags, [
      "Recoup placement ambiguous - confirm whether it is inside or outside the expense cap before finalizing settlement.",
    ]);
  });

  it("supports standard percentage_of_net deals as a net waterfall with no guarantee", () => {
    const result = calculateSettlement({
      deal: deal({
        dealType: "percentage_of_net",
        guaranteeAmount: null,
        percentage: 0.9,
        percentageBasis: "net",
        expenseCap: 600,
      }),
      ticketSales: [ticketSale(2_714, 271)],
      expenses: [expense(1_200), expense(680)],
    });

    assert.equal(result.supported, true);
    assert.equal(result.vsBreakdown?.variant, "vs_net");
    assertMoney(result.vsBreakdown?.guaranteeAmount ?? null, 0);
    assertMoney(result.vsBreakdown?.eligibleExpensesCapped ?? null, 600);
    assertMoney(result.vsBreakdown?.overCapAbsorbedByVenue ?? null, 1_280);
    assertMoney(result.vsBreakdown?.netBasis ?? null, 1_843);
    assertMoney(result.vsBreakdown?.finalPayoutToArtist ?? null, 1_658.7);
  });

  it("returns unsupported for vs deals with walkout signals in deal notes", () => {
    const result = calculateSettlement({
      deal: deal({
        dealNotesFreetext:
          "$5,000 vs 80% net + walkout pot. After breakeven, all incremental gross goes to artist.",
      }),
      ticketSales: [ticketSale(20_000, 2_000)],
      expenses: [expense(1_200)],
    });

    assert.equal(result.supported, false);
    assert.match(result.reason, /unsupported_exotic_structure/);
  });

  it("returns unsupported for vs deals with tier ratchet bonuses", () => {
    const result = calculateSettlement({
      deal: deal({
        bonusesJson: JSON.stringify([
          {
            type: "tier_ratchet",
            label: "Ratchet: 80% to 90% over 80% sold",
            tiers: [
              { from: 0, to: 0.8, percentage: 0.8 },
              { from: 0.8, to: null, percentage: 0.9 },
            ],
          },
        ]),
      }),
      ticketSales: [ticketSale(20_000, 2_000)],
      expenses: [expense(1_200)],
    });

    assert.equal(result.supported, false);
    assert.match(result.reason, /unsupported_exotic_structure/);
  });

  it("returns unsupported for vs deals with breakeven or escalator language", () => {
    const result = calculateSettlement({
      deal: deal({
        dealNotesFreetext:
          "$5,000 guarantee vs 80% net at base, escalator after break even.",
      }),
      ticketSales: [ticketSale(20_000, 2_000)],
      expenses: [expense(1_200)],
    });

    assert.equal(result.supported, false);
    assert.match(result.reason, /unsupported_exotic_structure/);
  });

  it("returns unsupported when a vs deal is missing structured terms", () => {
    const result = calculateSettlement({
      deal: deal({ percentage: null }),
      ticketSales: [ticketSale(20_000, 2_000)],
      expenses: [expense(1_200)],
    });

    assert.equal(result.supported, false);
    assert.match(result.reason, /missing a guarantee amount or percentage/);
  });

  it("calculates vs_gross when guarantee branch wins", () => {
    const breakdown = calculateVsGross({
      grossBoxOffice: 8_000,
      guaranteeAmount: 7_500,
      percentage: 0.85,
    });

    assert.equal(breakdown.variant, "vs_gross");
    assertMoney(breakdown.grossBasis, 8_000);
    assert.equal(breakdown.netBasis, null);
    assertMoney(breakdown.percentageBranchAmount, 6_800);
    assertMoney(breakdown.guaranteeBranchAmount, 7_500);
    assert.equal(breakdown.winningBranch, "guarantee");
    assertMoney(breakdown.finalPayoutToArtist, 7_500);
  });

  it("calculates vs_gross when percentage branch wins", () => {
    const breakdown = calculateVsGross({
      grossBoxOffice: 18_012,
      guaranteeAmount: 6_583,
      percentage: 0.85,
    });

    assertMoney(breakdown.grossBasis, 18_012);
    assertMoney(breakdown.percentageBranchAmount, 15_310.2);
    assertMoney(breakdown.guaranteeBranchAmount, 6_583);
    assert.equal(breakdown.winningBranch, "percentage");
    assertMoney(breakdown.finalPayoutToArtist, 15_310.2);
  });
});
