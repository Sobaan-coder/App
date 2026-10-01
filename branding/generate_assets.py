"""Generates every raster brand asset from the same geometry as branding/logo.svg.
Run: python3 branding/generate_assets.py   (requires Pillow)"""
import json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND, BRAND_DARK, ACCENT, INK = (14, 124, 102), (10, 92, 76), (242, 169, 59), (15, 23, 42)
S = 4  # supersampling

def gradient(size, a, b):
    img = Image.new('RGB', (size, size), a)
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return img

def glyph(draw, size, ox=0, oy=0, scale=1.0, img=None):
    u = size * scale / 100
    def p(x, y): return (ox + x * u, oy + y * u)
    # Speech bubble: solid white outline (rounded rect + solid tail), hollow inside.
    mask = Image.new('L', img.size, 0)
    m = ImageDraw.Draw(mask)
    m.rounded_rectangle([p(20, 22), p(80, 66)], radius=12 * u, fill=255)
    m.polygon([p(30, 62), p(27, 82), p(50, 62)], fill=255)
    m.rounded_rectangle([p(27, 29), p(73, 59)], radius=6 * u, fill=0)
    img.paste((255, 255, 255, 255), (0, 0), mask)
    # Rising path (the business moving forward)
    pts = [p(33, 51), p(44, 42), p(53, 48), p(67, 36)]
    draw.line(pts, fill=ACCENT, width=int(7 * u), joint='curve')
    r = 7 * u / 2
    for (x, y) in (pts[0], pts[-1]):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=ACCENT)

def icon(size, rounded=True, full_bleed=False):
    big = size * S
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    bg = gradient(64, BRAND, BRAND_DARK).resize((big, big))
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=0 if full_bleed else int(big * 0.28), fill=255)
    img.paste(bg, (0, 0), mask)
    glyph(ImageDraw.Draw(img), big, img=img)
    return img.resize((size, size), Image.LANCZOS)

def foreground(size):
    """Adaptive-icon foreground: glyph inside the 66% safe zone, transparent bg."""
    big = size * S
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    glyph(ImageDraw.Draw(img), big, ox=big * 0.17, oy=big * 0.17, scale=0.66, img=img)
    return img.resize((size, size), Image.LANCZOS)

def save(img, *path):
    full = os.path.join(ROOT, *path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    img.save(full)
    print('wrote', os.path.relpath(full, ROOT))

def font(sz, bold=True):
    for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
              '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']:
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()

def banner(w, h, headline, sub):
    img = gradient(64, BRAND_DARK, BRAND).resize((w, h))
    d = ImageDraw.Draw(img)
    logo = icon(int(h * 0.22))
    img.paste(logo, (int(w * 0.06), int(h * 0.12)), logo)
    d.text((int(w * 0.06) + logo.width + 20, int(h * 0.12) + logo.height // 2), 'BusinessPilot', font=font(int(h * 0.07)), fill='white', anchor='lm')
    d.text((int(w * 0.06), int(h * 0.48)), headline, font=font(int(h * 0.075)), fill='white')
    d.text((int(w * 0.06), int(h * 0.48) + int(h * 0.19)), sub, font=font(int(h * 0.045), bold=False), fill=(214, 240, 233))
    # chat bubble demo
    bx, by = int(w * 0.62), int(h * 0.14)
    d.rounded_rectangle([bx, by, w - int(w * 0.05), by + int(h * 0.13)], radius=18, fill='white')
    d.text((bx + 20, by + int(h * 0.065)), '“Sold 5 burgers for 2500 cash”', font=font(int(h * 0.035), bold=False), fill=INK, anchor='lm')
    by2 = by + int(h * 0.17)
    d.rounded_rectangle([bx, by2, w - int(w * 0.05), by2 + int(h * 0.13)], radius=18, fill=(12, 70, 58), outline=(255, 255, 255), width=2)
    d.text((bx + 20, by2 + int(h * 0.065)), '✓ Sale recorded · Rs 2,500', font=font(int(h * 0.035)), fill='white', anchor='lm')
    return img

if __name__ == '__main__':
    save(icon(1024), 'branding', 'icon-1024.png')
    save(icon(512, full_bleed=True), 'branding', 'play-store-icon-512.png')  # Play applies its own mask
    for name, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        save(icon(px), 'android', 'app', 'src', 'main', 'res', f'mipmap-{name}', 'ic_launcher.png')
        save(icon(px), 'android', 'app', 'src', 'main', 'res', f'mipmap-{name}', 'ic_launcher_round.png')
        save(foreground(int(px * 108 / 48)), 'android', 'app', 'src', 'main', 'res', f'mipmap-{name}', 'ic_launcher_foreground.png')
        save(icon(int(px * 2)), 'android', 'app', 'src', 'main', 'res', f'drawable-{name}', 'splash_logo.png')
    save(icon(32), 'web', 'favicon.png')
    save(icon(192), 'web', 'icons', 'Icon-192.png')
    save(icon(512), 'web', 'icons', 'Icon-512.png')
    save(icon(192, full_bleed=True), 'web', 'icons', 'Icon-maskable-192.png')
    save(icon(512, full_bleed=True), 'web', 'icons', 'Icon-maskable-512.png')
    save(icon(180), 'website', 'assets', 'apple-touch-icon.png')
    save(icon(32), 'website', 'assets', 'favicon-32.png')
    save(banner(1200, 630, 'Run your business by simply\ntelling us what happened.', 'AI-powered business manager for small businesses'),
         'website', 'assets', 'og-image.png')
    save(banner(1024, 500, 'Your Business.\nOne Simple Conversation.', 'Sales, stock, expenses & who owes you'),
         'branding', 'play-feature-graphic-1024x500.png')
