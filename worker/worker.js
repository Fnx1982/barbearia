// =====================================================================
//  BARBEARIA — Backend (Cloudflare Worker + D1 + R2)   versão 2
//  Cole este arquivo inteiro no editor do Worker.
//  Bindings / variáveis necessários:
//    • D1  →  nome da variável:  DB
//    • R2  →  nome da variável:  ARQUIVOS   (comprovantes e anexos)
//    • Secret  ADMIN_PASSWORD  (senha do painel do administrador)
//    • (opcional) Variável ORIGEM_PERMITIDA = https://seusite.pages.dev
//  As tabelas novas são criadas sozinhas. Os dados antigos continuam.
// =====================================================================

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK (id = 1), dados TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS servicos (id TEXT PRIMARY KEY, ordem INTEGER NOT NULL DEFAULT 0, dados TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS barbeiros (id TEXT PRIMARY KEY, ordem INTEGER NOT NULL DEFAULT 0, dados TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS bloqueios (id TEXT PRIMARY KEY, data TEXT NOT NULL, data_fim TEXT NOT NULL, dados TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS agendamentos (id TEXT PRIMARY KEY, barbeiro_id TEXT NOT NULL, data TEXT NOT NULL, inicio INTEGER NOT NULL, fim INTEGER NOT NULL, status TEXT NOT NULL, telefone TEXT NOT NULL, dados TEXT NOT NULL, criado_em TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pagamentos (id TEXT PRIMARY KEY, barbeiro_id TEXT NOT NULL, data TEXT NOT NULL, valor REAL NOT NULL, dados TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_ag_barb_data ON agendamentos (barbeiro_id, data)`,
  `CREATE INDEX IF NOT EXISTS idx_ag_data ON agendamentos (data)`,
  `CREATE INDEX IF NOT EXISTS idx_ag_tel ON agendamentos (telefone)`,
  `CREATE INDEX IF NOT EXISTS idx_bl_data ON bloqueios (data, data_fim)`,
  `CREATE INDEX IF NOT EXISTS idx_pg_data ON pagamentos (data)`,
];

const CONFIG_PADRAO = {
  nome: 'Sua Barbearia', slogan: 'Corte, barba e cuidado — com hora marcada.', logo: '',
  cor: '#c8102e', whatsapp: '', telefone: '', endereco: '', mapa: '', instagram: '', sobre: '',
  grade: 15, antecedencia: 60, diasAFrente: 30, fuso: 'America/Sao_Paulo',
};
const MAX_ANEXO = 8 * 1024 * 1024;
const TIPOS_ANEXO = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/;

let pronto = false;

class Erro extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

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
// ===== fim das regras compartilhadas =====


export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ORIGEM_PERMITIDA || '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Nome-Arquivo',
      'Access-Control-Max-Age': '86400',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    let corpo, status = 200;
    try {
      if (!env.DB) throw new Erro('Binding D1 "DB" não configurado no Worker.', 500);
      await iniciar(env);
      corpo = await rotear(req, env);
      if (corpo instanceof Response) {
        const h = new Headers(corpo.headers); Object.entries(cors).forEach(([k, v]) => h.set(k, v));
        return new Response(corpo.body, { status: corpo.status, headers: h });
      }
    } catch (e) {
      status = e.status || 500;
      corpo = { erro: e.status ? e.message : 'Erro interno no servidor.' };
      if (status >= 500) console.error(e);
    }
    return new Response(JSON.stringify(corpo), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
};

// ---------------------------------------------------------------- rotas
async function rotear(req, env) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '');
  const m = req.method;
  const q = k => url.searchParams.get(k) || '';

  if (p === '' || p === '/api') return { ok: true, sistema: 'barbearia', versao: 2 };

  // ---------- público ----------
  if (p === '/api/publico' && m === 'GET') {
    const [config, servicos, barbeiros] = await Promise.all([lerConfig(env), lerTodos(env, 'servicos'), lerTodos(env, 'barbeiros')]);
    return { config, servicos: servicos.filter(s => s.ativo), barbeiros: barbeiros.filter(b => b.ativo).map(publicoBarbeiro) };
  }
  if (p === '/api/ocupados' && m === 'GET') {
    if (!ehData(q('data'))) throw new Erro('Data inválida.');
    return ocupadosDoDia(env, q('data'));
  }
  if (p === '/api/agendamentos' && m === 'POST') return criarAgendamento(env, await lerJSON(req), false);

  if (p === '/api/login' && m === 'POST') {
    const d = await lerJSON(req);
    if (!env.ADMIN_PASSWORD) throw new Erro('Configure o secret ADMIN_PASSWORD no Worker.', 500);
    if (d.papel === 'barb') {
      const b = await lerUm(env, 'barbeiros', String(d.barbeiroId || ''));
      const ok = b && b.ativo && b.acesso && (await hashSenha(String(d.senha || ''), b.acesso.salt)) === b.acesso.hash;
      if (!ok) { await esperar(600); throw new Erro('Barbeiro ou senha incorretos.', 401); }
      return { token: await gerarToken(env, 'barb', b.id, b.acesso.salt.slice(0, 8)), nome: b.nome, id: b.id };
    }
    const a = await hmac(env.ADMIN_PASSWORD, 'senha:' + String(d.senha || ''));
    const b = await hmac(env.ADMIN_PASSWORD, 'senha:' + env.ADMIN_PASSWORD);
    if (a !== b) { await esperar(600); throw new Erro('Senha incorreta.', 401); }
    return { token: await gerarToken(env, 'adm', '-', 'a'), nome: 'Administrador' };
  }

  // ---------- área do barbeiro ----------
  if (p.startsWith('/api/barbeiro/')) {
    const s = await sessao(env, req, 'barb');
    const [rec, id, acao] = p.split('/').slice(3);
    const config = await lerConfig(env);
    const { hoje } = agoraNoFuso(config.fuso);

    if (rec === 'inicio' && m === 'GET') {
      return { config, barbeiro: publicoBarbeiro(s.barbeiro, true), servicos: (await lerTodos(env, 'servicos')).filter(x => x.ativo) };
    }
    if (rec === 'agendamentos' && m === 'GET') {
      const [de, ate] = periodo(q('de'), q('ate'));
      const r = await env.DB.prepare('SELECT dados FROM agendamentos WHERE barbeiro_id = ? AND data BETWEEN ? AND ? ORDER BY data, inicio').bind(s.barbeiro.id, de, ate).all();
      return r.results.map(x => semAnexos(JSON.parse(x.dados)));
    }
    if (rec === 'agendamentos' && id && acao === 'finalizar' && m === 'POST') {
      const ag = await lerAgendamento(env, id);
      if (ag.barbeiroId !== s.barbeiro.id) throw new Erro('Esse atendimento não é seu.', 403);
      try { checarFinalizar(ag, 'barbeiro', hoje); } catch (e) { throw new Erro(e.message, 409); }
      return semAnexos(await gravarAgendamento(env, aplicarFinalizacao(ag, s.barbeiro, await lerJSON(req), 'barbeiro')));
    }
    if (rec === 'agendamentos' && id && !acao && m === 'PATCH') {
      const ag = await lerAgendamento(env, id);
      if (ag.barbeiroId !== s.barbeiro.id) throw new Erro('Esse atendimento não é seu.', 403);
      const { status } = await lerJSON(req);
      try { checarStatus(ag, status, 'barbeiro'); } catch (e) { throw new Erro(e.message, 409); }
      return semAnexos(await gravarAgendamento(env, mudarStatus(ag, status)));
    }
    if (rec === 'financeiro' && m === 'GET') {
      const mes = ehMes(q('mes')) ? q('mes') : hoje.slice(0, 7);
      const f = await financeiro(env, mes, s.barbeiro.id);
      return { resumo: f.resumo.find(r => r.barbeiroId === s.barbeiro.id) || null, pagamentos: f.pagamentos };
    }
    throw new Erro('Rota não encontrada.', 404);
  }

  // ---------- administrador ----------
  if (p.startsWith('/api/admin/')) {
    await sessao(env, req, 'adm');
    const [rec, id, sub, subId] = p.split('/').slice(3);
    const config = await lerConfig(env);
    const { hoje } = agoraNoFuso(config.fuso);

    if (rec === 'dados' && m === 'GET') {
      const limite = somarDias(hoje, -30);
      const [servicos, barbeiros, bl] = await Promise.all([
        lerTodos(env, 'servicos'), lerTodos(env, 'barbeiros'),
        env.DB.prepare('SELECT dados FROM bloqueios WHERE data_fim >= ? ORDER BY data').bind(limite).all(),
      ]);
      return { config, servicos, barbeiros: barbeiros.map(b => publicoBarbeiro(b, true)), bloqueios: bl.results.map(r => JSON.parse(r.dados)) };
    }

    if (rec === 'agendamentos' && !id && m === 'GET') {
      const [de, ate] = periodo(q('de'), q('ate'));
      const r = await env.DB.prepare('SELECT dados FROM agendamentos WHERE data BETWEEN ? AND ? ORDER BY data, inicio').bind(de, ate).all();
      return r.results.map(x => JSON.parse(x.dados));
    }
    if (rec === 'agendamentos' && !id && m === 'POST') return criarAgendamento(env, await lerJSON(req), true);

    if (rec === 'agendamentos' && id && sub === 'finalizar' && m === 'POST') {
      const ag = await lerAgendamento(env, id);
      try { checarFinalizar(ag, 'admin', hoje); } catch (e) { throw new Erro(e.message, 409); }
      const b = await lerUm(env, 'barbeiros', ag.barbeiroId);
      return gravarAgendamento(env, aplicarFinalizacao(ag, b, await lerJSON(req), 'admin'));
    }
    if (rec === 'agendamentos' && id && !sub && m === 'PATCH') {
      let ag = await lerAgendamento(env, id);
      const d = await lerJSON(req);
      if (d.status && d.status !== ag.status) {
        try { checarStatus(ag, d.status, 'admin'); } catch (e) { throw new Erro(e.message, 409); }
        if (ag.status === 'cancelado') {
          const choque = await env.DB.prepare(
            `SELECT 1 FROM agendamentos WHERE barbeiro_id = ? AND data = ? AND status != 'cancelado' AND id != ? AND inicio < ? AND fim > ?`
          ).bind(ag.barbeiroId, ag.data, id, ag.fim, ag.inicio).first();
          if (choque) throw new Erro('Esse horário já foi ocupado por outro cliente.', 409);
        }
        ag = mudarStatus(ag, d.status);
      }
      if (typeof d.conferido === 'boolean') {
        if (d.conferido && ag.status !== 'concluido') throw new Erro('Só dá para conferir atendimento finalizado.');
        ag.conferido = d.conferido; ag.conferidoEm = d.conferido ? new Date().toISOString() : '';
      }
      if (typeof d.obsInterna === 'string') ag.obsInterna = txt(d.obsInterna, 500);
      return gravarAgendamento(env, ag);
    }

    // anexos (R2)
    if (rec === 'agendamentos' && id && sub === 'anexos' && !subId && m === 'POST') {
      if (!env.ARQUIVOS) throw new Erro('Configure o binding R2 "ARQUIVOS" no Worker para anexar arquivos.', 500);
      const ag = await lerAgendamento(env, id);
      const tipo = (req.headers.get('Content-Type') || '').split(';')[0].trim();
      if (!TIPOS_ANEXO.test(tipo)) throw new Erro('Envie imagem (JPG, PNG, WEBP) ou PDF.');
      const tam = Number(req.headers.get('Content-Length') || 0);
      if (tam > MAX_ANEXO) throw new Erro('Arquivo maior que 8 MB.', 413);
      const corpo = await req.arrayBuffer();
      if (corpo.byteLength > MAX_ANEXO) throw new Erro('Arquivo maior que 8 MB.', 413);
      if ((ag.anexos || []).length >= 10) throw new Erro('Limite de 10 arquivos por atendimento.');
      const nome = txt(decodeURIComponent(req.headers.get('X-Nome-Arquivo') || 'arquivo'), 120) || 'arquivo';
      const an = { id: novoId(), nome, tipo, tamanho: corpo.byteLength, criadoEm: new Date().toISOString() };
      await env.ARQUIVOS.put(`anexos/${ag.id}/${an.id}`, corpo, { httpMetadata: { contentType: tipo } });
      ag.anexos = [...(ag.anexos || []), an];
      return gravarAgendamento(env, ag);
    }
    if (rec === 'agendamentos' && id && sub === 'anexos' && subId && m === 'GET') {
      if (!env.ARQUIVOS) throw new Erro('Binding R2 "ARQUIVOS" não configurado.', 500);
      const ag = await lerAgendamento(env, id);
      const an = (ag.anexos || []).find(x => x.id === subId);
      const obj = an && (await env.ARQUIVOS.get(`anexos/${ag.id}/${an.id}`));
      if (!obj) throw new Erro('Arquivo não encontrado.', 404);
      return new Response(obj.body, { headers: { 'Content-Type': an.tipo, 'Cache-Control': 'private, no-store', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(an.nome)}` } });
    }
    if (rec === 'agendamentos' && id && sub === 'anexos' && subId && m === 'DELETE') {
      const ag = await lerAgendamento(env, id);
      if (env.ARQUIVOS) await env.ARQUIVOS.delete(`anexos/${ag.id}/${subId}`);
      ag.anexos = (ag.anexos || []).filter(x => x.id !== subId);
      return gravarAgendamento(env, ag);
    }

    // financeiro
    if (rec === 'financeiro' && m === 'GET') {
      const mes = ehMes(q('mes')) ? q('mes') : hoje.slice(0, 7);
      return financeiro(env, mes, null);
    }
    if (rec === 'pagamentos' && m === 'POST') {
      const d = await lerJSON(req);
      const b = await lerUm(env, 'barbeiros', String(d.barbeiroId || ''));
      if (!b) throw new Erro('Barbeiro não encontrado.');
      const pg = {
        id: txt(d.id, 40) || novoId(), barbeiroId: b.id, barbeiroNome: b.nome,
        data: ehData(d.data) ? d.data : hoje, valor: r2(d.valor),
        tipo: d.tipo === 'vale' ? 'vale' : 'pagamento', forma: txt(d.forma, 20) || 'pix', obs: txt(d.obs, 200),
        criadoEm: new Date().toISOString(),
      };
      if (!(pg.valor > 0)) throw new Erro('Informe um valor maior que zero.');
      await env.DB.prepare('INSERT OR REPLACE INTO pagamentos (id, barbeiro_id, data, valor, dados) VALUES (?, ?, ?, ?, ?)')
        .bind(pg.id, pg.barbeiroId, pg.data, pg.valor, JSON.stringify(pg)).run();
      return pg;
    }
    if (rec === 'pagamentos' && id && m === 'DELETE') {
      await env.DB.prepare('DELETE FROM pagamentos WHERE id = ?').bind(id).run();
      return { ok: true };
    }

    // cadastros
    if (rec === 'config' && m === 'PUT') {
      const c = limparConfig(await lerJSON(req));
      await env.DB.prepare('INSERT OR REPLACE INTO config (id, dados) VALUES (1, ?)').bind(JSON.stringify(c)).run();
      return c;
    }
    if (rec === 'servicos' && m === 'POST') {
      const s = limparServico(await lerJSON(req));
      await salvarLinha(env, 'servicos', s);
      return s;
    }
    if (rec === 'servicos' && id && m === 'DELETE') {
      await env.DB.prepare('DELETE FROM servicos WHERE id = ?').bind(id).run();
      return { ok: true };
    }
    if (rec === 'barbeiros' && m === 'POST') {
      const d = await lerJSON(req);
      const b = limparBarbeiro(d);
      const antigo = d.id ? await lerUm(env, 'barbeiros', b.id) : null;
      if (antigo && antigo.acesso) b.acesso = antigo.acesso;
      if (d.novaSenha) {
        const senha = String(d.novaSenha);
        if (senha.length < 4) throw new Erro('A senha do barbeiro precisa ter pelo menos 4 caracteres.');
        const salt = novoId() + novoId();
        b.acesso = { salt, hash: await hashSenha(senha, salt) };
      }
      if (d.removerAcesso) delete b.acesso;
      await salvarLinha(env, 'barbeiros', b);
      return publicoBarbeiro(b, true);
    }
    if (rec === 'barbeiros' && id && m === 'DELETE') {
      const fut = await env.DB.prepare(`SELECT id, dados FROM agendamentos WHERE barbeiro_id = ? AND data >= ? AND status = 'confirmado'`).bind(id, hoje).all();
      const ops = fut.results.map(r => {
        const ag = mudarStatus(JSON.parse(r.dados), 'cancelado');
        return env.DB.prepare(`UPDATE agendamentos SET status = 'cancelado', dados = ? WHERE id = ?`).bind(JSON.stringify(ag), r.id);
      });
      ops.push(env.DB.prepare('DELETE FROM barbeiros WHERE id = ?').bind(id));
      await env.DB.batch(ops);
      return { ok: true, cancelados: fut.results.length };
    }
    if (rec === 'bloqueios' && m === 'POST') {
      const b = limparBloqueio(await lerJSON(req));
      await env.DB.prepare('INSERT OR REPLACE INTO bloqueios (id, data, data_fim, dados) VALUES (?, ?, ?, ?)')
        .bind(b.id, b.data, b.dataFim, JSON.stringify(b)).run();
      const ags = await env.DB.prepare(`SELECT barbeiro_id, inicio, fim FROM agendamentos WHERE data BETWEEN ? AND ? AND status = 'confirmado'`).bind(b.data, b.dataFim).all();
      const conflitos = ags.results.filter(a =>
        (!b.barbeiroId || a.barbeiro_id === b.barbeiroId) &&
        (b.diaInteiro || (a.inicio < toMin(b.fim) && a.fim > toMin(b.inicio)))
      ).length;
      return { bloqueio: b, conflitos };
    }
    if (rec === 'bloqueios' && id && m === 'DELETE') {
      await env.DB.prepare('DELETE FROM bloqueios WHERE id = ?').bind(id).run();
      return { ok: true };
    }
  }

  throw new Erro('Rota não encontrada.', 404);
}

// ------------------------------------------------------------ financeiro
async function financeiro(env, mes, soBarbeiro) {
  const [ini, fim] = limitesMes(mes);
  const filtro = soBarbeiro ? ' AND barbeiro_id = ?' : '';
  const b1 = soBarbeiro ? [soBarbeiro] : [];
  const [barbeiros, ags, pgs, antAg, antPg] = await Promise.all([
    lerTodos(env, 'barbeiros'),
    env.DB.prepare(`SELECT dados FROM agendamentos WHERE data BETWEEN ? AND ? AND status IN ('concluido','faltou')${filtro}`).bind(ini, fim, ...b1).all(),
    env.DB.prepare(`SELECT dados FROM pagamentos WHERE data BETWEEN ? AND ?${filtro} ORDER BY data`).bind(ini, fim, ...b1).all(),
    env.DB.prepare(`SELECT barbeiro_id, json_extract(dados, '$.pagamento.comissaoValor') AS c, json_extract(dados, '$.total') AS t FROM agendamentos WHERE status = 'concluido' AND data < ?${filtro}`).bind(ini, ...b1).all(),
    env.DB.prepare(`SELECT barbeiro_id, valor FROM pagamentos WHERE data < ?${filtro}`).bind(ini, ...b1).all(),
  ]);
  const pagamentos = pgs.results.map(r => JSON.parse(r.dados));
  const ant = acumularAnteriores(
    antAg.results.map(r => ({ barbeiroId: r.barbeiro_id, comissaoValor: r.c, total: r.t })),
    antPg.results.map(r => ({ barbeiroId: r.barbeiro_id, valor: r.valor })),
    barbeiros,
  );
  const lista = soBarbeiro ? barbeiros.filter(b => b.id === soBarbeiro) : barbeiros;
  return { mes, resumo: resumoFinanceiro(lista, ags.results.map(r => JSON.parse(r.dados)), pagamentos, ant), pagamentos };
}

// ---------------------------------------------------------- agendamento
async function criarAgendamento(env, d, admin) {
  if (!admin && d.site) throw new Erro('Não foi possível agendar.');
  if (!ehData(d.data)) throw new Erro('Data inválida.');
  const config = await lerConfig(env);
  const { hoje, min } = agoraNoFuso(config.fuso);
  const [servicos, barbeiros, oc] = await Promise.all([lerTodos(env, 'servicos'), lerTodos(env, 'barbeiros'), ocupadosDoDia(env, d.data)]);
  let futuros = 0;
  if (!admin) {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM agendamentos WHERE telefone = ? AND data >= ? AND status = 'confirmado'`).bind(soDigitos(d.clienteTelefone), hoje).first();
    futuros = r ? r.n : 0;
  }
  let ag;
  try {
    ag = montarAgendamento({ config, servicos, barbeiros, ocupados: oc.ocupados, bloqueios: oc.bloqueios, futurosDoTelefone: futuros }, d, admin, hoje, min);
  } catch (e) { throw new Erro(e.message, 409); }
  const r = await env.DB.prepare(
    `INSERT INTO agendamentos (id, barbeiro_id, data, inicio, fim, status, telefone, dados, criado_em)
     SELECT ?, ?, ?, ?, ?, 'confirmado', ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM agendamentos WHERE barbeiro_id = ? AND data = ? AND status != 'cancelado' AND inicio < ? AND fim > ?
     )`
  ).bind(ag.id, ag.barbeiroId, ag.data, ag.inicio, ag.fim, ag.clienteTelefone, JSON.stringify(ag), ag.criadoEm,
         ag.barbeiroId, ag.data, ag.fim, ag.inicio).run();
  if (!r.meta || r.meta.changes === 0) throw new Erro('Esse horário não está mais disponível. Escolha outro.', 409);
  return ag;
}

async function ocupadosDoDia(env, data) {
  const [a, b] = await Promise.all([
    env.DB.prepare(`SELECT barbeiro_id, inicio, fim FROM agendamentos WHERE data = ? AND status != 'cancelado'`).bind(data).all(),
    env.DB.prepare('SELECT dados FROM bloqueios WHERE data <= ? AND data_fim >= ?').bind(data, data).all(),
  ]);
  return {
    ocupados: a.results.map(r => ({ barbeiroId: r.barbeiro_id, inicio: r.inicio, fim: r.fim })),
    bloqueios: b.results.map(r => {
      const x = JSON.parse(r.dados);
      return { barbeiroId: x.barbeiroId, data: x.data, dataFim: x.dataFim, diaInteiro: x.diaInteiro, inicio: x.inicio, fim: x.fim };
    }),
  };
}

async function lerAgendamento(env, id) {
  const r = await env.DB.prepare('SELECT dados FROM agendamentos WHERE id = ?').bind(id).first();
  if (!r) throw new Erro('Agendamento não encontrado.', 404);
  return JSON.parse(r.dados);
}
async function gravarAgendamento(env, ag) {
  await env.DB.prepare('UPDATE agendamentos SET status = ?, dados = ? WHERE id = ?').bind(ag.status, JSON.stringify(ag), ag.id).run();
  return ag;
}
function semAnexos(a) { const { anexos, obsInterna, ...resto } = a; return { ...resto, qtdAnexos: (anexos || []).length }; }
function publicoBarbeiro(b, admin) {
  const { acesso, ...resto } = b;
  if (!admin) { delete resto.comissao; return resto; }
  return { ...resto, temAcesso: !!acesso };
}

// ------------------------------------------------------------- limpeza
function limparConfig(c) {
  const o = { ...CONFIG_PADRAO };
  o.nome = txt(c.nome, 60) || CONFIG_PADRAO.nome;
  o.slogan = txt(c.slogan, 120);
  o.logo = imagem(c.logo, 400000);
  o.cor = /^#[0-9a-fA-F]{6}$/.test(c.cor || '') ? c.cor : CONFIG_PADRAO.cor;
  o.whatsapp = soDigitos(c.whatsapp).slice(0, 13);
  o.telefone = txt(c.telefone, 30);
  o.endereco = txt(c.endereco, 160);
  o.mapa = /^https:\/\//.test(c.mapa || '') ? txt(c.mapa, 500) : '';
  o.instagram = txt(c.instagram, 40).replace(/^@/, '');
  o.sobre = txt(c.sobre, 600);
  o.grade = [5, 10, 15, 20, 30].includes(Number(c.grade)) ? Number(c.grade) : 15;
  o.antecedencia = Math.max(0, Math.min(2880, parseInt(c.antecedencia, 10) || 0));
  o.diasAFrente = Math.max(1, Math.min(120, parseInt(c.diasAFrente, 10) || 30));
  o.fuso = txt(c.fuso, 40) || CONFIG_PADRAO.fuso;
  try { new Intl.DateTimeFormat('en', { timeZone: o.fuso }); } catch { o.fuso = CONFIG_PADRAO.fuso; }
  return o;
}
function limparServico(s) {
  const nome = txt(s.nome, 60);
  if (!nome) throw new Erro('Informe o nome do serviço.');
  return {
    id: txt(s.id, 40) || novoId(), nome, descricao: txt(s.descricao, 140),
    duracao: Math.max(5, Math.min(480, parseInt(s.duracao, 10) || 30)),
    preco: Math.max(0, r2(s.preco)), ativo: !!s.ativo, ordem: parseInt(s.ordem, 10) || 0,
  };
}
function limparBarbeiro(b) {
  const nome = txt(b.nome, 60);
  if (!nome) throw new Erro('Informe o nome do barbeiro.');
  const hs = Array.isArray(b.horarios) ? b.horarios : [];
  const horarios = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const h = hs[i] || {};
    const x = { aberto: !!h.aberto, inicio: hora(h.inicio) || '09:00', fim: hora(h.fim) || '18:00', pausaInicio: hora(h.pausaInicio), pausaFim: hora(h.pausaFim) };
    if (x.aberto && toMin(x.fim) <= toMin(x.inicio)) throw new Erro('Horário de fim deve ser depois do início.');
    if (!x.pausaInicio || !x.pausaFim || toMin(x.pausaFim) <= toMin(x.pausaInicio)) { x.pausaInicio = ''; x.pausaFim = ''; }
    return x;
  });
  return {
    id: txt(b.id, 40) || novoId(), nome, bio: txt(b.bio, 140), foto: imagem(b.foto, 250000),
    ativo: !!b.ativo, ordem: parseInt(b.ordem, 10) || 0, comissao: pctComissao(b),
    servicos: Array.isArray(b.servicos) ? b.servicos.map(x => txt(x, 40)).filter(Boolean).slice(0, 100) : [],
    horarios,
  };
}
function limparBloqueio(b) {
  if (!ehData(b.data)) throw new Erro('Data inválida.');
  const dataFim = ehData(b.dataFim) && b.dataFim >= b.data ? b.dataFim : b.data;
  const x = {
    id: txt(b.id, 40) || novoId(), barbeiroId: txt(b.barbeiroId, 40), data: b.data, dataFim,
    diaInteiro: !!b.diaInteiro, inicio: hora(b.inicio), fim: hora(b.fim), motivo: txt(b.motivo, 80),
  };
  if (!x.diaInteiro && (!x.inicio || !x.fim || toMin(x.fim) <= toMin(x.inicio))) throw new Erro('Informe um período válido (início antes do fim).');
  if (x.diaInteiro) { x.inicio = ''; x.fim = ''; }
  return x;
}

// ------------------------------------------------------------ banco
async function iniciar(env) {
  if (pronto) return;
  await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
  const tem = await env.DB.prepare('SELECT id FROM config WHERE id = 1').first();
  if (!tem) {
    const horarios = [0, 1, 2, 3, 4, 5, 6].map(i => ({
      aberto: i !== 0, inicio: '09:00', fim: i === 6 ? '17:00' : '19:00',
      pausaInicio: i === 6 ? '' : '12:00', pausaFim: i === 6 ? '' : '13:00',
    }));
    const servs = [['Corte de cabelo', 30, 45], ['Barba', 30, 35], ['Corte + barba', 60, 70], ['Sobrancelha', 15, 15]]
      .map(([nome, duracao, preco], i) => ({ id: novoId(), nome, descricao: '', duracao, preco, ativo: true, ordem: i }));
    const ops = [env.DB.prepare('INSERT INTO config (id, dados) VALUES (1, ?)').bind(JSON.stringify(CONFIG_PADRAO))];
    servs.forEach(s => ops.push(env.DB.prepare('INSERT INTO servicos (id, ordem, dados) VALUES (?, ?, ?)').bind(s.id, s.ordem, JSON.stringify(s))));
    const b = { id: novoId(), nome: 'Barbeiro 1', bio: '', foto: '', ativo: true, ordem: 0, comissao: 50, servicos: [], horarios };
    ops.push(env.DB.prepare('INSERT INTO barbeiros (id, ordem, dados) VALUES (?, ?, ?)').bind(b.id, 0, JSON.stringify(b)));
    await env.DB.batch(ops);
  }
  pronto = true;
}
async function lerConfig(env) {
  const r = await env.DB.prepare('SELECT dados FROM config WHERE id = 1').first();
  return { ...CONFIG_PADRAO, ...(r ? JSON.parse(r.dados) : {}) };
}
async function lerTodos(env, tabela) {
  const r = await env.DB.prepare(`SELECT dados FROM ${tabela} ORDER BY ordem, rowid`).all();
  return r.results.map(x => JSON.parse(x.dados));
}
async function lerUm(env, tabela, id) {
  const r = await env.DB.prepare(`SELECT dados FROM ${tabela} WHERE id = ?`).bind(id).first();
  return r ? JSON.parse(r.dados) : null;
}
async function salvarLinha(env, tabela, obj) {
  await env.DB.prepare(`INSERT OR REPLACE INTO ${tabela} (id, ordem, dados) VALUES (?, ?, ?)`).bind(obj.id, obj.ordem || 0, JSON.stringify(obj)).run();
}

// ------------------------------------------------------------ acesso
const enc = s => new TextEncoder().encode(s);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function hmac(chave, msg) {
  const k = await crypto.subtle.importKey('raw', enc(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc(msg)));
}
async function hashSenha(senha, salt) {
  const k = await crypto.subtle.importKey('raw', enc(senha), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc(salt), iterations: 100000, hash: 'SHA-256' }, k, 256));
}
async function gerarToken(env, papel, id, ver) {
  const exp = Date.now() + (papel === 'adm' ? 12 : 72) * 3600 * 1000;
  const base = `${exp}.${papel}.${id}.${ver}`;
  return base + '.' + (await hmac(env.ADMIN_PASSWORD, base));
}
async function sessao(env, req, papel) {
  const negar = () => { throw new Erro('Sessão expirada. Entre novamente.', 401); };
  if (!env.ADMIN_PASSWORD) negar();
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const partes = t.split('.');
  if (partes.length !== 5) negar();
  const [exp, pap, id, ver, sig] = partes;
  if (pap !== papel || Number(exp) < Date.now()) negar();
  if (sig !== (await hmac(env.ADMIN_PASSWORD, `${exp}.${pap}.${id}.${ver}`))) negar();
  if (papel === 'barb') {
    const b = await lerUm(env, 'barbeiros', id);
    if (!b || !b.ativo || !b.acesso || b.acesso.salt.slice(0, 8) !== ver) negar();
    return { papel, barbeiro: b };
  }
  return { papel };
}

// ------------------------------------------------------------ utilidades
async function lerJSON(req) {
  const t = await req.text();
  if (t.length > 1500000) throw new Erro('Envio muito grande (imagem pesada demais?).', 413);
  try { return JSON.parse(t || '{}'); } catch { throw new Erro('JSON inválido.'); }
}
function periodo(de, ate) {
  if (!ehData(de)) throw new Erro('Período inválido.');
  ate = ehData(ate) ? ate : de;
  if (ate < de) throw new Erro('Período inválido.');
  if (ate > somarDias(de, 400)) throw new Erro('Período muito longo.');
  return [de, ate];
}
function agoraNoFuso(fuso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso || CONFIG_PADRAO.fuso, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { hoje: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
const esperar = ms => new Promise(r => setTimeout(r, ms));
function hora(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(h || '') ? h : ''; }
function txt(v, max) { return String(v ?? '').trim().slice(0, max); }
function imagem(v, max) { v = String(v || ''); return (v.startsWith('data:image/') || v.startsWith('https://')) && v.length <= max ? v : ''; }