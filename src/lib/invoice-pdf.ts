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
  const CENTER = W / 2;

  const GST = "20EOPPA1394G1Z6";

  const eventDate = new Date(inv.eventDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // ------------------------------------------------------------
  // HEADER
  // ------------------------------------------------------------

  doc.setTextColor(15);

  // BILL TO — replaces generated invoice date.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Bill To:", L, 48);

  doc.setFontSize(11);
  doc.text(
    (inv.customerName || "Customer").toUpperCase(),
    L,
    63,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(75);

  let billY = 77;

  if (inv.address) {
    const addressLines = doc.splitTextToSize(inv.address, 210);
    doc.text(addressLines.slice(0, 2), L, billY);
    billY += Math.min(addressLines.length, 2) * 10;
  }

  if (inv.phone) {
    doc.text(`Phone: ${inv.phone}`, L, billY);
    billY += 10;
  }

  doc.text(`Event Date: ${eventDate}`, L, billY);

  // CENTERED INVOICE NUMBER.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  doc.text("INVOICE NO", CENTER, 38, { align: "center" });

  doc.setFontSize(10.5);
  doc.setTextColor(15);
  doc.text(
    formatInvoiceNo(inv.invoiceNo, b.prefix).replace("#", ""),
    CENTER,
    53,
    { align: "center" },
  );

  // BUSINESS NAME — intentionally smaller and single line.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(20);

  doc.text(
    b.name || "Khushdil Tent & DJ",
    R,
    43,
    { align: "right" },
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(75);

  doc.text(`GST - ${GST}`, R, 57, { align: "right" });

  doc.setFontSize(7.5);
  doc.text(
    `Proprietor — ${b.proprietor}`,
    R,
    69,
    { align: "right" },
  );

  // ------------------------------------------------------------
  // ITEMS TABLE
  // ------------------------------------------------------------

  const itemCount = inv.lines.length;

  const headerY = 180;
  const firstRowY = headerY + 19;

  const footerTop = H - 88;

  // Reserve space for totals before the footer block.
  const totalsReserve = 95;

  const availableRowsHeight =
    Math.max(80, footerTop - totalsReserve - firstRowY);

  // Automatically compress rows so every item remains on ONE A4 page.
  const idealRowHeight =
    itemCount <= 12 ? 24 :
    itemCount <= 16 ? 22 :
    itemCount <= 20 ? 20 :
    itemCount <= 25 ? 18 :
    16;

  const rowHeight = Math.max(
    11,
    Math.min(
      idealRowHeight,
      availableRowsHeight / Math.max(itemCount, 1),
    ),
  );

  const fontSize =
    itemCount <= 16 ? 9.5 :
    itemCount <= 22 ? 9 :
    itemCount <= 32 ? 8.5 :
    8.2;

  // Columns.
  const colQty = L + 285;
  const colPrice = L + 350;
  const colSubtotal = L + 430;

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

  let y = firstRowY;

  const calculatedSubtotal = inv.lines.reduce(
    (sum, line) =>
      sum + Number(line.qty || 0) * Number(line.rate || 0),
    0,
  );

  inv.lines.forEach((line) => {
    let itemName = line.name || "";

    const maxChars =
      itemCount > 32 ? 28 :
      itemCount > 22 ? 32 :
      itemCount > 16 ? 37 :
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

    const lineSubtotal =
      Number(line.qty || 0) * Number(line.rate || 0);

    doc.text(
      `Rs ${lineSubtotal}`,
      colSubtotal,
      y,
    );

    // EXACT SAME separator for every product.
    doc.setDrawColor(220);
    doc.setLineWidth(0.35);
    doc.line(
      L,
      y + rowHeight - 6,
      R,
      y + rowHeight - 6,
    );

    y += rowHeight;
  });

  // ------------------------------------------------------------
  // TOTALS
  // ------------------------------------------------------------

  const discount = Number(inv.discount || 0);
  const tax = Number(inv.tax || 0);
  const advance = Number(inv.advancePaid || 0);

  const total = Number(inv.total || calculatedSubtotal);
  const due = Math.max(0, total - advance);

  let ty = y + 16;

  const totalsBottom = footerTop - 10;

  if (ty > totalsBottom - 80) {
    ty = totalsBottom - 80;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80);

  doc.text("SUBTOTAL", colPrice, ty);

  doc.setTextColor(20);
  doc.text(
    `Rs ${calculatedSubtotal}`,
    R,
    ty,
    { align: "right" },
  );

  ty += 14;

  if (discount > 0) {
    doc.setTextColor(80);
    doc.text("DISCOUNT", colPrice, ty);

    doc.setTextColor(20);
    doc.text(
      `- Rs ${discount}`,
      R,
      ty,
      { align: "right" },
    );

    ty += 14;
  }

  if (tax > 0) {
    doc.setTextColor(80);
    doc.text("TAX", colPrice, ty);

    doc.setTextColor(20);
    doc.text(
      `Rs ${tax}`,
      R,
      ty,
      { align: "right" },
    );

    ty += 14;
  }

  doc.setDrawColor(190);
  doc.setLineWidth(0.4);
  doc.line(
    colPrice - 8,
    ty + 3,
    R,
    ty + 3,
  );

  ty += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15);

  doc.text("TOTAL", colPrice, ty);
  doc.text(
    `Rs ${total}`,
    R,
    ty,
    { align: "right" },
  );

  ty += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80);

  doc.text("ADVANCE PAID", colPrice, ty);

  doc.setTextColor(20);
  doc.text(
    `- Rs ${advance}`,
    R,
    ty,
    { align: "right" },
  );

  ty += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.8);
  doc.setTextColor(20);

  doc.text("BALANCE DUE", colPrice, ty);
  doc.text(
    `Rs ${due}`,
    R,
    ty,
    { align: "right" },
  );

  // ------------------------------------------------------------
  // TERMS / CONTACT / SIGNATURE
  // ------------------------------------------------------------

  doc.setDrawColor(225);
  doc.setLineWidth(0.4);
  doc.line(L, footerTop, R, footerTop);

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
    b.terms || "",
    220,
  );

  doc.text(
    terms.slice(0, 2),
    L,
    footerTop + 29,
  );

  const contactX = L + 235;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(20);

  doc.text(
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

  doc.setFontSize(7);
  doc.setTextColor(100);

  doc.text(
    "Authorised signature",
    R,
    footerTop + 18,
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

  // ------------------------------------------------------------
  // FOOTER
  // ------------------------------------------------------------

  const footerY = H - 38;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(20);

  doc.text(
    b.name || "Khushdil Tent & DJ",
    L,
    footerY,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.7);
  doc.setTextColor(100);

  doc.text(
    `GST - ${GST} | P. ${b.phones.join(", ")} | ${b.address}`,
    L,
    footerY + 10,
  );

  return doc;
}

function invoiceFilename(inv: Invoice, p: ProfileLike) {
  const safeName = (inv.customerName || "invoice").replace(
    /[^a-z0-9]/gi,
    "_",
  );

  const prefix =
    p?.invoice_prefix || BUSINESS.invoicePrefix;

  return `${prefix}${inv.invoiceNo}_${safeName}.pdf`;
}

export function generateInvoicePDF(
  inv: Invoice,
  profile?: ProfileLike,
) {
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

    setTimeout(
      () => URL.revokeObjectURL(url),
      30_000,
    );
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

  const file = new File(
    [blob],
    filename,
    { type: "application/pdf" },
  );

  const nav = navigator as Navigator & {
    canShare?: (
      d: { files: File[] }
    ) => boolean;

    share?: (
      d: ShareData & { files?: File[] }
    ) => Promise<void>;
  };

  if (
    nav.canShare &&
    nav.canShare({ files: [file] }) &&
    nav.share
  ) {
    try {
      await nav.share({
        files: [file],
        title: filename,
        text: `Invoice ${formatInvoiceNo(
          inv.invoiceNo,
          profile?.invoice_prefix,
        )}`,
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

  setTimeout(
    () => URL.revokeObjectURL(url),
    30_000,
  );

  return "downloaded";
}
