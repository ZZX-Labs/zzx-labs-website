# PortraitGen

`/projects/software/portraitgen/`

PortraitGen is a promptable portrait generation toolkit integrating Stable Diffusion and fine-tuned face models with style-locks, reproducibility seeds, and data-provenance tags for creative and research applications.

The static project page is a reproducible job/provenance workbench rather than a fake in-browser diffusion model.

It provides prompt and negative-prompt configuration, model/scheduler selection, style locks, deterministic seeds, dimensions/steps/guidance, local reference-image SHA-256 fingerprints, job fingerprints, JSON export, and a native CLI execution plan.

The actual model stack belongs in the native project defined by the manifest: `python3, torch, diffusers, transformers, pyqt5, pillow`.

Version: `0.2.0-alpha`  
License: `MIT`
