// One-time import of legacy localStorage data into the cloud.
import { supabase } from "@/integrations/supabase/client";
import type { Invoice, PresetItem } from "./invoice-storage";
import { addCustomService, saveInvoice } from "./cloud-storage";

const LEGACY_INV_KEY = "khushdil_invoices_v2";
const LEGACY_CUSTOM_KEY = "khushdil_custom_items_v1";

function migrationMarkerKey(userId: string) {
  return `khushdil_migrated_${userId}`;
}

export async function runLocalMigrationOnce(userId: string): Promise<{
  invoices: number;
  customs: number;
}> {
  if (typeof window === "undefined") return { invoices: 0, customs: 0 };
  const marker = migrationMarkerKey(userId);
  if (localStorage.getItem(marker)) return { invoices: 0, customs: 0 };

  let invoiceCount = 0;
  let customCount = 0;

  // 1) Custom items
  try {
    const raw = localStorage.getItem(LEGACY_CUSTOM_KEY);
    if (raw) {
      const items = JSON.parse(raw) as PresetItem[];
      for (const it of items) {
        try {
          await addCustomService(it);
          customCount++;
        } catch (e) {
          console.warn("Failed to migrate custom item", it, e);
        }
      }
    }
  } catch (e) {
    console.warn("Custom items migration failed", e);
  }

  // 2) Invoices (preserve original invoice numbers via direct insert)
  try {
    const raw = localStorage.getItem(LEGACY_INV_KEY);
    if (raw) {
      const items = JSON.parse(raw) as Invoice[];
      // Sort by invoiceNo asc so the counter stays sane afterwards
      const sorted = [...items].sort((a, b) => (a.invoiceNo || 0) - (b.invoiceNo || 0));
      for (const inv of sorted) {
        try {
          // Insert event + items + invoice directly so we KEEP the original invoiceNo.
          const subtotal = inv.lines.reduce((s, l) => s + l.rate * l.qty, 0);
          const total = subtotal - (inv.discount || 0) + (inv.tax || 0);
          const { error: eErr } = await supabase.from("events").insert({
            id: inv.id,
            user_id: userId,
            customer_name: inv.customerName,
            customer_phone: inv.phone || null,
            customer_address: inv.address || null,
            event_date: inv.eventDate,
            subtotal,
            discount: inv.discount || 0,
            tax: inv.tax || 0,
            total,
            deleted_at: inv.deletedAt || null,
          });
          if (eErr) {
            // If the row already exists (re-run), skip
            if (!/duplicate/i.test(eErr.message)) console.warn("event insert failed", eErr);
            continue;
          }
          if (inv.lines.length) {
            await supabase.from("event_items").insert(
              inv.lines.map((l, i) => ({
                event_id: inv.id,
                user_id: userId,
                name: l.name,
                unit: l.unit,
                quantity: l.qty,
                rate: l.rate,
                total: l.qty * l.rate,
                description: l.description || null,
                position: i,
              })),
            );
          }
          if (inv.invoiceNo) {
            await supabase
              .from("invoices")
              .insert({ event_id: inv.id, user_id: userId, invoice_number: inv.invoiceNo });
          }
          invoiceCount++;
        } catch (e) {
          console.warn("Failed to migrate invoice", inv, e);
        }
      }

      // Bump next_invoice_no past the highest imported invoice
      const maxNo = sorted.reduce((m, i) => Math.max(m, i.invoiceNo || 0), 0);
      if (maxNo) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("next_invoice_no")
          .maybeSingle();
        if (profile && (profile.next_invoice_no ?? 0) <= maxNo) {
          await supabase
            .from("profiles")
            .update({ next_invoice_no: maxNo + 1 })
            .eq("id", userId);
        }
      }
    }
  } catch (e) {
    console.warn("Invoice migration failed", e);
  }

  localStorage.setItem(marker, new Date().toISOString());
  return { invoices: invoiceCount, customs: customCount };
}
