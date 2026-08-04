const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const users = [
  {id:'ADM-01', name:'Administrador Demo', pin:'12345678', role:'Administrador'},
  {id:'SUP-01', name:'Supervisor Demo', pin:'11223344', role:'Supervisor'},
  {id:'EVA-01', name:'Evaluador Demo', pin:'87654321', role:'Evaluador'}
];
const state = {
  session: JSON.parse(localStorage.getItem('fenologia-session') || 'null'),
  records: JSON.parse(localStorage.getItem('fenologia-records') || '[]'),
  assignments: JSON.parse(localStorage.getItem('fenologia-assignments') || '{}'),
  catalog: null,
  view: 'home',
  editingId: null,
  selectedRecordId: null
};

const icons = {
  leaf:'🌿', clipboard:'📋', detail:'🔎', file:'📤', map:'🗺️', chart:'📊', users:'👥', settings:'⚙️', sync:'🔄', shield:'🛡️', home:'⌂', out:'↪', seed:'🌱', check:'✓', alert:'!', cloud:'☁️'
};
const stages = Array.from({length:17}, (_,i)=>`E${String(i+1).padStart(2,'0')}`);

function save(){
  localStorage.setItem('fenologia-records', JSON.stringify(state.records));
  localStorage.setItem('fenologia-assignments', JSON.stringify(state.assignments));
}
function showToast(text){ toast.textContent=text; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),2300); }
function esc(v=''){ return String(v).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function today(){ return new Date().toISOString().slice(0,10); }
function options(list, placeholder='Seleccionar'){ return `<option value="">${placeholder}</option>${list.map(v=>`<option>${esc(v)}</option>`).join('')}`; }
function roleClass(){ return state.session?.role.toLowerCase(); }
function countToday(){ return state.records.filter(r=>r.date===today()).length; }
function lotsToday(){ return new Set(state.records.filter(r=>r.date===today()).map(r=>r.lot)).size; }
function isAdmin(){ return state.session?.role==='Administrador'; }
function isSupervisor(){ return ['Administrador','Supervisor'].includes(state.session?.role); }

function loginView(){
  app.innerHTML = `<main class="login-page">
    <section class="login-hero">
      <div class="brand-mark">${icons.leaf}</div>
      <span class="eyebrow">SISTEMA DE EVALUACIÓN AGRÍCOLA</span>
      <h1>Fenología</h1>
      <p>Registra evaluaciones en campo, incluso sin conexión, y consolida el avance de tus lotes.</p>
      <div class="hero-points"><span>${icons.check} Trabajo offline</span><span>${icons.check} Datos por rol</span><span>${icons.check} Exportación Excel</span></div>
    </section>
    <section class="login-card">
      <div><span class="eyebrow green">ACCESO SEGURO</span><h2>Bienvenido</h2><p>Ingresa con el nombre y DNI registrados.</p></div>
      <form id="login-form">
        <label>Nombre completo<input name="name" value="Evaluador Demo" autocomplete="username" required></label>
        <label>DNI / PIN<input name="pin" value="87654321" inputmode="numeric" maxlength="8" autocomplete="current-password" required></label>
        <button class="primary wide">Ingresar al sistema <span>→</span></button>
      </form>
      <div class="demo-note"><b>Acceso de demostración</b><span>Evaluador Demo · 87654321</span></div>
    </section>
  </main>`;
}

function header(){
  return `<header class="topbar">
    <button class="menu-icon" data-view="home">${icons.leaf}</button>
    <div class="brand"><b>FENOLOGÍA</b><span>Evaluaciones de campo</span></div>
    <div class="connection"><i class="${navigator.onLine?'online':'offline'}"></i>${navigator.onLine?'En línea':'Sin conexión'}</div>
    <div class="user-chip"><span>${esc(state.session.name.split(' ').map(x=>x[0]).slice(0,2).join(''))}</span><div><b>${esc(state.session.name)}</b><small>${esc(state.session.role)}</small></div></div>
    <button class="ghost" id="logout">Salir</button>
  </header>`;
}
function sidebar(){
  const items = [
    ['home',icons.home,'Inicio'],['evaluate',icons.clipboard,'Registro de evaluación'],['records',icons.detail,'Detalle de evaluación'],['export',icons.file,'Exportar e importar']
  ];
  if(isSupervisor()) items.push(['consolidate',icons.sync,'Consolidar'],['map',icons.map,'Mapa de avance'],['charts',icons.chart,'Gráficos']);
  if(isAdmin()) items.push(['users',icons.users,'Usuarios y roles'],['catalogs',icons.settings,'Catálogos']);
  return `<aside class="sidebar"><nav>${items.map(([v,i,t])=>`<button data-view="${v}" class="${state.view===v?'active':''}"><span>${i}</span>${t}</button>`).join('')}</nav><div class="side-footer"><b>Versión 0.4</b><small>Guardado local activo</small></div></aside>`;
}
function shell(content){ return `${header()}<div class="workspace">${sidebar()}<main class="content">${content}</main></div>`; }
function titleBlock(kicker,title,text,action=''){ return `<div class="page-title"><div><span>${kicker}</span><h1>${title}</h1><p>${text}</p></div>${action}</div>`; }
function metric(value,label,icon,sub=''){ return `<article class="metric"><div class="metric-icon">${icon}</div><div><strong>${value}</strong><span>${label}</span>${sub?`<small>${sub}</small>`:''}</div></article>`; }
function actionCard(view,icon,title,text,tag=''){ return `<button class="action-card" data-view="${view}"><span class="action-icon">${icon}</span><div><b>${title}</b><p>${text}</p></div>${tag?`<em>${tag}</em>`:''}<i>→</i></button>`; }

function homeView(){
  const role = state.session.role;
  const supervisor = isSupervisor();
  app.innerHTML = shell(`${titleBlock('PANEL PRINCIPAL',`Buenos días, ${esc(state.session.name.split(' ')[0])}`, role==='Evaluador'?'Continúa con tus evaluaciones pendientes o revisa los registros guardados en este dispositivo.':'Revisa el avance del equipo y consolida las evaluaciones del día.', `<button class="primary" data-view="evaluate">+ Nueva evaluación</button>`)}
    <section class="metrics-grid">
      ${metric(countToday(),'Evaluaciones de hoy',icons.clipboard,'Guardadas localmente')}
      ${metric(lotsToday(),'Lotes evaluados',icons.map,'En la fecha actual')}
      ${metric(state.records.length,'Registros disponibles',icons.detail,'Histórico del dispositivo')}
      ${metric(navigator.onLine?'Conectado':'Offline', 'Estado del sistema', icons.cloud, navigator.onLine?'Listo para sincronizar':'Puedes seguir trabajando')}
    </section>
    <section class="panel"><div class="panel-head"><div><span>ACCESOS RÁPIDOS</span><h2>¿Qué deseas hacer?</h2></div></div>
      <div class="actions-grid">
        ${actionCard('evaluate',icons.clipboard,'Registrar evaluación','Completa los datos del lote, estadios y biometría.','Principal')}
        ${actionCard('records',icons.detail,'Detalle de evaluaciones','Consulta, filtra y revisa los registros realizados.')}
        ${actionCard('export',icons.file,'Exportar e importar','Genera archivos para Excel o recupera un respaldo.')}
        ${supervisor?actionCard('consolidate',icons.sync,'Consolidar evaluaciones','Reúne los archivos de todos los evaluadores.') : actionCard('records',icons.shield,'Datos protegidos','Los registros permanecen en tu dispositivo.')}
      </div>
    </section>
    <section class="two-cols">
      <article class="panel"><div class="panel-head"><div><span>ACTIVIDAD RECIENTE</span><h2>Últimos registros</h2></div><button class="link" data-view="records">Ver todos</button></div>${recentRows()}</article>
      <article class="panel status-panel"><div class="panel-head"><div><span>ESTADO LOCAL</span><h2>Trabajo sin internet</h2></div></div><div class="status-illustration">${icons.leaf}</div><p>La información se guarda en este equipo. Cuando exista conexión podrás exportar o sincronizar los datos.</p><div class="status-line"><span>Pendientes de respaldo</span><b>${state.records.length}</b></div></article>
    </section>`);
}
function recentRows(){
  if(!state.records.length) return `<div class="empty"><span>${icons.seed}</span><b>Aún no hay evaluaciones</b><p>Registra la primera evaluación para verla aquí.</p></div>`;
  return `<div class="recent-list">${state.records.slice(-5).reverse().map(r=>`<button data-record="${r.id}"><span class="lot-badge">${esc(r.module||'M')}</span><div><b>${esc(r.lot)}</b><small>${esc(r.farm)} · ${esc(r.variety)}</small></div><em>${esc(r.date)}</em><i>→</i></button>`).join('')}</div>`;
}
