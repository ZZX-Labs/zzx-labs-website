#!/usr/bin/env python3
"""
ZZX-Labs Bitnodes Bitcoin P2P helpers.

This module performs a minimal Bitcoin protocol handshake:

1. Open TCP connection.
2. Send version message.
3. Read version/verack response messages.
4. Extract protocol version, services, user agent, start height, relay flag.
5. Return Bitnodes-compatible metadata.

No wallet logic. No private keys. No transaction signing. No mining.
"""

from __future__ import annotations

import hashlib
import ipaddress
import os
import random
import socket
import struct
import time
from dataclasses import dataclass
from typing import Any


MAGIC = {
    "mainnet": b"\xf9\xbe\xb4\xd9",
    "testnet": b"\x0b\x11\x09\x07",
    "signet": b"\x0a\x03\xcf\x40",
    "regtest": b"\xfa\xbf\xb5\xda"
}

DEFAULT_PORTS = {
    "mainnet": 8333,
    "testnet": 18333,
    "signet": 38333,
    "regtest": 18444
}

NODE_NETWORK = 1
DEFAULT_PROTOCOL_VERSION = 70016
MAX_MESSAGE_SIZE = 32 * 1024 * 1024


@dataclass
class VersionInfo:
    address: str
    protocol_version: int | None
    services: int | None
    timestamp: int | None
    user_agent: str | None
    start_height: int | None
    relay: bool | None
    latency_ms: int | None
    connected: bool
    error: str | None = None


def sha256d(payload: bytes) -> bytes:
    return hashlib.sha256(
        hashlib.sha256(payload).digest()
    ).digest()


def checksum(payload: bytes) -> bytes:
    return sha256d(payload)[:4]


def now_ts() -> int:
    return int(time.time())


def encode_varint(value: int) -> bytes:
    if value < 0xfd:
        return struct.pack("<B", value)

    if value <= 0xffff:
        return b"\xfd" + struct.pack("<H", value)

    if value <= 0xffffffff:
        return b"\xfe" + struct.pack("<I", value)

    return b"\xff" + struct.pack("<Q", value)


def read_varint(payload: bytes, offset: int = 0) -> tuple[int, int]:
    if offset >= len(payload):
        raise ValueError("varint offset beyond payload")

    prefix = payload[offset]
    offset += 1

    if prefix < 0xfd:
        return prefix, offset

    if prefix == 0xfd:
        if offset + 2 > len(payload):
            raise ValueError("short uint16 varint")

        return struct.unpack_from("<H", payload, offset)[0], offset + 2

    if prefix == 0xfe:
        if offset + 4 > len(payload):
            raise ValueError("short uint32 varint")

        return struct.unpack_from("<I", payload, offset)[0], offset + 4

    if offset + 8 > len(payload):
        raise ValueError("short uint64 varint")

    return struct.unpack_from("<Q", payload, offset)[0], offset + 8


def encode_varstr(text: str) -> bytes:
    raw = text.encode("utf-8", errors="replace")
    return encode_varint(len(raw)) + raw


def read_varstr(payload: bytes, offset: int = 0) -> tuple[str, int]:
    length, offset = read_varint(payload, offset)

    end = offset + length

    if end > len(payload):
        raise ValueError("short varstr")

    return payload[offset:end].decode(
        "utf-8",
        errors="replace"
    ), end


def split_host_port(address: str, default_port: int) -> tuple[str, int]:
    value = address.strip()

    if value.startswith("[") and "]:" in value:
        host, port_text = value[1:].split("]:", 1)
        return host, int(port_text)

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1], default_port

    if ".onion:" in value:
        host, port_text = value.rsplit(":", 1)
        return host, int(port_text)

    if value.endswith(".onion"):
        return value, default_port

    if value.count(":") == 1:
        host, port_text = value.rsplit(":", 1)

        if port_text.isdigit():
            return host, int(port_text)

    if value.count(":") > 1:
        possible_host, possible_port = value.rsplit(":", 1)

        if possible_port.isdigit():
            return possible_host, int(possible_port)

    return value, default_port


def format_address(host: str, port: int) -> str:
    try:
        ip = ipaddress.ip_address(host)

        if isinstance(ip, ipaddress.IPv6Address):
            return f"[{host}]:{port}"

        return f"{host}:{port}"

    except ValueError:
        return f"{host}:{port}"


def ip_to_16_bytes(host: str) -> bytes:
    try:
        ip = ipaddress.ip_address(host)

        if isinstance(ip, ipaddress.IPv4Address):
            return b"\x00" * 10 + b"\xff\xff" + ip.packed

        return ip.packed

    except ValueError:
        return b"\x00" * 16


def encode_net_addr(
    host: str,
    port: int,
    services: int = NODE_NETWORK,
    with_timestamp: bool = False
) -> bytes:

    payload = b""

    if with_timestamp:
        payload += struct.pack("<I", now_ts())

    payload += struct.pack("<Q", services)
    payload += ip_to_16_bytes(host)
    payload += struct.pack(">H", port)

    return payload


def make_message(
    command: str,
    payload: bytes,
    network: str = "mainnet"
) -> bytes:

    magic = MAGIC.get(network, MAGIC["mainnet"])
    command_raw = command.encode("ascii")[:12].ljust(12, b"\x00")

    return (
        magic +
        command_raw +
        struct.pack("<I", len(payload)) +
        checksum(payload) +
        payload
    )


def parse_message_header(
    header: bytes,
    network: str = "mainnet"
) -> tuple[str, int, bytes]:

    if len(header) != 24:
        raise ValueError("short message header")

    expected_magic = MAGIC.get(network, MAGIC["mainnet"])
    magic, command_raw, length, check = struct.unpack("<4s12sI4s", header)

    if magic != expected_magic:
        raise ValueError("wrong network magic")

    if length > MAX_MESSAGE_SIZE:
        raise ValueError(f"message too large: {length}")

    command = command_raw.rstrip(b"\x00").decode(
        "ascii",
        errors="replace"
    )

    return command, length, check


def make_version_payload(
    remote_host: str,
    remote_port: int,
    local_host: str = "0.0.0.0",
    local_port: int = 0,
    user_agent: str = "/ZZX-Labs-Bitnodes:0.1.0/",
    protocol_version: int = DEFAULT_PROTOCOL_VERSION,
    services: int = NODE_NETWORK,
    start_height: int = 0,
    relay: bool = True
) -> bytes:

    timestamp = now_ts()
    nonce = random.getrandbits(64)

    payload = b""
    payload += struct.pack("<i", protocol_version)
    payload += struct.pack("<Q", services)
    payload += struct.pack("<q", timestamp)
    payload += encode_net_addr(remote_host, remote_port, services, with_timestamp=False)
    payload += encode_net_addr(local_host, local_port, services, with_timestamp=False)
    payload += struct.pack("<Q", nonce)
    payload += encode_varstr(user_agent)
    payload += struct.pack("<i", start_height)
    payload += struct.pack("<?", relay)

    return payload


def parse_version_payload(payload: bytes) -> dict[str, Any]:
    if len(payload) < 80:
        raise ValueError("short version payload")

    offset = 0

    protocol_version = struct.unpack_from("<i", payload, offset)[0]
    offset += 4

    services = struct.unpack_from("<Q", payload, offset)[0]
    offset += 8

    timestamp = struct.unpack_from("<q", payload, offset)[0]
    offset += 8

    offset += 26
    offset += 26

    nonce = struct.unpack_from("<Q", payload, offset)[0]
    offset += 8

    user_agent, offset = read_varstr(payload, offset)

    start_height = None
    relay = None

    if offset + 4 <= len(payload):
        start_height = struct.unpack_from("<i", payload, offset)[0]
        offset += 4

    if offset + 1 <= len(payload):
        relay = struct.unpack_from("<?", payload, offset)[0]

    return {
        "protocol_version": protocol_version,
        "services": services,
        "timestamp": timestamp,
        "nonce": nonce,
        "user_agent": user_agent,
        "start_height": start_height,
        "relay": relay
    }


def recv_exact(sock: socket.socket, size: int) -> bytes:
    chunks = []
    remaining = size

    while remaining > 0:
        chunk = sock.recv(remaining)

        if not chunk:
            raise ConnectionError("socket closed")

        chunks.append(chunk)
        remaining -= len(chunk)

    return b"".join(chunks)


def read_message(
    sock: socket.socket,
    network: str = "mainnet"
) -> tuple[str, bytes]:

    header = recv_exact(sock, 24)
    command, length, check = parse_message_header(header, network)
    payload = recv_exact(sock, length)

    if checksum(payload) != check:
        raise ValueError("bad message checksum")

    return command, payload


def send_message(
    sock: socket.socket,
    command: str,
    payload: bytes = b"",
    network: str = "mainnet"
) -> None:

    sock.sendall(
        make_message(command, payload, network)
    )


def handshake(
    address: str,
    network: str = "mainnet",
    timeout: float = 5.0,
    user_agent: str = "/ZZX-Labs-Bitnodes:0.1.0/",
    protocol_version: int = DEFAULT_PROTOCOL_VERSION
) -> VersionInfo:

    default_port = DEFAULT_PORTS.get(network, 8333)
    host, port = split_host_port(address, default_port)
    formatted_address = format_address(host, port)
    started = time.perf_counter()

    if ".onion" in host:
        return VersionInfo(
            address=formatted_address,
            protocol_version=None,
            services=None,
            timestamp=None,
            user_agent=None,
            start_height=None,
            relay=None,
            latency_ms=None,
            connected=False,
            error="onion handshake requires Tor SOCKS support"
        )

    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            sock.settimeout(timeout)

            payload = make_version_payload(
                remote_host=host,
                remote_port=port,
                user_agent=user_agent,
                protocol_version=protocol_version
            )

            send_message(
                sock,
                "version",
                payload,
                network
            )

            version_data = None
            saw_verack = False

            deadline = time.time() + timeout

            while time.time() < deadline:
                command, message_payload = read_message(sock, network)

                if command == "version":
                    version_data = parse_version_payload(message_payload)

                    send_message(
                        sock,
                        "verack",
                        b"",
                        network
                    )

                elif command == "verack":
                    saw_verack = True

                elif command == "ping":
                    if len(message_payload) == 8:
                        send_message(
                            sock,
                            "pong",
                            message_payload,
                            network
                        )

                if version_data and saw_verack:
                    break

            latency_ms = int(
                (time.perf_counter() - started) * 1000
            )

            if not version_data:
                raise TimeoutError("no version message received")

            return VersionInfo(
                address=formatted_address,
                protocol_version=version_data.get("protocol_version"),
                services=version_data.get("services"),
                timestamp=version_data.get("timestamp"),
                user_agent=version_data.get("user_agent"),
                start_height=version_data.get("start_height"),
                relay=version_data.get("relay"),
                latency_ms=latency_ms,
                connected=True,
                error=None
            )

    except Exception as exc:
        latency_ms = int(
            (time.perf_counter() - started) * 1000
        )

        return VersionInfo(
            address=formatted_address,
            protocol_version=None,
            services=None,
            timestamp=None,
            user_agent=None,
            start_height=None,
            relay=None,
            latency_ms=latency_ms,
            connected=False,
            error=str(exc)
        )


def version_info_to_bitnodes_array(info: VersionInfo) -> list[Any]:
    connected_since = now_ts()

    return [
        info.protocol_version,
        info.user_agent or "unknown",
        connected_since,
        info.services,
        info.start_height,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None
    ]


def crawl_address(
    address: str,
    network: str = "mainnet",
    timeout: float = 5.0,
    user_agent: str = "/ZZX-Labs-Bitnodes:0.1.0/"
) -> tuple[str, list[Any]] | None:

    info = handshake(
        address=address,
        network=network,
        timeout=timeout,
        user_agent=user_agent
    )

    if not info.connected:
        return None

    return (
        info.address,
        version_info_to_bitnodes_array(info)
    )


def crawl_many(
    addresses: list[str],
    network: str = "mainnet",
    timeout: float = 5.0,
    user_agent: str = "/ZZX-Labs-Bitnodes:0.1.0/"
) -> dict[str, list[Any]]:

    nodes: dict[str, list[Any]] = {}

    for address in addresses:
        result = crawl_address(
            address=address,
            network=network,
            timeout=timeout,
            user_agent=user_agent
        )

        if result is None:
            continue

        node_address, node_values = result
        nodes[node_address] = node_values

    return nodes


def main() -> int:
    import argparse
    import json

    parser = argparse.ArgumentParser(
        description="Minimal Bitcoin P2P version handshake tester."
    )

    parser.add_argument(
        "address",
        help="Node address, e.g. 1.2.3.4:8333 or [::1]:8333."
    )

    parser.add_argument(
        "--network",
        default="mainnet",
        choices=sorted(MAGIC.keys())
    )

    parser.add_argument(
        "--timeout",
        type=float,
        default=5.0
    )

    parser.add_argument(
        "--user-agent",
        default="/ZZX-Labs-Bitnodes:0.1.0/"
    )

    args = parser.parse_args()

    info = handshake(
        address=args.address,
        network=args.network,
        timeout=args.timeout,
        user_agent=args.user_agent
    )

    print(
        json.dumps(
            info.__dict__,
            indent=2,
            sort_keys=True
        )
    )

    return 0 if info.connected else 1


if __name__ == "__main__":
    raise SystemExit(main())
