"use client";

import { useState } from "react";

type AzureResource = {
  name: string;
  type: string;
  location: string;
  resourceGroup: string;
};

type AnalyzeResponse = {
  summary: string;
  totalResources: number;
  resources: AzureResource[];
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const analyzeFile = async () => {
    if (!file) {
      alert("Please select a JSON file first.");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      alert("Something went wrong while analyzing the file.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3">Azure Documentation AI</h1>
          <p className="text-gray-400">
            Upload Azure resource JSON and generate instant cloud documentation.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Upload Azure JSON</h2>

          <input
            type="file"
            accept=".json"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-300
              file:mr-4 file:rounded-lg file:border-0
              file:bg-blue-600 file:px-4 file:py-2
              file:text-white hover:file:bg-blue-700"
          />

          <button
            onClick={analyzeFile}
            disabled={loading}
            className="mt-5 rounded-lg bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Analyze File"}
          </button>
        </div>

        {result && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <p className="text-gray-400 text-sm">Total Resources</p>
                <h3 className="text-3xl font-bold mt-2">
                  {result.totalResources}
                </h3>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 md:col-span-2">
                <p className="text-gray-400 text-sm">AI Summary</p>
                <p className="mt-2 text-lg">{result.summary}</p>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4">Resource Inventory</h2>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-gray-400">
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Type</th>
                      <th className="py-3 pr-4">Location</th>
                      <th className="py-3 pr-4">Resource Group</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.resources.map((resource, index) => (
                      <tr key={index} className="border-b border-gray-800">
                        <td className="py-3 pr-4">{resource.name}</td>
                        <td className="py-3 pr-4 text-blue-300">
                          {resource.type}
                        </td>
                        <td className="py-3 pr-4">{resource.location}</td>
                        <td className="py-3 pr-4">
                          {resource.resourceGroup}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}