import { useState } from "react";
import type { KeyboardEvent } from "react";

type Header = { key: string; value: string };

type HistoryItem = {
  url: string;
  method: string;
  headers: Header[];
  body: string;
};

function QuickReq() {
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("POST");
  const [headers, setHeaders] = useState<Header[]>([]);
  const [body, setBody] = useState("");
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState<number | null>(0);
  const [time, setTime] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem("quickreq_history");
    return saved ? JSON.parse(saved) : [];
  });

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("quickreq_history");
  };

  const handleAddHeader = () => {
    setHeaders([...headers, { key: "", value: "" }]);
  };

  const handleHeaderChange = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    const updated = [...headers];
    updated[index][field] = value;
    setHeaders(updated);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      sendRequest();
    }
  };

  const loadHistory = (item: HistoryItem) => {
    setUrl(item.url);
    setMethod(item.method);
    setHeaders(item.headers);
    setBody(item.body);
  };

  const sendRequest = async () => {
    if (!url) return;

    setLoading(true);
    setResponse("");
    const start = Date.now();

    try {
      const headerObj: Record<string, string> = {};
      headers.forEach((h) => {
        if (h.key) headerObj[h.key] = h.value;
      });

      if (body && method !== "GET") {
        try {
          JSON.parse(body);
        } catch (e) {
          setResponse("Invalid JSON: " + (e as Error).message);
          setLoading(false);
          return;
        }
      }

      if (body && !headerObj["Content-Type"]) {
        headerObj["Content-Type"] = "application/json";
      }

      const res = await fetch(url, {
        method,
        headers: headerObj,
        body: method !== "GET" ? body : undefined,
      });

      const text = await res.text();

      setStatus(res.status);
      setTime(Date.now() - start);

      const newItem: HistoryItem = { url, method, headers, body };
      const updatedHistory = [newItem, ...history].slice(0, 5);

      setHistory(updatedHistory);
      localStorage.setItem("quickreq_history", JSON.stringify(updatedHistory));

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
          <h4>Request</h4>
          <div className="qr-topRow">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
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

          <h4>Headers</h4>
          {headers.map((h, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "10px",
                marginBottom: "5px",
              }}
            >
              <input
                placeholder="Key"
                value={h.key}
                onChange={(e) => handleHeaderChange(i, "key", e.target.value)}
              />
              <input
                placeholder="Value"
                value={h.value}
                onChange={(e) => handleHeaderChange(i, "value", e.target.value)}
              />
            </div>
          ))}
          <button onClick={handleAddHeader}>+ Add Header</button>

          <h4>Body</h4>
          <textarea
            rows={5}
            className="qr-body"
            placeholder='{"key": "value"}'
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key === "Enter") sendRequest();
            }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
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
                  border: "1px solid #ccc",
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
          <h4>Response</h4>
          <div>
            Status: {status} | Time: {time} ms
          </div>
          <div
            style={{
              padding: "16px",
              margin: "0 auto",
              textAlign: "left",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <button onClick={() => navigator.clipboard.writeText(response)}>
                Copy
              </button>
              <button onClick={() => setResponse("")}>Clear</button>
            </div>
            <pre
              className="qr-pre"
            >
              {response}
            </pre>
          </div>
        </div>
    </div>
  );
}

export default QuickReq;

