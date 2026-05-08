import Link from "next/link";
import {
  Calendar,
  Users,
  BarChart3,
  BookOpen,
  Lightbulb,
} from "lucide-react";
import { Logomark } from "@/components/brand/logo";

const navItems = [
  { href: "/shows", label: "Shows", icon: Calendar },
  { href: "/artists", label: "Artists", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-ink-200 bg-canvas-soft flex flex-col relative z-10">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-ink-200">
        <Link href="/shows" className="flex items-center gap-2.5">
          <Logomark size={32} />
          <div>
            <div className="font-semibold text-ink-900 tracking-tight leading-none">
              Greenroom
            </div>
            <div className="text-[10.5px] text-ink-500 mt-1 leading-none uppercase tracking-wider">
              v3.4 · The Crescent
            </div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] text-ink-700 hover:bg-white hover:text-ink-900 hover:shadow-sm transition-all"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Candidate context */}
      <div className="mx-3 mb-3 rounded-lg border border-brand-200 bg-gradient-to-br from-brand-50 to-canvas-soft p-3.5">
        <div className="flex items-start gap-2">
          <Lightbulb className="h-3.5 w-3.5 text-brand-700 mt-0.5 shrink-0" />
          <div>
            <div className="text-[10.5px] font-semibold text-brand-800 uppercase tracking-wider">
              Case study mode
            </div>
            <p className="text-[11.5px] text-ink-700 leading-snug mt-1">
              You&apos;re viewing a deliberately mediocre product. Read your
              brief and the materials in{" "}
              <code className="font-mono text-[10.5px] bg-white px-1 py-0.5 rounded ring-1 ring-ink-200">
                /data
              </code>
              .
            </p>
            <Link
              href="/context"
              className="inline-flex items-center gap-1 mt-2 text-[11.5px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
            >
              <BookOpen className="h-3 w-3" />
              Where to start
            </Link>
          </div>
        </div>
      </div>

      {/* Logged-in user */}
      <div className="px-5 py-3.5 border-t border-ink-200 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-ink-700 to-ink-900 flex items-center justify-center text-white text-xs font-medium shadow-sm">
          MR
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink-900 leading-tight truncate">
            Mariana Reyes
          </div>
          <div className="text-[11px] text-ink-500 leading-tight">
            Lead Booker
          </div>
        </div>
      </div>
    </aside>
  );
}
