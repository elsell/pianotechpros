"""Inspect simulator XML entitlements in thin or universal Mach-O executables."""
from pathlib import Path
import struct
import sys


def thin_entitlements(data):
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


def embedded_entitlements(data):
    if data[:4] == b'\xcf\xfa\xed\xfe':
        return thin_entitlements(data)

    def require(condition):
        if not condition:
            raise ValueError('missing or malformed universal simulator slices')

    require(len(data) >= 8 and data[:4] in (b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'))
    wide = data[:4] == b'\xca\xfe\xba\xbf'
    count = struct.unpack_from('>I', data, 4)[0]
    entry_size = 32 if wide else 20
    table_end = 8 + count * entry_size
    require(0 < count <= (len(data) - 8) // entry_size)
    architectures, ranges, payloads = set(), [], []
    for index in range(count):
        position = 8 + index * entry_size
        if wide:
            cpu, subtype, offset, size, alignment, reserved = struct.unpack_from('>IIQQII', data, position)
            require(reserved == 0)
        else:
            cpu, subtype, offset, size, alignment = struct.unpack_from('>IIIII', data, position)
        require((cpu, subtype) not in architectures)
        architectures.add((cpu, subtype))
        require(alignment <= (63 if wide else 31) and offset % (1 << alignment) == 0)
        require(size >= 32 and offset >= table_end and offset + size <= len(data))
        require(all(offset >= end or offset + size <= start for start, end in ranges))
        ranges.append((offset, offset + size))
        member = data[offset:offset + size]
        require(member[:4] == b'\xcf\xfa\xed\xfe')
        require(struct.unpack_from('<II', member, 4) == (cpu, subtype))
        payloads.append(thin_entitlements(member))
    require(all(payload == payloads[0] for payload in payloads))
    return payloads[0]


if __name__ == '__main__':
    try:
        Path(sys.argv[2]).write_bytes(embedded_entitlements(Path(sys.argv[1]).read_bytes()))
    except (IndexError, OSError, ValueError) as error:
        raise SystemExit(f'Invalid simulator executable: {error}')
