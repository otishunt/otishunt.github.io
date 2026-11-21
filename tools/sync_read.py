"""Rebuild read.html (the plain, readable page) from the shop scrolls in home.html.

home.html is the single source of truth: edit the <section class="page"> scrolls there and run
  python3 tools/sync_read.py
The git pre-commit hook in tools/hooks runs this automatically whenever home.html is committed.

Standard library only (works on macOS's built-in Python 3.9).

How scrolls become entries:
  <h2>                      -> the entry's name
  <p class="meta">a · b · c</p> -> role "a · b", dates "c" (the last part, if it looks like a date)
  <p>, <ul>                 -> carried over as they are
  <h3> + its meta and list  -> a separate entry (e.g. a program inside a research scroll)
The About scroll keeps its photo and paragraphs; the Contact list becomes the header links too.
"""
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}

# Which shop sections appear, in what order, and under what heading.
RESUME = 'Otis_Hunt_resume.pdf'   # linked in the header when the file is in the repo
# Header-only links: not ways to get in touch, so they're not in the Contact scroll.
HEADER_EXTRAS = [('https://github.com/otishunt', 'GitHub')]

SECTIONS = [('about', 'About'), ('experience', 'Experience'), ('projects', 'Projects &amp; Research'), ('contact', 'Contact')]


class Node:
    def __init__(self, tag, attrs=None):
        self.tag, self.attrs, self.children = tag, dict(attrs or []), []

    def cls(self):
        return self.attrs.get('class', '').split()

    def elements(self):
        return [c for c in self.children if isinstance(c, Node)]

    def find_all(self, pred):
        out = []
        for c in self.elements():
            if pred(c):
                out.append(c)
            out.extend(c.find_all(pred))
        return out

    def text(self):
        return ''.join(c if isinstance(c, str) else c.text() for c in self.children)


class TreeBuilder(HTMLParser):
    """Just enough of a DOM: elements, attributes and raw text (entities kept as written)."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.root = Node('#root')
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, attrs))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)

    def handle_entityref(self, name):
        self.stack[-1].children.append('&%s;' % name)

    def handle_charref(self, name):
        self.stack[-1].children.append('&#%s;' % name)


def html_of(node, skip_attrs=('tabindex',)):
    if isinstance(node, str):
        return node
    attrs = ''.join(' %s="%s"' % (k, v) for k, v in node.attrs.items() if k not in skip_attrs and v is not None)
    if node.tag in VOID:
        return '<%s%s>' % (node.tag, attrs)
    return '<%s%s>%s</%s>' % (node.tag, attrs, inner(node), node.tag)


def inner(node):
    return ''.join(html_of(c) for c in node.children)


def tidy(s):
    return re.sub(r'\s+', ' ', s).strip()


DATEISH = re.compile(r'\d{4}|present|incoming|ongoing|now', re.I)


def split_meta(meta):
    """'Role · Place · June 2026 – Aug 2026' -> ('Role · Place', 'June 2026 – Aug 2026')."""
    parts = [p.strip() for p in re.split(r'\s*(?:·|&middot;)\s*', tidy(meta))]
    if len(parts) > 1 and DATEISH.search(parts[-1]):
        return ' &middot; '.join(parts[:-1]), parts[-1]
    if len(parts) == 1 and DATEISH.search(parts[0]):
        return '', parts[0]
    return ' &middot; '.join(parts), ''


def entries_from_scroll(scroll):
    """One scroll -> entries: the scroll itself, plus one per <h3> sub-section inside it."""
    entries, cur = [], None
    for el in scroll.elements():
        if el.tag in ('h2', 'h3'):
            cur = {'title': tidy(inner(el)), 'role': '', 'when': '', 'body': []}
            entries.append(cur)
        elif cur is None:
            continue
        elif el.tag == 'p' and 'meta' in el.cls() and not cur['role'] and not cur['when'] and not cur['body']:
            cur['role'], cur['when'] = split_meta(inner(el))
        else:
            cur['body'].append(html_of(el))
    return entries


def render_entry(e, indent='      '):
    out = [indent + '<article class="entry">',
           indent + '  <header>',
           indent + '    <h3>%s</h3>' % e['title']]
    if e['when']:
        out.append(indent + '    <p class="when">%s</p>' % e['when'])
    out.append(indent + '  </header>')
    if e['role']:
        out.append(indent + '  <p class="role">%s</p>' % e['role'])
    for b in e['body']:
        out.append(indent + '  ' + tidy(b))
    out.append(indent + '</article>')
    return '\n'.join(out)


def render_about(scroll):
    out = []
    img = scroll.find_all(lambda n: n.tag == 'img')
    text = scroll.find_all(lambda n: 'about-text' in n.cls())
    paras = [tidy(html_of(p)) for p in (text[0].elements() if text else [])]
    out.append('      <div class="intro">')
    if img:
        out.append('        ' + html_of(Node('img', [(k, v) for k, v in img[0].attrs.items() if k != 'class'] + [('class', 'portrait')])))
    out.append('        <div>')
    out.extend('          ' + p for p in paras)
    out.append('        </div>')
    out.append('      </div>')
    # anything after the photo block (e.g. "What I work with") carries over below it
    after = False
    for el in scroll.elements():
        if 'about' in el.cls():
            after = True
            continue
        if not after:
            continue
        if el.tag == 'h3':
            out.append('      <h3 class="sub">%s</h3>' % tidy(inner(el)))
        else:
            out.append('      ' + tidy(html_of(el)))
    return '\n'.join(out)


def contact_items(scroll):
    """[(label, href, link html)] from the Contact scroll's list."""
    items = []
    for li in scroll.find_all(lambda n: n.tag == 'li'):
        strong = [c for c in li.elements() if c.tag == 'strong']
        link = [c for c in li.elements() if c.tag == 'a']
        if not strong:
            continue
        label = tidy(strong[0].text()).rstrip(':')
        rest = ''.join(html_of(c) for c in li.children if c is not strong[0]).strip()
        items.append((label, link[0].attrs.get('href') if link else None, rest))
    return items


def main():
    home = open(os.path.join(ROOT, 'home.html'), encoding='utf-8').read()
    tb = TreeBuilder()
    tb.feed(home)
    pages = {n.attrs.get('id'): n for n in tb.root.find_all(lambda n: n.tag == 'section' and 'page' in n.cls())}
    missing = [sid for sid, _ in SECTIONS if sid not in pages]
    if missing:
        sys.exit('sync_read: home.html has no section(s): %s' % ', '.join(missing))

    version = re.search(r'css/fonts\.css\?v=([\w-]+)', home)
    v = ('?v=' + version.group(1)) if version else ''

    def scrolls(sid):
        return [n for n in pages[sid].elements() if 'scroll' in n.cls()]

    contacts = contact_items(scrolls('contact')[0])
    links = [(href, label) for label, href, _ in contacts if href]
    links += [(href, label) for href, label in HEADER_EXTRAS if not any(h == href for h, _ in links)]
    # The resume isn't a way to get in touch, so it's not in the Contact scroll, but it belongs up top here.
    if os.path.exists(os.path.join(ROOT, RESUME)) and not any(href == RESUME for href, _ in links):
        links.append((RESUME, 'Resume (PDF)'))
    header_links = '\n'.join('        <a href="%s">%s</a>' % (href, label) for href, label in links)

    body = []
    for sid, title in SECTIONS:
        body.append('    <section aria-labelledby="%s">' % sid)
        body.append('      <h2 id="%s">%s</h2>' % (sid, title))
        if sid == 'about':
            body.append(render_about(scrolls('about')[0]))
        elif sid == 'contact':
            body.append('      <dl class="contact">')
            body.extend('        <dt>%s</dt><dd>%s</dd>' % (label, rest) for label, _, rest in contacts)
            body.append('      </dl>')
        else:
            for scroll in scrolls(sid):
                for e in entries_from_scroll(scroll):
                    body.append('')
                    body.append(render_entry(e))
        body.append('    </section>')
        body.append('')

    page = '''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Otis Hunt</title>
  <meta name="description" content="Otis Hunt: blended B.S./M.S. Statistics student at Cal Poly SLO with a Data Science minor. Experience, research and contact details.">
  <link rel="stylesheet" href="css/fonts.css%(v)s">
  <link rel="stylesheet" href="css/read.css%(v)s">
</head>
<body>
  <!-- GENERATED by tools/sync_read.py from the shop scrolls in home.html. Don't edit by hand:
       change home.html instead (the git pre-commit hook rebuilds this page). -->
  <main class="sheet">
    <header class="masthead">
      <h1>Otis Hunt</h1>
      <p class="tagline">Statistics (blended B.S./M.S.) &middot; Data Science minor &middot; Cal Poly SLO</p>
      <nav class="links" aria-label="Contact links">
%(links)s
      </nav>
    </header>

%(body)s
    <footer class="foot">
      <a href="home.html">← Back to the town</a>
    </footer>
  </main>
</body>
</html>
''' % {'v': v, 'links': header_links, 'body': '\n'.join(body)}

    path = os.path.join(ROOT, 'read.html')
    old = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    if old != page:
        open(path, 'w', encoding='utf-8').write(page)
        print('sync_read: read.html updated from home.html')


if __name__ == '__main__':
    main()
