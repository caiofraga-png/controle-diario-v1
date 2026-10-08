import { useState } from "react";

type Roteiro = {
  linhas: number;
  colunas: number;
  largurasColunas: number[];
  celulas: Record<string, { valor?: string; formatacao?: any }>;
  mesclas: Array<{ inicio: string; fim: string }>;
  filtro: { linhaInicial: number; linhaFinal: number } | null;
};

type Props = {
  initial: Roteiro;
  onCancel: () => void;
  onSave: (value: Roteiro) => void;
  presentation?: "popup" | "side";
  sidePosition?: "esquerda" | "direita";
};

function extractText(r: Roteiro) {
  const cells = r?.celulas ?? {};
  const keys = Object.keys(cells);
  if (!keys.length) return "";
  const sorted = keys.sort((a, b) => {
    const ma = a.match(/^[A-Z]+(\d+)$/);
    const mb = b.match(/^[A-Z]+(\d+)$/);
    return Number(ma?.[1] ?? 999999) - Number(mb?.[1] ?? 999999);
  });
  return sorted
    .map((key) => {
      const cell: any = (cells as any)[key];
      return typeof cell === "string" ? cell : (cell?.valor ?? "");
    })
    .join("\n");
}

export default function RoteiroEditor({
  initial,
  onCancel,
  onSave,
  presentation = "popup",
  sidePosition = "direita"
}: Props) {
  const [text, setText] = useState(() => extractText(initial));

  function save() {
    onSave({
      linhas: Math.max(1, text.split("\n").length),
      colunas: 1,
      largurasColunas: [900],
      celulas: { A1: { valor: text } },
      mesclas: [],
      filtro: null
    });
  }

  return (
    <div className={`roteiro-overlay ${presentation === "side" ? `roteiro-side ${sidePosition}` : ""}`}>
      <div className="roteiro-window advanced roteiro-text-window">
        <header>
          <div><strong>ROTEIRO</strong></div>
          <button onClick={onCancel}>✕</button>
        </header>

        <div className="roteiro-text-area-wrap">
          <textarea
            className="roteiro-text-editor"
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="config-actions">
          <button onClick={onCancel}>CANCELAR</button>
          <button className="primary" onClick={save}>SALVAR ROTEIRO</button>
        </div>
      </div>
    </div>
  );
}
