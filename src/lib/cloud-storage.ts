// Cloud-backed persistence for Khushdil Billing.
// Login-free shared workspace: all devices use the same Supabase workspace ID.
// NOTE: access is intentionally public at the database policy layer.
import { supabase } from "@/integrations/supabase/client";
import { BUILTIN_SERVICES, type Invoice, type PresetItem, type ServiceLine } from "./invoice-storage";

export const SHARED_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

export type BusinessProfile = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  upi_id: string | null;
  logo_url: string | null;
  invoice_prefix: string;
  next_invoice_no: number;
  terms: string | null;
};

type DbEvent = {
  id: string;
  user_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  event_date: string;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  total: number | string;
  advance_paid: number | string;
  due_amount: number | string;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  event_items: Array<{
    id: string;
    name: string;
    unit: string;
    quantity: number | string;
    rate: number | string;
    description: string | null;
    position: number;
  }>;
  invoices: Array<{ invoice_number: number }>;
};

const N = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

function mapEvent(e: DbEvent): Invoice {
  const lines: ServiceLine[] = (e.event_items || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((it) => ({
      id: it.id,
      name: it.name,
      unit: it.unit,
      rate: N(it.rate),
      qty: N(it.quantity),
      description: it.description ?? undefined,
    }));
  return {
    id: e.id,
    invoiceNo: e.invoices?.[0]?.invoice_number ?? 0,
    customerName: e.customer_name,
    eventDate: e.event_date,
    phone: e.customer_phone ?? undefined,
    address: e.customer_address ?? undefined,
    lines,
    discount: N(e.discount),
    tax: N(e.tax),
    total: N(e.total),
    advancePaid: N(e.advance_paid),
    dueAmount: N(e.due_amount),
    notes: e.notes ?? undefined,
    createdAt: e.created_at,
    deletedAt: e.deleted_at,
  };
}

const SELECT = "*, event_items(*), invoices(invoice_number)";

export async function fetchAllInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("events")
    .select(SELECT)
    .order("event_date", { ascending: false });
  if (error) throw error;
  return (data as unknown as DbEvent[]).map(mapEvent);
}

export async function fetchProfile(): Promise<BusinessProfile | null> {
  const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
  if (error) throw error;
  return data as BusinessProfile | null;
}

export async function updateProfile(patch: Partial<BusinessProfile>): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: SHARED_WORKSPACE_ID, ...patch }, { onConflict: "id" });
  if (error) throw error;
}

export async function fetchCustomServices(): Promise<PresetItem[]> {
  const { data, error } = await supabase
    .from("services")
    .select("id, name, price, unit, description, item_type")
    .eq("is_archived", false)
    .order("created_at");
  if (error) throw error;
  return (data || []).map((s) => ({
    id: s.id,
    name: s.name,
    rate: N(s.price),
    unit: s.unit,
    description: s.description ?? undefined,
    itemType: s.item_type === "product" ? "product" : "service",
  }));
}

export async function addCustomService(p: PresetItem): Promise<void> {
  const { error } = await supabase.from("services").insert({
    user_id: SHARED_WORKSPACE_ID,
    name: p.name,
    price: p.rate,
    unit: p.unit,
    pricing_type: p.unit === "per piece" ? "per_piece" : p.unit === "fixed" ? "fixed" : "per_unit",
    description: p.description,
    item_type: p.itemType === "product" ? "product" : "service",
  });
  if (error) throw error;
}

export async function removeCustomService(id: string): Promise<void> {
  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) throw error;
}

export async function getAllPresets(): Promise<PresetItem[]> {
  const custom = await fetchCustomServices();
  return [...BUILTIN_SERVICES, ...custom];
}

export async function saveInvoice(inv: Invoice): Promise<Invoice> {
  // Allocate invoice number on first save
  let invoiceNo = inv.invoiceNo;
  if (!invoiceNo) {
    const { data: n, error } = await supabase.rpc("allocate_invoice_number");
    if (error) throw error;
    invoiceNo = (n as number) || 0;
  }

  const subtotal = inv.lines.reduce((s, l) => s + l.rate * l.qty, 0);
  const total = subtotal - (inv.discount || 0) + (inv.tax || 0);

  const { error: eErr } = await supabase.from("events").upsert(
    {
      id: inv.id,
      user_id: SHARED_WORKSPACE_ID,
      customer_name: inv.customerName,
      customer_phone: inv.phone || null,
      customer_address: inv.address || null,
      event_date: inv.eventDate,
      subtotal,
      discount: inv.discount || 0,
      tax: inv.tax || 0,
      total,
      advance_paid: inv.advancePaid || 0,
      due_amount: Math.max(0, total - (inv.advancePaid || 0)),
      notes: inv.notes || null,
      deleted_at: inv.deletedAt || null,
    },
    { onConflict: "id" },
  );
  if (eErr) throw eErr;

  // Replace event_items
  const { error: dErr } = await supabase.from("event_items").delete().eq("event_id", inv.id);
  if (dErr) throw dErr;
  if (inv.lines.length) {
    const { error: iErr } = await supabase.from("event_items").insert(
      inv.lines.map((l, i) => ({
        event_id: inv.id,
        user_id: SHARED_WORKSPACE_ID,
        name: l.name,
        unit: l.unit,
        quantity: l.qty,
        rate: l.rate,
        total: l.qty * l.rate,
        description: l.description || null,
        position: i,
      })),
    );
    if (iErr) throw iErr;
  }

  // Upsert invoice row
  const { error: invErr } = await supabase.from("invoices").upsert(
    { event_id: inv.id, user_id: SHARED_WORKSPACE_ID, invoice_number: invoiceNo },
    { onConflict: "event_id" },
  );
  if (invErr) throw invErr;

  return { ...inv, invoiceNo, total };
}

export async function softDeleteInvoice(id: string): Promise<void> {
  const { error } = await supabase
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreInvoice(id: string): Promise<void> {
  const { error } = await supabase.from("events").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function permanentlyDeleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}

export async function emptyBin(): Promise<void> {
  const { error } = await supabase.from("events").delete().not("deleted_at", "is", null);
  if (error) throw error;
}

export async function uploadInvoicePdf(inv: Invoice, blob: Blob): Promise<string | null> {
  const safe = (inv.customerName || "invoice").replace(/[^a-z0-9]/gi, "_");
  const path = `${SHARED_WORKSPACE_ID}/KTD${inv.invoiceNo}_${safe}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("invoices")
    .upload(path, blob, { upsert: true, contentType: "application/pdf" });
  if (upErr) {
    console.warn("PDF upload failed:", upErr.message);
    return null;
  }
  await supabase.from("invoices").update({ pdf_url: path }).eq("event_id", inv.id);
  return path;
}
