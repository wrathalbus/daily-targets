import math
from PIL import Image, ImageDraw

def create_dartboard_icon(size=1024, transparent_bg=False):
    # If transparent_bg is True, image is RGBA with transparent background (for android foreground)
    # Else, solid clean background (for icon.png, splash, favicon)
    if transparent_bg:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    else:
        # Subtle warm off-white / light red tint background
        img = Image.new("RGBA", (size, size), (255, 248, 248, 255))
    
    draw = ImageDraw.Draw(img)
    center = (size / 2, size / 2)
    cx, cy = center
    
    # Radii for dartboard rings
    r_outer = size * 0.40
    r_ring1 = size * 0.31
    r_ring2 = size * 0.22
    r_ring3 = size * 0.13
    r_bullseye = size * 0.055

    # Ring Colors (Simple Dartboard with Red Palette)
    c_dark_red = (185, 28, 28, 255)   # #b91c1c
    c_red = (220, 38, 38, 255)        # #dc2626
    c_light_red = (254, 226, 226, 255)# #fee2e2
    c_white = (255, 255, 255, 255)
    c_border = (153, 27, 27, 255)     # #991b1b
    
    # Outer circle border / shadow
    draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], fill=c_red, outline=c_dark_red, width=int(size * 0.015))
    
    # Ring 1
    draw.ellipse([cx - r_ring1, cy - r_ring1, cx + r_ring1, cy + r_ring1], fill=c_white, outline=c_dark_red, width=int(size * 0.012))
    
    # Ring 2
    draw.ellipse([cx - r_ring2, cy - r_ring2, cx + r_ring2, cy + r_ring2], fill=c_red, outline=c_dark_red, width=int(size * 0.012))
    
    # Ring 3
    draw.ellipse([cx - r_ring3, cy - r_ring3, cx + r_ring3, cy + r_ring3], fill=c_white, outline=c_dark_red, width=int(size * 0.01))
    
    # Bullseye Center
    draw.ellipse([cx - r_bullseye, cy - r_bullseye, cx + r_bullseye, cy + r_bullseye], fill=c_dark_red)

    # Crosshair wire subtle guidelines
    wire_color = (254, 202, 202, 180)
    wire_w = int(size * 0.008)
    draw.line([(cx - r_outer, cy), (cx + r_outer, cy)], fill=wire_color, width=wire_w)
    draw.line([(cx, cy - r_outer), (cx, cy + r_outer)], fill=wire_color, width=wire_w)

    # Red Dart Hitting Center
    # Dart tip hits bullseye (cx, cy), shaft extends up-right at angle (-40 deg)
    angle_deg = -38
    angle_rad = math.radians(angle_deg)
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    
    # Tip point
    p_tip = (cx - 2, cy - 2)
    
    # Shaft
    shaft_len = size * 0.42
    p_shaft_end = (cx + shaft_len * cos_a, cy + shaft_len * sin_a)
    
    # Silver/metal needle tip
    needle_len = size * 0.07
    p_needle_end = (cx + needle_len * cos_a, cy + needle_len * sin_a)
    draw.line([p_tip, p_needle_end], fill=(100, 116, 139, 255), width=int(size * 0.012))
    
    # Red Dart Barrel / Shaft
    barrel_color = (239, 68, 68, 255) # Bright red
    barrel_w = int(size * 0.022)
    draw.line([p_needle_end, p_shaft_end], fill=barrel_color, width=barrel_w)
    
    # Metal joints on barrel
    joint1 = (cx + (needle_len + size * 0.08) * cos_a, cy + (needle_len + size * 0.08) * sin_a)
    joint2 = (cx + (needle_len + size * 0.16) * cos_a, cy + (needle_len + size * 0.16) * sin_a)
    draw.circle(joint1, radius=int(size * 0.014), fill=(153, 27, 27, 255))
    draw.circle(joint2, radius=int(size * 0.014), fill=(153, 27, 27, 255))
    
    # Dart Flights / Fins (Feathers) at shaft end
    fin_len = size * 0.14
    fin_spread = size * 0.07
    
    # Perpendicular vector
    perp_x = -sin_a
    perp_y = cos_a
    
    f_base = (cx + (shaft_len - fin_len * 0.8) * cos_a, cy + (shaft_len - fin_len * 0.8) * sin_a)
    f_top = p_shaft_end
    
    fin_left = (f_top[0] + fin_spread * perp_x - size * 0.02 * cos_a, f_top[1] + fin_spread * perp_y - size * 0.02 * sin_a)
    fin_right = (f_top[0] - fin_spread * perp_x - size * 0.02 * cos_a, f_top[1] - fin_spread * perp_y - size * 0.02 * sin_a)
    
    # Left Wing (Fin)
    draw.polygon([f_base, fin_left, f_top], fill=(220, 38, 38, 255), outline=(153, 27, 27, 255))
    # Right Wing (Fin)
    draw.polygon([f_base, fin_right, f_top], fill=(185, 28, 28, 255), outline=(153, 27, 27, 255))
    
    return img

if __name__ == "__main__":
    assets_dir = "/home/rahul/Apps/daily-goals/assets"
    
    # 1. Main app icon (1024x1024)
    icon_img = create_dartboard_icon(size=1024, transparent_bg=False)
    icon_img.save(f"{assets_dir}/icon.png", "PNG")
    print("Saved icon.png")
    
    # 2. Android adaptive foreground (1024x1024, transparent bg)
    android_fg = create_dartboard_icon(size=1024, transparent_bg=True)
    android_fg.save(f"{assets_dir}/android-icon-foreground.png", "PNG")
    print("Saved android-icon-foreground.png")
    
    # 3. Android adaptive background (clean soft red background)
    android_bg = Image.new("RGBA", (1024, 1024), (254, 242, 242, 255))
    android_bg.save(f"{assets_dir}/android-icon-background.png", "PNG")
    print("Saved android-icon-background.png")
    
    # 4. Splash icon (512x512)
    splash_img = create_dartboard_icon(size=512, transparent_bg=True)
    splash_img.save(f"{assets_dir}/splash-icon.png", "PNG")
    print("Saved splash-icon.png")
    
    # 5. Favicon (48x48)
    fav_img = create_dartboard_icon(size=96, transparent_bg=True)
    fav_img.resize((48, 48), Image.Resampling.LANCZOS).save(f"{assets_dir}/favicon.png", "PNG")
    print("Saved favicon.png")
