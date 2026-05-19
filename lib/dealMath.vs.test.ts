import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Expense } from "@/db/schema";
import { calculateVsGross, calculateVsNet } from "./dealMath";

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
