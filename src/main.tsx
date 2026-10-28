import { render } from "preact";
import * as state from "./state";
import { App } from "./ui/App";
import { setupTooltips } from "./ui/tooltips";
import "./styles.css";

if (import.meta.env.DEV) (window as unknown as { __sidtune: typeof state }).__sidtune = state;

setupTooltips();
render(<App />, document.getElementById("app")!);
