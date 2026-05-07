import QuickReq from "./components/QuickReq";
import "./App.css";

/**
 * Root Application Component.
 * Wraps the main QuickApi tool in a shell for layout and global styling.
 */
function App() {
  return (
    <div className="qa-page">
      <div className="qa-shell">
        {/* Main Header / Branding */}
        <div className="qa-titleRow">
          <div className="qa-title">QuickApi</div>
        </div>

        {/* Content Panel containing the Request Tool */}
        <div className="qa-panel">
          <QuickReq />
        </div>
      </div>
    </div>
  );
}

export default App;
