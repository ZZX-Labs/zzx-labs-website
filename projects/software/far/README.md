# FAR (Firefox Audio Router) Add-on

Browser workbench for the Firefox Audio Router project.

The page can request audio permission, enumerate devices, preview a local audio file, apply Web Audio gain/pan, and use `HTMLMediaElement.setSinkId()` for its own preview audio when supported. It also models per-tab route policies and generates a WebExtension manifest.

Universal per-tab routing cannot be implemented by an ordinary webpage. Full routing depends on Firefox extension APIs, OS audio backends, and potentially a native companion.

Deploy directly into `/projects/software/far/`.

`logo.png` is intentionally omitted.
