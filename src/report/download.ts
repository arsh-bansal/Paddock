import { createElement } from "react";
import type { ReportInput } from "./ReportDocument";

/** Builds the PDF in the browser and starts a download. The PDF library loads only when needed. */
export async function downloadReport(input: ReportInput): Promise<void> {
  const [{ pdf }, { ReportDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./ReportDocument"),
  ]);
  // react-pdf's types expect a <Document> element; ReportDocument renders one.
  const element = createElement(ReportDocument, input) as unknown as Parameters<
    typeof pdf
  >[0];
  const blob = await pdf(element).toBlob();

  const slug =
    input.analysis.location.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "block";
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Paddock-${slug}-${date}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
