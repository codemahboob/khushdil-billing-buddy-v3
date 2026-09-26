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

  const L = 42;
  const R = W - 42;

  const issued = new Date(inv.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const eventDate = new Date(inv.eventDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // ------------------------------------------------------------
  // HEADER
  // ------------------------------------------------------------

  doc.setTextColor(15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(issued, L, 58);

  doc.text("Invoice No", L + 125, 58);
  doc.text(
    formatInvoiceNo(inv.invoiceNo, b.prefix).replace("#", ""),
    L + 125,
    72,
  );

  const brandLines = b.name.split(" & ");

  let brandY = 58;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(27);

  brandLines.forEach((line) => {
    doc.text(line, R, brandY, { align: "right" });
    brandY += 27;
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90);

  doc.text(
    `Proprietor — ${b.proprietor}`,
    R,
    brandY - 3,
    { align: "right" },
  );

  // ------------------------------------------------------------
  // CUSTOMER
  // ------------------------------------------------------------

  const customerY = 155;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100);

  doc.text("Invoice to :", R, customerY, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15);

  doc.text(
    (inv.customerName || "Customer").toUpperCase(),
    R,
    customerY + 17,
    { align: "right" },
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(70);

  let infoY = customerY + 31;

  if (inv.address) {
    doc.text(inv.address, R, infoY, { align: "right" });
    infoY += 12;
  }

  if (inv.phone) {
    doc.text(`Phone: ${inv.phone}`, R, infoY, { align: "right" });
    infoY += 12;
  }

  doc.text(`Event: ${eventDate}`, R, infoY, { align: "right" });

  // ------------------------------------------------------------
  // ITEMS TABLE
  // ------------------------------------------------------------

  const itemCount = inv.lines.length;

  // Compact automatically according to number of products.
  const rowHeight =
    itemCount <= 12 ? 22 :
    itemCount <= 16 ? 20 :
    itemCount <= 20 ? 18 :
    itemCount <= 25 ? 16 :
    14;

  const fontSize =
    itemCount <= 16 ? 8.5 :
    itemCount <= 22 ? 7.8 :
    7;

  const headerY = 245;

  // Columns
  const colQty = L + 285;
  const colPrice = L + 355;
  const colSubtotal = L + 435;

  doc.setDrawColor(45);
  doc.setLineWidth(0.7);
  doc.line(L, headerY, R, headerY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(20);

  doc.text("ITEM", L, headerY - 7);
  doc.text("QTY", colQty, headerY - 7);
  doc.text("PRICE", colPrice, headerY - 7);
  doc.text("SUBTOTAL", colSubtotal, headerY - 7);

  let y = headerY + 19;

  // Calculate actual subtotal from lines.
  const calculatedSubtotal = inv.lines.reduce(
    (sum, line) => sum + Number(line.qty || 0) * Number(line.rate || 0),
    0,
  );

  inv.lines.forEach((line) => {
    let itemName = line.name || "";

    // Keep every item on one line.
    const maxChars =
      itemCount > 22 ? 30 :
      itemCount > 16 ? 36 :
      42;

    if (itemName.length > maxChars) {
      itemName = itemName.slice(0, maxChars - 1) + "…";
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(20);

    doc.text(itemName, L, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(30);

    doc.text(String(line.qty), colQty, y);
    doc.text(`Rs ${line.rate}`, colPrice, y);
    doc.text(
      `Rs ${Number(line.qty || 0) * Number(line.rate || 0)}`,
      colSubtotal,
      y,
    );

    doc.setDrawColor(225);
    doc.setLineWidth(0.3);
    doc.line(L, y + rowHeight - 7, R, y + rowHeight - 7);

    y += rowHeight;
  });

  doc.setDrawColor(45);
  doc.setLineWidth(0.7);
  doc.line(L, y - 7, R, y - 7);

  // ------------------------------------------------------------
  // TOTALS
  // ------------------------------------------------------------

  const totalsY = y + 22;

  const discount = Number(inv.discount || 0);
  const tax = Number(inv.tax || 0);
  const advance = Number(inv.advancePaid || 0);

  const total = Number(inv.total || calculatedSubtotal);
  const due = Math.max(0, total - advance);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80);

  let ty = totalsY;

  doc.text("SUBTOTAL", colPrice, ty);
  doc.setTextColor(20);
  doc.text(`Rs ${calculatedSubtotal}`, R, ty, { align: "right" });

  ty += 15;

  if (discount > 0) {
    doc.setTextColor(80);
    doc.text("DISCOUNT", colPrice, ty);

    doc.setTextColor(20);
    doc.text(`- Rs ${discount}`, R, ty, { align: "right" });

    ty += 15;
  }

  if (tax > 0) {
    doc.setTextColor(80);
    doc.text("TAX", colPrice, ty);

    doc.setTextColor(20);
    doc.text(`Rs ${tax}`, R, ty, { align: "right" });

    ty += 15;
  }

  doc.setDrawColor(200);
  doc.line(colPrice - 8, ty + 3, R, ty + 3);

  ty += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15);

  doc.text("TOTAL", colPrice, ty);
  doc.text(`Rs ${total}`, R, ty, { align: "right" });

  if (advance > 0) {
    ty += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80);

    doc.text("ADVANCE PAID", colPrice, ty);

    doc.setTextColor(20);
    doc.text(`- Rs ${advance}`, R, ty, { align: "right" });

    ty += 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    doc.text("BALANCE DUE", colPrice, ty);
    doc.text(`Rs ${due}`, R, ty, { align: "right" });
  }

  // ------------------------------------------------------------
  // TERMS / CONTACT
  // ------------------------------------------------------------

  const bottomBlockY = H - 125;

  doc.setDrawColor(225);
  doc.setLineWidth(0.4);
  doc.line(L, bottomBlockY, R, bottomBlockY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20);

  doc.text("Terms & Conditions", L, bottomBlockY + 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90);

  const terms = doc.splitTextToSize(b.terms || "", 260);

  doc.text(terms.slice(0, 3), L, bottomBlockY + 31);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20);

  doc.text("Contact", L, bottomBlockY + 72);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90);

  doc.text(b.phones.join(" / "), L, bottomBlockY + 85);

  // ------------------------------------------------------------
  // SIGNATURE
  // ------------------------------------------------------------

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110);

  doc.text(
    "Authorised signature",
    R,
    bottomBlockY + 70,
    { align: "right" },
  );

  doc.setDrawColor(120);
  doc.line(
    R - 120,
    bottomBlockY + 60,
    R,
    bottomBlockY + 60,
  );

  // ------------------------------------------------------------
  // FOOTER
  // ------------------------------------------------------------

  const footerY = H - 38;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(20);

  doc.text(b.name, L, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100);

  doc.text(
    `P. ${b.phones.join(", ")} | ${b.address}`,
    L,
    footerY + 11,
  );

  doc.text(
    `Proprietor: ${b.proprietor}`,
    R,
    footerY + 11,
    { align: "right" },
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
