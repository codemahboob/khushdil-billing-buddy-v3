import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BUILTIN_SERVICES, type PresetItem } from "@/lib/invoice-storage";
import { addCustomService, removeCustomService } from "@/lib/cloud-storage";
import { useCloudData } from "@/hooks/use-cloud-data";

export const Route = createFileRoute("/_authenticated/catalog")({
  head: () => ({ meta: [{ title: "Products & Services — Khushdil Tent & DJ" }] }),
  component: CatalogPage,
});

function CatalogPage() {
  const navigate = useNavigate();
  const { presets, refresh } = useCloudData();
  const [type, setType] = useState<"service" | "product">("service");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("fixed");
  const [busy, setBusy] = useState(false);

  const custom = presets.filter((p) => !!p.id);
  const services = useMemo(() => custom.filter((p) => (p.itemType ?? "service") === "service"), [custom]);
  const products = useMemo(() => custom.filter((p) => p.itemType === "product"), [custom]);

  const add = async () => {
    const numericPrice = Number(price);
    if (!name.trim() || !Number.isFinite(numericPrice) || numericPrice < 0) return;
    setBusy(true);
    try {
      await addCustomService({ name: name.trim(), rate: numericPrice, unit, itemType: type });
      setName("");
      setPrice("");
      setUnit("fixed");
      await refresh();
    } catch (e) {
      alert("Could not save item: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this product/service from the catalog? Existing invoices will not be changed.")) return;
    try {
      await removeCustomService(id);
      await refresh();
    } catch (e) {
      alert("Could not delete item: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-xl px-5 pb-24 pt-10">
        <button onClick={() => navigate({ to: "/" })} className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ← Back to invoices
        </button>

        <div className="mt-5 mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Catalog</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Products & Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">Add reusable items with prices. Changes are saved to the cloud and available on other devices.</p>
        </div>

        <div className="mb-6 rounded-2xl bg-card p-4 shadow-soft">
          <div className="mb-3 text-sm font-semibold">Add product or service</div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(["service", "product"] as const).map((value) => (
              <button key={value} onClick={() => setType(value)} className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${type === value ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                {value === "service" ? "Service" : "Product"}
              </button>
            ))}
          </div>
          <input className="input-base mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "service" ? "Service name" : "Product name"} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input-base" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (₹)" />
            <select className="input-base" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="fixed">Fixed</option>
              <option value="per piece">Per piece</option>
              <option value="per unit">Per unit</option>
              <option value="set">Per set</option>
              <option value="day">Per day</option>
            </select>
          </div>
          <button disabled={busy || !name.trim() || price === ""} onClick={add} className="mt-3 w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-40">
            {busy ? "Saving…" : `Add ${type === "service" ? "service" : "product"}`}
          </button>
        </div>

        <CatalogSection title="Services" items={[...BUILTIN_SERVICES, ...services]} onDelete={remove} />
        <CatalogSection title="Products" items={products} onDelete={remove} />
      </div>
    </div>
  );
}

function CatalogSection({ title, items, onDelete }: { title: string; items: PresetItem[]; onDelete: (id: string) => void }) {
  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No {title.toLowerCase()} added yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id ?? item.name} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{item.name}</div>
                <div className="text-xs text-muted-foreground">₹{item.rate.toLocaleString("en-IN")} · {item.unit}</div>
              </div>
              {item.id ? (
                <button onClick={() => onDelete(item.id!)} className="rounded-xl px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10">Delete</button>
              ) : (
                <span className="rounded-xl bg-secondary px-3 py-2 text-[11px] text-muted-foreground">Built-in</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
