// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MyHistoryPanel from "../src/renderer/MyHistoryPanel";

const historicoMensal = vi.fn();
const readHistory = vi.fn();
const registro = {
  data: "2026-10-14",
  versao: 2,
  perfil: { nome: "SUPORTE" },
  tarefas: [{ id: "t1", nome: "Conferir solicitações", concluida: true, emailsVinculados: [] }],
  emailsGlobais: [],
  atendimentos: [{ id: "a1", ticket: "12345", codigo: "ABC", nome: "Cliente Teste", tipo: "DÚVIDA", subtipo: "", canal: "CHAT", resolvido: "SIM" }],
  observacao: "Registro de teste somente para leitura.",
  concluidoEm: "2026-10-14T18:30:00.000Z",
  origemVersao: null
};
const resumo = {
  data: "2026-10-14",
  versao: 2,
  nome: "historico-teste-2026-10-r002",
  concluidoEm: "2026-10-14T18:30:00.000Z",
  origemVersao: null
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T12:00:00.000Z"));
  historicoMensal.mockReset();
  readHistory.mockReset();
  historicoMensal.mockResolvedValue([]);
  readHistory.mockResolvedValue(registro);
  Object.defineProperty(window, "controleDiario", {
    configurable: true,
    value: { firebase: { workflow: { historicoMensal }, readHistory } }
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Meu Histórico — interface", () => {
  it("carrega o mês atual e permite navegar para o mês anterior", async () => {
    render(<MyHistoryPanel onClose={vi.fn()} />);
    await waitFor(() => expect(historicoMensal).toHaveBeenCalledWith(2026, 11));

    fireEvent.click(screen.getByRole("button", { name: "Mês anterior" }));
    await waitFor(() => expect(historicoMensal).toHaveBeenCalledWith(2026, 10));
    expect(screen.getByText("outubro de 2026")).toBeTruthy();
  });

  it("exibe mensagem adequada quando o mês não possui expedientes", async () => {
    historicoMensal.mockResolvedValue([]);
    render(<MyHistoryPanel onClose={vi.fn()} />);
    expect(await screen.findByText("NENHUM EXPEDIENTE CONCLUÍDO NESTE MÊS.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /possui expediente concluído/i })).toBeNull();
  });

  it("permite selecionar um dia e abrir os detalhes do expediente", async () => {
    historicoMensal.mockResolvedValue([resumo]);
    render(<MyHistoryPanel onClose={vi.fn()} />);

    const dia = await screen.findByRole("button", { name: "14/10/2026, possui expediente concluído" });
    fireEvent.click(dia);
    expect(await screen.findByText("EXPEDIENTES DE 14/10/2026")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "VER DETALHES" }));
    expect(await screen.findByText("14/10/2026 · SUPORTE")).toBeTruthy();
    expect(readHistory).toHaveBeenCalledWith(resumo.nome);
    expect(screen.getByText("Registro de teste somente para leitura.")).toBeTruthy();
    expect(screen.getByText("Ticket: 12345")).toBeTruthy();
  });

  it("não apresenta comandos ou campos de edição nos detalhes", async () => {
    historicoMensal.mockResolvedValue([resumo]);
    render(<MyHistoryPanel onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "14/10/2026, possui expediente concluído" }));
    fireEvent.click(screen.getByRole("button", { name: "VER DETALHES" }));

    const dialog = await screen.findByRole("dialog", { name: "Meu histórico" });
    expect(within(dialog).queryByRole("button", { name: /editar|excluir|salvar|alterar/i })).toBeNull();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "VOLTAR AO DIA" })).toBeTruthy();
  });
});
