// =====================================================================
//  app.js — site do cliente (agendamento) + painel do administrador (#admin)
// =====================================================================
{
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = U.esc;
  const app = $('#app');
  const modalRoot = $('#modal-root');
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const DIAS_C = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];
  const STATUS = { confirmado: 'Confirmado', concluido: 'Concluído', faltou: 'Faltou', cancelado: 'Cancelado' };

  // ------------------------------------------------------------ comum
  function toast(msg, tipo = '') {
    const t = $('#toast'); t.textContent = msg; t.className = 'show ' + tipo;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 3600);
  }
  function aplicarMarca(c, admin) {
    document.documentElement.style.setProperty('--acc', c.cor || '#c8102e');
    document.title = (c.nome || 'Barbearia') + (admin ? ' · Painel' : ' · Agendamento');
  }
  function poste() {
    const faixas = [];
    for (let i = -4; i <= 12; i++) { const y = i * 6; faixas.push(`<path d="M0 ${y}L40 ${y - 16}V${y - 13}L0 ${y + 3}Z" fill="${i % 2 ? '#1d3c78' : 'var(--acc)'}"/>`); }
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="pc"><rect x="14" y="7" width="12" height="26" rx="6"/></clipPath></defs><rect x="14" y="7" width="12" height="26" rx="6" fill="#fff"/><g clip-path="url(#pc)"><g class="faixas">${faixas.join('')}</g></g><rect x="14" y="7" width="12" height="26" rx="6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="3" width="18" height="5" rx="2.5" fill="currentColor"/><rect x="11" y="32" width="18" height="5" rx="2.5" fill="currentColor"/></svg>`;
  }
  function logoHTML(c, cls = 'logo') {
    return c.logo
      ? `<img class="${cls}" src="${esc(c.logo)}" alt="Logo ${esc(c.nome)}">`
      : `<span class="${cls} logo-vazia" role="img" aria-label="Espaço para a logo">${poste()}</span>`;
  }
  function iniciais(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase(); }
  function avatar(b, cls = 'av') {
    if (!b) return `<span class="${cls} av-todos" aria-hidden="true">✶</span>`;
    return b.foto ? `<img class="${cls}" src="${esc(b.foto)}" alt="">` : `<span class="${cls}" aria-hidden="true">${esc(iniciais(b.nome))}</span>`;
  }
  function fmtData(iso) { const d = new Date(iso + 'T12:00:00Z'); return `${DIAS_C[d.getUTCDay()].toLowerCase()}, ${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`; }
  function fmtDataLonga(iso) { const d = new Date(iso + 'T12:00:00Z'); return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; }
  function waLink(num, msg) { const n = U.soDigitos(num); return `https://wa.me/${n.length <= 11 ? '55' + n : n}?text=${encodeURIComponent(msg)}`; }

  function modal({ titulo, corpo, botao = 'Salvar', perigo = false, largo = false, aoEnviar, aoAbrir }) {
    const el = document.createElement('div');
    el.className = 'modal-fundo';
    el.innerHTML = `<form class="modal${largo ? ' largo' : ''}" novalidate role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <header><h3>${esc(titulo)}</h3><button type="button" class="x" data-fechar aria-label="Fechar">×</button></header>
      <div class="modal-corpo">${corpo}</div>
      <footer><button type="button" class="btn btn-sec" data-fechar>Cancelar</button>${botao ? `<button class="btn${perigo ? ' btn-perigo' : ''}" type="submit">${esc(botao)}</button>` : ''}</footer></form>`;
    modalRoot.appendChild(el);
    document.body.classList.add('sem-rolagem');
    const form = el.querySelector('form');
    const teclas = e => { if (e.key === 'Escape') fechar(); };
    function fechar() { el.remove(); document.removeEventListener('keydown', teclas); if (!modalRoot.children.length) document.body.classList.remove('sem-rolagem'); }
    document.addEventListener('keydown', teclas);
    el.addEventListener('mousedown', e => { if (e.target === el) fechar(); });
    el.addEventListener('click', e => { if (e.target.closest('[data-fechar]')) fechar(); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!aoEnviar) return fechar();
      const b = form.querySelector('[type=submit]'); b.disabled = true;
      try { const r = await aoEnviar(form); if (r !== false) fechar(); }
      catch (err) { toast(err.message, 'erro'); if (err.auth) { fechar(); abrirAdmin(); } }
      finally { b.disabled = false; }
    });
    if (aoAbrir) aoAbrir(form);
    setTimeout(() => { const f = form.querySelector('.modal-corpo input:not([type=checkbox]):not([type=file]):not([type=hidden]), .modal-corpo select, .modal-corpo textarea'); if (f) f.focus(); }, 30);
    return { el, form, fechar };
  }
  function confirmar(msg, botao = 'Excluir', perigo = true) {
    return new Promise(res => {
      let ok = false;
      const m = modal({ titulo: 'Confirmar', corpo: `<p>${esc(msg)}</p>`, botao, perigo, aoEnviar: () => { ok = true; } });
      const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); res(ok); } });
      obs.observe(modalRoot, { childList: true });
    });
  }
  function lerImagem(file, max) {
    return new Promise((res, rej) => {
      if (!file) return res('');
      if (!/^image\//.test(file.type)) return rej(new Error('Escolha um arquivo de imagem.'));
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          let url = c.toDataURL('image/webp', 0.86);
          if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
          res(url);
        };
        img.onerror = () => rej(new Error('Não foi possível ler essa imagem.'));
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function horarioDoDia(lista, dow) {
    const hs = lista.map(b => b.horarios && b.horarios[dow]).filter(h => h && h.aberto);
    if (!hs.length) return null;
    return [Math.min(...hs.map(h => U.toMin(h.inicio))), Math.max(...hs.map(h => U.toMin(h.fim)))];
  }

  // =========================================================== SITE
  let PUB = null;
  const R = { serv: [], barb: '', data: null, ini: null, nome: '', tel: '', obs: '', cache: {}, enviando: false, feito: null };

  async function abrirSite() {
    app.innerHTML = '<p class="carregando">Carregando…</p>';
    try { PUB = await Api.publico(); }
    catch (e) {
      app.innerHTML = `<div class="erro-geral"><h1>Não foi possível carregar</h1><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`;
      return;
    }
    aplicarMarca(PUB.config, false);
    R.cache = {}; R.feito = null;
    app.innerHTML = htmlSite();
    renderReserva();
    app.addEventListener('click', cliqueSite);
  }

  function cliqueSite(e) {
    const ir = e.target.closest('[data-ir]');
    if (ir) { e.preventDefault(); const alvo = document.getElementById(ir.dataset.ir); if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  function htmlSite() {
    const c = PUB.config, bs = PUB.barbeiros;
    const hoje = horarioDoDia(bs, U.diaSemana(U.hojeISO()));
    const agora = U.agoraMin();
    const status = !hoje ? 'Fechado hoje' : agora < hoje[0] ? `Abre hoje às ${U.toHora(hoje[0])}` : agora < hoje[1] ? `Aberto agora · até ${U.toHora(hoje[1])}` : 'Encerrado por hoje';
    const aberto = hoje && agora >= hoje[0] && agora < hoje[1];
    const mapa = c.mapa || (c.endereco ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.endereco) : '');
    const horarios = ORDEM_SEMANA.map(i => { const h = horarioDoDia(bs, i); return `<tr><th>${DIAS[i]}</th><td>${h ? U.toHora(h[0]) + ' – ' + U.toHora(h[1]) : 'Fechado'}</td></tr>`; }).join('');
    return `
    <header class="topo"><div class="wrap topo-in">
      <a class="marca" href="#inicio" data-ir="topo">${logoHTML(c)}<span>${esc(c.nome)}</span></a>
      <nav class="topo-nav"><a href="#inicio" data-ir="equipe">Equipe</a><a href="#inicio" data-ir="contato">Contato</a></nav>
      <a class="btn btn-sm" href="#inicio" data-ir="agendar">Agendar</a>
    </div></header>
    <main id="topo">
      <section class="hero"><div class="wrap hero-in">
        <div class="hero-logo">${logoHTML(c, 'logo-g')}</div>
        <div class="hero-txt">
          <h1>${esc(c.nome)}</h1>
          ${c.slogan ? `<p class="slogan">${esc(c.slogan)}</p>` : ''}
          <p class="estado ${aberto ? 'on' : ''}"><i></i>${status}${c.endereco ? ` <span>· ${esc(c.endereco)}</span>` : ''}</p>
        </div>
      </div><div class="listras" aria-hidden="true"></div></section>
      <div class="wrap grade-site">
        <section id="agendar" class="col-main"><div id="reserva-box"></div></section>
        <aside class="col-side">
          ${bs.length ? `<section class="card" id="equipe"><h2>Equipe</h2><ul class="equipe">${bs.map(b => `<li>${avatar(b, 'av av-g')}<div><strong>${esc(b.nome)}</strong>${b.bio ? `<span>${esc(b.bio)}</span>` : ''}</div></li>`).join('')}</ul></section>` : ''}
          <section class="card" id="contato"><h2>Contato e horários</h2>
            <ul class="contatos">
              ${c.endereco ? `<li><b>Endereço</b><span>${esc(c.endereco)}</span>${mapa ? `<a href="${esc(mapa)}" target="_blank" rel="noopener">Abrir no mapa</a>` : ''}</li>` : ''}
              ${c.whatsapp ? `<li><b>WhatsApp</b><a href="${esc(waLink(c.whatsapp, 'Olá! Vim pelo site.'))}" target="_blank" rel="noopener">${esc(U.fone(c.whatsapp.replace(/^55/, '')))}</a></li>` : ''}
              ${c.telefone ? `<li><b>Telefone</b><span>${esc(c.telefone)}</span></li>` : ''}
              ${c.instagram ? `<li><b>Instagram</b><a href="https://instagram.com/${esc(c.instagram)}" target="_blank" rel="noopener">@${esc(c.instagram)}</a></li>` : ''}
            </ul>
            <table class="horarios-tab"><tbody>${horarios}</tbody></table>
            ${c.sobre ? `<p class="sobre">${esc(c.sobre)}</p>` : ''}
          </section>
        </aside>
      </div>
    </main>
    <footer class="rodape"><div class="wrap">
      <span>© ${new Date().getFullYear()} ${esc(c.nome)}</span>
      <a href="#admin">Área do administrador</a>
    </div></footer>`;
  }

  const servSel = () => PUB.servicos.filter(s => R.serv.includes(s.id));
  const durTotal = () => servSel().reduce((a, s) => a + Number(s.duracao), 0);
  const precoTotal = () => servSel().reduce((a, s) => a + Number(s.preco), 0);
  const elegiveis = () => PUB.barbeiros.filter(b => U.fazServicos(b, R.serv));
  const alvo = () => (R.barb ? elegiveis().filter(b => b.id === R.barb) : elegiveis());

  function slotsDoDia(data, oc) {
    const dur = durTotal(), set = new Set();
    for (const b of alvo()) {
      horariosLivres({ barbeiro: b, data, duracao: dur, ocupados: oc.ocupados, bloqueios: oc.bloqueios, config: PUB.config, hoje: U.hojeISO(), agoraMin: U.agoraMin() }).forEach(t => set.add(t));
    }
    return [...set].sort((a, b) => a - b);
  }

  function normalizar() {
    const el = elegiveis();
    if (el.length === 1) R.barb = el[0].id;
    else if (R.barb && !el.some(b => b.id === R.barb)) R.barb = '';
  }

  function renderReserva() {
    const box = $('#reserva-box'); if (!box) return;
    const sc = $('.dias', box), pos = sc ? sc.scrollLeft : 0;
    normalizar();
    box.innerHTML = R.feito ? htmlSucesso() : htmlReserva();
    const sc2 = $('.dias', box); if (sc2) sc2.scrollLeft = pos;
    ligarReserva(box);
    if (R.data && R.serv.length && !R.cache[R.data]) {
      const d = R.data;
      Api.ocupados(d).then(oc => { R.cache[d] = oc; if (R.data === d) renderReserva(); })
        .catch(e => { toast(e.message, 'erro'); });
    }
  }

  function htmlReserva() {
    const S = PUB.servicos, el = elegiveis(), c = PUB.config;
    let h = `<form id="reserva" class="card reserva" novalidate>
      <h2>Agende seu horário</h2>
      <fieldset class="passo"><legend><b>1</b>O que você vai fazer?</legend>
        ${S.length ? `<div class="servs">${S.map(s => `<label class="opt"><input type="checkbox" name="serv" value="${esc(s.id)}"${R.serv.includes(s.id) ? ' checked' : ''}>
          <span class="opt-txt"><strong>${esc(s.nome)}</strong><small>${s.duracao} min${s.descricao ? ' · ' + esc(s.descricao) : ''}</small></span><em>${U.dinheiro(s.preco)}</em></label>`).join('')}</div>`
        : '<p class="vazio">A barbearia ainda não cadastrou serviços.</p>'}
      </fieldset>`;
    if (!R.serv.length) return h + '<p class="dica">Escolha um ou mais serviços para ver os horários livres.</p></form>';

    h += `<fieldset class="passo"><legend><b>2</b>Profissional</legend>`;
    if (!el.length) return h + '<p class="vazio">Nenhum profissional faz essa combinação de serviços. Tente separar os serviços ou fale com a barbearia.</p></fieldset></form>';
    h += `<div class="barbs">${el.length > 1 ? `<label class="pill"><input type="radio" name="barb" value=""${!R.barb ? ' checked' : ''}><span>${avatar(null)}Sem preferência</span></label>` : ''}
      ${el.map(b => `<label class="pill"><input type="radio" name="barb" value="${esc(b.id)}"${R.barb === b.id ? ' checked' : ''}><span>${avatar(b)}${esc(b.nome)}</span></label>`).join('')}</div></fieldset>`;

    const lista = alvo(), dias = [];
    for (let i = 0; i < (Number(c.diasAFrente) || 30); i++) {
      const d = U.addDias(U.hojeISO(), i), dow = U.diaSemana(d);
      dias.push({ d, dow, i, abre: lista.some(b => b.horarios && b.horarios[dow] && b.horarios[dow].aberto) });
    }
    h += `<fieldset class="passo"><legend><b>3</b>Dia</legend><div class="dias scroll">${dias.map(x => {
      const dt = new Date(x.d + 'T12:00:00Z');
      return `<button type="button" class="dia${R.data === x.d ? ' sel' : ''}" data-dia="${x.d}"${x.abre ? '' : ' disabled'} aria-pressed="${R.data === x.d}">
        <small>${x.i === 0 ? 'Hoje' : x.i === 1 ? 'Amanhã' : DIAS_C[x.dow]}</small><b>${dt.getUTCDate()}</b><small>${x.abre ? MESES[dt.getUTCMonth()].slice(0, 3) : 'fechado'}</small></button>`;
    }).join('')}</div></fieldset>`;
    if (!R.data) return h + '<p class="dica">Escolha o dia.</p></form>';

    h += `<fieldset class="passo"><legend><b>4</b>Horário <span class="leg-extra">· duração ${durTotal()} min</span></legend>`;
    const oc = R.cache[R.data];
    if (!oc) return h + '<p class="carregando">Buscando horários livres…</p></fieldset></form>';
    const slots = slotsDoDia(R.data, oc);
    if (!slots.length) return h + '<p class="vazio">Sem horários livres neste dia. Tente outro dia ou outro profissional.</p></fieldset></form>';
    if (R.ini != null && !slots.includes(R.ini)) R.ini = null;
    const grupos = [['Manhã', 0, 720], ['Tarde', 720, 1080], ['Noite', 1080, 1440]];
    h += grupos.map(([n, a, z]) => { const g = slots.filter(t => t >= a && t < z); return g.length ? `<div class="turno"><span>${n}</span><div class="slots">${g.map(t => `<button type="button" class="slot${R.ini === t ? ' sel' : ''}" data-ini="${t}" aria-pressed="${R.ini === t}">${U.toHora(t)}</button>`).join('')}</div></div>` : ''; }).join('');
    h += '</fieldset>';
    if (R.ini == null) return h + '</form>';

    const barbNome = R.barb ? (PUB.barbeiros.find(b => b.id === R.barb) || {}).nome : 'primeiro profissional livre';
    h += `<fieldset class="passo"><legend><b>5</b>Seus dados</legend>
      <div class="campos">
        <label>Nome completo<input name="nome" autocomplete="name" maxlength="80" required value="${esc(R.nome)}"></label>
        <label>WhatsApp<input name="tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000" required value="${esc(R.tel)}"></label>
        <label class="full">Observação <i>(opcional)</i><input name="obs" maxlength="300" placeholder="Ex.: quero manter o comprimento em cima" value="${esc(R.obs)}"></label>
        <input class="hp" name="site" tabindex="-1" autocomplete="off" aria-hidden="true">
      </div></fieldset>
      <div class="resumo">
        <div><strong>${esc(servSel().map(s => s.nome).join(' + '))}</strong>
        <span>${fmtData(R.data)} às ${U.toHora(R.ini)} · ${esc(barbNome)}</span></div>
        <b class="total">${U.dinheiro(precoTotal())}</b>
        <button class="btn btn-g" type="submit" id="confirmar"${R.enviando ? ' disabled' : ''}>${R.enviando ? 'Confirmando…' : 'Confirmar agendamento'}</button>
      </div></form>`;
    return h;
  }

  function ligarReserva(box) {
    const f = $('#reserva', box);
    if (!f) {
      const nv = $('[data-novo]', box);
      if (nv) nv.onclick = () => { Object.assign(R, { serv: [], barb: '', data: null, ini: null, feito: null, cache: {} }); renderReserva(); };
      return;
    }
    f.addEventListener('change', e => {
      if (e.target.name === 'serv') { R.serv = $$('input[name=serv]:checked', f).map(i => i.value); R.ini = null; renderReserva(); }
      if (e.target.name === 'barb') { R.barb = e.target.value; R.ini = null; renderReserva(); }
    });
    f.addEventListener('click', e => {
      const d = e.target.closest('[data-dia]');
      if (d && !d.disabled) { R.data = d.dataset.dia; R.ini = null; renderReserva(); return; }
      const s = e.target.closest('[data-ini]');
      if (s) { const primeira = R.ini == null; R.ini = Number(s.dataset.ini); renderReserva(); if (primeira) { const n = $('#reserva input[name=nome]'); if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); } } }
    });
    f.addEventListener('input', e => {
      if (e.target.name === 'tel') { e.target.value = U.fone(e.target.value); R.tel = e.target.value; }
      if (e.target.name === 'nome') R.nome = e.target.value;
      if (e.target.name === 'obs') R.obs = e.target.value;
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (R.nome.trim().length < 2) { toast('Informe seu nome.', 'erro'); $('input[name=nome]', f).focus(); return; }
      if (U.soDigitos(R.tel).length < 10) { toast('Informe o WhatsApp com DDD.', 'erro'); $('input[name=tel]', f).focus(); return; }
      R.enviando = true; renderReserva();
      try {
        R.feito = await Api.agendar({
          servicoIds: R.serv, barbeiroId: R.barb, data: R.data, inicio: R.ini,
          clienteNome: R.nome.trim(), clienteTelefone: U.soDigitos(R.tel), obs: R.obs.trim(), site: (f.site || {}).value || '',
        });
      } catch (err) { toast(err.message, 'erro'); delete R.cache[R.data]; R.ini = null; }
      R.enviando = false; renderReserva();
      $('#agendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function htmlSucesso() {
    const a = R.feito, c = PUB.config;
    const d = a.data.replace(/-/g, ''), i = U.toHora(a.inicio).replace(':', ''), f = U.toHora(a.fim).replace(':', '');
    const gcal = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(`${a.servicosNome} — ${c.nome}`)
      + `&dates=${d}T${i}00/${d}T${f}00&ctz=${encodeURIComponent(c.fuso || 'America/Sao_Paulo')}`
      + '&details=' + encodeURIComponent('Profissional: ' + a.barbeiroNome)
      + (c.endereco ? '&location=' + encodeURIComponent(c.endereco) : '');
    const msg = `Olá! Acabei de agendar pelo site:\n${a.servicosNome}\n${fmtDataLonga(a.data)} às ${U.toHora(a.inicio)}\nCom: ${a.barbeiroNome}\nNome: ${a.clienteNome}`;
    return `<div class="card reserva sucesso">
      <div class="ok-selo" aria-hidden="true">✓</div>
      <h2>Horário confirmado</h2>
      <p class="ok-hora">${fmtDataLonga(a.data)}<b>${U.toHora(a.inicio)}</b></p>
      <dl class="ok-det">
        <dt>Serviço</dt><dd>${esc(a.servicosNome)} · ${a.duracao} min</dd>
        <dt>Profissional</dt><dd>${esc(a.barbeiroNome)}</dd>
        <dt>Valor</dt><dd>${U.dinheiro(a.total)} <small>(pago na barbearia)</small></dd>
        <dt>Cliente</dt><dd>${esc(a.clienteNome)} · ${esc(U.fone(a.clienteTelefone))}</dd>
      </dl>
      <div class="ok-acoes">
        ${c.whatsapp ? `<a class="btn" href="${esc(waLink(c.whatsapp, msg))}" target="_blank" rel="noopener">Avisar no WhatsApp</a>` : ''}
        <a class="btn btn-sec" href="${esc(gcal)}" target="_blank" rel="noopener">Salvar na agenda do celular</a>
      </div>
      <p class="ajuda">Precisa cancelar ou remarcar? Fale com a barbearia${c.whatsapp ? ' pelo WhatsApp' : c.telefone ? ' pelo telefone ' + esc(c.telefone) : ''}.</p>
      <button type="button" class="link" data-novo>Fazer outro agendamento</button>
    </div>`;
  }

  // ========================================================== ADMIN
  const A = { tab: 'agenda', data: U.hojeISO(), D: null, ags: [], rel: '30' };
  const ABAS = [['agenda', 'Agenda'], ['barbeiros', 'Barbeiros'], ['servicos', 'Serviços'], ['folgas', 'Folgas e fechamentos'], ['relatorios', 'Relatórios'], ['config', 'Configurações']];

  function telaLogin() {
    app.innerHTML = `<div class="login"><form class="card login-card" id="login" novalidate>
      <div class="login-marca"><span class="logo logo-vazia">${poste()}</span></div>
      <h1>Painel da barbearia</h1>
      <label>Senha<input type="password" name="senha" autocomplete="current-password" required></label>
      <button class="btn btn-g" type="submit">Entrar</button>
      ${Api.demo ? '<p class="ajuda">Demonstração: a senha é <b>admin</b>.</p>' : ''}
      <a class="link" href="#inicio">← Voltar ao site</a></form></div>`;
    document.title = 'Painel · Entrar';
    const f = $('#login'); f.senha.focus();
    f.addEventListener('submit', async e => {
      e.preventDefault(); const b = f.querySelector('button'); b.disabled = true;
      try { await Api.login(f.senha.value); abrirAdmin(); } catch (err) { toast(err.message, 'erro'); f.senha.select(); }
      b.disabled = false;
    });
  }

  async function abrirAdmin() {
    if (!Api.logado()) return telaLogin();
    app.innerHTML = `<div class="adm"><header class="adm-topo"><div class="wrap topo-in">
        <span class="marca" id="adm-marca"></span>
        <div class="adm-acoes"><a class="btn btn-sec btn-sm" href="#inicio">Ver site</a><button class="btn btn-sec btn-sm" id="sair" type="button">Sair</button></div></div>
        <nav class="wrap abas scroll" id="abas" aria-label="Seções do painel">${ABAS.map(([k, n]) => `<button type="button" data-aba="${k}">${n}</button>`).join('')}</nav></header>
      ${Api.demo ? '<p class="faixa-demo">Modo demonstração — os dados ficam só neste navegador.</p>' : ''}
      <main class="wrap adm-main" id="adm-main"><p class="carregando">Carregando…</p></main></div>`;
    $('#sair').onclick = () => { Api.sair(); telaLogin(); };
    $('#abas').onclick = e => { const b = e.target.closest('[data-aba]'); if (b) { A.tab = b.dataset.aba; renderAba(); } };
    try { A.D = await Api.admin.dados(); }
    catch (e) { if (e.auth) return telaLogin(); $('#adm-main').innerHTML = `<p class="vazio">${esc(e.message)}</p>`; return; }
    aplicarMarca(A.D.config, true);
    $('#adm-marca').innerHTML = `${logoHTML(A.D.config)}<span>${esc(A.D.config.nome)}</span>`;
    renderAba();
  }
  async function recarregar() { A.D = await Api.admin.dados(); aplicarMarca(A.D.config, true); $('#adm-marca').innerHTML = `${logoHTML(A.D.config)}<span>${esc(A.D.config.nome)}</span>`; }
  async function seguro(fn) { try { await fn(); } catch (e) { if (e.auth) return telaLogin(); toast(e.message, 'erro'); } }

  function renderAba() {
    $$('#abas [data-aba]').forEach(b => b.setAttribute('aria-current', b.dataset.aba === A.tab ? 'page' : 'false'));
    ({ agenda: abaAgenda, barbeiros: abaBarbeiros, servicos: abaServicos, folgas: abaFolgas, relatorios: abaRelatorios, config: abaConfig })[A.tab]();
  }

  // ---------------------------------------------------------- agenda
  function abaAgenda() {
    const m = $('#adm-main');
    m.innerHTML = `<div class="barra">
        <div class="nav-data"><button class="btn btn-sec btn-ic" data-d="-1" type="button" aria-label="Dia anterior">‹</button>
        <input type="date" id="ag-data" value="${A.data}" aria-label="Data">
        <button class="btn btn-sec btn-ic" data-d="1" type="button" aria-label="Próximo dia">›</button>
        <button class="btn btn-sec btn-sm" data-d="0" type="button">Hoje</button></div>
        <div class="barra-acoes"><button class="btn btn-sec" id="fechar-dia" type="button">Fechar agenda</button><button class="btn" id="novo-ag" type="button">+ Agendamento</button></div>
      </div>
      <h2 class="titulo-data">${fmtDataLonga(A.data)}${A.data === U.hojeISO() ? ' <small>hoje</small>' : ''}</h2>
      <div id="ag-conteudo"><p class="carregando">Carregando…</p></div>`;
    m.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const n = Number(b.dataset.d); A.data = n ? U.addDias(A.data, n) : U.hojeISO(); abaAgenda(); });
    $('#ag-data').onchange = e => { if (e.target.value) { A.data = e.target.value; abaAgenda(); } };
    $('#novo-ag').onclick = () => modalAgendamento();
    $('#fechar-dia').onclick = () => modalBloqueio({ data: A.data, dataFim: A.data, diaInteiro: true, barbeiroId: '' });
    seguro(async () => { A.ags = await Api.admin.agendamentos(A.data, A.data); desenharAgenda(); });
  }

  function desenharAgenda() {
    const box = $('#ag-conteudo'); if (!box) return;
    const D = A.D, dow = U.diaSemana(A.data);
    const validos = A.ags.filter(a => a.status !== 'cancelado');
    const concl = A.ags.filter(a => a.status === 'concluido');
    const bls = D.bloqueios.filter(b => b.data <= A.data && b.dataFim >= A.data);
    const ids = new Set(D.barbeiros.filter(b => b.ativo).map(b => b.id)); A.ags.forEach(a => ids.add(a.barbeiroId));
    const cols = [...ids].map(id => D.barbeiros.find(b => b.id === id) || { id, nome: (A.ags.find(a => a.barbeiroId === id) || {}).barbeiroNome + ' (excluído)', horarios: [] });
    const nomeB = id => id ? ((D.barbeiros.find(b => b.id === id) || {}).nome || '—') : 'Barbearia inteira';
    box.innerHTML = `
      <div class="kpis">
        <div><span>Agendados</span><b>${validos.length}</b></div>
        <div><span>Concluídos</span><b>${concl.length}</b></div>
        <div><span>Previsto</span><b>${U.dinheiro(validos.filter(a => a.status !== 'faltou').reduce((s, a) => s + a.total, 0))}</b></div>
        <div><span>Recebido</span><b>${U.dinheiro(concl.reduce((s, a) => s + a.total, 0))}</b></div>
      </div>
      ${bls.map(b => `<div class="aviso"><b>${esc(nomeB(b.barbeiroId))}</b> — ${b.diaInteiro ? 'agenda fechada o dia todo' : `fechado das ${b.inicio} às ${b.fim}`}${b.motivo ? ' · ' + esc(b.motivo) : ''}<button class="link" data-rem-bl="${esc(b.id)}" type="button">Reabrir</button></div>`).join('')}
      ${cols.length ? `<div class="colunas">${cols.map(b => {
        const h = (b.horarios || [])[dow];
        const lista = A.ags.filter(a => a.barbeiroId === b.id).sort((x, y) => x.inicio - y.inicio);
        return `<section class="coluna"><header>${avatar(b)}<div><strong>${esc(b.nome)}</strong><span>${h && h.aberto ? `${h.inicio}–${h.fim}${h.pausaInicio ? ` · pausa ${h.pausaInicio}–${h.pausaFim}` : ''}` : 'Folga neste dia'}</span></div></header>
          ${lista.length ? `<ol class="ags">${lista.map(itemAg).join('')}</ol>` : '<p class="vazio">Nenhum agendamento.</p>'}</section>`;
      }).join('')}</div>` : '<p class="vazio">Cadastre um barbeiro na aba Barbeiros para começar.</p>'}`;
    box.onchange = e => {
      const s = e.target.closest('[data-status]'); if (!s) return;
      seguro(async () => { await Api.admin.status(s.dataset.status, s.value); toast('Status atualizado.'); A.ags = await Api.admin.agendamentos(A.data, A.data); desenharAgenda(); })
        .then(() => { if (s.isConnected) { const a = A.ags.find(x => x.id === s.dataset.status); if (a) s.value = a.status; } });
    };
    box.onclick = e => {
      const r = e.target.closest('[data-rem-bl]');
      if (r) seguro(async () => { await Api.admin.excluirBloqueio(r.dataset.remBl); await recarregar(); toast('Agenda reaberta.'); desenharAgenda(); });
    };
  }

  function itemAg(a) {
    const c = A.D.config;
    const msg = `Olá, ${a.clienteNome.split(' ')[0]}! Confirmando seu horário na ${c.nome}: ${fmtDataLonga(a.data)} às ${U.toHora(a.inicio)} (${a.servicosNome}).`;
    return `<li class="ag st-${a.status}">
      <time>${U.toHora(a.inicio)}<small>${U.toHora(a.fim)}</small></time>
      <div class="ag-info"><strong>${esc(a.clienteNome)}</strong>
        <span>${esc(a.servicosNome)} · ${U.dinheiro(a.total)}</span>
        <span class="tel">${esc(U.fone(a.clienteTelefone))}${a.origem === 'balcao' ? ' · <i>balcão</i>' : ''}</span>
        ${a.obs ? `<em>“${esc(a.obs)}”</em>` : ''}</div>
      <div class="ag-acoes">
        <select data-status="${esc(a.id)}" aria-label="Status">${Object.entries(STATUS).map(([k, n]) => `<option value="${k}"${a.status === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <a class="btn btn-sec btn-sm" href="${esc(waLink(a.clienteTelefone, msg))}" target="_blank" rel="noopener">WhatsApp</a>
      </div></li>`;
  }

  function modalAgendamento() {
    const D = A.D, bs = D.barbeiros.filter(b => b.ativo), ss = D.servicos.filter(s => s.ativo);
    if (!bs.length || !ss.length) return toast('Cadastre ao menos um barbeiro e um serviço ativos.', 'erro');
    let oc = null;
    const corpo = `<div class="campos">
        <label>Nome do cliente<input name="nome" maxlength="80" required></label>
        <label>Telefone<input name="tel" type="tel" inputmode="tel" placeholder="(00) 00000-0000" required></label>
      </div>
      <h4>Serviços</h4><div class="checks">${ss.map(s => `<label class="check"><input type="checkbox" name="serv" value="${esc(s.id)}"> ${esc(s.nome)} <small>${s.duracao} min · ${U.dinheiro(s.preco)}</small></label>`).join('')}</div>
      <div class="campos">
        <label>Barbeiro<select name="barb">${bs.map(b => `<option value="${esc(b.id)}">${esc(b.nome)}</option>`).join('')}</select></label>
        <label>Data<input type="date" name="data" value="${A.data}" min="${U.hojeISO()}"></label>
        <label>Horário<select name="ini" required><option value="">Escolha os serviços</option></select></label>
        <label>Observação<input name="obs" maxlength="300"></label>
      </div>`;
    modal({
      titulo: 'Novo agendamento (balcão / telefone)', corpo, botao: 'Agendar', largo: true,
      aoAbrir(f) {
        const atualizar = async () => {
          const ids = $$('input[name=serv]:checked', f).map(i => i.value);
          const dur = ss.filter(s => ids.includes(s.id)).reduce((a, s) => a + s.duracao, 0);
          const b = bs.find(x => x.id === f.barb.value);
          if (!dur) { f.ini.innerHTML = '<option value="">Escolha os serviços</option>'; return; }
          if (!U.fazServicos(b, ids)) { f.ini.innerHTML = '<option value="">Esse barbeiro não faz todos esses serviços</option>'; return; }
          f.ini.innerHTML = '<option value="">Carregando…</option>';
          try { oc = await Api.ocupados(f.data.value); } catch (e) { toast(e.message, 'erro'); return; }
          const sl = horariosLivres({ barbeiro: b, data: f.data.value, duracao: dur, ocupados: oc.ocupados, bloqueios: oc.bloqueios, config: D.config, hoje: U.hojeISO(), agoraMin: U.agoraMin(), ignorarAntecedencia: true });
          f.ini.innerHTML = sl.length ? sl.map(t => `<option value="${t}">${U.toHora(t)} – ${U.toHora(t + dur)}</option>`).join('') : '<option value="">Sem horário livre neste dia</option>';
        };
        f.addEventListener('change', e => { if (['serv', 'barb', 'data'].includes(e.target.name)) atualizar(); });
        f.tel.addEventListener('input', () => { f.tel.value = U.fone(f.tel.value); });
      },
      async aoEnviar(f) {
        if (!f.ini.value) throw new Error('Escolha um horário livre.');
        await Api.admin.balcao({
          clienteNome: f.nome.value, clienteTelefone: U.soDigitos(f.tel.value), servicoIds: $$('input[name=serv]:checked', f).map(i => i.value),
          barbeiroId: f.barb.value, data: f.data.value, inicio: Number(f.ini.value), obs: f.obs.value,
        });
        toast('Agendamento criado.');
        A.data = f.data.value; A.tab = 'agenda'; renderAba();
      },
    });
  }

  // -------------------------------------------------------- barbeiros
  function abaBarbeiros() {
    const bs = A.D.barbeiros;
    $('#adm-main').innerHTML = `<div class="barra"><h2>Barbeiros</h2><button class="btn" id="novo-b" type="button">+ Novo barbeiro</button></div>
      ${bs.length ? `<div class="cards">${bs.map(b => `<article class="card cb${b.ativo ? '' : ' inativo'}">
        ${avatar(b, 'av av-g')}<div><h3>${esc(b.nome)}</h3>${b.bio ? `<p>${esc(b.bio)}</p>` : ''}
        <p class="mini">${ORDEM_SEMANA.filter(i => b.horarios[i] && b.horarios[i].aberto).map(i => DIAS_C[i]).join(' · ') || 'Sem dias de atendimento'}</p>
        <p class="mini">${b.servicos && b.servicos.length ? b.servicos.length + ' serviço(s)' : 'Faz todos os serviços'}${b.ativo ? '' : ' · <b>inativo</b>'}</p></div>
        <div class="cb-acoes"><button class="btn btn-sec btn-sm" data-ed="${esc(b.id)}" type="button">Editar</button><button class="btn btn-sec btn-sm perigo" data-ex="${esc(b.id)}" type="button">Excluir</button></div></article>`).join('')}</div>`
        : '<p class="vazio">Nenhum barbeiro cadastrado.</p>'}`;
    $('#novo-b').onclick = () => modalBarbeiro();
    $('#adm-main').onclick = e => {
      const ed = e.target.closest('[data-ed]'), ex = e.target.closest('[data-ex]');
      if (ed) modalBarbeiro(bs.find(b => b.id === ed.dataset.ed));
      if (ex) {
        const b = bs.find(x => x.id === ex.dataset.ex);
        confirmar(`Excluir ${b.nome}? Os agendamentos futuros dele serão cancelados (o histórico fica). Se for só uma pausa, prefira desmarcar "Ativo".`).then(ok => ok && seguro(async () => {
          const r = await Api.admin.excluirBarbeiro(b.id); await recarregar(); abaBarbeiros();
          toast(r.cancelados ? `Excluído. ${r.cancelados} agendamento(s) cancelado(s) — avise os clientes.` : 'Barbeiro excluído.');
        }));
      }
    };
  }

  function modalBarbeiro(b0) {
    const padrao = [0, 1, 2, 3, 4, 5, 6].map(i => ({ aberto: i !== 0, inicio: '09:00', fim: i === 6 ? '17:00' : '19:00', pausaInicio: i === 6 ? '' : '12:00', pausaFim: i === 6 ? '' : '13:00' }));
    const b = b0 ? JSON.parse(JSON.stringify(b0)) : { id: '', nome: '', bio: '', foto: '', ativo: true, servicos: [], horarios: padrao, ordem: A.D.barbeiros.length };
    const corpo = `<div class="foto-campo"><div id="b-prev">${avatar(b, 'av av-xg')}</div>
        <div><label class="btn btn-sec btn-sm">Escolher foto<input type="file" accept="image/*" id="b-foto" hidden></label>
        <button type="button" class="link" id="b-rem">Remover foto</button></div></div>
      <div class="campos">
        <label>Nome<input name="nome" maxlength="60" required value="${esc(b.nome)}"></label>
        <label>Descrição curta<input name="bio" maxlength="140" placeholder="Ex.: especialista em degradê" value="${esc(b.bio)}"></label>
        <label class="check full"><input type="checkbox" name="ativo"${b.ativo ? ' checked' : ''}> Ativo — aparece no site e recebe agendamentos</label>
      </div>
      <h4>Serviços que realiza</h4><p class="ajuda">Nenhum marcado = faz todos.</p>
      <div class="checks">${A.D.servicos.map(s => `<label class="check"><input type="checkbox" name="bs" value="${esc(s.id)}"${b.servicos.includes(s.id) ? ' checked' : ''}> ${esc(s.nome)}</label>`).join('') || '<p class="vazio">Cadastre serviços primeiro.</p>'}</div>
      <h4>Horário de atendimento</h4>
      <div class="horarios">${ORDEM_SEMANA.map(i => { const h = b.horarios[i] || padrao[i]; return `<div class="hr-linha">
        <label class="check"><input type="checkbox" name="ab${i}"${h.aberto ? ' checked' : ''}> ${DIAS_C[i]}</label>
        <input type="time" name="in${i}" value="${h.inicio}" aria-label="${DIAS[i]} início"><span>às</span><input type="time" name="fi${i}" value="${h.fim}" aria-label="${DIAS[i]} fim">
        <span class="pz">pausa</span><input type="time" name="pi${i}" value="${h.pausaInicio || ''}" aria-label="${DIAS[i]} pausa início"><span>às</span><input type="time" name="pf${i}" value="${h.pausaFim || ''}" aria-label="${DIAS[i]} pausa fim"></div>`; }).join('')}</div>
      <button type="button" class="link" id="copiar-seg">Copiar horário de segunda para terça a sexta</button>`;
    modal({
      titulo: b0 ? 'Editar barbeiro' : 'Novo barbeiro', corpo, largo: true,
      aoAbrir(f) {
        $('#b-foto', f).onchange = async e => { try { b.foto = await lerImagem(e.target.files[0], 240); $('#b-prev', f).innerHTML = avatar(b, 'av av-xg'); } catch (err) { toast(err.message, 'erro'); } };
        $('#b-rem', f).onclick = () => { b.foto = ''; $('#b-prev', f).innerHTML = avatar({ ...b, nome: f.nome.value || b.nome }, 'av av-xg'); };
        $('#copiar-seg', f).onclick = () => { [2, 3, 4, 5].forEach(i => { ['ab', 'in', 'fi', 'pi', 'pf'].forEach(k => { const o = f[k + '1'], d = f[k + i]; if (k === 'ab') d.checked = o.checked; else d.value = o.value; }); }); toast('Copiado para terça a sexta.'); };
      },
      async aoEnviar(f) {
        if (!f.nome.value.trim()) throw new Error('Informe o nome.');
        const horarios = [0, 1, 2, 3, 4, 5, 6].map(i => ({ aberto: f['ab' + i].checked, inicio: f['in' + i].value || '09:00', fim: f['fi' + i].value || '18:00', pausaInicio: f['pi' + i].value, pausaFim: f['pf' + i].value }));
        const ruim = horarios.find(h => h.aberto && h.fim <= h.inicio);
        if (ruim) throw new Error('Em algum dia o fim está antes do início.');
        await Api.admin.salvarBarbeiro({ ...b, nome: f.nome.value.trim(), bio: f.bio.value.trim(), ativo: f.ativo.checked, servicos: $$('input[name=bs]:checked', f).map(i => i.value), horarios });
        await recarregar(); abaBarbeiros(); toast('Barbeiro salvo.');
      },
    });
  }

  // --------------------------------------------------------- serviços
  function abaServicos() {
    const ss = A.D.servicos;
    $('#adm-main').innerHTML = `<div class="barra"><h2>Serviços</h2><button class="btn" id="novo-s" type="button">+ Novo serviço</button></div>
      <p class="ajuda">A duração define quanto tempo o serviço ocupa na agenda. Para combos (ex.: corte + barba em 1h), cadastre como um serviço próprio — o cliente também pode marcar vários e as durações se somam.</p>
      ${ss.length ? `<table class="tabela stack"><thead><tr><th>Serviço</th><th>Duração</th><th class="num">Preço</th><th>Status</th><th></th></tr></thead><tbody>
      ${ss.map(s => `<tr class="${s.ativo ? '' : 'inativo'}"><td><strong>${esc(s.nome)}</strong>${s.descricao ? `<br><small>${esc(s.descricao)}</small>` : ''}</td><td>${s.duracao} min</td><td class="num">${U.dinheiro(s.preco)}</td><td>${s.ativo ? 'Ativo' : 'Oculto'}</td>
        <td class="acoes"><button class="btn btn-sec btn-sm" data-ed="${esc(s.id)}" type="button">Editar</button><button class="btn btn-sec btn-sm perigo" data-ex="${esc(s.id)}" type="button">Excluir</button></td></tr>`).join('')}
      </tbody></table>` : '<p class="vazio">Nenhum serviço cadastrado.</p>'}`;
    $('#novo-s').onclick = () => modalServico();
    $('#adm-main').onclick = e => {
      const ed = e.target.closest('[data-ed]'), ex = e.target.closest('[data-ex]');
      if (ed) modalServico(ss.find(s => s.id === ed.dataset.ed));
      if (ex) {
        const s = ss.find(x => x.id === ex.dataset.ex);
        confirmar(`Excluir "${s.nome}"? Agendamentos já feitos continuam na agenda.`).then(ok => ok && seguro(async () => { await Api.admin.excluirServico(s.id); await recarregar(); abaServicos(); toast('Serviço excluído.'); }));
      }
    };
  }
  function modalServico(s0) {
    const s = s0 || { id: '', nome: '', descricao: '', duracao: 30, preco: 0, ativo: true, ordem: A.D.servicos.length };
    modal({
      titulo: s0 ? 'Editar serviço' : 'Novo serviço',
      corpo: `<div class="campos">
        <label class="full">Nome<input name="nome" maxlength="60" required value="${esc(s.nome)}" placeholder="Ex.: Corte + barba"></label>
        <label class="full">Descrição <i>(opcional)</i><input name="descricao" maxlength="140" value="${esc(s.descricao)}" placeholder="Ex.: toalha quente e navalha"></label>
        <label>Duração (minutos)<input name="duracao" type="number" min="5" max="480" step="5" value="${s.duracao}" required></label>
        <label>Preço (R$)<input name="preco" type="number" min="0" step="0.01" value="${s.preco}" inputmode="decimal"></label>
        <label class="check full"><input type="checkbox" name="ativo"${s.ativo ? ' checked' : ''}> Ativo — aparece para o cliente</label></div>`,
      async aoEnviar(f) {
        if (!f.nome.value.trim()) throw new Error('Informe o nome.');
        const dur = parseInt(f.duracao.value, 10);
        if (!(dur >= 5 && dur <= 480)) throw new Error('Duração entre 5 e 480 minutos.');
        await Api.admin.salvarServico({ ...s, nome: f.nome.value.trim(), descricao: f.descricao.value.trim(), duracao: dur, preco: Math.max(0, Number(f.preco.value) || 0), ativo: f.ativo.checked });
        await recarregar(); abaServicos(); toast('Serviço salvo.');
      },
    });
  }

  // ----------------------------------------------------------- folgas
  function abaFolgas() {
    const hoje = U.hojeISO();
    const bl = A.D.bloqueios.filter(b => b.dataFim >= hoje).sort((a, b) => a.data < b.data ? -1 : 1);
    const nomeB = id => id ? ((A.D.barbeiros.find(b => b.id === id) || {}).nome || 'Barbeiro excluído') : 'Barbearia inteira';
    $('#adm-main').innerHTML = `<div class="barra"><h2>Folgas e fechamentos</h2><button class="btn" id="novo-bl" type="button">+ Fechar agenda</button></div>
      <p class="ajuda">Use para feriados, folgas, férias ou um horário específico (ex.: médico das 14h às 16h). O período some do site na hora.</p>
      ${bl.length ? `<table class="tabela stack"><thead><tr><th>Quando</th><th>Quem</th><th>Período</th><th>Motivo</th><th></th></tr></thead><tbody>
      ${bl.map(b => `<tr><td>${fmtData(b.data)}${b.dataFim !== b.data ? ' até ' + fmtData(b.dataFim) : ''}</td><td>${esc(nomeB(b.barbeiroId))}</td><td>${b.diaInteiro ? 'Dia inteiro' : b.inicio + ' – ' + b.fim}</td><td>${esc(b.motivo || '—')}</td>
      <td class="acoes"><button class="btn btn-sec btn-sm perigo" data-ex="${esc(b.id)}" type="button">Reabrir</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="vazio">Nenhum fechamento programado.</p>'}`;
    $('#novo-bl').onclick = () => modalBloqueio({ data: hoje, dataFim: hoje, diaInteiro: true, barbeiroId: '' });
    $('#adm-main').onclick = e => { const ex = e.target.closest('[data-ex]'); if (ex) seguro(async () => { await Api.admin.excluirBloqueio(ex.dataset.ex); await recarregar(); abaFolgas(); toast('Agenda reaberta.'); }); };
  }
  function modalBloqueio(b) {
    modal({
      titulo: 'Fechar agenda', botao: 'Fechar agenda',
      corpo: `<div class="campos">
        <label class="full">Quem<select name="barb"><option value="">Barbearia inteira</option>${A.D.barbeiros.map(x => `<option value="${esc(x.id)}"${b.barbeiroId === x.id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
        <label>De<input type="date" name="data" value="${b.data}" required></label>
        <label>Até<input type="date" name="dataFim" value="${b.dataFim || b.data}"></label>
        <label class="check full"><input type="checkbox" name="dia"${b.diaInteiro ? ' checked' : ''}> Dia inteiro</label>
        <label class="so-hora">Das<input type="time" name="ini" value="${b.inicio || '12:00'}"></label>
        <label class="so-hora">Até<input type="time" name="fim" value="${b.fim || '14:00'}"></label>
        <label class="full">Motivo <i>(só você vê)</i><input name="motivo" maxlength="80" placeholder="Ex.: Feriado, folga, curso"></label></div>`,
      aoAbrir(f) { const t = () => $$('.so-hora', f).forEach(l => (l.hidden = f.dia.checked)); f.dia.onchange = t; t(); },
      async aoEnviar(f) {
        const r = await Api.admin.salvarBloqueio({ barbeiroId: f.barb.value, data: f.data.value, dataFim: f.dataFim.value || f.data.value, diaInteiro: f.dia.checked, inicio: f.ini.value, fim: f.fim.value, motivo: f.motivo.value.trim() });
        await recarregar();
        toast(r.conflitos ? `Agenda fechada. Atenção: ${r.conflitos} agendamento(s) já marcados nesse período — avise ou cancele.` : 'Agenda fechada.', r.conflitos ? 'erro' : '');
        renderAba();
      },
    });
  }

  // ------------------------------------------------------- relatórios
  function abaRelatorios() {
    $('#adm-main').innerHTML = `<div class="barra"><h2>Relatórios</h2>
      <select id="rel-p" aria-label="Período"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="mes">Este mês</option></select></div>
      <div id="rel"><p class="carregando">Carregando…</p></div>`;
    const sel = $('#rel-p'); sel.value = A.rel;
    sel.onchange = () => { A.rel = sel.value; abaRelatorios(); };
    const hoje = U.hojeISO(), de = A.rel === 'mes' ? hoje.slice(0, 8) + '01' : U.addDias(hoje, -(Number(A.rel) - 1));
    seguro(async () => {
      const ags = await Api.admin.agendamentos(de, hoje);
      const conc = ags.filter(a => a.status === 'concluido');
      const fat = conc.reduce((s, a) => s + a.total, 0);
      const por = (k) => { const m = {}; conc.forEach(a => { const n = a[k]; m[n] = m[n] || { n, q: 0, v: 0 }; m[n].q++; m[n].v += a.total; }); return Object.values(m).sort((a, b) => b.v - a.v); };
      const barras = (l) => { const mx = Math.max(1, ...l.map(x => x.v)); return l.length ? `<ul class="barras">${l.map(x => `<li><span>${esc(x.n)}</span><div><i style="width:${(x.v / mx * 100).toFixed(1)}%"></i></div><b>${U.dinheiro(x.v)}</b><small>${x.q}×</small></li>`).join('')}</ul>` : '<p class="vazio">Sem atendimentos concluídos no período.</p>'; };
      $('#rel').innerHTML = `<div class="kpis">
          <div><span>Faturamento</span><b>${U.dinheiro(fat)}</b></div>
          <div><span>Atendimentos</span><b>${conc.length}</b></div>
          <div><span>Ticket médio</span><b>${U.dinheiro(conc.length ? fat / conc.length : 0)}</b></div>
          <div><span>Faltas · cancelados</span><b>${ags.filter(a => a.status === 'faltou').length} · ${ags.filter(a => a.status === 'cancelado').length}</b></div></div>
        <div class="duas"><section class="card"><h3>Por barbeiro</h3>${barras(por('barbeiroNome'))}</section>
        <section class="card"><h3>Por serviço</h3>${barras(por('servicosNome'))}</section></div>
        <p class="ajuda">Conta só atendimentos marcados como “Concluído”. Marque o status na Agenda ao fim de cada corte.</p>`;
    });
  }

  // ---------------------------------------------------- configurações
  function abaConfig() {
    const c = { ...A.D.config };
    const fusos = [['America/Sao_Paulo', 'Brasília (SP, PR, RJ, MG…)'], ['America/Manaus', 'Manaus (AM)'], ['America/Cuiaba', 'Cuiabá (MT, MS)'], ['America/Belem', 'Belém (PA, AP)'], ['America/Fortaleza', 'Fortaleza (CE, Nordeste)'], ['America/Rio_Branco', 'Rio Branco (AC)'], ['America/Noronha', 'Fernando de Noronha']];
    $('#adm-main').innerHTML = `<form id="cfg" class="cfg" novalidate>
      <section class="card"><h3>Identidade</h3>
        <div class="foto-campo"><div id="c-prev">${logoHTML(c, 'logo-g')}</div>
          <div><label class="btn btn-sec btn-sm">Enviar logo<input type="file" accept="image/*" id="c-logo" hidden></label>
          <button type="button" class="link" id="c-rem">Remover</button><p class="ajuda">PNG com fundo transparente, de preferência quadrada.</p></div></div>
        <div class="campos">
          <label>Nome da barbearia<input name="nome" maxlength="60" value="${esc(c.nome)}" required></label>
          <label>Cor principal<input name="cor" type="color" value="${esc(c.cor || '#c8102e')}"></label>
          <label class="full">Frase de destaque<input name="slogan" maxlength="120" value="${esc(c.slogan)}"></label>
        </div></section>
      <section class="card"><h3>Contato</h3><div class="campos">
        <label>WhatsApp (com DDD)<input name="whatsapp" type="tel" inputmode="tel" value="${esc(U.fone(String(c.whatsapp || '').replace(/^55/, '')))}" placeholder="(00) 00000-0000"></label>
        <label>Telefone fixo<input name="telefone" maxlength="30" value="${esc(c.telefone)}"></label>
        <label class="full">Endereço<input name="endereco" maxlength="160" value="${esc(c.endereco)}"></label>
        <label>Link do Google Maps <i>(opcional)</i><input name="mapa" type="url" value="${esc(c.mapa)}" placeholder="https://maps.app.goo.gl/…"></label>
        <label>Instagram<input name="instagram" maxlength="40" value="${esc(c.instagram)}" placeholder="seuperfil"></label>
        <label class="full">Sobre / comodidades<textarea name="sobre" maxlength="600" rows="3" placeholder="Ex.: Wi-Fi, café, estacionamento, formas de pagamento">${esc(c.sobre)}</textarea></label>
      </div></section>
      <section class="card"><h3>Regras da agenda</h3><div class="campos">
        <label>Intervalo entre horários<select name="grade">${[5, 10, 15, 20, 30].map(v => `<option value="${v}"${Number(c.grade) === v ? ' selected' : ''}>A cada ${v} min</option>`).join('')}</select></label>
        <label>Antecedência mínima<select name="antecedencia">${[[0, 'Sem mínimo'], [30, '30 minutos'], [60, '1 hora'], [120, '2 horas'], [180, '3 horas'], [720, '12 horas'], [1440, '1 dia']].map(([v, n]) => `<option value="${v}"${Number(c.antecedencia) === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Agenda aberta para os próximos<select name="diasAFrente">${[7, 14, 21, 30, 45, 60, 90].map(v => `<option value="${v}"${Number(c.diasAFrente) === v ? ' selected' : ''}>${v} dias</option>`).join('')}</select></label>
        <label>Fuso horário<select name="fuso">${fusos.map(([v, n]) => `<option value="${v}"${c.fuso === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      </div><p class="ajuda">O horário de funcionamento é o de cada barbeiro (aba Barbeiros). A senha do painel fica no Cloudflare, no secret ADMIN_PASSWORD.</p></section>
      <div class="salvar"><button class="btn btn-g" type="submit">Salvar configurações</button>
      ${Api.demo ? '<button class="btn btn-sec" type="button" id="reset">Restaurar dados de exemplo</button>' : ''}</div></form>`;
    const f = $('#cfg');
    $('#c-logo').onchange = async e => { try { c.logo = await lerImagem(e.target.files[0], 400); $('#c-prev').innerHTML = logoHTML(c, 'logo-g'); } catch (err) { toast(err.message, 'erro'); } };
    $('#c-rem').onclick = () => { c.logo = ''; $('#c-prev').innerHTML = logoHTML(c, 'logo-g'); };
    f.whatsapp.oninput = () => { f.whatsapp.value = U.fone(f.whatsapp.value); };
    f.cor.oninput = () => document.documentElement.style.setProperty('--acc', f.cor.value);
    if ($('#reset')) $('#reset').onclick = () => confirmar('Apagar tudo da demonstração e voltar aos dados de exemplo?', 'Restaurar').then(ok => { if (ok) { Api.admin.resetarDemo(); abrirAdmin(); } });
    f.onsubmit = e => {
      e.preventDefault();
      if (!f.nome.value.trim()) return toast('Informe o nome da barbearia.', 'erro');
      const w = U.soDigitos(f.whatsapp.value);
      seguro(async () => {
        await Api.admin.salvarConfig({ ...c, nome: f.nome.value.trim(), cor: f.cor.value, slogan: f.slogan.value.trim(), whatsapp: w ? (w.length <= 11 ? '55' + w : w) : '', telefone: f.telefone.value.trim(), endereco: f.endereco.value.trim(), mapa: f.mapa.value.trim(), instagram: f.instagram.value.trim().replace(/^@/, ''), sobre: f.sobre.value.trim(), grade: Number(f.grade.value), antecedencia: Number(f.antecedencia.value), diasAFrente: Number(f.diasAFrente.value), fuso: f.fuso.value });
        await recarregar(); toast('Configurações salvas.');
      });
    };
  }

  // ------------------------------------------------------------ rotas
  function rota() {
    app.removeEventListener('click', cliqueSite);
    $$('.modal-fundo').forEach(m => m.remove()); document.body.classList.remove('sem-rolagem');
    window.scrollTo(0, 0);
    if (location.hash === '#admin') abrirAdmin(); else abrirSite();
  }
  // rótulos das tabelas no celular
  const rotulos = new MutationObserver(() => {
    for (const c of document.querySelectorAll('.stack td:not([data-l])')) {
      let i = 0, p = c; while ((p = p.previousElementSibling)) i += p.colSpan;
      const t = c.closest('table'); c.dataset.l = (t.tHead && t.tHead.rows[0].cells[i] ? t.tHead.rows[0].cells[i].textContent : '');
    }
  });
  rotulos.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('hashchange', rota);
  rota();
}
