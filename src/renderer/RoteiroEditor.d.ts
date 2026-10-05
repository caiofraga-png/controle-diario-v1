type Cell = {
    valor?: string;
    formatacao?: any;
};
type Roteiro = {
    linhas: number;
    colunas: number;
    largurasColunas: number[];
    celulas: Record<string, Cell>;
    mesclas: Array<{
        inicio: string;
        fim: string;
    }>;
    filtro: {
        linhaInicial: number;
        linhaFinal: number;
    } | null;
};
type Props = {
    initial: Roteiro;
    onCancel: () => void;
    onSave: (value: Roteiro) => void;
    presentation?: "popup" | "side";
    sidePosition?: "esquerda" | "direita";
};
export default function RoteiroEditor({ initial, onCancel, onSave, presentation, sidePosition }: Props): any;
export {};
