"""Deterministic offline WebP derivatives. Never modifies the source file."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageOps

source, destination = map(Path, sys.argv[1:3])
destination.mkdir(parents=True, exist_ok=True)
with Image.open(source) as image:
    if getattr(image, 'n_frames', 1) > 1:
        print(json.dumps({'skipped': 'animated_image'}))
        sys.exit(0)
    image = ImageOps.exif_transpose(image)
    image = image.convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB')
    width, height = image.size
    variants = {}
    generated = {}
    for name, target in [('thumbnail', 160), ('card', 320), ('card-2x', 640), ('detail', 960)]:
        size = min(width, target)
        if size not in generated:
            resized = image.resize((size, max(1, round(height * size / width))), Image.Resampling.LANCZOS)
            output = destination / f'{size}.webp'
            resized.save(output, 'WEBP', quality=86, method=6, exact=True)
            if output.stat().st_size >= source.stat().st_size and size == width:
                generated[size] = None
            else:
                # Validate decoding, dimensions and alpha before publishing a registry entry.
                with Image.open(output) as check:
                    check.load()
                    assert check.size == resized.size
                    assert ('A' in check.getbands()) == ('A' in resized.getbands() and resized.getextrema()[-1][0] < 255)
                generated[size] = {'width': resized.width, 'height': resized.height,
                                   'bytes': output.stat().st_size, 'file': str(output)}
        if generated[size]:
            variants[name] = generated[size]
    print(json.dumps({'width': width, 'height': height, 'alpha': 'A' in image.getbands(), 'variants': variants}))
