import { render } from "preact";
import * as state from "./state";
import { App } from "./ui/App";
import "./styles.css";

if (import.meta.env.DEV) (window as unknown as { __sidtune: typeof state }).__sidtune = state;

render(<App />, document.getElementById("app")!);
