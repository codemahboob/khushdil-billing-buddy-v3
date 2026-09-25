import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchProfile, updateProfile, type BusinessProfile } from "@/lib/cloud-storage";
import { BUSINESS } from "@/lib/business";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Business settings — Khushdil Tent & DJ" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const [p, setP] = useState<Partial<BusinessProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const profile = await fetchProfile();
      setP(profile ?? {});
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({
        business_name: p.business_name ?? BUSINESS.name,
        owner_name: p.owner_name ?? null,
        phone: p.phone ?? null,
        alt_phone: p.alt_phone ?? null,
        address: p.address ?? null,
        upi_id: p.upi_id ?? null,
        invoice_prefix: p.invoice_prefix ?? BUSINESS.invoicePrefix,
        terms: p.terms ?? null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-xl px-5 py-10 text-sm text-muted-foreground">
          Loading settings…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-xl px-5 pb-24 pt-10">
        <button
          onClick={() => navigate({ to: "/" })}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
        <div className="mt-4 mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Settings
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Business profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown on every invoice you generate.
          </p>
        </div>

        <Field label="Business name">
          <input
            className="input-base"
            value={p.business_name ?? ""}
            onChange={(e) => setP({ ...p, business_name: e.target.value })}
            placeholder={BUSINESS.name}
          />
        </Field>
        <Field label="Owner / Proprietor">
          <input
            className="input-base"
            value={p.owner_name ?? ""}
            onChange={(e) => setP({ ...p, owner_name: e.target.value })}
            placeholder={BUSINESS.proprietor}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input
              className="input-base"
              value={p.phone ?? ""}
              onChange={(e) => setP({ ...p, phone: e.target.value })}
              placeholder={BUSINESS.phones[0]}
            />
          </Field>
          <Field label="Alt. phone">
            <input
              className="input-base"
              value={p.alt_phone ?? ""}
              onChange={(e) => setP({ ...p, alt_phone: e.target.value })}
              placeholder={BUSINESS.phones[1]}
            />
          </Field>
        </div>
        <Field label="Address">
          <textarea
            className="input-base min-h-[80px] resize-y"
            value={p.address ?? ""}
            onChange={(e) => setP({ ...p, address: e.target.value })}
            placeholder={BUSINESS.address}
          />
        </Field>
        <Field label="UPI ID (for invoice QR code)">
          <input
            className="input-base"
            value={p.upi_id ?? ""}
            onChange={(e) => setP({ ...p, upi_id: e.target.value })}
            placeholder="yourname@upi"
          />
        </Field>
        <Field label="Invoice prefix">
          <input
            className="input-base"
            value={p.invoice_prefix ?? ""}
            onChange={(e) => setP({ ...p, invoice_prefix: e.target.value.toUpperCase() })}
            placeholder={BUSINESS.invoicePrefix}
          />
        </Field>
        <Field label="Terms & conditions">
          <textarea
            className="input-base min-h-[80px] resize-y"
            value={p.terms ?? ""}
            onChange={(e) => setP({ ...p, terms: e.target.value })}
            placeholder={BUSINESS.terms}
          />
        </Field>

        <button
          onClick={save}
          disabled={saving}
          className="mt-4 w-full rounded-full bg-primary py-3.5 text-base font-semibold text-primary-foreground shadow-pop disabled:opacity-40"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
        </button>

      </div>
    </div>
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
