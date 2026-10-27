import importlib.util
from pathlib import Path
import plistlib
import struct
import unittest

spec = importlib.util.spec_from_file_location('inspector', Path(__file__).with_name('simulator_macho.py'))
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


def binary(sections, cpu=0x100000c):
    command_size = 72 + 80 * len(sections)
    offset = 32 + command_size
    command = struct.pack('<II16sQQQQiiII', 25, command_size, b'__TEXT', 0, 0, 0, 0, 0, 0, len(sections), 0)
    payload = b''
    for name, data in sections:
        command += struct.pack('<16s16sQQIIIIIIII', name, b'__TEXT', 0, len(data), offset, 0, 0, 0, 0, 0, 0, 0)
        payload += data
        offset += len(data)
    return struct.pack('<8I', 0xfeedfacf, cpu, 0, 2, 1, command_size, 0, 0) + command + payload



def universal(slices, wide=False):
    entry_size = 32 if wide else 20
    offset = 8 + entry_size * len(slices)
    table = struct.pack('>II', 0xcafebabf if wide else 0xcafebabe, len(slices))
    payload = b''
    for cpu, data in slices:
        table += struct.pack('>IIQQII', cpu, 0, offset, len(data), 0, 0) if wide else struct.pack('>IIIII', cpu, 0, offset, len(data), 0)
        payload += data
        offset += len(data)
    return table + payload

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

    def test_reads_every_universal_architecture(self):
        xml = plistlib.dumps({'application-identifier': 'synthetic'})
        sections = [(b'__entitlements', xml), (b'__ents_der', b'encoded')]
        for wide in (False, True):
            with self.subTest(wide=wide):
                data = universal([(cpu, binary(sections, cpu)) for cpu in (0x100000c, 0x1000007)], wide)
                self.assertEqual(inspector.embedded_entitlements(data), xml)

    def test_rejects_universal_slice_disagreement_or_missing_entitlements(self):
        xml = plistlib.dumps({'application-identifier': 'synthetic'})
        good = binary([(b'__entitlements', xml), (b'__ents_der', b'encoded')])
        for bad in (binary([]), binary([(b'__entitlements', plistlib.dumps({'other': True})), (b'__ents_der', b'encoded')]), good[:-1]):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                inspector.embedded_entitlements(universal([(0x1000007, binary([(b'__entitlements', xml), (b'__ents_der', b'encoded')], 0x1000007)), (0x100000c, bad)]))

    def test_rejects_malformed_universal_table(self):
        xml = plistlib.dumps({})
        good = binary([(b'__entitlements', xml), (b'__ents_der', b'encoded')])
        data = universal([(0x100000c, good)])
        cases = [universal([]), data[:12], data[:-1], universal([(0x100000c, good), (0x100000c, good)]), universal([(0x1000007, good)]), universal([(0x100000c, data)])]
        for field, value in ((4, 0xffffffff), (16, 0), (16, len(data)), (20, 0), (20, len(data)), (24, 32), (24, 4)):
            changed = bytearray(data); struct.pack_into('>I', changed, field, value); cases.append(changed)
        overlapping = bytearray(universal([(0x100000c, good), (0x1000007, binary([(b'__entitlements', xml), (b'__ents_der', b'encoded')], 0x1000007))]))
        struct.pack_into('>I', overlapping, 36, 48); cases.append(overlapping)
        for case in cases:
            with self.subTest(case=case), self.assertRaises(ValueError):
                inspector.embedded_entitlements(bytes(case))

    def test_rejects_malformed_wide_container(self):
        xml = plistlib.dumps({})
        data = universal([(0x100000c, binary([(b'__entitlements', xml), (b'__ents_der', b'encoded')]))], True)
        for offset, format, value in ((36, '>I', 1), (32, '>I', 64), (16, '>Q', len(data)), (24, '>Q', len(data))):
            changed = bytearray(data); struct.pack_into(format, changed, offset, value)
            with self.subTest(offset=offset), self.assertRaises(ValueError):
                inspector.embedded_entitlements(bytes(changed))

if __name__ == '__main__':
    unittest.main()
