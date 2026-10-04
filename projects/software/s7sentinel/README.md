# S7Sentinel

`/projects/software/s7sentinel/`

S7Sentinel is a defensive, read-only OT/ICS security framework for Siemens S7 PLC security assessment and AI-agentic intrusion detection. Implements AA26-231A hardening checks, TCP/102 exposure analysis, engineering-workstation artifact hunting, normalized telemetry analytics, and MITRE ATT&CK/D3FEND mapping without PLC writes, exploit execution, credential attacks, or Internet-wide scanning.

The browser companion performs read-only analysis of user-supplied OT inventory, sanitized logs, and local text/script artifacts. It covers TCP/102 exposure flags, allowlisting, engineering-workstation review, backup posture, artifact string hunting, telemetry review, and JSON report export.

It performs no PLC writes, exploit execution, credential attacks, remote scanning, or Internet-wide discovery.

Version: `0.3.0`  
License: `MIT`
