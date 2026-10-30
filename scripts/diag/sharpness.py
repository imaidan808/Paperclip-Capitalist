# python3 scripts/diag/sharpness.py a.png b.png ...   Laplacian variance of the middle of a screenshot: the sharpness number quoted for the software and GPU densities (P5).
import sys, numpy as np
from PIL import Image
for path in sys.argv[1:]:
    a = np.asarray(Image.open(path).convert('L'), dtype=np.float32)[300:1500, 1000:2600]
    lap = a[1:-1, 1:-1] * 4 - a[:-2, 1:-1] - a[2:, 1:-1] - a[1:-1, :-2] - a[1:-1, 2:]
    print(f'{path}: laplacian variance {lap.var():.1f}')
