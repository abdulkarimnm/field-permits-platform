import { ImageResponse } from "next/og";

/** App icon drawn from the logo's three arches, on the Heritage Noir background. */
export function appIcon(size: number, { maskable = false }: { maskable?: boolean } = {}) {
  const pad = maskable ? size * 0.2 : size * 0.14;
  const inner = size - pad * 2;
  const archW = inner / 3.4;
  const gap = (inner - archW * 3) / 2;
  const archH = inner * 0.78;
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 70% 15%, #8a3f31 0%, #5a2b23 55%, #3d1b14 100%)",
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap, height: archH, paddingTop: inner * 0.06 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: archW,
                height: archH,
                borderTopLeftRadius: archW / 2,
                borderTopRightRadius: archW / 2,
                background: i === 1 ? "linear-gradient(180deg,#f3dcb5,#c9a66b)" : "linear-gradient(180deg,#e9cfa6,#a8834b)",
                display: "flex",
                alignItems: "flex-end",
                overflow: "hidden",
              }}
            >
              <div style={{ width: "100%", height: archH * (i === 1 ? 0.42 : 0.32), background: "#763b30", opacity: 0.85 }} />
            </div>
          ))}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
