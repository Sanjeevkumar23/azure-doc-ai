"use client";

import { useRef, useState } from "react";
import mermaid from "mermaid";
import * as htmlToImage from "html-to-image";
import jsPDF from "jspdf";

type LogicStep = {
  name: string;
  type: string;
  runAfter?: string[];
};

type AnalyzeResult = {
  fileType: "Azure Resources" | "Logic App Workflow";
  summary: string;
  totalItems: number;
  steps: LogicStep[];
  recommendations: string[];
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [diagram, setDiagram] = useState("");
  const diagramRef = useRef<HTMLDivElement>(null);

  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "loose",
  });

  const analyzeFile = async () => {
    if (!file) {
      alert("Please choose a JSON file first.");
      return;
    }

    const text = await file.text();
    const json = JSON.parse(text);

    let analyzed: AnalyzeResult;

    if (json.definition?.actions || json.definition?.triggers) {
      analyzed = analyzeLogicApp(json);
    } else if (Array.isArray(json.resources) || Array.isArray(json)) {
      analyzed = analyzeAzureResources(json);
    } else {
      alert("Unsupported JSON format.");
      return;
    }

    setResult(analyzed);

    setTimeout(async () => {
      const chart = generateDiagram(analyzed.steps);
      setDiagram(chart);

      const { svg } = await mermaid.render("logic-app-diagram", chart);
      const container = document.getElementById("diagram-container");
      if (container) container.innerHTML = svg;
    }, 100);
  };

  const analyzeLogicApp = (json: any): AnalyzeResult => {
    const triggers = json.definition?.triggers || {};
    const actions = json.definition?.actions || {};

    const steps: LogicStep[] = [];

    Object.keys(triggers).forEach((key) => {
      steps.push({
        name: key,
        type: triggers[key].type || "Trigger",
      });
    });

    Object.keys(actions).forEach((key) => {
      steps.push({
        name: key,
        type: actions[key].type || "Action",
        runAfter: Object.keys(actions[key].runAfter || {}),
      });
    });

    const recommendations: string[] = [];

    const hasResponse = steps.some((s) => s.type.toLowerCase() === "response");
    const hasCompose = steps.some((s) => s.type.toLowerCase() === "compose");
    const hasHttp = steps.some((s) => s.type.toLowerCase() === "http");

    recommendations.push(
      hasResponse
        ? "Response action is available, so this workflow can return output to the caller."
        : "Consider adding a Response action if this Logic App is called by HTTP."
    );

    recommendations.push(
      hasCompose
        ? "Compose actions are used for calculation or data shaping."
        : "Use Compose actions to simplify expressions and improve readability."
    );

    recommendations.push(
      hasHttp
        ? "HTTP action is detected. Validate authentication, retry policy, and timeout."
        : "No HTTP action detected."
    );

    recommendations.push("Add Scope actions for better error handling and monitoring.");
    recommendations.push("Add secure inputs/outputs for sensitive customer or financial data.");
    recommendations.push("Use clear action names to make the workflow easier to maintain.");

    return {
      fileType: "Logic App Workflow",
      summary: `This Logic App workflow contains ${Object.keys(triggers).length} trigger(s) and ${Object.keys(actions).length} action(s).`,
      totalItems: steps.length,
      steps,
      recommendations,
    };
  };

  const analyzeAzureResources = (json: any): AnalyzeResult => {
    const resources = Array.isArray(json) ? json : json.resources || [];

    const steps: LogicStep[] = resources.map((r: any) => ({
      name: r.name || "Unnamed Resource",
      type: r.type || "Unknown",
    }));

    return {
      fileType: "Azure Resources",
      summary: `This Azure JSON contains ${resources.length} resource(s).`,
      totalItems: resources.length,
      steps,
      recommendations: [
        "Check if Key Vault is used for storing secrets.",
        "Enable monitoring using Application Insights or Azure Monitor.",
        "Use managed identities where possible.",
        "Review networking and private endpoint requirements.",
      ],
    };
  };

  const icon = (type: string) => {
    const t = type.toLowerCase();

    if (t.includes("request")) return "🌐";
    if (t.includes("response")) return "📤";
    if (t.includes("compose")) return "🧩";
    if (t.includes("http")) return "🔗";
    if (t.includes("condition")) return "🔀";
    if (t.includes("foreach")) return "🔁";
    if (t.includes("servicebus")) return "📨";
    if (t.includes("storage")) return "🗄️";
    if (t.includes("function")) return "⚡";
    if (t.includes("sql")) return "🛢️";
    if (t.includes("logic")) return "🔄";

    return "☁️";
  };

  const cleanNodeId = (name: string) => {
    return name.replace(/[^a-zA-Z0-9]/g, "_");
  };

  const generateDiagram = (steps: LogicStep[]) => {
    let chart = "flowchart TD\n";

    steps.forEach((step) => {
      const id = cleanNodeId(step.name);
      chart += `${id}["${icon(step.type)} ${step.name}<br/>${step.type}"]\n`;
    });

    steps.forEach((step, index) => {
      const currentId = cleanNodeId(step.name);

      if (step.runAfter && step.runAfter.length > 0) {
        step.runAfter.forEach((parent) => {
          chart += `${cleanNodeId(parent)} --> ${currentId}\n`;
        });
      } else if (index > 0) {
        chart += `${cleanNodeId(steps[index - 1].name)} --> ${currentId}\n`;
      }
    });

    return chart;
  };

  const downloadDiagram = async () => {
    if (!diagramRef.current) return;

    const dataUrl = await htmlToImage.toPng(diagramRef.current);
    const link = document.createElement("a");
    link.download = "logic-app-diagram.png";
    link.href = dataUrl;
    link.click();
  };

  const exportPDF = async () => {
    if (!result) return;

    const pdf = new jsPDF("p", "mm", "a4");
    const margin = 15;
    let y = 20;

    pdf.setFontSize(20);
    pdf.text("Azure Documentation AI Report", margin, y);

    y += 12;
    pdf.setFontSize(12);
    pdf.text(`File Type: ${result.fileType}`, margin, y);

    y += 10;
    pdf.text(`Total Items: ${result.totalItems}`, margin, y);

    y += 12;
    pdf.setFontSize(14);
    pdf.text("Summary", margin, y);

    y += 8;
    pdf.setFontSize(11);
    pdf.text(pdf.splitTextToSize(result.summary, 180), margin, y);

    y += 20;
    pdf.setFontSize(14);
    pdf.text("Workflow / Resource Details", margin, y);

    y += 10;
    pdf.setFontSize(10);

    result.steps.forEach((step, index) => {
      if (y > 270) {
        pdf.addPage();
        y = 20;
      }

      pdf.text(`${index + 1}. ${step.name} - ${step.type}`, margin, y);
      y += 7;
    });

    pdf.addPage();
    y = 20;

    pdf.setFontSize(14);
    pdf.text("Recommendations", margin, y);

    y += 10;
    pdf.setFontSize(10);

    result.recommendations.forEach((item, index) => {
      pdf.text(pdf.splitTextToSize(`${index + 1}. ${item}`, 180), margin, y);
      y += 10;
    });

    if (diagramRef.current) {
      pdf.addPage();
      pdf.setFontSize(14);
      pdf.text("Architecture / Workflow Diagram", margin, 20);

      const dataUrl = await htmlToImage.toPng(diagramRef.current, {
        backgroundColor: "#081225",
      });

      pdf.addImage(dataUrl, "PNG", 10, 30, 190, 120);
    }

    pdf.save("Azure-LogicApp-Documentation-Report.pdf");
  };

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "46px", fontWeight: "bold" }}>
          Azure Documentation AI
        </h1>

        <p style={{ color: "#94a3b8", marginTop: "10px" }}>
          Upload Azure resource JSON or Logic App workflow.json and generate
          documentation, recommendations, diagrams, and PDF reports.
        </p>

        <section style={cardStyle}>
          <h2>Upload JSON File</h2>

          <input
            type="file"
            accept=".json"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ marginTop: "18px" }}
          />

          <br />
          <br />

          <button onClick={analyzeFile} style={blueButton}>
            Analyze File
          </button>
        </section>

        {result && (
          <>
            <section style={gridStyle}>
              <div style={cardStyle}>
                <p>File Type</p>
                <h2>{result.fileType}</h2>
              </div>

              <div style={cardStyle}>
                <p>Total Items</p>
                <h2 style={{ fontSize: "48px" }}>{result.totalItems}</h2>
              </div>

              <div style={cardStyle}>
                <p>Summary</p>
                <p>{result.summary}</p>
              </div>
            </section>

            <section style={cardStyle}>
              <h2>AI Recommendations</h2>

              <div style={{ marginTop: "18px" }}>
                {result.recommendations.map((item, index) => (
                  <div key={index} style={recommendationStyle}>
                    ✅ {item}
                  </div>
                ))}
              </div>
            </section>

            <section style={cardStyle}>
              <h2>Workflow / Resource Inventory</h2>

              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th align="left">Name</th>
                    <th align="left">Type</th>
                    <th align="left">Depends On / Run After</th>
                  </tr>
                </thead>

                <tbody>
                  {result.steps.map((step, index) => (
                    <tr key={index}>
                      <td style={tdStyle}>{step.name}</td>
                      <td style={tdStyle}>{step.type}</td>
                      <td style={tdStyle}>
                        {step.runAfter?.length ? step.runAfter.join(", ") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={cardStyle}>
              <div style={headerRow}>
                <h2>Architecture / Workflow Diagram</h2>

                <div>
                  <button onClick={downloadDiagram} style={greenButton}>
                    Download PNG
                  </button>

                  <button onClick={exportPDF} style={purpleButton}>
                    Export PDF
                  </button>
                </div>
              </div>

              <div ref={diagramRef} style={diagramBox}>
                <div id="diagram-container" style={diagramInner} />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#020817",
  color: "white",
  padding: "40px",
  fontFamily: "Arial",
};

const cardStyle: React.CSSProperties = {
  marginTop: "28px",
  padding: "24px",
  borderRadius: "16px",
  background: "#0f172a",
  border: "1px solid #1e293b",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 2fr",
  gap: "20px",
  marginTop: "28px",
};

const recommendationStyle: React.CSSProperties = {
  marginBottom: "12px",
  padding: "12px",
  borderRadius: "10px",
  background: "#081225",
  border: "1px solid #1e293b",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  marginTop: "20px",
  borderCollapse: "collapse",
};

const tdStyle: React.CSSProperties = {
  paddingTop: "14px",
  color: "#e2e8f0",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
};

const diagramBox: React.CSSProperties = {
  background: "#081225",
  padding: "30px",
  borderRadius: "16px",
  overflowX: "auto",
};

const diagramInner: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  minHeight: "500px",
};

const blueButton: React.CSSProperties = {
  background: "#2563eb",
  border: "none",
  padding: "12px 24px",
  borderRadius: "8px",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
};

const greenButton: React.CSSProperties = {
  background: "#16a34a",
  border: "none",
  padding: "10px 20px",
  borderRadius: "8px",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
};

const purpleButton: React.CSSProperties = {
  background: "#9333ea",
  border: "none",
  padding: "10px 20px",
  borderRadius: "8px",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
  marginLeft: "10px",
};