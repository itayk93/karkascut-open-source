#!/usr/bin/env python3
import sys
import struct
import os

def strip_matrix(mp4_path):
    if not os.path.exists(mp4_path):
        return False
    with open(mp4_path, "r+b") as f:
        data = bytearray(f.read())
        idx = 0
        modified = False
        identity = struct.pack(">9i", 0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000)
        while True:
            pos = data.find(b"tkhd", idx)
            if pos == -1:
                break
            version = data[pos + 4]
            matrix_offset = pos + (56 if version == 1 else 44)
            if matrix_offset + 36 <= len(data):
                curr = struct.unpack(">9i", data[matrix_offset:matrix_offset+36])
                if curr != (0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000):
                    data[matrix_offset:matrix_offset+36] = identity
                    modified = True
            idx = pos + 4

        if modified:
            f.seek(0)
            f.write(data)
            f.truncate()
    return modified

if __name__ == "__main__":
    if len(sys.argv) > 1:
        strip_matrix(sys.argv[1])
