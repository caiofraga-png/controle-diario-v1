import { useEffect, useState } from "react";

type UsefulLink = { id: string; title: string; url: string; description: string };
const STORAGE_KEY = "controle-diario-links-uteis-v1";
function validUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; }
  catch { return false; }
}
export default function UsefulLinksPanel() {
  const [links, setLinks] = useState<UsefulLink[]>([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) setLinks(parsed); } }
    catch { setError("NÃO FOI POSSÍVEL CARREGAR OS LINKS SALVOS NESTE NAVEGADOR."); }
  }, []);

  function persist(next: UsefulLink[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setLinks(next); setError(""); }
    catch { setError("NÃO FOI POSSÍVEL SALVAR. VERIFIQUE O ARMAZENAMENTO DO NAVEGADOR."); }
  }
  function resetForm() { setTitle(""); setUrl(""); setDescription(""); setEditingId(null); setError(""); }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim(), cleanUrl = url.trim(), cleanDescription = description.trim();
    if (!cleanTitle) { setError("INFORME O NOME DO LINK."); return; }
    if (!validUrl(cleanUrl)) { setError("INFORME UM ENDEREÇO VÁLIDO INICIADO POR HTTP:// OU HTTPS://."); return; }
    const item: UsefulLink = { id: editingId ?? (crypto.randomUUID?.() ?? String(Date.now())), title: cleanTitle, url: cleanUrl, description: cleanDescription };
    persist(editingId ? links.map(link => link.id === editingId ? item : link) : [...links, item]);
    resetForm();
  }
  function edit(link: UsefulLink) { setEditingId(link.id); setTitle(link.title); setUrl(link.url); setDescription(link.description); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function remove(link: UsefulLink) { if (window.confirm(`EXCLUIR O LINK “${link.title}”?`)) persist(links.filter(item => item.id !== link.id)); }

  return <section className="links-workspace">
    <div className="workspace-intro"><h2>Links Úteis</h2><p>Cadastre e organize seus atalhos de acesso rápido.</p></div>
    <form className="links-form" onSubmit={save}>
      <label><span>NOME DO LINK</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Planilha de produtividade" required maxLength={100}/></label>
      <label><span>ENDEREÇO (URL)</span><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..." required type="url"/></label>
      <label className="links-description"><span>DESCRIÇÃO (OPCIONAL)</span><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Para que serve este acesso" maxLength={220}/></label>
      <div className="links-form-actions"><button className="links-primary" type="submit">{editingId ? "SALVAR ALTERAÇÕES" : "ADICIONAR LINK"}</button>{editingId&&<button type="button" onClick={resetForm}>CANCELAR</button>}</div>
      {error&&<p className="system-message" role="alert">{error}</p>}
    </form>
    <div className="links-list-head"><h3>MEUS LINKS</h3><span>{links.length} {links.length===1?"link":"links"}</span></div>
    {links.length===0 ? <div className="links-empty"><strong>NENHUM LINK CADASTRADO</strong><p>Use o formulário acima para criar seu primeiro acesso rápido.</p></div> :
      <div className="links-grid">{links.map(link=><article className="useful-link-card" key={link.id}><div className="useful-link-mark">↗</div><div className="useful-link-content"><h3>{link.title}</h3>{link.description&&<p>{link.description}</p>}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a></div><div className="useful-link-actions"><button type="button" onClick={()=>edit(link)}>EDITAR</button><button type="button" onClick={()=>remove(link)}>EXCLUIR</button></div></article>)}</div>}
    <p className="links-storage-note">Os links ficam salvos neste navegador e neste dispositivo.</p>
  </section>;
}
