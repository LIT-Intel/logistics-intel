import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function exportCommandCenterPdf(rootSelector = "#cc-root") {
  const el = document.querySelector(rootSelector) as HTMLElement | null;
  if (!el) throw new Error(`Root element ${rootSelector} not found`);
  // ensure we capture current size, not a tiny viewport
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  const x = (pageWidth - w) / 2;
  const y = 24; // little top padding

  pdf.addImage(imgData, "PNG", x, y, w, h, undefined, "FAST");
  const selected = safeSel();
  const name = selected?.name?.replace(/[^\w\- ]+/g, "") || "company";
  pdf.save(`${name}-command-center.pdf`);
}

function safeSel() { try { return JSON.parse(localStorage.getItem("lit:selectedCompany") || "null"); } catch { return null; } }
