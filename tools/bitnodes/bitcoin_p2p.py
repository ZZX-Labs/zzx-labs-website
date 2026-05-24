#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import ipaddress
import random
import socket
import struct
import time
from dataclasses import dataclass
from typing import Any


MAGIC_MAINNET = b"\xf9\xbe\xb4\xd9"
PROTOCOL_VERSION = 70016
NODE_NETWORK = 1
NODE_WITNESS = 8
NODE_NETWORK_LIMITED = 1024


@dataclass
class VersionInfo:
    address: str
    connected: bool = False
    protocol_version: int | None = None
    user_agent: str | None = None
    services: int | None = None
    height: int | None = None
    hostname: str | None = None
    connected_since: int | None = None
    latency_ms: float | None = None


def sha256d(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def checksum(payload: bytes) -> bytes:
    return sha256d(payload)[:4]


def encode_varint(value: int) -> bytes:
    if value < 0xfd:
        return struct.pack("<B", value)
    if value <= 0xffff:
        return b"\xfd" + struct.pack("<H", value)
    if value <= 0xffffffff:
        return b"\xfe" + struct.pack("<I", value)
    return b"\xff" + struct.pack("<Q", value)


def read_varint(payload: bytes, offset: int = 0) -> tuple[int, int]:
    prefix = payload[offset]
    offset += 1

    if prefix < 0xfd:
        return prefix, offset

    if prefix == 0xfd:
        return struct.unpack_from("<H", payload, offset)[0], offset + 2

    if prefix == 0xfe:
        return struct.unpack_from("<I", payload, offset)[0], offset + 4

    return struct.unpack_from("<Q", payload, offset)[0], offset + 8


def encode_varstr(text: str) -> bytes:
    raw = text.encode("utf-8", errors="replace")
    return encode_varint(len(raw)) + raw


def make_message(command: str, payload: bytes = b"") -> bytes:
    cmd = command.encode("ascii")[:12].ljust(12, b"\x00")
    return MAGIC_MAINNET + cmd + struct.pack("<I", len(payload)) + checksum(payload) + payload


def recv_exact(sock: socket.socket, size: int) -> bytes:
    data = b""

    while len(data) < size:
        chunk = sock.recv(size - len(data))

        if not chunk:
            raise ConnectionError("socket closed")

        data += chunk

    return data


def read_message(sock: socket.socket) -> tuple[str, bytes]:
    header = recv_exact(sock, 24)

    magic, command_raw, length, msg_checksum = struct.unpack("<4s12sI4s", header)

    if magic != MAGIC_MAINNET:
        raise ValueError("invalid bitcoin mainnet magic")

    payload = recv_exact(sock, length)

    if checksum(payload) != msg_checksum:
        raise ValueError("invalid bitcoin message checksum")

    command = command_raw.rstrip(b"\x00").decode("ascii", errors="replace")

    return command, payload


def split_host_port(address: str, default_port: int = 8333) -> tuple[str, int]:
    value = address.strip()

    if value.startswith("[") and "]:" in value:
        host = value.split("]:", 1)[0][1:]
        port = int(value.rsplit(":", 1)[1])
        return host, port

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1], default_port

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)
        return host, int(port)

    if value.count(":") > 1:
        return value, default_port

    return value, default_port


def format_address(host: str, port: int = 8333) -> str:
    if ":" in host and not host.endswith(".onion"):
        return f"[{host}]:{port}"
    return f"{host}:{port}"


def ip_to_16(host: str) -> bytes:
    ip = ipaddress.ip_address(host)

    if ip.version == 4:
        return b"\x00" * 10 + b"\xff\xff" + ip.packed

    return ip.packed


def encode_netaddr(host: str, port: int, services: int = NODE_NETWORK) -> bytes:
    return struct.pack("<Q", services) + ip_to_16(host) + struct.pack(">H", port)


def build_version_payload(
    remote_host: str,
    remote_port: int,
    user_agent: str = "/ZZX-Labs-Bitnodes:0.1.0/"
) -> bytes:
    timestamp = int(time.time())
    services = NODE_NETWORK | NODE_WITNESS | NODE_NETWORK_LIMITED

    try:
        addr_recv = encode_netaddr(remote_host, remote_port, services)
    except Exception:
        addr_recv = struct.pack("<Q", services) + b"\x00" * 16 + struct.pack(">H", remote_port)

    addr_from = struct.pack("<Q", services) + b"\x00" * 16 + struct.pack(">H", 8333)
    nonce = random.getrandbits(64)

    return b"".join([
        struct.pack("<i", PROTOCOL_VERSION),
        struct.pack("<Q", services),
        struct.pack("<q", timestamp),
        addr_recv,
        addr_from,
        struct.pack("<Q", nonce),
        encode_varstr(user_agent),
        struct.pack("<i", 0),
        b"\x00"
    ])


def parse_version_payload(payload: bytes) -> dict[str, Any]:
    if len(payload) < 80:
        return {}

    offset = 0

    version = struct.unpack_from("<i", payload, offset)[0]
    offset += 4

    services = struct.unpack_from("<Q", payload, offset)[0]
    offset += 8

    offset += 8
    offset += 26
    offset += 26
    offset += 8

    try:
        user_agent_len, offset = read_varint(payload, offset)
        user_agent = payload[offset:offset + user_agent_len].decode("utf-8", errors="replace")
        offset += user_agent_len
    except Exception:
        user_agent = None

    height = None

    if len(payload) >= offset + 4:
        try:
            height = struct.unpack_from("<i", payload, offset)[0]
        except Exception:
            height = None

    return {
        "protocol_version": version,
        "services": services,
        "user_agent": user_agent,
        "height": height
    }


def handshake(
    address: str,
    timeout: float = 5.0,
    user_agent: str = "/ZZX-Labs-Bitnodes:0.1.0/"
) -> VersionInfo:
    host, port = split_host_port(address)
    formatted = format_address(host, port)

    started = time.time()
    info = VersionInfo(address=formatted)

    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            sock.settimeout(timeout)

            version_payload = build_version_payload(host, port, user_agent=user_agent)
            sock.sendall(make_message("version", version_payload))

            got_version = False

            deadline = time.time() + timeout

            while time.time() < deadline:
                command, payload = read_message(sock)

                if command == "version":
                    parsed = parse_version_payload(payload)

                    info.connected = True
                    info.protocol_version = parsed.get("protocol_version")
                    info.user_agent = parsed.get("user_agent")
                    info.services = parsed.get("services")
                    info.height = parsed.get("height")
                    info.connected_since = int(time.time())
                    info.latency_ms = round((time.time() - started) * 1000.0, 2)

                    sock.sendall(make_message("verack"))
                    got_version = True

                elif command == "verack" and got_version:
                    break

                elif command == "ping" and len(payload) == 8:
                    sock.sendall(make_message("pong", payload))

                if got_version:
                    break

    except Exception:
        info.connected = False

    return info


def parse_netaddr(payload: bytes, offset: int, has_time: bool = True) -> tuple[str | None, int | None, int]:
    if has_time:
        offset += 4

    services = struct.unpack_from("<Q", payload, offset)[0]
    offset += 8

    ip_raw = payload[offset:offset + 16]
    offset += 16

    port = struct.unpack_from(">H", payload, offset)[0]
    offset += 2

    if ip_raw.startswith(b"\x00" * 10 + b"\xff\xff"):
        host = str(ipaddress.ip_address(ip_raw[12:16]))
    else:
        host = str(ipaddress.ip_address(ip_raw))

    if services == 0:
        return None, None, offset

    return host, port, offset


def parse_addr_payload(payload: bytes) -> list[str]:
    addresses = []

    try:
        count, offset = read_varint(payload, 0)

        for _ in range(min(count, 1000)):
            host, port, offset = parse_netaddr(payload, offset, has_time=True)

            if host and port:
                addresses.append(format_address(host, port))

    except Exception:
        pass

    return addresses


def parse_addrv2_payload(payload: bytes) -> list[str]:
    addresses = []

    try:
        count, offset = read_varint(payload, 0)

        for _ in range(min(count, 1000)):
            offset += 4

            _services, offset = read_varint(payload, offset)

            network_id = payload[offset]
            offset += 1

            addr_len, offset = read_varint(payload, offset)
            addr_raw = payload[offset:offset + addr_len]
            offset += addr_len

            port = struct.unpack_from(">H", payload, offset)[0]
            offset += 2

            host = None

            if network_id == 1 and addr_len == 4:
                host = str(ipaddress.ip_address(addr_raw))

            elif network_id == 2 and addr_len == 16:
                host = str(ipaddress.ip_address(addr_raw))

            elif network_id == 3:
                host = addr_raw.hex() + ".onion"

            if host and port:
                addresses.append(format_address(host, port))

    except Exception:
        pass

    return addresses


def getaddr(
    address: str,
    timeout: float = 8.0,
    user_agent: str = "/ZZX-Labs-Bitnodes:0.1.0/"
) -> list[str]:
    host, port = split_host_port(address)
    discovered = []

    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            sock.settimeout(timeout)

            version_payload = build_version_payload(host, port, user_agent=user_agent)
            sock.sendall(make_message("version", version_payload))

            got_version = False
            sent_getaddr = False
            deadline = time.time() + timeout

            while time.time() < deadline:
                command, payload = read_message(sock)

                if command == "version":
                    got_version = True
                    sock.sendall(make_message("verack"))

                elif command == "verack" and got_version and not sent_getaddr:
                    sock.sendall(make_message("sendaddrv2"))
                    sock.sendall(make_message("getaddr"))
                    sent_getaddr = True

                elif command == "ping" and len(payload) == 8:
                    sock.sendall(make_message("pong", payload))

                elif command == "addr":
                    discovered.extend(parse_addr_payload(payload))

                elif command == "addrv2":
                    discovered.extend(parse_addrv2_payload(payload))

                if sent_getaddr and len(discovered) >= 1000:
                    break

    except Exception:
        pass

    return sorted(set(discovered))


def version_info_to_bitnodes_array(info: VersionInfo) -> list[Any]:
    return [
        info.protocol_version,
        info.user_agent,
        info.connected_since,
        info.services,
        info.height,
        info.hostname,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        info.latency_ms
    ]