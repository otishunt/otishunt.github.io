import sys, re
html_path, frag_path = sys.argv[1], sys.argv[2]
s = open(html_path).read()
m = re.search(r'<svg class="map" id="map"[^>]*>\n', s)
end = s.index('          <!-- ── Pets that join the line')
frag = open(frag_path).read()
frag = '\n'.join('          ' + line if line else line for line in frag.splitlines()) + '\n\n'
s = s[:m.end()] + '\n' + frag + s[end:]
open(html_path, 'w').write(s)
