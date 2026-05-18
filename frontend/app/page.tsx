"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  Boxes,
  FileCode2,
  Layers3,
  Workflow,
} from "lucide-react";

type AzureServiceKind =
  | "logicapp"
  | "arm"
  | "bicep"
  | "function"
  | "apim"
  | "terraform"
  | "adf"
  | "apiconnection"
  | "servicebus"
  | "storage"
  | "database"
  | "azure";

type SupportedFileType =
  | "Logic App Workflow"
  | "ARM Template"
  | "Bicep Template"
  | "Function App Config"
  | "API Management Export"
  | "Terraform"
  | "Azure Data Factory Pipeline"
  | "Azure Resources"
  | "Unknown Azure File";

type LogicStep = {
  name: string;
  type: string;
  runAfter?: string[];
  serviceKind?: AzureServiceKind;
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
  fileType: SupportedFileType;
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
  detectedCapabilities?: string[];
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
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
      alert("Please choose an Azure file first.");
      return;
    }

    try {
      const text = await file.text();
      const analyzed = analyzeAzureDocument(file.name, text);

      if (analyzed.fileType === "Unknown Azure File") {
        alert("Unsupported or unknown Azure file format.");
        return;
      }

      setResult(analyzed);

      setTimeout(async () => {
        const chart = generateDiagram(analyzed.steps);
        const { svg } = await mermaid.render(`azure-diagram-${Date.now()}`, chart);
        const container = document.getElementById("diagram-container");
        if (container) container.innerHTML = svg;
      }, 100);
    } catch (error) {
      console.error(error);
      alert("Unable to analyze this file. Please check the file format.");
    }
  };

  const analyzeAzureDocument = (fileName: string, text: string): AnalyzeResult => {
    const lowerName = fileName.toLowerCase();
    const parsedJson = tryParseJson(text);

    if (parsedJson && (parsedJson.definition?.actions || parsedJson.definition?.triggers)) {
      return analyzeLogicApp(parsedJson);
    }

    if (parsedJson && isAdfPipeline(parsedJson)) {
      return analyzeAdfPipeline(parsedJson);
    }

    if (parsedJson && isFunctionConfig(lowerName, parsedJson)) {
      return analyzeFunctionConfig(parsedJson, fileName);
    }

    if (parsedJson && isApimExport(parsedJson)) {
      return analyzeApimExport(parsedJson);
    }

    if (parsedJson && (Array.isArray(parsedJson.resources) || parsedJson.$schema?.includes("deploymentTemplate"))) {
      return analyzeArmTemplate(parsedJson);
    }

    if (parsedJson && Array.isArray(parsedJson)) {
      return analyzeAzureResources(parsedJson, "Azure Resources");
    }

    if (lowerName.endsWith(".bicep") || looksLikeBicep(text)) {
      return analyzeBicep(text);
    }

    if (lowerName.endsWith(".tf") || lowerName.endsWith(".tfvars") || looksLikeTerraform(text)) {
      return analyzeTerraform(text);
    }

    if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml") || looksLikeYamlApi(text)) {
      return analyzeYamlOrOpenApi(text);
    }

    if (lowerName.endsWith(".xml") && text.toLowerCase().includes("policies")) {
      return analyzeApimPolicyXml(text);
    }

    return {
      fileType: "Unknown Azure File",
      summary: "The uploaded file could not be matched to a supported Azure resource format.",
      totalItems: 0,
      steps: [],
      recommendations: [],
    };
  };

  const analyzeLogicApp = (json: any): AnalyzeResult => {
    const triggers = json.definition?.triggers || {};
    const actions = json.definition?.actions || {};

    const steps: LogicStep[] = [];

    Object.keys(triggers).forEach((key) => {
      steps.push({
        name: key,
        type: triggers[key].type || "Trigger",
        serviceKind: "logicapp",
      });
    });

    Object.keys(actions).forEach((key) => {
      steps.push({
        name: key,
        type: actions[key].type || "Action",
        runAfter: Object.keys(actions[key].runAfter || {}),
        serviceKind: getServiceKind(actions[key].type || key),
      });
    });

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
      detectedCapabilities: ["Workflow actions", "Run-after dependencies", "Expression analysis", "Input schema detection"],
      recommendations: [
        steps.some((s) => s.type.toLowerCase() === "response")
          ? "Response action is available, so this workflow can return output to the caller."
          : "Consider adding a Response action if this Logic App is called by HTTP.",
        steps.some((s) => s.type.toLowerCase() === "compose")
          ? "Compose actions are used for calculation or data shaping."
          : "Use Compose actions to simplify expressions and improve readability.",
        steps.some((s) => s.type.toLowerCase() === "http")
          ? "HTTP action is detected. Validate authentication, retry policy, and timeout."
          : "No HTTP action detected.",
        "Add Scope actions for better error handling and monitoring.",
        "Use clear action names to make the workflow easier to maintain.",
      ],
      inputFields,
      businessRules,
      expressions,
      samplePayload,
      securityRecommendations: [
        "Protect HTTP triggers using API Management, OAuth, or signed callback URLs.",
        "Enable secure inputs and secure outputs for sensitive values.",
        "Use managed identity for Azure service calls where possible.",
        "Move secrets and connection strings to Key Vault.",
      ],
      errorHandlingRecommendations: [
        "Add Try, Catch, and Finally Scope actions.",
        "Return proper 400 responses when required inputs are missing.",
        "Add timeout and retry policies for external calls.",
      ],
      monitoringRecommendations: [
        "Send diagnostic logs to Log Analytics.",
        "Create Azure Monitor alerts for failed runs.",
        "Add tracked properties for important business values.",
      ],
      complexity,
    };
  };

  const analyzeArmTemplate = (json: any): AnalyzeResult => {
    const resources = json.resources || [];
    const steps: LogicStep[] = resources.map((r: any) => ({
      name: normalizeName(r.name || "Unnamed Resource"),
      type: r.type || "Unknown ARM Resource",
      runAfter: cleanDependsOn(r.dependsOn || []),
      serviceKind: getServiceKind(r.type || "arm"),
    }));

    return {
      fileType: "ARM Template",
      summary: `This ARM template contains ${resources.length} Azure resource declaration(s).`,
      totalItems: resources.length,
      steps,
      detectedCapabilities: ["ARM resources", "dependsOn relationships", "resource type inventory"],
      recommendations: [
        "Parameterize environment-specific values such as names, SKUs, locations, and endpoints.",
        "Use Key Vault references for secrets instead of plain-text parameters.",
        "Add tags for owner, environment, cost center, and application name.",
        "Review dependsOn usage and remove unnecessary dependencies.",
      ],
      securityRecommendations: commonSecurityRecommendations(),
      monitoringRecommendations: commonMonitoringRecommendations(),
    };
  };

  const analyzeBicep = (text: string): AnalyzeResult => {
    const resourceRegex = /resource\s+(\w+)\s+'([^']+)'\s*=\s*{/g;
    const steps: LogicStep[] = [];
    let match: RegExpExecArray | null;

    while ((match = resourceRegex.exec(text)) !== null) {
      steps.push({
        name: match[1],
        type: match[2],
        serviceKind: getServiceKind(match[2]),
      });
    }

    return {
      fileType: "Bicep Template",
      summary: `This Bicep template contains ${steps.length} resource declaration(s).`,
      totalItems: steps.length,
      steps,
      detectedCapabilities: ["Bicep resources", "symbolic resource names", "resource type inventory"],
      recommendations: [
        "Use modules for reusable infrastructure components.",
        "Use parameters for environment-specific configuration.",
        "Use existing keyword for shared resources that are not deployed by this template.",
        "Run bicep build and what-if before deployment.",
      ],
      securityRecommendations: commonSecurityRecommendations(),
      monitoringRecommendations: commonMonitoringRecommendations(),
    };
  };

  const analyzeTerraform = (text: string): AnalyzeResult => {
    const resourceRegex = /resource\s+"([^"]+)"\s+"([^"]+)"\s*{/g;
    const dataRegex = /data\s+"([^"]+)"\s+"([^"]+)"\s*{/g;
    const steps: LogicStep[] = [];
    let match: RegExpExecArray | null;

    while ((match = resourceRegex.exec(text)) !== null) {
      steps.push({
        name: match[2],
        type: match[1],
        serviceKind: getServiceKind(match[1]),
      });
    }

    while ((match = dataRegex.exec(text)) !== null) {
      steps.push({
        name: `data.${match[2]}`,
        type: match[1],
        serviceKind: getServiceKind(match[1]),
      });
    }

    return {
      fileType: "Terraform",
      summary: `This Terraform file contains ${steps.length} resource/data block(s).`,
      totalItems: steps.length,
      steps,
      detectedCapabilities: ["Terraform resources", "Terraform data sources", "AzureRM inventory"],
      recommendations: [
        "Keep remote state in Azure Storage with state locking enabled.",
        "Use variables and tfvars for environment-specific values.",
        "Use modules for repeatable Azure patterns.",
        "Run terraform fmt, validate, plan, and security scanning before apply.",
      ],
      securityRecommendations: commonSecurityRecommendations(),
      monitoringRecommendations: commonMonitoringRecommendations(),
    };
  };

  const analyzeFunctionConfig = (json: any, fileName: string): AnalyzeResult => {
    const settings = json.Values || json.values || json.appSettings || json;
    const entries = Object.keys(settings || {});
    const steps: LogicStep[] = entries.map((key) => ({
      name: key,
      type: inferFunctionSettingType(key, settings[key]),
      serviceKind: key.toLowerCase().includes("storage") ? "storage" : "function",
    }));

    return {
      fileType: "Function App Config",
      summary: `${fileName} contains ${entries.length} Function App configuration setting(s).`,
      totalItems: entries.length,
      steps,
      detectedCapabilities: ["App settings", "runtime configuration", "connection setting detection"],
      recommendations: [
        "Move secrets and connection strings to Key Vault references.",
        "Use managed identity for Azure resources where possible.",
        "Keep local.settings.json out of source control.",
        "Enable Application Insights for Function App monitoring.",
      ],
      securityRecommendations: commonSecurityRecommendations(),
      monitoringRecommendations: commonMonitoringRecommendations(),
    };
  };

  const analyzeApimExport = (json: any): AnalyzeResult => {
    const paths = json.paths || {};
    const operations: LogicStep[] = [];

    Object.keys(paths).forEach((path) => {
      Object.keys(paths[path] || {}).forEach((method) => {
        operations.push({
          name: `${method.toUpperCase()} ${path}`,
          type: paths[path][method]?.operationId || "API Operation",
          serviceKind: "apim",
        });
      });
    });

    return {
      fileType: "API Management Export",
      summary: `This API export contains ${operations.length} API operation(s).`,
      totalItems: operations.length,
      steps: operations,
      detectedCapabilities: ["OpenAPI paths", "HTTP methods", "operation inventory"],
      recommendations: [
        "Add APIM policies for authentication, rate limiting, and backend protection.",
        "Define clear operation IDs and response schemas.",
        "Use named values and Key Vault references for backend secrets.",
        "Enable APIM diagnostics and request tracing for support scenarios.",
      ],
      securityRecommendations: [
        "Use OAuth2, subscription keys, JWT validation, or mTLS depending on API sensitivity.",
        "Add rate-limit and quota policies to protect backend services.",
        "Do not expose internal backend URLs directly to consumers.",
      ],
      monitoringRecommendations: commonMonitoringRecommendations(),
    };
  };

  const analyzeAdfPipeline = (json: any): AnalyzeResult => {
    const activities = json.properties?.activities || json.activities || [];
    const steps: LogicStep[] = activities.map((a: any) => ({
      name: a.name || "Unnamed Activity",
      type: a.type || "ADF Activity",
      runAfter: Object.keys(a.dependsOn || {}).length ? Object.keys(a.dependsOn) : (a.dependsOn || []).map((d: any) => d.activity),
      serviceKind: "adf",
    }));

    return {
      fileType: "Azure Data Factory Pipeline",
      summary: `This Azure Data Factory pipeline contains ${activities.length} activity/activity block(s).`,
      totalItems: activities.length,
      steps,
      detectedCapabilities: ["ADF activities", "activity dependencies", "pipeline inventory"],
      recommendations: [
        "Use parameters for environment-specific datasets, paths, and linked services.",
        "Add failure paths and alerting for critical activities.",
        "Use retry policies for transient failures.",
        "Store linked service secrets in Key Vault.",
      ],
      securityRecommendations: commonSecurityRecommendations(),
      errorHandlingRecommendations: [
        "Add failure dependencies for important activities.",
        "Use retry and timeout settings for copy and external activities.",
        "Send failure details to Log Analytics or notification channels.",
      ],
      monitoringRecommendations: commonMonitoringRecommendations(),
    };
  };

  const analyzeYamlOrOpenApi = (text: string): AnalyzeResult => {
    const lines = text.split(/\r?\n/);
    const pathLines = lines.filter((line) => /^\s*\/[\w/{}/.-]+:\s*$/.test(line));
    const methodLines = lines.filter((line) => /^\s*(get|post|put|delete|patch|options|head):\s*$/i.test(line));
    const steps = methodLines.map((line, index) => ({
      name: line.trim().replace(":", "").toUpperCase(),
      type: pathLines[index]?.trim().replace(":", "") || "OpenAPI Operation",
      serviceKind: "apim" as AzureServiceKind,
    }));

    return {
      fileType: "API Management Export",
      summary: `This YAML/OpenAPI file contains approximately ${steps.length} API operation(s).`,
      totalItems: steps.length,
      steps,
      detectedCapabilities: ["YAML/OpenAPI detection", "HTTP method inventory"],
      recommendations: [
        "Import this OpenAPI definition into API Management and apply security policies.",
        "Define request and response schemas for all operations.",
        "Use versioning and revisions for controlled API lifecycle management.",
      ],
      securityRecommendations: commonSecurityRecommendations(),
      monitoringRecommendations: commonMonitoringRecommendations(),
    };
  };

  const analyzeApimPolicyXml = (text: string): AnalyzeResult => {
    const policyNames = ["inbound", "backend", "outbound", "on-error"].filter((x) =>
      text.toLowerCase().includes(`<${x}>`),
    );
    const steps = policyNames.map((name) => ({
      name,
      type: "APIM Policy Section",
      serviceKind: "apim" as AzureServiceKind,
    }));

    return {
      fileType: "API Management Export",
      summary: `This APIM policy XML contains ${steps.length} policy section(s).`,
      totalItems: steps.length,
      steps,
      detectedCapabilities: ["APIM policy XML", "policy section inventory"],
      recommendations: [
        "Review inbound policies for authentication and validation.",
        "Review backend policies for routing and retry behavior.",
        "Review on-error policies for safe error responses.",
      ],
      securityRecommendations: commonSecurityRecommendations(),
      monitoringRecommendations: commonMonitoringRecommendations(),
    };
  };

  const analyzeAzureResources = (json: any, fileType: SupportedFileType): AnalyzeResult => {
    const resources = Array.isArray(json) ? json : json.resources || [];
    const steps: LogicStep[] = resources.map((r: any) => ({
      name: normalizeName(r.name || "Unnamed Resource"),
      type: r.type || "Unknown",
      runAfter: cleanDependsOn(r.dependsOn || []),
      serviceKind: getServiceKind(r.type || "azure"),
    }));

    return {
      fileType,
      summary: `This Azure JSON contains ${resources.length} resource(s).`,
      totalItems: resources.length,
      steps,
      detectedCapabilities: ["Azure resource inventory"],
      recommendations: [
        "Check if Key Vault is used for storing secrets.",
        "Enable monitoring using Application Insights or Azure Monitor.",
        "Use managed identities where possible.",
        "Review networking and private endpoint requirements.",
      ],
      securityRecommendations: commonSecurityRecommendations(),
      monitoringRecommendations: commonMonitoringRecommendations(),
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
    const jsonText = JSON.stringify(json);

    if (jsonText.includes("loanAmount") && jsonText.includes("annualSalary")) {
      rules.push({
        title: "DTI Calculation",
        description: "The workflow calculates debt-to-income ratio using loan amount and annual salary.",
      });
    }

    if (jsonText.includes("riskScore")) {
      rules.push({
        title: "Risk Score",
        description: "The workflow classifies the customer as High, Medium, or Low risk based on calculated values.",
      });
    }

    if (jsonText.includes("employmentYears")) {
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

  const generateSamplePayload = (inputFields: InputField[], expressions: string[]): SamplePayload | undefined => {
    if (!inputFields.length) return undefined;

    const request: Record<string, any> = {};

    inputFields.forEach((field) => {
      const name = field.name.toLowerCase();
      if (name.includes("loan")) request[field.name] = 500000;
      else if (name.includes("salary")) request[field.name] = 1200000;
      else if (name.includes("employment")) request[field.name] = 4;
      else if (field.type === "number" || field.type === "integer") request[field.name] = 1;
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

  const calculateComplexity = (triggers: Record<string, any>, actions: Record<string, any>, expressions: string[]): Complexity => {
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

    return { triggerCount, actionCount, expressionCount, dependencyDepth, score };
  };

  const generateDiagram = (steps: LogicStep[]) => {
    if (!steps.length) return "flowchart TD\nEmpty[No resources found]\n";

    let chart = "flowchart TD\n";

    steps.forEach((step, index) => {
      const id = cleanNodeId(`${step.name}_${index}`);
      const serviceHeader = diagramIcon(step.serviceKind || getServiceKind(step.type));
      const name = escapeDiagramText(step.name);
      const type = escapeDiagramText(step.type);
      chart += `${id}["${serviceHeader}<div style='font-size:13px;margin-top:8px'>${name}</div><div style='font-size:12px;color:#dbeafe;margin-top:4px'>${type}</div>"]\n`;
    });

    steps.forEach((step, index) => {
      const currentId = cleanNodeId(`${step.name}_${index}`);

      if (step.runAfter && step.runAfter.length > 0) {
        step.runAfter.forEach((parent) => {
          const parentIndex = steps.findIndex((s) => s.name === parent || s.name.includes(parent));
          if (parentIndex >= 0) chart += `${cleanNodeId(`${steps[parentIndex].name}_${parentIndex}`)} --> ${currentId}\n`;
        });
      } else if (index > 0 && result?.fileType === "Logic App Workflow") {
        chart += `${cleanNodeId(`${steps[index - 1].name}_${index - 1}`)} --> ${currentId}\n`;
      }
    });

    return chart;
  };

  const downloadDiagram = async () => {
    if (!diagramRef.current) return;
    const dataUrl = await htmlToImage.toPng(diagramRef.current);
    const link = document.createElement("a");
    link.download = "azure-resource-diagram.png";
    link.href = dataUrl;
    link.click();
  };

  const addWrappedText = (pdf: jsPDF, text: string, x: number, y: number, width: number, lineHeight = 6) => {
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

    if (result.detectedCapabilities?.length) {
      y += 8;
      checkPage();
      pdf.setFontSize(14);
      pdf.text("Detected Capabilities", margin, y);
      y += 8;
      pdf.setFontSize(10);
      result.detectedCapabilities.forEach((item, index) => {
        checkPage();
        pdf.text(`${index + 1}. ${item}`, margin, y);
        y += 6;
      });
    }

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
    pdf.text("Workflow / Resource Inventory", margin, y);
    y += 8;
    pdf.setFontSize(10);

    result.steps.forEach((step, index) => {
      checkPage();
      y = addWrappedText(pdf, `${index + 1}. ${step.name} - ${step.type}`, margin, y, 180);
      y += 2;
    });

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
      const dataUrl = await htmlToImage.toPng(diagramRef.current, { backgroundColor: "#081225" });
      pdf.addImage(dataUrl, "PNG", 10, 30, 190, 120);
    }

    pdf.save("Azure-Documentation-AI-Report.pdf");
  };

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "1300px", margin: "0 auto", position: "relative", zIndex: 1 }}>
        <div style={heroStyle}>
          <div style={badgeStyle}>
            <Sparkles size={15} /> Azure • Logic Apps • ARM • Bicep • Terraform • APIM • ADF
          </div>
          <h1 style={titleStyle}>Azure Documentation AI</h1>
          <p style={subtitleStyle}>
            Upload Azure files and generate documentation, recommendations, diagrams, and PDF reports.
            Supports Logic App JSON, ARM templates, Bicep, Function App config, API Management exports,
            Terraform, and Azure Data Factory pipelines.
          </p>
        </div>

        <section style={cardStyle}>
          <div style={sectionTitleRow}>
            <div>
              <p style={eyebrowStyle}>Get started</p>
              <h2 style={sectionTitleStyle}>Upload Azure File</h2>
            </div>
          </div>

          <input
            type="file"
            accept=".json,.bicep,.tf,.tfvars,.yaml,.yml,.xml"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={fileInputStyle}
          />

          <div style={supportedTypesStyle}>
            <CapabilityPill icon={<Workflow size={14} />} text="Logic App JSON" />
            <CapabilityPill icon={<Boxes size={14} />} text="ARM Template" />
            <CapabilityPill icon={<FileCode2 size={14} />} text="Bicep" />
            <CapabilityPill icon={<Zap size={14} />} text="Function Config" />
            <CapabilityPill icon={<Network size={14} />} text="APIM Export" />
            <CapabilityPill icon={<Layers3 size={14} />} text="Terraform" />
            <CapabilityPill icon={<Database size={14} />} text="ADF Pipeline" />
          </div>

          <button onClick={analyzeFile} style={blueButton}>Analyze File</button>
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

            {result.detectedCapabilities?.length ? (
              <section style={cardStyle}>
                <h2>Detected Capabilities</h2>
                <div style={pillGridStyle}>
                  {result.detectedCapabilities.map((item, index) => (
                    <CapabilityPill key={index} icon={<Activity size={14} />} text={item} />
                  ))}
                </div>
              </section>
            ) : null}

            {result.complexity && (
              <section style={cardStyle}>
                <h2>Complexity Score</h2>
                <div style={miniGridStyle}>
                  <MetricCard title="Triggers" value={result.complexity.triggerCount} iconKind="logicapp" />
                  <MetricCard title="Actions" value={result.complexity.actionCount} iconKind="apiconnection" />
                  <MetricCard title="Expressions" value={result.complexity.expressionCount} iconKind="function" />
                  <MetricCard title="Dependency Depth" value={result.complexity.dependencyDepth} iconKind="servicebus" />
                  <MetricCard title="Complexity" value={result.complexity.score} iconKind="storage" />
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
                    <pre style={codeBlockStyle}>{JSON.stringify(result.samplePayload.request, null, 2)}</pre>
                  </div>
                  <div>
                    <h3>Sample Response</h3>
                    <pre style={codeBlockStyle}>{JSON.stringify(result.samplePayload.response, null, 2)}</pre>
                  </div>
                </div>
              </section>
            )}

            {result.expressions && result.expressions.length > 0 && (
              <section style={cardStyle}>
                <h2>Expression Analysis</h2>
                <div style={{ marginTop: "18px" }}>
                  {result.expressions.map((expression, index) => (
                    <pre key={index} style={codeBlockStyle}>{expression}</pre>
                  ))}
                </div>
              </section>
            )}

            <section style={cardStyle}>
              <h2 style={headingWithIconStyle}><ShieldCheck size={22} /> AI Recommendations</h2>
              <div style={{ marginTop: "18px" }}>
                {result.recommendations.map((item, index) => <RecommendationItem key={index} text={item} />)}
              </div>
            </section>

            {result.securityRecommendations && <RecommendationSection title="Security Recommendations" items={result.securityRecommendations} />}
            {result.errorHandlingRecommendations && <RecommendationSection title="Error Handling Recommendations" items={result.errorHandlingRecommendations} />}
            {result.monitoringRecommendations && <RecommendationSection title="Monitoring Recommendations" items={result.monitoringRecommendations} />}

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
                      <td style={tdStyle}><ServiceCell type={step.type} forcedKind={step.serviceKind} /></td>
                      <td style={tdStyle}>{step.name}</td>
                      <td style={tdStyle}>{step.type}</td>
                      <td style={tdStyle}>{step.runAfter?.length ? step.runAfter.join(", ") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={cardStyle}>
              <div style={headerRow}>
                <h2>Architecture / Workflow Diagram</h2>
                <div>
                  <button onClick={downloadDiagram} style={greenButton}>Download PNG</button>
                  <button onClick={exportPDF} style={purpleButton}>Export PDF</button>
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

function tryParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isAdfPipeline(json: any) {
  return json.properties?.activities || json.activities || json.type === "Microsoft.DataFactory/factories/pipelines";
}

function isFunctionConfig(fileName: string, json: any) {
  return fileName.includes("local.settings") || fileName.includes("host.json") || json.IsEncrypted !== undefined || json.version || json.Values || json.appSettings;
}

function isApimExport(json: any) {
  return json.openapi || json.swagger || json.paths || json.info?.title;
}

function looksLikeBicep(text: string) {
  return /resource\s+\w+\s+'Microsoft\./.test(text) || /param\s+\w+\s+\w+/.test(text);
}

function looksLikeTerraform(text: string) {
  return /resource\s+"azurerm_/.test(text) || /provider\s+"azurerm"/.test(text) || /data\s+"azurerm_/.test(text);
}

function looksLikeYamlApi(text: string) {
  return /openapi:\s*3\./i.test(text) || /swagger:\s*["']?2/i.test(text) || /paths:\s*\n/i.test(text);
}

function cleanDependsOn(dependsOn: any[]): string[] {
  if (!Array.isArray(dependsOn)) return [];
  return dependsOn.map((x) => String(x).split("/").pop()?.replace(/[\]\)']+/g, "") || String(x));
}

function normalizeName(value: any) {
  if (Array.isArray(value)) return value.join("/");
  return String(value).replace(/\[parameters\('([^']+)'\)\]/g, "$1");
}

function inferFunctionSettingType(key: string, value: any) {
  const text = `${key} ${value}`.toLowerCase();
  if (text.includes("storage")) return "Storage Connection Setting";
  if (text.includes("servicebus")) return "Service Bus Connection Setting";
  if (text.includes("sql")) return "SQL Connection Setting";
  if (text.includes("functions_worker_runtime")) return "Function Runtime";
  return "Function App Setting";
}

function commonSecurityRecommendations() {
  return [
    "Use Azure Key Vault for secrets and connection strings.",
    "Use managed identity and RBAC with least privilege.",
    "Review public network access and private endpoint requirements.",
    "Avoid hardcoded credentials in source files.",
  ];
}

function commonMonitoringRecommendations() {
  return [
    "Enable diagnostic settings and send logs to Log Analytics.",
    "Create Azure Monitor alerts for failures and availability issues.",
    "Use Application Insights for application-level telemetry where applicable.",
  ];
}

function getServiceKind(type: string): AzureServiceKind {
  const t = String(type).toLowerCase();

  if (t.includes("logic") || t.includes("workflow") || t.includes("request") || t.includes("response") || t.includes("compose")) return "logicapp";
  if (t.includes("bicep")) return "bicep";
  if (t.includes("arm") || t.includes("microsoft.resources/deployments")) return "arm";
  if (t.includes("apimanagement") || t.includes("openapi") || t.includes("api operation")) return "apim";
  if (t.includes("datafactory") || t.includes("adf") || t.includes("copy") || t.includes("pipeline")) return "adf";
  if (t.includes("azurerm_")) return "terraform";
  if (t.includes("apiconnection") || t.includes("connection") || t.includes("http")) return "apiconnection";
  if (t.includes("function") || t.includes("web/sites") || t.includes("serverfarms")) return "function";
  if (t.includes("servicebus") || t.includes("service bus")) return "servicebus";
  if (t.includes("storage") || t.includes("blob") || t.includes("queue")) return "storage";
  if (t.includes("sql") || t.includes("database")) return "database";

  return "azure";
}

function getServiceLabel(kind: AzureServiceKind) {
  const labels: Record<AzureServiceKind, string> = {
    logicapp: "Logic Apps",
    arm: "ARM Template",
    bicep: "Bicep",
    function: "Azure Functions",
    apim: "API Management",
    terraform: "Terraform",
    adf: "Data Factory",
    apiconnection: "API Connections",
    servicebus: "Service Bus",
    storage: "Storage Accounts",
    database: "Azure SQL",
    azure: "Azure Resource",
  };

  return labels[kind];
}

function diagramIcon(kind: AzureServiceKind) {
  const icons: Record<AzureServiceKind, string> = {
    logicapp: "🔀",
    arm: "📦",
    bicep: "💪",
    function: "⚡",
    apim: "🌐",
    terraform: "🏗️",
    adf: "🏭",
    apiconnection: "🔗",
    servicebus: "🚌",
    storage: "🗄️",
    database: "🛢️",
    azure: "☁️",
  };

  return `<div style='font-size:22px;line-height:1'>${icons[kind]}</div><div style='font-weight:700;margin-top:4px'>${getServiceLabel(kind)}</div>`;
}

function cleanNodeId(name: string) {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

function escapeDiagramText(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function MetricCard({ title, value, iconKind = "azure" }: { title: string; value: string | number; iconKind?: AzureServiceKind }) {
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

function ServiceCell({ type, forcedKind }: { type: string; forcedKind?: AzureServiceKind }) {
  const kind = forcedKind || getServiceKind(type);
  const label = getServiceLabel(kind);

  return (
    <div style={serviceCellStyle}>
      <AzureServiceIcon kind={kind} size={34} />
      <span>{label}</span>
    </div>
  );
}

function AzureServiceIcon({ kind, size = 36 }: { kind: AzureServiceKind; size?: number }) {
  const IconMap = {
    logicapp: GitBranch,
    arm: Boxes,
    bicep: FileCode2,
    function: Zap,
    apim: Network,
    terraform: Layers3,
    adf: Database,
    apiconnection: Network,
    servicebus: Braces,
    storage: Database,
    database: Database,
    azure: Sparkles,
  };

  const Icon = IconMap[kind];

  return (
    <div style={{ ...azureIconWrapStyle, width: size, height: size, borderRadius: Math.round(size * 0.32) }}>
      <Icon size={Math.round(size * 0.52)} strokeWidth={2.3} />
    </div>
  );
}

function RecommendationItem({ text }: { text: string }) {
  return (
    <div style={recommendationStyle}>
      <div style={recommendationIconWrap}><Activity size={15} strokeWidth={2.4} /></div>
      <span style={recommendationTextStyle}>{text}</span>
    </div>
  );
}

function RecommendationSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section style={cardStyle}>
      <h2>{title}</h2>
      <div style={{ marginTop: "18px" }}>
        {items.map((item, index) => <RecommendationItem key={index} text={item} />)}
      </div>
    </section>
  );
}

function CapabilityPill({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div style={capabilityPillStyle}>
      {icon}
      <span>{text}</span>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(circle at top left, rgba(37,99,235,0.28), transparent 32%), radial-gradient(circle at top right, rgba(6,182,212,0.16), transparent 30%), linear-gradient(135deg, #020617 0%, #07111f 48%, #0f172a 100%)",
  color: "#f8fafc",
  padding: "48px 32px",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const heroStyle: CSSProperties = { marginBottom: "34px", padding: "8px 0 2px" };
const badgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 14px", borderRadius: "999px", background: "rgba(59, 130, 246, 0.12)", border: "1px solid rgba(96, 165, 250, 0.28)", color: "#bfdbfe", fontSize: "13px", fontWeight: 700, letterSpacing: "0.03em", marginBottom: "18px" };
const titleStyle: CSSProperties = { fontSize: "56px", lineHeight: 1.05, fontWeight: 900, letterSpacing: "-0.04em", margin: 0, background: "linear-gradient(90deg, #ffffff, #bfdbfe 55%, #67e8f9)", WebkitBackgroundClip: "text", color: "transparent" };
const subtitleStyle: CSSProperties = { color: "#a8c7e8", marginTop: "16px", maxWidth: "900px", fontSize: "16px", lineHeight: 1.8 };
const sectionTitleRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between" };
const eyebrowStyle: CSSProperties = { margin: "0 0 6px", color: "#7dd3fc", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em" };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: "22px", letterSpacing: "-0.02em" };
const fileInputStyle: CSSProperties = { marginTop: "22px", width: "100%", maxWidth: "520px", padding: "14px", borderRadius: "14px", background: "rgba(2, 6, 23, 0.65)", border: "1px solid rgba(148, 163, 184, 0.18)", color: "#dbeafe" };
const cardStyle: CSSProperties = { marginTop: "28px", padding: "26px", borderRadius: "24px", background: "linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.58))", border: "1px solid rgba(148, 163, 184, 0.18)", boxShadow: "0 24px 80px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255,255,255,0.06)", backdropFilter: "blur(18px)" };
const gridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: "20px", marginTop: "28px" };
const miniGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginTop: "18px" };
const pillGridStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "18px" };
const supportedTypesStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "10px", margin: "18px 0 22px" };
const capabilityPillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 12px", borderRadius: "999px", background: "rgba(2, 6, 23, 0.48)", border: "1px solid rgba(125, 211, 252, 0.18)", color: "#dbeafe", fontSize: "13px", fontWeight: 700 };
const metricCardStyle: CSSProperties = { padding: "20px", borderRadius: "18px", background: "linear-gradient(145deg, rgba(2, 6, 23, 0.72), rgba(30, 41, 59, 0.48))", border: "1px solid rgba(125, 211, 252, 0.14)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" };
const metricHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" };
const azureIconWrapStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#e0f2fe", background: "linear-gradient(135deg, rgba(0, 120, 212, 0.95), rgba(37, 99, 235, 0.88))", border: "1px solid rgba(125, 211, 252, 0.32)", boxShadow: "0 10px 28px rgba(14, 165, 233, 0.22), inset 0 1px 0 rgba(255,255,255,0.16)" };
const serviceCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "12px", fontWeight: 700, color: "#bfdbfe" };
const headingWithIconStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", margin: 0 };
const recommendationStyle: CSSProperties = { marginBottom: "12px", padding: "14px 16px", borderRadius: "16px", background: "linear-gradient(135deg, rgba(2, 6, 23, 0.58), rgba(15, 23, 42, 0.72))", border: "1px solid rgba(56, 189, 248, 0.16)", color: "#dbeafe", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 12px 28px rgba(8, 47, 73, 0.18)" };
const recommendationIconWrap: CSSProperties = { minWidth: "32px", width: "32px", height: "32px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, rgba(34, 211, 238, 0.14), rgba(59, 130, 246, 0.12))", border: "1px solid rgba(103, 232, 249, 0.22)", color: "#67e8f9", boxShadow: "0 0 18px rgba(34, 211, 238, 0.16)" };
const recommendationTextStyle: CSSProperties = { lineHeight: 1.6, color: "#dbeafe" };
const infoBoxStyle: CSSProperties = { marginBottom: "14px", padding: "18px", borderRadius: "18px", background: "rgba(2, 6, 23, 0.48)", border: "1px solid rgba(96, 165, 250, 0.16)" };
const tableStyle: CSSProperties = { width: "100%", marginTop: "20px", borderCollapse: "separate", borderSpacing: "0 10px" };
const tdStyle: CSSProperties = { padding: "14px 12px", color: "#e2e8f0", background: "rgba(2, 6, 23, 0.35)", borderTop: "1px solid rgba(148, 163, 184, 0.08)", borderBottom: "1px solid rgba(148, 163, 184, 0.08)" };
const headerRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" };
const diagramBox: CSSProperties = { background: "radial-gradient(circle at top, rgba(37, 99, 235, 0.16), transparent 42%), rgba(2, 6, 23, 0.58)", padding: "30px", borderRadius: "22px", overflowX: "auto", border: "1px solid rgba(148, 163, 184, 0.14)" };
const diagramInner: CSSProperties = { display: "flex", justifyContent: "center", minHeight: "500px" };
const twoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px", marginTop: "18px" };
const codeBlockStyle: CSSProperties = { background: "rgba(2, 6, 23, 0.72)", border: "1px solid rgba(96, 165, 250, 0.14)", color: "#dbeafe", padding: "18px", borderRadius: "18px", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" };
const blueButton: CSSProperties = { background: "linear-gradient(135deg, #2563eb, #06b6d4)", border: "none", padding: "13px 26px", borderRadius: "14px", color: "white", cursor: "pointer", fontWeight: "bold", boxShadow: "0 16px 34px rgba(37, 99, 235, 0.34)" };
const greenButton: CSSProperties = { background: "linear-gradient(135deg, #059669, #22c55e)", border: "none", padding: "11px 20px", borderRadius: "14px", color: "white", cursor: "pointer", fontWeight: "bold", boxShadow: "0 14px 28px rgba(34, 197, 94, 0.2)" };
const purpleButton: CSSProperties = { background: "linear-gradient(135deg, #7c3aed, #ec4899)", border: "none", padding: "11px 20px", borderRadius: "14px", color: "white", cursor: "pointer", fontWeight: "bold", marginLeft: "10px", boxShadow: "0 14px 28px rgba(124, 58, 237, 0.24)" };
