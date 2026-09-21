#!/usr/bin/env python3
"""Schneidet die Wandbilder aus den Referenzfotos und erzeugt art.js.

Die Fotos selbst sind privat und liegen nicht im Repository. Der Pfad wird
als Argument uebergeben:  python3 tools/crop-art.py /pfad/zu/fotos > art.js

Die Koordinaten beziehen sich auf eine Bildbreite von 1500 px und werden
auf die tatsaechliche Aufloesung hochgerechnet.
"""
import base64, io, sys
from PIL import Image

SCALE = 1.288  # 1932 / 1500
def box(*v): return tuple(int(x * SCALE) for x in v)

CROPS = {
    'grizzlies': ('19588850-image.jpg', box(828, 448, 1168, 748)),   # Tuerposter
    'caps':      ('19588850-image.jpg', box(275, 620, 620, 830)),    # Kappenbrett
    'kobe':      ('7a0db673-image.jpg', box(425, 575, 535, 755)),    # ueber dem Bett
    'ny':        ('e60f3f31-image.jpg', box(20, 520, 390, 740)),     # ueber dem Sofa
    'neymar':    ('986c0e97-image.jpg', box(120, 365, 390, 760)),    # ueber dem Schreibtisch
    'ronaldo':   ('986c0e97-image.jpg', box(415, 385, 660, 765)),
    'kaka':      ('a97b7f4d-image.jpg', box(1065, 410, 1230, 745)),
    'leben':     ('658f3574-image.jpg', box(680, 425, 810, 570)),    # ueber dem Regal
}

def main(src):
    out = []
    for name, (f, b) in CROPS.items():
        im = Image.open(f'{src}/{f}').convert('RGB').crop(b)
        im.thumbnail((512, 512), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=82, optimize=True)
        out.append(f'  {name}: "data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"')
    print('const ART = {\n' + ',\n'.join(out) + '\n};')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
