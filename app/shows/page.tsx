import { getAllShows } from "@/lib/queries";
import {
  formatMoneyCompact,
  formatShowDate,
  formatShowMonth,
  relativeShowDate,
} from "@/lib/format";
import { ShowsToggle } from "./shows-toggle";
import type { ShowRow } from "./shows-toggle";

export default async function ShowsPage() {
  const rows = await getAllShows();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const upcoming = rows.filter((r) => new Date(r.show.date) >= tomorrow);
  const past = rows
    .filter((r) => new Date(r.show.date) < tomorrow)
    .reverse();

  const settledCount = past.filter((r) => r.settlement).length;
  const totalToArtists = past.reduce(
    (sum, r) => sum + (r.settlement?.totalToArtist ?? 0),
    0,
  );
  const disputedCount = past.filter(
    (r) => r.settlement?.status === "disputed",
  ).length;

  const serializeRows = (list: typeof rows): ShowRow[] =>
    list.map(({ show, artist, deal, settlement }) => ({
      show: {
        id: show.id,
        status: show.status as
          | "booked"
          | "advanced"
          | "day_of"
          | "settled"
          | "closed",
      },
      artist: artist ? { name: artist.name } : null,
      deal: deal
        ? {
            dealType: deal.dealType,
            guaranteeFormatted:
              deal.guaranteeAmount != null
                ? formatMoneyCompact(deal.guaranteeAmount)
                : null,
          }
        : null,
      settlement: settlement
        ? {
            totalFormatted:
              settlement.totalToArtist != null
                ? formatMoneyCompact(settlement.totalToArtist)
                : null,
            status: settlement.status,
          }
        : null,
      dateFormatted: formatShowDate(show.date),
      dateRelative: relativeShowDate(show.date),
      month: formatShowMonth(show.date),
    }));

  return (
    <div className="px-12 py-10 max-w-7xl">
      {/* Hero */}
      <div className="mb-14">
        <div className="eyebrow mb-3">
          The Crescent · Nashville · 650 cap
        </div>
        <h1
          className="font-display text-[52px] font-medium text-ink-900 leading-[1.02]"
          style={{ letterSpacing: "-0.025em", fontOpticalSizing: "auto" }}
        >
          Shows
        </h1>
        <p className="text-[14px] text-ink-500 mt-3 max-w-lg leading-relaxed">
          Mariana&apos;s home view. {past.length} completed, {upcoming.length} upcoming
          {disputedCount > 0 && (
            <>, <span className="text-rose-700">{disputedCount} disputed</span></>
          )}
          .
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-px bg-ink-200/40 rounded-xl overflow-hidden mb-14">
        <StatCard label="Upcoming" value={String(upcoming.length)} />
        <StatCard label="Completed" value={String(past.length)} />
        <StatCard label="Settled" value={String(settledCount)} accent />
        <StatCard
          label="Paid to artists"
          value={formatMoneyCompact(totalToArtists)}
          mono
        />
      </div>

      {/* Show list */}
      <ShowsToggle
        upcoming={serializeRows(upcoming)}
        past={serializeRows(past)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  mono = false,
  accent = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="bg-white px-6 py-5">
      <div
        className={`text-[32px] font-medium leading-none ${
          accent ? "text-brand-700" : "text-ink-900"
        } ${mono ? "font-mono tabular !font-semibold" : "font-display"}`}
        style={!mono ? { letterSpacing: "-0.02em" } : undefined}
      >
        {value}
      </div>
      <div className="text-[11px] font-medium text-ink-400 uppercase tracking-[0.08em] mt-2">
        {label}
      </div>
    </div>
  );
}
