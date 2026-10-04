"""Bilder schärfen: Real-ESRGAN x4plus (RRDBNet) in reinem NumPy, ohne PyTorch.

Vervierfacht ein kleines Bild und rekonstruiert dabei Kanten und Feinheiten.
Damit wurden die Szenen des Abendgangs (760 px breit) für die Website aufbereitet.

Vorbereitung (einmalig):
  pip install numpy pillow
  Gewichte laden (67 MB, BSD-Lizenz, Xintao Wang u. a.):
  https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth

Aufruf:
  python3 bilder-schaerfen.py RealESRGAN_x4plus.pth eingang.png ausgang.png

Lädt die Gewichte direkt aus der .pth-Datei (Zip mit Pickle) und rechnet die
Faltungen als 9 verschobene Matrixmultiplikationen. Ein Bild von 760 × 182 px
braucht auf 4 Prozessorkernen etwa 3 bis 4 Minuten.
"""
import pickle, sys, time, zipfile
import numpy as np
from PIL import Image


# ---------- .pth ohne torch laden ----------
class _Speicher:
    def __init__(self, daten):
        self.daten = daten


def _baue_tensor(speicher, versatz, groesse, schritt, *rest):
    d = speicher.daten
    if not groesse:
        return d[versatz:versatz + 1].reshape(())
    a = np.lib.stride_tricks.as_strided(d[versatz:], shape=tuple(groesse), strides=tuple(s * d.itemsize for s in schritt))
    return np.array(a, dtype=np.float32)


def lade_pth(pfad):
    z = zipfile.ZipFile(pfad)
    namen = z.namelist()
    wurzel = namen[0].split('/')[0]
    dtypen = {'FloatStorage': np.float32, 'HalfStorage': np.float16, 'DoubleStorage': np.float64, 'LongStorage': np.int64}

    class U(pickle.Unpickler):
        def find_class(self, modul, name):
            if modul == 'torch._utils' and name == '_rebuild_tensor_v2':
                return _baue_tensor
            if modul == 'torch' and name.endswith('Storage'):
                return name
            if modul == 'collections' and name == 'OrderedDict':
                import collections
                return collections.OrderedDict
            return super().find_class(modul, name)

        def persistent_load(self, pid):
            _, typ, schluessel, _ort, _anzahl = pid
            roh = z.read(f'{wurzel}/data/{schluessel}')
            return _Speicher(np.frombuffer(roh, dtype=dtypen.get(typ, np.float32)))

    return U(z.open(f'{wurzel}/data.pkl')).load()


# ---------- Bausteine ----------
def conv(x, w, b):
    """x: (C, H, W), w: (O, C, 3, 3) -> (O, H, W); Rand mit Nullen."""
    c, h, wd = x.shape
    o = w.shape[0]
    p = np.pad(x, ((0, 0), (1, 1), (1, 1)))
    aus = np.zeros((o, h * wd), dtype=np.float32)
    for ky in range(3):
        for kx in range(3):
            stueck = np.ascontiguousarray(p[:, ky:ky + h, kx:kx + wd]).reshape(c, h * wd)
            aus += w[:, :, ky, kx] @ stueck
    aus += b[:, None]
    return aus.reshape(o, h, wd)


def lrelu(x):
    return np.where(x > 0, x, x * 0.2)


def hoch2(x):
    return x.repeat(2, axis=1).repeat(2, axis=2)


def rdb(x, g, p):
    x1 = lrelu(conv(x, g[p + 'conv1.weight'], g[p + 'conv1.bias']))
    x2 = lrelu(conv(np.concatenate([x, x1]), g[p + 'conv2.weight'], g[p + 'conv2.bias']))
    x3 = lrelu(conv(np.concatenate([x, x1, x2]), g[p + 'conv3.weight'], g[p + 'conv3.bias']))
    x4 = lrelu(conv(np.concatenate([x, x1, x2, x3]), g[p + 'conv4.weight'], g[p + 'conv4.bias']))
    x5 = conv(np.concatenate([x, x1, x2, x3, x4]), g[p + 'conv5.weight'], g[p + 'conv5.bias'])
    return x5 * 0.2 + x


def rrdbnet(bild, g, bloecke=23):
    feat = conv(bild, g['conv_first.weight'], g['conv_first.bias'])
    k = feat
    for i in range(bloecke):
        r = k
        for j in (1, 2, 3):
            r = rdb(r, g, f'body.{i}.rdb{j}.')
        k = r * 0.2 + k
    feat = feat + conv(k, g['conv_body.weight'], g['conv_body.bias'])
    feat = lrelu(conv(hoch2(feat), g['conv_up1.weight'], g['conv_up1.bias']))
    feat = lrelu(conv(hoch2(feat), g['conv_up2.weight'], g['conv_up2.bias']))
    return conv(lrelu(conv(feat, g['conv_hr.weight'], g['conv_hr.bias'])), g['conv_last.weight'], g['conv_last.bias'])


if __name__ == '__main__':
    gewichte, ein, aus = sys.argv[1:4]
    zustand = lade_pth(gewichte)
    g = zustand.get('params_ema') or zustand.get('params') or zustand
    g = {k: np.asarray(v, dtype=np.float32) for k, v in g.items()}
    bild = np.asarray(Image.open(ein).convert('RGB'), dtype=np.float32).transpose(2, 0, 1) / 255.0
    t = time.time()
    erg = rrdbnet(bild, g)
    erg = (np.clip(erg, 0, 1).transpose(1, 2, 0) * 255.0 + 0.5).astype(np.uint8)
    Image.fromarray(erg).save(aus)
    print(f'{ein} -> {aus} {erg.shape[1]}x{erg.shape[0]} in {time.time() - t:.0f} s', flush=True)
