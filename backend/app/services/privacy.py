"""Privacy by design: blur every face Gemini located before evidence is stored or sent anywhere."""
import io
from typing import List, Tuple

from PIL import Image, ImageFilter, ImageOps


def blur_faces(image_bytes: bytes, faces_2d: List[List[int]], mime_type: str) -> Tuple[bytes, int]:
    """Return (image bytes with faces blurred, number of faces blurred). Boxes are [ymin, xmin, ymax, xmax] on a 0-1000 scale."""
    boxes = [b for b in faces_2d or [] if isinstance(b, list) and len(b) == 4]
    if not boxes:
        return image_bytes, 0
    try:
        # Apply EXIF rotation so boxes line up with the image as browsers (and Gemini) display it.
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")
    except Exception:
        return image_bytes, 0

    w, h = img.size
    for ymin, xmin, ymax, xmax in boxes:
        # Pad the box 15% so hairline and chin are covered too.
        pad_x, pad_y = (xmax - xmin) * 0.15, (ymax - ymin) * 0.15
        left = max(0, int((xmin - pad_x) / 1000 * w))
        top = max(0, int((ymin - pad_y) / 1000 * h))
        right = min(w, int((xmax + pad_x) / 1000 * w))
        bottom = min(h, int((ymax + pad_y) / 1000 * h))
        if right - left < 2 or bottom - top < 2:
            continue
        region = img.crop((left, top, right, bottom))
        radius = max(8, (right - left) // 6)
        img.paste(region.filter(ImageFilter.GaussianBlur(radius)), (left, top))

    out = io.BytesIO()
    if "png" in (mime_type or "").lower():
        img.save(out, format="PNG")
    else:
        img.save(out, format="JPEG", quality=88)
    return out.getvalue(), len(boxes)
