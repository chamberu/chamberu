import re, sys, pathlib
# Crimson brand colour -> Violet counterpart (status colours stay).
MAP = {
 '#C8303B':'#7C3AED', '#E04652':'#A78BFA', '#B02A34':'#6D28D9', '#FF7B84':'#C4B5FD',
 '#1B1A1C':'#1A1523', '#EDE6E3':'#ECE6F5', '#EFE8E6':'#ECE6F5', '#9A9396':'#9A93A8', '#7D7375':'#7A7189',
 '#201D1F':'#1C1724', '#19171A':'#15111B', '#121012':'#0A0710', '#332E30':'#2E2639', '#2C2729':'#2A2236',
 '#5C5B60':'#5C546A', '#B0A5A4':'#A79DB9', '#E6E6E9':'#E5E0ED', '#F4F4F5':'#F2F0F6', '#F0F0F2':'#EFECF4',
 '#8E8D92':'#8E879C', '#7A6F70':'#776C86', '#E6DFDE':'#E8E2F2',
}
KEEP = {'#FFFFFF','#9A6A12','#E7C58C','#2F7D4F','#6FBF8B'}
root = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
srcs = sorted(list(root.glob('.github/assets/*.svg')) + list(root.glob('packages/docs/src/public/*.svg')))
for src in srcs:
    t = src.read_text()
    def sub(m):
        h = m.group(0).upper()
        if h in MAP: return MAP[h] if m.group(0).isupper() or m.group(0)[1:].isdigit() else MAP[h].lower()
        if h not in KEEP: sys.exit(f'unmapped {h} in {src}')
        return m.group(0)
    t = re.sub(r'#[0-9a-fA-F]{6}\b', sub, t)
    name = ('docs-' if 'docs' in str(src) else '') + src.name
    (out / name).write_text(t); print('wrote', name)
