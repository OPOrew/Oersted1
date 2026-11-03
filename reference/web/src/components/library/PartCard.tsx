import { PARTS, type Part } from "@/data/components";
import { SYSTEMS } from "@/data/systems";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PartCard({
  part,
  selected,
  onSelect,
}: {
  part: Part;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const sys = SYSTEMS.find((s) => s.id === part.system);
  return (
    <button
      type="button"
      onClick={() => onSelect?.(part.id)}
      className={cn(
        "w-full rounded-lg border p-4 text-left transition-colors duration-150",
        selected ? "border-accent bg-raised" : "border-border bg-panel hover:border-line",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-fg">{part.name}</p>
        <Badge tone="muted">ATA {part.ata}</Badge>
      </div>
      <p className="mt-1 font-display text-[11px] uppercase tracking-[0.16em] text-subtle">
        {sys?.title} · {part.group}
      </p>
      <p className="mt-2 text-sm text-muted">{part.function}</p>
    </button>
  );
}

export function PartDetail({ part }: { part: Part }) {
  const sys = SYSTEMS.find((s) => s.id === part.system);
  return (
    <article className="rounded-xl border border-border bg-panel p-5 shadow-panel">
      <p className="font-display text-[11px] uppercase tracking-[0.18em] text-subtle">
        ATA {part.ata} · {sys?.title} · {part.group}
      </p>
      <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-fg">{part.name}</h2>
      <dl className="mt-4 space-y-4 text-sm">
        <Block title="Function" body={part.function} />
        <Block title="System flow" body={part.flow} />
        <Block title="Relationships" body={part.relationships} />
        <div>
          <h3 className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
            Technical specs
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {part.specs.map((sp) => (
              <Badge key={sp} tone="accent">
                {sp}
              </Badge>
            ))}
          </div>
        </div>
        <Block title="Controls & indication" body={part.controls} />
      </dl>
    </article>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">{title}</h3>
      <p className="mt-1 leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export function relatedParts(part: Part, n = 3) {
  return PARTS.filter((p) => p.system === part.system && p.id !== part.id).slice(0, n);
}
