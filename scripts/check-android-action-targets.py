"""Check measured app action bounds from an actual UIAutomator capture."""
import argparse
import re
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument("xml")
parser.add_argument("--density", type=int, required=True)
parser.add_argument("--label", action="append", required=True)
args = parser.parse_args()
if args.density <= 0:
    parser.error("density must be positive")
root = ET.parse(args.xml).getroot()
minimum = 48 * args.density / 160
failures = []
for label in args.label:
    nodes = [node for node in root.iter("node")
             if node.get("package") == "com.pianotechpros.pianotechpros"
             and node.get("class") == "android.widget.Button"
             and node.get("content-desc") == label]
    if len(nodes) != 1:
        failures.append(f"{label}: expected exactly one visible native action")
        continue
    node = nodes[0]
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
    if not match:
        failures.append(f"{label}: missing valid native bounds")
        continue
    left, top, right, bottom = map(int, match.groups())
    width, height = right-left, bottom-top
    if width < minimum or height < minimum:
        failures.append(f"{label}: {width*160/args.density:.1f} x {height*160/args.density:.1f}dp is below 48dp")
if failures:
    raise SystemExit("\n".join(failures))
print(f"PASS: {len(args.label)} measured native actions meet 48dp minimum")
