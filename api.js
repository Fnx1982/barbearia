// =====================================================================
//  api.js — camada de dados do site.   versão 3
//  • Com APP_CONFIG.API_URL preenchido: conversa com o Worker (produção).
//  • Com API_URL vazio: MODO DEMONSTRAÇÃO, dados salvos só neste navegador.
// =====================================================================
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const API = String(CFG.API_URL || '').replace(/\/+$/, '');
  const DEMO = !API;

  // ===== REGRAS COMPARTILHADAS — idênticas no site (api.js) e no Worker =====
const FORMAS = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Cartão de débito', credito: 'Cartão de crédito', outro: 'Outro' };
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
function aplicarFinalizacao(a, b, d, por) {
  const bruto = d.valor === '' || d.valor === undefined || d.valor === null ? a.total : d.valor;
  const valor = Math.max(0, r2(bruto));
  const pct = pctComissao(b);
  return {
    ...a, status: 'concluido', conferido: false,
    pagamento: {
      forma: FORMAS[d.forma] ? d.forma : 'outro', valor, comissaoPct: pct, comissaoValor: r2(valor * pct / 100),
      obs: String(d.obs || '').trim().slice(0, 200), finalizadoEm: new Date().toISOString(), finalizadoPor: por,
    },
  };
}
function checarStatus(a, status, por) {
  const ok = por === 'barbeiro' ? ['confirmado', 'faltou'] : ['confirmado', 'faltou', 'cancelado'];
  if (!ok.includes(status)) throw new Error('Status inválido.');
  if (por === 'barbeiro' && a.conferido) throw new Error('Esse atendimento já foi conferido pela gerência.');
  if (por === 'barbeiro' && a.status === 'cancelado') throw new Error('Agendamento cancelado pela barbearia.');
}
function mudarStatus(a, status) {
  const n = { ...a, status };
  if (status !== 'concluido') { delete n.pagamento; n.conferido = false; }
  return n;
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
    toMin, soDigitos, fazServicos, limparUsuario, senhaFraca, somarDias, limitesMes, r2, soma, FORMAS, pagDe, pctComissao,
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

  // ------------------------------------------------- modo demonstração
  const CHAVE = 'barbearia_demo_v3';
  let mem = null;
  const ERRO = msg => Promise.reject(new Error(msg));

  function semana() {
    return [0, 1, 2, 3, 4, 5, 6].map(i => ({
      aberto: i !== 0, inicio: '09:00', fim: i === 6 ? '17:00' : '19:00',
      pausaInicio: i === 6 ? '' : '12:00', pausaFim: i === 6 ? '' : '13:00',
    }));
  }
  function seed() {
    let sem = 11; const rnd = () => (sem = (sem * 16807) % 2147483647) / 2147483647;
    const pick = l => l[Math.floor(rnd() * l.length)];
    const s = (nome, duracao, preco, descricao = '') => ({ id: novoId(), nome, descricao, duracao, preco, ativo: true, ordem: 0 });
    const servicos = [
      s('Corte de cabelo', 30, 45, 'Máquina e tesoura, com lavagem'), s('Barba', 30, 35, 'Toalha quente e navalha'),
      s('Corte + barba', 60, 70, 'O combo completo'), s('Sobrancelha', 15, 15), s('Pezinho', 15, 20, 'Acabamento entre cortes'),
      s('Pigmentação', 30, 40),
    ];
    const b1 = { id: novoId(), nome: 'Rafael', bio: 'Degradê e cortes clássicos', foto: '', ativo: true, ordem: 0, comissao: 50, servicos: [], horarios: semana(), usuario: 'rafael', senhaDemo: 'barba1' };
    const h2 = semana(); h2[1].aberto = false;
    const b2 = { id: novoId(), nome: 'Lucas', bio: 'Barba e navalha', foto: '', ativo: true, ordem: 1, comissao: 40, servicos: servicos.slice(0, 5).map(x => x.id), horarios: h2, usuario: 'lucas', senhaDemo: 'barba1' };
    const hoje = U.hojeISO(), agora = U.agoraMin();
    const nomes = ['Carlos Mendes', 'João Pedro', 'André Silva', 'Marcos Lima', 'Felipe Costa', 'Bruno Alves', 'Diego Rocha', 'Gustavo Reis', 'Thiago Nunes', 'Vinícius Prado', 'Rodrigo Melo', 'Leandro Dias', 'Paulo Henrique', 'Eduardo Faria', 'Igor Matos'];
    const tels = nomes.map((_, i) => '4199' + String(1000000 + i * 73331).slice(0, 7));
    const formas = ['pix', 'pix', 'pix', 'dinheiro', 'debito', 'credito'];
    const agendamentos = [];
    const ag = (b, sv, data, ini, ci, status) => {
      const a = {
        id: novoId(), barbeiroId: b.id, barbeiroNome: b.nome, servicoIds: [sv.id], servicosNome: sv.nome, data,
        inicio: ini, fim: ini + sv.duracao, duracao: sv.duracao, total: sv.preco, clienteNome: nomes[ci], clienteTelefone: tels[ci],
        obs: '', status: 'confirmado', origem: rnd() < 0.7 ? 'site' : 'balcao', criadoEm: new Date().toISOString(), conferido: false, anexos: [], obsInterna: '',
      };
      if (status === 'concluido') {
        const f = aplicarFinalizacao(a, b, { forma: pick(formas), valor: rnd() < 0.1 ? sv.preco + 20 : sv.preco }, 'barbeiro');
        f.conferido = data < somarDias(hoje, -5); return f;
      }
      a.status = status; return a;
    };
    for (let d = -45; d <= 3; d++) {
      const data = somarDias(hoje, d), dow = U.diaSemana(data);
      [b1, b2].forEach(b => {
        if (!b.horarios[dow].aberto) return;
        const n = d > 0 ? 2 : 3 + Math.floor(rnd() * 4);
        const ocup = [];
        for (let k = 0; k < n; k++) {
          const sv = pick(b === b2 ? servicos.slice(0, 5) : servicos);
          const ini = (9 + Math.floor(rnd() * 9)) * 60 + pick([0, 30]);
          if (ini >= 12 * 60 && ini < 13 * 60) continue;
          if (ini + sv.duracao > toMin(b.horarios[dow].fim) || ocup.some(([x, y]) => ini < y && ini + sv.duracao > x)) continue;
          if (ini < 12 * 60 && ini + sv.duracao > 12 * 60) continue;
          ocup.push([ini, ini + sv.duracao]);
          const passado = d < 0 || (d === 0 && ini + sv.duracao <= agora);
          const st = passado ? (rnd() < 0.08 ? 'faltou' : 'concluido') : 'confirmado';
          agendamentos.push(ag(b, sv, data, ini, Math.floor(rnd() * nomes.length), st));
        }
      });
    }
    const mesAnt = U.addMes(hoje.slice(0, 7), -1);
    const pagamentos = [
      { id: novoId(), barbeiroId: b1.id, barbeiroNome: b1.nome, data: mesAnt + '-05', valor: 900, tipo: 'pagamento', forma: 'pix', obs: '', criadoEm: '' },
      { id: novoId(), barbeiroId: b2.id, barbeiroNome: b2.nome, data: mesAnt + '-05', valor: 650, tipo: 'pagamento', forma: 'pix', obs: '', criadoEm: '' },
      { id: novoId(), barbeiroId: b1.id, barbeiroNome: b1.nome, data: hoje.slice(0, 7) + '-05', valor: 600, tipo: 'pagamento', forma: 'pix', obs: 'Fechamento do mês anterior', criadoEm: '' },
      { id: novoId(), barbeiroId: b2.id, barbeiroNome: b2.nome, data: hoje.slice(0, 7) + '-02', valor: 150, tipo: 'vale', forma: 'dinheiro', obs: 'Adiantamento', criadoEm: '' },
    ].filter(p => p.data <= hoje);
    return {
      config: {
        nome: 'Barbearia Modelo', slogan: 'Corte, barba e cuidado — com hora marcada.', logo: '', cor: '#c8102e',
        whatsapp: '5541999990000', telefone: '(41) 3333-0000', endereco: 'Rua Exemplo, 123 — Centro', mapa: '',
        instagram: 'barbeariamodelo', sobre: 'Ambiente climatizado, café por nossa conta e Wi-Fi liberado. Aceitamos Pix e cartões.',
        grade: 15, antecedencia: 60, diasAFrente: 30, fuso: 'America/Sao_Paulo',
      },
      servicos, barbeiros: [b1, b2], pagamentos, tentativas: {},
      bloqueios: [{ id: novoId(), barbeiroId: b2.id, data: somarDias(hoje, 4), dataFim: somarDias(hoje, 4), diaInteiro: true, inicio: '', fim: '', motivo: 'Folga' }],
      agendamentos,
    };
  }
  function db() {
    if (mem) return mem;
    try { const s = localStorage.getItem(CHAVE); if (s) return (mem = JSON.parse(s)); } catch (e) { /* sem storage */ }
    mem = seed(); gravar(); return mem;
  }
  function gravar() { try { localStorage.setItem(CHAVE, JSON.stringify(mem)); } catch (e) { /* cheio ou bloqueado */ } }
  const copia = x => JSON.parse(JSON.stringify(x));
  const ok = v => new Promise(r => setTimeout(() => r(copia(v)), 100));
  const tenta = fn => { try { return ok(fn()); } catch (e) { return Promise.reject(e); } };
  const semAcesso = (b, admin) => { const { senhaDemo, ...r } = b; if (!admin) { delete r.usuario; delete r.ultimoAcesso; return r; } const t = (db().tentativas || {})['barb:' + b.usuario]; return { ...r, temAcesso: !!senhaDemo, bloqueadoAte: t && t.bloqueadoAte > Date.now() ? t.bloqueadoAte : 0 }; };
  const semAnexos = a => { const { anexos, obsInterna, ...r } = a; return { ...r, qtdAnexos: (anexos || []).length }; };
  const achar = id => { const a = db().agendamentos.find(x => x.id === id); if (!a) throw new Error('Agendamento não encontrado.'); return a; };
  const trocar = n => { const D = db(); D.agendamentos[D.agendamentos.findIndex(x => x.id === n.id)] = n; gravar(); return n; };

  function finDemo(mes, so) {
    const D = db(), [ini, fim] = limitesMes(mes);
    const ags = D.agendamentos.filter(a => a.data >= ini && a.data <= fim && (!so || a.barbeiroId === so));
    const pags = D.pagamentos.filter(p => p.data >= ini && p.data <= fim && (!so || p.barbeiroId === so)).sort((a, b) => a.data < b.data ? -1 : 1);
    const ant = acumularAnteriores(
      D.agendamentos.filter(a => a.status === 'concluido' && a.data < ini && (!so || a.barbeiroId === so)).map(a => ({ barbeiroId: a.barbeiroId, comissaoValor: a.pagamento ? a.pagamento.comissaoValor : null, total: a.total })),
      D.pagamentos.filter(p => p.data < ini && (!so || p.barbeiroId === so)), D.barbeiros);
    const lista = so ? D.barbeiros.filter(b => b.id === so) : D.barbeiros;
    return { mes, resumo: resumoFinanceiro(lista, ags, pags, ant), pagamentos: pags };
  }

  const demo = {
    publico() { const D = db(); return ok({ config: D.config, servicos: D.servicos.filter(s => s.ativo), barbeiros: D.barbeiros.filter(b => b.ativo).map(b => { const r = semAcesso(b); delete r.comissao; return r; }) }); },
    ocupados(data) {
      const D = db();
      return ok({
        ocupados: D.agendamentos.filter(a => a.data === data && a.status !== 'cancelado').map(a => ({ barbeiroId: a.barbeiroId, inicio: a.inicio, fim: a.fim })),
        bloqueios: D.bloqueios.filter(b => b.data <= data && b.dataFim >= data),
      });
    },
    agendar(d, admin) {
      if (!admin && d.site) return ERRO('Não foi possível agendar.');
      return tenta(() => {
        const D = db(), hoje = U.hojeISO();
        const ag = montarAgendamento({
          config: D.config, servicos: D.servicos, barbeiros: D.barbeiros, bloqueios: D.bloqueios,
          ocupados: D.agendamentos.filter(a => a.data === d.data && a.status !== 'cancelado'),
          futurosDoTelefone: D.agendamentos.filter(a => a.clienteTelefone === soDigitos(d.clienteTelefone) && a.status === 'confirmado' && a.data >= hoje).length,
        }, d, admin, hoje, U.agoraMin());
        D.agendamentos.push(ag); gravar(); return ag;
      });
    },
  };

  // ------------------------------------------------------- servidor
  const SESS = { adm: 'barb_sess_adm', barb: 'barb_sess_barb' };
  const memSess = {};
  function lerSess(p) { try { const s = sessionStorage.getItem(SESS[p]) || localStorage.getItem(SESS[p]); if (s) return JSON.parse(s); } catch (e) { /* */ } return memSess[p] || null; }
  function gravarSess(p, v, lembrar) {
    memSess[p] = v;
    try {
      sessionStorage.removeItem(SESS[p]); localStorage.removeItem(SESS[p]);
      if (v) (lembrar ? localStorage : sessionStorage).setItem(SESS[p], JSON.stringify(v));
    } catch (e) { /* */ }
  }

  async function req(metodo, caminho, corpo, papel, extra = {}) {
    const h = {};
    if (papel) { const s = lerSess(papel); h.Authorization = 'Bearer ' + (s ? s.token : ''); }
    let body;
    if (extra.arquivo) { body = extra.arquivo; h['Content-Type'] = extra.arquivo.type || 'application/octet-stream'; h['X-Nome-Arquivo'] = encodeURIComponent(extra.arquivo.name || 'arquivo'); }
    else if (corpo) { body = JSON.stringify(corpo); h['Content-Type'] = 'application/json'; }
    let r;
    try { r = await fetch(API + caminho, { method: metodo, headers: h, body }); }
    catch (e) { throw new Error('Sem conexão com o servidor. Tente de novo.'); }
    if (extra.blob && r.ok) return r.blob();
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && papel) { gravarSess(papel, null); const e = new Error(j.erro || 'Sessão expirada.'); e.auth = true; throw e; }
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
    return j;
  }
  const adm = (m, c, b, x) => req(m, c, b, 'adm', x);
  const brb = (m, c, b) => req(m, c, b, 'barb');

  function sessDemoBarb() { const s = lerSess('barb'); const b = s && db().barbeiros.find(x => x.id === s.id && x.ativo && x.senhaDemo); if (!b) { gravarSess('barb', null); const e = new Error('Sessão expirada.'); e.auth = true; throw e; } return b; }

  // ------------------------------------------------------- interface
  function upsert(lista, obj) { const i = lista.findIndex(x => x.id === obj.id); i >= 0 ? (lista[i] = obj) : lista.push(obj); }
  const lerArquivoURL = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('Não foi possível ler o arquivo.')); fr.readAsDataURL(f); });
  function dataURLparaBlob(u) { const [cab, b64] = u.split(','); const tipo = cab.slice(5).split(';')[0]; const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: tipo }); }

  window.U = U;
  window.horariosLivres = horariosLivres;
  window.Api = {
    demo: DEMO,
    publico: () => DEMO ? demo.publico() : req('GET', '/api/publico'),
    ocupados: data => DEMO ? demo.ocupados(data) : req('GET', '/api/ocupados?data=' + encodeURIComponent(data)),
    agendar: d => DEMO ? demo.agendar(d, false) : req('POST', '/api/agendamentos', d),

    sessao: p => lerSess(p),
    sair: p => gravarSess(p, null),
    async login(d) {
      const papel = d.papel === 'barb' ? 'barb' : 'adm';
      if (DEMO) {
        const D = db(), agora = Date.now(); D.tentativas = D.tentativas || {};
        const usuario = limparUsuario(d.usuario), chave = papel === 'barb' ? 'barb:' + usuario : 'adm';
        const t0 = D.tentativas[chave];
        if (t0 && t0.bloqueadoAte > agora) throw new Error(msgBloqueio(t0.bloqueadoAte, agora));
        const b = papel === 'barb' ? D.barbeiros.find(x => x.usuario === usuario && x.ativo && x.senhaDemo) : null;
        const ok = papel === 'adm' ? d.senha === 'admin' : !!(b && b.senhaDemo === d.senha);
        if (!ok) {
          const c = avaliarFalha(t0, agora, 5); D.tentativas[chave] = c.t; gravar();
          await new Promise(r => setTimeout(r, 400));
          if (c.t.bloqueadoAte > agora) throw new Error(msgBloqueio(c.t.bloqueadoAte, agora));
          throw new Error((papel === 'adm' ? 'Senha incorreta.' : 'Usuário ou senha incorretos.') + (c.restantes <= 2 ? ` Mais ${c.restantes} erro(s) e o acesso será bloqueado por um tempo.` : '') + (papel === 'adm' ? ' (demonstração: admin)' : ' (demonstração: rafael / barba1)'));
        }
        delete D.tentativas[chave];
        if (b) b.ultimoAcesso = new Date().toISOString();
        gravar();
        gravarSess(papel, papel === 'adm' ? { token: 'demo', nome: 'Administrador' } : { token: 'demo', id: b.id, nome: b.nome }, d.lembrar); return;
      }
      const r = await req('POST', '/api/login', { papel, senha: d.senha, usuario: d.usuario, lembrar: !!d.lembrar });
      gravarSess(papel, { token: r.token, id: r.id, nome: r.nome }, d.lembrar);
    },

    // ---------- área do barbeiro ----------
    barb: {
      inicio() { if (!DEMO) return brb('GET', '/api/barbeiro/inicio'); return tenta(() => { const D = db(), b = sessDemoBarb(); return { config: D.config, barbeiro: semAcesso(b, true), servicos: D.servicos.filter(s => s.ativo) }; }); },
      agendamentos(de, ate) { if (!DEMO) return brb('GET', `/api/barbeiro/agendamentos?de=${de}&ate=${ate || de}`); return tenta(() => { const b = sessDemoBarb(); return db().agendamentos.filter(a => a.barbeiroId === b.id && a.data >= de && a.data <= (ate || de)).sort((x, y) => x.data === y.data ? x.inicio - y.inicio : x.data < y.data ? -1 : 1).map(semAnexos); }); },
      finalizar(id, d) { if (!DEMO) return brb('POST', `/api/barbeiro/agendamentos/${id}/finalizar`, d); return tenta(() => { const b = sessDemoBarb(), a = achar(id); if (a.barbeiroId !== b.id) throw new Error('Esse atendimento não é seu.'); checarFinalizar(a, 'barbeiro', U.hojeISO()); return semAnexos(trocar(aplicarFinalizacao(a, b, d, 'barbeiro'))); }); },
      status(id, status) { if (!DEMO) return brb('PATCH', `/api/barbeiro/agendamentos/${id}`, { status }); return tenta(() => { const b = sessDemoBarb(), a = achar(id); if (a.barbeiroId !== b.id) throw new Error('Esse atendimento não é seu.'); checarStatus(a, status, 'barbeiro'); return semAnexos(trocar(mudarStatus(a, status))); }); },
      financeiro(mes) { if (!DEMO) return brb('GET', `/api/barbeiro/financeiro?mes=${mes}`); return tenta(() => { const b = sessDemoBarb(), f = finDemo(mes, b.id); return { resumo: f.resumo.find(r => r.barbeiroId === b.id) || null, pagamentos: f.pagamentos }; }); },
    },

    // ---------- administrador ----------
    admin: {
      dados() { if (!DEMO) return adm('GET', '/api/admin/dados'); const D = db(); return ok({ config: D.config, servicos: D.servicos, barbeiros: D.barbeiros.map(b => semAcesso(b, true)), bloqueios: D.bloqueios.filter(b => b.dataFim >= somarDias(U.hojeISO(), -30)) }); },
      agendamentos(de, ate) { if (!DEMO) return adm('GET', `/api/admin/agendamentos?de=${de}&ate=${ate || de}`); return ok(db().agendamentos.filter(a => a.data >= de && a.data <= (ate || de)).sort((x, y) => x.data === y.data ? x.inicio - y.inicio : x.data < y.data ? -1 : 1)); },
      balcao: d => DEMO ? demo.agendar(d, true) : adm('POST', '/api/admin/agendamentos', d),
      finalizar(id, d) { if (!DEMO) return adm('POST', `/api/admin/agendamentos/${id}/finalizar`, d); return tenta(() => { const a = achar(id); checarFinalizar(a, 'admin', U.hojeISO()); return trocar(aplicarFinalizacao(a, db().barbeiros.find(b => b.id === a.barbeiroId), d, 'admin')); }); },
      atualizar(id, d) {
        if (!DEMO) return adm('PATCH', `/api/admin/agendamentos/${id}`, d);
        return tenta(() => {
          const D = db(); let a = achar(id);
          if (d.status && d.status !== a.status) {
            checarStatus(a, d.status, 'admin');
            if (a.status === 'cancelado' && D.agendamentos.some(x => x.id !== id && x.barbeiroId === a.barbeiroId && x.data === a.data && x.status !== 'cancelado' && x.inicio < a.fim && x.fim > a.inicio)) throw new Error('Esse horário já foi ocupado por outro cliente.');
            a = mudarStatus(a, d.status);
          }
          if (typeof d.conferido === 'boolean') { if (d.conferido && a.status !== 'concluido') throw new Error('Só dá para conferir atendimento finalizado.'); a = { ...a, conferido: d.conferido, conferidoEm: d.conferido ? new Date().toISOString() : '' }; }
          if (typeof d.obsInterna === 'string') a = { ...a, obsInterna: d.obsInterna.slice(0, 500) };
          return trocar(a);
        });
      },
      async anexar(id, arquivo) {
        if (!DEMO) return adm('POST', `/api/admin/agendamentos/${id}/anexos`, null, { arquivo });
        if (arquivo.size > 1.5 * 1024 * 1024) throw new Error('Na demonstração o limite é 1,5 MB por arquivo (no site real, 8 MB).');
        const url = await lerArquivoURL(arquivo), a = achar(id);
        if ((a.anexos || []).length >= 10) throw new Error('Limite de 10 arquivos por atendimento.');
        a.anexos = [...(a.anexos || []), { id: novoId(), nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size, criadoEm: new Date().toISOString(), url }];
        gravar(); return copia(a);
      },
      async anexo(agId, anId) {
        if (!DEMO) return adm('GET', `/api/admin/agendamentos/${agId}/anexos/${anId}`, null, { blob: true });
        const an = (achar(agId).anexos || []).find(x => x.id === anId); if (!an) throw new Error('Arquivo não encontrado.');
        return dataURLparaBlob(an.url);
      },
      excluirAnexo(agId, anId) { if (!DEMO) return adm('DELETE', `/api/admin/agendamentos/${agId}/anexos/${anId}`); return tenta(() => { const a = achar(agId); a.anexos = (a.anexos || []).filter(x => x.id !== anId); gravar(); return a; }); },
      financeiro(mes) { if (!DEMO) return adm('GET', `/api/admin/financeiro?mes=${mes}`); return tenta(() => finDemo(mes, null)); },
      salvarPagamento(p) {
        if (!DEMO) return adm('POST', '/api/admin/pagamentos', p);
        return tenta(() => {
          const b = db().barbeiros.find(x => x.id === p.barbeiroId); if (!b) throw new Error('Barbeiro não encontrado.');
          const pg = { id: p.id || novoId(), barbeiroId: b.id, barbeiroNome: b.nome, data: p.data || U.hojeISO(), valor: r2(p.valor), tipo: p.tipo === 'vale' ? 'vale' : 'pagamento', forma: p.forma || 'pix', obs: String(p.obs || '').slice(0, 200), criadoEm: new Date().toISOString() };
          if (!(pg.valor > 0)) throw new Error('Informe um valor maior que zero.');
          upsert(db().pagamentos, pg); gravar(); return pg;
        });
      },
      excluirPagamento(id) { if (!DEMO) return adm('DELETE', '/api/admin/pagamentos/' + id); const D = db(); D.pagamentos = D.pagamentos.filter(p => p.id !== id); gravar(); return ok({ ok: true }); },
      salvarConfig(c) { if (!DEMO) return adm('PUT', '/api/admin/config', c); db().config = c; gravar(); return ok(c); },
      salvarServico(s) { if (!DEMO) return adm('POST', '/api/admin/servicos', s); if (!s.id) s.id = novoId(); upsert(db().servicos, s); gravar(); return ok(s); },
      excluirServico(id) { if (!DEMO) return adm('DELETE', '/api/admin/servicos/' + id); const D = db(); D.servicos = D.servicos.filter(s => s.id !== id); gravar(); return ok({ ok: true }); },
      salvarBarbeiro(b) {
        if (!DEMO) return adm('POST', '/api/admin/barbeiros', b);
        return tenta(() => {
          const D = db(), antigo = D.barbeiros.find(x => x.id === b.id);
          const { novaSenha, removerAcesso, temAcesso, ...n } = b;
          if (!n.id) n.id = novoId();
          n.comissao = pctComissao(n);
          delete n.bloqueadoAte;
          n.usuario = limparUsuario(n.usuario);
          if (antigo && antigo.senhaDemo) n.senhaDemo = antigo.senhaDemo;
          if (antigo && antigo.ultimoAcesso) n.ultimoAcesso = antigo.ultimoAcesso;
          if (n.usuario && n.usuario.length < 3) throw new Error('O usuário precisa ter pelo menos 3 letras ou números.');
          const outro = n.usuario && D.barbeiros.find(x => x.usuario === n.usuario && x.id !== n.id);
          if (outro) throw new Error(`O usuário "${n.usuario}" já é do ${outro.nome}. Escolha outro.`);
          if (novaSenha) { const fraca = senhaFraca(novaSenha); if (fraca) throw new Error(fraca); if (!n.usuario) throw new Error('Defina o usuário de acesso junto com a senha.'); n.senhaDemo = String(novaSenha); }
          if (removerAcesso) delete n.senhaDemo;
          upsert(D.barbeiros, n); gravar(); return semAcesso(n, true);
        });
      },
      desbloquear(id) { if (!DEMO) return adm('POST', `/api/admin/barbeiros/${id}/desbloquear`); const D = db(), b = D.barbeiros.find(x => x.id === id); if (b && D.tentativas) delete D.tentativas['barb:' + b.usuario]; gravar(); return ok({ ok: true }); },
      excluirBarbeiro(id) {
        if (!DEMO) return adm('DELETE', '/api/admin/barbeiros/' + id);
        const D = db(), hoje = U.hojeISO(); let n = 0;
        D.agendamentos = D.agendamentos.map(a => { if (a.barbeiroId === id && a.data >= hoje && a.status === 'confirmado') { n++; return mudarStatus(a, 'cancelado'); } return a; });
        D.barbeiros = D.barbeiros.filter(b => b.id !== id); gravar(); return ok({ ok: true, cancelados: n });
      },
      salvarBloqueio(b) {
        if (!DEMO) return adm('POST', '/api/admin/bloqueios', b);
        if (!b.id) b.id = novoId(); if (!b.dataFim || b.dataFim < b.data) b.dataFim = b.data;
        if (!b.diaInteiro && (!b.inicio || !b.fim || b.fim <= b.inicio)) return ERRO('Informe um período válido (início antes do fim).');
        upsert(db().bloqueios, b); gravar();
        const conflitos = db().agendamentos.filter(a => a.status === 'confirmado' && a.data >= b.data && a.data <= b.dataFim && (!b.barbeiroId || a.barbeiroId === b.barbeiroId) && (b.diaInteiro || (a.inicio < toMin(b.fim) && a.fim > toMin(b.inicio)))).length;
        return ok({ bloqueio: b, conflitos });
      },
      excluirBloqueio(id) { if (!DEMO) return adm('DELETE', '/api/admin/bloqueios/' + id); const D = db(); D.bloqueios = D.bloqueios.filter(b => b.id !== id); gravar(); return ok({ ok: true }); },
      resetarDemo() { mem = seed(); gravar(); },
    },
  };
})();