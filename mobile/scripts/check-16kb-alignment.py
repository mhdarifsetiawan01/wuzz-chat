#!/usr/bin/env python3
"""
Memeriksa kesiapan 16 KB page size (syarat Google Play untuk aplikasi target Android 15+ dengan library native 64-bit).

Penggunaan:  python3 scripts/check-16kb-alignment.py <berkas.apk|berkas.aab>
Periksa setiap `.so` arm64-v8a/x86_64 (32-bit tidak wajib):
  1. Semua segmen ELF PT_LOAD harus p_align >= 0x4000 (16384). Ini yang sering gagal pada library pihak ketiga lama.
  2. Entri `.so` yang TIDAK terkompresi di dalam APK harus mulai di offset zip kelipatan 16384 (AAB tidak diperiksa:
     perataan akhir dibuat bundletool/AGP >= 8.5.1 saat Play membangun APK).
Exit code 1 bila ada yang kurang. Jalankan setelah menambah/memperbarui dependensi native (WebRTC, Hermes, kamera, dll.).
"""
import struct
import sys
import zipfile

PAGE = 16384
ABIS_64 = ("arm64-v8a", "x86_64")


def load_aligns(data: bytes):
    if data[:4] != b"\x7fELF":
        return None
    is64 = data[4] == 2
    if is64:
        phoff = struct.unpack_from("<Q", data, 32)[0]
        phentsize, phnum = struct.unpack_from("<HH", data, 54)
    else:
        phoff = struct.unpack_from("<I", data, 28)[0]
        phentsize, phnum = struct.unpack_from("<HH", data, 42)
    out = []
    for i in range(phnum):
        base = phoff + i * phentsize
        p_type = struct.unpack_from("<I", data, base)[0]
        if p_type != 1:  # PT_LOAD
            continue
        p_align = struct.unpack_from("<Q", data, base + 48)[0] if is64 else struct.unpack_from("<I", data, base + 28)[0]
        out.append(p_align)
    return out


def main(path: str) -> int:
    is_aab = path.lower().endswith(".aab")
    bad, ok, skipped = [], 0, 0
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            name = info.filename
            if not name.endswith(".so"):
                continue
            parts = name.split("/")
            abi = next((p for p in parts if p in ("arm64-v8a", "x86_64", "armeabi-v7a", "x86", "armeabi")), None)
            if abi not in ABIS_64:
                skipped += 1
                continue
            aligns = load_aligns(z.read(name))
            problems = []
            if not aligns or min(aligns) < PAGE:
                problems.append(f"ELF LOAD align={[hex(a) for a in aligns or []]} (< 0x4000)")
            if not is_aab and info.compress_type == zipfile.ZIP_STORED and info.header_offset is not None:
                # offset data = header + 30 + panjang nama + panjang extra (dibaca dari header lokal)
                with open(path, "rb") as f:
                    f.seek(info.header_offset)
                    h = f.read(30)
                    n, e = struct.unpack_from("<HH", h, 26)
                    data_off = info.header_offset + 30 + n + e
                if data_off % PAGE != 0:
                    problems.append(f"offset zip {data_off} bukan kelipatan 16384")
            if problems:
                bad.append((name, problems))
            else:
                ok += 1
    for name, problems in bad:
        print(f"KURANG  {name}: {'; '.join(problems)}")
    print(f"\n{path}: OK={ok} KURANG={len(bad)} (32-bit dilewati: {skipped})")
    return 1 if bad else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
