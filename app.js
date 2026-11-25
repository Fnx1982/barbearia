// =====================================================================
//  app.js — site do cliente, área do barbeiro (#barbeiro) e painel (#admin)   versão 4
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

  function modal({ titulo, corpo, botao = 'Salvar', perigo = false, largo = false, fechar: rotuloFechar = 'Cancelar', aoEnviar, aoAbrir }) {
    const el = document.createElement('div');
    el.className = 'modal-fundo';
    el.innerHTML = `<form class="modal${largo ? ' largo' : ''}" novalidate role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <header><h3>${esc(titulo)}</h3><button type="button" class="x" data-fechar aria-label="Fechar">×</button></header>
      <div class="modal-corpo">${corpo}</div>
      <footer><button type="button" class="btn btn-sec" data-fechar>${esc(rotuloFechar)}</button>${botao ? `<button class="btn${perigo ? ' btn-perigo' : ''}" type="submit">${esc(botao)}</button>` : ''}</footer></form>`;
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
      catch (err) { toast(err.message, 'erro'); if (err.auth) { fechar(); rota(); } }
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
      <span class="rodape-links"><a href="#barbeiro">Área do barbeiro</a><a href="#admin">Administrador</a></span>
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


  // ===================================================== COMUM PAINÉIS
  const fmtMes = mes => { const [y, m] = mes.split('-').map(Number); const n = MESES[m - 1]; return `${n[0].toUpperCase() + n.slice(1)} de ${y}`; };
  const inicioSemana = iso => U.addDias(iso, -((U.diaSemana(iso) + 6) % 7));
  const fmtCurta = iso => { const d = new Date(iso.slice(0, 10) + 'T12:00:00Z'); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
  const ehHoje = iso => iso === U.hojeISO();
  const ESTADOS = { confirmado: 'Agendado', concluido: 'Finalizado', faltou: 'Faltou', cancelado: 'Cancelado' };
  const ORIGENS = { site: 'Site', balcao: 'Balcão / telefone', barbeiro: 'Pelo barbeiro' };
  const TIPOS_MOV = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', venda: 'Venda (comanda)', estorno: 'Devolução' };
  const fmtForma = f => U.FORMAS[f] || (f ? f[0].toUpperCase() + f.slice(1) : '—');

  function chip(a) {
    if (a.status === 'concluido') return a.conferido ? '<span class="chip ok">Conferido</span>' : '<span class="chip warn">A conferir</span>';
    return `<span class="chip st-${a.status}">${ESTADOS[a.status]}</span>`;
  }
  function linhaPag(a, b) {
    if (a.status !== 'concluido') return '';
    const p = U.pagDe(a, b);
    const det = p.valorItens ? ` <small>(serviço ${U.dinheiro(p.valorServico)} + comanda ${U.dinheiro(p.valorItens)})</small>` : (p.valor !== a.total ? ` <small>(tabela ${U.dinheiro(a.total)})</small>` : '');
    return `<span class="pag-linha">${p.semRegistro ? 'Sem registro de pagamento' : esc(fmtForma(p.forma))} · <b>${U.dinheiro(p.valor)}</b>${det}${p.obs ? ` · ${esc(p.obs)}` : ''}</span>`;
  }
  function linhaComanda(a) {
    const it = a.itens || [];
    return it.length ? `<span class="comanda-linha">Comanda: ${it.map(i => `${i.qtd > 1 ? i.qtd + '× ' : ''}${esc(i.nome)}`).join(', ')} · ${U.dinheiro(U.totalItens(a))}</span>` : '';
  }
  function barrasHTML(l, fmt = U.dinheiro) {
    const mx = Math.max(1, ...l.map(x => x.v));
    return l.length ? `<ul class="barras">${l.map(x => `<li><span>${esc(x.n)}</span><div><i style="width:${(x.v / mx * 100).toFixed(1)}%"></i></div><b>${fmt(x.v)}</b><small>${x.q != null ? x.q + '×' : ''}</small></li>`).join('')}</ul>` : '<p class="vazio">Sem dados no período.</p>';
  }
  function navMes(id, mes) {
    return `<div class="nav-data" id="${id}"><button class="btn btn-sec btn-ic" data-m="-1" type="button" aria-label="Mês anterior">‹</button><strong class="nav-rotulo">${fmtMes(mes)}</strong><button class="btn btn-sec btn-ic" data-m="1" type="button" aria-label="Próximo mês">›</button></div>`;
  }
  function navPeriodo(id, P) {
    return `<div class="periodo" id="${id}"><button class="btn btn-sec btn-ic" data-pm="-1" type="button" aria-label="Mês anterior">‹</button>
      <label>De<input type="date" data-p="de" value="${P.de}"></label><label>Até<input type="date" data-p="ate" value="${P.ate}"></label>
      <button class="btn btn-sec btn-ic" data-pm="1" type="button" aria-label="Próximo mês">›</button></div>`;
  }
  function ligarPeriodo(id, P, depois) {
    const el = $('#' + id); if (!el) return;
    el.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { const mes = U.addMes(P.de.slice(0, 7), Number(b.dataset.pm)); [P.de, P.ate] = U.limitesMes(mes); depois(); });
    el.querySelectorAll('[data-p]').forEach(i => i.onchange = () => { if (!i.value) return; P[i.dataset.p] = i.value; if (P.ate < P.de) P[i.dataset.p === 'de' ? 'ate' : 'de'] = i.value; depois(); });
  }
  const periodoMes = () => { const [de, ate] = U.limitesMes(U.hojeISO().slice(0, 7)); return { de, ate }; };
  function imprimir() { try { window.print(); } catch (e) { toast('Use Ctrl+P para imprimir ou salvar em PDF.'); } }
  function menuMais(botoes) { return botoes.length ? `<details class="mais"><summary class="btn btn-sec btn-sm">Mais</summary><div class="mais-menu">${botoes.join('')}</div></details>` : ''; }
  document.addEventListener('click', e => { $$('details.mais[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }); });

  async function comprimir(file) {
    if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size > 900 * 1024) {
      const url = await lerImagem(file, 1800); const blob = await (await fetch(url)).blob();
      return new File([blob], file.name.replace(/\.\w+$/, '') + (blob.type === 'image/webp' ? '.webp' : '.png'), { type: blob.type });
    }
    return file;
  }
  // lista de arquivos com ver / anexar / excluir
  function painelAnexos(box, o) {
    let lista = o.lista || [];
    const desenhar = () => {
      box.innerHTML = `${lista.length ? `<ul class="anexos">${lista.map(x => `<li><span class="an-ic">${x.tipo === 'application/pdf' ? 'PDF' : 'IMG'}</span><span class="an-nome">${esc(x.nome)}<small>${U.tamanho(x.tamanho)}</small></span>
          <button type="button" class="btn btn-sec btn-sm" data-ver="${esc(x.id)}">Ver</button>${o.editavel ? `<button type="button" class="btn btn-sec btn-sm perigo" data-exc="${esc(x.id)}">Excluir</button>` : ''}</li>`).join('')}</ul>`
        : `<p class="ajuda">${o.vazio || 'Nenhum arquivo anexado.'}</p>`}
        ${o.editavel ? `<label class="btn btn-sec btn-sm anexar">+ Anexar comprovante<input type="file" accept="image/*,application/pdf" hidden></label><p class="ajuda">Foto ou PDF, até 8 MB.</p>` : ''}<div class="visor"></div>`;
    };
    desenhar();
    box.addEventListener('change', async e => {
      if (e.target.type !== 'file') return;
      let f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const lb = box.querySelector('.anexar'); if (lb) { lb.classList.add('ocupado'); lb.firstChild.textContent = 'Enviando…'; }
      try { f = await comprimir(f); const r = await o.anexar(f); lista = r.anexos || []; desenhar(); toast('Arquivo anexado.'); if (o.mudou) o.mudou(r); }
      catch (err) { desenhar(); toast(err.message, 'erro'); }
    });
    box.addEventListener('click', async e => {
      const v = e.target.closest('[data-ver]'), x = e.target.closest('[data-exc]'), visor = box.querySelector('.visor');
      if (v) {
        visor.innerHTML = '<p class="carregando">Abrindo…</p>';
        try {
          const an = lista.find(z => z.id === v.dataset.ver), blob = await o.abrir(an.id), url = URL.createObjectURL(blob);
          visor.innerHTML = (blob.type.startsWith('image/') ? `<img src="${url}" alt="${esc(an.nome)}">` : blob.type === 'application/pdf' ? `<iframe src="${url}" title="${esc(an.nome)}"></iframe>` : '')
            + `<a class="link" href="${url}" download="${esc(an.nome)}" target="_blank" rel="noopener">Baixar ${esc(an.nome)}</a>`;
        } catch (err) { visor.innerHTML = ''; toast(err.message, 'erro'); }
      }
      if (x && await confirmar('Excluir este arquivo?')) {
        try { const r = await o.excluir(x.dataset.exc); lista = r.anexos || []; desenhar(); if (o.mudou) o.mudou(r); } catch (err) { toast(err.message, 'erro'); }
      }
    });
  }
  function modalArquivos(titulo, o, depois) {
    let mudou = false;
    const m = modal({ titulo, corpo: '<div id="pa"></div>', botao: '', fechar: 'Fechar', aoAbrir(f) { painelAnexos($('#pa', f), { ...o, mudou: () => { mudou = true; } }); } });
    const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); if (mudou && depois) depois(); } });
    obs.observe(modalRoot, { childList: true });
  }

  function modalFinalizar(a, enviar, aoTerminar) {
    const atual = a.pagamento || {};
    const vi = U.totalItens(a);
    const vs0 = atual.valorServico !== undefined ? atual.valorServico : atual.valor !== undefined ? atual.valor : a.total;
    modal({
      titulo: 'Finalizar atendimento', botao: 'Finalizar',
      corpo: `<p class="mf-resumo"><b>${esc(a.clienteNome)}</b><br>${esc(a.servicosNome)} · ${fmtData(a.data)} às ${U.toHora(a.inicio)}</p>
        <fieldset class="formas"><legend>Forma de pagamento</legend>${Object.entries(U.FORMAS).map(([k, n], i) => `<label class="pill"><input type="radio" name="forma" value="${k}"${(atual.forma ? atual.forma === k : i === 0) ? ' checked' : ''}><span>${n}</span></label>`).join('')}</fieldset>
        <div class="campos">
          <label>Valor do serviço (R$)<input name="valor" type="number" step="0.01" min="0" inputmode="decimal" value="${vs0}"></label>
          <label>Observação <i>(opcional)</i><input name="obs" maxlength="200" value="${esc(atual.obs || '')}" placeholder="Ex.: desconto de aniversário"></label>
        </div>
        ${vi ? `<p class="mf-comanda">Comanda: ${(a.itens || []).map(i => `${i.qtd}× ${esc(i.nome)}`).join(', ')} = <b>${U.dinheiro(vi)}</b></p>` : ''}
        <p class="mf-total">Total a receber: <b id="mf-tot">${U.dinheiro(Number(vs0) + vi)}</b></p>
        <p class="ajuda">Tabela do serviço: ${U.dinheiro(a.total)}. Ajuste se teve desconto ou serviço extra.${vi ? ' Itens da comanda entram automaticamente.' : ''}</p>`,
      aoAbrir(f) { f.valor.oninput = () => { $('#mf-tot', f).textContent = U.dinheiro((Number(f.valor.value) || 0) + vi); }; },
      async aoEnviar(f) {
        const forma = (f.querySelector('input[name=forma]:checked') || {}).value;
        if (!forma) throw new Error('Escolha a forma de pagamento.');
        if (f.valor.value === '' || Number(f.valor.value) < 0) throw new Error('Informe o valor do serviço.');
        await enviar({ forma, valorServico: Number(f.valor.value), obs: f.obs.value.trim() });
        toast('Atendimento finalizado.');
        if (aoTerminar) aoTerminar();
      },
    });
  }

  // comanda: itens extras (bebidas, produtos) do cliente
  function modalComanda(a0, o, depois) {
    let a = a0, mudou = false;
    const prods = (o.produtos || []).filter(p => p.ativo !== false && (o.admin || p.categoria !== 'insumo'));
    const html = () => {
      const it = a.itens || [];
      return `<p class="mf-resumo"><b>${esc(a.clienteNome)}</b> · ${esc(a.servicosNome)} · ${fmtData(a.data)} ${U.toHora(a.inicio)}</p>
        ${it.length ? `<ul class="comanda">${it.map(i => `<li><span><b>${i.qtd}×</b> ${esc(i.nome)}</span><span class="num">${U.dinheiro(i.preco * i.qtd)}</span><button type="button" class="btn btn-sec btn-sm perigo" data-rem="${esc(i.id)}">Remover</button></li>`).join('')}
          <li class="comanda-tot"><span>Total da comanda</span><b class="num">${U.dinheiro(U.totalItens(a))}</b><span></span></li></ul>` : '<p class="vazio">Comanda vazia.</p>'}
        ${prods.length ? `<div class="comanda-add"><label>Adicionar<select id="c-prod">${Object.entries(U.CATEGORIAS_PRODUTO).map(([k, n]) => { const l = prods.filter(p => (p.categoria || 'outro') === k); return l.length ? `<optgroup label="${n}">${l.map(p => `<option value="${esc(p.id)}">${esc(p.nome)} — ${U.dinheiro(p.preco)}${o.admin && p.controlaEstoque ? ` (estoque ${p.estoque})` : ''}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></label>
          <label>Qtd.<input id="c-qtd" type="number" min="1" max="99" value="1" inputmode="numeric"></label><button type="button" class="btn" id="c-add">Adicionar</button></div>`
          : `<p class="ajuda">Nenhum produto cadastrado.${o.admin ? ' Cadastre na aba Estoque.' : ' Peça para a gerência cadastrar.'}</p>`}
        ${a.status === 'concluido' ? '<p class="ajuda">Atendimento já finalizado: o total e a comissão são recalculados quando a comanda muda.</p>' : ''}`;
    };
    const m = modal({
      titulo: 'Comanda', botao: '', fechar: 'Fechar', corpo: '<div id="cmd"></div>',
      aoAbrir(f) {
        const box = $('#cmd', f); box.innerHTML = html();
        box.addEventListener('click', async e => {
          const add = e.target.closest('#c-add'), rem = e.target.closest('[data-rem]');
          try {
            if (add) { add.disabled = true; a = await o.add(a.id, { produtoId: $('#c-prod', box).value, qtd: Number($('#c-qtd', box).value) || 1 }); mudou = true; box.innerHTML = html(); toast('Item adicionado.'); }
            if (rem) { rem.disabled = true; a = await o.rem(a.id, rem.dataset.rem); mudou = true; box.innerHTML = html(); toast('Item removido.'); }
          } catch (err) { toast(err.message, 'erro'); if (err.auth) { m.fechar(); rota(); } box.innerHTML = html(); }
        });
      },
    });
    const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); if (mudou) depois(); } });
    obs.observe(modalRoot, { childList: true });
  }

  // novo agendamento (admin escolhe o barbeiro; barbeiro marca para si)
  function modalNovoAgendamento({ barbeiros, servicos, config, dataInicial, criar, depois }) {
    const bs = barbeiros.filter(b => b.ativo), ss = servicos.filter(s => s.ativo);
    if (!bs.length || !ss.length) return toast('Cadastre ao menos um barbeiro e um serviço ativos.', 'erro');
    const corpo = `<div class="campos">
        <label>Nome do cliente<input name="nome" maxlength="80" required autocomplete="off"></label>
        <label>Telefone / WhatsApp<input name="tel" type="tel" inputmode="tel" placeholder="(00) 00000-0000" required></label>
      </div>
      <h4>Serviços</h4><div class="checks">${ss.filter(s => bs.some(b => U.fazServicos(b, [s.id]))).map(s => `<label class="check"><input type="checkbox" name="serv" value="${esc(s.id)}"> ${esc(s.nome)} <small>${s.duracao} min · ${U.dinheiro(s.preco)}</small></label>`).join('')}</div>
      <div class="campos">
        ${bs.length > 1 ? `<label>Barbeiro<select name="barb">${bs.map(b => `<option value="${esc(b.id)}">${esc(b.nome)}</option>`).join('')}</select></label>` : `<input type="hidden" name="barb" value="${esc(bs[0].id)}">`}
        <label>Data<input type="date" name="data" value="${dataInicial < U.hojeISO() ? U.hojeISO() : dataInicial}" min="${U.hojeISO()}"></label>
        <label>Horário<select name="ini" required><option value="">Escolha os serviços</option></select></label>
        <label>Observação<input name="obs" maxlength="300"></label>
      </div>`;
    modal({
      titulo: 'Novo agendamento', corpo, botao: 'Agendar', largo: true,
      aoAbrir(f) {
        const atualizar = async () => {
          const ids = $$('input[name=serv]:checked', f).map(i => i.value);
          const dur = ss.filter(s => ids.includes(s.id)).reduce((t, s) => t + s.duracao, 0);
          const b = bs.find(x => x.id === f.barb.value);
          if (!dur) { f.ini.innerHTML = '<option value="">Escolha os serviços</option>'; return; }
          if (!U.fazServicos(b, ids)) { f.ini.innerHTML = '<option value="">Esse barbeiro não faz todos esses serviços</option>'; return; }
          f.ini.innerHTML = '<option value="">Carregando…</option>';
          let oc; try { oc = await Api.ocupados(f.data.value); } catch (e) { toast(e.message, 'erro'); return; }
          const sl = horariosLivres({ barbeiro: b, data: f.data.value, duracao: dur, ocupados: oc.ocupados, bloqueios: oc.bloqueios, config, hoje: U.hojeISO(), agoraMin: U.agoraMin(), ignorarAntecedencia: true });
          f.ini.innerHTML = sl.length ? sl.map(t => `<option value="${t}">${U.toHora(t)} – ${U.toHora(t + dur)}</option>`).join('') : '<option value="">Sem horário livre neste dia</option>';
        };
        f.addEventListener('change', e => { if (['serv', 'barb', 'data'].includes(e.target.name)) atualizar(); });
        f.tel.addEventListener('input', () => { f.tel.value = U.fone(f.tel.value); });
      },
      async aoEnviar(f) {
        if (!f.ini.value) throw new Error('Escolha um horário livre.');
        const r = await criar({
          clienteNome: f.nome.value, clienteTelefone: U.soDigitos(f.tel.value), servicoIds: $$('input[name=serv]:checked', f).map(i => i.value),
          barbeiroId: f.barb.value, data: f.data.value, inicio: Number(f.ini.value), obs: f.obs.value,
        });
        toast('Agendamento criado.'); depois(r);
      },
    });
  }

  // fechar agenda (admin escolhe quem; barbeiro fecha só a dele)
  function modalFechar({ b, barbeiros, salvar, depois }) {
    modal({
      titulo: 'Fechar agenda', botao: 'Fechar agenda',
      corpo: `<div class="campos">
        ${barbeiros ? `<label class="full">Quem<select name="barb"><option value="">Barbearia inteira</option>${barbeiros.map(x => `<option value="${esc(x.id)}"${b.barbeiroId === x.id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>` : ''}
        <label>De<input type="date" name="data" value="${b.data}" min="${barbeiros ? '' : U.hojeISO()}" required></label>
        <label>Até<input type="date" name="dataFim" value="${b.dataFim || b.data}"></label>
        <label class="check full"><input type="checkbox" name="dia"${b.diaInteiro ? ' checked' : ''}> Dia inteiro</label>
        <label class="so-hora">Das<input type="time" name="ini" value="${b.inicio || '12:00'}"></label>
        <label class="so-hora">Até<input type="time" name="fim" value="${b.fim || '14:00'}"></label>
        <label class="full">Motivo <i>(opcional)</i><input name="motivo" maxlength="80" placeholder="Ex.: folga, médico, curso"></label></div>
        <p class="ajuda">O período some do site na hora. Agendamentos já marcados nesse período não são cancelados sozinhos.</p>`,
      aoAbrir(f) { const t = () => $$('.so-hora', f).forEach(l => (l.hidden = f.dia.checked)); f.dia.onchange = t; t(); },
      async aoEnviar(f) {
        const r = await salvar({ barbeiroId: f.barb ? f.barb.value : '', data: f.data.value, dataFim: f.dataFim.value || f.data.value, diaInteiro: f.dia.checked, inicio: f.ini.value, fim: f.fim.value, motivo: f.motivo.value.trim() });
        toast(r.conflitos ? `Agenda fechada. Atenção: ${r.conflitos} agendamento(s) já marcados nesse período — avise ou cancele.` : 'Agenda fechada.', r.conflitos ? 'erro' : '');
        depois();
      },
    });
  }

  function htmlExtrato(r, ags, pags, quem) {
    const eu = quem === 'barbeiro';
    if (!r) return '<p class="vazio">Sem movimento neste mês.</p>';
    const conc = ags.filter(a => a.status === 'concluido');
    return `<div class="kpis kpis-6">
        <div><span>Atendimentos</span><b>${r.atendimentos}</b></div>
        <div><span>Produzido</span><b>${U.dinheiro(r.produzido)}</b></div>
        <div><span>Comissão${r.comissaoPct != null ? ' (' + r.comissaoPct + '%)' : ''}</span><b>${U.dinheiro(r.comissao)}</b></div>
        <div><span>${eu ? 'Recebido no mês' : 'Pago no mês'}</span><b>${U.dinheiro(r.pago)}</b></div>
        <div><span>Saldo de meses anteriores</span><b>${U.dinheiro(r.anterior)}</b></div>
        <div class="destaque"><span>${r.aPagar >= 0 ? (eu ? 'A receber' : 'A pagar') : (eu ? 'Recebido a mais' : 'Pago a mais')}</span><b>${U.dinheiro(Math.abs(r.aPagar))}</b></div>
      </div>
      <section class="bloco"><h3>${eu ? 'Pagamentos recebidos' : 'Pagamentos e vales'}</h3>
        ${pags.length ? `<table class="tabela stack"><thead><tr><th>Data</th><th>Tipo</th><th>Forma</th><th class="num">Valor</th><th>Obs.</th><th>Comprovante</th></tr></thead><tbody>
        ${pags.map(p => `<tr><td>${fmtCurta(p.data)}</td><td>${p.tipo === 'vale' ? 'Vale / adiantamento' : 'Pagamento'}</td><td>${esc(fmtForma(p.forma))}</td><td class="num">${U.dinheiro(p.valor)}</td><td>${esc(p.obs || '—')}</td>
          <td>${(p.anexos || []).length ? `<button type="button" class="link" data-comp="${esc(p.id)}">Ver (${p.anexos.length})</button>` : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="vazio">Nenhum pagamento neste mês.</p>'}
      </section>
      <section class="bloco"><h3>Atendimentos finalizados</h3>
        ${conc.length ? `<table class="tabela stack"><thead><tr><th>Data</th><th>Cliente</th><th>Serviço / comanda</th><th>Pagamento</th><th class="num">Valor</th><th class="num">Comissão</th><th>Conferido</th></tr></thead><tbody>
        ${conc.map(a => { const p = U.pagDe(a); return `<tr><td>${fmtCurta(a.data)} ${U.toHora(a.inicio)}</td><td>${esc(a.clienteNome)}</td><td>${esc(a.servicosNome)}${(a.itens || []).length ? `<br><small>+ ${a.itens.map(i => i.qtd + '× ' + esc(i.nome)).join(', ')}</small>` : ''}</td><td>${p.semRegistro ? '—' : esc(fmtForma(p.forma))}</td><td class="num">${U.dinheiro(p.valor)}</td><td class="num">${U.dinheiro(p.comissaoValor)}</td><td>${a.conferido ? 'Sim' : 'Não'}</td></tr>`; }).join('')}</tbody></table>` : '<p class="vazio">Nenhum atendimento finalizado neste mês.</p>'}
      </section>`;
  }
  function ligarComprovantes(box, pags, abrir) {
    box.addEventListener('click', e => {
      const c = e.target.closest('[data-comp]'); if (!c) return;
      const p = pags.find(x => x.id === c.dataset.comp);
      modalArquivos(`Comprovante — ${fmtCurta(p.data)} · ${U.dinheiro(p.valor)}`, { lista: p.anexos, abrir: an => abrir(p.id, an), editavel: false });
    });
  }

  // ------------------------------------------------ app (instalação)
  let promptInstalar = null;
  const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalado = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; $$('.btn-instalar').forEach(b => (b.hidden = false)); });
  window.addEventListener('appinstalled', () => { promptInstalar = null; $$('.btn-instalar').forEach(b => (b.hidden = true)); toast('App instalado.'); });
  function btnInstalar(cls = 'btn btn-sec btn-sm') { return instalado() ? '' : `<button class="${cls} btn-instalar" type="button"${promptInstalar || ehIOS ? '' : ' hidden'}>Instalar app</button>`; }
  document.addEventListener('click', async e => {
    if (!e.target.closest('.btn-instalar')) return;
    if (promptInstalar) { promptInstalar.prompt(); try { await promptInstalar.userChoice; } catch (er) { /* */ } promptInstalar = null; $$('.btn-instalar').forEach(b => (b.hidden = true)); return; }
    modal({ titulo: 'Instalar no iPhone / iPad', botao: '', fechar: 'Entendi', corpo: '<ol class="passos"><li>Abra este site no <b>Safari</b>.</li><li>Toque em <b>Compartilhar</b> (quadrado com seta para cima).</li><li>Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.</li></ol>' });
  });
  function trocarManifesto(area) {
    const l = $('link[rel=manifest]'), t = $('meta[name=apple-mobile-web-app-title]');
    if (l) l.href = { admin: 'manifest-admin.webmanifest', barbeiro: 'manifest-barbeiro.webmanifest' }[area] || 'manifest.webmanifest';
    if (t) t.content = { admin: 'Painel', barbeiro: 'Minha agenda' }[area] || 'Agendar';
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !Api.demo) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  // =================================================== ÁREA DO BARBEIRO
  const BB = { aba: 'dia', data: U.hojeISO(), sem: inicioSemana(U.hojeISO()), mes: U.hojeISO().slice(0, 7), me: null, cfg: null, servicos: [], produtos: [] };
  const ABAS_B = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['folgas', 'Folgas'], ['ganhos', 'Meus ganhos']];

  async function loginBarbeiro() {
    app.innerHTML = '<p class="carregando">Carregando…</p>';
    let pub = { config: {} };
    try { pub = await Api.publico(); } catch (e) { /* segue com a tela simples */ }
    aplicarMarca(pub.config, true); document.title = 'Área do barbeiro · Entrar';
    app.innerHTML = `<div class="login"><form class="card login-card" id="login" novalidate>
      <div class="login-marca">${logoHTML(pub.config)}</div>
      <h1>Área do barbeiro</h1>
      <label>Usuário<input name="usuario" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="30" required></label>
      <label>Senha<input type="password" name="senha" autocomplete="current-password" maxlength="100" required></label>
      <label class="check"><input type="checkbox" name="lembrar"> Manter conectado por 7 dias <small>(só no seu celular)</small></label>
      <button class="btn btn-g" type="submit">Entrar</button>
      ${Api.demo ? '<p class="ajuda">Demonstração: usuário <b>rafael</b> ou <b>lucas</b>, senha <b>barba1</b>.</p>' : '<p class="ajuda">Esqueceu a senha ou foi bloqueado? Fale com a gerência.</p>'}
      <a class="link" href="#inicio">← Voltar ao site</a></form></div>`;
    const f = $('#login'); f.usuario.focus();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (!f.usuario.value.trim() || !f.senha.value) return toast('Informe usuário e senha.', 'erro');
      const b = f.querySelector('button'); b.disabled = true;
      try { await Api.login({ papel: 'barb', usuario: f.usuario.value, senha: f.senha.value, lembrar: f.lembrar.checked }); abrirBarbeiro(); }
      catch (err) { toast(err.message, 'erro'); f.senha.select(); }
      b.disabled = false;
    });
  }

  async function abrirBarbeiro() {
    if (!Api.sessao('barb')) return loginBarbeiro();
    app.innerHTML = '<p class="carregando">Carregando…</p>';
    try { const r = await Api.barb.inicio(); BB.me = r.barbeiro; BB.cfg = r.config; BB.servicos = r.servicos; BB.produtos = r.produtos || []; }
    catch (e) { if (e.auth) return loginBarbeiro(); app.innerHTML = `<div class="erro-geral"><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`; return; }
    aplicarMarca(BB.cfg, true); document.title = BB.me.nome + ' · Agenda';
    app.innerHTML = `<div class="adm"><header class="adm-topo"><div class="wrap topo-in">
        <span class="marca">${avatar(BB.me)}<span>${esc(BB.me.nome)}</span></span>
        <div class="adm-acoes">${btnInstalar()}<button class="btn btn-sec btn-sm" id="sair" type="button">Sair</button></div></div>
        <nav class="wrap abas scroll" id="abas" aria-label="Seções">${ABAS_B.map(([k, n]) => `<button type="button" data-aba="${k}">${n}</button>`).join('')}</nav></header>
      ${Api.demo ? '<p class="faixa-demo">Modo demonstração — os dados ficam só neste navegador.</p>' : ''}
      <main class="wrap adm-main" id="adm-main"></main></div>`;
    $('#sair').onclick = () => { Api.sair('barb'); loginBarbeiro(); };
    $('#abas').onclick = e => { const b = e.target.closest('[data-aba]'); if (b) { BB.aba = b.dataset.aba; abaBarb(); } };
    abaBarb();
  }
  async function seguroB(fn) { try { await fn(); } catch (e) { if (e.auth) return loginBarbeiro(); toast(e.message, 'erro'); } }

  function abaBarb() {
    $$('#abas [data-aba]').forEach(b => b.setAttribute('aria-current', b.dataset.aba === BB.aba ? 'page' : 'false'));
    const m = $('#adm-main'); m.onclick = null;
    ({ dia: bDia, semana: bSemana, mes: bMes, folgas: bFolgas, ganhos: bGanhos })[BB.aba]();
  }

  function itemBarb(a) {
    const msg = `Olá, ${a.clienteNome.split(' ')[0]}! Aqui é o ${BB.me.nome}, da ${BB.cfg.nome}. `;
    const id = esc(a.id), b = [], mais = [];
    if (a.status === 'confirmado') {
      b.push(`<button class="btn btn-sm" data-ac="fin" data-id="${id}" type="button">Finalizar</button>`, `<button class="btn btn-sec btn-sm" data-ac="cmd" data-id="${id}" type="button">Comanda</button>`);
      mais.push(`<button type="button" data-ac="faltou" data-id="${id}">Cliente faltou</button>`, `<button type="button" data-ac="cancelar" data-id="${id}">Cancelar horário</button>`, `<button type="button" class="perigo" data-ac="excluir" data-id="${id}">Excluir</button>`);
    } else if (a.status === 'concluido' && !a.conferido) {
      b.push(`<button class="btn btn-sec btn-sm" data-ac="cmd" data-id="${id}" type="button">Comanda</button>`, `<button class="btn btn-sec btn-sm" data-ac="fin" data-id="${id}" type="button">Corrigir pagamento</button>`);
      mais.push(`<button type="button" data-ac="reabrir" data-id="${id}">Desfazer finalização</button>`);
    } else if (a.status === 'faltou' || a.status === 'cancelado') {
      b.push(`<button class="btn btn-sec btn-sm" data-ac="reabrir" data-id="${id}" type="button">Reabrir</button>`, `<button class="btn btn-sec btn-sm perigo" data-ac="excluir" data-id="${id}" type="button">Excluir</button>`);
    }
    return `<li class="ag st-${a.status}">
      <time>${U.toHora(a.inicio)}<small>${U.toHora(a.fim)}</small></time>
      <div class="ag-info"><strong>${esc(a.clienteNome)} ${chip(a)}</strong>
        <span>${esc(a.servicosNome)} · ${U.dinheiro(a.total)}</span>
        <a class="tel" href="${esc(waLink(a.clienteTelefone, msg))}" target="_blank" rel="noopener">${esc(U.fone(a.clienteTelefone))} · WhatsApp</a>
        ${a.obs ? `<em>“${esc(a.obs)}”</em>` : ''}${linhaComanda(a)}${linhaPag(a, BB.me)}</div>
      ${b.length || mais.length ? `<div class="ag-acoes">${b.join('')}${menuMais(mais)}</div>` : ''}</li>`;
  }
  function ligarItensBarb(box, lista, recarregar) {
    box.onclick = e => {
      const el = e.target.closest('[data-ac]'); if (!el) return;
      const a = lista.find(x => x.id === el.dataset.id); if (!a) return;
      const det = el.closest('details'); if (det) det.open = false;
      const ac = el.dataset.ac;
      if (ac === 'fin') return modalFinalizar(a, d => Api.barb.finalizar(a.id, d), recarregar);
      if (ac === 'cmd') return modalComanda(a, { produtos: BB.produtos, add: Api.barb.addItem, rem: Api.barb.remItem }, recarregar);
      const conf = {
        faltou: [`Marcar que ${a.clienteNome} faltou?`, 'Marcar falta', () => Api.barb.status(a.id, 'faltou')],
        cancelar: [`Cancelar o horário de ${a.clienteNome}? O horário volta a ficar livre no site.`, 'Cancelar horário', () => Api.barb.status(a.id, 'cancelado')],
        reabrir: [a.status === 'concluido' ? 'Desfazer a finalização? O pagamento registrado será apagado.' : 'Reabrir este agendamento?', 'Reabrir', () => Api.barb.status(a.id, 'confirmado')],
        excluir: [`Excluir o agendamento de ${a.clienteNome}? Ele some da agenda e do histórico. Para só liberar o horário, use "Cancelar".`, 'Excluir', () => Api.barb.excluir(a.id)],
      }[ac];
      if (conf) confirmar(conf[0], conf[1], ac === 'excluir').then(ok => ok && seguroB(async () => { await conf[2](); toast('Feito.'); recarregar(); }));
    };
  }
  function novoAgBarb(depois) {
    modalNovoAgendamento({ barbeiros: [BB.me], servicos: BB.servicos, config: BB.cfg, dataInicial: BB.data, criar: d => Api.barb.criar(d), depois: r => { BB.data = r.data; BB.aba = 'dia'; abaBarb(); } });
  }
  function fecharBarb(data, depois) {
    modalFechar({ b: { data, dataFim: data, diaInteiro: true }, salvar: d => Api.barb.salvarBloqueio(d), depois });
  }

  function bDia() {
    const m = $('#adm-main');
    m.innerHTML = `<div class="barra"><div class="nav-data" id="nav-d"><button class="btn btn-sec btn-ic" data-d="-1" type="button" aria-label="Dia anterior">‹</button>
      <input type="date" id="d-data" value="${BB.data}" aria-label="Data"><button class="btn btn-sec btn-ic" data-d="1" type="button" aria-label="Próximo dia">›</button>
      <button class="btn btn-sec btn-sm" data-d="0" type="button">Hoje</button></div>
      <div class="barra-acoes"><button class="btn btn-sec" id="b-fechar" type="button">Fechar agenda</button><button class="btn" id="b-novo" type="button">+ Agendamento</button></div></div>
      <h2 class="titulo-data">${fmtDataLonga(BB.data)}${ehHoje(BB.data) ? ' <small>hoje</small>' : ''}</h2><div id="d-cont"><p class="carregando">Carregando…</p></div>`;
    $$('#nav-d [data-d]').forEach(b => b.onclick = () => { const n = Number(b.dataset.d); BB.data = n ? U.addDias(BB.data, n) : U.hojeISO(); bDia(); });
    $('#d-data').onchange = e => { if (e.target.value) { BB.data = e.target.value; bDia(); } };
    $('#b-novo').onclick = () => novoAgBarb();
    $('#b-fechar').onclick = () => fecharBarb(BB.data < U.hojeISO() ? U.hojeISO() : BB.data, bDia);
    seguroB(async () => {
      const [ags, bls] = await Promise.all([Api.barb.agendamentos(BB.data, BB.data), Api.barb.bloqueios()]);
      const conc = ags.filter(a => a.status === 'concluido'), pg = conc.map(a => U.pagDe(a, BB.me));
      const h = (BB.me.horarios || [])[U.diaSemana(BB.data)];
      const blDia = bls.filter(b => b.data <= BB.data && b.dataFim >= BB.data);
      const box = $('#d-cont'); if (!box) return;
      box.innerHTML = `<div class="kpis">
          <div><span>Na agenda</span><b>${ags.filter(a => a.status !== 'cancelado').length}</b></div>
          <div><span>Finalizados</span><b>${conc.length}</b></div>
          <div><span>Produzido</span><b>${U.dinheiro(U.soma(pg.map(p => p.valor)))}</b></div>
          <div><span>Minha comissão</span><b>${U.dinheiro(U.soma(pg.map(p => p.comissaoValor)))}</b></div></div>
        ${blDia.map(b => `<div class="aviso"><b>${b.barbeiroId ? 'Sua agenda' : 'Barbearia'}</b> — ${b.diaInteiro ? 'fechada o dia todo' : `fechada das ${b.inicio} às ${b.fim}`}${b.motivo ? ' · ' + esc(b.motivo) : ''}</div>`).join('')}
        <p class="ajuda">${h && h.aberto ? `Expediente ${h.inicio}–${h.fim}${h.pausaInicio ? ` · pausa ${h.pausaInicio}–${h.pausaFim}` : ''}` : 'Folga neste dia da semana.'}</p>
        ${ags.length ? `<ol class="ags">${ags.map(itemBarb).join('')}</ol>` : '<p class="vazio">Nenhum agendamento neste dia.</p>'}`;
      ligarItensBarb(box, ags, bDia);
    });
  }

  function bSemana() {
    const fim = U.addDias(BB.sem, 6);
    $('#adm-main').innerHTML = `<div class="barra"><div class="nav-data" id="nav-s"><button class="btn btn-sec btn-ic" data-s="-7" type="button" aria-label="Semana anterior">‹</button>
      <strong class="nav-rotulo">${fmtCurta(BB.sem)} a ${fmtCurta(fim)}</strong><button class="btn btn-sec btn-ic" data-s="7" type="button" aria-label="Próxima semana">›</button>
      <button class="btn btn-sec btn-sm" data-s="0" type="button">Esta semana</button></div><div class="barra-acoes"><button class="btn" id="b-novo" type="button">+ Agendamento</button></div></div><div id="s-cont"><p class="carregando">Carregando…</p></div>`;
    $$('#nav-s [data-s]').forEach(b => b.onclick = () => { const n = Number(b.dataset.s); BB.sem = n ? U.addDias(BB.sem, n) : inicioSemana(U.hojeISO()); bSemana(); });
    $('#b-novo').onclick = () => novoAgBarb();
    seguroB(async () => {
      const [todos, bls] = await Promise.all([Api.barb.agendamentos(BB.sem, fim), Api.barb.bloqueios()]);
      const ags = todos.filter(a => a.status !== 'cancelado');
      const box = $('#s-cont'); if (!box) return;
      const dias = [0, 1, 2, 3, 4, 5, 6].map(i => U.addDias(BB.sem, i));
      const pg = ags.filter(a => a.status === 'concluido').map(a => U.pagDe(a, BB.me));
      box.innerHTML = `<div class="kpis"><div><span>Na semana</span><b>${ags.length}</b></div><div><span>Finalizados</span><b>${pg.length}</b></div>
        <div><span>Produzido</span><b>${U.dinheiro(U.soma(pg.map(p => p.valor)))}</b></div><div><span>Minha comissão</span><b>${U.dinheiro(U.soma(pg.map(p => p.comissaoValor)))}</b></div></div>
        <div class="semana">${dias.map(d => { const l = ags.filter(a => a.data === d); const fechado = bls.some(b => b.diaInteiro && b.data <= d && b.dataFim >= d) || !(BB.me.horarios[U.diaSemana(d)] || {}).aberto; return `<section class="sem-dia${ehHoje(d) ? ' hoje' : ''}">
          <button type="button" class="sem-cab" data-ir-dia="${d}"><b>${DIAS_C[U.diaSemana(d)]} ${fmtCurta(d)}</b><span>${fechado ? 'fechado' : l.length ? l.length + ' agend.' : 'livre'}</span></button>
          ${l.length ? `<ul>${l.map(a => `<li class="st-${a.status}"><time>${U.toHora(a.inicio)}</time><span>${esc(a.clienteNome)}<small>${esc(a.servicosNome)}</small></span>${a.status !== 'confirmado' ? chip(a) : ''}</li>`).join('')}</ul>` : ''}</section>`; }).join('')}</div>`;
      box.onclick = e => { const d = e.target.closest('[data-ir-dia]'); if (d) { BB.data = d.dataset.irDia; BB.aba = 'dia'; abaBarb(); } };
    });
  }

  function htmlCalendario(mes, ags, b, bls = []) {
    const [ini, fim] = U.limitesMes(mes);
    const off = (U.diaSemana(ini) + 6) % 7, n = Number(fim.slice(8));
    let h = `<div class="cal">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => `<span class="cal-h">${d}</span>`).join('')}`;
    for (let i = 0; i < off; i++) h += '<span class="cal-v"></span>';
    for (let d = 1; d <= n; d++) {
      const iso = mes + '-' + String(d).padStart(2, '0');
      const l = ags.filter(a => a.data === iso && a.status !== 'cancelado');
      const prod = U.soma(l.filter(a => a.status === 'concluido').map(a => U.pagDe(a, b).valor));
      const fechado = bls.some(x => x.diaInteiro && x.data <= iso && x.dataFim >= iso);
      h += `<button type="button" class="cal-d${ehHoje(iso) ? ' hoje' : ''}${l.length ? ' tem' : ''}${fechado ? ' fechado' : ''}" data-ir-dia="${iso}"><b>${d}</b>${l.length ? `<span>${l.length}<i> agend.</i></span>` : fechado ? '<span>fechado</span>' : ''}${prod ? `<small>${U.dinheiro(prod)}</small>` : ''}</button>`;
    }
    return h + '</div>';
  }

  function bMes() {
    $('#adm-main').innerHTML = `<div class="barra">${navMes('nav-m', BB.mes)}</div><div id="m-cont"><p class="carregando">Carregando…</p></div>`;
    $$('#nav-m [data-m]').forEach(b => b.onclick = () => { BB.mes = U.addMes(BB.mes, Number(b.dataset.m)); bMes(); });
    seguroB(async () => {
      const [ini, fim] = U.limitesMes(BB.mes);
      const [ags, bls] = await Promise.all([Api.barb.agendamentos(ini, fim), Api.barb.bloqueios()]);
      const box = $('#m-cont'); if (!box) return;
      const pg = ags.filter(a => a.status === 'concluido').map(a => U.pagDe(a, BB.me));
      box.innerHTML = `<div class="kpis"><div><span>Agendamentos</span><b>${ags.filter(a => a.status !== 'cancelado').length}</b></div><div><span>Finalizados</span><b>${pg.length}</b></div>
        <div><span>Produzido</span><b>${U.dinheiro(U.soma(pg.map(p => p.valor)))}</b></div><div><span>Minha comissão</span><b>${U.dinheiro(U.soma(pg.map(p => p.comissaoValor)))}</b></div></div>
        ${htmlCalendario(BB.mes, ags, BB.me, bls)}<p class="ajuda">Toque em um dia para ver a agenda, finalizar atendimentos ou marcar um horário.</p>`;
      box.onclick = e => { const d = e.target.closest('[data-ir-dia]'); if (d) { BB.data = d.dataset.irDia; BB.aba = 'dia'; abaBarb(); } };
    });
  }

  function bFolgas() {
    $('#adm-main').innerHTML = `<div class="barra"><h2>Minhas folgas e horários fechados</h2><button class="btn" id="b-fechar" type="button">+ Fechar agenda</button></div>
      <p class="ajuda">Feche um dia inteiro, vários dias (férias) ou só um horário (ex.: médico das 14h às 16h). O período some do site na hora.</p><div id="f-cont"><p class="carregando">Carregando…</p></div>`;
    $('#b-fechar').onclick = () => fecharBarb(U.hojeISO(), bFolgas);
    seguroB(async () => {
      const bls = (await Api.barb.bloqueios()).filter(b => b.dataFim >= U.hojeISO());
      const box = $('#f-cont'); if (!box) return;
      box.innerHTML = bls.length ? `<table class="tabela stack"><thead><tr><th>Quando</th><th>Período</th><th>Quem fechou</th><th>Motivo</th><th></th></tr></thead><tbody>
        ${bls.map(b => `<tr><td>${fmtData(b.data)}${b.dataFim !== b.data ? ' até ' + fmtData(b.dataFim) : ''}</td><td>${b.diaInteiro ? 'Dia inteiro' : b.inicio + ' – ' + b.fim}</td><td>${b.barbeiroId ? (b.criadoPor === 'barbeiro' ? 'Você' : 'Gerência') : 'Barbearia inteira'}</td><td>${esc(b.motivo || '—')}</td>
        <td class="acoes">${b.barbeiroId ? `<button class="btn btn-sec btn-sm" data-reabrir="${esc(b.id)}" type="button">Reabrir</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : '<p class="vazio">Nenhum horário fechado daqui para frente.</p>';
      box.onclick = e => { const r = e.target.closest('[data-reabrir]'); if (r) confirmar('Reabrir esse período para agendamentos?', 'Reabrir', false).then(ok => ok && seguroB(async () => { await Api.barb.excluirBloqueio(r.dataset.reabrir); toast('Agenda reaberta.'); bFolgas(); })); };
    });
  }

  function bGanhos() {
    $('#adm-main').innerHTML = `<div class="barra">${navMes('nav-g', BB.mes)}<button class="btn btn-sec" type="button" id="imp">Imprimir / PDF</button></div>
      <h2 class="print-tit">Extrato de ${esc(BB.me.nome)} — ${fmtMes(BB.mes)}</h2><div id="g-cont"><p class="carregando">Carregando…</p></div>`;
    $$('#nav-g [data-m]').forEach(b => b.onclick = () => { BB.mes = U.addMes(BB.mes, Number(b.dataset.m)); bGanhos(); });
    $('#imp').onclick = imprimir;
    seguroB(async () => {
      const [ini, fim] = U.limitesMes(BB.mes);
      const [f, ags] = await Promise.all([Api.barb.financeiro(BB.mes), Api.barb.agendamentos(ini, fim)]);
      const box = $('#g-cont'); if (!box) return;
      box.innerHTML = htmlExtrato(f.resumo, ags, f.pagamentos, 'barbeiro') + '<p class="ajuda">“A receber” soma a comissão do mês com o saldo dos meses anteriores e desconta o que já foi pago, incluindo vales. Produtos da comanda só geram comissão quando a gerência define um percentual para o produto.</p>';
      ligarComprovantes(box, f.pagamentos, Api.barb.anexoPagamento);
    });
  }

  // ========================================================== ADMIN
  const A = { tab: 'agenda', data: U.hojeISO(), D: null, ags: [], mesFin: U.hojeISO().slice(0, 7), mesRel: U.hojeISO().slice(0, 7), relB: '',
    dp: { ...periodoMes(), cat: '', status: '', busca: '' }, est: { ...periodoMes(), prod: '', tipo: '', busca: '', cat: '', baixo: false } };
  const ABAS = [['agenda', 'Agenda'], ['financeiro', 'Financeiro'], ['despesas', 'Despesas'], ['estoque', 'Estoque'], ['relatorios', 'Relatórios'], ['barbeiros', 'Barbeiros'], ['servicos', 'Serviços'], ['folgas', 'Folgas'], ['config', 'Configurações']];

  function telaLogin() {
    app.innerHTML = `<div class="login"><form class="card login-card" id="login" novalidate>
      <div class="login-marca"><span class="logo logo-vazia">${poste()}</span></div>
      <h1>Painel da barbearia</h1>
      <label>Senha do administrador<input type="password" name="senha" autocomplete="current-password" maxlength="100" required></label>
      <button class="btn btn-g" type="submit">Entrar</button>
      ${Api.demo ? '<p class="ajuda">Demonstração: a senha é <b>admin</b>.</p>' : ''}
      <p class="ajuda">É barbeiro? <a href="#barbeiro">Entre pela área do barbeiro</a>.</p>
      <a class="link" href="#inicio">← Voltar ao site</a></form></div>`;
    document.title = 'Painel · Entrar';
    const f = $('#login'); f.senha.focus();
    f.addEventListener('submit', async e => {
      e.preventDefault(); const b = f.querySelector('button'); b.disabled = true;
      try { await Api.login({ papel: 'adm', senha: f.senha.value }); abrirAdmin(); } catch (err) { toast(err.message, 'erro'); f.senha.select(); }
      b.disabled = false;
    });
  }

  async function abrirAdmin() {
    if (!Api.sessao('adm')) return telaLogin();
    app.innerHTML = `<div class="adm"><header class="adm-topo"><div class="wrap topo-in">
        <span class="marca" id="adm-marca"></span>
        <div class="adm-acoes">${btnInstalar()}<a class="btn btn-sec btn-sm" href="#inicio">Ver site</a><button class="btn btn-sec btn-sm" id="sair" type="button">Sair</button></div></div>
        <nav class="wrap abas scroll" id="abas" aria-label="Seções do painel">${ABAS.map(([k, n]) => `<button type="button" data-aba="${k}">${n}</button>`).join('')}</nav></header>
      ${Api.demo ? '<p class="faixa-demo">Modo demonstração — os dados ficam só neste navegador.</p>' : ''}
      <main class="wrap adm-main" id="adm-main"><p class="carregando">Carregando…</p></main></div>`;
    $('#sair').onclick = () => { Api.sair('adm'); telaLogin(); };
    $('#abas').onclick = e => { const b = e.target.closest('[data-aba]'); if (b) { A.tab = b.dataset.aba; renderAba(); } };
    try { A.D = await Api.admin.dados(); }
    catch (e) { if (e.auth) return telaLogin(); $('#adm-main').innerHTML = `<p class="vazio">${esc(e.message)}</p>`; return; }
    aplicarMarca(A.D.config, true);
    $('#adm-marca').innerHTML = `${logoHTML(A.D.config)}<span>${esc(A.D.config.nome)}</span>`;
    renderAba();
  }
  async function recarregar() { A.D = await Api.admin.dados(); aplicarMarca(A.D.config, true); const mm = $('#adm-marca'); if (mm) mm.innerHTML = `${logoHTML(A.D.config)}<span>${esc(A.D.config.nome)}</span>`; }
  async function seguro(fn) { try { await fn(); } catch (e) { if (e.auth) return telaLogin(); toast(e.message, 'erro'); } }
  const barbDe = id => A.D.barbeiros.find(b => b.id === id);

  function renderAba() {
    $$('#abas [data-aba]').forEach(b => b.setAttribute('aria-current', b.dataset.aba === A.tab ? 'page' : 'false'));
    const ativa = $('#abas [aria-current=page]'); if (ativa) ativa.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('#adm-main').onclick = null; $('#adm-main').onchange = null; $('#adm-main').oninput = null;
    ({ agenda: abaAgenda, financeiro: abaFinanceiro, despesas: abaDespesas, estoque: abaEstoque, relatorios: abaRelatorios, barbeiros: abaBarbeiros, servicos: abaServicos, folgas: abaFolgas, config: abaConfig })[A.tab]();
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
      <h2 class="titulo-data">${fmtDataLonga(A.data)}${ehHoje(A.data) ? ' <small>hoje</small>' : ''}</h2>
      <div id="ag-conteudo"><p class="carregando">Carregando…</p></div>`;
    m.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const n = Number(b.dataset.d); A.data = n ? U.addDias(A.data, n) : U.hojeISO(); abaAgenda(); });
    $('#ag-data').onchange = e => { if (e.target.value) { A.data = e.target.value; abaAgenda(); } };
    $('#novo-ag').onclick = () => modalNovoAgendamento({ barbeiros: A.D.barbeiros, servicos: A.D.servicos, config: A.D.config, dataInicial: A.data, criar: d => Api.admin.balcao(d), depois: r => { A.data = r.data; A.tab = 'agenda'; renderAba(); } });
    $('#fechar-dia').onclick = () => modalFechar({ b: { data: A.data, dataFim: A.data, diaInteiro: true, barbeiroId: '' }, barbeiros: A.D.barbeiros, salvar: d => Api.admin.salvarBloqueio(d), depois: async () => { await recarregar(); renderAba(); } });
    seguro(atualizarAgenda);
  }
  async function atualizarAgenda() { A.ags = await Api.admin.agendamentos(A.data, A.data); desenharAgenda(); }

  function desenharAgenda() {
    const box = $('#ag-conteudo'); if (!box) return;
    const D = A.D, dow = U.diaSemana(A.data);
    const validos = A.ags.filter(a => a.status !== 'cancelado');
    const concl = A.ags.filter(a => a.status === 'concluido');
    const bls = D.bloqueios.filter(b => b.data <= A.data && b.dataFim >= A.data);
    const ids = new Set(D.barbeiros.filter(b => b.ativo).map(b => b.id)); A.ags.forEach(a => ids.add(a.barbeiroId));
    const cols = [...ids].map(id => barbDe(id) || { id, nome: ((A.ags.find(a => a.barbeiroId === id) || {}).barbeiroNome || '') + ' (excluído)', horarios: [] });
    const nomeB = id => id ? ((barbDe(id) || {}).nome || '—') : 'Barbearia inteira';
    box.innerHTML = `
      <div class="kpis">
        <div><span>Na agenda</span><b>${validos.length}</b></div>
        <div><span>Finalizados</span><b>${concl.length}</b></div>
        <div><span>Previsto</span><b>${U.dinheiro(U.soma(validos.filter(a => a.status !== 'faltou').map(a => a.status === 'concluido' ? U.pagDe(a, barbDe(a.barbeiroId)).valor : a.total + U.totalItens(a))))}</b></div>
        <div><span>Recebido</span><b>${U.dinheiro(U.soma(concl.map(a => U.pagDe(a, barbDe(a.barbeiroId)).valor)))}</b></div>
      </div>
      ${bls.map(b => `<div class="aviso"><b>${esc(nomeB(b.barbeiroId))}</b> — ${b.diaInteiro ? 'agenda fechada o dia todo' : `fechado das ${b.inicio} às ${b.fim}`}${b.motivo ? ' · ' + esc(b.motivo) : ''}<button class="link" data-rem-bl="${esc(b.id)}" type="button">Reabrir</button></div>`).join('')}
      ${cols.length ? `<div class="colunas">${cols.map(b => {
        const h = (b.horarios || [])[dow];
        const lista = A.ags.filter(a => a.barbeiroId === b.id).sort((x, y) => x.inicio - y.inicio);
        return `<section class="coluna"><header>${avatar(b)}<div><strong>${esc(b.nome)}</strong><span>${h && h.aberto ? `${h.inicio}–${h.fim}${h.pausaInicio ? ` · pausa ${h.pausaInicio}–${h.pausaFim}` : ''}` : 'Folga neste dia'}</span></div></header>
          ${lista.length ? `<ol class="ags">${lista.map(itemAg).join('')}</ol>` : '<p class="vazio">Nenhum agendamento.</p>'}</section>`;
      }).join('')}</div>` : '<p class="vazio">Cadastre um barbeiro na aba Barbeiros para começar.</p>'}`;
    box.onclick = e => {
      const r = e.target.closest('[data-rem-bl]');
      if (r) return seguro(async () => { await Api.admin.excluirBloqueio(r.dataset.remBl); await recarregar(); toast('Agenda reaberta.'); desenharAgenda(); });
      acaoAg(e, A.ags, () => seguro(atualizarAgenda));
    };
  }

  function acaoAg(e, lista, depois) {
    const el = e.target.closest('[data-acao]'); if (!el) return;
    const a = lista.find(x => x.id === el.dataset.id); if (!a) return;
    const det = el.closest('details'); if (det) det.open = false;
    const ac = el.dataset.acao;
    if (ac === 'fin') return modalFinalizar(a, d => Api.admin.finalizar(a.id, d), depois);
    if (ac === 'det') return modalDetalhes(a, depois);
    if (ac === 'cmd') return modalComanda(a, { admin: true, produtos: A.D.produtos, add: Api.admin.addItem, rem: Api.admin.remItem }, async () => { await recarregar(); depois(); });
    const conf = {
      faltou: [`Marcar que ${a.clienteNome} faltou?${(a.itens || []).length ? ' Os itens da comanda voltam para o estoque.' : ''}`, 'Marcar falta', false, () => Api.admin.atualizar(a.id, { status: 'faltou' })],
      cancelar: [`Cancelar o horário de ${a.clienteNome}? O horário volta a ficar livre no site.`, 'Cancelar horário', true, () => Api.admin.atualizar(a.id, { status: 'cancelado' })],
      reabrir: [a.status === 'concluido' ? 'Desfazer a finalização? O pagamento registrado será apagado e o atendimento volta para "Agendado".' : 'Reabrir este agendamento?', 'Reabrir', false, () => Api.admin.atualizar(a.id, { status: 'confirmado' })],
      excluir: [`Excluir o agendamento de ${a.clienteNome}?${a.status === 'concluido' ? ' ATENÇÃO: ele já foi finalizado — o valor sai do faturamento e da comissão do barbeiro.' : ''} Os anexos também são apagados. Para só liberar o horário, use "Cancelar".`, 'Excluir', true, () => Api.admin.excluir(a.id)],
    }[ac];
    if (conf) confirmar(conf[0], conf[1], conf[2]).then(ok => ok && seguro(async () => { await conf[3](); toast('Feito.'); depois(); }));
  }

  function itemAg(a) {
    const id = esc(a.id), b = [], mais = [];
    if (a.status === 'confirmado') {
      b.push(`<button class="btn btn-sm" data-acao="fin" data-id="${id}" type="button">Finalizar</button>`, `<button class="btn btn-sec btn-sm" data-acao="cmd" data-id="${id}" type="button">Comanda</button>`);
      mais.push(`<button type="button" data-acao="det" data-id="${id}">Detalhes e anexos</button>`, `<button type="button" data-acao="faltou" data-id="${id}">Cliente faltou</button>`, `<button type="button" data-acao="cancelar" data-id="${id}">Cancelar horário</button>`, `<button type="button" class="perigo" data-acao="excluir" data-id="${id}">Excluir</button>`);
    } else if (a.status === 'concluido') {
      b.push(`<button class="btn ${a.conferido ? 'btn-sec' : ''} btn-sm" data-acao="det" data-id="${id}" type="button">${a.conferido ? 'Ver' : 'Conferir'}</button>`, `<button class="btn btn-sec btn-sm" data-acao="cmd" data-id="${id}" type="button">Comanda</button>`);
      mais.push(`<button type="button" data-acao="fin" data-id="${id}">Corrigir pagamento</button>`, `<button type="button" data-acao="reabrir" data-id="${id}">Desfazer finalização</button>`, `<button type="button" class="perigo" data-acao="excluir" data-id="${id}">Excluir</button>`);
    } else {
      b.push(`<button class="btn btn-sec btn-sm" data-acao="reabrir" data-id="${id}" type="button">Reabrir</button>`);
      mais.push(`<button type="button" data-acao="det" data-id="${id}">Detalhes e anexos</button>`, `<button type="button" class="perigo" data-acao="excluir" data-id="${id}">Excluir</button>`);
    }
    return `<li class="ag st-${a.status}">
      <time>${U.toHora(a.inicio)}<small>${U.toHora(a.fim)}</small></time>
      <div class="ag-info"><strong>${esc(a.clienteNome)} ${chip(a)}</strong>
        <span>${esc(a.servicosNome)} · ${U.dinheiro(a.total)}</span>
        <span class="tel">${esc(U.fone(a.clienteTelefone))} · ${ORIGENS[a.origem] || 'Site'}${(a.anexos || []).length ? ` · ${a.anexos.length} anexo(s)` : ''}</span>
        ${a.obs ? `<em>“${esc(a.obs)}”</em>` : ''}${linhaComanda(a)}${linhaPag(a, barbDe(a.barbeiroId))}</div>
      <div class="ag-acoes">${b.join('')}${menuMais(mais)}</div></li>`;
  }

  function modalDetalhes(a, depois) {
    const b = barbDe(a.barbeiroId), p = a.status === 'concluido' ? U.pagDe(a, b) : null;
    const msg = `Olá, ${a.clienteNome.split(' ')[0]}! Aqui é da ${A.D.config.nome}. `;
    let alterou = false;
    const m = modal({
      titulo: 'Atendimento', botao: 'Salvar', largo: true,
      corpo: `<div class="det-topo"><div><h4>${esc(a.clienteNome)}</h4><a href="${esc(waLink(a.clienteTelefone, msg))}" target="_blank" rel="noopener">${esc(U.fone(a.clienteTelefone))} · WhatsApp</a></div>${chip(a)}</div>
        <dl class="ok-det det">
          <dt>Quando</dt><dd>${fmtDataLonga(a.data)}, ${U.toHora(a.inicio)}–${U.toHora(a.fim)}</dd>
          <dt>Barbeiro</dt><dd>${esc(a.barbeiroNome)}</dd>
          <dt>Serviço</dt><dd>${esc(a.servicosNome)} · tabela ${U.dinheiro(a.total)}</dd>
          ${(a.itens || []).length ? `<dt>Comanda</dt><dd>${a.itens.map(i => `${i.qtd}× ${esc(i.nome)} (${U.dinheiro(i.preco * i.qtd)})`).join('<br>')}</dd>` : ''}
          <dt>Origem</dt><dd>${ORIGENS[a.origem] || 'Site'}</dd>
          ${a.obs ? `<dt>Obs. do cliente</dt><dd>${esc(a.obs)}</dd>` : ''}
        </dl>
        ${p ? `<h4>Pagamento</h4><dl class="ok-det det">
          <dt>Forma</dt><dd>${p.semRegistro ? 'Não registrada (finalizado na versão anterior)' : esc(fmtForma(p.forma))}</dd>
          <dt>Total cobrado</dt><dd>${U.dinheiro(p.valor)}${p.valorItens ? ` <small>(serviço ${U.dinheiro(p.valorServico)} + comanda ${U.dinheiro(p.valorItens)})</small>` : ''}</dd>
          <dt>Comissão</dt><dd>${U.dinheiro(p.comissaoValor)} (${p.comissaoPct}% do serviço${p.comissaoItens ? ` + ${U.dinheiro(p.comissaoItens)} de produtos` : ''}) · fica na casa ${U.dinheiro(p.valor - p.comissaoValor)}</dd>
          ${p.obs ? `<dt>Obs.</dt><dd>${esc(p.obs)}</dd>` : ''}
          ${p.finalizadoEm ? `<dt>Finalizado</dt><dd>${p.finalizadoPor === 'admin' ? 'pela gerência' : 'pelo barbeiro'} em ${fmtCurta(p.finalizadoEm)} ${new Date(p.finalizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</dd>` : ''}
        </dl>
        <label class="check confere"><input type="checkbox" name="conferido"${a.conferido ? ' checked' : ''}> <b>Conferido</b> — valor e forma de pagamento batem com o caixa</label>`
        : `<p class="aviso-leve">${a.status === 'confirmado' ? 'Ainda não finalizado. Finalize para registrar o pagamento e liberar a conferência.' : 'Atendimento ' + ESTADOS[a.status].toLowerCase() + '.'}</p>`}
        <h4>Comprovantes e arquivos</h4>
        <div id="anexos"></div>
        <label>Observação interna <i>(o barbeiro não vê)</i><textarea name="obsInterna" maxlength="500" rows="2">${esc(a.obsInterna || '')}</textarea></label>`,
      aoAbrir(f) {
        painelAnexos($('#anexos', f), { lista: a.anexos, editavel: true, anexar: file => Api.admin.anexar('agendamentos', a.id, file), abrir: an => Api.admin.anexo('agendamentos', a.id, an), excluir: an => Api.admin.excluirAnexo('agendamentos', a.id, an), mudou: () => { alterou = true; } });
        const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); if (alterou) depois(); } });
        obs.observe(modalRoot, { childList: true });
      },
      async aoEnviar(f) {
        const d = { obsInterna: f.obsInterna.value.trim() };
        if (f.conferido) d.conferido = f.conferido.checked;
        await Api.admin.atualizar(a.id, d); alterou = true; toast(d.conferido ? 'Atendimento conferido.' : 'Salvo.');
      },
    });
  }

  // ------------------------------------------------------- financeiro
  function abaFinanceiro() {
    const m = $('#adm-main');
    m.innerHTML = `<div class="barra">${navMes('nav-f', A.mesFin)}<button class="btn" id="novo-pg" type="button">+ Registrar pagamento</button></div><div id="f-cont"><p class="carregando">Carregando…</p></div>`;
    $$('#nav-f [data-m]').forEach(b => b.onclick = () => { A.mesFin = U.addMes(A.mesFin, Number(b.dataset.m)); abaFinanceiro(); });
    let F = null, ags = [];
    $('#novo-pg').onclick = () => modalPagamento({}, F, abaFinanceiro);
    seguro(async () => {
      const [ini, fim] = U.limitesMes(A.mesFin);
      let desp;
      [F, ags, desp] = await Promise.all([Api.admin.financeiro(A.mesFin), Api.admin.agendamentos(ini, fim), Api.admin.despesas(ini, fim)]);
      const box = $('#f-cont'); if (!box) return;
      const R = F.resumo, tot = k => U.soma(R.map(r => r[k]));
      const aConferir = ags.filter(a => a.status === 'concluido' && !a.conferido);
      const totDesp = U.soma(desp.map(d => d.valor)), fat = tot('produzido'), com = tot('comissao');
      box.innerHTML = `<section class="bloco resultado"><h3>Resultado do mês</h3><div class="kpis kpis-6">
          <div><span>Faturamento</span><b>${U.dinheiro(fat)}</b></div>
          <div><span>Comissões</span><b>− ${U.dinheiro(com)}</b></div>
          <div><span>Despesas</span><b>− ${U.dinheiro(totDesp)}</b></div>
          <div class="destaque"><span>Lucro estimado</span><b>${U.dinheiro(fat - com - totDesp)}</b></div>
          <div><span>Falta pagar aos barbeiros</span><b>${U.dinheiro(U.soma(R.filter(r => r.aPagar > 0).map(r => r.aPagar)))}</b></div>
          <div><span>A conferir</span><b>${aConferir.length}</b></div></div></section>
        <section class="bloco"><h3>Comissões por barbeiro</h3>
        ${R.length ? `<table class="tabela stack"><thead><tr><th>Barbeiro</th><th class="num">Atend.</th><th class="num">Produzido</th><th class="num">Comissão</th><th class="num">Saldo anterior</th><th class="num">Pago no mês</th><th class="num">A pagar</th><th></th></tr></thead><tbody>
          ${R.map(r => `<tr><td><strong>${esc(r.nome)}</strong>${r.comissaoPct != null ? ` <small>${r.comissaoPct}%</small>` : ''}</td><td class="num">${r.atendimentos}</td><td class="num">${U.dinheiro(r.produzido)}</td><td class="num">${U.dinheiro(r.comissao)}</td><td class="num">${U.dinheiro(r.anterior)}</td><td class="num">${U.dinheiro(r.pago)}</td><td class="num"><b class="${r.aPagar > 0 ? 'deve' : ''}">${U.dinheiro(r.aPagar)}</b></td>
          <td class="acoes"><button class="btn btn-sm" data-pagar="${esc(r.barbeiroId)}" type="button">Pagar</button><button class="btn btn-sec btn-sm" data-extrato="${esc(r.barbeiroId)}" type="button">Extrato</button></td></tr>`).join('')}
          </tbody></table>` : '<p class="vazio">Sem movimento neste mês.</p>'}</section>
        <section class="bloco"><h3>Pagamentos e vales do mês</h3>
        ${F.pagamentos.length ? `<table class="tabela stack"><thead><tr><th>Data</th><th>Barbeiro</th><th>Tipo</th><th>Forma</th><th class="num">Valor</th><th>Obs.</th><th>Comprovante</th><th></th></tr></thead><tbody>
          ${F.pagamentos.map(p => `<tr><td>${fmtCurta(p.data)}</td><td>${esc(p.barbeiroNome)}</td><td>${p.tipo === 'vale' ? 'Vale' : 'Pagamento'}</td><td>${esc(fmtForma(p.forma))}</td><td class="num">${U.dinheiro(p.valor)}</td><td>${esc(p.obs || '—')}</td>
          <td><button class="link" type="button" data-arq-pg="${esc(p.id)}">${(p.anexos || []).length ? `Ver (${p.anexos.length})` : '+ Anexar'}</button></td>
          <td class="acoes"><button class="btn btn-sec btn-sm perigo" data-exc-pg="${esc(p.id)}" type="button">Excluir</button></td></tr>`).join('')}
          </tbody></table>` : '<p class="vazio">Nenhum pagamento registrado neste mês.</p>'}</section>
        <section class="bloco"><h3>Atendimentos a conferir <small>${aConferir.length}</small></h3>
        ${aConferir.length ? `<table class="tabela stack"><thead><tr><th>Data</th><th>Barbeiro</th><th>Cliente</th><th>Pagamento</th><th class="num">Valor</th><th></th></tr></thead><tbody>
          ${aConferir.map(a => { const p = U.pagDe(a, barbDe(a.barbeiroId)); return `<tr><td>${fmtCurta(a.data)} ${U.toHora(a.inicio)}</td><td>${esc(a.barbeiroNome)}</td><td>${esc(a.clienteNome)}<br><small>${esc(a.servicosNome)}${(a.itens || []).length ? ' + comanda' : ''}</small></td><td>${p.semRegistro ? '—' : esc(fmtForma(p.forma))}</td><td class="num">${U.dinheiro(p.valor)}</td><td class="acoes"><button class="btn btn-sm" data-acao="det" data-id="${esc(a.id)}" type="button">Conferir</button></td></tr>`; }).join('')}
          </tbody></table>` : '<p class="vazio">Tudo conferido neste mês.</p>'}</section>
        <p class="ajuda">Lucro estimado = faturamento (serviços + comanda) − comissões − despesas lançadas no mês (aba Despesas). A pagar = saldo anterior + comissão do mês − pagamentos e vales.</p>`;
      box.onclick = e => {
        const pg = e.target.closest('[data-pagar]'), ex = e.target.closest('[data-extrato]'), del = e.target.closest('[data-exc-pg]'), arq = e.target.closest('[data-arq-pg]');
        if (pg) return modalPagamento({ barbeiroId: pg.dataset.pagar }, F, abaFinanceiro);
        if (ex) { A.relB = ex.dataset.extrato; A.mesRel = A.mesFin; A.tab = 'relatorios'; return renderAba(); }
        if (arq) { const p = F.pagamentos.find(x => x.id === arq.dataset.arqPg); return modalArquivos(`Comprovante — pagamento de ${p.barbeiroNome}`, { lista: p.anexos, editavel: true, anexar: f => Api.admin.anexar('pagamentos', p.id, f), abrir: an => Api.admin.anexo('pagamentos', p.id, an), excluir: an => Api.admin.excluirAnexo('pagamentos', p.id, an) }, abaFinanceiro); }
        if (del) return confirmar('Excluir este pagamento? O valor volta para "a pagar" e o comprovante é apagado.').then(ok => ok && seguro(async () => { await Api.admin.excluirPagamento(del.dataset.excPg); toast('Pagamento excluído.'); abaFinanceiro(); }));
        acaoAg(e, ags, abaFinanceiro);
      };
    });
  }

  function modalPagamento(p, F, depois) {
    const bs = A.D.barbeiros;
    const saldo = id => { const r = F && F.resumo.find(x => x.barbeiroId === id); return r ? Math.max(0, r.aPagar) : 0; };
    const id0 = p.barbeiroId || (bs[0] || {}).id;
    const hoje = U.hojeISO(), [ini, fim] = U.limitesMes(A.mesFin);
    const dataPad = hoje >= ini && hoje <= fim ? hoje : fim < hoje ? fim : ini;
    modal({
      titulo: 'Registrar pagamento ao barbeiro', botao: 'Registrar',
      corpo: `<div class="campos">
        <label class="full">Barbeiro<select name="barb">${bs.map(b => `<option value="${esc(b.id)}"${b.id === id0 ? ' selected' : ''}>${esc(b.nome)}</option>`).join('')}</select></label>
        <label>Tipo<select name="tipo"><option value="pagamento">Pagamento de comissão</option><option value="vale">Vale / adiantamento</option></select></label>
        <label>Data<input type="date" name="data" value="${dataPad}" required></label>
        <label>Valor (R$)<input type="number" name="valor" step="0.01" min="0.01" inputmode="decimal" value="${saldo(id0) || ''}" required></label>
        <label>Forma<select name="forma"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="outro">Transferência / outro</option></select></label>
        <label class="full">Observação <i>(opcional)</i><input name="obs" maxlength="200" placeholder="Ex.: fechamento da 1ª quinzena"></label>
        <label class="full">Comprovante <i>(opcional — foto ou PDF)</i><input type="file" name="arq" accept="image/*,application/pdf" multiple></label></div>
        <p class="ajuda" id="pg-saldo"></p>`,
      aoAbrir(f) {
        const mostra = () => { $('#pg-saldo', f).textContent = F ? `Saldo a pagar de ${(bs.find(b => b.id === f.barb.value) || {}).nome || ''} em ${fmtMes(A.mesFin)}: ${U.dinheiro(saldo(f.barb.value))}` : ''; };
        f.barb.onchange = () => { f.valor.value = saldo(f.barb.value) || ''; mostra(); }; mostra();
      },
      async aoEnviar(f) {
        if (!(Number(f.valor.value) > 0)) throw new Error('Informe o valor.');
        const pg = await Api.admin.salvarPagamento({ barbeiroId: f.barb.value, tipo: f.tipo.value, data: f.data.value, valor: Number(f.valor.value), forma: f.forma.value, obs: f.obs.value.trim() });
        let falhou = 0;
        for (const arq of f.arq.files) { try { await Api.admin.anexar('pagamentos', pg.id, await comprimir(arq)); } catch (e) { falhou++; toast(e.message, 'erro'); } }
        if (!falhou) toast('Pagamento registrado.');
        depois();
      },
    });
  }

  // ---------------------------------------------------------- despesas
  function abaDespesas() {
    const P = A.dp;
    $('#adm-main').innerHTML = `<div class="barra">${navPeriodo('dp-per', P)}<div class="barra-acoes"><button class="btn btn-sec" id="imp" type="button">Imprimir / PDF</button><button class="btn" id="nova-dp" type="button">+ Nova despesa</button></div></div>
      <div class="filtros"><label>Categoria<select id="dp-cat"><option value="">Todas</option>${U.CATEGORIAS_DESPESA.map(c => `<option${P.cat === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>Situação<select id="dp-st"><option value="">Todas</option><option value="pago"${P.status === 'pago' ? ' selected' : ''}>Pagas</option><option value="pendente"${P.status === 'pendente' ? ' selected' : ''}>A pagar</option></select></label>
        <label class="busca">Buscar<input id="dp-busca" type="search" value="${esc(P.busca)}" placeholder="Descrição ou fornecedor"></label></div>
      <h2 class="print-tit">${esc(A.D.config.nome)} — Extrato de despesas — ${fmtCurta(P.de)}/${P.de.slice(0, 4)} a ${fmtCurta(P.ate)}/${P.ate.slice(0, 4)}</h2>
      <div id="dp-cont"><p class="carregando">Carregando…</p></div>`;
    ligarPeriodo('dp-per', P, abaDespesas);
    $('#imp').onclick = imprimir;
    $('#nova-dp').onclick = () => modalDespesa(null, abaDespesas);
    $('#dp-cat').onchange = e => { P.cat = e.target.value; desenhar(); };
    $('#dp-st').onchange = e => { P.status = e.target.value; desenhar(); };
    $('#dp-busca').oninput = e => { P.busca = e.target.value; desenhar(); };
    let todas = [];
    function desenhar() {
      const box = $('#dp-cont'); if (!box) return;
      const b = P.busca.trim().toLowerCase();
      const l = todas.filter(d => (!P.cat || d.categoria === P.cat) && (!P.status || d.status === P.status) && (!b || (d.descricao + ' ' + (d.fornecedor || '') + ' ' + (d.obs || '')).toLowerCase().includes(b)));
      const tot = U.soma(l.map(d => d.valor)), pend = U.soma(l.filter(d => d.status === 'pendente').map(d => d.valor));
      const porCat = {}; l.forEach(d => { porCat[d.categoria] = porCat[d.categoria] || { n: d.categoria, q: 0, v: 0 }; porCat[d.categoria].q++; porCat[d.categoria].v += d.valor; });
      box.innerHTML = `<div class="kpis"><div><span>Total no período</span><b>${U.dinheiro(tot)}</b></div><div><span>Pagas</span><b>${U.dinheiro(tot - pend)}</b></div>
          <div class="${pend ? 'destaque' : ''}"><span>A pagar</span><b>${U.dinheiro(pend)}</b></div><div><span>Lançamentos</span><b>${l.length}</b></div></div>
        <section class="bloco"><h3>Por categoria</h3>${barrasHTML(Object.values(porCat).sort((x, y) => y.v - x.v))}</section>
        <section class="bloco"><h3>Lançamentos</h3>
        ${l.length ? `<table class="tabela stack"><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Forma</th><th>Situação</th><th class="num">Valor</th><th>Comprovante</th><th></th></tr></thead><tbody>
          ${l.map(d => `<tr><td>${fmtCurta(d.data)}</td><td>${esc(d.categoria)}</td><td>${esc(d.descricao)}${d.fornecedor ? `<br><small>${esc(d.fornecedor)}</small>` : ''}</td><td>${esc(fmtForma(d.forma))}</td>
            <td>${d.status === 'pendente' ? '<span class="chip warn">A pagar</span>' : '<span class="chip ok">Paga</span>'}</td><td class="num">${U.dinheiro(d.valor)}</td>
            <td><button class="link" type="button" data-arq="${esc(d.id)}">${(d.anexos || []).length ? `Ver (${d.anexos.length})` : '+ Anexar'}</button></td>
            <td class="acoes">${d.status === 'pendente' ? `<button class="btn btn-sm" data-pagar="${esc(d.id)}" type="button">Marcar paga</button>` : `<button class="btn btn-sec btn-sm" data-ed="${esc(d.id)}" type="button">Editar</button>`}${menuMais([...(d.status === 'pendente' ? [`<button type="button" data-ed="${esc(d.id)}">Editar</button>`] : []), `<button type="button" class="perigo" data-ex="${esc(d.id)}">Excluir</button>`])}</td></tr>`).join('')}
          <tr class="linha-total"><td colspan="5"><b>Total</b></td><td class="num"><b>${U.dinheiro(tot)}</b></td><td></td><td></td></tr></tbody></table>`
          : '<p class="vazio">Nenhuma despesa com esses filtros.</p>'}</section>`;
    }
    $('#adm-main').onclick = e => {
      const ed = e.target.closest('[data-ed]'), ex = e.target.closest('[data-ex]'), arq = e.target.closest('[data-arq]'), pg = e.target.closest('[data-pagar]');
      const det = e.target.closest('details'); if (det && (ed || ex)) det.open = false;
      if (ed) modalDespesa(todas.find(d => d.id === ed.dataset.ed), abaDespesas);
      if (arq) { const d = todas.find(x => x.id === arq.dataset.arq); modalArquivos(`Comprovante — ${d.descricao}`, { lista: d.anexos, editavel: true, anexar: f => Api.admin.anexar('despesas', d.id, f), abrir: an => Api.admin.anexo('despesas', d.id, an), excluir: an => Api.admin.excluirAnexo('despesas', d.id, an) }, abaDespesas); }
      if (pg) { const d = todas.find(x => x.id === pg.dataset.pagar); seguro(async () => { await Api.admin.salvarDespesa({ ...d, status: 'pago' }); toast('Despesa marcada como paga.'); abaDespesas(); }); }
      if (ex) { const d = todas.find(x => x.id === ex.dataset.ex); confirmar(`Excluir "${d.descricao}" (${U.dinheiro(d.valor)})? O comprovante também é apagado.`).then(ok => ok && seguro(async () => { await Api.admin.excluirDespesa(d.id); toast('Despesa excluída.'); abaDespesas(); })); }
    };
    seguro(async () => { todas = await Api.admin.despesas(P.de, P.ate); desenhar(); });
  }

  function modalDespesa(d0, depois) {
    const d = d0 || { data: U.hojeISO(), categoria: 'Outros', descricao: '', valor: '', forma: 'pix', status: 'pago', fornecedor: '', obs: '' };
    modal({
      titulo: d0 ? 'Editar despesa' : 'Nova despesa', botao: 'Salvar', largo: true,
      corpo: `<div class="campos">
        <label class="full">Descrição<input name="descricao" maxlength="120" value="${esc(d.descricao)}" placeholder="Ex.: Conta de luz de novembro" required></label>
        <label>Categoria<select name="categoria">${U.CATEGORIAS_DESPESA.map(c => `<option${d.categoria === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>Valor (R$)<input name="valor" type="number" step="0.01" min="0.01" inputmode="decimal" value="${d.valor}" required></label>
        <label>Data<input name="data" type="date" value="${d.data}" required></label>
        <label>Situação<select name="status"><option value="pago"${d.status === 'pago' ? ' selected' : ''}>Paga</option><option value="pendente"${d.status === 'pendente' ? ' selected' : ''}>A pagar</option></select></label>
        <label>Forma de pagamento<select name="forma">${Object.entries({ pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Cartão de débito', credito: 'Cartão de crédito', boleto: 'Boleto', outro: 'Outro' }).map(([k, n]) => `<option value="${k}"${d.forma === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Fornecedor <i>(opcional)</i><input name="fornecedor" maxlength="80" value="${esc(d.fornecedor || '')}"></label>
        <label class="full">Observação <i>(opcional)</i><input name="obs" maxlength="300" value="${esc(d.obs || '')}"></label>
        ${d0 ? '' : '<label class="full">Comprovante / nota <i>(opcional — foto ou PDF)</i><input type="file" name="arq" accept="image/*,application/pdf" multiple></label>'}</div>
        ${d0 ? '<h4>Comprovantes</h4><div id="dp-arq"></div>' : ''}`,
      aoAbrir(f) { if (d0) painelAnexos($('#dp-arq', f), { lista: d0.anexos, editavel: true, anexar: file => Api.admin.anexar('despesas', d0.id, file), abrir: an => Api.admin.anexo('despesas', d0.id, an), excluir: an => Api.admin.excluirAnexo('despesas', d0.id, an) }); },
      async aoEnviar(f) {
        if (!f.descricao.value.trim()) throw new Error('Descreva a despesa.');
        if (!(Number(f.valor.value) > 0)) throw new Error('Informe o valor.');
        const x = await Api.admin.salvarDespesa({ id: d0 ? d0.id : '', descricao: f.descricao.value.trim(), categoria: f.categoria.value, valor: Number(f.valor.value), data: f.data.value, status: f.status.value, forma: f.forma.value, fornecedor: f.fornecedor.value.trim(), obs: f.obs.value.trim() });
        if (f.arq) for (const arq of f.arq.files) { try { await Api.admin.anexar('despesas', x.id, await comprimir(arq)); } catch (e) { toast(e.message, 'erro'); } }
        toast('Despesa salva.'); depois();
      },
    });
  }

  // ----------------------------------------------------------- estoque
  function abaEstoque() {
    const E = A.est, prods = A.D.produtos;
    const valorEstoque = U.soma(prods.filter(p => p.controlaEstoque).map(p => Math.max(0, p.estoque) * p.custo));
    const baixos = prods.filter(p => p.ativo && p.controlaEstoque && p.estoque <= p.estoqueMinimo);
    const b = E.busca.trim().toLowerCase();
    const lista = prods.filter(p => (!E.cat || p.categoria === E.cat) && (!b || p.nome.toLowerCase().includes(b)) && (!E.baixo || (p.controlaEstoque && p.estoque <= p.estoqueMinimo)));
    $('#adm-main').innerHTML = `<div class="barra"><h2>Estoque</h2><button class="btn" id="novo-pr" type="button">+ Novo produto</button></div>
      <div class="kpis"><div><span>Produtos</span><b>${prods.filter(p => p.ativo).length}</b></div><div class="${baixos.length ? 'destaque' : ''}"><span>Abaixo do mínimo</span><b>${baixos.length}</b></div>
        <div><span>Valor em estoque (custo)</span><b>${U.dinheiro(valorEstoque)}</b></div><div><span>Unidades</span><b>${prods.filter(p => p.controlaEstoque).reduce((t, p) => t + Math.max(0, p.estoque), 0)}</b></div></div>
      ${baixos.length ? `<div class="aviso"><b>Repor:</b> ${baixos.map(p => `${esc(p.nome)} (${p.estoque})`).join(', ')}</div>` : ''}
      <div class="filtros"><label>Categoria<select id="es-cat"><option value="">Todas</option>${Object.entries(U.CATEGORIAS_PRODUTO).map(([k, n]) => `<option value="${k}"${E.cat === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="busca">Buscar<input id="es-busca" type="search" value="${esc(E.busca)}" placeholder="Nome do produto"></label>
        <label class="check"><input type="checkbox" id="es-baixo"${E.baixo ? ' checked' : ''}> Só abaixo do mínimo</label></div>
      ${lista.length ? `<table class="tabela stack"><thead><tr><th>Produto</th><th>Categoria</th><th class="num">Venda</th><th class="num">Custo</th><th class="num">Margem</th><th class="num">Estoque</th><th></th></tr></thead><tbody>
        ${lista.map(p => `<tr class="${p.ativo ? '' : 'inativo'}"><td><strong>${esc(p.nome)}</strong>${p.comissao ? `<br><small>comissão ${p.comissao}% ao barbeiro</small>` : ''}</td><td>${esc(U.CATEGORIAS_PRODUTO[p.categoria] || p.categoria)}</td>
          <td class="num">${p.preco ? U.dinheiro(p.preco) : '—'}</td><td class="num">${U.dinheiro(p.custo)}</td><td class="num">${p.preco ? pct(p.preco - p.custo, p.preco) : '—'}</td>
          <td class="num">${p.controlaEstoque ? `<b class="${p.estoque <= p.estoqueMinimo ? 'deve' : ''}">${p.estoque}</b> <small>${esc(p.unidade || 'un.')}${p.estoqueMinimo ? ' · mín. ' + p.estoqueMinimo : ''}</small>` : '<small>não controla</small>'}</td>
          <td class="acoes">${p.controlaEstoque ? `<button class="btn btn-sm" data-mov="entrada" data-id="${esc(p.id)}" type="button">Entrada</button>` : ''}${menuMais([
            ...(p.controlaEstoque ? [`<button type="button" data-mov="saida" data-id="${esc(p.id)}">Saída (uso, perda)</button>`, `<button type="button" data-mov="ajuste" data-id="${esc(p.id)}">Ajustar contagem</button>`, `<button type="button" data-extr="${esc(p.id)}">Ver extrato</button>`] : []),
            `<button type="button" data-ed="${esc(p.id)}">Editar</button>`, `<button type="button" class="perigo" data-ex="${esc(p.id)}">Excluir</button>`])}</td></tr>`).join('')}
        </tbody></table>` : `<p class="vazio">${prods.length ? 'Nenhum produto com esses filtros.' : 'Cadastre bebidas, produtos de venda e insumos para controlar o estoque e lançar na comanda.'}</p>`}
      <section class="bloco" id="extrato-est"><div class="barra"><h3>Extrato de movimentações</h3>${navPeriodo('es-per', E)}</div>
        <div class="filtros"><label>Produto<select id="es-prod"><option value="">Todos</option>${prods.map(p => `<option value="${esc(p.id)}"${E.prod === p.id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
          <label>Tipo<select id="es-tipo"><option value="">Todos</option>${Object.entries(TIPOS_MOV).map(([k, n]) => `<option value="${k}"${E.tipo === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
          <button class="btn btn-sec" id="imp" type="button">Imprimir / PDF</button></div>
        <h2 class="print-tit">${esc(A.D.config.nome)} — Extrato de estoque — ${fmtCurta(E.de)} a ${fmtCurta(E.ate)}</h2>
        <div id="es-mov"><p class="carregando">Carregando…</p></div></section>`;
    $('#novo-pr').onclick = () => modalProduto(null);
    $('#es-cat').onchange = e => { E.cat = e.target.value; abaEstoque(); };
    $('#es-busca').onchange = e => { E.busca = e.target.value; abaEstoque(); };
    $('#es-baixo').onchange = e => { E.baixo = e.target.checked; abaEstoque(); };
    $('#es-prod').onchange = e => { E.prod = e.target.value; carregarMov(); };
    $('#es-tipo').onchange = e => { E.tipo = e.target.value; carregarMov(); };
    $('#imp').onclick = () => { document.body.classList.add('imprimir-extrato'); imprimir(); setTimeout(() => document.body.classList.remove('imprimir-extrato'), 500); };
    ligarPeriodo('es-per', E, carregarMov);
    $('#adm-main').onclick = e => {
      const mv = e.target.closest('[data-mov]'), ed = e.target.closest('[data-ed]'), ex = e.target.closest('[data-ex]'), xt = e.target.closest('[data-extr]');
      const det = e.target.closest('details'); if (det && (mv || ed || ex || xt)) det.open = false;
      if (mv) modalMovimento(prods.find(p => p.id === mv.dataset.id), mv.dataset.mov);
      if (ed) modalProduto(prods.find(p => p.id === ed.dataset.ed));
      if (xt) { E.prod = xt.dataset.extr; $('#es-prod').value = E.prod; carregarMov(); $('#extrato-est').scrollIntoView({ behavior: 'smooth' }); }
      if (ex) { const p = prods.find(x => x.id === ex.dataset.ex); confirmar(`Excluir "${p.nome}"? O histórico de movimentações continua no extrato. Se só parou de vender, prefira desmarcar "Ativo".`).then(ok => ok && seguro(async () => { await Api.admin.excluirProduto(p.id); await recarregar(); abaEstoque(); toast('Produto excluído.'); })); }
    };
    function carregarMov() {
      const perEl = $('#es-per'); if (perEl) { perEl.querySelector('[data-p=de]').value = E.de; perEl.querySelector('[data-p=ate]').value = E.ate; }
      seguro(async () => {
        const l = (await Api.admin.movimentos(E.de, E.ate, E.prod)).filter(m => !E.tipo || m.tipo === E.tipo);
        const box = $('#es-mov'); if (!box) return;
        const vendas = l.filter(m => m.tipo === 'venda'), devol = l.filter(m => m.tipo === 'estorno'), entradas = l.filter(m => m.tipo === 'entrada');
        const qVend = vendas.reduce((t, m) => t - m.qtd, 0) - devol.reduce((t, m) => t + m.qtd, 0);
        const receita = U.soma(vendas.map(m => -m.qtd * m.valorUnit)) - U.soma(devol.map(m => m.qtd * m.valorUnit));
        box.innerHTML = `<div class="kpis"><div><span>Vendidos (líquido)</span><b>${qVend}</b></div><div><span>Receita com produtos</span><b>${U.dinheiro(receita)}</b></div>
            <div><span>Entradas</span><b>${entradas.reduce((t, m) => t + m.qtd, 0)}</b></div><div><span>Custo das entradas</span><b>${U.dinheiro(U.soma(entradas.map(m => m.qtd * m.custoUnit)))}</b></div></div>
          ${l.length ? `<table class="tabela stack"><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th class="num">Qtd.</th><th class="num">Valor</th><th>Detalhe</th></tr></thead><tbody>
          ${l.map(m => `<tr><td>${fmtCurta(m.data)}</td><td>${esc(m.produtoNome)}</td><td>${TIPOS_MOV[m.tipo] || m.tipo}</td><td class="num"><b class="${m.qtd < 0 ? 'deve' : 'mais-qtd'}">${m.qtd > 0 ? '+' : ''}${m.qtd}</b></td>
            <td class="num">${m.tipo === 'venda' || m.tipo === 'estorno' ? U.dinheiro(Math.abs(m.qtd) * m.valorUnit) : m.tipo === 'entrada' ? U.dinheiro(m.qtd * m.custoUnit) : '—'}</td><td>${esc(m.obs || '—')}${m.por === 'barbeiro' ? ' <small>(barbeiro)</small>' : ''}</td></tr>`).join('')}</tbody></table>`
            : '<p class="vazio">Nenhuma movimentação no período.</p>'}`;
      });
    }
    carregarMov();
  }

  function modalProduto(p0) {
    const p = p0 || { nome: '', categoria: 'bebida', preco: '', custo: '', comissao: 0, controlaEstoque: true, estoqueMinimo: 0, unidade: 'un.', ativo: true };
    modal({
      titulo: p0 ? 'Editar produto' : 'Novo produto', largo: true,
      corpo: `<div class="campos">
        <label class="full">Nome<input name="nome" maxlength="60" value="${esc(p.nome)}" placeholder="Ex.: Cerveja long neck" required></label>
        <label>Categoria<select name="categoria">${Object.entries(U.CATEGORIAS_PRODUTO).map(([k, n]) => `<option value="${k}"${p.categoria === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Unidade<input name="unidade" maxlength="12" value="${esc(p.unidade || 'un.')}" placeholder="un., cx, ml"></label>
        <label>Preço de venda (R$)<input name="preco" type="number" step="0.01" min="0" inputmode="decimal" value="${p.preco}"></label>
        <label>Custo (R$)<input name="custo" type="number" step="0.01" min="0" inputmode="decimal" value="${p.custo}"></label>
        <label>Comissão do barbeiro (%)<input name="comissao" type="number" step="0.5" min="0" max="100" value="${p.comissao || 0}"></label>
        <label>Estoque mínimo<input name="minimo" type="number" min="0" value="${p.estoqueMinimo || 0}"></label>
        ${p0 ? '' : '<label>Estoque inicial<input name="inicial" type="number" min="0" value="0"></label>'}
        <label class="check full"><input type="checkbox" name="controla"${p.controlaEstoque ? ' checked' : ''}> Controlar estoque (dá baixa quando vai para a comanda)</label>
        <label class="check full"><input type="checkbox" name="ativo"${p.ativo ? ' checked' : ''}> Ativo — aparece na comanda</label></div>
        <p class="ajuda">“Insumo” é material de uso interno (lâmina, toalha, produto de lavatório): controla estoque mas não aparece na comanda do barbeiro. A quantidade em estoque muda pelos botões Entrada / Saída / Ajuste.</p>`,
      async aoEnviar(f) {
        if (!f.nome.value.trim()) throw new Error('Informe o nome.');
        await Api.admin.salvarProduto({ ...(p0 || {}), nome: f.nome.value.trim(), categoria: f.categoria.value, unidade: f.unidade.value.trim(), preco: Number(f.preco.value) || 0, custo: Number(f.custo.value) || 0, comissao: Number(f.comissao.value) || 0, estoqueMinimo: Number(f.minimo.value) || 0, estoqueInicial: f.inicial ? Number(f.inicial.value) || 0 : 0, controlaEstoque: f.controla.checked, ativo: f.ativo.checked, ordem: p0 ? p0.ordem : A.D.produtos.length });
        await recarregar(); abaEstoque(); toast('Produto salvo.');
      },
    });
  }

  function modalMovimento(p, tipo) {
    const t = { entrada: 'Entrada de estoque (compra / reposição)', saida: 'Saída de estoque', ajuste: 'Ajustar contagem' }[tipo];
    modal({
      titulo: t, botao: 'Registrar',
      corpo: `<p class="mf-resumo"><b>${esc(p.nome)}</b> · estoque atual: <b>${p.estoque} ${esc(p.unidade || 'un.')}</b></p><div class="campos">
        <label>${tipo === 'ajuste' ? 'Quantidade contada agora' : 'Quantidade'}<input name="qtd" type="number" min="${tipo === 'ajuste' ? 0 : 1}" value="${tipo === 'ajuste' ? p.estoque : ''}" inputmode="numeric" required></label>
        <label>Data<input name="data" type="date" value="${U.hojeISO()}"></label>
        ${tipo === 'entrada' ? `<label>Custo por unidade (R$)<input name="custo" type="number" step="0.01" min="0" inputmode="decimal" value="${p.custo}"></label>
          <label>Fornecedor <i>(opcional)</i><input name="fornecedor" maxlength="80"></label>
          <label class="check full"><input type="checkbox" name="despesa" checked> Lançar a compra em Despesas (categoria Produtos e estoque)</label>
          <label>Pago com<select name="forma"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option><option value="boleto">Boleto</option></select></label>` : ''}
        ${tipo === 'saida' ? '<label>Motivo<select name="motivo"><option>Uso interno</option><option>Perda / quebra</option><option>Vencido</option><option>Consumo da equipe</option><option>Outro</option></select></label>' : ''}
        <label class="full">Observação <i>(opcional)</i><input name="obs" maxlength="120"></label></div>
        ${tipo === 'entrada' ? '<p class="ajuda" id="mv-tot"></p>' : ''}`,
      aoAbrir(f) { if (tipo === 'entrada') { const at = () => { $('#mv-tot', f).textContent = `Total da compra: ${U.dinheiro((Number(f.qtd.value) || 0) * (Number(f.custo.value) || 0))}`; }; f.qtd.oninput = at; f.custo.oninput = at; at(); } },
      async aoEnviar(f) {
        const qtd = parseInt(f.qtd.value, 10);
        if (!(qtd >= (tipo === 'ajuste' ? 0 : 1))) throw new Error('Informe a quantidade.');
        const obs = [f.motivo ? f.motivo.value : '', f.obs.value.trim()].filter(Boolean).join(' — ');
        const r = await Api.admin.movimentar({ produtoId: p.id, tipo, qtd, data: f.data.value, obs, custoUnit: f.custo ? f.custo.value : undefined, gerarDespesa: f.despesa ? f.despesa.checked : false, forma: f.forma ? f.forma.value : '', fornecedor: f.fornecedor ? f.fornecedor.value : '' });
        await recarregar(); abaEstoque(); toast(`Estoque de ${p.nome}: ${r.produto.estoque}.${r.despesa ? ' Compra lançada em Despesas.' : ''}`);
      },
    });
  }

  // ------------------------------------------------------- relatórios
  function abaRelatorios() {
    const m = $('#adm-main');
    m.innerHTML = `<div class="barra">${navMes('nav-r', A.mesRel)}
      <div class="barra-acoes"><select id="rel-b" aria-label="Relatório de"><option value="">Barbearia (geral)</option><option value="clientes"${A.relB === 'clientes' ? ' selected' : ''}>Clientes</option>
        <optgroup label="Extrato do barbeiro">${A.D.barbeiros.map(b => `<option value="${esc(b.id)}"${A.relB === b.id ? ' selected' : ''}>${esc(b.nome)}</option>`).join('')}</optgroup></select>
      <button class="btn btn-sec" id="imp" type="button">Imprimir / PDF</button></div></div>
      <h2 class="print-tit">${esc(A.D.config.nome)} — ${A.relB === 'clientes' ? 'Relatório de clientes' : A.relB ? 'Extrato de ' + esc((barbDe(A.relB) || {}).nome || '') : 'Relatório geral'} — ${fmtMes(A.mesRel)}</h2>
      <div id="r-cont"><p class="carregando">Carregando…</p></div>`;
    $$('#nav-r [data-m]').forEach(b => b.onclick = () => { A.mesRel = U.addMes(A.mesRel, Number(b.dataset.m)); abaRelatorios(); });
    $('#rel-b').onchange = e => { A.relB = e.target.value; abaRelatorios(); };
    $('#imp').onclick = imprimir;
    seguro(async () => {
      const [ini, fim] = U.limitesMes(A.mesRel);
      const [F, todos, desp] = await Promise.all([Api.admin.financeiro(A.mesRel), Api.admin.agendamentos(ini, fim), Api.admin.despesas(ini, fim)]);
      const box = $('#r-cont'); if (!box) return;
      if (A.relB === 'clientes') { box.innerHTML = htmlRelClientes(todos); ligarBuscaClientes(box); return; }
      if (A.relB) {
        const r = F.resumo.find(x => x.barbeiroId === A.relB), pags = F.pagamentos.filter(p => p.barbeiroId === A.relB);
        box.innerHTML = htmlExtrato(r, todos.filter(a => a.barbeiroId === A.relB), pags, 'admin');
        ligarComprovantes(box, pags, (pg, an) => Api.admin.anexo('pagamentos', pg, an));
        return;
      }
      box.innerHTML = htmlRelBarbearia(todos, F, desp);
    });
  }

  function htmlRelBarbearia(todos, F, desp) {
    const conc = todos.filter(a => a.status === 'concluido');
    const pg = conc.map(a => ({ a, p: U.pagDe(a, barbDe(a.barbeiroId)) }));
    const fat = U.soma(pg.map(x => x.p.valor)), com = U.soma(pg.map(x => x.p.comissaoValor));
    const fatServ = U.soma(pg.map(x => x.p.valorServico !== undefined ? x.p.valorServico : x.p.valor)), fatProd = r2(fat - fatServ);
    const totDesp = U.soma(desp.map(d => d.valor));
    const faltas = todos.filter(a => a.status === 'faltou').length, canc = todos.filter(a => a.status === 'cancelado').length;
    const agendaram = todos.filter(a => a.status !== 'cancelado');
    const pessoas = new Set(agendaram.map(a => a.clienteTelefone)).size;
    const agrupa = (lista, fk, fv) => { const m = {}; lista.forEach(x => { const k = fk(x); m[k] = m[k] || { n: k, q: 0, v: 0 }; m[k].q++; m[k].v += fv(x); }); return Object.values(m).sort((a, b) => b.v - a.v); };
    const porForma = agrupa(pg, x => x.p.semRegistro ? 'Não registrada' : fmtForma(x.p.forma), x => x.p.valor);
    const porServ = agrupa(pg, x => x.a.servicosNome, x => x.p.valorServico !== undefined ? x.p.valorServico : x.p.valor);
    const itens = []; conc.forEach(a => (a.itens || []).forEach(i => itens.push(i)));
    const porProd = (() => { const mm = {}; itens.forEach(i => { mm[i.nome] = mm[i.nome] || { n: i.nome, q: 0, v: 0 }; mm[i.nome].q += i.qtd; mm[i.nome].v += i.qtd * i.preco; }); return Object.values(mm).sort((a, b) => b.v - a.v); })();
    const porDow = [1, 2, 3, 4, 5, 6, 0].map(i => { const l = pg.filter(x => U.diaSemana(x.a.data) === i); return { n: DIAS[i], q: l.length, v: U.soma(l.map(x => x.p.valor)) }; });
    const porOrigem = agrupa(agendaram, a => ORIGENS[a.origem] || 'Site', () => 1);
    const nd = Number(U.limitesMes(A.mesRel)[1].slice(8));
    const porDia = Array.from({ length: nd }, (_, i) => { const d = A.mesRel + '-' + String(i + 1).padStart(2, '0'); return { d, v: U.soma(pg.filter(x => x.a.data === d).map(x => x.p.valor)) }; });
    const mxD = Math.max(1, ...porDia.map(x => x.v));
    return `<div class="kpis kpis-6">
        <div><span>Pessoas que agendaram</span><b>${pessoas}</b></div>
        <div><span>Agendamentos</span><b>${agendaram.length}</b></div>
        <div><span>Atendidos</span><b>${conc.length}</b></div>
        <div><span>Faltas · cancelados</span><b>${faltas} · ${canc} <small>${pct(faltas, conc.length + faltas)} falta</small></b></div>
        <div><span>Ticket médio</span><b>${U.dinheiro(conc.length ? fat / conc.length : 0)}</b></div>
        <div><span>Gasto médio por cliente</span><b>${U.dinheiro(pessoas ? fat / pessoas : 0)}</b></div></div>
      <div class="kpis kpis-6">
        <div><span>Faturamento</span><b>${U.dinheiro(fat)}</b></div>
        <div><span>Serviços</span><b>${U.dinheiro(fatServ)}</b></div>
        <div><span>Comanda (produtos)</span><b>${U.dinheiro(fatProd)}</b></div>
        <div><span>Comissões</span><b>− ${U.dinheiro(com)}</b></div>
        <div><span>Despesas</span><b>− ${U.dinheiro(totDesp)}</b></div>
        <div class="destaque"><span>Lucro estimado</span><b>${U.dinheiro(fat - com - totDesp)}</b></div></div>
      <section class="bloco"><h3>Faturamento por dia</h3>
        <div class="colunas-dia" role="img" aria-label="Faturamento diário do mês">${porDia.map(x => `<div title="${fmtCurta(x.d)}: ${U.dinheiro(x.v)}"><i style="height:${(x.v / mxD * 100).toFixed(1)}%"></i><small>${Number(x.d.slice(8))}</small></div>`).join('')}</div></section>
      <section class="bloco"><h3>Por barbeiro</h3>
        ${F.resumo.length ? `<table class="tabela stack"><thead><tr><th>Barbeiro</th><th class="num">Atend.</th><th class="num">Faturamento</th><th class="num">Ticket médio</th><th class="num">Comissão</th><th class="num">Fica na casa</th><th class="num">Faltas</th></tr></thead><tbody>
        ${F.resumo.map(r => `<tr><td><strong>${esc(r.nome)}</strong></td><td class="num">${r.atendimentos}</td><td class="num">${U.dinheiro(r.produzido)}</td><td class="num">${U.dinheiro(r.atendimentos ? r.produzido / r.atendimentos : 0)}</td><td class="num">${U.dinheiro(r.comissao)}</td><td class="num">${U.dinheiro(r.casa)}</td><td class="num">${r.faltas}</td></tr>`).join('')}
        </tbody></table>` : '<p class="vazio">Sem dados.</p>'}</section>
      <div class="duas"><section class="card"><h3>Forma de pagamento</h3>${barrasHTML(porForma)}</section>
        <section class="card"><h3>Dia da semana</h3>${barrasHTML(porDow.filter(x => x.q))}</section></div>
      <div class="duas"><section class="card"><h3>Serviços</h3>${barrasHTML(porServ)}</section>
        <section class="card"><h3>Produtos da comanda</h3>${barrasHTML(porProd)}</section></div>
      <section class="bloco"><h3>Como agendaram</h3>${barrasHTML(porOrigem, v => v + ' agend.')}</section>
      <p class="ajuda">Faturamento conta só atendimentos finalizados (serviço + comanda). Despesas são as lançadas no mês na aba Despesas. Veja quem são os clientes em “Relatório de: Clientes”.</p>`;
  }
  const r2 = U.r2;

  function htmlRelClientes(todos) {
    const m = {};
    todos.forEach(a => {
      const k = a.clienteTelefone;
      const c = m[k] = m[k] || { nome: a.clienteNome, tel: k, ag: 0, at: 0, falt: 0, canc: 0, gasto: 0, ultima: '' };
      c.nome = a.clienteNome;
      if (a.status === 'cancelado') c.canc++; else c.ag++;
      if (a.status === 'faltou') c.falt++;
      if (a.status === 'concluido') { c.at++; c.gasto += U.pagDe(a, barbDe(a.barbeiroId)).valor; if (a.data > c.ultima) c.ultima = a.data; }
    });
    const l = Object.values(m).sort((x, y) => y.gasto - x.gasto || y.ag - x.ag);
    const gasto = U.soma(l.map(c => c.gasto)), ativos = l.filter(c => c.ag);
    return `<div class="kpis kpis-6">
        <div><span>Pessoas que agendaram</span><b>${ativos.length}</b></div>
        <div><span>Agendamentos</span><b>${U.soma(l.map(c => c.ag))}</b></div>
        <div><span>Compareceram</span><b>${l.filter(c => c.at).length}</b></div>
        <div><span>Voltaram 2+ vezes</span><b>${l.filter(c => c.at >= 2).length}</b></div>
        <div><span>Faltaram</span><b>${l.filter(c => c.falt).length}</b></div>
        <div class="destaque"><span>Valor gasto pelos clientes</span><b>${U.dinheiro(gasto)}</b></div></div>
      <div class="filtros"><label class="busca">Buscar cliente<input id="cl-busca" type="search" placeholder="Nome ou telefone"></label></div>
      ${l.length ? `<table class="tabela stack" id="cl-tab"><thead><tr><th>Cliente</th><th>Telefone</th><th class="num">Agendou</th><th class="num">Veio</th><th class="num">Faltou</th><th class="num">Cancelou</th><th class="num">Gastou</th><th>Última visita</th></tr></thead><tbody>
        ${l.map(c => `<tr data-busca="${esc((c.nome + ' ' + c.tel).toLowerCase())}"><td><strong>${esc(c.nome)}</strong></td><td><a href="${esc(waLink(c.tel, `Olá, ${c.nome.split(' ')[0]}! `))}" target="_blank" rel="noopener">${esc(U.fone(c.tel))}</a></td><td class="num">${c.ag}</td><td class="num">${c.at}</td><td class="num">${c.falt}</td><td class="num">${c.canc}</td><td class="num">${U.dinheiro(c.gasto)}</td><td>${c.ultima ? fmtCurta(c.ultima) : '—'}</td></tr>`).join('')}
      </tbody></table>` : '<p class="vazio">Ninguém agendou neste mês.</p>'}
      <p class="ajuda">Clientes são identificados pelo telefone. “Gastou” soma serviço + comanda dos atendimentos finalizados no mês.</p>`;
  }
  function ligarBuscaClientes(box) {
    const i = $('#cl-busca', box); if (!i) return;
    i.oninput = () => { const t = i.value.trim().toLowerCase(), d = U.soDigitos(t); $$('#cl-tab tbody tr', box).forEach(tr => { tr.hidden = !!t && !tr.dataset.busca.includes(t) && !(d && tr.dataset.busca.includes(d)); }); };
  }

  // -------------------------------------------------------- barbeiros
  function abaBarbeiros() {
    const bs = A.D.barbeiros;
    $('#adm-main').innerHTML = `<div class="barra"><h2>Barbeiros</h2><button class="btn" id="novo-b" type="button">+ Novo barbeiro</button></div>
      ${bs.length ? `<div class="cards">${bs.map(b => `<article class="card cb${b.ativo ? '' : ' inativo'}">
        ${avatar(b, 'av av-g')}<div><h3>${esc(b.nome)}</h3>${b.bio ? `<p>${esc(b.bio)}</p>` : ''}
        <p class="mini">${ORDEM_SEMANA.filter(i => b.horarios[i] && b.horarios[i].aberto).map(i => DIAS_C[i]).join(' · ') || 'Sem dias de atendimento'}</p>
        <p class="mini">Comissão ${U.pctComissao(b)}% · ${b.usuario && b.temAcesso ? `usuário <b>${esc(b.usuario)}</b>` : '<b>Sem usuário/senha de acesso</b>'}${b.ativo ? '' : ' · <b>inativo</b>'}</p>
        ${b.bloqueadoAte ? `<p class="mini bloq">Bloqueado por senha errada até ${new Date(b.bloqueadoAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} <button class="link" type="button" data-desb="${esc(b.id)}">Desbloquear</button></p>` : ''}</div>
        <div class="cb-acoes"><button class="btn btn-sec btn-sm" data-ed="${esc(b.id)}" type="button">Editar</button><button class="btn btn-sec btn-sm perigo" data-ex="${esc(b.id)}" type="button">Excluir</button></div></article>`).join('')}</div>`
        : '<p class="vazio">Nenhum barbeiro cadastrado.</p>'}
      <p class="ajuda">Cada barbeiro entra em <b>${esc(location.href.split('#')[0])}#barbeiro</b> com o usuário e a senha definidos aqui. Depois de 5 senhas erradas o acesso dele fica bloqueado (15 min, depois 1 h, depois 24 h); você pode desbloquear por aqui.</p>`;
    $('#novo-b').onclick = () => modalBarbeiro();
    $('#adm-main').onclick = e => {
      const ed = e.target.closest('[data-ed]'), ex = e.target.closest('[data-ex]'), db = e.target.closest('[data-desb]');
      if (db) return seguro(async () => { await Api.admin.desbloquear(db.dataset.desb); await recarregar(); abaBarbeiros(); toast('Acesso desbloqueado.'); });
      if (ed) modalBarbeiro(bs.find(b => b.id === ed.dataset.ed));
      if (ex) {
        const b = bs.find(x => x.id === ex.dataset.ex);
        confirmar(`Excluir ${b.nome}? Os agendamentos futuros dele serão cancelados (o histórico e o financeiro ficam). Se for só uma pausa, prefira desmarcar "Ativo".`).then(ok => ok && seguro(async () => {
          const r = await Api.admin.excluirBarbeiro(b.id); await recarregar(); abaBarbeiros();
          toast(r.cancelados ? `Excluído. ${r.cancelados} agendamento(s) cancelado(s) — avise os clientes.` : 'Barbeiro excluído.');
        }));
      }
    };
  }

  function modalBarbeiro(b0) {
    const padrao = [0, 1, 2, 3, 4, 5, 6].map(i => ({ aberto: i !== 0, inicio: '09:00', fim: i === 6 ? '17:00' : '19:00', pausaInicio: i === 6 ? '' : '12:00', pausaFim: i === 6 ? '' : '13:00' }));
    const b = b0 ? JSON.parse(JSON.stringify(b0)) : { id: '', nome: '', bio: '', foto: '', ativo: true, comissao: 50, servicos: [], horarios: padrao, ordem: A.D.barbeiros.length };
    const corpo = `<div class="foto-campo"><div id="b-prev">${avatar(b, 'av av-xg')}</div>
        <div><label class="btn btn-sec btn-sm">Escolher foto<input type="file" accept="image/*" id="b-foto" hidden></label>
        <button type="button" class="link" id="b-rem">Remover foto</button></div></div>
      <div class="campos">
        <label>Nome<input name="nome" maxlength="60" required value="${esc(b.nome)}"></label>
        <label>Descrição curta<input name="bio" maxlength="140" placeholder="Ex.: especialista em degradê" value="${esc(b.bio)}"></label>
        <label>Comissão sobre serviços (%)<input name="comissao" type="number" min="0" max="100" step="0.5" value="${U.pctComissao(b)}" required></label>
        <label class="check"><input type="checkbox" name="ativo"${b.ativo ? ' checked' : ''}> Ativo — aparece no site e recebe agendamentos</label>
      </div>
      <h4>Acesso à área do barbeiro</h4>
      <div class="campos">
        <label>Usuário <i>(login)</i><input name="usuario" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(b.usuario || '')}" placeholder="Ex.: rafael"></label>
        <label>${b.temAcesso ? 'Nova senha <i>(em branco = manter)</i>' : 'Senha <i>(mín. 6 caracteres)</i>'}<input name="senha" type="text" autocomplete="new-password" maxlength="100" placeholder="${b.temAcesso ? '••••••' : 'Mín. 6 caracteres'}"></label>
        ${b.temAcesso ? '<label class="check full"><input type="checkbox" name="remover"> Remover acesso (ele não consegue mais entrar)</label>' : '<p class="ajuda full">Sem usuário e senha, ele não entra na área do barbeiro.</p>'}
        ${b.ultimoAcesso ? `<p class="ajuda full">Último acesso: ${fmtCurta(b.ultimoAcesso)} às ${new Date(b.ultimoAcesso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Trocar a senha desconecta ele de todos os aparelhos.</p>` : ''}
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
        f.nome.addEventListener('input', () => { if (!b0 || !b0.usuario) f.usuario.value = U.limparUsuario(f.nome.value.split(' ')[0]); });
        f.usuario.addEventListener('input', () => { const v = U.limparUsuario(f.usuario.value); if (v !== f.usuario.value) f.usuario.value = v; });
        $('#copiar-seg', f).onclick = () => { [2, 3, 4, 5].forEach(i => { ['ab', 'in', 'fi', 'pi', 'pf'].forEach(k => { const o = f[k + '1'], d = f[k + i]; if (k === 'ab') d.checked = o.checked; else d.value = o.value; }); }); toast('Copiado para terça a sexta.'); };
      },
      async aoEnviar(f) {
        if (!f.nome.value.trim()) throw new Error('Informe o nome.');
        const c = Number(f.comissao.value);
        if (!(c >= 0 && c <= 100)) throw new Error('Comissão entre 0 e 100%.');
        const senha = f.senha.value;
        const usuario = U.limparUsuario(f.usuario.value);
        if (senha) { const fraca = U.senhaFraca(senha); if (fraca) throw new Error(fraca); if (usuario.length < 3) throw new Error('Defina um usuário com pelo menos 3 letras ou números.'); }
        const horarios = [0, 1, 2, 3, 4, 5, 6].map(i => ({ aberto: f['ab' + i].checked, inicio: f['in' + i].value || '09:00', fim: f['fi' + i].value || '18:00', pausaInicio: f['pi' + i].value, pausaFim: f['pf' + i].value }));
        if (horarios.find(h => h.aberto && h.fim <= h.inicio)) throw new Error('Em algum dia o fim está antes do início.');
        const { temAcesso, bloqueadoAte, ultimoAcesso, ...base } = b;
        await Api.admin.salvarBarbeiro({ ...base, usuario, nome: f.nome.value.trim(), bio: f.bio.value.trim(), ativo: f.ativo.checked, comissao: c, servicos: $$('input[name=bs]:checked', f).map(i => i.value), horarios, novaSenha: senha || undefined, removerAcesso: f.remover ? f.remover.checked : false });
        await recarregar(); abaBarbeiros(); toast(senha ? `Salvo. Passe para ele: usuário ${usuario} e a senha que você digitou.` : 'Barbeiro salvo.');
      },
    });
  }

  // --------------------------------------------------------- serviços
  function abaServicos() {
    const ss = A.D.servicos;
    $('#adm-main').innerHTML = `<div class="barra"><h2>Serviços</h2><button class="btn" id="novo-s" type="button">+ Novo serviço</button></div>
      <p class="ajuda">A duração define quanto tempo o serviço ocupa na agenda. Para combos (ex.: corte + barba em 1h), cadastre como um serviço próprio — o cliente também pode marcar vários e as durações se somam. Bebidas e produtos ficam na aba Estoque.</p>
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
    const nomeB = id => id ? ((barbDe(id) || {}).nome || 'Barbeiro excluído') : 'Barbearia inteira';
    $('#adm-main').innerHTML = `<div class="barra"><h2>Folgas e fechamentos</h2><button class="btn" id="novo-bl" type="button">+ Fechar agenda</button></div>
      <p class="ajuda">Feriados, folgas, férias ou um horário específico. Os barbeiros também podem fechar a própria agenda pela área deles — aparece aqui como “pelo barbeiro”.</p>
      ${bl.length ? `<table class="tabela stack"><thead><tr><th>Quando</th><th>Quem</th><th>Período</th><th>Motivo</th><th></th></tr></thead><tbody>
      ${bl.map(b => `<tr><td>${fmtData(b.data)}${b.dataFim !== b.data ? ' até ' + fmtData(b.dataFim) : ''}</td><td>${esc(nomeB(b.barbeiroId))}${b.criadoPor === 'barbeiro' ? ' <small>(pelo barbeiro)</small>' : ''}</td><td>${b.diaInteiro ? 'Dia inteiro' : b.inicio + ' – ' + b.fim}</td><td>${esc(b.motivo || '—')}</td>
      <td class="acoes"><button class="btn btn-sec btn-sm perigo" data-ex="${esc(b.id)}" type="button">Reabrir</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="vazio">Nenhum fechamento programado.</p>'}`;
    $('#novo-bl').onclick = () => modalFechar({ b: { data: hoje, dataFim: hoje, diaInteiro: true, barbeiroId: '' }, barbeiros: A.D.barbeiros, salvar: d => Api.admin.salvarBloqueio(d), depois: async () => { await recarregar(); renderAba(); } });
    $('#adm-main').onclick = e => { const ex = e.target.closest('[data-ex]'); if (ex) seguro(async () => { await Api.admin.excluirBloqueio(ex.dataset.ex); await recarregar(); abaFolgas(); toast('Agenda reaberta.'); }); };
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
        <label>WhatsApp (com DDD)<input name="whatsapp" type="tel" inputmode="tel" value="${esc(U.fone(c.whatsapp || ''))}" placeholder="(00) 00000-0000"></label>
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
    if ($('#reset')) $('#reset').onclick = () => confirmar('Apagar tudo da demonstração e voltar aos dados de exemplo?', 'Restaurar').then(ok => { if (ok) Api.admin.resetarDemo(); });
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
    if (location.hash === '#admin') { trocarManifesto('admin'); abrirAdmin(); }
    else if (location.hash === '#barbeiro') { trocarManifesto('barbeiro'); abrirBarbeiro(); }
    else { trocarManifesto('site'); abrirSite(); }
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
