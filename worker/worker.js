// =====================================================================
//  BARBEARIA — Backend (Cloudflare Worker + D1)
//  Cole este arquivo inteiro no editor do Worker.
//  Precisa de:
//    • Binding D1 com o nome  DB
//    • Secret  ADMIN_PASSWORD  (senha do painel)
//    • (opcional) Variável ORIGEM_PERMITIDA = https://seusite.com.br
//  As tabelas são criadas sozinhas na primeira requisição.
// =====================================================================

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK (id = 1), dados TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS servicos (id TEXT PRIMARY KEY, ordem INTEGER NOT NULL DEFAULT 0, dados TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS barbeiros (id TEXT PRIMARY KEY, ordem INTEGER NOT NULL DEFAULT 0, dados TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS bloqueios (id TEXT PRIMARY KEY, data TEXT NOT NULL, data_fim TEXT NOT NULL, dados TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS agendamentos (id TEXT PRIMARY KEY, barbeiro_id TEXT NOT NULL, data TEXT NOT NULL, inicio INTEGER NOT NULL, fim INTEGER NOT NULL, status TEXT NOT NULL, telefone TEXT NOT NULL, dados TEXT NOT NULL, criado_em TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_ag_barb_data ON agendamentos (barbeiro_id, data)`,
  `CREATE INDEX IF NOT EXISTS idx_ag_data ON agendamentos (data)`,
  `CREATE INDEX IF NOT EXISTS idx_ag_tel ON agendamentos (telefone)`,
  `CREATE INDEX IF NOT EXISTS idx_bl_data ON bloqueios (data, data_fim)`,
];

const CONFIG_PADRAO = {
  nome: 'Sua Barbearia', slogan: 'Corte, barba e cuidado — com hora marcada.', logo: '',
  cor: '#c8102e', whatsapp: '', telefone: '', endereco: '', mapa: '', instagram: '', sobre: '',
  grade: 15, antecedencia: 60, diasAFrente: 30, fuso: 'America/Sao_Paulo',
};

let pronto = false;

class Erro extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ORIGEM_PERMITIDA || '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Max-Age': '86400',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    let corpo, status = 200;
    try {
      if (!env.DB) throw new Erro('Binding D1 "DB" não configurado no Worker.', 500);
      await iniciar(env);
      corpo = await rotear(req, env);
    } catch (e) {
      status = e.status || 500;
      corpo = { erro: e.status ? e.message : 'Erro interno no servidor.' };
      if (!e.status) console.error(e);
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

  if (p === '' || p === '/api') return { ok: true, sistema: 'barbearia' };

  if (p === '/api/publico' && m === 'GET') {
    const [config, servicos, barbeiros] = await Promise.all([lerConfig(env), lerTodos(env, 'servicos'), lerTodos(env, 'barbeiros')]);
    return {
      config,
      servicos: servicos.filter(s => s.ativo),
      barbeiros: barbeiros.filter(b => b.ativo),
    };
  }

  if (p === '/api/ocupados' && m === 'GET') {
    const data = url.searchParams.get('data') || '';
    if (!ehData(data)) throw new Erro('Data inválida.');
    return ocupadosDoDia(env, data);
  }

  if (p === '/api/agendamentos' && m === 'POST') {
    return criarAgendamento(env, await lerJSON(req), false);
  }

  if (p === '/api/login' && m === 'POST') {
    if (!env.ADMIN_PASSWORD) throw new Erro('Configure o secret ADMIN_PASSWORD no Worker.', 500);
    const { senha } = await lerJSON(req);
    const a = await hmac(env.ADMIN_PASSWORD, 'senha:' + String(senha || ''));
    const b = await hmac(env.ADMIN_PASSWORD, 'senha:' + env.ADMIN_PASSWORD);
    if (a !== b) { await new Promise(r => setTimeout(r, 600)); throw new Erro('Senha incorreta.', 401); }
    return { token: await gerarToken(env) };
  }

  if (p.startsWith('/api/admin/')) {
    if (!(await tokenValido(env, req))) throw new Erro('Sessão expirada. Entre novamente.', 401);
    const partes = p.split('/').slice(3); // [recurso, id?]
    const [rec, id] = partes;

    if (rec === 'dados' && m === 'GET') {
      const { hoje } = agoraNoFuso((await lerConfig(env)).fuso);
      const limite = somarDias(hoje, -30);
      const [config, servicos, barbeiros, bl] = await Promise.all([
        lerConfig(env), lerTodos(env, 'servicos'), lerTodos(env, 'barbeiros'),
        env.DB.prepare('SELECT dados FROM bloqueios WHERE data_fim >= ? ORDER BY data').bind(limite).all(),
      ]);
      return { config, servicos, barbeiros, bloqueios: bl.results.map(r => JSON.parse(r.dados)) };
    }

    if (rec === 'agendamentos' && m === 'GET') {
      const de = url.searchParams.get('de'), ate = url.searchParams.get('ate') || de;
      if (!ehData(de) || !ehData(ate)) throw new Erro('Período inválido.');
      const r = await env.DB.prepare('SELECT dados FROM agendamentos WHERE data BETWEEN ? AND ? ORDER BY data, inicio').bind(de, ate).all();
      return r.results.map(x => JSON.parse(x.dados));
    }

    if (rec === 'agendamentos' && m === 'POST') return criarAgendamento(env, await lerJSON(req), true);

    if (rec === 'agendamentos' && id && m === 'PATCH') {
      const { status } = await lerJSON(req);
      if (!['confirmado', 'concluido', 'cancelado', 'faltou'].includes(status)) throw new Erro('Status inválido.');
      const row = await env.DB.prepare('SELECT * FROM agendamentos WHERE id = ?').bind(id).first();
      if (!row) throw new Erro('Agendamento não encontrado.', 404);
      const ag = JSON.parse(row.dados);
      if (ag.status === 'cancelado' && status !== 'cancelado') {
        const choque = await env.DB.prepare(
          `SELECT 1 FROM agendamentos WHERE barbeiro_id = ? AND data = ? AND status != 'cancelado' AND id != ? AND inicio < ? AND fim > ?`
        ).bind(row.barbeiro_id, row.data, id, row.fim, row.inicio).first();
        if (choque) throw new Erro('Esse horário já foi ocupado por outro cliente.', 409);
      }
      ag.status = status;
      await env.DB.prepare('UPDATE agendamentos SET status = ?, dados = ? WHERE id = ?').bind(status, JSON.stringify(ag), id).run();
      return ag;
    }

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
      const b = limparBarbeiro(await lerJSON(req));
      await salvarLinha(env, 'barbeiros', b);
      return b;
    }
    if (rec === 'barbeiros' && id && m === 'DELETE') {
      const { hoje } = agoraNoFuso((await lerConfig(env)).fuso);
      const fut = await env.DB.prepare(`SELECT id, dados FROM agendamentos WHERE barbeiro_id = ? AND data >= ? AND status = 'confirmado'`).bind(id, hoje).all();
      const ops = fut.results.map(r => {
        const ag = JSON.parse(r.dados); ag.status = 'cancelado';
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

// ---------------------------------------------------------- agendamento
async function criarAgendamento(env, d, admin) {
  if (!admin && d.site) throw new Erro('Não foi possível agendar.');
  if (!ehData(d.data)) throw new Erro('Data inválida.');
  const config = await lerConfig(env);
  const { hoje, min } = agoraNoFuso(config.fuso);
  const [servicos, barbeiros, oc] = await Promise.all([lerTodos(env, 'servicos'), lerTodos(env, 'barbeiros'), ocupadosDoDia(env, d.data)]);

  let futuros = 0;
  if (!admin) {
    const tel = soDigitos(d.clienteTelefone);
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM agendamentos WHERE telefone = ? AND data >= ? AND status = 'confirmado'`).bind(tel, hoje).first();
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

// ===== REGRAS DE HORÁRIO — idênticas às do api.js (front) =====
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
  const total = Math.round(servs.reduce((a, s) => a + Number(s.preco), 0) * 100) / 100;
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
  };
}
// ===== fim das regras =====

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
    preco: Math.max(0, Math.round((Number(s.preco) || 0) * 100) / 100),
    ativo: !!s.ativo, ordem: parseInt(s.ordem, 10) || 0,
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
    ativo: !!b.ativo, ordem: parseInt(b.ordem, 10) || 0,
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
    const servs = [
      ['Corte de cabelo', 30, 45], ['Barba', 30, 35], ['Corte + barba', 60, 70], ['Sobrancelha', 15, 15],
    ].map(([nome, duracao, preco], i) => ({ id: novoId(), nome, descricao: '', duracao, preco, ativo: true, ordem: i }));
    const ops = [env.DB.prepare('INSERT INTO config (id, dados) VALUES (1, ?)').bind(JSON.stringify(CONFIG_PADRAO))];
    servs.forEach(s => ops.push(env.DB.prepare('INSERT INTO servicos (id, ordem, dados) VALUES (?, ?, ?)').bind(s.id, s.ordem, JSON.stringify(s))));
    const b = { id: novoId(), nome: 'Barbeiro 1', bio: '', foto: '', ativo: true, ordem: 0, servicos: [], horarios };
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

async function salvarLinha(env, tabela, obj) {
  await env.DB.prepare(`INSERT OR REPLACE INTO ${tabela} (id, ordem, dados) VALUES (?, ?, ?)`).bind(obj.id, obj.ordem || 0, JSON.stringify(obj)).run();
}

// ------------------------------------------------------------ auth
async function hmac(chave, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function gerarToken(env) {
  const exp = Date.now() + 12 * 3600 * 1000;
  return exp + '.' + (await hmac(env.ADMIN_PASSWORD, 'adm.' + exp));
}
async function tokenValido(env, req) {
  if (!env.ADMIN_PASSWORD) return false;
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return sig === (await hmac(env.ADMIN_PASSWORD, 'adm.' + exp));
}

// ------------------------------------------------------------ utilidades
async function lerJSON(req) {
  const t = await req.text();
  if (t.length > 1500000) throw new Erro('Envio muito grande (imagem pesada demais?).', 413);
  try { return JSON.parse(t || '{}'); } catch { throw new Erro('JSON inválido.'); }
}
function agoraNoFuso(fuso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso || CONFIG_PADRAO.fuso, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { hoje: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
function somarDias(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function ehData(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function toMin(h) { if (!h) return 0; const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); }
function hora(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(h || '') ? h : ''; }
function txt(v, max) { return String(v ?? '').trim().slice(0, max); }
function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
function imagem(v, max) { v = String(v || ''); return (v.startsWith('data:image/') || v.startsWith('https://')) && v.length <= max ? v : ''; }
function fazServicos(b, ids) { return !b.servicos || !b.servicos.length || ids.every(i => b.servicos.includes(i)); }
function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
