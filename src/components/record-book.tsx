import type {
  AllAmericaYear,
  AnnualRankYear,
  AwardEntry,
  CoachEntry,
  LongRunningEntry,
  MajorsEntry,
  RecordBook,
  RecordGroup,
  RecordSection,
  StatEntry,
  TableEntry,
  TournamentEntry,
} from "@/data/records-types";
import TeamAggregateSection from "@/components/team-aggregate-section";
import SectionJumpSelect from "@/components/section-jump-select";
import { AnimatedNumber } from "@/components/animated-number";

interface Props {
  book: RecordBook;
  extraGroups?: RecordGroup[];
}

function entryCount(s: RecordSection): number {
  switch (s.kind) {
    case "stat":
    case "tournament":
    case "table":
    case "award":
    case "majors":
    case "long-running":
    case "coach":
    case "team-aggregate":
      return s.entries.length;
    case "annual-rank":
      return s.years.reduce(
        (n, y) => n + (y.teams?.length ?? 0) + (y.individuals?.length ?? 0),
        0,
      );
    case "all-america":
      return s.years.reduce(
        (n, y) =>
          n +
          (y.first?.length ?? 0) +
          (y.second?.length ?? 0) +
          (y.third?.length ?? 0) +
          (y.honorable?.length ?? 0),
        0,
      );
  }
}

function collectSchools(section: RecordSection, set: Set<string>): void {
  if (section.kind === "annual-rank" || section.kind === "all-america") return;
  for (const e of section.entries) {
    const school = (e as { school?: string }).school;
    if (school) set.add(school);
  }
}

function computeBookStats(groups: RecordGroup[]): {
  entryCount: number;
  programCount: number;
} {
  let count = 0;
  const schools = new Set<string>();
  for (const g of groups) {
    for (const s of g.sections) {
      count += entryCount(s);
      collectSchools(s, schools);
    }
  }
  return { entryCount: count, programCount: schools.size };
}

const SECTION_ACCENTS: Record<RecordSection["kind"], string> = {
  stat: "border-l-teal-500/70",
  tournament: "border-l-amber-500/70",
  table: "border-l-sky-500/70",
  award: "border-l-rose-500/70",
  "annual-rank": "border-l-violet-500/70",
  "all-america": "border-l-fuchsia-500/70",
  majors: "border-l-purple-500/70",
  "long-running": "border-l-slate-500/70",
  coach: "border-l-orange-500/70",
  "team-aggregate": "border-l-emerald-500/70",
};

function currentClass(isCurrent: boolean | undefined): string {
  return isCurrent ? "font-semibold text-foreground" : "";
}

function StatRow({ e }: { e: StatEntry }) {
  return (
    <div className="grid grid-cols-[48px_1fr_1fr] items-baseline gap-3 py-0.5 rounded px-1 -mx-1 hover:bg-white/[0.03] transition-colors">
      <span className={`font-mono text-[13px] tabular-nums text-right ${currentClass(e.isCurrentPlayer)}`}>
        {e.value}
      </span>
      <span className={`text-[13px] ${currentClass(e.isCurrentPlayer)}`}>
        {e.player ?? e.school}
      </span>
      <span className="text-[12px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
        {e.player ? e.school : ""}
        {e.years ? (e.player ? ` · ${e.years}` : e.years) : ""}
      </span>
    </div>
  );
}

function TournamentRow({ e }: { e: TournamentEntry }) {
  return (
    <div className="py-1 rounded px-1 -mx-1 hover:bg-white/[0.03] transition-colors">
      <div className="grid grid-cols-[96px_1fr] items-baseline gap-3">
        <span className={`font-mono text-[13px] tabular-nums text-right ${currentClass(e.isCurrentPlayer)}`}>
          {e.value}
        </span>
        <span className={`text-[13px] ${currentClass(e.isCurrentPlayer)}`}>
          {e.player ? `${e.player}, ${e.school}` : e.school}
        </span>
      </div>
      <div className="pl-[108px] text-[12px] text-muted-foreground">
        {[e.event, e.round, e.date].filter(Boolean).join(" · ")}
      </div>
    </div>
  );
}

function TableRow({ e }: { e: TableEntry }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_56px_56px_56px] items-baseline gap-3 py-0.5 rounded px-1 -mx-1 hover:bg-white/[0.03] transition-colors">
      <span className={`text-[13px] ${currentClass(e.isCurrentPlayer)}`}>{e.player}</span>
      <span className="text-[12px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
        {e.school}
        {e.years ? ` · ${e.years}` : ""}
      </span>
      <span className="font-mono text-[13px] tabular-nums text-right">{e.rounds}</span>
      <span className="font-mono text-[13px] tabular-nums text-right">{e.strokes.toLocaleString()}</span>
      <span className="font-mono text-[13px] tabular-nums text-right font-semibold">{e.avg.toFixed(2)}</span>
    </div>
  );
}

function AwardRow({ e }: { e: AwardEntry }) {
  return (
    <div className="grid grid-cols-[64px_1fr] items-baseline gap-3 py-0.5 rounded px-1 -mx-1 hover:bg-white/[0.03] transition-colors">
      <span className="font-mono text-[13px] tabular-nums text-right text-muted-foreground">{e.year}</span>
      <span className="text-[13px]">
        {e.winner}
        {e.school ? <span className="text-muted-foreground">, {e.school}</span> : null}
      </span>
    </div>
  );
}

function RankYearBlock({ y }: { y: AnnualRankYear }) {
  const all = [...(y.teams ?? []), ...(y.individuals ?? [])];
  if (all.length === 0) return null;
  return (
    <div>
      <h4 className="label-caps mb-1">{y.year}</h4>
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 text-[12px] font-mono tabular-nums leading-snug">
        {all.map((line, i) => (
          <li key={i} className="text-muted-foreground">
            {line}
          </li>
        ))}
      </ol>
    </div>
  );
}

function AllAmericaYearBlock({ y }: { y: AllAmericaYear }) {
  const blocks: Array<[string, string[] | undefined]> = [
    ["First Team", y.first],
    ["Second Team", y.second],
    ["Third Team", y.third],
    ["Honorable Mention", y.honorable],
  ];
  const has = blocks.some(([, list]) => (list?.length ?? 0) > 0);
  if (!has) return null;
  return (
    <div>
      <h4 className="label-caps mb-1">{y.year}</h4>
      <div className="space-y-2">
        {blocks.map(([label, list]) =>
          list && list.length > 0 ? (
            <div key={label}>
              <div className="text-[11px] font-medium text-foreground/80 uppercase tracking-wide">
                {label}
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 text-[12px] leading-snug">
                {list.map((name, i) => (
                  <li key={i} className="text-muted-foreground">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

function MajorsRow({ e }: { e: MajorsEntry }) {
  return (
    <div className="grid grid-cols-[48px_1fr] items-baseline gap-3 py-1 rounded px-1 -mx-1 hover:bg-white/[0.03] transition-colors">
      <span className="font-mono text-[13px] tabular-nums text-right">{e.count}</span>
      <span className="text-[13px]">
        {e.school}
        <span className="text-muted-foreground"> · {e.players}</span>
      </span>
    </div>
  );
}

function LongRunningRow({ e }: { e: LongRunningEntry }) {
  return (
    <div className="grid grid-cols-[48px_1fr] items-baseline gap-3 py-0.5 rounded px-1 -mx-1 hover:bg-white/[0.03] transition-colors">
      <span className="font-mono text-[13px] tabular-nums text-right">{e.years}</span>
      <span className="text-[13px]">
        {e.event}
        {e.host ? <span className="text-muted-foreground"> · {e.host}</span> : null}
      </span>
    </div>
  );
}

function CoachRow({ e }: { e: CoachEntry }) {
  return (
    <div className="grid grid-cols-[48px_1fr_1fr] items-baseline gap-3 py-0.5 rounded px-1 -mx-1 hover:bg-white/[0.03] transition-colors">
      <span className="font-mono text-[13px] tabular-nums text-right">{e.value}</span>
      <span className="text-[13px]">
        {e.coach}
        {e.school ? <span className="text-muted-foreground">, {e.school}</span> : null}
      </span>
      <span className="text-[12px] text-muted-foreground">
        {e.years ?? ""}
        {e.detail ? ` · ${e.detail}` : ""}
      </span>
    </div>
  );
}

function Section({ s, gender }: { s: RecordSection; gender: "men" | "women" }) {
  const count = entryCount(s);
  const accent = SECTION_ACCENTS[s.kind];
  return (
    <section
      id={s.slug}
      className={`mt-6 rounded-lg border border-border border-l-4 ${accent} bg-card/60 px-4 py-4 sm:px-5 sm:py-5 scroll-mt-24 transition-shadow hover:shadow-overlay`}
    >
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <h3 className="label-caps text-foreground">
          {s.title}
          {"minQualifier" in s && s.minQualifier ? (
            <span className="ml-2 normal-case text-[11px] font-normal text-text-tertiary">
              ({s.minQualifier})
            </span>
          ) : null}
        </h3>
        <span className="shrink-0 rounded-full border border-border/60 bg-background/50 px-2 py-0.5 text-[10px] text-text-tertiary font-mono tabular-nums">
          {count} {count === 1 ? "entry" : "entries"}
        </span>
      </div>
      <div className="space-y-0.5">
        {s.kind === "stat" && s.entries.map((e, i) => <StatRow key={i} e={e} />)}
        {s.kind === "tournament" && s.entries.map((e, i) => <TournamentRow key={i} e={e} />)}
        {s.kind === "table" && (
          <>
            <div className="grid grid-cols-[1fr_1fr_56px_56px_56px] label-caps py-1 border-b border-border/50">
              <span>Player</span>
              <span>School / Years</span>
              <span className="text-right">Rounds</span>
              <span className="text-right">Strokes</span>
              <span className="text-right">Avg</span>
            </div>
            {s.entries.map((e, i) => (
              <TableRow key={i} e={e} />
            ))}
          </>
        )}
        {s.kind === "award" && s.entries.map((e, i) => <AwardRow key={i} e={e} />)}
        {s.kind === "annual-rank" && (
          <div className="space-y-5">
            {s.years.map((y, i) => (
              <RankYearBlock key={i} y={y} />
            ))}
          </div>
        )}
        {s.kind === "all-america" && (
          <div className="space-y-6">
            {s.years.map((y, i) => (
              <AllAmericaYearBlock key={i} y={y} />
            ))}
          </div>
        )}
        {s.kind === "majors" && s.entries.map((e, i) => <MajorsRow key={i} e={e} />)}
        {s.kind === "long-running" && s.entries.map((e, i) => <LongRunningRow key={i} e={e} />)}
        {s.kind === "coach" && s.entries.map((e, i) => <CoachRow key={i} e={e} />)}
        {s.kind === "team-aggregate" && (
          <TeamAggregateSection
            entries={s.entries}
            valueLabel={s.valueLabel}
            searchable={s.searchable}
            gender={gender}
          />
        )}
      </div>
    </section>
  );
}

export default function RecordBookView({ book, extraGroups = [] }: Props) {
  const allGroups = [...extraGroups, ...book.groups];
  const stats = computeBookStats(allGroups);
  const chips = allGroups.flatMap((g) =>
    g.sections.filter((s) => entryCount(s) > 0).map((s) => ({ slug: s.slug, title: s.title })),
  );

  return (
    <div>
      {/* Hero stats */}
      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Entries</div>
          <div className="mt-0.5 text-[20px] sm:text-[22px] font-semibold text-foreground tabular-nums leading-tight">
            <AnimatedNumber value={stats.entryCount} />
          </div>
          <div className="text-[10px] text-muted-foreground">tracked records</div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Programs</div>
          <div className="mt-0.5 text-[20px] sm:text-[22px] font-semibold text-foreground tabular-nums leading-tight">
            <AnimatedNumber value={stats.programCount} />
          </div>
          <div className="text-[10px] text-muted-foreground">appearing in the book</div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Sections</div>
          <div className="mt-0.5 text-[20px] sm:text-[22px] font-semibold text-foreground tabular-nums leading-tight">
            <AnimatedNumber value={chips.length} />
          </div>
          <div className="text-[10px] text-muted-foreground">record categories</div>
        </div>
      </div>

      {/* Section jump nav */}
      <nav
        aria-label="Record sections"
        className="sticky top-[var(--nav-height)] z-20 -mx-4 sm:mx-0 mt-5 border-b border-border bg-background/65 backdrop-blur-xl backdrop-saturate-150"
      >
        <div className="sm:hidden px-4 py-2">
          <SectionJumpSelect chips={chips} />
        </div>
        <div className="hidden sm:flex overflow-x-auto px-4 py-2 gap-2">
          {chips.map((c) => (
            <a
              key={c.slug}
              href={`#${c.slug}`}
              className="whitespace-nowrap rounded-full border border-border/60 bg-card px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-border-medium transition-colors"
            >
              {c.title}
            </a>
          ))}
        </div>
      </nav>

      {allGroups.map((g) => {
        const visibleSections = g.sections.filter((s) => entryCount(s) > 0);
        if (visibleSections.length === 0) return null;
        return (
          <div key={g.slug}>
            <h2 className="mt-10 font-serif text-2xl tracking-tight text-foreground">
              {g.title}
            </h2>
            <div className="space-y-3 mt-3">
              {visibleSections.map((s) => (
                <Section key={s.slug} s={s} gender={book.gender} />
              ))}
            </div>
          </div>
        );
      })}

      <p className="mt-12 border-t border-border pt-4 text-[11px] text-text-tertiary">
        <span className="font-semibold text-foreground">Bold</span> denotes a
        currently enrolled player. Source book last updated {book.sourceDate}.
      </p>
    </div>
  );
}
