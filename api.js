// =====================================================================
//  api.js — conversa com o Worker (backend).   versão 4
//  O endereço do Worker fica no config.js (API_URL).
// =====================================================================
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const API = String(CFG.API_URL || (CFG.TRANSPORTE ? 'https://demo.local' : '')).replace(/\/+$/, '');
  const transporte = CFG.TRANSPORTE || ((url, init) => fetch(url, init));

  // ===== REGRAS COMPARTILHADAS — idênticas no site (api.js) e no Worker =====
const FORMAS = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Cartão de débito', credito: 'Cartão de crédito', outro: 'Outro' };
const CATEGORIAS_DESPESA = ['Aluguel', 'Energia', 'Água', 'Internet e telefone', 'Produtos e estoque', 'Manutenção', 'Limpeza', 'Marketing', 'Impostos e taxas', 'Taxas de cartão', 'Salários e pró-labore', 'Equipamentos', 'Outros'];
const CATEGORIAS_PRODUTO = { bebida: 'Bebida', produto: 'Produto de venda', insumo: 'Insumo (uso interno)', outro: 'Outro' };
function toMin(h) { if (!h) return 0; const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); }
function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
function ehData(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function ehMes(s) { return typeof s === 'string' && /^\d{4}-\d{2}$/.test(s); }
function somarDias(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function limitesMes(mes) { const [y, m] = mes.split('-').map(Number); const fim = new Date(Date.UTC(y, m, 0)).getUTCDate(); return [mes + '-01', mes + '-' + String(fim).padStart(2, '0')]; }
function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function fazServicos(b, ids) { return !b.servicos || !b.servicos.length || ids.every(i => b.servicos.includes(i)); }
function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
function soma(l) { return r2(l.reduce((a, v) => a + (Number(v) || 0), 0)); }

function horariosLivres(o) {
  const { barbeiro: b, data, duracao, ocupados = [], bloqueios = [], config = {}, hoje, agoraMin, ignorarAntecedencia } = o;
  if (!b || !b.ativo || !duracao || data < hoje) return [];
  const h = (b.horarios || [])[new Date(data + 'T12:00:00Z').getUTCDay()];
  if (!h || !h.aberto) return [];
  const doBarb = bloqueios.filter(x => (!x.barbeiroId || x.barbeiroId === b.id) && x.data <= data && (x.dataFim || x.data) >= data);
  if (doBarb.some(x => x.diaInteiro)) return [];
  const ocup = [];
  if (h.pausaInicio && h.pausaFim) ocup.push([toMin(h.pausaInicio), toMin(h.pausaFim)]);
  doBarb.forEach(x => ocup.push([toMin(x.inicio), toMin(x.fim)]));
  ocupados.filter(x => x.barbeiroId === b.id).forEach(x => ocup.push([x.inicio, x.fim]));
  const passo = Number(config.grade) || 15;
  const minimo = data === hoje ? agoraMin + (ignorarAntecedencia ? 0 : Number(config.antecedencia) || 0) : -1;
  const out = [];
  for (let t = toMin(h.inicio); t + duracao <= toMin(h.fim); t += passo) {
    if (t < minimo) continue;
    if (ocup.some(([a, z]) => t < z && t + duracao > a)) continue;
    out.push(t);
  }
  return out;
}

function montarAgendamento(D, d, admin, hoje, agoraMin) {
  const nome = String(d.clienteNome || '').trim().slice(0, 80);
  const tel = soDigitos(d.clienteTelefone).slice(0, 13);
  if (nome.length < 2) throw new Error('Informe o nome do cliente.');
  if (tel.length < 10) throw new Error('Informe um telefone com DDD.');
  if (!ehData(d.data)) throw new Error('Data inválida.');
  const ids = Array.isArray(d.servicoIds) ? d.servicoIds.map(String) : [];
  const servs = ids.map(id => D.servicos.find(s => s.id === id && s.ativo)).filter(Boolean);
  if (!servs.length || servs.length !== ids.length) throw new Error('Serviço indisponível. Atualize a página.');
  const dur = servs.reduce((a, s) => a + Number(s.duracao), 0);
  const total = soma(servs.map(s => s.preco));
  const inicio = Number(d.inicio);
  if (!Number.isInteger(inicio)) throw new Error('Horário inválido.');
  if (!admin && d.data > somarDias(hoje, (Number(D.config.diasAFrente) || 30) - 1)) throw new Error('Data fora do período de agendamento.');
  if (!admin && D.futurosDoTelefone >= 3) throw new Error('Você já tem 3 horários marcados. Fale com a barbearia para marcar mais.');
  const cand = D.barbeiros.filter(b => b.ativo && fazServicos(b, ids) && (!d.barbeiroId || b.id === d.barbeiroId));
  const livres = cand.filter(b => horariosLivres({
    barbeiro: b, data: d.data, duracao: dur, ocupados: D.ocupados, bloqueios: D.bloqueios,
    config: D.config, hoje, agoraMin, ignorarAntecedencia: admin,
  }).includes(inicio));
  if (!livres.length) throw new Error('Esse horário não está mais disponível. Escolha outro.');
  const carga = id => D.ocupados.filter(o => o.barbeiroId === id).length;
  livres.sort((a, b) => carga(a.id) - carga(b.id));
  const b = livres[0];
  return {
    id: novoId(), barbeiroId: b.id, barbeiroNome: b.nome, servicoIds: ids,
    servicosNome: servs.map(s => s.nome).join(' + '), data: d.data, inicio, fim: inicio + dur,
    duracao: dur, total, clienteNome: nome, clienteTelefone: tel,
    obs: String(d.obs || '').trim().slice(0, 300), status: 'confirmado',
    origem: admin ? 'balcao' : 'site', criadoEm: new Date().toISOString(),
    conferido: false, anexos: [], obsInterna: '',
  };
}

// --- finalização e comissão ---
function pctComissao(b) {
  const v = b && b.comissao !== undefined && b.comissao !== null && b.comissao !== '' ? Number(b.comissao) : 50;
  return Math.max(0, Math.min(100, isNaN(v) ? 50 : v));
}
function checarFinalizar(a, por, hoje) {
  if (a.status === 'cancelado') throw new Error('Agendamento cancelado. Reabra antes de finalizar.');
  if (por === 'barbeiro' && a.conferido) throw new Error('Esse atendimento já foi conferido pela gerência.');
  if (por === 'barbeiro' && a.data > hoje) throw new Error('Só dá para finalizar atendimentos de hoje ou de dias anteriores.');
}
function totalItens(a) { return soma((a.itens || []).map(i => i.preco * i.qtd)); }
function calcPagamento(a, pct, valorServico, forma, obs, por, quando) {
  const vs = Math.max(0, r2(valorServico)), vi = totalItens(a);
  const cs = r2(vs * pct / 100), ci = soma((a.itens || []).map(i => i.preco * i.qtd * (Number(i.comissao) || 0) / 100));
  return { forma, valorServico: vs, valorItens: vi, valor: r2(vs + vi), comissaoPct: pct, comissaoServico: cs, comissaoItens: ci, comissaoValor: r2(cs + ci), obs, finalizadoEm: quando, finalizadoPor: por };
}
function aplicarFinalizacao(a, b, d, por) {
  const bruto = d.valorServico !== undefined ? d.valorServico : d.valor;
  const vs = bruto === '' || bruto === undefined || bruto === null ? a.total : bruto;
  return {
    ...a, status: 'concluido', conferido: false,
    pagamento: calcPagamento(a, pctComissao(b), vs, FORMAS[d.forma] ? d.forma : 'outro', String(d.obs || '').trim().slice(0, 200), por, new Date().toISOString()),
  };
}
function recalcularPagamento(a) {
  if (!a.pagamento) return a;
  const p = a.pagamento, vs = p.valorServico !== undefined ? p.valorServico : p.valor;
  return { ...a, pagamento: calcPagamento(a, p.comissaoPct, vs, p.forma, p.obs || '', p.finalizadoPor, p.finalizadoEm) };
}
function checarStatus(a, status, por) {
  if (!['confirmado', 'faltou', 'cancelado'].includes(status)) throw new Error('Status inválido.');
  if (por === 'barbeiro' && a.conferido) throw new Error('Esse atendimento já foi conferido pela gerência.');
}
function checarComanda(a, por) {
  if (a.status === 'cancelado' || a.status === 'faltou') throw new Error('Comanda fechada: o agendamento foi cancelado ou o cliente faltou.');
  if (por === 'barbeiro' && a.conferido) throw new Error('Esse atendimento já foi conferido pela gerência.');
}
function checarExcluir(a, por) {
  if (por === 'barbeiro' && a.status === 'concluido') throw new Error('Atendimento finalizado não pode ser excluído pelo barbeiro. Reabra antes ou peça à gerência.');
  if (por === 'barbeiro' && a.conferido) throw new Error('Esse atendimento já foi conferido pela gerência.');
}
function mudarStatus(a, status) {
  const n = { ...a, status };
  if (status !== 'concluido') { delete n.pagamento; n.conferido = false; }
  return n;
}
function novoItem(p, qtd) {
  const q = Math.max(1, Math.min(99, parseInt(qtd, 10) || 1));
  return { id: novoId(), produtoId: p.id, nome: p.nome, categoria: p.categoria || 'outro', qtd: q, preco: r2(p.preco), custo: r2(p.custo || 0), comissao: Math.max(0, Math.min(100, Number(p.comissao) || 0)) };
}
// pagamento do atendimento (atendimentos antigos, concluídos sem pagamento, usam o valor de tabela)
function pagDe(a, b) {
  if (a.pagamento) return a.pagamento;
  const pct = pctComissao(b);
  return { forma: 'outro', valor: r2(a.total), comissaoPct: pct, comissaoValor: r2(a.total * pct / 100), obs: '', semRegistro: true };
}
// linhas: [{barbeiroId, comissaoValor|null, total}] concluídos ANTES do mês; pags: [{barbeiroId, valor}] pagos ANTES do mês
function acumularAnteriores(linhas, pags, barbeiros) {
  const m = {};
  const pega = id => (m[id] = m[id] || { comissoes: 0, pagos: 0 });
  linhas.forEach(l => {
    const b = barbeiros.find(x => x.id === l.barbeiroId);
    const c = l.comissaoValor === null || l.comissaoValor === undefined ? r2(Number(l.total) * pctComissao(b) / 100) : Number(l.comissaoValor);
    pega(l.barbeiroId).comissoes += c;
  });
  pags.forEach(p => { pega(p.barbeiroId).pagos += Number(p.valor) || 0; });
  return m;
}
function resumoFinanceiro(barbeiros, ags, pags, ant) {
  const conc = ags.filter(a => a.status === 'concluido');
  const ids = new Set([...barbeiros.filter(b => b.ativo).map(b => b.id), ...conc.map(a => a.barbeiroId), ...pags.map(p => p.barbeiroId), ...Object.keys(ant)]);
  return [...ids].map(id => {
    const b = barbeiros.find(x => x.id === id);
    const meus = conc.filter(a => a.barbeiroId === id);
    const pg = meus.map(a => pagDe(a, b));
    const produzido = soma(pg.map(p => p.valor));
    const comissao = soma(pg.map(p => p.comissaoValor));
    const pago = soma(pags.filter(p => p.barbeiroId === id).map(p => p.valor));
    const anterior = r2(((ant[id] || {}).comissoes || 0) - ((ant[id] || {}).pagos || 0));
    const nome = b ? b.nome : ((meus[0] || {}).barbeiroNome || (pags.find(p => p.barbeiroId === id) || {}).barbeiroNome || 'Barbeiro excluído');
    return {
      barbeiroId: id, nome, comissaoPct: b ? pctComissao(b) : null, atendimentos: meus.length,
      faltas: ags.filter(a => a.barbeiroId === id && a.status === 'faltou').length,
      produzido, comissao, casa: r2(produzido - comissao), pago, anterior, aPagar: r2(anterior + comissao - pago),
    };
  }).filter(r => r.atendimentos || r.pago || r.anterior || barbeiros.some(b => b.id === r.barbeiroId && b.ativo))
    .sort((x, y) => y.produzido - x.produzido);
}
// --- segurança de login: bloqueio progressivo por tentativas erradas ---
const NIVEIS_BLOQUEIO = [15, 60, 1440]; // minutos: 1º bloqueio 15 min, 2º 1 h, 3º em diante 24 h
const JANELA_TENTATIVAS = 15 * 60000;
function avaliarFalha(t, agora, limite) {
  t = t ? { ...t } : { falhas: 0, janela: agora, nivel: 0, bloqueadoAte: 0, ultima: 0 };
  if (agora - (t.ultima || 0) > 86400000) t.nivel = 0;
  if (agora - t.janela > JANELA_TENTATIVAS) { t.falhas = 0; t.janela = agora; }
  t.falhas++; t.ultima = agora;
  let restantes = limite - t.falhas;
  if (t.falhas >= limite) {
    t.bloqueadoAte = agora + NIVEIS_BLOQUEIO[Math.min(t.nivel, NIVEIS_BLOQUEIO.length - 1)] * 60000;
    t.nivel++; t.falhas = 0; t.janela = agora; restantes = 0;
  }
  return { t, restantes };
}
function msgBloqueio(ate, agora) {
  const min = Math.max(1, Math.ceil((ate - agora) / 60000));
  return 'Muitas tentativas erradas. Acesso bloqueado por ' + (min > 90 ? Math.ceil(min / 60) + ' horas' : min + ' minuto(s)') + '.';
}
function limparUsuario(u) { return String(u || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]/g, '').slice(0, 30); }
function senhaFraca(s) {
  s = String(s || '');
  if (s.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/^(\d)\1+$/.test(s) || ['123456', '1234567', '12345678', '654321', '000000', '111111', 'senha123', 'abc123', 'qwerty'].includes(s.toLowerCase())) return 'Senha fácil demais. Evite sequências e números repetidos.';
  return '';
}
// ===== fim das regras compartilhadas =====


  // ------------------------------------------------------- utilidades
  const U = {
    toMin, soDigitos, fazServicos, limparUsuario, senhaFraca, somarDias, limitesMes, r2, soma,
    FORMAS, CATEGORIAS_DESPESA, CATEGORIAS_PRODUTO, pagDe, pctComissao, totalItens,
    toHora(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); },
    iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    hojeISO() { return U.iso(new Date()); },
    agoraMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); },
    addDias: somarDias,
    addMes(mes, n) { const [y, m] = mes.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); },
    diaSemana(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); },
    id: novoId,
    dinheiro(v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); },
    esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    fone(s) {
      const d = soDigitos(s).replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
      if (d.length <= 2) return d;
      if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
      if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    },
    tamanho(b) { return b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; },
  };

  // ------------------------------------------------------- sessões
  const SESS = { adm: 'barb_sess_adm', barb: 'barb_sess_barb' };
  const memSess = {};
  function lerSess(p) { try { const s = sessionStorage.getItem(SESS[p]) || localStorage.getItem(SESS[p]); if (s) return JSON.parse(s); } catch (e) { /* sem storage */ } return memSess[p] || null; }
  function gravarSess(p, v, lembrar) {
    memSess[p] = v;
    try {
      sessionStorage.removeItem(SESS[p]); localStorage.removeItem(SESS[p]);
      if (v) (lembrar ? localStorage : sessionStorage).setItem(SESS[p], JSON.stringify(v));
    } catch (e) { /* sem storage */ }
  }

  async function req(metodo, caminho, corpo, papel, extra = {}) {
    if (!API) throw new Error('Site sem servidor configurado: preencha API_URL no config.js.');
    const h = {};
    if (papel) { const s = lerSess(papel); h.Authorization = 'Bearer ' + (s ? s.token : ''); }
    let body;
    if (extra.arquivo) { body = extra.arquivo; h['Content-Type'] = extra.arquivo.type || 'application/octet-stream'; h['X-Nome-Arquivo'] = encodeURIComponent(extra.arquivo.name || 'arquivo'); }
    else if (corpo) { body = JSON.stringify(corpo); h['Content-Type'] = 'application/json'; }
    let r;
    try { r = await transporte(API + caminho, { method: metodo, headers: h, body }); }
    catch (e) { throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.'); }
    if (extra.blob && r.ok) return r.blob();
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && papel) { gravarSess(papel, null); const e = new Error(j.erro || 'Sessão expirada.'); e.auth = true; throw e; }
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
    return j;
  }
  const adm = (m, c, b, x) => req(m, c, b, 'adm', x);
  const brb = (m, c, b, x) => req(m, c, b, 'barb', x);
  const qs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');

  window.U = U;
  window.horariosLivres = horariosLivres;
  window.Api = {
    demo: !!CFG.DEMO,
    publico: () => req('GET', '/api/publico'),
    ocupados: data => req('GET', '/api/ocupados?data=' + encodeURIComponent(data)),
    agendar: d => req('POST', '/api/agendamentos', d),

    sessao: p => lerSess(p),
    sair: p => gravarSess(p, null),
    async login(d) {
      const papel = d.papel === 'barb' ? 'barb' : 'adm';
      const r = await req('POST', '/api/login', { papel, senha: d.senha, usuario: d.usuario, lembrar: !!d.lembrar });
      gravarSess(papel, { token: r.token, id: r.id, nome: r.nome }, d.lembrar);
    },

    // ---------- área do barbeiro ----------
    barb: {
      inicio: () => brb('GET', '/api/barbeiro/inicio'),
      agendamentos: (de, ate) => brb('GET', `/api/barbeiro/agendamentos?${qs({ de, ate: ate || de })}`),
      criar: d => brb('POST', '/api/barbeiro/agendamentos', d),
      finalizar: (id, d) => brb('POST', `/api/barbeiro/agendamentos/${id}/finalizar`, d),
      status: (id, status) => brb('PATCH', `/api/barbeiro/agendamentos/${id}`, { status }),
      excluir: id => brb('DELETE', `/api/barbeiro/agendamentos/${id}`),
      addItem: (id, d) => brb('POST', `/api/barbeiro/agendamentos/${id}/itens`, d),
      remItem: (id, itemId) => brb('DELETE', `/api/barbeiro/agendamentos/${id}/itens/${itemId}`),
      bloqueios: () => brb('GET', '/api/barbeiro/bloqueios'),
      salvarBloqueio: b => brb('POST', '/api/barbeiro/bloqueios', b),
      excluirBloqueio: id => brb('DELETE', '/api/barbeiro/bloqueios/' + id),
      financeiro: mes => brb('GET', `/api/barbeiro/financeiro?mes=${mes}`),
      anexoPagamento: (pgId, anId) => brb('GET', `/api/barbeiro/pagamentos/${pgId}/anexos/${anId}`, null, { blob: true }),
    },

    // ---------- administrador ----------
    admin: {
      dados: () => adm('GET', '/api/admin/dados'),
      agendamentos: (de, ate) => adm('GET', `/api/admin/agendamentos?${qs({ de, ate: ate || de })}`),
      balcao: d => adm('POST', '/api/admin/agendamentos', d),
      finalizar: (id, d) => adm('POST', `/api/admin/agendamentos/${id}/finalizar`, d),
      atualizar: (id, d) => adm('PATCH', `/api/admin/agendamentos/${id}`, d),
      excluir: id => adm('DELETE', `/api/admin/agendamentos/${id}`),
      addItem: (id, d) => adm('POST', `/api/admin/agendamentos/${id}/itens`, d),
      remItem: (id, itemId) => adm('DELETE', `/api/admin/agendamentos/${id}/itens/${itemId}`),
      // anexos: tipo = 'agendamentos' | 'pagamentos' | 'despesas'
      anexar: (tipo, id, arquivo) => adm('POST', `/api/admin/${tipo}/${id}/anexos`, null, { arquivo }),
      anexo: (tipo, id, anId) => adm('GET', `/api/admin/${tipo}/${id}/anexos/${anId}`, null, { blob: true }),
      excluirAnexo: (tipo, id, anId) => adm('DELETE', `/api/admin/${tipo}/${id}/anexos/${anId}`),
      financeiro: mes => adm('GET', `/api/admin/financeiro?mes=${mes}`),
      salvarPagamento: p => adm('POST', '/api/admin/pagamentos', p),
      excluirPagamento: id => adm('DELETE', '/api/admin/pagamentos/' + id),
      despesas: (de, ate) => adm('GET', `/api/admin/despesas?${qs({ de, ate })}`),
      salvarDespesa: d => adm('POST', '/api/admin/despesas', d),
      excluirDespesa: id => adm('DELETE', '/api/admin/despesas/' + id),
      salvarProduto: p => adm('POST', '/api/admin/produtos', p),
      excluirProduto: id => adm('DELETE', '/api/admin/produtos/' + id),
      movimentos: (de, ate, produto) => adm('GET', `/api/admin/estoque/movimentos?${qs({ de, ate, produto })}`),
      movimentar: d => adm('POST', '/api/admin/estoque/movimentos', d),
      salvarConfig: c => adm('PUT', '/api/admin/config', c),
      salvarServico: s => adm('POST', '/api/admin/servicos', s),
      excluirServico: id => adm('DELETE', '/api/admin/servicos/' + id),
      salvarBarbeiro: b => adm('POST', '/api/admin/barbeiros', b),
      desbloquear: id => adm('POST', `/api/admin/barbeiros/${id}/desbloquear`),
      excluirBarbeiro: id => adm('DELETE', '/api/admin/barbeiros/' + id),
      salvarBloqueio: b => adm('POST', '/api/admin/bloqueios', b),
      excluirBloqueio: id => adm('DELETE', '/api/admin/bloqueios/' + id),
      resetarDemo: () => { if (CFG.resetarDemo) CFG.resetarDemo(); },
    },
  };
})();
