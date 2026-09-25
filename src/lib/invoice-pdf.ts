import jsPDF from "jspdf";
import type { Invoice } from "./invoice-storage";
import { formatInvoiceNo } from "./invoice-storage";
import { BUSINESS } from "./business";
import type { BusinessProfile } from "./cloud-storage";

type ProfileLike = Partial<BusinessProfile> | null | undefined;

function brand(p: ProfileLike) {
  return {
    name: p?.business_name || BUSINESS.name,
    proprietor: p?.owner_name || BUSINESS.proprietor,
    phones: [p?.phone, p?.alt_phone].filter(Boolean).length
      ? [p?.phone, p?.alt_phone].filter((x): x is string => !!x)
      : BUSINESS.phones,
    address: p?.address || BUSINESS.address,
    upi: p?.upi_id || "",
    prefix: p?.invoice_prefix || BUSINESS.invoicePrefix,
    terms: p?.terms || BUSINESS.terms,
  };
}

function buildInvoiceDoc(inv: Invoice, profile: ProfileLike) {
  const b = brand(profile);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = 56;
  const R = W - 56;

  const issued = new Date(inv.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Top-left meta
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text(issued, L, 90);
  doc.text("Invoice No", L + 140, 90);
  doc.text(formatInvoiceNo(inv.invoiceNo, b.prefix).replace("#", ""), L + 140, 104);

  // Brand
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.setTextColor(15);
  const brandLines = b.name.split(" & ");
  let by = 96;
  brandLines.forEach((ln) => {
    doc.text(ln, R, by, { align: "right" });
    by += 36;
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Proprietor — ${b.proprietor}`, R, by - 4, { align: "right" });

  // Invoice To
  let y = 230;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text("Invoice to :", R, y, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15);
  doc.text((inv.customerName || "Customer").toUpperCase(), R, y + 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60);
  let infoY = y + 36;
  if (inv.address) {
    doc.text(inv.address, R, infoY, { align: "right" });
    infoY += 14;
  }
  if (inv.phone) {
    doc.text(`Phone: ${inv.phone}`, R, infoY, { align: "right" });
    infoY += 14;
  }
  doc.setTextColor(80);
  doc.text(
    `Event: ${new Date(inv.eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
    R,
    infoY,
    { align: "right" },
  );

  // Items table
  y = 340;
  doc.setDrawColor(40);
  doc.setLineWidth(0.8);
  doc.line(L, y, R, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20);
  const colQty = L + 250;
  const colPrice = L + 340;
  const colSub = R;
  doc.text("ITEM DESCRIPTION", L, y - 8);
  doc.text("QTY", colQty, y - 8);
  doc.text("PRICE", colPrice, y - 8);
  doc.text("SUB TOTAL", colSub, y - 8, { align: "right" });
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  inv.lines.forEach((l) => {
    const amount = l.rate * l.qty;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15);
    doc.setFontSize(11);
    doc.text(l.name, L, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    const desc = l.description || l.unit;
    const wrapped = doc.splitTextToSize(desc, 200);
    doc.text(wrapped, L, y + 12);
    doc.setTextColor(30);
    doc.setFontSize(10);
    doc.text(String(l.qty), colQty, y);
    doc.text(`Rs ${l.rate}`, colPrice, y);
    doc.text(`Rs ${amount}`, colSub, y, { align: "right" });
    const rowH = 18 + wrapped.length * 11;
    y += rowH + 8;
    doc.setDrawColor(225);
    doc.setLineWidth(0.5);
    doc.line(L, y - 6, R, y - 6);
  });

  y += 4;
  doc.setDrawColor(40);
  doc.setLineWidth(0.8);
  doc.line(L, y, R, y);

  // Totals + terms + QR
  y += 30;
  const subtotal = inv.lines.reduce((s, l) => s + l.rate * l.qty, 0);
  const totalsX = colPrice;
  const advance = inv.advancePaid || 0;
  const due = Math.max(0, inv.total - advance);

  // Terms (left)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15);
  doc.text("Terms & Conditions :", L, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(doc.splitTextToSize(b.terms || "", 220), L, y + 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15);
  doc.text("Contact :", L, y + 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(b.phones.join(" / "), L, y + 74);

  // Totals (right)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text("SUB TOTAL", totalsX, y);
  doc.setTextColor(15);
  doc.text(`Rs ${subtotal}`, colSub, y, { align: "right" });
  let ty = y + 22;
  if (inv.discount > 0) {
    doc.setTextColor(80);
    doc.text("DISCOUNT", totalsX, ty);
    doc.setTextColor(15);
    doc.text(`- Rs ${inv.discount}`, colSub, ty, { align: "right" });
    ty += 22;
  }
  if (inv.tax > 0) {
    doc.setTextColor(80);
    doc.text("TAXES", totalsX, ty);
    doc.setTextColor(15);
    doc.text(`Rs ${inv.tax}`, colSub, ty, { align: "right" });
    ty += 22;
  }

  ty += 8;
  doc.setDrawColor(220);
  doc.line(totalsX - 10, ty - 8, R, ty - 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15);
  doc.text("TOTAL", totalsX, ty);
  doc.text(`Rs ${inv.total}`, colSub, ty, { align: "right" });

  if (advance > 0) {
    ty += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text("ADVANCE PAID", totalsX, ty);
    doc.setTextColor(15);
    doc.text(`- Rs ${advance}`, colSub, ty, { align: "right" });
    ty += 22;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(180, 40, 40);
    doc.text("BALANCE DUE", totalsX, ty);
    doc.text(`Rs ${due}`, colSub, ty, { align: "right" });
  }

  // Payment + signature block
  const payY = H - 220;
  doc.setDrawColor(225);
  doc.setLineWidth(0.5);
  doc.line(L, payY, R, payY);

  if (b.upi) {
    const upiPayload = `upi://pay?pa=${encodeURIComponent(b.upi)}&pn=${encodeURIComponent(b.name)}&am=${due || inv.total}&cu=INR&tn=${encodeURIComponent("Invoice " + formatInvoiceNo(inv.invoiceNo, b.prefix))}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(upiPayload)}`;
    // Note: we can't await an image fetch synchronously here for jsPDF v4 from a public URL without CORS hassle.
    // We embed a readable placeholder + UPI ID text so user can also copy/paste.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15);
    doc.text("Pay via UPI", L, payY + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`UPI ID: ${b.upi}`, L, payY + 38);
    doc.text(`Amount: Rs ${due || inv.total}`, L, payY + 52);
    doc.setTextColor(120);
    doc.setFontSize(8);
    doc.text("Scan the QR with any UPI app", L, payY + 66);
    // QR box placeholder
    doc.setDrawColor(180);
    doc.rect(L + 200, payY + 18, 70, 70);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text("QR", L + 232, payY + 58, { align: "center" });
    // Tiny URL hint for users who can scan from generated QR offline tool
    doc.setFontSize(6.5);
    doc.text("QR uses upi:// link above", L + 235, payY + 96, { align: "center" });
    void qrUrl;
  }

  // Signature area
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Authorised signature", R, payY + 80, { align: "right" });
  doc.setDrawColor(120);
  doc.line(R - 140, payY + 70, R, payY + 70);

  // Footer
  const fy = H - 70;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15);
  doc.text(b.name, L, fy);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`P. ${b.phones.join(", ")}`, L, fy + 14);
  doc.text(`A. ${b.address}`, L, fy + 28);
  doc.text(`Proprietor: ${b.proprietor}`, L, fy + 42);

  return doc;
}

function invoiceFilename(inv: Invoice, p: ProfileLike) {
  const safeName = (inv.customerName || "invoice").replace(/[^a-z0-9]/gi, "_");
  const prefix = p?.invoice_prefix || BUSINESS.invoicePrefix;
  return `${prefix}${inv.invoiceNo}_${safeName}.pdf`;
}

export function generateInvoicePDF(inv: Invoice, profile?: ProfileLike) {
  const doc = buildInvoiceDoc(inv, profile);
  const filename = invoiceFilename(inv, profile);
  try {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch {
    doc.save(filename);
  }
}

export async function shareInvoicePDF(
  inv: Invoice,
  profile?: ProfileLike,
): Promise<"shared" | "downloaded" | "unsupported"> {
  const doc = buildInvoiceDoc(inv, profile);
  const filename = invoiceFilename(inv, profile);
  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: ShareData & { files?: File[] }) => Promise<void>;
  };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({
        files: [file],
        title: filename,
        text: `Invoice ${formatInvoiceNo(inv.invoiceNo, profile?.invoice_prefix)}`,
      });
      return "shared";
    } catch {
      return "unsupported";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}
