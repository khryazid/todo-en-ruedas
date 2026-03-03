"""
generate_icons.py
Genera todos los iconos necesarios a partir de un PNG fuente.
Uso: python generate_icons.py <ruta-al-logo.png>
Ejemplo: python generate_icons.py glyph-logo.png
"""
import sys
import os
from PIL import Image

def make_square(img):
    """Convierte la imagen a cuadrado con transparencia (para PNGs con fondo)."""
    # Convertir a RGBA si no lo es
    img = img.convert("RGBA")
    w, h = img.size
    size = max(w, h)
    # Crear fondo transparente cuadrado
    square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = ((size - w) // 2, (size - h) // 2)
    square.paste(img, offset, img)
    return square

def make_white_bg(img, size):
    """Para iconos que no soportan transparencia (como favicon .ico)."""
    bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    img_resized = img.resize((size, size), Image.LANCZOS)
    bg.paste(img_resized, (0, 0), img_resized)
    return bg.convert("RGB")

if len(sys.argv) < 2:
    print("Uso: python generate_icons.py <ruta-al-logo.png>")
    sys.exit(1)

source = sys.argv[1]
if not os.path.exists(source):
    print(f"Error: No se encontró el archivo '{source}'")
    sys.exit(1)

out_dir = "public"
os.makedirs(out_dir, exist_ok=True)

img = Image.open(source)
img = make_square(img)
print(f"Logo cargado: {img.size} px, modo {img.mode}")

# ── 1. favicon.ico (multi-tamaño: 16, 32, 48)
ico_imgs = [img.resize((s, s), Image.LANCZOS).convert("RGBA") for s in (16, 32, 48)]
ico_path = os.path.join(out_dir, "favicon.ico")
ico_imgs[0].save(ico_path, format="ICO", sizes=[(16,16),(32,32),(48,48)], append_images=ico_imgs[1:])
print(f"  ✓ {ico_path}")

# ── 2. favicon.png (32×32 — para navegadores modernos)
png32 = img.resize((32, 32), Image.LANCZOS)
png32.save(os.path.join(out_dir, "favicon-32.png"), "PNG")
print(f"  ✓ public/favicon-32.png")

# ── 3. Apple Touch Icon (180×180)
apple = img.resize((180, 180), Image.LANCZOS)
apple.save(os.path.join(out_dir, "apple-touch-icon.png"), "PNG")
print(f"  ✓ public/apple-touch-icon.png")

# ── 4. Android / PWA icons
for size in (192, 512):
    out = img.resize((size, size), Image.LANCZOS)
    path = os.path.join(out_dir, f"icon-{size}.png")
    out.save(path, "PNG")
    print(f"  ✓ {path}")

# ── 5. Copia principal (usada como og:image / referencia)
logo = img.resize((512, 512), Image.LANCZOS)
logo.save(os.path.join(out_dir, "logo.png"), "PNG")
print(f"  ✓ public/logo.png")

print("\n✅ Todos los iconos generados en public/")
print("   Asegúrate de que index.html apunte a los nuevos archivos (ya está configurado).")
