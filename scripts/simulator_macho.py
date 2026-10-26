"""Extract simulator XML entitlements from a thin little-endian Mach-O 64 binary."""
from pathlib import Path
import struct
import sys


def embedded_entitlements(data):
    def require(condition):
        if not condition:
            raise ValueError('missing or malformed simulator entitlement sections')

    require(len(data) >= 32 and data[:4] == b'\xcf\xfa\xed\xfe')
    count, size = struct.unpack_from('<II', data, 16)
    end = 32 + size
    require(end <= len(data) and count <= size // 8)
    position = 32
    sections = {}
    for _ in range(count):
        require(position + 8 <= end)
        command, length = struct.unpack_from('<II', data, position)
        require(length >= 8 and position + length <= end)
        if command == 25:  # LC_SEGMENT_64
            require(length >= 72)
            section_count = struct.unpack_from('<I', data, position + 64)[0]
            require(72 + section_count * 80 <= length)
            for index in range(section_count):
                start = position + 72 + index * 80
                name = data[start:start + 16].rstrip(b'\0')
                segment = data[start + 16:start + 32].rstrip(b'\0')
                if segment != b'__TEXT' or name not in (b'__entitlements', b'__ents_der'):
                    continue
                size = struct.unpack_from('<Q', data, start + 40)[0]
                offset = struct.unpack_from('<I', data, start + 48)[0]
                require(name not in sections and size > 0 and offset >= end and offset + size <= len(data))
                sections[name] = data[offset:offset + size]
        position += length
    require(position == end and set(sections) == {b'__entitlements', b'__ents_der'})
    return sections[b'__entitlements']


if __name__ == '__main__':
    try:
        Path(sys.argv[2]).write_bytes(embedded_entitlements(Path(sys.argv[1]).read_bytes()))
    except (IndexError, OSError, ValueError) as error:
        raise SystemExit(f'Invalid simulator executable: {error}')
