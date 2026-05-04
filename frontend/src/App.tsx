import QuickReq from "./components/QuickReq";
import "./App.css";

function App() {
  return (
    <div className="qa-page">
      <div className="qa-shell">
        <div className="qa-titleRow">
          <div className="qa-title">QuickApi</div>
        </div>

        <div className="qa-panel">
          <QuickReq />
        </div>
      </div>
    </div>
  );
}

export default App;
