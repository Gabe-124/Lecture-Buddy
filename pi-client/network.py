from __future__ import annotations

import socket
import logging
from typing import Optional


def get_local_ip_address() -> Optional[str]:
    """
    Detect the local LAN IP address of the Raspberry Pi.
    
    Tries multiple methods:
    1. Connect to a non-routable address (8.8.8.8:80) to find the local IP
    2. Fallback to hostname resolution
    3. Return None if unable to determine
    
    Returns:
        The local IPv4 address as a string (e.g., "192.168.1.100"), or None if unavailable.
    """
    try:
        # Method 1: Connect to a public address to determine which local interface is used
        # This doesn't actually send packets, just determines the routing
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # 8.8.8.8 is a public DNS server; port 80 is arbitrary
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            return local_ip
        finally:
            s.close()
    except Exception:
        pass

    try:
        # Method 2: Get IP from hostname resolution
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        # Filter out loopback addresses
        if not local_ip.startswith("127."):
            return local_ip
    except Exception:
        pass

    return None


def log_local_ip(logger: logging.Logger) -> str | None:
    """
    Log the local IP address and return it.
    
    Args:
        logger: A logging.Logger instance to use for logging.
    
    Returns:
        The local IP address or None if unavailable.
    """
    local_ip = get_local_ip_address()
    if local_ip:
        logger.info(f"Local IP address: {local_ip}")
    else:
        logger.warning("Could not determine local IP address")
    return local_ip
