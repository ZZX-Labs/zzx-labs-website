# Shaka-Kahn

`/projects/software/shaka-kahn/`

Shaka-Kahn is a CUDA-accelerated keysearch and brute-force research suite featuring modular kernels for cryptographic benchmarking, password testing, and distributed compute experiments (internal).

**INTERNAL – Not for public distribution.**

The web companion is limited to synthetic benchmarking and keyspace math. It benchmarks SHA-256 throughput on generated benchmark strings and estimates abstract keyspace sweep times.

It does not accept passwords, credentials, wallet keys, private keys, or target hashes, and does not perform cracking.

Native research dependencies: `python3, pycuda, numpy, torch`.

Version: `0.2.0-internal`  
License: `Proprietary – Internal`
