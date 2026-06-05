#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import ipaddress
import random
import socket
import struct
import time
from dataclasses import asdict, dataclass
from typing import Any


MAGIC_MAINNET = b"\xf9\xbe\xb4\xd9"
MAGIC_TESTNET = b"\x0b\x11\x09\x07"
MAGIC_SIGNET = b"\x0a\x03\xcf\x40"
MAGIC_REGTEST = b"\xfa\xbf\xb5\xda"

PROTOCOL_VERSION = 70016

NODE_NETWORK = 1
NODE_GETUTXO = 2
NODE_BLOOM = 4
NODE_WITNESS = 8
NODE_COMPACT_FILTERS = 64
NODE_NETWORK_LIMITED = 1024

ADDRV2_IPV4 = 1
ADDRV2_IPV6 = 2
ADDRV2_TORV2 = 3
ADDRV2_TORV3 = 4
ADDRV2_I2P = 5
ADDRV2_CJDNS = 6

DEFAULT_PORTS = {
    "mainnet": 8333,
    "testnet": 18333,
    "signet": 38333,
    "regtest": 18444,
}

DEFAULT_USER_AGENT = "/ZZX-Labs-Bitnodes:0.4.20/"

MAX_HEADER_PAYLOAD = 32_000_000
MAX_ADDR_ITEMS = 1000


@dataclass
class VersionInfo:
    address: str
    connected: bool = False
    reachable: bool = False
    protocol_version: int | None = None
    user_agent: str | None = None
    services: int | None = None
    height: int | None = None
    relay: bool | None = None
    hostname: str | None = None
    connected_since: int | None = None
    latency_ms: float | None = None
    error: str | None = None
    network: str | None = None
    host: str | None = None
    port: int | None = None
    magic: str = "mainnet"


def default_port(network: str = "mainnet") -> int:
    return DEFAULT_PORTS.get(str(network or "mainnet").lower(), 8333)


def magic_bytes(network: str = "mainnet") -> bytes:
    value = str(network or "mainnet").strip().lower()

    if value == "testnet":
        return MAGIC_TESTNET

    if value == "signet":
        return MAGIC_SIGNET

    if value == "regtest":
        return MAGIC_REGTEST

    return MAGIC_MAINNET


def sha256d(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def checksum(payload: bytes) -> bytes:
    return sha256d(payload)[:4]


def encode_varint(value: int) -> bytes:
    value = int(value)

    if value < 0:
        raise ValueError("varint cannot be negative")

    if value < 0xfd:
        return struct.pack("<B", value)

    if value <= 0xffff:
        return b"\xfd" + struct.pack("<H", value)

    if value <= 0xffffffff:
        return b"\xfe" + struct.pack("<I", value)

    return b"\xff" + struct.pack("<Q", value)


def read_varint(payload: bytes, offset: int = 0) -> tuple[int, int]:
    if offset >= len(payload):
        raise ValueError("varint offset outside payload")

    prefix = payload[offset]
    offset += 1

    if prefix < 0xfd:
        return prefix, offset

    if prefix == 0xfd:
        require_len(payload, offset, 2)
        return struct.unpack_from("<H", payload, offset)[0], offset + 2

    if prefix == 0xfe:
        require_len(payload, offset, 4)
        return struct.unpack_from("<I", payload, offset)[0], offset + 4

    require_len(payload, offset, 8)
    return struct.unpack_from("<Q", payload, offset)[0], offset + 8


def encode_varstr(text: str) -> bytes:
    raw = text.encode("utf-8", errors="replace")
    return encode_varint(len(raw)) + raw


def require_len(payload: bytes, offset: int, size: int) -> None:
    if offset + size > len(payload):
        raise ValueError("payload truncated")


def make_message(command: str, payload: bytes = b"", *, network: str = "mainnet") -> bytes:
    cmd = command.encode("ascii", errors="ignore")[:12].ljust(12, b"\x00")
    return magic_bytes(network) + cmd + struct.pack("<I", len(payload)) + checksum(payload) + payload


def recv_exact(sock: socket.socket, size: int) -> bytes:
    data = b""

    while len(data) < size:
        chunk = sock.recv(size - len(data))

        if not chunk:
            raise ConnectionError("socket closed")

        data += chunk

    return data


def read_message(
    sock: socket.socket,
    *,
    network: str = "mainnet",
    max_payload: int = MAX_HEADER_PAYLOAD,
) -> tuple[str, bytes]:
    header = recv_exact(sock, 24)
    magic, command_raw, length, msg_checksum = struct.unpack("<4s12sI4s", header)

    expected_magic = magic_bytes(network)

    if magic != expected_magic:
        raise ValueError(f"invalid bitcoin {network} magic: {magic.hex()}")

    if length > max_payload:
        raise ValueError(f"oversized bitcoin message payload: {length}")

    payload = recv_exact(sock, length)

    if checksum(payload) != msg_checksum:
        raise ValueError("invalid bitcoin message checksum")

    command = command_raw.rstrip(b"\x00").decode("ascii", errors="replace")

    return command, payload


def split_host_port(address: str, default_port_value: int = 8333) -> tuple[str, int]:
    value = str(address or "").strip()

    if not value:
        raise ValueError("empty node address")

    if value.startswith("[") and "]:" in value:
        host = value.split("]:", 1)[0][1:]
        port_text = value.rsplit(":", 1)[1]
        return host, int(port_text) if port_text.isdigit() else default_port_value

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1], default_port_value

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        host, port_text = value.rsplit(":", 1)
        return host, int(port_text) if port_text.isdigit() else default_port_value

    if value.count(":") == 1:
        host, port_text = value.rsplit(":", 1)

        if port_text.isdigit():
            return host, int(port_text)

    if value.count(":") > 1:
        return value, default_port_value

    return value, default_port_value


def format_address(host: str, port: int = 8333) -> str:
    host = str(host or "").strip()

    if ":" in host and not host.endswith(".onion") and not host.endswith(".i2p"):
        return f"[{host}]:{port}"

    return f"{host}:{port}"


def parse_ip(host: str) -> ipaddress._BaseAddress | None:
    try:
        return ipaddress.ip_address(str(host or "").strip().strip("[]"))
    except ValueError:
        return None


def address_network(host: str) -> str:
    value = str(host or "").strip().lower().strip("[]")

    if value.endswith(".onion"):
        return "tor"

    if value.endswith(".i2p"):
        return "i2p"

    ip = parse_ip(value)

    if ip is None:
        return "dns"

    if ip.version == 4:
        return "ipv4"

    if ip.version == 6:
        if ip in ipaddress.ip_network("fc00::/8"):
            return "cjdns"

        return "ipv6"

    return "unknown"


def supports_direct_socket(host: str) -> bool:
    network = address_network(host)

    return network in {"ipv4", "ipv6", "dns", "cjdns"}


def ip_to_16(host: str) -> bytes:
    ip = ipaddress.ip_address(str(host).strip("[]"))

    if ip.version == 4:
        return b"\x00" * 10 + b"\xff\xff" + ip.packed

    return ip.packed


def encode_netaddr(
    host: str,
    port: int,
    services: int = NODE_NETWORK | NODE_WITNESS | NODE_NETWORK_LIMITED,
) -> bytes:
    return struct.pack("<Q", services) + ip_to_16(host) + struct.pack(">H", port)


def build_version_payload(
    remote_host: str,
    remote_port: int,
    *,
    user_agent: str = DEFAULT_USER_AGENT,
    start_height: int = 0,
    relay: bool = False,
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
        struct.pack("<i", int(start_height)),
        b"\x01" if relay else b"\x00",
    ])


def parse_version_payload(payload: bytes) -> dict[str, Any]:
    if len(payload) < 80:
        return {}

    offset = 0

    require_len(payload, offset, 4)
    version = struct.unpack_from("<i", payload, offset)[0]
    offset += 4

    require_len(payload, offset, 8)
    services = struct.unpack_from("<Q", payload, offset)[0]
    offset += 8

    require_len(payload, offset, 8)
    timestamp = struct.unpack_from("<q", payload, offset)[0]
    offset += 8

    offset += 26
    offset += 26

    require_len(payload, offset, 8)
    nonce = struct.unpack_from("<Q", payload, offset)[0]
    offset += 8

    user_agent = None

    try:
        user_agent_len, offset = read_varint(payload, offset)
        require_len(payload, offset, user_agent_len)
        user_agent = payload[offset:offset + user_agent_len].decode("utf-8", errors="replace")
        offset += user_agent_len
    except Exception:
        user_agent = None

    height = None
    relay = None

    if len(payload) >= offset + 4:
        try:
            height = struct.unpack_from("<i", payload, offset)[0]
            offset += 4
        except Exception:
            height = None

    if len(payload) >= offset + 1:
        relay = bool(payload[offset])

    return {
        "protocol_version": version,
        "services": services,
        "timestamp": timestamp,
        "nonce": nonce,
        "user_agent": user_agent,
        "height": height,
        "relay": relay,
    }


def service_flags(services: int | None) -> dict[str, bool]:
    value = int(services or 0)

    return {
        "node_network": bool(value & NODE_NETWORK),
        "node_getutxo": bool(value & NODE_GETUTXO),
        "node_bloom": bool(value & NODE_BLOOM),
        "node_witness": bool(value & NODE_WITNESS),
        "node_compact_filters": bool(value & NODE_COMPACT_FILTERS),
        "node_network_limited": bool(value & NODE_NETWORK_LIMITED),
    }


def handshake(
    address: str,
    timeout: float = 5.0,
    user_agent: str = DEFAULT_USER_AGENT,
    network: str = "mainnet",
) -> VersionInfo:
    host, port = split_host_port(address, default_port(network))
    formatted = format_address(host, port)

    started = time.time()

    info = VersionInfo(
        address=formatted,
        host=host,
        port=port,
        network=address_network(host),
        magic=network,
    )

    if not supports_direct_socket(host):
        info.error = f"direct socket unsupported for {info.network}; use Tor/I2P proxy transport"
        return info

    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            sock.settimeout(timeout)

            sock.sendall(
                make_message(
                    "version",
                    build_version_payload(host, port, user_agent=user_agent),
                    network=network,
                )
            )

            got_version = False
            deadline = time.time() + timeout

            while time.time() < deadline:
                command, payload = read_message(sock, network=network)

                if command == "version":
                    parsed = parse_version_payload(payload)

                    info.connected = True
                    info.reachable = True
                    info.protocol_version = parsed.get("protocol_version")
                    info.user_agent = parsed.get("user_agent")
                    info.services = parsed.get("services")
                    info.height = parsed.get("height")
                    info.relay = parsed.get("relay")
                    info.connected_since = int(time.time())
                    info.latency_ms = round((time.time() - started) * 1000.0, 2)

                    sock.sendall(make_message("verack", network=network))
                    got_version = True

                elif command == "verack" and got_version:
                    break

                elif command == "ping" and len(payload) == 8:
                    sock.sendall(make_message("pong", payload, network=network))

                if got_version:
                    break

    except Exception as exc:
        info.connected = False
        info.reachable = False
        info.error = str(exc)

    return info


def parse_netaddr(payload: bytes, offset: int, has_time: bool = True) -> tuple[str | None, int | None, int]:
    if has_time:
        require_len(payload, offset, 4)
        offset += 4

    require_len(payload, offset, 8)
    services = struct.unpack_from("<Q", payload, offset)[0]
    offset += 8

    require_len(payload, offset, 16)
    ip_raw = payload[offset:offset + 16]
    offset += 16

    require_len(payload, offset, 2)
    port = struct.unpack_from(">H", payload, offset)[0]
    offset += 2

    try:
        if ip_raw.startswith(b"\x00" * 10 + b"\xff\xff"):
            host = str(ipaddress.ip_address(ip_raw[12:16]))
        else:
            host = str(ipaddress.ip_address(ip_raw))
    except ValueError:
        return None, None, offset

    if services == 0 or port <= 0:
        return None, None, offset

    return host, port, offset


def parse_addr_payload(payload: bytes, *, limit: int = MAX_ADDR_ITEMS) -> list[str]:
    addresses: list[str] = []

    try:
        count, offset = read_varint(payload, 0)

        for _ in range(min(count, limit)):
            host, port, offset = parse_netaddr(payload, offset, has_time=True)

            if host and port:
                addresses.append(format_address(host, port))

    except Exception:
        pass

    return sorted(set(addresses))


def onion_v2_from_bytes(raw: bytes) -> str:
    return base64.b32encode(raw).decode("ascii").lower().rstrip("=") + ".onion"


def onion_v3_from_bytes(raw: bytes) -> str:
    return base64.b32encode(raw).decode("ascii").lower().rstrip("=") + ".onion"


def i2p_from_bytes(raw: bytes) -> str:
    return base64.b32encode(raw).decode("ascii").lower().rstrip("=") + ".b32.i2p"


def parse_addrv2_payload(payload: bytes, *, limit: int = MAX_ADDR_ITEMS) -> list[str]:
    addresses: list[str] = []

    try:
        count, offset = read_varint(payload, 0)

        for _ in range(min(count, limit)):
            require_len(payload, offset, 4)
            offset += 4

            _services, offset = read_varint(payload, offset)

            require_len(payload, offset, 1)
            network_id = payload[offset]
            offset += 1

            addr_len, offset = read_varint(payload, offset)

            require_len(payload, offset, addr_len)
            addr_raw = payload[offset:offset + addr_len]
            offset += addr_len

            require_len(payload, offset, 2)
            port = struct.unpack_from(">H", payload, offset)[0]
            offset += 2

            host = None

            if network_id == ADDRV2_IPV4 and addr_len == 4:
                host = str(ipaddress.ip_address(addr_raw))

            elif network_id == ADDRV2_IPV6 and addr_len == 16:
                host = str(ipaddress.ip_address(addr_raw))

            elif network_id == ADDRV2_TORV2 and addr_len == 10:
                host = onion_v2_from_bytes(addr_raw)

            elif network_id == ADDRV2_TORV3 and addr_len == 32:
                host = onion_v3_from_bytes(addr_raw)

            elif network_id == ADDRV2_I2P and addr_len == 32:
                host = i2p_from_bytes(addr_raw)

            elif network_id == ADDRV2_CJDNS and addr_len == 16:
                host = str(ipaddress.ip_address(addr_raw))

            if host and port > 0:
                addresses.append(format_address(host, port))

    except Exception:
        pass

    return sorted(set(addresses))


def getaddr(
    address: str,
    timeout: float = 8.0,
    user_agent: str = DEFAULT_USER_AGENT,
    network: str = "mainnet",
    max_addresses: int = MAX_ADDR_ITEMS,
) -> list[str]:
    host, port = split_host_port(address, default_port(network))

    if not supports_direct_socket(host):
        return []

    discovered: list[str] = []

    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            sock.settimeout(timeout)

            sock.sendall(
                make_message(
                    "version",
                    build_version_payload(host, port, user_agent=user_agent),
                    network=network,
                )
            )

            got_version = False
            sent_getaddr = False
            deadline = time.time() + timeout

            while time.time() < deadline:
                command, payload = read_message(sock, network=network)

                if command == "version":
                    got_version = True
                    sock.sendall(make_message("verack", network=network))

                elif command == "verack" and got_version and not sent_getaddr:
                    sock.sendall(make_message("sendaddrv2", network=network))
                    sock.sendall(make_message("getaddr", network=network))
                    sent_getaddr = True

                elif command == "ping" and len(payload) == 8:
                    sock.sendall(make_message("pong", payload, network=network))

                elif command == "addr":
                    discovered.extend(parse_addr_payload(payload, limit=max_addresses))

                elif command == "addrv2":
                    discovered.extend(parse_addrv2_payload(payload, limit=max_addresses))

                if sent_getaddr and len(discovered) >= max_addresses:
                    break

    except Exception:
        pass

    return sorted(set(discovered))[:max_addresses]


def version_info_to_record(info: VersionInfo) -> dict[str, Any]:
    payload = asdict(info)
    payload["services_flags"] = service_flags(info.services)
    payload["updated_at"] = int(time.time())
    payload["is_ipv4"] = info.network == "ipv4"
    payload["is_ipv6"] = info.network == "ipv6"
    payload["is_tor"] = info.network == "tor"
    payload["is_i2p"] = info.network == "i2p"
    payload["is_cjdns"] = info.network == "cjdns"

    return payload


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
        info.latency_ms,
    ]
