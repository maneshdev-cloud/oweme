# src/fonts

`InterVariable.woff2` is a **self-hosted subset of Inter** (SIL Open Font License 1.1 — see
`Inter-LICENSE.txt`). It is checked in on purpose, and `next/font/local` loads it from here.

## Why not `next/font/google`

`next/font/google` downloads the font from `fonts.googleapis.com` **at build time**. That makes a
production build depend on a third party being reachable: it fails outright in an offline sandbox, a
locked-down CI runner, or behind a corporate proxy — and it adds a request to Google on every cold
load for a font we can simply ship.

## What's in the file

- variable `wght` axis, 100–900 (every weight the UI uses, and then some);
- Latin + Latin-1, the typographic punctuation the copy leans on (`’ “ ” – — · …`) and **the rupee
  sign (U+20B9)** — verified, along with € £ ¥ ₹, arrows and ✓;
- the `opsz` axis pinned at 14 (a UI rendered at 12–24px gains nothing from an optical-size axis);
- ~65 KB, one file, no per-subset negotiation.

## Regenerating

```bash
npm pack inter-ui                     # upstream Inter (4.1.x), MIT-licensed package
tar -xzf inter-ui-*.tgz package/variable/InterVariable.woff2 package/LICENSE.txt

python3 - <<'PY'
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

font = TTFont('package/variable/InterVariable.woff2')
instancer.instantiateVariableFont(font, {'opsz': 14}, inplace=True, updateFontNames=False)
font.save('/tmp/inter.ttf')

unicodes = (list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) +
            [0x131, 0x152, 0x153, 0x2C6, 0x2DA, 0x2DC] +
            list(range(0x2000, 0x200C)) + list(range(0x2010, 0x2028)) +
            [0x2022, 0x2026, 0x2030, 0x2032, 0x2033, 0x2039, 0x203A, 0x2044] +
            list(range(0x20A0, 0x20C0)) +                        # ₹ lives here
            [0x2113, 0x2116, 0x2122, 0x2126, 0x2190, 0x2192, 0x2212, 0x2260, 0x2264,
             0x2265, 0x2713, 0x2717, 0xFEFF, 0xFFFD])

subset.main(['/tmp/inter.ttf',
             '--unicodes=' + ','.join(f'U+{c:04X}' for c in sorted(set(unicodes))),
             '--layout-features=*', '--flavor=woff2', '--no-hinting', '--desubroutinize',
             '--name-IDs=*', '--output-file=src/fonts/InterVariable.woff2'])
PY
```

Then prove the rupee survived before committing:

```bash
python3 -c "from fontTools.ttLib import TTFont; \
  print(0x20B9 in TTFont('src/fonts/InterVariable.woff2').getBestCmap())"   # -> True
```
