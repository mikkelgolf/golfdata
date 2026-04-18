import type {
  AllAmericaYear,
  AnnualRankYear,
  AwardEntry,
  CoachEntry,
  LongRunningEntry,
  MajorsEntry,
  RecordBook,
  RecordSection,
  StatEntry,
  TableEntry,
  TournamentEntry,
} from "@/data/records-types";

interface Props {
  book: RecordBook;
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

function currentClass(isCurrent: boolean | undefined): string {
  return isCurrent ? "font-semibold text-foreground" : "";
}

function StatRow({ e }: { e: StatEntry }) {
  return (
    <div className="grid grid-cols-[48px_1fr_1fr] items-baseline gap-3 py-0.5">
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
    <div className="py-1">
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
    <div className="grid grid-cols-[1fr_1fr_56px_56px_56px] items-baseline gap-3 py-0.5">
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
    <div className="grid grid-cols-[64px_1fr] items-baseline gap-3 py-0.5">
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
    <div className="grid grid-cols-[48px_1fr] items-baseline gap-3 py-1">
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
    <div className="grid grid-cols-[48px_1fr] items-baseline gap-3 py-0.5">
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
    <div className="grid grid-cols-[48px_1fr_1fr] items-baseline gap-3 py-0.5">
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

function Section({ s }: { s: RecordSection }) {
  const count = entryCount(s);
  return (
    <section id={s.slug} className="mt-10 border-t border-border pt-5 scroll-mt-20">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="label-caps">
          {s.title}
          {"minQualifier" in s && s.minQualifier ? (
            <span className="ml-2 normal-case text-[11px] font-normal text-text-tertiary">
              ({s.minQualifier})
            </span>
          ) : null}
        </h3>
        <span className="text-[11px] text-text-tertiary font-mono tabular-nums">
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
      </div>
    </section>
  );
}

export default function RecordBookView({ book }: Props) {
  // Flatten all sections for the section-jump bar
  const chips = book.groups.flatMap((g) =>
    g.sections.filter((s) => entryCount(s) > 0).map((s) => ({ slug: s.slug, title: s.title })),
  );

  return (
    <div>
      {/* Section jump chip row */}
      <nav
        aria-label="Record sections"
        className="sticky top-[var(--nav-height)] z-20 -mx-4 sm:mx-0 border-b border-border bg-background/65 backdrop-blur-xl backdrop-saturate-150"
      >
        <div className="flex overflow-x-auto px-4 py-2 gap-2">
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

      {book.groups.map((g) => {
        const visibleSections = g.sections.filter((s) => entryCount(s) > 0);
        if (visibleSections.length === 0) return null;
        return (
          <div key={g.slug}>
            <h2 className="mt-12 font-serif text-2xl tracking-tight text-foreground">
              {g.title}
            </h2>
            {visibleSections.map((s) => (
              <Section key={s.slug} s={s} />
            ))}
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
