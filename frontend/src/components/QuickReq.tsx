import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * QuickReq Component: A functional API request tool.
 * Handles URL input, HTTP methods, headers (Key-Value), and request body (Raw or Key-Value).
 * Includes features like cURL import, history management, and response visualization.
 */

type Header = { key: string; value: string };
type KvPair = { key: string; value: string };

type HistoryItem = {
  url: string;
  method: string;
  headers: Header[];
  body: string;
  bodyType?: "raw" | "kv";
  kvBody?: KvPair[];
};

type ProxyResponse = {
  status: number;
  elapsed_ms: number;
  headers: Record<string, string>;
  body: string;
};

// Base URL for the proxy API, defaults to empty string if not provided in environment
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function QuickReq() {
  // --- Request State ---
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("POST");
  const [headers, setHeaders] = useState<Header[]>([]);
  const [bodyType, setBodyType] = useState<"raw" | "kv">("raw");
  const [body, setBody] = useState("");
  const [kvBody, setKvBody] = useState<KvPair[]>([]);
  
  // --- Response State ---
  const [response, setResponse] = useState("");
  const [resHeaders, setResHeaders] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<number | null>(0);
  const [time, setTime] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  
  // --- UI Control State ---
  const [showCurlImport, setShowCurlImport] = useState(false);
  const [curlText, setCurlText] = useState("");
  const [prettyPrint, setPrettyPrint] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);

  // --- History Management ---
  // Load history from localStorage on initialization
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem("quickreq_history");
    return saved ? JSON.parse(saved) : [];
  });

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("quickreq_history");
  };

  // --- Header Helpers ---
  const handleAddHeader = () => {
    setHeaders([...headers, { key: "", value: "" }]);
  };

  const handleRemoveHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const handleHeaderChange = (index: number, field: "key" | "value", value: string) => {
    const updated = [...headers];
    updated[index] = { ...updated[index], [field]: value };
    setHeaders(updated);
  };

  // --- Key-Value Body Helpers ---
  const handleAddKv = () => {
    setKvBody([...kvBody, { key: "", value: "" }]);
  };

  const handleRemoveKv = (index: number) => {
    setKvBody(kvBody.filter((_, i) => i !== index));
  };

  const handleKvChange = (index: number, field: "key" | "value", value: string) => {
    const updated = [...kvBody];
    updated[index] = { ...updated[index], [field]: value };
    setKvBody(updated);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      sendRequest();
    }
  };

  /** Populates the request form with data from a history item */
  const loadHistory = (item: HistoryItem) => {
    setUrl(item.url);
    setMethod(item.method);
    setHeaders(item.headers.map(h => ({ ...h })));
    setBodyType(item.bodyType || "raw");
    setBody(item.body);
    setKvBody(item.kvBody ? item.kvBody.map(kv => ({ ...kv })) : []);
  };

  /** 
   * Simple cURL parser: Extracts method, URL, headers, and data from a cURL string.
   * Note: This is a basic implementation and doesn't handle all cURL flags.
   */
  const handleImportCurl = () => {
    if (!curlText.trim()) return;

    let parsedMethod = "GET";
    let parsedUrl = "";
    const parsedHeaders: Header[] = [];
    let parsedBody = "";

    // Basic regex-based tokenization to handle quoted strings
    const regex = /'([^']*)'|"([^"]*)"|([^\s]+)/g;
    const tokens: string[] = [];
    let match;
    while ((match = regex.exec(curlText)) !== null) {
      tokens.push(match[1] || match[2] || match[3]);
    }

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "curl") continue;
      if (t === "-X" || t === "--request") {
        if (i + 1 < tokens.length) parsedMethod = tokens[++i].toUpperCase();
      } else if (t === "-H" || t === "--header") {
        if (i + 1 < tokens.length) {
          const h = tokens[++i];
          const splitIdx = h.indexOf(":");
          if (splitIdx > -1) {
            parsedHeaders.push({ key: h.slice(0, splitIdx).trim(), value: h.slice(splitIdx + 1).trim() });
          }
        }
      } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
        if (i + 1 < tokens.length) {
          parsedBody = tokens[++i];
          if (parsedMethod === "GET") parsedMethod = "POST";
        }
      } else if (t.startsWith("http://") || t.startsWith("https://") || t.startsWith("localhost")) {
        parsedUrl = t;
      }
    }

    setUrl(parsedUrl);
    setMethod(parsedMethod);
    setHeaders(parsedHeaders);
    if (parsedBody) {
      setBodyType("raw");
      setBody(parsedBody);
    }
    setCurlText("");
    setShowCurlImport(false);
  };

  /** 
   * Main request handler: 
   * - Decides whether to send request through the proxy or directly (for localhost).
   * - Collects and formats headers and body.
   * - Updates response state and history.
   */
  const sendRequest = async () => {
    if (!url) return;

    setLoading(true);
    setResponse("");
    setResHeaders({});
    const start = Date.now();

    try {
      // 1. Headers Preparation
      const headerObj: Record<string, string> = {};
      headers.forEach((h) => {
        if (h.key) headerObj[h.key] = h.value;
      });

      // 2. Body Preparation
      let finalBodyStr = body;
      if (method !== "GET" && bodyType === "kv") {
        const obj: Record<string, string> = {};
        kvBody.forEach(kv => {
          if (kv.key) obj[kv.key] = kv.value;
        });
        finalBodyStr = JSON.stringify(obj);
      }

      // JSON Validation
      if (finalBodyStr && method !== "GET") {
        try {
          JSON.parse(finalBodyStr);
        } catch (e) {
          setResponse("Invalid JSON: " + (e as Error).message);
          setLoading(false);
          return;
        }
      }

      // Default Content-Type if body exists
      if (finalBodyStr && !headerObj["Content-Type"]) {
        headerObj["Content-Type"] = "application/json";
      }

      // 3. Security Check: Host Resolution Decisions
      // Requests to local addresses must be handled DIRECTLY by the browser to avoid SSRF on the backend proxy.
      const isLocalhost = (() => {
        try {
          const urlObj = new URL(url);
          const hn = urlObj.hostname;
          
          if (hn === "localhost" || hn === "127.0.0.1" || hn === "[::1]") return true;
          if (hn.endsWith(".local") || hn.endsWith(".localhost")) return true;
          
          // Private IP ranges
          if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hn)) return true;
          if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hn)) return true;
          if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hn)) return true;
          if (/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hn)) return true;
          
          return false;
        } catch {
          return false;
        }
      })();

      let text = "";
      let responseStatus = 0;
      let responseTime = 0;
      let responseHeadersDict: Record<string, string> = {};

      if (isLocalhost) {
        // Direct browser-to-target request for local development
        const fetchOptions: RequestInit = {
          method,
          headers: headerObj,
        };
        if (method !== "GET" && finalBodyStr) {
          fetchOptions.body = finalBodyStr;
        }
        
        try {
          const localRes = await fetch(url, fetchOptions);
          text = await localRes.text();
          responseStatus = localRes.status;
          responseTime = Date.now() - start;
          localRes.headers.forEach((value, key) => {
            responseHeadersDict[key] = value;
          });
        } catch (err: unknown) {
          throw new Error(`Failed to fetch local url: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        // Proxied request through backend for cross-origin or secure internet APIs
        const res = await fetch(`${API_BASE_URL}/api/proxy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            method,
            headers: Object.entries(headerObj).map(([key, value]) => ({
              key,
              value,
            })),
            body: method !== "GET" ? finalBodyStr : undefined,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText);
        }

        const proxyResponse = (await res.json()) as ProxyResponse;
        text = proxyResponse.body;
        responseStatus = proxyResponse.status;
        responseTime = proxyResponse.elapsed_ms || Date.now() - start;
        responseHeadersDict = proxyResponse.headers;
      }

      // 4. Update Success State
      setStatus(responseStatus);
      setTime(responseTime);
      setResHeaders(responseHeadersDict);

      // Save to History
      const newItem: HistoryItem = { url, method, headers, body, bodyType, kvBody };
      const updatedHistory = [newItem, ...history].slice(0, 5);

      setHistory(updatedHistory);
      localStorage.setItem("quickreq_history", JSON.stringify(updatedHistory));

      // Attempt to format JSON for display
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setResponse("Error: " + errorMessage);
    }

    setLoading(false);
  };

  return (
    <div className="qr-root">
        <div className="qr-left">
          {/* --- Request Configuration --- */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4>Request</h4>
            <button 
              onClick={() => setShowCurlImport(!showCurlImport)}
              style={{ fontSize: "12px", padding: "4px 8px", cursor: "pointer", background: "transparent", border: "1px solid #ccc", borderRadius: "4px" }}
            >
              Import cURL
            </button>
          </div>

          {/* cURL Import Panel */}
          {showCurlImport && (
            <div style={{ marginBottom: "10px", padding: "10px", border: "1px solid rgba(128, 128, 128, 0.3)", borderRadius: "4px" }}>
              <textarea
                className="qr-body"
                placeholder="Paste your cURL command here..."
                value={curlText}
                onChange={(e) => setCurlText(e.target.value)}
                rows={3}
                style={{ width: "100%", marginBottom: "10px", fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button onClick={() => setShowCurlImport(false)} style={{ background: "transparent", border: "1px solid rgba(128, 128, 128, 0.5)", cursor: "pointer", color: "inherit", padding: "4px 12px", borderRadius: "4px" }}>Cancel</button>
                <button onClick={handleImportCurl} style={{ padding: "4px 12px", background: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Import</button>
              </div>
            </div>
          )}

          {/* URL & Method Row */}
          <div className="qr-topRow">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
              <option>PATCH</option>
            </select>

            <input
              className="qr-url"
              placeholder="Enter API URL"
              value={url}
              onKeyDown={handleKeyDown}
              onChange={(e) => setUrl(e.target.value)}
            />

            <button onClick={sendRequest} disabled={loading}>
              {loading ? "Sending..." : "Send"}
            </button>
          </div>

          {/* Headers Row Configuration */}
          <h4>Headers</h4>
          {headers.map((h, i) => (
            <div key={i} className="qr-kv-row">
              <input
                className="qr-kv-input"
                placeholder="Key"
                value={h.key}
                onChange={(e) => handleHeaderChange(i, "key", e.target.value)}
              />
              <input
                className="qr-kv-input"
                placeholder="Value"
                value={h.value}
                onChange={(e) => handleHeaderChange(i, "value", e.target.value)}
              />
              <button 
                onClick={() => handleRemoveHeader(i)}
                style={{ padding: "4px 8px", background: "#ff4d4f", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
                title="Remove Header"
              >
                ✕
              </button>
            </div>
          ))}
          <button onClick={handleAddHeader}>+ Add Header</button>

          {/* Body Type Selector */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "15px", marginBottom: "10px" }}>
            <h4 style={{ margin: 0 }}>Body</h4>
            <div style={{ display: "flex", gap: "10px", fontSize: "14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                <input 
                  type="radio" 
                  checked={bodyType === "raw"} 
                  onChange={() => setBodyType("raw")} 
                />
                Raw JSON
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                <input 
                  type="radio" 
                  checked={bodyType === "kv"} 
                  onChange={() => setBodyType("kv")} 
                />
                Key-Value
              </label>
            </div>
          </div>

          {/* Dynamic Body Input Area */}
          {bodyType === "raw" ? (
            <textarea
              rows={5}
              className="qr-body"
              placeholder='{"key": "value"}'
              onKeyDown={(e) => {
                if (e.ctrlKey && e.key === "Enter") sendRequest();
              }}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ resize: "vertical" }}
            />
          ) : (
            <div>
              {kvBody.map((kv, i) => (
                <div key={i} className="qr-kv-row">
                  <input
                    className="qr-kv-input"
                    placeholder="Key"
                    value={kv.key}
                    onChange={(e) => handleKvChange(i, "key", e.target.value)}
                  />
                  <input
                    className="qr-kv-input"
                    placeholder="Value"
                    value={kv.value}
                    onChange={(e) => handleKvChange(i, "value", e.target.value)}
                  />
                  <button 
                    onClick={() => handleRemoveKv(i)}
                    style={{ padding: "4px 8px", background: "#ff4d4f", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
                    title="Remove Pair"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button onClick={handleAddKv}>+ Add Key-Value</button>
            </div>
          )}

          {/* --- Request History --- */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "20px"
            }}
          >
            <h4>History</h4>
            <button
              onClick={clearHistory}
              style={{
                fontSize: "12px",
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
          <div style={{ marginBottom: "10px" }}>
            {history.length === 0 && (
              <p style={{ color: "#888" }}>No history yet</p>
            )}

            {history.map((item, index) => (
              <div
                key={index}
                onClick={() => loadHistory(item)}
                style={{
                  padding: "6px",
                  border: "1px solid rgba(128, 128, 128, 0.3)",
                  marginBottom: "5px",
                  cursor: "pointer",
                  borderRadius: "4px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <strong>{item.method}</strong> {item.url}
              </div>
            ))}
          </div>
        </div>

        <div className="qr-right">
          {/* --- Response Display --- */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h4 style={{ margin: 0 }}>Response</h4>
            <div style={{ display: "flex", gap: "15px", fontSize: "14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                <input type="checkbox" checked={prettyPrint} onChange={(e) => setPrettyPrint(e.target.checked)} />
                Pretty Print
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                <input type="checkbox" checked={showHeaders} onChange={(e) => setShowHeaders(e.target.checked)} />
                Show Headers
              </label>
            </div>
          </div>
          
          <div style={{ marginBottom: "10px", fontSize: "14px", fontWeight: "500" }}>
            Status: <span style={{ color: status !== null ? (status >= 200 && status < 300 ? "#28a745" : status >= 400 ? "#dc3545" : "#fd7e14") : "inherit", fontWeight: "bold" }}>{status}</span> | Time: {time} ms
          </div>

          {/* Response Container */}
          <div
            style={{
              margin: "0 auto",
              textAlign: "left",
              border: "1px solid rgba(128, 128, 128, 0.3)",
              borderRadius: "4px",
              padding: "16px",
              minHeight: "200px"
            }}
          >
            {/* Copy/Clear Buttons */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <button onClick={() => navigator.clipboard.writeText(response)} style={{ padding: "4px 12px", background: "transparent", border: "1px solid rgba(128, 128, 128, 0.5)", borderRadius: "4px", cursor: "pointer", color: "inherit" }}>
                Copy
              </button>
              <button onClick={() => setResponse("")} style={{ padding: "4px 12px", background: "transparent", border: "1px solid rgba(128, 128, 128, 0.5)", borderRadius: "4px", cursor: "pointer", color: "inherit" }}>Clear</button>
            </div>
            
            {/* Response Headers View */}
            {showHeaders && Object.keys(resHeaders).length > 0 && (
              <div style={{ marginBottom: "20px", padding: "10px", background: "rgba(128, 128, 128, 0.1)", borderRadius: "4px" }}>
                <h5 style={{ marginTop: 0, marginBottom: "8px" }}>Response Headers</h5>
                {Object.entries(resHeaders).map(([k, v]) => (
                  <div key={k} style={{ fontSize: "12px", fontFamily: "monospace", marginBottom: "4px" }}>
                    <strong>{k}:</strong> <span style={{ opacity: 0.8 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Response Content View: Syntax Highlighter vs Raw Pre */}
            {prettyPrint ? (
              <SyntaxHighlighter 
                language="json" 
                style={vscDarkPlus} 
                customStyle={{ margin: 0, borderRadius: "4px", padding: "16px", fontSize: "13px" }}
                wrapLongLines={true}
              >
                {response}
              </SyntaxHighlighter>
            ) : (
              <pre
                className="qr-pre"
                style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {response}
              </pre>
            )}
          </div>
        </div>
    </div>
  );
}

export default QuickReq;
