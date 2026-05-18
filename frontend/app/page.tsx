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

type InputField = {
  name: string;
  type: string;
  required: boolean;
};

type BusinessRule = {
  title: string;
  description: string;
};

type SamplePayload = {
  request: Record<string, any>;
  response: Record<string, any>;
};

type Complexity = {
  triggerCount: number;
  actionCount: number;
  expressionCount: number;
  dependencyDepth: number;
  score: "Low" | "Medium" | "High";
};

type AnalyzeResult = {
  fileType: "Azure Resources" | "Logic App Workflow";
  summary: string;
  totalItems: number;
  steps: LogicStep[];
  recommendations: string[];
  inputFields?: InputField[];
  businessRules?: BusinessRule[];
  expressions?: string[];
  samplePayload?: SamplePayload;
  securityRecommendations?: string[];
  errorHandlingRecommendations?: string[];
  monitoringRecommendations?: string[];
  complexity?: Complexity;
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

    const inputFields = extractInputFields(json);
    const expressions = extractExpressions(json);
    const businessRules = generateBusinessRules(json, expressions);
    const samplePayload = generateSamplePayload(inputFields, expressions);
    const complexity = calculateComplexity(triggers, actions, expressions);

    return {
      fileType: "Logic App Workflow",
      summary: `This Logic App workflow contains ${Object.keys(triggers).length} trigger(s) and ${Object.keys(actions).length} action(s).`,
      totalItems: steps.length,
      steps,
      recommendations,
      inputFields,
      businessRules,
      expressions,
      samplePayload,
      securityRecommendations: [
        "Add authentication or protect the HTTP trigger using API Management.",
        "Enable secure inputs and secure outputs for financial or customer data.",
        "Validate required input values before calculation.",
        "Do not expose sensitive values in run history or logs.",
        "Use managed identity where possible for downstream Azure connections.",
      ],
      errorHandlingRecommendations: [
        "Add a Scope action named Try for the main workflow logic.",
        "Add a Scope action named Catch that runs after failure or timeout.",
        "Return a proper 400 response when required fields are missing.",
        "Handle divide-by-zero scenarios when annualSalary is 0.",
        "Add a failure notification using email, Teams, or Log Analytics.",
      ],
      monitoringRecommendations: [
        "Enable Logic App run history and review failed runs.",
        "Send diagnostic logs to Log Analytics.",
        "Add tracked properties for important business values like riskScore.",
        "Create Azure Monitor alerts for failed runs.",
        "Monitor response time and action retry behavior.",
      ],
      complexity,
    };
  };

  const extractInputFields = (json: any): InputField[] => {
    const triggers = json.definition?.triggers || {};
    const triggerKey = Object.keys(triggers)[0];
    const schema = triggers[triggerKey]?.inputs?.schema;

    if (!schema?.properties) return [];

    const requiredFields: string[] = schema.required || [];

    return Object.keys(schema.properties).map((key) => ({
      name: key,
      type: schema.properties[key].type || "unknown",
      required: requiredFields.includes(key),
    }));
  };

  const extractExpressions = (value: any): string[] => {
    const expressions: string[] = [];

    const walk = (node: any) => {
      if (typeof node === "string" && node.trim().startsWith("@")) {
        expressions.push(node);
      } else if (Array.isArray(node)) {
        node.forEach(walk);
      } else if (node && typeof node === "object") {
        Object.values(node).forEach(walk);
      }
    };

    walk(value);
    return Array.from(new Set(expressions));
  };

  const generateBusinessRules = (json: any, expressions: string[]): BusinessRule[] => {
    const rules: BusinessRule[] = [];

    const hasLoanAmount = JSON.stringify(json).includes("loanAmount");
    const hasAnnualSalary = JSON.stringify(json).includes("annualSalary");
    const hasEmploymentYears = JSON.stringify(json).includes("employmentYears");
    const hasRiskScore = JSON.stringify(json).includes("riskScore");

    if (hasLoanAmount && hasAnnualSalary) {
      rules.push({
        title: "DTI Calculation",
        description: "The workflow calculates debt-to-income ratio using loan amount and annual salary.",
      });
    }

    if (hasRiskScore) {
      rules.push({
        title: "Risk Score",
        description: "The workflow classifies the customer as High, Medium, or Low risk based on the calculated DTI ratio.",
      });
    }

    if (hasEmploymentYears) {
      rules.push({
        title: "Employment Stability",
        description: "The workflow classifies employment stability based on the number of employment years.",
      });
    }

    if (expressions.length > 0) {
      rules.push({
        title: "Expression-Based Logic",
        description: `This workflow uses ${expressions.length} expression(s) for calculations, conditions, or response shaping.`,
      });
    }

    return rules;
  };

  const generateSamplePayload = (
    inputFields: InputField[],
    expressions: string[]
  ): SamplePayload | undefined => {
    if (!inputFields.length) return undefined;

    const request: Record<string, any> = {};

    inputFields.forEach((field) => {
      if (field.name.toLowerCase().includes("loan")) request[field.name] = 500000;
      else if (field.name.toLowerCase().includes("salary")) request[field.name] = 1200000;
      else if (field.name.toLowerCase().includes("employment")) request[field.name] = 4;
      else if (field.type === "number") request[field.name] = 1;
      else if (field.type === "boolean") request[field.name] = true;
      else request[field.name] = "sample";
    });

    const response: Record<string, any> = {};

    const hasRiskExpression = expressions.some((x) => x.includes("riskScore") || x.includes("High"));
    const hasDtiExpression = expressions.some((x) => x.includes("loanAmount") && x.includes("annualSalary"));

    if (hasDtiExpression) response.dtiRatio = 5;
    if (hasRiskExpression) response.riskScore = "High";

    if (Object.keys(request).some((x) => x.toLowerCase().includes("employment"))) {
      response.employmentStability = "Stable";
    }

    return {
      request,
      response: Object.keys(response).length ? response : { message: "Sample response depends on workflow output." },
    };
  };

  const calculateComplexity = (
    triggers: Record<string, any>,
    actions: Record<string, any>,
    expressions: string[]
  ): Complexity => {
    const triggerCount = Object.keys(triggers).length;
    const actionCount = Object.keys(actions).length;
    const expressionCount = expressions.length;

    let dependencyDepth = 1;
    Object.values(actions).forEach((action: any) => {
      const runAfterCount = Object.keys(action.runAfter || {}).length;
      dependencyDepth = Math.max(dependencyDepth, runAfterCount + 1);
    });

    const totalScore = triggerCount + actionCount + expressionCount + dependencyDepth;

    let score: "Low" | "Medium" | "High" = "Low";
    if (totalScore > 20) score = "High";
    else if (totalScore > 10) score = "Medium";

    return {
      triggerCount,
      actionCount,
      expressionCount,
      dependencyDepth,
      score,
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
      securityRecommendations: [
        "Use Azure Key Vault for secrets and connection strings.",
        "Use role-based access control with least privilege.",
        "Review public network access settings.",
      ],
      monitoringRecommendations: [
        "Enable Azure Monitor diagnostic settings.",
        "Create alerts for availability and failure scenarios.",
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

  const addWrappedText = (
    pdf: jsPDF,
    text: string,
    x: number,
    y: number,
    width: number,
    lineHeight = 6
  ) => {
    const lines = pdf.splitTextToSize(text, width);
    pdf.text(lines, x, y);
    return y + lines.length * lineHeight;
  };

  const exportPDF = async () => {
    if (!result) return;

    const pdf = new jsPDF("p", "mm", "a4");
    const margin = 15;
    let y = 20;

    const checkPage = (space = 20) => {
      if (y > 280 - space) {
        pdf.addPage();
        y = 20;
      }
    };

    pdf.setFontSize(20);
    pdf.text("Azure Documentation AI Report", margin, y);

    y += 12;
    pdf.setFontSize(12);
    pdf.text(`File Type: ${result.fileType}`, margin, y);

    y += 8;
    pdf.text(`Total Items: ${result.totalItems}`, margin, y);

    y += 10;
    pdf.setFontSize(14);
    pdf.text("Summary", margin, y);

    y += 8;
    pdf.setFontSize(10);
    y = addWrappedText(pdf, result.summary, margin, y, 180);

    if (result.complexity) {
      y += 8;
      checkPage();
      pdf.setFontSize(14);
      pdf.text("Complexity Score", margin, y);

      y += 8;
      pdf.setFontSize(10);
      pdf.text(`Triggers: ${result.complexity.triggerCount}`, margin, y);
      y += 6;
      pdf.text(`Actions: ${result.complexity.actionCount}`, margin, y);
      y += 6;
      pdf.text(`Expressions: ${result.complexity.expressionCount}`, margin, y);
      y += 6;
      pdf.text(`Dependency Depth: ${result.complexity.dependencyDepth}`, margin, y);
      y += 6;
      pdf.text(`Complexity: ${result.complexity.score}`, margin, y);
    }

    y += 10;
    checkPage();
    pdf.setFontSize(14);
    pdf.text("Workflow / Resource Details", margin, y);

    y += 8;
    pdf.setFontSize(10);

    result.steps.forEach((step, index) => {
      checkPage();
      pdf.text(`${index + 1}. ${step.name} - ${step.type}`, margin, y);
      y += 6;
    });

    if (result.inputFields?.length) {
      y += 8;
      checkPage();
      pdf.setFontSize(14);
      pdf.text("Input Schema Details", margin, y);

      y += 8;
      pdf.setFontSize(10);
      result.inputFields.forEach((field) => {
        checkPage();
        pdf.text(`${field.name} - ${field.type} - ${field.required ? "Required" : "Optional"}`, margin, y);
        y += 6;
      });
    }

    if (result.businessRules?.length) {
      y += 8;
      checkPage();
      pdf.setFontSize(14);
      pdf.text("Business Logic Explanation", margin, y);

      y += 8;
      pdf.setFontSize(10);
      result.businessRules.forEach((rule, index) => {
        checkPage();
        y = addWrappedText(pdf, `${index + 1}. ${rule.title}: ${rule.description}`, margin, y, 180);
        y += 3;
      });
    }

    if (result.expressions?.length) {
      y += 8;
      checkPage();
      pdf.setFontSize(14);
      pdf.text("Expression Analysis", margin, y);

      y += 8;
      pdf.setFontSize(9);
      result.expressions.forEach((expression, index) => {
        checkPage();
        y = addWrappedText(pdf, `${index + 1}. ${expression}`, margin, y, 180, 5);
        y += 3;
      });
    }

    const sections = [
      { title: "AI Recommendations", items: result.recommendations },
      { title: "Security Recommendations", items: result.securityRecommendations || [] },
      { title: "Error Handling Recommendations", items: result.errorHandlingRecommendations || [] },
      { title: "Monitoring Recommendations", items: result.monitoringRecommendations || [] },
    ];

    sections.forEach((section) => {
      if (!section.items.length) return;

      y += 8;
      checkPage();
      pdf.setFontSize(14);
      pdf.text(section.title, margin, y);

      y += 8;
      pdf.setFontSize(10);

      section.items.forEach((item, index) => {
        checkPage();
        y = addWrappedText(pdf, `${index + 1}. ${item}`, margin, y, 180);
        y += 3;
      });
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

            {result.complexity && (
              <section style={cardStyle}>
                <h2>Complexity Score</h2>

                <div style={miniGridStyle}>
                  <MetricCard title="Triggers" value={result.complexity.triggerCount} />
                  <MetricCard title="Actions" value={result.complexity.actionCount} />
                  <MetricCard title="Expressions" value={result.complexity.expressionCount} />
                  <MetricCard title="Dependency Depth" value={result.complexity.dependencyDepth} />
                  <MetricCard title="Complexity" value={result.complexity.score} />
                </div>
              </section>
            )}

            {result.inputFields && result.inputFields.length > 0 && (
              <section style={cardStyle}>
                <h2>Input Schema Details</h2>

                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th align="left">Field Name</th>
                      <th align="left">Type</th>
                      <th align="left">Required</th>
                    </tr>
                  </thead>

                  <tbody>
                    {result.inputFields.map((field, index) => (
                      <tr key={index}>
                        <td style={tdStyle}>{field.name}</td>
                        <td style={tdStyle}>{field.type}</td>
                        <td style={tdStyle}>{field.required ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {result.businessRules && result.businessRules.length > 0 && (
              <section style={cardStyle}>
                <h2>Business Logic Explanation</h2>

                <div style={{ marginTop: "18px" }}>
                  {result.businessRules.map((rule, index) => (
                    <div key={index} style={infoBoxStyle}>
                      <h3>{rule.title}</h3>
                      <p>{rule.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {result.samplePayload && (
              <section style={cardStyle}>
                <h2>Sample Request / Response</h2>

                <div style={twoColumnStyle}>
                  <div>
                    <h3>Sample Request</h3>
                    <pre style={codeBlockStyle}>
                      {JSON.stringify(result.samplePayload.request, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <h3>Sample Response</h3>
                    <pre style={codeBlockStyle}>
                      {JSON.stringify(result.samplePayload.response, null, 2)}
                    </pre>
                  </div>
                </div>
              </section>
            )}

            {result.expressions && result.expressions.length > 0 && (
              <section style={cardStyle}>
                <h2>Expression Analysis</h2>

                <div style={{ marginTop: "18px" }}>
                  {result.expressions.map((expression, index) => (
                    <pre key={index} style={codeBlockStyle}>
                      {expression}
                    </pre>
                  ))}
                </div>
              </section>
            )}

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

            {result.securityRecommendations && (
              <RecommendationSection
                title="Security Recommendations"
                items={result.securityRecommendations}
              />
            )}

            {result.errorHandlingRecommendations && (
              <RecommendationSection
                title="Error Handling Recommendations"
                items={result.errorHandlingRecommendations}
              />
            )}

            {result.monitoringRecommendations && (
              <RecommendationSection
                title="Monitoring Recommendations"
                items={result.monitoringRecommendations}
              />
            )}

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

function MetricCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={metricCardStyle}>
      <p>{title}</p>
      <h2>{value}</h2>
    </div>
  );
}

function RecommendationSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <section style={cardStyle}>
      <h2>{title}</h2>

      <div style={{ marginTop: "18px" }}>
        {items.map((item, index) => (
          <div key={index} style={recommendationStyle}>
            ✅ {item}
          </div>
        ))}
      </div>
    </section>
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

const miniGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "16px",
  marginTop: "18px",
};

const metricCardStyle: React.CSSProperties = {
  padding: "18px",
  borderRadius: "14px",
  background: "#081225",
  border: "1px solid #1e293b",
};

const recommendationStyle: React.CSSProperties = {
  marginBottom: "12px",
  padding: "12px",
  borderRadius: "10px",
  background: "#081225",
  border: "1px solid #1e293b",
};

const infoBoxStyle: React.CSSProperties = {
  marginBottom: "14px",
  padding: "16px",
  borderRadius: "12px",
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

const twoColumnStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "18px",
  marginTop: "18px",
};

const codeBlockStyle: React.CSSProperties = {
  background: "#020817",
  border: "1px solid #1e293b",
  color: "#dbeafe",
  padding: "16px",
  borderRadius: "12px",
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
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
