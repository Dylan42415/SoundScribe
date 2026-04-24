import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.log("[main] React initializing...");

// Environment validation
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("[main] CRITICAL: Missing Supabase environment variables!");
  // Display a visible error if possible
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = '<div style="color:red;padding:20px;font-family:sans-serif;">' +
      '<h2>Configuration Error</h2>' +
      '<p>Missing required environment variables (VITE_SUPABASE_URL/KEY). Please check your production settings.</p>' +
      '</div>';
  }
} else {
  console.log("[main] Environment variables verified.");
}

createRoot(document.getElementById("root")!).render(<App />);
console.log("[main] React render triggered.");
