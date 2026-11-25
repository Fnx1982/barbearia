// =====================================================================
//  app.js — site do cliente, área do barbeiro (#barbeiro) e painel (#admin)   versão 2
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
  const MESES_C = MESES.map(m => m.slice(0, 3));
  const fmtMes = mes => { const [y, m] = mes.split('-').map(Number); const n = MESES[m - 1]; return `${n[0].toUpperCase() + n.slice(1)} de ${y}`; };
  const inicioSemana = iso => U.addDias(iso, -((U.diaSemana(iso) + 6) % 7));
  const fmtCurta = iso => { const d = new Date(iso + 'T12:00:00Z'); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
  const ehHoje = iso => iso === U.hojeISO();
  const ESTADOS = { confirmado: 'Agendado', concluido: 'Finalizado', faltou: 'Faltou', cancelado: 'Cancelado' };

  function chip(a) {
    if (a.status === 'concluido') return a.conferido ? '<span class="chip ok">Conferido</span>' : '<span class="chip warn">A conferir</span>';
    return `<span class="chip st-${a.status}">${ESTADOS[a.status]}</span>`;
  }
  function linhaPag(a, b) {
    if (a.status !== 'concluido') return '';
    const p = U.pagDe(a, b);
    return `<span class="pag-linha">${p.semRegistro ? 'Sem registro de pagamento' : esc(U.FORMAS[p.forma] || p.forma)} · <b>${U.dinheiro(p.valor)}</b>${p.valor !== a.total ? ` <small>(tabela ${U.dinheiro(a.total)})</small>` : ''}${p.obs ? ` · ${esc(p.obs)}` : ''}</span>`;
  }
  function barrasHTML(l, fmt = U.dinheiro) {
    const mx = Math.max(1, ...l.map(x => x.v));
    return l.length ? `<ul class="barras">${l.map(x => `<li><span>${esc(x.n)}</span><div><i style="width:${(x.v / mx * 100).toFixed(1)}%"></i></div><b>${fmt(x.v)}</b><small>${x.q != null ? x.q + '×' : ''}</small></li>`).join('')}</ul>` : '<p class="vazio">Sem dados no período.</p>';
  }
  function navMes(id, mes) {
    return `<div class="nav-data" id="${id}"><button class="btn btn-sec btn-ic" data-m="-1" type="button" aria-label="Mês anterior">‹</button><strong class="nav-rotulo">${fmtMes(mes)}</strong><button class="btn btn-sec btn-ic" data-m="1" type="button" aria-label="Próximo mês">›</button></div>`;
  }
  function imprimir() { try { window.print(); } catch (e) { toast('Use Ctrl+P para imprimir ou salvar em PDF.'); } }

  function modalFinalizar(a, enviar, aoTerminar) {
    const atual = a.pagamento || {};
    modal({
      titulo: 'Finalizar atendimento', botao: 'Finalizar',
      corpo: `<p class="mf-resumo"><b>${esc(a.clienteNome)}</b><br>${esc(a.servicosNome)} · ${fmtData(a.data)} às ${U.toHora(a.inicio)}</p>
        <fieldset class="formas"><legend>Forma de pagamento</legend>${Object.entries(U.FORMAS).map(([k, n], i) => `<label class="pill"><input type="radio" name="forma" value="${k}"${(atual.forma ? atual.forma === k : i === 0) ? ' checked' : ''}><span>${n}</span></label>`).join('')}</fieldset>
        <div class="campos">
          <label>Valor cobrado (R$)<input name="valor" type="number" step="0.01" min="0" inputmode="decimal" value="${atual.valor != null ? atual.valor : a.total}"></label>
          <label>Observação <i>(opcional)</i><input name="obs" maxlength="200" value="${esc(atual.obs || '')}" placeholder="Ex.: + pomada, desconto"></label>
        </div><p class="ajuda">Valor de tabela: ${U.dinheiro(a.total)}. Ajuste se teve desconto ou serviço extra.</p>`,
      async aoEnviar(f) {
        const forma = (f.querySelector('input[name=forma]:checked') || {}).value;
        if (!forma) throw new Error('Escolha a forma de pagamento.');
        if (f.valor.value === '' || Number(f.valor.value) < 0) throw new Error('Informe o valor cobrado.');
        await enviar({ forma, valor: Number(f.valor.value), obs: f.obs.value.trim() });
        toast('Atendimento finalizado.');
        if (aoTerminar) aoTerminar();
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
        ${pags.length ? `<table class="tabela stack"><thead><tr><th>Data</th><th>Tipo</th><th>Forma</th><th class="num">Valor</th><th>Obs.</th></tr></thead><tbody>
        ${pags.map(p => `<tr><td>${fmtCurta(p.data)}</td><td>${p.tipo === 'vale' ? 'Vale / adiantamento' : 'Pagamento'}</td><td>${esc(U.FORMAS[p.forma] || p.forma)}</td><td class="num">${U.dinheiro(p.valor)}</td><td>${esc(p.obs || '—')}</td></tr>`).join('')}</tbody></table>` : '<p class="vazio">Nenhum pagamento neste mês.</p>'}
      </section>
      <section class="bloco"><h3>Atendimentos finalizados</h3>
        ${conc.length ? `<table class="tabela stack"><thead><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th>Pagamento</th><th class="num">Valor</th><th class="num">Comissão</th><th>Conferido</th></tr></thead><tbody>
        ${conc.map(a => { const p = U.pagDe(a); return `<tr><td>${fmtCurta(a.data)} ${U.toHora(a.inicio)}</td><td>${esc(a.clienteNome)}</td><td>${esc(a.servicosNome)}</td><td>${p.semRegistro ? '—' : esc(U.FORMAS[p.forma] || p.forma)}</td><td class="num">${U.dinheiro(p.valor)}</td><td class="num">${U.dinheiro(p.comissaoValor)}</td><td>${a.conferido ? 'Sim' : 'Não'}</td></tr>`; }).join('')}</tbody></table>` : '<p class="vazio">Nenhum atendimento finalizado neste mês.</p>'}
      </section>`;
  }

  // =================================================== ÁREA DO BARBEIRO
  const BB = { aba: 'dia', data: U.hojeISO(), sem: inicioSemana(U.hojeISO()), mes: U.hojeISO().slice(0, 7), me: null, cfg: null };
  const ABAS_B = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ganhos', 'Meus ganhos']];

  async function loginBarbeiro() {
    app.innerHTML = '<p class="carregando">Carregando…</p>';
    let pub;
    try { pub = await Api.publico(); } catch (e) { app.innerHTML = `<p class="vazio">${esc(e.message)}</p>`; return; }
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
    try { const r = await Api.barb.inicio(); BB.me = r.barbeiro; BB.cfg = r.config; }
    catch (e) { if (e.auth) return loginBarbeiro(); app.innerHTML = `<p class="vazio">${esc(e.message)}</p>`; return; }
    aplicarMarca(BB.cfg, true); document.title = BB.me.nome + ' · Agenda';
    app.innerHTML = `<div class="adm"><header class="adm-topo"><div class="wrap topo-in">
        <span class="marca">${avatar(BB.me)}<span>${esc(BB.me.nome)}</span></span>
        <div class="adm-acoes"><button class="btn btn-sec btn-sm" id="sair" type="button">Sair</button></div></div>
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
    ({ dia: bDia, semana: bSemana, mes: bMes, ganhos: bGanhos })[BB.aba]();
  }

  function itemBarb(a) {
    const msg = `Olá, ${a.clienteNome.split(' ')[0]}! Aqui é o ${BB.me.nome}, da ${BB.cfg.nome}. `;
    let acoes = '';
    if (a.status === 'confirmado') acoes = `<button class="btn btn-sm" data-fin="${esc(a.id)}" type="button">Finalizar</button><button class="btn btn-sec btn-sm" data-st="faltou" data-id="${esc(a.id)}" type="button">Faltou</button>`;
    else if ((a.status === 'concluido' && !a.conferido) || a.status === 'faltou') acoes = `<button class="btn btn-sec btn-sm" data-st="confirmado" data-id="${esc(a.id)}" type="button">Reabrir</button>${a.status === 'concluido' ? `<button class="btn btn-sec btn-sm" data-fin="${esc(a.id)}" type="button">Corrigir pagamento</button>` : ''}`;
    return `<li class="ag st-${a.status}">
      <time>${U.toHora(a.inicio)}<small>${U.toHora(a.fim)}</small></time>
      <div class="ag-info"><strong>${esc(a.clienteNome)} ${chip(a)}</strong>
        <span>${esc(a.servicosNome)} · ${U.dinheiro(a.total)}</span>
        <a class="tel" href="${esc(waLink(a.clienteTelefone, msg))}" target="_blank" rel="noopener">${esc(U.fone(a.clienteTelefone))} · WhatsApp</a>
        ${a.obs ? `<em>“${esc(a.obs)}”</em>` : ''}${linhaPag(a, BB.me)}</div>
      ${acoes ? `<div class="ag-acoes">${acoes}</div>` : ''}</li>`;
  }
  function ligarItensBarb(box, lista, recarregar) {
    box.onclick = e => {
      const fin = e.target.closest('[data-fin]'), st = e.target.closest('[data-st]');
      if (fin) { const a = lista.find(x => x.id === fin.dataset.fin); modalFinalizar(a, d => Api.barb.finalizar(a.id, d), recarregar); }
      if (st) {
        const a = lista.find(x => x.id === st.dataset.id), novo = st.dataset.st;
        const txt = novo === 'faltou' ? `Marcar que ${a.clienteNome} faltou?` : 'Reabrir este atendimento? O pagamento registrado será apagado.';
        confirmar(txt, novo === 'faltou' ? 'Marcar falta' : 'Reabrir', false).then(ok => ok && seguroB(async () => { await Api.barb.status(a.id, novo); toast('Atualizado.'); recarregar(); }));
      }
    };
  }

  function bDia() {
    const m = $('#adm-main');
    m.innerHTML = `<div class="barra"><div class="nav-data" id="nav-d"><button class="btn btn-sec btn-ic" data-d="-1" type="button" aria-label="Dia anterior">‹</button>
      <input type="date" id="d-data" value="${BB.data}" aria-label="Data"><button class="btn btn-sec btn-ic" data-d="1" type="button" aria-label="Próximo dia">›</button>
      <button class="btn btn-sec btn-sm" data-d="0" type="button">Hoje</button></div></div>
      <h2 class="titulo-data">${fmtDataLonga(BB.data)}${ehHoje(BB.data) ? ' <small>hoje</small>' : ''}</h2><div id="d-cont"><p class="carregando">Carregando…</p></div>`;
    $$('#nav-d [data-d]').forEach(b => b.onclick = () => { const n = Number(b.dataset.d); BB.data = n ? U.addDias(BB.data, n) : U.hojeISO(); bDia(); });
    $('#d-data').onchange = e => { if (e.target.value) { BB.data = e.target.value; bDia(); } };
    seguroB(async () => {
      const ags = await Api.barb.agendamentos(BB.data, BB.data);
      const conc = ags.filter(a => a.status === 'concluido'), pg = conc.map(a => U.pagDe(a, BB.me));
      const h = (BB.me.horarios || [])[U.diaSemana(BB.data)];
      const box = $('#d-cont'); if (!box) return;
      box.innerHTML = `<div class="kpis">
          <div><span>Na agenda</span><b>${ags.filter(a => a.status !== 'cancelado').length}</b></div>
          <div><span>Finalizados</span><b>${conc.length}</b></div>
          <div><span>Produzido</span><b>${U.dinheiro(U.soma(pg.map(p => p.valor)))}</b></div>
          <div><span>Minha comissão</span><b>${U.dinheiro(U.soma(pg.map(p => p.comissaoValor)))}</b></div></div>
        <p class="ajuda">${h && h.aberto ? `Expediente ${h.inicio}–${h.fim}${h.pausaInicio ? ` · pausa ${h.pausaInicio}–${h.pausaFim}` : ''}` : 'Folga neste dia da semana.'}</p>
        ${ags.length ? `<ol class="ags">${ags.map(itemBarb).join('')}</ol>` : '<p class="vazio">Nenhum agendamento neste dia.</p>'}`;
      ligarItensBarb(box, ags, bDia);
    });
  }

  function bSemana() {
    const fim = U.addDias(BB.sem, 6);
    $('#adm-main').innerHTML = `<div class="barra"><div class="nav-data" id="nav-s"><button class="btn btn-sec btn-ic" data-s="-7" type="button" aria-label="Semana anterior">‹</button>
      <strong class="nav-rotulo">${fmtCurta(BB.sem)} a ${fmtCurta(fim)}</strong><button class="btn btn-sec btn-ic" data-s="7" type="button" aria-label="Próxima semana">›</button>
      <button class="btn btn-sec btn-sm" data-s="0" type="button">Esta semana</button></div></div><div id="s-cont"><p class="carregando">Carregando…</p></div>`;
    $$('#nav-s [data-s]').forEach(b => b.onclick = () => { const n = Number(b.dataset.s); BB.sem = n ? U.addDias(BB.sem, n) : inicioSemana(U.hojeISO()); bSemana(); });
    seguroB(async () => {
      const ags = (await Api.barb.agendamentos(BB.sem, fim)).filter(a => a.status !== 'cancelado');
      const box = $('#s-cont'); if (!box) return;
      const dias = [0, 1, 2, 3, 4, 5, 6].map(i => U.addDias(BB.sem, i));
      const pg = ags.filter(a => a.status === 'concluido').map(a => U.pagDe(a, BB.me));
      box.innerHTML = `<div class="kpis"><div><span>Na semana</span><b>${ags.length}</b></div><div><span>Finalizados</span><b>${pg.length}</b></div>
        <div><span>Produzido</span><b>${U.dinheiro(U.soma(pg.map(p => p.valor)))}</b></div><div><span>Minha comissão</span><b>${U.dinheiro(U.soma(pg.map(p => p.comissaoValor)))}</b></div></div>
        <div class="semana">${dias.map(d => { const l = ags.filter(a => a.data === d); return `<section class="sem-dia${ehHoje(d) ? ' hoje' : ''}">
          <button type="button" class="sem-cab" data-ir-dia="${d}"><b>${DIAS_C[U.diaSemana(d)]} ${fmtCurta(d)}</b><span>${l.length ? l.length + ' agend.' : 'livre'}</span></button>
          ${l.length ? `<ul>${l.map(a => `<li class="st-${a.status}"><time>${U.toHora(a.inicio)}</time><span>${esc(a.clienteNome)}<small>${esc(a.servicosNome)}</small></span>${a.status !== 'confirmado' ? chip(a) : ''}</li>`).join('')}</ul>` : ''}</section>`; }).join('')}</div>`;
      box.onclick = e => { const d = e.target.closest('[data-ir-dia]'); if (d) { BB.data = d.dataset.irDia; BB.aba = 'dia'; abaBarb(); } };
    });
  }

  function htmlCalendario(mes, ags, b) {
    const [ini, fim] = U.limitesMes(mes);
    const off = (U.diaSemana(ini) + 6) % 7, n = Number(fim.slice(8));
    let h = `<div class="cal" role="grid">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => `<span class="cal-h">${d}</span>`).join('')}`;
    for (let i = 0; i < off; i++) h += '<span class="cal-v"></span>';
    for (let d = 1; d <= n; d++) {
      const iso = mes + '-' + String(d).padStart(2, '0');
      const l = ags.filter(a => a.data === iso && a.status !== 'cancelado');
      const prod = U.soma(l.filter(a => a.status === 'concluido').map(a => U.pagDe(a, b).valor));
      h += `<button type="button" class="cal-d${ehHoje(iso) ? ' hoje' : ''}${l.length ? ' tem' : ''}" data-ir-dia="${iso}"><b>${d}</b>${l.length ? `<span>${l.length} agend.</span>` : ''}${prod ? `<small>${U.dinheiro(prod)}</small>` : ''}</button>`;
    }
    return h + '</div>';
  }

  function bMes() {
    $('#adm-main').innerHTML = `<div class="barra">${navMes('nav-m', BB.mes)}</div><div id="m-cont"><p class="carregando">Carregando…</p></div>`;
    $$('#nav-m [data-m]').forEach(b => b.onclick = () => { BB.mes = U.addMes(BB.mes, Number(b.dataset.m)); bMes(); });
    seguroB(async () => {
      const [ini, fim] = U.limitesMes(BB.mes);
      const ags = await Api.barb.agendamentos(ini, fim);
      const box = $('#m-cont'); if (!box) return;
      const pg = ags.filter(a => a.status === 'concluido').map(a => U.pagDe(a, BB.me));
      box.innerHTML = `<div class="kpis"><div><span>Agendamentos</span><b>${ags.filter(a => a.status !== 'cancelado').length}</b></div><div><span>Finalizados</span><b>${pg.length}</b></div>
        <div><span>Produzido</span><b>${U.dinheiro(U.soma(pg.map(p => p.valor)))}</b></div><div><span>Minha comissão</span><b>${U.dinheiro(U.soma(pg.map(p => p.comissaoValor)))}</b></div></div>
        ${htmlCalendario(BB.mes, ags, BB.me)}<p class="ajuda">Toque em um dia para ver a agenda e finalizar atendimentos.</p>`;
      box.onclick = e => { const d = e.target.closest('[data-ir-dia]'); if (d) { BB.data = d.dataset.irDia; BB.aba = 'dia'; abaBarb(); } };
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
      box.innerHTML = htmlExtrato(f.resumo, ags, f.pagamentos, 'barbeiro') + '<p class="ajuda">“A receber” soma a comissão do mês com o saldo dos meses anteriores e desconta o que já foi pago, incluindo vales.</p>';
    });
  }

  // ========================================================== ADMIN
  const A = { tab: 'agenda', data: U.hojeISO(), D: null, ags: [], mesFin: U.hojeISO().slice(0, 7), mesRel: U.hojeISO().slice(0, 7), relB: '' };
  const ABAS = [['agenda', 'Agenda'], ['financeiro', 'Financeiro'], ['relatorios', 'Relatórios'], ['barbeiros', 'Barbeiros'], ['servicos', 'Serviços'], ['folgas', 'Folgas'], ['config', 'Configurações']];

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
        <div class="adm-acoes"><a class="btn btn-sec btn-sm" href="#inicio">Ver site</a><button class="btn btn-sec btn-sm" id="sair" type="button">Sair</button></div></div>
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
    $('#adm-main').onclick = null; $('#adm-main').onchange = null;
    ({ agenda: abaAgenda, financeiro: abaFinanceiro, relatorios: abaRelatorios, barbeiros: abaBarbeiros, servicos: abaServicos, folgas: abaFolgas, config: abaConfig })[A.tab]();
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
    $('#novo-ag').onclick = () => modalAgendamento();
    $('#fechar-dia').onclick = () => modalBloqueio({ data: A.data, dataFim: A.data, diaInteiro: true, barbeiroId: '' });
    seguro(async () => { A.ags = await Api.admin.agendamentos(A.data, A.data); desenharAgenda(); });
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
        <div><span>Previsto</span><b>${U.dinheiro(U.soma(validos.filter(a => a.status !== 'faltou').map(a => a.status === 'concluido' ? U.pagDe(a, barbDe(a.barbeiroId)).valor : a.total)))}</b></div>
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
    const ac = el.dataset.acao;
    if (ac === 'fin') modalFinalizar(a, d => Api.admin.finalizar(a.id, d), depois);
    if (ac === 'det') modalDetalhes(a, depois);
    if (ac === 'faltou' || ac === 'reabrir') {
      const novo = ac === 'faltou' ? 'faltou' : 'confirmado';
      confirmar(novo === 'faltou' ? `Marcar que ${a.clienteNome} faltou?` : 'Reabrir este agendamento?' + (a.status === 'concluido' ? ' O pagamento registrado será apagado.' : ''), novo === 'faltou' ? 'Marcar falta' : 'Reabrir', false)
        .then(ok => ok && seguro(async () => { await Api.admin.atualizar(a.id, { status: novo }); toast('Atualizado.'); depois(); }));
    }
  }

  function itemAg(a) {
    let acoes;
    if (a.status === 'confirmado') acoes = `<button class="btn btn-sm" data-acao="fin" data-id="${esc(a.id)}" type="button">Finalizar</button><button class="btn btn-sec btn-sm" data-acao="faltou" data-id="${esc(a.id)}" type="button">Faltou</button>`;
    else if (a.status === 'concluido') acoes = `<button class="btn ${a.conferido ? 'btn-sec' : ''} btn-sm" data-acao="det" data-id="${esc(a.id)}" type="button">${a.conferido ? 'Ver' : 'Conferir'}</button>`;
    else acoes = `<button class="btn btn-sec btn-sm" data-acao="reabrir" data-id="${esc(a.id)}" type="button">Reabrir</button>`;
    if (a.status !== 'concluido') acoes += `<button class="btn btn-sec btn-sm" data-acao="det" data-id="${esc(a.id)}" type="button">Detalhes</button>`;
    return `<li class="ag st-${a.status}">
      <time>${U.toHora(a.inicio)}<small>${U.toHora(a.fim)}</small></time>
      <div class="ag-info"><strong>${esc(a.clienteNome)} ${chip(a)}</strong>
        <span>${esc(a.servicosNome)} · ${U.dinheiro(a.total)}</span>
        <span class="tel">${esc(U.fone(a.clienteTelefone))}${a.origem === 'balcao' ? ' · <i>balcão</i>' : ''}${(a.anexos || []).length ? ` · ${a.anexos.length} anexo(s)` : ''}</span>
        ${a.obs ? `<em>“${esc(a.obs)}”</em>` : ''}${linhaPag(a, barbDe(a.barbeiroId))}</div>
      <div class="ag-acoes">${acoes}</div></li>`;
  }

  function htmlAnexos(a) {
    const l = a.anexos || [];
    return l.length ? `<ul class="anexos">${l.map(x => `<li><span class="an-ic">${x.tipo === 'application/pdf' ? 'PDF' : 'IMG'}</span><span class="an-nome">${esc(x.nome)}<small>${U.tamanho(x.tamanho)}</small></span>
      <button type="button" class="btn btn-sec btn-sm" data-ver="${esc(x.id)}">Ver</button><button type="button" class="btn btn-sec btn-sm perigo" data-exc="${esc(x.id)}">Excluir</button></li>`).join('')}</ul>` : '<p class="ajuda">Nenhum arquivo anexado.</p>';
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
          <dt>Origem</dt><dd>${a.origem === 'balcao' ? 'Balcão / telefone' : 'Site'}</dd>
          ${a.obs ? `<dt>Obs. do cliente</dt><dd>${esc(a.obs)}</dd>` : ''}
        </dl>
        ${p ? `<h4>Pagamento</h4><dl class="ok-det det">
          <dt>Forma</dt><dd>${p.semRegistro ? 'Não registrada (finalizado na versão anterior)' : esc(U.FORMAS[p.forma] || p.forma)}</dd>
          <dt>Valor cobrado</dt><dd>${U.dinheiro(p.valor)}</dd>
          <dt>Comissão</dt><dd>${U.dinheiro(p.comissaoValor)} (${p.comissaoPct}%) · fica na casa ${U.dinheiro(p.valor - p.comissaoValor)}</dd>
          ${p.obs ? `<dt>Obs.</dt><dd>${esc(p.obs)}</dd>` : ''}
          ${p.finalizadoEm ? `<dt>Finalizado</dt><dd>${p.finalizadoPor === 'admin' ? 'pela gerência' : 'pelo barbeiro'} em ${fmtCurta(p.finalizadoEm.slice(0, 10))} ${p.finalizadoEm.slice(11, 16)}</dd>` : ''}
        </dl><button type="button" class="link" id="corrigir">Corrigir pagamento</button>
        <label class="check confere"><input type="checkbox" name="conferido"${a.conferido ? ' checked' : ''}> <b>Conferido</b> — valor e forma de pagamento batem com o caixa</label>`
        : `<p class="aviso-leve">${a.status === 'confirmado' ? 'Ainda não finalizado. Finalize para registrar o pagamento e liberar a conferência.' : 'Atendimento ' + ESTADOS[a.status].toLowerCase() + '.'}</p>`}
        <h4>Comprovantes e arquivos</h4>
        <div id="anexos">${htmlAnexos(a)}</div>
        <label class="btn btn-sec btn-sm anexar">+ Anexar arquivo<input type="file" id="arq" accept="image/*,application/pdf" hidden></label>
        <p class="ajuda">Foto do comprovante Pix, recibo da maquininha, PDF. Até 8 MB por arquivo.</p>
        <div id="visor"></div>
        <label>Observação interna <i>(o barbeiro não vê)</i><textarea name="obsInterna" maxlength="500" rows="2">${esc(a.obsInterna || '')}</textarea></label>
        <div class="det-acoes">${a.status === 'confirmado' ? '<button type="button" class="btn btn-sm" id="d-fin">Finalizar agora</button><button type="button" class="btn btn-sec btn-sm perigo" id="d-cancel">Cancelar agendamento</button>' : ''}
        ${a.status === 'concluido' ? '<button type="button" class="btn btn-sec btn-sm" id="d-reabrir">Desfazer finalização</button>' : ''}</div>`,
      aoAbrir(f) {
        const area = $('#anexos', f), visor = $('#visor', f);
        $('#arq', f).onchange = async e => {
          let file = e.target.files[0]; e.target.value = ''; if (!file) return;
          try {
            if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size > 900 * 1024) {
              const url = await lerImagem(file, 1800); const blob = await (await fetch(url)).blob();
              file = new File([blob], file.name.replace(/\.\w+$/, '') + (blob.type === 'image/webp' ? '.webp' : '.png'), { type: blob.type });
            }
            area.innerHTML = '<p class="carregando">Enviando…</p>';
            a = await Api.admin.anexar(a.id, file); alterou = true; area.innerHTML = htmlAnexos(a); toast('Arquivo anexado.');
          } catch (err) { area.innerHTML = htmlAnexos(a); toast(err.message, 'erro'); }
        };
        area.onclick = async e => {
          const v = e.target.closest('[data-ver]'), x = e.target.closest('[data-exc]');
          if (v) {
            visor.innerHTML = '<p class="carregando">Abrindo…</p>';
            try {
              const an = a.anexos.find(z => z.id === v.dataset.ver), blob = await Api.admin.anexo(a.id, an.id), url = URL.createObjectURL(blob);
              visor.innerHTML = blob.type.startsWith('image/') ? `<img src="${url}" alt="${esc(an.nome)}">` : blob.type === 'application/pdf' ? `<iframe src="${url}" title="${esc(an.nome)}"></iframe>` : '';
              visor.insertAdjacentHTML('beforeend', `<a class="link" href="${url}" download="${esc(an.nome)}" target="_blank" rel="noopener">Baixar ${esc(an.nome)}</a>`);
            } catch (err) { visor.innerHTML = ''; toast(err.message, 'erro'); }
          }
          if (x && await confirmar('Excluir este arquivo?')) {
            try { a = await Api.admin.excluirAnexo(a.id, x.dataset.exc); alterou = true; area.innerHTML = htmlAnexos(a); visor.innerHTML = ''; } catch (err) { toast(err.message, 'erro'); }
          }
        };
        const sair = fn => () => { m.fechar(); fn(); };
        if ($('#corrigir', f)) $('#corrigir', f).onclick = sair(() => modalFinalizar(a, d => Api.admin.finalizar(a.id, d), depois));
        if ($('#d-fin', f)) $('#d-fin', f).onclick = sair(() => modalFinalizar(a, d => Api.admin.finalizar(a.id, d), depois));
        if ($('#d-cancel', f)) $('#d-cancel', f).onclick = () => confirmar(`Cancelar o horário de ${a.clienteNome}? O horário volta a ficar livre no site.`, 'Cancelar horário').then(ok => ok && seguro(async () => { await Api.admin.atualizar(a.id, { status: 'cancelado' }); m.fechar(); toast('Agendamento cancelado.'); depois(); }));
        if ($('#d-reabrir', f)) $('#d-reabrir', f).onclick = () => confirmar('Desfazer a finalização? O pagamento registrado será apagado e o atendimento volta para "Agendado".', 'Desfazer', false).then(ok => ok && seguro(async () => { await Api.admin.atualizar(a.id, { status: 'confirmado' }); m.fechar(); toast('Finalização desfeita.'); depois(); }));
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

  function modalAgendamento() {
    const D = A.D, bs = D.barbeiros.filter(b => b.ativo), ss = D.servicos.filter(s => s.ativo);
    if (!bs.length || !ss.length) return toast('Cadastre ao menos um barbeiro e um serviço ativos.', 'erro');
    const corpo = `<div class="campos">
        <label>Nome do cliente<input name="nome" maxlength="80" required></label>
        <label>Telefone<input name="tel" type="tel" inputmode="tel" placeholder="(00) 00000-0000" required></label>
      </div>
      <h4>Serviços</h4><div class="checks">${ss.map(s => `<label class="check"><input type="checkbox" name="serv" value="${esc(s.id)}"> ${esc(s.nome)} <small>${s.duracao} min · ${U.dinheiro(s.preco)}</small></label>`).join('')}</div>
      <div class="campos">
        <label>Barbeiro<select name="barb">${bs.map(b => `<option value="${esc(b.id)}">${esc(b.nome)}</option>`).join('')}</select></label>
        <label>Data<input type="date" name="data" value="${A.data < U.hojeISO() ? U.hojeISO() : A.data}" min="${U.hojeISO()}"></label>
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
          let oc; try { oc = await Api.ocupados(f.data.value); } catch (e) { toast(e.message, 'erro'); return; }
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

  // ------------------------------------------------------- financeiro
  function abaFinanceiro() {
    const m = $('#adm-main');
    m.innerHTML = `<div class="barra">${navMes('nav-f', A.mesFin)}<button class="btn" id="novo-pg" type="button">+ Registrar pagamento</button></div><div id="f-cont"><p class="carregando">Carregando…</p></div>`;
    $$('#nav-f [data-m]').forEach(b => b.onclick = () => { A.mesFin = U.addMes(A.mesFin, Number(b.dataset.m)); abaFinanceiro(); });
    let F = null, ags = [];
    $('#novo-pg').onclick = () => modalPagamento({}, F, abaFinanceiro);
    seguro(async () => {
      const [ini, fim] = U.limitesMes(A.mesFin);
      [F, ags] = await Promise.all([Api.admin.financeiro(A.mesFin), Api.admin.agendamentos(ini, fim)]);
      const box = $('#f-cont'); if (!box) return;
      const R = F.resumo, tot = k => U.soma(R.map(r => r[k]));
      const aConferir = ags.filter(a => a.status === 'concluido' && !a.conferido);
      box.innerHTML = `<div class="kpis kpis-6">
          <div><span>Faturamento</span><b>${U.dinheiro(tot('produzido'))}</b></div>
          <div><span>Comissões do mês</span><b>${U.dinheiro(tot('comissao'))}</b></div>
          <div><span>Fica na barbearia</span><b>${U.dinheiro(tot('casa'))}</b></div>
          <div><span>Pago aos barbeiros</span><b>${U.dinheiro(tot('pago'))}</b></div>
          <div class="destaque"><span>Falta pagar</span><b>${U.dinheiro(U.soma(R.filter(r => r.aPagar > 0).map(r => r.aPagar)))}</b></div>
          <div><span>A conferir</span><b>${aConferir.length}</b></div></div>
        <section class="bloco"><h3>Comissões por barbeiro</h3>
        ${R.length ? `<table class="tabela stack"><thead><tr><th>Barbeiro</th><th class="num">Atend.</th><th class="num">Produzido</th><th class="num">Comissão</th><th class="num">Saldo anterior</th><th class="num">Pago no mês</th><th class="num">A pagar</th><th></th></tr></thead><tbody>
          ${R.map(r => `<tr><td><strong>${esc(r.nome)}</strong>${r.comissaoPct != null ? ` <small>${r.comissaoPct}%</small>` : ''}</td><td class="num">${r.atendimentos}</td><td class="num">${U.dinheiro(r.produzido)}</td><td class="num">${U.dinheiro(r.comissao)}</td><td class="num">${U.dinheiro(r.anterior)}</td><td class="num">${U.dinheiro(r.pago)}</td><td class="num"><b class="${r.aPagar > 0 ? 'deve' : ''}">${U.dinheiro(r.aPagar)}</b></td>
          <td class="acoes"><button class="btn btn-sm" data-pagar="${esc(r.barbeiroId)}" type="button">Pagar</button><button class="btn btn-sec btn-sm" data-extrato="${esc(r.barbeiroId)}" type="button">Extrato</button></td></tr>`).join('')}
          </tbody></table>` : '<p class="vazio">Sem movimento neste mês.</p>'}</section>
        <section class="bloco"><h3>Atendimentos a conferir <small>${aConferir.length}</small></h3>
        ${aConferir.length ? `<table class="tabela stack"><thead><tr><th>Data</th><th>Barbeiro</th><th>Cliente</th><th>Pagamento</th><th class="num">Valor</th><th></th></tr></thead><tbody>
          ${aConferir.map(a => { const p = U.pagDe(a, barbDe(a.barbeiroId)); return `<tr><td>${fmtCurta(a.data)} ${U.toHora(a.inicio)}</td><td>${esc(a.barbeiroNome)}</td><td>${esc(a.clienteNome)}<br><small>${esc(a.servicosNome)}</small></td><td>${p.semRegistro ? '—' : esc(U.FORMAS[p.forma] || p.forma)}</td><td class="num">${U.dinheiro(p.valor)}</td><td class="acoes"><button class="btn btn-sm" data-acao="det" data-id="${esc(a.id)}" type="button">Conferir</button></td></tr>`; }).join('')}
          </tbody></table>` : '<p class="vazio">Tudo conferido neste mês.</p>'}</section>
        <section class="bloco"><h3>Pagamentos e vales do mês</h3>
        ${F.pagamentos.length ? `<table class="tabela stack"><thead><tr><th>Data</th><th>Barbeiro</th><th>Tipo</th><th>Forma</th><th class="num">Valor</th><th>Obs.</th><th></th></tr></thead><tbody>
          ${F.pagamentos.map(p => `<tr><td>${fmtCurta(p.data)}</td><td>${esc(p.barbeiroNome)}</td><td>${p.tipo === 'vale' ? 'Vale' : 'Pagamento'}</td><td>${esc(U.FORMAS[p.forma] || p.forma)}</td><td class="num">${U.dinheiro(p.valor)}</td><td>${esc(p.obs || '—')}</td><td class="acoes"><button class="btn btn-sec btn-sm perigo" data-exc-pg="${esc(p.id)}" type="button">Excluir</button></td></tr>`).join('')}
          </tbody></table>` : '<p class="vazio">Nenhum pagamento registrado neste mês.</p>'}</section>
        <p class="ajuda">A pagar = saldo dos meses anteriores + comissão do mês − pagamentos e vales do mês. Comissão é calculada sobre o valor cobrado, com o percentual do barbeiro no momento da finalização.</p>`;
      box.onclick = e => {
        const pg = e.target.closest('[data-pagar]'), ex = e.target.closest('[data-extrato]'), del = e.target.closest('[data-exc-pg]');
        if (pg) modalPagamento({ barbeiroId: pg.dataset.pagar }, F, abaFinanceiro);
        if (ex) { A.relB = ex.dataset.extrato; A.mesRel = A.mesFin; A.tab = 'relatorios'; renderAba(); }
        if (del) confirmar('Excluir este pagamento? O valor volta para "a pagar".').then(ok => ok && seguro(async () => { await Api.admin.excluirPagamento(del.dataset.excPg); toast('Pagamento excluído.'); abaFinanceiro(); }));
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
        <label class="full">Observação <i>(opcional)</i><input name="obs" maxlength="200" placeholder="Ex.: fechamento da 1ª quinzena"></label></div>
        <p class="ajuda" id="pg-saldo"></p>`,
      aoAbrir(f) {
        const mostra = () => { $('#pg-saldo', f).textContent = F ? `Saldo a pagar de ${(bs.find(b => b.id === f.barb.value) || {}).nome || ''} em ${fmtMes(A.mesFin)}: ${U.dinheiro(saldo(f.barb.value))}` : ''; };
        f.barb.onchange = () => { f.valor.value = saldo(f.barb.value) || ''; mostra(); }; mostra();
      },
      async aoEnviar(f) {
        if (!(Number(f.valor.value) > 0)) throw new Error('Informe o valor.');
        await Api.admin.salvarPagamento({ barbeiroId: f.barb.value, tipo: f.tipo.value, data: f.data.value, valor: Number(f.valor.value), forma: f.forma.value, obs: f.obs.value.trim() });
        toast('Pagamento registrado.'); depois();
      },
    });
  }

  // ------------------------------------------------------- relatórios
  function abaRelatorios() {
    const m = $('#adm-main');
    m.innerHTML = `<div class="barra">${navMes('nav-r', A.mesRel)}
      <div class="barra-acoes"><select id="rel-b" aria-label="Relatório de"><option value="">Barbearia (todos)</option>${A.D.barbeiros.map(b => `<option value="${esc(b.id)}"${A.relB === b.id ? ' selected' : ''}>${esc(b.nome)}</option>`).join('')}</select>
      <button class="btn btn-sec" id="imp" type="button">Imprimir / PDF</button></div></div>
      <h2 class="print-tit">${esc(A.D.config.nome)} — ${A.relB ? 'Extrato de ' + esc((barbDe(A.relB) || {}).nome || '') : 'Relatório'} — ${fmtMes(A.mesRel)}</h2>
      <div id="r-cont"><p class="carregando">Carregando…</p></div>`;
    $$('#nav-r [data-m]').forEach(b => b.onclick = () => { A.mesRel = U.addMes(A.mesRel, Number(b.dataset.m)); abaRelatorios(); });
    $('#rel-b').onchange = e => { A.relB = e.target.value; abaRelatorios(); };
    $('#imp').onclick = imprimir;
    seguro(async () => {
      const [ini, fim] = U.limitesMes(A.mesRel);
      const [F, todos] = await Promise.all([Api.admin.financeiro(A.mesRel), Api.admin.agendamentos(ini, fim)]);
      const box = $('#r-cont'); if (!box) return;
      if (A.relB) {
        const r = F.resumo.find(x => x.barbeiroId === A.relB);
        box.innerHTML = htmlExtrato(r, todos.filter(a => a.barbeiroId === A.relB), F.pagamentos.filter(p => p.barbeiroId === A.relB), 'admin');
        return;
      }
      box.innerHTML = htmlRelBarbearia(todos, F);
    });
  }

  function htmlRelBarbearia(todos, F) {
    const conc = todos.filter(a => a.status === 'concluido');
    const pg = conc.map(a => ({ a, p: U.pagDe(a, barbDe(a.barbeiroId)) }));
    const fat = U.soma(pg.map(x => x.p.valor)), com = U.soma(pg.map(x => x.p.comissaoValor));
    const faltas = todos.filter(a => a.status === 'faltou').length, canc = todos.filter(a => a.status === 'cancelado').length;
    const base = conc.length + faltas;
    const agrupa = fn => { const m = {}; pg.forEach(x => { const k = fn(x); m[k] = m[k] || { n: k, q: 0, v: 0 }; m[k].q++; m[k].v += x.p.valor; }); return Object.values(m).sort((a, b) => b.v - a.v); };
    const porForma = agrupa(x => x.p.semRegistro ? 'Não registrada' : (U.FORMAS[x.p.forma] || x.p.forma));
    const porServ = agrupa(x => x.a.servicosNome);
    const porDow = [1, 2, 3, 4, 5, 6, 0].map(i => { const l = pg.filter(x => U.diaSemana(x.a.data) === i); return { n: DIAS[i], q: l.length, v: U.soma(l.map(x => x.p.valor)) }; });
    const [ini, fim] = U.limitesMes(A.mesRel), nd = Number(fim.slice(8));
    const porDia = Array.from({ length: nd }, (_, i) => { const d = A.mesRel + '-' + String(i + 1).padStart(2, '0'); return { d, v: U.soma(pg.filter(x => x.a.data === d).map(x => x.p.valor)) }; });
    const mxD = Math.max(1, ...porDia.map(x => x.v));
    const clientes = new Set(conc.map(a => a.clienteTelefone)).size;
    const origemSite = conc.filter(a => a.origem === 'site').length;
    return `<div class="kpis kpis-6">
        <div><span>Faturamento</span><b>${U.dinheiro(fat)}</b></div>
        <div><span>Atendimentos</span><b>${conc.length}</b></div>
        <div><span>Ticket médio</span><b>${U.dinheiro(conc.length ? fat / conc.length : 0)}</b></div>
        <div><span>Comissões</span><b>${U.dinheiro(com)}</b></div>
        <div class="destaque"><span>Fica na barbearia</span><b>${U.dinheiro(fat - com)}</b></div>
        <div><span>Faltas</span><b>${faltas} <small>${pct(faltas, base)}</small></b></div></div>
      <section class="bloco"><h3>Faturamento por dia</h3>
        <div class="colunas-dia" role="img" aria-label="Faturamento diário do mês">${porDia.map(x => `<div title="${fmtCurta(x.d)}: ${U.dinheiro(x.v)}"><i style="height:${(x.v / mxD * 100).toFixed(1)}%"></i><small>${Number(x.d.slice(8))}</small></div>`).join('')}</div></section>
      <section class="bloco"><h3>Por barbeiro</h3>
        ${F.resumo.length ? `<table class="tabela stack"><thead><tr><th>Barbeiro</th><th class="num">Atend.</th><th class="num">Faturamento</th><th class="num">Ticket médio</th><th class="num">Comissão</th><th class="num">Fica na casa</th><th class="num">Faltas</th></tr></thead><tbody>
        ${F.resumo.map(r => `<tr><td><strong>${esc(r.nome)}</strong></td><td class="num">${r.atendimentos}</td><td class="num">${U.dinheiro(r.produzido)}</td><td class="num">${U.dinheiro(r.atendimentos ? r.produzido / r.atendimentos : 0)}</td><td class="num">${U.dinheiro(r.comissao)}</td><td class="num">${U.dinheiro(r.casa)}</td><td class="num">${r.faltas}</td></tr>`).join('')}
        </tbody></table>` : '<p class="vazio">Sem dados.</p>'}</section>
      <div class="duas"><section class="card"><h3>Forma de pagamento</h3>${barrasHTML(porForma)}</section>
        <section class="card"><h3>Dia da semana</h3>${barrasHTML(porDow.filter(x => x.q))}</section></div>
      <section class="bloco"><h3>Serviços</h3>${barrasHTML(porServ)}</section>
      <p class="ajuda">${clientes} cliente(s) diferente(s) atendido(s) · ${pct(origemSite, conc.length)} dos atendimentos marcados pelo site · ${canc} cancelamento(s). Conta só atendimentos finalizados; faltas não entram no faturamento.</p>`;
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
        <label>Comissão (%)<input name="comissao" type="number" min="0" max="100" step="0.5" value="${U.pctComissao(b)}" required></label>
        <label class="check"><input type="checkbox" name="ativo"${b.ativo ? ' checked' : ''}> Ativo — aparece no site e recebe agendamentos</label>
      </div>
      <h4>Acesso à área do barbeiro</h4>
      <div class="campos">
        <label>Usuário <i>(login)</i><input name="usuario" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(b.usuario || '')}" placeholder="Ex.: rafael"></label>
        <label>${b.temAcesso ? 'Nova senha <i>(em branco = manter)</i>' : 'Senha <i>(mín. 6 caracteres)</i>'}<input name="senha" type="text" autocomplete="new-password" maxlength="100" placeholder="${b.temAcesso ? '••••••' : 'Mín. 6 caracteres'}"></label>
        ${b.temAcesso ? '<label class="check full"><input type="checkbox" name="remover"> Remover acesso (ele não consegue mais entrar)</label>' : '<p class="ajuda full">Sem usuário e senha, ele não entra na área do barbeiro.</p>'}
        ${b.ultimoAcesso ? `<p class="ajuda full">Último acesso: ${fmtCurta(b.ultimoAcesso.slice(0, 10))} às ${new Date(b.ultimoAcesso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Trocar a senha desconecta ele de todos os aparelhos.</p>` : ''}
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
    const nomeB = id => id ? ((barbDe(id) || {}).nome || 'Barbeiro excluído') : 'Barbearia inteira';
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
    if (location.hash === '#admin') abrirAdmin();
    else if (location.hash === '#barbeiro') abrirBarbeiro();
    else abrirSite();
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