"""Verify a profile choice's label and value in an actual UIAutomator capture."""
import argparse
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('xml')
parser.add_argument('--label', required=True)
parser.add_argument('--value', required=True)
args = parser.parse_args()
root = ET.parse(args.xml).getroot()
nodes = [node for node in root.iter('node')
         if node.get('package') == 'com.pianotechpros.pianotechpros'
         and node.get('class') == 'android.widget.Button'
         and args.label in node.get('content-desc', '')]
if len(nodes) != 1 or args.value not in nodes[0].get('content-desc', ''):
    raise SystemExit('FAIL: expected one accessible choice with field label and selected value')
print('PASS: native choice exposes field label and selected value')
