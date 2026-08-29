# ZZX-Core

`/projects/software/zzxcore/`

ZZX-Core is the unified backend controller and orchestration system for all ZZX services—providing a GUI host for modular APIs, stack control, and mirrored backend operations.

This deployment is container-free. It uses direct local Python/Flask/PyQt-style service profiles instead of Docker.

The browser workbench provides modular service registration, port/health configuration, enable/disable state, stack-plan generation, NGINX adapter generation, and JSON export. A native read-only Flask registry/status service is included under `native/`.

Version: `0.4.0-alpha`
License: `MIT`
