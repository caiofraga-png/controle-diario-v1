import type { OverviewNoticeId } from "../web/overviewNoticesAccess";

const cards:{id:OverviewNoticeId;title:string;description:string}[]=[
  {id:"longCalls",title:"LIGAÇÕES PROLONGADAS",description:"Acompanhamento de ligações que exigem atenção."},
  {id:"googleChat",title:"SOLICITAÇÕES NO GOOGLE CHAT",description:"Pedidos recebidos pelos canais internos do Google Chat."},
  {id:"otherHelp",title:"OUTROS PEDIDOS DE AJUDA",description:"Outras solicitações de apoio operacional."},
];
export default function AvisosPanel({allowed}:{allowed:OverviewNoticeId[]}){
  const visible=cards.filter(card=>allowed.includes(card.id));
  return <section className="overview-notices">
    <div className="workspace-intro"><h2>Avisos</h2><p>Informações e solicitações que foram liberadas para seu acesso.</p></div>
    {visible.length===0?<p>VOCÊ NÃO POSSUI AVISOS DISPONÍVEIS.</p>:<div className="system-workspace-grid">{visible.map(card=><article className="system-workspace-card" key={card.id}><span className="system-workspace-label">AVISO</span><strong>{card.title}</strong><p>{card.description}</p><span className="sidebar-soon">EM BREVE</span></article>)}</div>}
  </section>;
}
