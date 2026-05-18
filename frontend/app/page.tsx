"use client";

import { useRef, useState } from "react";
import mermaid from "mermaid";
import * as htmlToImage from "html-to-image";
import jsPDF from "jspdf";
import {
  Activity,
  ShieldCheck,
  Sparkles,
  Network,
  Braces,
  GitBranch,
  Database,
  Zap,
} from "lucide-react";

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
    theme: "base",
    themeVariables: {
      background: "#0b1220",
      primaryColor: "#1d4ed8",
      primaryTextColor: "#ffffff",
      primaryBorderColor: "#38bdf8",
      lineColor: "#60a5fa",
      secondaryColor: "#0f172a",
      tertiaryColor: "#111827",
      fontFamily: "Inter, Segoe UI, Arial",
    },
    securityLevel: "loose",
    flowchart: {
      htmlLabels: true,
      curve: "basis",
    },
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
        : "Consider adding a Response action if this Logic App is called by HTTP.",
    );

    recommendations.push(
      hasCompose
        ? "Compose actions are used for calculation or data shaping."
        : "Use Compose actions to simplify expressions and improve readability.",
    );

    recommendations.push(
      hasHttp
        ? "HTTP action is detected. Validate authentication, retry policy, and timeout."
        : "No HTTP action detected.",
    );

    recommendations.push(
      "Add Scope actions for better error handling and monitoring.",
    );
    recommendations.push(
      "Add secure inputs/outputs for sensitive customer or financial data.",
    );
    recommendations.push(
      "Use clear action names to make the workflow easier to maintain.",
    );

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

  const generateBusinessRules = (
    json: any,
    expressions: string[],
  ): BusinessRule[] => {
    const rules: BusinessRule[] = [];

    const hasLoanAmount = JSON.stringify(json).includes("loanAmount");
    const hasAnnualSalary = JSON.stringify(json).includes("annualSalary");
    const hasEmploymentYears = JSON.stringify(json).includes("employmentYears");
    const hasRiskScore = JSON.stringify(json).includes("riskScore");

    if (hasLoanAmount && hasAnnualSalary) {
      rules.push({
        title: "DTI Calculation",
        description:
          "The workflow calculates debt-to-income ratio using loan amount and annual salary.",
      });
    }

    if (hasRiskScore) {
      rules.push({
        title: "Risk Score",
        description:
          "The workflow classifies the customer as High, Medium, or Low risk based on the calculated DTI ratio.",
      });
    }

    if (hasEmploymentYears) {
      rules.push({
        title: "Employment Stability",
        description:
          "The workflow classifies employment stability based on the number of employment years.",
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
    expressions: string[],
  ): SamplePayload | undefined => {
    if (!inputFields.length) return undefined;

    const request: Record<string, any> = {};

    inputFields.forEach((field) => {
      if (field.name.toLowerCase().includes("loan"))
        request[field.name] = 500000;
      else if (field.name.toLowerCase().includes("salary"))
        request[field.name] = 1200000;
      else if (field.name.toLowerCase().includes("employment"))
        request[field.name] = 4;
      else if (field.type === "number") request[field.name] = 1;
      else if (field.type === "boolean") request[field.name] = true;
      else request[field.name] = "sample";
    });

    const response: Record<string, any> = {};

    const hasRiskExpression = expressions.some(
      (x) => x.includes("riskScore") || x.includes("High"),
    );
    const hasDtiExpression = expressions.some(
      (x) => x.includes("loanAmount") && x.includes("annualSalary"),
    );

    if (hasDtiExpression) response.dtiRatio = 5;
    if (hasRiskExpression) response.riskScore = "High";

    if (
      Object.keys(request).some((x) => x.toLowerCase().includes("employment"))
    ) {
      response.employmentStability = "Stable";
    }

    return {
      request,
      response: Object.keys(response).length
        ? response
        : { message: "Sample response depends on workflow output." },
    };
  };

  const calculateComplexity = (
    triggers: Record<string, any>,
    actions: Record<string, any>,
    expressions: string[],
  ): Complexity => {
    const triggerCount = Object.keys(triggers).length;
    const actionCount = Object.keys(actions).length;
    const expressionCount = expressions.length;

    let dependencyDepth = 1;
    Object.values(actions).forEach((action: any) => {
      const runAfterCount = Object.keys(action.runAfter || {}).length;
      dependencyDepth = Math.max(dependencyDepth, runAfterCount + 1);
    });

    const totalScore =
      triggerCount + actionCount + expressionCount + dependencyDepth;

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

  const getAzureServiceKind = (type: string) => {
    const t = type.toLowerCase();

    if (t.includes("request") || t.includes("response")) return "logicapp";
    if (t.includes("apiconnection") || t.includes("connection"))
      return "apiconnection";
    if (t.includes("function")) return "function";
    if (t.includes("servicebus") || t.includes("service bus"))
      return "servicebus";
    if (t.includes("storage") || t.includes("blob") || t.includes("queue"))
      return "storage";
    if (t.includes("http")) return "apiconnection";
    if (
      t.includes("condition") ||
      t.includes("if") ||
      t.includes("foreach") ||
      t.includes("switch")
    )
      return "logicapp";
    if (
      t.includes("compose") ||
      t.includes("initialize") ||
      t.includes("variable")
    )
      return "logicapp";
    if (t.includes("sql")) return "database";

    return "azure";
  };

  const diagramIcon = (type: string) => {
    const kind = getAzureServiceKind(type);

    const icons: Record<AzureServiceKind, string> = {
      logicapp: "🔀",
      apiconnection: "🔗",
      function: "⚡",
      servicebus: "🚌",
      storage: "🗄️",
      database: "🛢️",
      azure: "☁️",
    };

    const labels: Record<AzureServiceKind, string> = {
      logicapp: "Logic Apps",
      apiconnection: "API Connection",
      function: "Azure Function",
      servicebus: "Service Bus",
      storage: "Storage Account",
      database: "Azure SQL",
      azure: "Azure",
    };

    return `<div style='font-size:22px;line-height:1'>${icons[kind]}</div><div style='font-weight:700;margin-top:4px'>${labels[kind]}</div>`;
  };

  const cleanNodeId = (name: string) => {
    return name.replace(/[^a-zA-Z0-9]/g, "_");
  };

  const escapeDiagramText = (value: string) => {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  const generateDiagram = (steps: LogicStep[]) => {
    let chart = "flowchart TD\n";

    steps.forEach((step) => {
      const id = cleanNodeId(step.name);
      const serviceHeader = diagramIcon(step.type);
      const name = escapeDiagramText(step.name);
      const type = escapeDiagramText(step.type);

      chart += `${id}["${serviceHeader}<div style='font-size:13px;margin-top:8px'>${name}</div><div style='font-size:12px;color:#dbeafe;margin-top:4px'>${type}</div>"]\n`;
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
    lineHeight = 6,
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
      pdf.text(
        `Dependency Depth: ${result.complexity.dependencyDepth}`,
        margin,
        y,
      );
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
        pdf.text(
          `${field.name} - ${field.type} - ${field.required ? "Required" : "Optional"}`,
          margin,
          y,
        );
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
        y = addWrappedText(
          pdf,
          `${index + 1}. ${rule.title}: ${rule.description}`,
          margin,
          y,
          180,
        );
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
        y = addWrappedText(
          pdf,
          `${index + 1}. ${expression}`,
          margin,
          y,
          180,
          5,
        );
        y += 3;
      });
    }

    const sections = [
      { title: "AI Recommendations", items: result.recommendations },
      {
        title: "Security Recommendations",
        items: result.securityRecommendations || [],
      },
      {
        title: "Error Handling Recommendations",
        items: result.errorHandlingRecommendations || [],
      },
      {
        title: "Monitoring Recommendations",
        items: result.monitoringRecommendations || [],
      },
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
      <div
        style={{
          maxWidth: "1300px",
          margin: "0 auto",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={heroStyle}>
          <div style={badgeStyle}>
            <Sparkles size={15} /> Azure • Logic Apps • Documentation
          </div>
          <h1 style={titleStyle}>Azure Documentation AI</h1>
          <p style={subtitleStyle}>
            Upload Azure resource JSON or Logic App workflow.json and generate
            documentation, recommendations, diagrams, and PDF reports.
          </p>
        </div>

        <section style={cardStyle}>
          <div style={sectionTitleRow}>
            <div>
              <p style={eyebrowStyle}>Get started</p>
              <h2 style={sectionTitleStyle}>Upload JSON File</h2>
            </div>
          </div>

          <input
            type="file"
            accept=".json"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={fileInputStyle}
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
                  <MetricCard
                    title="Triggers"
                    value={result.complexity.triggerCount}
                    iconKind="logicapp"
                  />
                  <MetricCard
                    title="Actions"
                    value={result.complexity.actionCount}
                    iconKind="apiconnection"
                  />
                  <MetricCard
                    title="Expressions"
                    value={result.complexity.expressionCount}
                    iconKind="function"
                  />
                  <MetricCard
                    title="Dependency Depth"
                    value={result.complexity.dependencyDepth}
                    iconKind="servicebus"
                  />
                  <MetricCard
                    title="Complexity"
                    value={result.complexity.score}
                    iconKind="storage"
                  />
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
              <h2 style={headingWithIconStyle}>
                <ShieldCheck size={22} /> AI Recommendations
              </h2>

              <div style={{ marginTop: "18px" }}>
                {result.recommendations.map((item, index) => (
                  <RecommendationItem key={index} text={item} />
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
                    <th align="left">Service</th>
                    <th align="left">Name</th>
                    <th align="left">Type</th>
                    <th align="left">Depends On / Run After</th>
                  </tr>
                </thead>

                <tbody>
                  {result.steps.map((step, index) => (
                    <tr key={index}>
                      <td style={tdStyle}>
                        <ServiceCell type={step.type} />
                      </td>
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

function MetricCard({
  title,
  value,
  iconKind = "azure",
}: {
  title: string;
  value: string | number;
  iconKind?: AzureServiceKind;
}) {
  return (
    <div style={metricCardStyle}>
      <div style={metricHeaderStyle}>
        <p style={{ margin: 0 }}>{title}</p>
        <AzureServiceIcon kind={iconKind} size={34} />
      </div>
      <h2>{value}</h2>
    </div>
  );
}

type AzureServiceKind =
  | "logicapp"
  | "apiconnection"
  | "function"
  | "servicebus"
  | "storage"
  | "database"
  | "azure";

function ServiceCell({ type }: { type: string }) {
  const kind = getServiceKind(type);
  const label = getServiceLabel(kind);

  return (
    <div style={serviceCellStyle}>
      <AzureServiceIcon kind={kind} size={34} />
      <span>{label}</span>
    </div>
  );
}

function getServiceKind(type: string): AzureServiceKind {
  const t = type.toLowerCase();

  if (t.includes("request") || t.includes("response")) return "logicapp";
  if (
    t.includes("apiconnection") ||
    t.includes("connection") ||
    t.includes("http")
  )
    return "apiconnection";
  if (t.includes("function")) return "function";
  if (t.includes("servicebus") || t.includes("service bus"))
    return "servicebus";
  if (t.includes("storage") || t.includes("blob") || t.includes("queue"))
    return "storage";
  if (t.includes("sql")) return "database";
  if (
    t.includes("compose") ||
    t.includes("if") ||
    t.includes("condition") ||
    t.includes("initialize") ||
    t.includes("variable")
  )
    return "logicapp";

  return "azure";
}

function getServiceLabel(kind: AzureServiceKind) {
  const labels: Record<AzureServiceKind, string> = {
    logicapp: "Logic Apps",
    apiconnection: "API Connections",
    function: "Azure Functions",
    servicebus: "Service Bus",
    storage: "Storage Accounts",
    database: "Azure SQL",
    azure: "Azure Resource",
  };

  return labels[kind];
}

function AzureServiceIcon({
  kind,
  size = 36,
}: {
  kind: AzureServiceKind;
  size?: number;
}) {
  const IconMap = {
    logicapp: GitBranch,
    apiconnection: Network,
    function: Zap,
    servicebus: Braces,
    storage: Database,
    database: Database,
    azure: Sparkles,
  };

  const Icon = IconMap[kind];

  return (
    <div
      style={{
        ...azureIconWrapStyle,
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
      }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={2.3} />
    </div>
  );
}

function RecommendationItem({ text }: { text: string }) {
  return (
    <div style={recommendationStyle}>
      <div style={recommendationIconWrap}>
        <Activity size={15} strokeWidth={2.4} />
      </div>
      <span style={recommendationTextStyle}>{text}</span>
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
          <RecommendationItem key={index} text={item} />
        ))}
      </div>
    </section>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(37,99,235,0.28), transparent 32%), radial-gradient(circle at top right, rgba(6,182,212,0.16), transparent 30%), linear-gradient(135deg, #020617 0%, #07111f 48%, #0f172a 100%)",
  color: "#f8fafc",
  padding: "48px 32px",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const heroStyle: React.CSSProperties = {
  marginBottom: "34px",
  padding: "8px 0 2px",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 14px",
  borderRadius: "999px",
  background: "rgba(59, 130, 246, 0.12)",
  border: "1px solid rgba(96, 165, 250, 0.28)",
  color: "#bfdbfe",
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.03em",
  marginBottom: "18px",
};

const titleStyle: React.CSSProperties = {
  fontSize: "56px",
  lineHeight: 1.05,
  fontWeight: 900,
  letterSpacing: "-0.04em",
  margin: 0,
  background: "linear-gradient(90deg, #ffffff, #bfdbfe 55%, #67e8f9)",
  WebkitBackgroundClip: "text",
  color: "transparent",
};

const subtitleStyle: React.CSSProperties = {
  color: "#a8c7e8",
  marginTop: "16px",
  maxWidth: "850px",
  fontSize: "16px",
  lineHeight: 1.8,
};

const sectionTitleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const eyebrowStyle: React.CSSProperties = {
  margin: "0 0 6px",
  color: "#7dd3fc",
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "22px",
  letterSpacing: "-0.02em",
};

const fileInputStyle: React.CSSProperties = {
  marginTop: "22px",
  width: "100%",
  maxWidth: "520px",
  padding: "14px",
  borderRadius: "14px",
  background: "rgba(2, 6, 23, 0.65)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  color: "#dbeafe",
};

const cardStyle: React.CSSProperties = {
  marginTop: "28px",
  padding: "26px",
  borderRadius: "24px",
  background:
    "linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.58))",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  boxShadow:
    "0 24px 80px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255,255,255,0.06)",
  backdropFilter: "blur(18px)",
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
  padding: "20px",
  borderRadius: "18px",
  background:
    "linear-gradient(145deg, rgba(2, 6, 23, 0.72), rgba(30, 41, 59, 0.48))",
  border: "1px solid rgba(125, 211, 252, 0.14)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
};

const metricHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
};

const azureIconWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  color: "#e0f2fe",
  background:
    "linear-gradient(135deg, rgba(0, 120, 212, 0.95), rgba(37, 99, 235, 0.88))",
  border: "1px solid rgba(125, 211, 252, 0.32)",
  boxShadow:
    "0 10px 28px rgba(14, 165, 233, 0.22), inset 0 1px 0 rgba(255,255,255,0.16)",
};

const serviceCellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  fontWeight: 700,
  color: "#bfdbfe",
};

const headingWithIconStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  margin: 0,
};

const recommendationStyle: React.CSSProperties = {
  marginBottom: "12px",
  padding: "14px 16px",
  borderRadius: "16px",
  background:
    "linear-gradient(135deg, rgba(2, 6, 23, 0.58), rgba(15, 23, 42, 0.72))",
  border: "1px solid rgba(56, 189, 248, 0.16)",
  color: "#dbeafe",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  boxShadow: "0 12px 28px rgba(8, 47, 73, 0.18)",
};

const recommendationIconWrap: React.CSSProperties = {
  minWidth: "32px",
  width: "32px",
  height: "32px",
  borderRadius: "12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "linear-gradient(135deg, rgba(34, 211, 238, 0.14), rgba(59, 130, 246, 0.12))",
  border: "1px solid rgba(103, 232, 249, 0.22)",
  color: "#67e8f9",
  boxShadow: "0 0 18px rgba(34, 211, 238, 0.16)",
};

const recommendationTextStyle: React.CSSProperties = {
  lineHeight: 1.6,
  color: "#dbeafe",
};

const infoBoxStyle: React.CSSProperties = {
  marginBottom: "14px",
  padding: "18px",
  borderRadius: "18px",
  background: "rgba(2, 6, 23, 0.48)",
  border: "1px solid rgba(96, 165, 250, 0.16)",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  marginTop: "20px",
  borderCollapse: "separate",
  borderSpacing: "0 10px",
};

const tdStyle: React.CSSProperties = {
  padding: "14px 12px",
  color: "#e2e8f0",
  background: "rgba(2, 6, 23, 0.35)",
  borderTop: "1px solid rgba(148, 163, 184, 0.08)",
  borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
};

const diagramBox: React.CSSProperties = {
  background:
    "radial-gradient(circle at top, rgba(37, 99, 235, 0.16), transparent 42%), rgba(2, 6, 23, 0.58)",
  padding: "30px",
  borderRadius: "22px",
  overflowX: "auto",
  border: "1px solid rgba(148, 163, 184, 0.14)",
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
  background: "rgba(2, 6, 23, 0.72)",
  border: "1px solid rgba(96, 165, 250, 0.14)",
  color: "#dbeafe",
  padding: "18px",
  borderRadius: "18px",
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
};

const blueButton: React.CSSProperties = {
  background: "linear-gradient(135deg, #2563eb, #06b6d4)",
  border: "none",
  padding: "13px 26px",
  borderRadius: "14px",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
  boxShadow: "0 16px 34px rgba(37, 99, 235, 0.34)",
};

const greenButton: React.CSSProperties = {
  background: "linear-gradient(135deg, #059669, #22c55e)",
  border: "none",
  padding: "11px 20px",
  borderRadius: "14px",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
  boxShadow: "0 14px 28px rgba(34, 197, 94, 0.2)",
};

const purpleButton: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #ec4899)",
  border: "none",
  padding: "11px 20px",
  borderRadius: "14px",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
  marginLeft: "10px",
  boxShadow: "0 14px 28px rgba(124, 58, 237, 0.24)",
};
