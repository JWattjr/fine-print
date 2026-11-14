"""Windows-safe stdin cleanup for the GenLayer direct test harness."""

import os
import sys
import tempfile

from gltest.direct import loader
from gltest.direct.vm import VMContext


def _defer_windows_message_cleanup(vm):
    try:
        from genlayer.py import calldata
        from genlayer.py.types import Address
    except ImportError:
        return

    def address(value):
        return Address(value) if isinstance(value, bytes) else value

    message = {
        "contract_address": address(vm._contract_address),
        "sender_address": address(vm.sender),
        "origin_address": address(vm.origin),
        "stack": [],
        "value": vm._value,
        "datetime": vm._datetime,
        "is_init": False,
        "chain_id": vm._chain_id,
        "entry_kind": 0,
        "entry_data": b"",
        "entry_stage_data": None,
    }
    fd, path = tempfile.mkstemp()
    try:
        os.write(fd, calldata.encode(message))
        os.lseek(fd, 0, os.SEEK_SET)
        vm._original_stdin_fd = os.dup(0)
        os.dup2(fd, 0)
        paths = getattr(vm, "_fine_print_temp_paths", [])
        paths.append(path)
        vm._fine_print_temp_paths = paths
    finally:
        os.close(fd)


_original_cleanup = VMContext._cleanup_after_deactivate


def _cleanup_after_deactivate(vm):
    _original_cleanup(vm)
    for path in getattr(vm, "_fine_print_temp_paths", []):
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
    vm._fine_print_temp_paths = []


loader._inject_message_to_fd0 = _defer_windows_message_cleanup
VMContext._cleanup_after_deactivate = _cleanup_after_deactivate

# genlayer-test 0.29.2's warp updates _datetime but omits the cached raw
# message datetime. Keep its documented time cheatcode effective for deadlines.
_original_refresh_message = VMContext._refresh_gl_message


def _refresh_message_with_datetime(vm):
    _original_refresh_message(vm)
    sdk = sys.modules.get("genlayer.gl")
    if sdk is not None and getattr(sdk, "message_raw", None) is not None:
        sdk.message_raw["datetime"] = vm._datetime


VMContext._refresh_gl_message = _refresh_message_with_datetime
