export async function exportCompanyPdf(nodeId: string, filename: string) {
  const root = document.getElementById(nodeId);
  if (!root) throw new Error('PDF root not found');
  let html2canvasMod: any;
  let jsPDFMod: any;
  try {
    html2canvasMod = await import('html2canvas');
    jsPDFMod = await import('jspdf');
  } catch (e) {
    throw new Error('PDF libraries not available');
  }
  const html2canvas = html2canvasMod.default || html2canvasMod;
  const jsPDF = jsPDFMod.default || jsPDFMod;
  const canvas = await html2canvas(root, { scale: 2, useCORS: true });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'pt', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  const x = (pageW - w) / 2;
  const y = 24;
  pdf.addImage(imgData, 'PNG', x, y, w, h, '', 'FAST');
  return pdf;
}