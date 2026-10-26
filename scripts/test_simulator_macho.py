import importlib.util
from pathlib import Path
import plistlib
import struct
import unittest

spec = importlib.util.spec_from_file_location('inspector', Path(__file__).with_name('simulator_macho.py'))
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


def binary(sections):
    command_size = 72 + 80 * len(sections)
    offset = 32 + command_size
    command = struct.pack('<II16sQQQQiiII', 25, command_size, b'__TEXT', 0, 0, 0, 0, 0, 0, len(sections), 0)
    payload = b''
    for name, data in sections:
        command += struct.pack('<16s16sQQIIIIIIII', name, b'__TEXT', 0, len(data), offset, 0, 0, 0, 0, 0, 0, 0)
        payload += data
        offset += len(data)
    return struct.pack('<8I', 0xfeedfacf, 0x100000c, 0, 2, 1, command_size, 0, 0) + command + payload


class SimulatorBinaryTests(unittest.TestCase):
    def test_reads_embedded_xml_and_requires_der(self):
        xml = plistlib.dumps({'application-identifier': 'synthetic'})
        self.assertEqual(inspector.embedded_entitlements(binary([(b'__entitlements', xml), (b'__ents_der', b'encoded')])), xml)

    def test_rejects_missing_duplicate_empty_and_truncated_sections(self):
        xml = plistlib.dumps({})
        for sections in [[], [(b'__entitlements', xml)], [(b'__entitlements', xml), (b'__ents_der', b'')], [(b'__entitlements', xml), (b'__entitlements', xml), (b'__ents_der', b'x')]]:
            with self.subTest(sections=sections), self.assertRaises(ValueError):
                inspector.embedded_entitlements(binary(sections))
        valid = binary([(b'__entitlements', xml), (b'__ents_der', b'encoded')])
        for length in (0, 8, 31, 40, len(valid)-1):
            with self.subTest(length=length), self.assertRaises(ValueError):
                inspector.embedded_entitlements(valid[:length])

if __name__ == '__main__':
    unittest.main()
