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

  const L = 40;
  const R = W - 40;
  const CENTER = W / 2;

  const GST = "20EOPPA1394G1Z6";

  const eventDate = new Date(inv.eventDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // ============================================================
  // HEADER
  // ============================================================

  doc.setTextColor(20);

  // BILL TO
  // This replaces the old invoice-generation date position.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Bill To:", L, 48);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15);

  doc.text(
    (inv.customerName || "Customer").toUpperCase(),
    L,
    64,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(75);

  let billY = 78;

  if (inv.address) {
    const addressLines = doc.splitTextToSize(inv.address, 190);
    doc.text(addressLines.slice(0, 2), L, billY);
    billY += Math.min(addressLines.length, 2) * 11;
  }

  if (inv.phone) {
    doc.text(`Phone: ${inv.phone}`, L, billY);
    billY += 11;
  }

  // Keep EVENT DATE.
  // Invoice generation date is completely removed.
  doc.text(`Event Date: ${eventDate}`, L, billY);

  // ============================================================
  // CENTERED INVOICE NUMBER
  // ============================================================

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(85);

  doc.text(
    "INVOICE NO",
    CENTER,
    40,
    { align: "center" },
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);

  doc.text(
    formatInvoiceNo(inv.invoiceNo, b.prefix).replace("#", ""),
    CENTER,
    56,
    { align: "center" },
  );

  // ============================================================
  // BUSINESS HEADER
  // ============================================================

  // Smaller single-line business name.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(20);

  doc.text(
    "Khushdil Tent & DJ",
    R,
    43,
    { align: "right" },
  );

  // GST directly below business name.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(75);

  doc.text(
    `GST - ${GST}`,
    R,
    57,
    { align: "right" },
  );

  // Keep proprietor only here.
  doc.setFontSize(7.5);
  doc.setTextColor(85);

  doc.text(
    `Proprietor — ${b.proprietor}`,
    R,
    70,
    { align: "right" },
  );

  // ============================================================
  // ITEMS TABLE
  // ============================================================

  const itemCount = inv.lines.length;

  // Protected bottom area.
  // This prevents table/totals from entering the footer.
  const footerTop = H - 132;

  // Space reserved for totals.
  const totalsReserve = 105;

  const tableBottomLimit =
    footerTop - totalsReserve;

  const headerY = 175;
  const firstRowY = headerY + 20;

  const availableRowsHeight =
    tableBottomLimit - firstRowY - 8;

  // Automatically compact the rows when there are many items.
  const preferredRowHeight =
    itemCount <= 12 ? 23 :
    itemCount <= 16 ? 21 :
    itemCount <= 20 ? 18 :
    itemCount <= 25 ? 16 :
    itemCount <= 30 ? 14 :
    13;

  const rowHeight = Math.max(
    13,
    Math.min(
      preferredRowHeight,
      availableRowsHeight / Math.max(itemCount, 1),
    ),
  );

  const fontSize =
    itemCount <= 16 ? 8.5 :
    itemCount <= 22 ? 7.8 :
    7;

  // Fixed columns.
  const colQty = L + 285;
  const colPrice = L + 350;
  const colSubtotal = L + 430;

  // Table top border.
  doc.setDrawColor(45);
  doc.setLineWidth(0.7);

  doc.line(
    L,
    headerY,
    R,
    headerY,
  );

  // Table headings.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(20);

  doc.text("ITEM", L, headerY - 7);
  doc.text("QTY", colQty, headerY - 7);
  doc.text("PRICE", colPrice, headerY - 7);
  doc.text("SUBTOTAL", colSubtotal, headerY - 7);

  let y = firstRowY;

  const calculatedSubtotal = inv.lines.reduce(
    (sum, line) =>
      sum +
      Number(line.qty || 0) *
      Number(line.rate || 0),
    0,
  );

  // ============================================================
  // PRODUCT ROWS
  // ============================================================

  inv.lines.forEach((line) => {
    let itemName = line.name || "";

    // Keep item names on one line.
    const maxChars =
      itemCount > 25 ? 30 :
      itemCount > 16 ? 37 :
      43;

    if (itemName.length > maxChars) {
      itemName =
        itemName.slice(0, maxChars - 1) + "…";
    }

    // Item
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(20);

    doc.text(
      itemName,
      L,
      y,
    );

    // Quantity
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30);

    doc.text(
      String(line.qty),
      colQty,
      y,
    );

    // Price
    doc.text(
      `Rs ${line.rate}`,
      colPrice,
      y,
    );

    // Subtotal
    const lineSubtotal =
      Number(line.qty || 0) *
      Number(line.rate || 0);

    doc.text(
      `Rs ${lineSubtotal}`,
      colSubtotal,
      y,
    );

    // ==========================================================
    // EVEN FULL-WIDTH SEPARATOR
    // ==========================================================
    // Every product gets exactly the same L-to-R line.
    // The line position is calculated only from rowHeight,
    // never from the item-name length.

    doc.setDrawColor(220);
    doc.setLineWidth(0.35);

    doc.line(
      L,
      y + rowHeight - 7,
      R,
      y + rowHeight - 7,
    );

    y += rowHeight;
  });

  // ============================================================
  // TOTALS
  // ============================================================

  const discount = Number(inv.discount || 0);
  const tax = Number(inv.tax || 0);
  const advance = Number(inv.advancePaid || 0);

  const total =
    Number(inv.total || calculatedSubtotal);

  const due =
    Math.max(0, total - advance);

  let ty = y + 20;

  // Safety clamp so totals never enter footer.
  const maxTotalsY = footerTop - 80;

  if (ty > maxTotalsY) {
    ty = maxTotalsY;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80);

  // SUBTOTAL
  doc.text(
    "SUBTOTAL",
    colPrice,
    ty,
  );

  doc.setTextColor(20);

  doc.text(
    `Rs ${calculatedSubtotal}`,
    R,
    ty,
    { align: "right" },
  );

  ty += 14;

  // DISCOUNT
  if (discount > 0) {
    doc.setTextColor(80);

    doc.text(
      "DISCOUNT",
      colPrice,
      ty,
    );

    doc.setTextColor(20);

    doc.text(
      `- Rs ${discount}`,
      R,
      ty,
      { align: "right" },
    );

    ty += 14;
  }

  // TAX
  if (tax > 0) {
    doc.setTextColor(80);

    doc.text(
      "TAX",
      colPrice,
      ty,
    );

    doc.setTextColor(20);

    doc.text(
      `Rs ${tax}`,
      R,
      ty,
      { align: "right" },
    );

    ty += 14;
  }

  // Divider before total.
  doc.setDrawColor(190);
  doc.setLineWidth(0.45);

  doc.line(
    colPrice - 8,
    ty + 3,
    R,
    ty + 3,
  );

  ty += 17;

  // TOTAL
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15);

  doc.text(
    "TOTAL",
    colPrice,
    ty,
  );

  doc.text(
    `Rs ${total}`,
    R,
    ty,
    { align: "right" },
  );

  ty += 15;

  // ADVANCE PAID
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80);

  doc.text(
    "ADVANCE PAID",
    colPrice,
    ty,
  );

  doc.setTextColor(20);

  doc.text(
    `- Rs ${advance}`,
    R,
    ty,
    { align: "right" },
  );

  ty += 15;

  // BALANCE DUE
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20);

  doc.text(
    "BALANCE DUE",
    colPrice,
    ty,
  );

  doc.text(
    `Rs ${due}`,
    R,
    ty,
    { align: "right" },
  );

  // ============================================================
  // LOWER INFORMATION AREA
  // ============================================================

  doc.setDrawColor(220);
  doc.setLineWidth(0.4);

  doc.line(
    L,
    footerTop,
    R,
    footerTop,
  );

  // TERMS
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(20);

  doc.text(
    "Terms & Conditions",
    L,
    footerTop + 16,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(90);

  const terms = doc.splitTextToSize(
    b.terms || "Booking confirmed",
    220,
  );

  doc.text(
    terms.slice(0, 2),
    L,
    footerTop + 29,
  );

  // CONTACT
  const contactX = L + 235;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(20);

  doc.text(
    "Contact",
    contactX,
    footerTop + 16,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(90);

  doc.text(
    b.phones.join(" / "),
    contactX,
    footerTop + 29,
  );

  // SIGNATURE
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100);

  doc.text(
    "Authorised signature",
    R,
    footerTop + 20,
    { align: "right" },
  );

  doc.setDrawColor(120);
  doc.setLineWidth(0.4);

  doc.line(
    R - 105,
    footerTop + 31,
    R,
    footerTop + 31,
  );

  // ============================================================
  // FOOTER
  // ============================================================

  // No duplicate proprietor here.
  const footerY = H - 39;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(20);

  doc.text(
    "Khushdil Tent & DJ",
    L,
    footerY,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(100);

  doc.text(
    `GST - ${GST} | P. ${b.phones.join(", ")} | ${b.address}`,
    L,
    footerY + 10,
  );

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
