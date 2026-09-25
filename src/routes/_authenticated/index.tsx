import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BUILTIN_SERVICES,
  formatInvoiceNo,
  type Invoice,
  type PresetItem,
  type ServiceLine,
} from "@/lib/invoice-storage";
import {
  addCustomService,
  emptyBin,
  permanentlyDeleteInvoice,
  removeCustomService,
  restoreInvoice,
  saveInvoice,
  softDeleteInvoice,
} from "@/lib/cloud-storage";
import { generateInvoicePDF, shareInvoicePDF } from "@/lib/invoice-pdf";
import { BUSINESS } from "@/lib/business";
import { useCloudData } from "@/hooks/use-cloud-data";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Khushdil Tent & DJ — Invoice" },
      {
        name: "description",
        content: "Create invoices and track events for Khushdil Tent & DJ.",
      },
    ],
  }),
  component: App,
});

type View =
  | { name: "home" }
  | { name: "customer" }
  | { name: "services" }
  | { name: "review" }
  | { name: "detail"; id: string }
  | { name: "bin" }
  | { name: "manage" };

function App() {
  const navigate = useNavigate();
  const { loading, profile, invoices, deleted, presets, refresh } = useCloudData();
  const [view, setView] = useState<View>({ name: "home" });
  const [draft, setDraft] = useState<Invoice>(() => emptyInvoice());
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDraft(emptyInvoice());
    setView({ name: "home" });
  };

  const finalize = async () => {
    setSaving(true);
    try {
      const subtotal = draft.lines.reduce((s, l) => s + l.rate * l.qty, 0);
      const total = subtotal - draft.discount + (draft.tax || 0);
      const saved = await saveInvoice({ ...draft, total });
      generateInvoicePDF(saved, profile);
      await refresh();
      reset();
    } catch (e) {
      alert("Could not save invoice: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const startNew = () => {
    setDraft(emptyInvoice());
    setView({ name: "customer" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-xl px-5 pb-32 pt-10">
        <Header
          onMenu={(action) => {
            if (action === "manage") setView({ name: "manage" });
            if (action === "bin") setView({ name: "bin" });
            if (action === "settings") navigate({ to: "/settings" });
          }}
          businessName={profile?.business_name || BUSINESS.name}
        />

        <AnimatePresence mode="wait">
          {view.name === "home" && (
            <Pane key="home">
              <HomeScreen
                onAdd={startNew}
                onOpen={(inv) => setView({ name: "detail", id: inv.id })}
                invoices={invoices}
                loading={loading}
              />
            </Pane>
          )}
          {view.name === "customer" && (
            <Pane key="customer">
              <CustomerStep
                draft={draft}
                onBack={() => setView({ name: "home" })}
                onNext={(d) => {
                  setDraft(d);
                  setView({ name: "services" });
                }}
              />
            </Pane>
          )}
          {view.name === "services" && (
            <Pane key="services">
              <ServicesStep
                draft={draft}
                presets={presets}
                onBack={() => setView({ name: "customer" })}
                onNext={(d) => {
                  setDraft(d);
                  setView({ name: "review" });
                }}
              />
            </Pane>
          )}
          {view.name === "review" && (
            <Pane key="review">
              <ReviewStep
                draft={draft}
                profile={profile}
                saving={saving}
                onBack={() => setView({ name: "services" })}
                onConfirm={finalize}
                onDiscount={(v) => setDraft({ ...draft, discount: v })}
                onTax={(v) => setDraft({ ...draft, tax: v })}
                onAdvance={(v) => setDraft({ ...draft, advancePaid: v })}
              />
            </Pane>
          )}
          {view.name === "detail" && (
            <Pane key={`detail-${view.id}`}>
              <DetailScreen
                inv={
                  invoices.find((i) => i.id === view.id) ||
                  deleted.find((i) => i.id === view.id)
                }
                profile={profile}
                presets={presets}
                onBack={() => setView({ name: "home" })}
                onChanged={async () => {
                  await refresh();
                  setView({ name: "home" });
                }}
              />
            </Pane>
          )}
          {view.name === "bin" && (
            <Pane key="bin">
              <BinScreen
                items={deleted}
                onBack={() => setView({ name: "home" })}
                onChange={refresh}
              />
            </Pane>
          )}
          {view.name === "manage" && (
            <Pane key="manage">
              <ManageItemsScreen
                presets={presets}
                onBack={() => setView({ name: "home" })}
                onChange={refresh}
              />
            </Pane>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------- Header with kebab menu ---------- */

function Header({
  onMenu,
  businessName,
}: {
  onMenu: (a: "manage" | "bin" | "settings") => void;
  businessName: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="mb-8 flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {businessName}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Invoices</h1>
      </div>
      <div className="relative flex items-center gap-2" ref={ref}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground font-bold">
          {(businessName[0] || "K").toUpperCase()}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition hover:bg-secondary"
          aria-label="Menu"
        >
          <DotsIcon />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-2xl border border-border bg-card shadow-pop"
            >
              <MenuItem
                onClick={() => {
                  setOpen(false);
                  navigate({ to: "/catalog" });
                }}
              >
                Products & Services
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setOpen(false);
                  onMenu("bin");
                }}
              >
                Recycle bin
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setOpen(false);
                  onMenu("settings");
                }}
              >
                Business settings
              </MenuItem>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-4 py-3 text-left text-sm font-medium text-foreground transition hover:bg-secondary"
    >
      {children}
    </button>
  );
}

function Pane({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Home ---------- */

function HomeScreen({
  onAdd,
  invoices,
  onOpen,
  loading,
}: {
  onAdd: () => void;
  invoices: Invoice[];
  onOpen: (i: Invoice) => void;
  loading: boolean;
}) {
  const upcoming = useMemo(
    () =>
      invoices
        .filter((i) => new Date(i.eventDate) >= startOfToday())
        .sort((a, b) => +new Date(a.eventDate) - +new Date(b.eventDate)),
    [invoices],
  );
  const past = useMemo(
    () =>
      invoices
        .filter((i) => new Date(i.eventDate) < startOfToday())
        .sort((a, b) => +new Date(b.eventDate) - +new Date(a.eventDate)),
    [invoices],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 py-10">
        <h2 className="text-5xl font-extrabold tracking-tight">Hello,</h2>
        <button
          onClick={onAdd}
          className="group inline-flex items-center gap-3 rounded-full border-2 border-dashed border-primary px-4 py-2 pr-5 text-primary transition hover:bg-primary/5 active:scale-[0.98]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-primary shadow-soft transition group-hover:shadow-pop">
            <PlusIcon />
          </span>
          <span className="text-lg font-semibold">Add Name</span>
        </button>
      </div>

      {loading && invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
          Syncing your events…
        </div>
      ) : (
        <>
          <Section title="Upcoming Events" count={upcoming.length}>
            {upcoming.length === 0 ? (
              <EmptyHint text="Tap Add Name to create your first invoice." />
            ) : (
              upcoming.map((i) => <InvoiceCard key={i.id} inv={i} onOpen={onOpen} upcoming />)
            )}
          </Section>

          {past.length > 0 && (
            <Section title="Past" count={past.length}>
              {past.map((i) => (
                <InvoiceCard key={i.id} inv={i} onOpen={onOpen} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-bold">{title}</h3>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function InvoiceCard({
  inv,
  onOpen,
  upcoming,
}: {
  inv: Invoice;
  onOpen: (i: Invoice) => void;
  upcoming?: boolean;
}) {
  const date = new Date(inv.eventDate);
  return (
    <button
      onClick={() => onOpen(inv)}
      className="group flex w-full items-center gap-4 rounded-2xl bg-card p-4 text-left shadow-soft transition hover:shadow-pop"
    >
      <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {date.toLocaleDateString(undefined, { month: "short" })}
        </span>
        <span className="text-lg font-bold leading-none">{date.getDate()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate font-semibold">{inv.customerName}</div>
        <div className="text-xs text-muted-foreground">
          {formatInvoiceNo(inv.invoiceNo)} ·{" "}
          {upcoming ? formatRelative(date) : date.toLocaleDateString()} · Rs {inv.total}
        </div>
      </div>
      <ChevronRight />
    </button>
  );
}

/* ---------- Detail view (saved event) ---------- */

function DetailScreen({
  inv,
  profile,
  presets,
  onBack,
  onChanged,
}: {
  inv?: Invoice;
  profile: import("@/lib/cloud-storage").BusinessProfile | null;
  presets: PresetItem[];
  onBack: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [confirmStep, setConfirmStep] = useState(0);
  const [confirmText, setConfirmText] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftLines, setDraftLines] = useState<ServiceLine[]>(inv?.lines ?? []);
  const [draftDiscount, setDraftDiscount] = useState(inv?.discount ?? 0);
  const [draftTax, setDraftTax] = useState(inv?.tax ?? 0);
  const [draftAdvance, setDraftAdvance] = useState(inv?.advancePaid ?? 0);
  const [showCustom, setShowCustom] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraftLines(inv?.lines ?? []);
    setDraftDiscount(inv?.discount ?? 0);
    setDraftTax(inv?.tax ?? 0);
    setDraftAdvance(inv?.advancePaid ?? 0);
    setEditing(false);
  }, [inv?.id]);

  if (!inv) {
    return (
      <div>
        <BackButton onClick={onBack} />
        <p className="mt-4 text-muted-foreground">Event not found.</p>
      </div>
    );
  }

  const isDeleted = !!inv.deletedAt;

  const liveLines = editing ? draftLines : inv.lines;
  const liveDiscount = editing ? draftDiscount : inv.discount;
  const liveTax = editing ? draftTax : inv.tax;
  const liveAdvance = editing ? draftAdvance : (inv.advancePaid ?? 0);
  const subtotal = liveLines.reduce((s, l) => s + l.rate * l.qty, 0);
  const total = subtotal - liveDiscount + (liveTax || 0);
  const due = Math.max(0, total - liveAdvance);

  const updateLine = (id: string, patch: Partial<ServiceLine>) =>
    setDraftLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => setDraftLines((cur) => cur.filter((l) => l.id !== id));
  const addPreset = (p: PresetItem) =>
    setDraftLines((cur) => [...cur, { ...p, id: crypto.randomUUID(), qty: 1 }]);

  const saveEdits = async () => {
    setBusy(true);
    try {
      const newTotal =
        draftLines.reduce((s, l) => s + l.rate * l.qty, 0) - draftDiscount + (draftTax || 0);
      await saveInvoice({
        ...inv,
        lines: draftLines,
        discount: draftDiscount,
        tax: draftTax,
        advancePaid: draftAdvance,
        total: newTotal,
      });
      setEditing(false);
      await onChanged();
    } catch (e) {
      alert("Save failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const cancelEdits = () => {
    setDraftLines(inv.lines);
    setDraftDiscount(inv.discount);
    setDraftTax(inv.tax);
    setDraftAdvance(inv.advancePaid ?? 0);
    setEditing(false);
    setShowCustom(false);
  };

  const tryDelete = async () => {
    if (confirmStep === 0) return setConfirmStep(1);
    if (confirmStep === 1) return setConfirmStep(2);
    if (confirmText.trim().toUpperCase() !== "DELETE") return;
    setBusy(true);
    try {
      await softDeleteInvoice(inv.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <BackButton onClick={onBack} />

      <div className="mt-4 mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            {formatInvoiceNo(inv.invoiceNo, profile?.invoice_prefix)}
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight truncate">{inv.customerName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Event ·{" "}
            {new Date(inv.eventDate).toLocaleDateString(undefined, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          {inv.phone && <p className="text-xs text-muted-foreground">Phone: {inv.phone}</p>}
          {inv.address && <p className="text-xs text-muted-foreground">{inv.address}</p>}
        </div>
        {!isDeleted && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-full bg-secondary px-4 py-2 text-xs font-semibold text-secondary-foreground hover:bg-accent"
          >
            Edit
          </button>
        )}
      </div>

      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Items
      </div>
      <div className="space-y-2">
        {liveLines.map((l) => (
          <div key={l.id} className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{l.name}</div>
                <div className="text-xs text-muted-foreground">
                  {l.qty} × Rs {l.rate} · {l.unit}
                </div>
              </div>
              <div className="font-bold">Rs {l.qty * l.rate}</div>
            </div>
            {editing && (
              <div className="mt-3 flex items-center gap-2">
                <QuantityInput value={l.qty} onChange={(v) => updateLine(l.id, { qty: Math.max(1, v) })} />
                <button
                  onClick={() => removeLine(l.id)}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  aria-label="Remove"
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>
        ))}
        {liveLines.length === 0 && <EmptyHint text="No items yet. Add some below." />}
      </div>

      {editing && (
        <div className="mt-6">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Add more items
          </div>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((s) => (
              <button
                key={(s.id || s.name) as string}
                onClick={() => addPreset(s)}
                className="rounded-2xl bg-secondary p-3 text-left transition hover:bg-accent hover:text-accent-foreground"
              >
                <div className="text-sm font-semibold">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  Rs {s.rate} · {s.unit}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3">
            {showCustom ? (
              <CustomServiceForm
                onAdd={(svc) => {
                  setDraftLines((c) => [...c, { ...svc, id: crypto.randomUUID() }]);
                  setShowCustom(false);
                }}
                onCancel={() => setShowCustom(false)}
              />
            ) : (
              <button
                onClick={() => setShowCustom(true)}
                className="w-full rounded-2xl border-2 border-dashed border-primary/60 p-3 text-sm font-semibold text-primary transition hover:bg-primary/5"
              >
                + Add one-off service
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-card p-5 shadow-soft">
        <Row label="Subtotal" value={`Rs ${subtotal}`} />
        {editing ? (
          <>
            <NumRow label="Discount" value={draftDiscount} onChange={setDraftDiscount} />
            <NumRow label="Taxes" value={draftTax} onChange={setDraftTax} />
            <NumRow label="Advance paid" value={draftAdvance} onChange={setDraftAdvance} />
          </>
        ) : (
          <>
            {liveDiscount > 0 && <Row label="Discount" value={`- Rs ${liveDiscount}`} />}
            {liveTax > 0 && <Row label="Taxes" value={`Rs ${liveTax}`} />}
            {liveAdvance > 0 && <Row label="Advance paid" value={`- Rs ${liveAdvance}`} />}
          </>
        )}
        <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-2xl font-extrabold">Rs {total}</span>
        </div>
        {due > 0 && (
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-destructive">Due</span>
            <span className="text-sm font-bold text-destructive">Rs {due}</span>
          </div>
        )}
      </div>

      {!isDeleted && editing && (
        <div className="mt-6 flex gap-2">
          <button
            onClick={cancelEdits}
            disabled={busy}
            className="flex-1 rounded-full bg-secondary py-3 text-sm font-semibold text-secondary-foreground"
          >
            Cancel
          </button>
          <button
            onClick={saveEdits}
            disabled={busy || draftLines.length === 0}
            className="flex-1 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      {!isDeleted && !editing && (
        <div className="mt-6 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => generateInvoicePDF(inv, profile)}
              className="flex-1 rounded-full bg-primary py-3.5 text-base font-semibold text-primary-foreground shadow-pop"
            >
              Download PDF
            </button>
            <button
              onClick={() => void shareInvoicePDF(inv, profile)}
              className="rounded-full border border-border bg-card px-5 py-3.5 text-base font-semibold text-foreground"
              aria-label="Share invoice"
            >
              Share
            </button>
          </div>

          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
            <div className="mb-2 text-sm font-semibold text-destructive">Danger zone</div>
            {confirmStep < 2 ? (
              <button
                onClick={tryDelete}
                className="w-full rounded-full bg-secondary py-2.5 text-sm font-semibold text-secondary-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                {confirmStep === 0
                  ? "Move event to recycle bin"
                  : "Tap again to confirm move to bin"}
              </button>
            ) : (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Type <span className="font-mono font-bold">DELETE</span> to move this event to
                  the recycle bin.
                </p>
                <input
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="input-base mb-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setConfirmStep(0);
                      setConfirmText("");
                    }}
                    className="flex-1 rounded-full bg-secondary py-2.5 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={busy || confirmText.trim().toUpperCase() !== "DELETE"}
                    onClick={tryDelete}
                    className="flex-1 rounded-full bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-40"
                  >
                    Move to bin
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NumRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-2 flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <input
        inputMode="numeric"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
        placeholder="0"
        className="w-24 rounded-lg bg-secondary px-3 py-1.5 text-right text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

/* ---------- Bin ---------- */

function BinScreen({
  items,
  onBack,
  onChange,
}: {
  items: Invoice[];
  onBack: () => void;
  onChange: () => void | Promise<void>;
}) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="mt-4 mb-6 flex items-baseline justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Recycle bin
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">Deleted events</h2>
        </div>
        {items.length > 0 && (
          <button
            onClick={async () => {
              if (confirm("Permanently delete everything in the bin?")) {
                await emptyBin();
                await onChange();
              }
            }}
            className="text-xs font-semibold text-destructive"
          >
            Empty bin
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyHint text="Nothing here. Deleted events show up in the bin." />
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.id} className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-baseline justify-between">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{i.customerName}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatInvoiceNo(i.invoiceNo)} · Rs {i.total}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {i.deletedAt && new Date(i.deletedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={async () => {
                    await restoreInvoice(i.id);
                    await onChange();
                  }}
                  className="flex-1 rounded-full bg-secondary py-2 text-xs font-semibold"
                >
                  Restore
                </button>
                <button
                  onClick={async () => {
                    if (confirm("Permanently delete this event?")) {
                      await permanentlyDeleteInvoice(i.id);
                      await onChange();
                    }
                  }}
                  className="flex-1 rounded-full bg-destructive/10 py-2 text-xs font-semibold text-destructive"
                >
                  Delete forever
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Manage items (presets) ---------- */

function ManageItemsScreen({
  presets,
  onBack,
  onChange,
}: {
  presets: PresetItem[];
  onBack: () => void;
  onChange: () => void | Promise<void>;
}) {
  const custom = presets.filter((p) => !!p.id); // cloud rows have id, built-ins don't
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [unit, setUnit] = useState("fixed");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim() || !(Number(rate) > 0)) return;
    setBusy(true);
    try {
      await addCustomService({ name: name.trim(), rate: Number(rate), unit });
      setName("");
      setRate("");
      setUnit("fixed");
      await onChange();
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (id: string) => {
    await removeCustomService(id);
    await onChange();
  };

  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="mt-4 mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Catalog
        </p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight">Items</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add reusable services that show up under Quick Add. Synced across your devices.
        </p>
      </div>

      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Built-in
      </div>
      <div className="mb-6 grid grid-cols-2 gap-2">
        {BUILTIN_SERVICES.map((s) => (
          <div key={s.name} className="rounded-2xl bg-secondary p-3">
            <div className="text-sm font-semibold">{s.name}</div>
            <div className="text-xs text-muted-foreground">
              Rs {s.rate} · {s.unit}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Your items
      </div>
      <div className="mb-4 space-y-2">
        {custom.length === 0 ? (
          <EmptyHint text="No custom items yet." />
        ) : (
          custom.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-2xl bg-card p-3 shadow-soft"
            >
              <div>
                <div className="text-sm font-semibold">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  Rs {s.rate} · {s.unit}
                </div>
              </div>
              <button
                onClick={() => removeItem(s.id!)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove"
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="rounded-2xl bg-card p-4 shadow-soft">
        <div className="mb-3 text-sm font-semibold">Add new item</div>
        <input
          placeholder="Item name (e.g. LED Light)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-base mb-2"
        />
        <div className="mb-3 grid grid-cols-2 gap-2">
          <input
            placeholder="Rate (Rs)"
            inputMode="numeric"
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/[^0-9]/g, ""))}
            className="input-base"
          />
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="input-base">
            <option value="fixed">fixed</option>
            <option value="per piece">per piece</option>
            <option value="set">set</option>
            <option value="per hour">per hour</option>
          </select>
        </div>
        <button
          onClick={add}
          disabled={busy || !name.trim() || !(Number(rate) > 0)}
          className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save item"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Step: Customer ---------- */

function CustomerStep({
  draft,
  onBack,
  onNext,
}: {
  draft: Invoice;
  onBack: () => void;
  onNext: (d: Invoice) => void;
}) {
  const [name, setName] = useState(draft.customerName);
  const [date, setDate] = useState(draft.eventDate);
  const [phone, setPhone] = useState(draft.phone ?? "");
  const [address, setAddress] = useState(draft.address ?? "");

  const valid = name.trim().length > 0 && !!date;

  return (
    <StepShell step={1} total={3} title="Customer details" subtitle="Who is the event for?" onBack={onBack}>
      <Field label="Customer name">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rajesh Kumar"
          className="input-base"
        />
      </Field>
      <Field label="Event date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-base" />
      </Field>
      <Field label="Phone (optional)">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+91"
          inputMode="tel"
          className="input-base"
        />
      </Field>
      <Field label="Address (optional)">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Village, City"
          className="input-base"
        />
      </Field>

      <StickyCTA
        disabled={!valid}
        label="Continue"
        onClick={() =>
          onNext({
            ...draft,
            customerName: name.trim(),
            eventDate: date,
            phone: phone.trim(),
            address: address.trim(),
          })
        }
      />
    </StepShell>
  );
}

/* ---------- Step: Services ---------- */

function ServicesStep({
  draft,
  presets,
  onBack,
  onNext,
}: {
  draft: Invoice;
  presets: PresetItem[];
  onBack: () => void;
  onNext: (d: Invoice) => void;
}) {
  const [lines, setLines] = useState<ServiceLine[]>(draft.lines.length ? draft.lines : []);
  const [showCustom, setShowCustom] = useState(false);
  const [catalogType, setCatalogType] = useState<"service" | "product">("service");

  const visiblePresets = useMemo(
    () => presets.filter((p) => (p.itemType ?? "service") === catalogType),
    [presets, catalogType],
  );

  const total = lines.reduce((s, l) => s + l.rate * l.qty, 0);

  const addPreset = (preset: PresetItem) => {
    setLines((cur) => [...cur, { ...preset, id: crypto.randomUUID(), qty: 1 }]);
  };

  const update = (id: string, patch: Partial<ServiceLine>) =>
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => setLines((cur) => cur.filter((l) => l.id !== id));

  return (
    <StepShell step={2} total={3} title="Services" subtitle="Add what you'll provide." onBack={onBack}>
      {lines.length > 0 && (
        <div className="mb-4 space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="rounded-2xl bg-card p-3 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.unit} · Rs {l.rate}
                  </div>
                </div>
                <button
                  onClick={() => remove(l.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove"
                >
                  <TrashIcon />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Stepper value={l.qty} onChange={(v) => update(l.id, { qty: Math.max(1, v) })} />
                <div className="ml-auto text-right text-sm">
                  <span className="text-muted-foreground">Amount</span>{" "}
                  <span className="font-bold">Rs {l.rate * l.qty}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Quick add
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(["service", "product"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setCatalogType(value);
              setShowCustom(false);
            }}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
              catalogType === value ? "bg-primary text-primary-foreground" : "bg-secondary"
            }`}
          >
            {value === "service" ? "Services" : "Products"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {visiblePresets.map((s) => (
          <button
            key={(s.id || s.name) as string}
            onClick={() => addPreset(s)}
            className="rounded-2xl bg-secondary p-3 text-left transition hover:bg-accent hover:text-accent-foreground"
          >
            <div className="text-sm font-semibold">{s.name}</div>
            <div className="text-xs text-muted-foreground">
              Rs {s.rate} · {s.unit}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-3">
        {showCustom ? (
          <CustomServiceForm
            itemType={catalogType}
            onAdd={(svc) => {
              setLines((c) => [...c, { ...svc, id: crypto.randomUUID() }]);
              setShowCustom(false);
            }}
            onCancel={() => setShowCustom(false)}
          />
        ) : (
          <button
            onClick={() => setShowCustom(true)}
            className="w-full rounded-2xl border-2 border-dashed border-primary/60 p-3 text-sm font-semibold text-primary transition hover:bg-primary/5"
          >
            + Add one-off service
          </button>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-2xl bg-card p-4 shadow-soft">
        <span className="text-sm text-muted-foreground">Running total</span>
        <span className="text-xl font-bold">Rs {total}</span>
      </div>

      <StickyCTA
        disabled={lines.length === 0}
        label="Continue to Billing"
        onClick={() => onNext({ ...draft, lines })}
      />
    </StepShell>
  );
}

function CustomServiceForm({
  itemType = "service",
  onAdd,
  onCancel,
}: {
  itemType?: "service" | "product";
  onAdd: (s: Omit<ServiceLine, "id">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [unit, setUnit] = useState("fixed");
  const [qty, setQty] = useState(1);
  const valid = name.trim() && Number(rate) > 0;

  return (
    <div className="rounded-2xl bg-card p-4 shadow-soft">
      <input
        autoFocus
        placeholder={itemType === "service" ? "Service name" : "Product name"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="input-base mb-2"
      />
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input
          placeholder="Rate (Rs)"
          inputMode="numeric"
          value={rate}
          onChange={(e) => setRate(e.target.value.replace(/[^0-9]/g, ""))}
          className="input-base"
        />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className="input-base">
          <option value="fixed">fixed</option>
          <option value="per piece">per piece</option>
          <option value="set">set</option>
          <option value="per hour">per hour</option>
        </select>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Quantity</span>
        <QuantityInput value={qty} onChange={(v) => setQty(Math.max(1, v))} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-full bg-secondary py-2.5 text-sm font-semibold text-secondary-foreground"
        >
          Cancel
        </button>
        <button
          disabled={!valid}
          onClick={() => onAdd({ name: name.trim(), rate: Number(rate), unit, qty })}
          className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

/* ---------- Step: Review ---------- */

function ReviewStep({
  draft,
  profile,
  saving,
  onBack,
  onConfirm,
  onDiscount,
  onTax,
  onAdvance,
}: {
  draft: Invoice;
  profile: import("@/lib/cloud-storage").BusinessProfile | null;
  saving: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onDiscount: (v: number) => void;
  onTax: (v: number) => void;
  onAdvance: (v: number) => void;
}) {
  const subtotal = draft.lines.reduce((s, l) => s + l.rate * l.qty, 0);
  const total = subtotal - draft.discount + (draft.tax || 0);
  const advance = draft.advancePaid ?? 0;
  const due = Math.max(0, total - advance);

  return (
    <StepShell step={3} total={3} title="Billing" subtitle="Review and generate the invoice." onBack={onBack}>
      <div className="rounded-2xl bg-card p-5 shadow-soft">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Bill to</div>
            <div className="mt-1 text-lg font-bold">{draft.customerName}</div>
            {draft.phone && <div className="text-xs text-muted-foreground">{draft.phone}</div>}
            {draft.address && <div className="text-xs text-muted-foreground">{draft.address}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Event</div>
            <div className="mt-1 font-semibold">
              {new Date(draft.eventDate).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatInvoiceNo(draft.invoiceNo, profile?.invoice_prefix)}
            </div>
          </div>
        </div>

        <div className="my-4 h-px bg-border" />

        <div className="space-y-3">
          {draft.lines.map((l) => (
            <div key={l.id} className="flex items-baseline justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">
                  {l.qty} × Rs {l.rate} {l.unit !== "fixed" ? `(${l.unit})` : ""}
                </div>
              </div>
              <div className="font-semibold">Rs {l.qty * l.rate}</div>
            </div>
          ))}
        </div>

        <div className="my-4 h-px bg-border" />

        <Row label="Subtotal" value={`Rs ${subtotal}`} />
        <NumRow label="Discount" value={draft.discount} onChange={onDiscount} />
        <NumRow label="Taxes" value={draft.tax} onChange={onTax} />
        <NumRow label="Advance paid" value={advance} onChange={onAdvance} />
        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-2xl font-extrabold">Rs {total}</span>
        </div>
        {due > 0 && (
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-destructive">Balance due</span>
            <span className="text-sm font-bold text-destructive">Rs {due}</span>
          </div>
        )}
      </div>

      <StickyCTA
        label={saving ? "Saving…" : "Generate & Save PDF"}
        onClick={onConfirm}
        disabled={saving}
      />
    </StepShell>
  );
}

/* ---------- Shared UI ---------- */

function StepShell({
  step,
  total,
  title,
  subtitle,
  children,
  onBack,
}: {
  step: number;
  total: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="mb-6 mt-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Step {step} of {total}
        </div>
        <h2 className="mt-1 text-3xl font-bold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft /> Back
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function QuantityInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-full bg-secondary">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-secondary-foreground hover:bg-accent"
        aria-label="Decrease quantity"
      >
        −
      </button>
      <input
        type="number"
        min="1"
        step="1"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const next = Number.parseInt(e.target.value, 10);
          onChange(Number.isFinite(next) && next >= 1 ? next : 1);
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="w-14 bg-transparent text-center text-sm font-bold outline-none"
        aria-label="Quantity"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-secondary-foreground hover:bg-accent"
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-full bg-secondary">
      <button
        onClick={() => onChange(value - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-secondary-foreground hover:bg-accent"
        aria-label="Decrease"
      >
        −
      </button>
      <span className="min-w-[2.5rem] text-center text-sm font-bold">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-secondary-foreground hover:bg-accent"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StickyCTA({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/85 px-5 py-4 backdrop-blur-md">
      <div className="mx-auto w-full max-w-xl">
        <button
          onClick={onClick}
          disabled={disabled}
          className="w-full rounded-full bg-primary py-3.5 text-base font-semibold text-primary-foreground shadow-pop transition active:scale-[0.99] disabled:opacity-40"
        >
          {label}
        </button>
      </div>
    </div>
  );
}

/* ---------- Icons ---------- */

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}
function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
function DotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}

/* ---------- helpers ---------- */

function emptyInvoice(): Invoice {
  return {
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now()),
    invoiceNo: 0, // allocated server-side on save
    customerName: "",
    eventDate: new Date().toISOString().slice(0, 10),
    phone: "",
    address: "",
    lines: [],
    discount: 0,
    tax: 0,
    advancePaid: 0,
    total: 0,
    createdAt: new Date().toISOString(),
  };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatRelative(date: Date) {
  const today = startOfToday();
  const diff = Math.round((+date - +today) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
