import { MAP_HEIGHT, MAP_WIDTH, OKINAWA_BOX, PREFS } from "./geo";

type Props = {
  // 県の番号 → 塗る色（CSS の変数 `var(--h2)` などでも色でもよい）。ない県は塗らない（--land）
  fills: Readonly<Record<number, string>>;
  // 太い枠で強調する県（モックの .gap）
  outlined?: ReadonlySet<number>;
  // 県を押したときに番号を知らせる。渡されないときは押せない見た目にする
  onSelect?: (id: number) => void;
};

// 日本地図の部品。受け取った塗りと強調をそのまま描くだけで、計算は colors.ts でする。
// 強調した県はほかの県の後に描く（SVG は後に描いたものが上に重なるので、隣の県に枠が隠れない）
export function JapanMap({ fills, outlined, onSelect }: Props) {
  const [x0, y0, x1, y1] = OKINAWA_BOX;
  const isOutlined = (id: number) => outlined?.has(id) ?? false;
  const ordered = [...PREFS.filter((p) => !isOutlined(p.id)), ...PREFS.filter((p) => isOutlined(p.id))];

  return (
    <svg className="japan-map" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label="日本地図">
      <rect className="inset" x={x0 - 14} y={y0 - 40} width={x1 - x0 + 28} height={y1 - y0 + 54} rx={10} />
      <text className="inset-label" x={x0 - 2} y={y0 - 16}>
        沖縄
      </text>
      {ordered.map((p) => (
        <path
          key={p.id}
          className={["pref", onSelect ? "tap" : "", isOutlined(p.id) ? "gap" : ""].filter(Boolean).join(" ")}
          d={p.d}
          style={{ fill: fills[p.id] ?? "var(--land)" }}
          onClick={onSelect ? () => onSelect(p.id) : undefined}
        >
          <title>{p.name}</title>
        </path>
      ))}
    </svg>
  );
}
