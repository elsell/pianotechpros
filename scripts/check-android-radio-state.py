"""Assert checked semantics from actual native single-choice controls."""
import argparse
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('xml')
parser.add_argument('--checked', required=True)
parser.add_argument('--unchecked', required=True)
args = parser.parse_args()
root = ET.parse(args.xml).getroot()
for label, expected in [(args.checked, 'true'), (args.unchecked, 'false')]:
    nodes = [node for node in root.iter('node')
             if node.get('package') == 'com.pianotechpros.pianotechpros'
             and node.get('class') == 'android.widget.RadioButton'
             and node.get('content-desc') == label]
    if len(nodes) != 1 or nodes[0].get('checkable') != 'true' or nodes[0].get('checked') != expected:
        raise SystemExit(f'FAIL: {label} must expose a checkable radio with checked={expected}')
print('PASS: current and alternate native radio options expose checked semantics')
