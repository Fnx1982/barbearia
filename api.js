// =====================================================================
//  api.js — camada de dados do site.
//  • Com APP_CONFIG.API_URL preenchido: conversa com o Worker (produção).
//  • Com API_URL vazio: MODO DEMONSTRAÇÃO, dados salvos só neste navegador.
// =====================================================================
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const API = String(CFG.API_URL || '').replace(/\/+$/, '');
  const DEMO = !API;

  // ------------------------------------------------------- utilidades
  const U = {
    toMin(h) { if (!h) return 0; const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); },
    toHora(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); },
    iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    hojeISO() { return U.iso(new Date()); },
    agoraMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); },
    addDias(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },
    diaSemana(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); },
    id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
    dinheiro(v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); },
    esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    soDigitos(s) { return String(s || '').replace(/\D/g, ''); },
    fone(s) {
      const d = U.soDigitos(s).slice(0, 11);
      if (d.length <= 2) return d;
      if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
      if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    },
    fazServicos(b, ids) { return !b.servicos || !b.servicos.length || ids.every(i => b.servicos.includes(i)); },
  };
  const toMin = U.toMin, soDigitos = U.soDigitos, ehData = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const somarDias = U.addDias, novoId = U.id, fazServicos = U.fazServicos;

  // ===== REGRAS DE HORÁRIO — idênticas às do worker.js =====
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

  // ------------------------------------------------- modo demonstração
  const CHAVE = 'barbearia_demo_v1';
  let mem = null;

  function semana() {
    return [0, 1, 2, 3, 4, 5, 6].map(i => ({
      aberto: i !== 0, inicio: '09:00', fim: i === 6 ? '17:00' : '19:00',
      pausaInicio: i === 6 ? '' : '12:00', pausaFim: i === 6 ? '' : '13:00',
    }));
  }
  function seed() {
    const s = (nome, duracao, preco, descricao = '') => ({ id: novoId(), nome, descricao, duracao, preco, ativo: true, ordem: 0 });
    const servicos = [
      s('Corte de cabelo', 30, 45, 'Máquina e tesoura, com lavagem'), s('Barba', 30, 35, 'Toalha quente e navalha'),
      s('Corte + barba', 60, 70, 'O combo completo'), s('Sobrancelha', 15, 15), s('Pezinho', 15, 20, 'Acabamento entre cortes'),
      s('Pigmentação', 30, 40),
    ];
    const b1 = { id: novoId(), nome: 'Rafael', bio: 'Degradê e cortes clássicos', foto: '', ativo: true, ordem: 0, servicos: [], horarios: semana() };
    const h2 = semana(); h2[1].aberto = false;
    const b2 = { id: novoId(), nome: 'Lucas', bio: 'Barba e navalha', foto: '', ativo: true, ordem: 1, servicos: servicos.slice(0, 5).map(x => x.id), horarios: h2 };
    const hoje = U.hojeISO();
    const ag = (b, sv, data, ini, nome, tel, status = 'confirmado') => ({
      id: novoId(), barbeiroId: b.id, barbeiroNome: b.nome, servicoIds: [sv.id], servicosNome: sv.nome, data,
      inicio: toMin(ini), fim: toMin(ini) + sv.duracao, duracao: sv.duracao, total: sv.preco,
      clienteNome: nome, clienteTelefone: tel, obs: '', status, origem: 'site', criadoEm: new Date().toISOString(),
    });
    return {
      config: {
        nome: 'Barbearia Modelo', slogan: 'Corte, barba e cuidado — com hora marcada.', logo: '', cor: '#c8102e',
        whatsapp: '5541999990000', telefone: '(41) 3333-0000', endereco: 'Rua Exemplo, 123 — Centro', mapa: '',
        instagram: 'barbeariamodelo', sobre: 'Ambiente climatizado, café por nossa conta e Wi-Fi liberado. Aceitamos Pix e cartões.',
        grade: 15, antecedencia: 60, diasAFrente: 30, fuso: 'America/Sao_Paulo',
      },
      servicos, barbeiros: [b1, b2],
      bloqueios: [{ id: novoId(), barbeiroId: b2.id, data: U.addDias(hoje, 3), dataFim: U.addDias(hoje, 3), diaInteiro: true, inicio: '', fim: '', motivo: 'Folga' }],
      agendamentos: [
        ag(b1, servicos[2], hoje, '09:00', 'Carlos Mendes', '41988887777', 'concluido'),
        ag(b1, servicos[0], hoje, '14:00', 'João Pedro', '41977776666'),
        ag(b2, servicos[1], hoje, '10:30', 'André Silva', '41966665555'),
        ag(b2, servicos[0], hoje, '16:00', 'Marcos Lima', '41955554444'),
        ag(b1, servicos[2], U.addDias(hoje, 1), '10:00', 'Felipe Costa', '41944443333'),
      ],
    };
  }
  function db() {
    if (mem) return mem;
    try { const s = localStorage.getItem(CHAVE); if (s) return (mem = JSON.parse(s)); } catch (e) { /* sem storage */ }
    mem = seed(); gravar(); return mem;
  }
  function gravar() { try { localStorage.setItem(CHAVE, JSON.stringify(mem)); } catch (e) { /* ignora */ } }
  const copia = x => JSON.parse(JSON.stringify(x));
  const espera = (v) => new Promise(r => setTimeout(() => r(copia(v)), 120));

  const demo = {
    publico() { const D = db(); return espera({ config: D.config, servicos: D.servicos.filter(s => s.ativo), barbeiros: D.barbeiros.filter(b => b.ativo) }); },
    ocupados(data) {
      const D = db();
      return espera({
        ocupados: D.agendamentos.filter(a => a.data === data && a.status !== 'cancelado').map(a => ({ barbeiroId: a.barbeiroId, inicio: a.inicio, fim: a.fim })),
        bloqueios: D.bloqueios.filter(b => b.data <= data && b.dataFim >= data),
      });
    },
    agendar(d, admin) {
      const D = db();
      if (!admin && d.site) return Promise.reject(new Error('Não foi possível agendar.'));
      const hoje = U.hojeISO();
      try {
        const ag = montarAgendamento({
          config: D.config, servicos: D.servicos, barbeiros: D.barbeiros, bloqueios: D.bloqueios,
          ocupados: D.agendamentos.filter(a => a.data === d.data && a.status !== 'cancelado'),
          futurosDoTelefone: D.agendamentos.filter(a => a.clienteTelefone === soDigitos(d.clienteTelefone) && a.status === 'confirmado' && a.data >= hoje).length,
        }, d, admin, hoje, U.agoraMin());
        D.agendamentos.push(ag); gravar(); return espera(ag);
      } catch (e) { return Promise.reject(e); }
    },
  };

  // ------------------------------------------------------- servidor
  let tokenMem = '';
  const token = () => { try { return sessionStorage.getItem('barb_token') || tokenMem; } catch (e) { return tokenMem; } };
  const setToken = t => { tokenMem = t; try { t ? sessionStorage.setItem('barb_token', t) : sessionStorage.removeItem('barb_token'); } catch (e) { /* ignora */ } };

  async function req(metodo, caminho, corpo, auth) {
    const h = { 'Content-Type': 'application/json' };
    if (auth) h.Authorization = 'Bearer ' + token();
    let r;
    try { r = await fetch(API + caminho, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined }); }
    catch (e) { throw new Error('Sem conexão com o servidor. Tente de novo.'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && auth) { setToken(''); const e = new Error(j.erro || 'Sessão expirada.'); e.auth = true; throw e; }
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
    return j;
  }

  // ------------------------------------------------------- interface
  function upsert(lista, obj) { const i = lista.findIndex(x => x.id === obj.id); i >= 0 ? (lista[i] = obj) : lista.push(obj); }

  window.U = U;
  window.horariosLivres = horariosLivres;
  window.Api = {
    demo: DEMO,
    publico: () => DEMO ? demo.publico() : req('GET', '/api/publico'),
    ocupados: data => DEMO ? demo.ocupados(data) : req('GET', '/api/ocupados?data=' + encodeURIComponent(data)),
    agendar: d => DEMO ? demo.agendar(d, false) : req('POST', '/api/agendamentos', d),

    logado: () => !!token(),
    sair: () => setToken(''),
    async login(senha) {
      if (DEMO) { if (senha !== 'admin') throw new Error('Senha incorreta. Na demonstração a senha é: admin'); setToken('demo'); return; }
      const r = await req('POST', '/api/login', { senha }); setToken(r.token);
    },

    admin: {
      dados() { if (!DEMO) return req('GET', '/api/admin/dados', null, true); const D = db(); return espera({ config: D.config, servicos: D.servicos, barbeiros: D.barbeiros, bloqueios: D.bloqueios.filter(b => b.dataFim >= U.addDias(U.hojeISO(), -30)) }); },
      agendamentos(de, ate) { if (!DEMO) return req('GET', `/api/admin/agendamentos?de=${de}&ate=${ate || de}`, null, true); return espera(db().agendamentos.filter(a => a.data >= de && a.data <= (ate || de)).sort((a, b) => (a.data + a.inicio / 1e4) > (b.data + b.inicio / 1e4) ? 1 : -1)); },
      salvarConfig(c) { if (!DEMO) return req('PUT', '/api/admin/config', c, true); db().config = c; gravar(); return espera(c); },
      salvarServico(s) { if (!DEMO) return req('POST', '/api/admin/servicos', s, true); if (!s.id) s.id = novoId(); upsert(db().servicos, s); gravar(); return espera(s); },
      excluirServico(id) { if (!DEMO) return req('DELETE', '/api/admin/servicos/' + id, null, true); const D = db(); D.servicos = D.servicos.filter(s => s.id !== id); gravar(); return espera({ ok: true }); },
      salvarBarbeiro(b) { if (!DEMO) return req('POST', '/api/admin/barbeiros', b, true); if (!b.id) b.id = novoId(); upsert(db().barbeiros, b); gravar(); return espera(b); },
      excluirBarbeiro(id) {
        if (!DEMO) return req('DELETE', '/api/admin/barbeiros/' + id, null, true);
        const D = db(), hoje = U.hojeISO(); let n = 0;
        D.agendamentos.forEach(a => { if (a.barbeiroId === id && a.data >= hoje && a.status === 'confirmado') { a.status = 'cancelado'; n++; } });
        D.barbeiros = D.barbeiros.filter(b => b.id !== id); gravar(); return espera({ ok: true, cancelados: n });
      },
      salvarBloqueio(b) {
        if (!DEMO) return req('POST', '/api/admin/bloqueios', b, true);
        if (!b.id) b.id = novoId(); if (!b.dataFim || b.dataFim < b.data) b.dataFim = b.data;
        if (!b.diaInteiro && (!b.inicio || !b.fim || b.fim <= b.inicio)) return Promise.reject(new Error('Informe um período válido (início antes do fim).'));
        upsert(db().bloqueios, b); gravar();
        const conflitos = db().agendamentos.filter(a => a.status === 'confirmado' && a.data >= b.data && a.data <= b.dataFim && (!b.barbeiroId || a.barbeiroId === b.barbeiroId) && (b.diaInteiro || (a.inicio < toMin(b.fim) && a.fim > toMin(b.inicio)))).length;
        return espera({ bloqueio: b, conflitos });
      },
      excluirBloqueio(id) { if (!DEMO) return req('DELETE', '/api/admin/bloqueios/' + id, null, true); const D = db(); D.bloqueios = D.bloqueios.filter(b => b.id !== id); gravar(); return espera({ ok: true }); },
      status(id, status) {
        if (!DEMO) return req('PATCH', '/api/admin/agendamentos/' + id, { status }, true);
        const D = db(), a = D.agendamentos.find(x => x.id === id);
        if (a.status === 'cancelado' && status !== 'cancelado' && D.agendamentos.some(x => x.id !== id && x.barbeiroId === a.barbeiroId && x.data === a.data && x.status !== 'cancelado' && x.inicio < a.fim && x.fim > a.inicio)) return Promise.reject(new Error('Esse horário já foi ocupado por outro cliente.'));
        a.status = status; gravar(); return espera(a);
      },
      balcao: d => DEMO ? demo.agendar(d, true) : req('POST', '/api/admin/agendamentos', d, true),
      resetarDemo() { mem = seed(); gravar(); },
    },
  };
})();
