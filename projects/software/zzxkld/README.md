# ZZX-KLD

`/projects/software/zzxkld/`

Key Logger Defense suite providing real-time input monitoring, keystroke encryption, and anomaly detection across user systems. Designed to detect unauthorized input capture and mitigate data exfiltration attempts through randomized input masking, integrity validation, and active threat countermeasures. Includes CLI, GUI, and system daemon modes for Windows, Linux, and macOS.

This deployment implements the defensive side of KLD: imported/manual indicators for unknown input hooks, unverified drivers, clipboard readers, startup anomalies, integrity mismatches, a privacy-preserving input-event test box that never retains key values, defense-policy export, and a native read-only process/startup inventory helper.

It intentionally does not implement global keystroke capture, hidden hooks, credential collection, stealth monitoring, or keystroke logging.

Version: `0.1.0-alpha`
License: `MIT`
