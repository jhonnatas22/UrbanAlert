/* UrbanAlert - App.js v4 */
const PER_PAGE = 5;
const state = {
  page: 'dashboard', currentUser: getUser(),
  filterStatus: '', filterCategory: '', filterSearch: '',
  ocPage: 1, adminTab: 'usuarios', showNotif: false,
  categorias: [], fotosNovas: [], mapFilter: '', mapaStatusFilter: '',
};
let novaMap=null,novaMarker=null,novaLat=null,novaLng=null,mapaLeaflet=null;

function ini(n=''){return n.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();}
function today(){return new Date().toISOString().slice(0,10);}
function roleLabel(r){return{admin:'Administrador',fiscal:'Fiscal Municipal',cidadao:'Cidadão'}[r]||r;}
function getStatusBadge(s){const m={'Aberta':'danger','Em Análise':'warning','Em Execução':'info','Resolvida':'success','Encerrada':'secondary'};return`<span class="badge badge-${m[s]||'secondary'}">${s}</span>`;}
function getPriBadge(p){const m={'Alta':'danger','Média':'warning','Baixa':'success'};return`<span class="badge badge-${m[p]||'secondary'}">${p}</span>`;}
function toast(msg,type='success'){const el=document.createElement('div');el.className=`toast toast-${type}`;el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2800);}
function showError(msg){toast(msg,'danger');}

async function render(){
  const root=document.getElementById('root');
  if(!Auth.isLoggedIn()||!state.currentUser){root.innerHTML=renderAuth();return;}
  if(['admin','categorias'].includes(state.page)&&state.currentUser.role!=='admin')state.page='dashboard';
  if(!state.categorias.length){try{state.categorias=await Categorias.listar();}catch(e){state.categorias=[];}}
  root.innerHTML=renderShell();
  await renderPage();
  afterRender();
}

function afterRender(){
  if(state.page==='mapa')initMapaPrincipal();
  if(state.page==='nova')initMapaNova();
}

function renderAuth(tab='login'){
  const isL=tab==='login';
  return`<div class="auth-container"><div class="auth-card fade-in">
    <div class="auth-logo"><div class="auth-logo-icon">🏙️</div><h1>Urban<span>Alert</span></h1></div>
    <div class="auth-tabs">
      <button class="auth-tab ${isL?'active':''}" onclick="switchAuthTab('login')">Entrar</button>
      <button class="auth-tab ${!isL?'active':''}" onclick="switchAuthTab('register')">Cadastrar</button>
    </div>
    <div id="auth-alert"></div>
    ${isL?`
      <div class="form-group"><label>E-mail</label><input id="login-email" type="email" placeholder="seu@email.com"></div>
      <div class="form-group"><label>Senha</label><input id="login-pass" type="password" placeholder="••••••••"></div>
      <button class="btn btn-primary btn-block" onclick="doLogin()">Entrar →</button>
    `:`
      <div class="form-group"><label>Nome completo</label><input id="reg-nome" type="text" placeholder="Seu nome"></div>
      <div class="form-group"><label>E-mail</label><input id="reg-email" type="email" placeholder="seu@email.com"></div>
      <div class="form-group"><label>Senha</label><input id="reg-pass" type="password" placeholder="Mínimo 6 caracteres"></div>
      <div class="form-group"><label>Perfil</label><select id="reg-role"><option value="cidadao">Cidadão</option><option value="fiscal">Fiscal Municipal</option></select></div>
      <button class="btn btn-primary btn-block" onclick="doRegister()">Criar conta →</button>
    `}
  </div></div>`;
}
function switchAuthTab(tab){document.getElementById('root').innerHTML=renderAuth(tab);}
async function doLogin(){
  const email=document.getElementById('login-email').value.trim(),pass=document.getElementById('login-pass').value;
  try{const data=await Auth.login(email,pass);state.currentUser=data.user;state.categorias=[];state.page='dashboard';state.adminTab='usuarios';toast(`Bem-vindo, ${data.user.nome}!`);await render();}
  catch(err){document.getElementById('auth-alert').innerHTML=`<div class="alert alert-danger">${err.message}</div>`;}
}
async function doRegister(){
  const nome=document.getElementById('reg-nome').value.trim(),email=document.getElementById('reg-email').value.trim(),pass=document.getElementById('reg-pass').value,role=document.getElementById('reg-role').value;
  try{const data=await Auth.register(nome,email,pass,role);state.currentUser=data.user;state.categorias=[];state.page='dashboard';state.adminTab='usuarios';toast('Conta criada!');await render();}
  catch(err){document.getElementById('auth-alert').innerHTML=`<div class="alert alert-danger">${err.message}</div>`;}
}
function doLogout(){Auth.logout();state.currentUser=null;state.categorias=[];state.page='dashboard';state.adminTab='usuarios';mapaLeaflet=null;render();}

function renderShell(){
  const u=state.currentUser,isAdmin=u.role==='admin';
  const nav=[
    {id:'dashboard',icon:'📊',label:'Dashboard'},
    {id:'ocorrencias',icon:'📋',label:'Ocorrências'},
    {id:'nova',icon:'➕',label:'Nova Ocorrência'},
    {id:'mapa',icon:'🗺️',label:'Mapa de Ocorrências'},
    {id:'notificacoes',icon:'🔔',label:'Notificações'},
    {id:'perfil',icon:'👤',label:'Meu Perfil'},
    ...(isAdmin?[{id:'categorias',icon:'🏷️',label:'Categorias'},{id:'admin',icon:'⚙️',label:'Administração'}]:[]),
  ];
  const titles={dashboard:'Dashboard',ocorrencias:'Ocorrências',nova:'Nova Ocorrência',mapa:'Mapa de Ocorrências',notificacoes:'Notificações',perfil:'Meu Perfil',categorias:'Categorias',admin:'Administração'};
  return`<div class="app fade-in" onclick="handleAppClick(event)">
    <div class="sidebar-backdrop" onclick="closeMenu()"></div>
    <div class="sidebar">
      <div class="sidebar-logo"><div class="sidebar-logo-icon">🏙️</div><h2>Urban<span>Alert</span></h2></div>
      <nav class="sidebar-nav">
        <div class="nav-section">Menu</div>
        ${nav.map(n=>`<div class="nav-item ${state.page===n.id?'active':''}" onclick="goPage('${n.id}')"><span class="nav-icon">${n.icon}</span>${n.label}</div>`).join('')}
      </nav>
      <div class="sidebar-user">
        <div class="user-info" onclick="goPage('perfil')">
          <div class="user-avatar">${ini(u.nome)}</div>
          <div><div class="user-name">${u.nome}</div><div class="user-role">${roleLabel(u.role)}</div></div>
        </div>
        <button class="btn btn-secondary" style="width:100%;font-size:12px;padding:7px" onclick="doLogout()">Sair da conta</button>
      </div>
    </div>
    <div class="main" style="position:relative">
      <div class="topbar">
        <button class="menu-btn" onclick="toggleMenu()" aria-label="Abrir menu">☰</button>
        <h2>${titles[state.page]||''}</h2>
        <button class="btn btn-secondary btn-sm" onclick="toggleNotif(event)" id="notif-btn" aria-label="Notificações">🔔<span class="hide-mobile"> Notificações</span></button>
      </div>
      <div id="notif-panel-container"></div>
      <div class="content" id="page-content"><div class="empty-state"><div class="empty-icon">⏳</div><p>Carregando...</p></div></div>
    </div>
  </div>`;
}

function handleAppClick(e){
  if(state.showNotif&&!e.target.closest('#notif-panel-container')&&!e.target.closest('#notif-btn')){
    state.showNotif=false;const c=document.getElementById('notif-panel-container');if(c)c.innerHTML='';
  }
}

function toggleMenu(){document.querySelector('.app')?.classList.toggle('menu-open');}
function closeMenu(){document.querySelector('.app')?.classList.remove('menu-open');}

async function goPage(p){
  closeMenu();
  state.page=p;state.filterStatus='';state.filterCategory='';state.filterSearch='';
  state.ocPage=1;state.showNotif=false;state.fotosNovas=[];
  novaMap=null;novaMarker=null;novaLat=null;novaLng=null;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const titles={dashboard:'Dashboard',ocorrencias:'Ocorrências',nova:'Nova Ocorrência',mapa:'Mapa de Ocorrências',notificacoes:'Notificações',perfil:'Meu Perfil',categorias:'Categorias',admin:'Administração'};
  const h2=document.querySelector('.topbar h2');if(h2)h2.textContent=titles[p]||'';
  document.querySelectorAll('.nav-item').forEach(el=>{if(el.textContent.trim().startsWith(({dashboard:'📊',ocorrencias:'📋',nova:'➕',mapa:'🗺️',notificacoes:'🔔',perfil:'👤',categorias:'🏷️',admin:'⚙️'})[p]||'??'))el.classList.add('active');});
  await renderPage();afterRender();
}

async function renderPage(){
  const el=document.getElementById('page-content');if(!el)return;
  el.innerHTML='<div class="empty-state"><div class="empty-icon">⏳</div><p>Carregando...</p></div>';
  try{
    switch(state.page){
      case'dashboard':   el.innerHTML=await buildDashboard();break;
      case'ocorrencias': el.innerHTML=await buildOcorrencias();break;
      case'nova':        el.innerHTML=buildNova();break;
      case'mapa':        el.innerHTML=buildMapa();break;
      case'notificacoes':el.innerHTML=await buildNotificacoes();break;
      case'perfil':      el.innerHTML=buildPerfil();break;
      case'categorias':  el.innerHTML=buildCategorias();break;
      case'admin':       el.innerHTML=await buildAdmin();break;
    }
  }catch(err){el.innerHTML=`<div class="alert alert-danger">Erro: ${err.message}</div>`;}
}

// DASHBOARD
async function buildDashboard(){
  const d=await Ocorrencias.dashboard();
  const t=d.totais,total=parseInt(t.total)||0,resolvidas=parseInt(t.resolvidas)||0;
  const recentes=await Ocorrencias.listar({limit:5});
  const maxCat=Math.max(...d.porCategoria.map(c=>parseInt(c.total)),1);
  return`
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-header"><span class="stat-label">TOTAL</span><div class="stat-icon" style="background:rgba(116,185,255,0.15)">📋</div></div><div class="stat-value" style="color:var(--info)">${t.total}</div><div class="stat-sub">Registradas</div></div>
    <div class="stat-card"><div class="stat-header"><span class="stat-label">ABERTAS</span><div class="stat-icon" style="background:rgba(231,93,85,0.15)">🔴</div></div><div class="stat-value" style="color:var(--danger)">${t.abertas}</div><div class="stat-sub">Aguardando</div></div>
    <div class="stat-card"><div class="stat-header"><span class="stat-label">ANDAMENTO</span><div class="stat-icon" style="background:rgba(253,203,110,0.15)">⚙️</div></div><div class="stat-value" style="color:var(--warning)">${t.andamento}</div><div class="stat-sub">Em processo</div></div>
    <div class="stat-card"><div class="stat-header"><span class="stat-label">RESOLVIDAS</span><div class="stat-icon" style="background:rgba(0,184,148,0.15)">✅</div></div><div class="stat-value" style="color:var(--success)">${t.resolvidas}</div><div class="stat-sub">${total>0?Math.round(resolvidas/total*100):0}% do total</div></div>
  </div>
  <div class="grid-2" style="margin-bottom:1rem">
    <div class="card"><div class="card-header"><span class="card-title">📊 Por Categoria</span></div><div class="card-body">
      ${d.porCategoria.filter(c=>parseInt(c.total)>0).map(c=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:18px;width:24px;text-align:center">${c.icone}</span>
        <div style="flex:1"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="color:var(--text-muted)">${c.nome}</span><span style="font-weight:600">${c.total}</span></div>
        <div style="height:5px;background:rgba(255,255,255,0.08);border-radius:3px"><div style="height:100%;border-radius:3px;background:${c.cor};width:${Math.round(parseInt(c.total)/maxCat*100)}%"></div></div></div>
      </div>`).join('')||'<p style="color:var(--text-muted);font-size:13px">Sem dados.</p>'}
    </div></div>
    <div class="card"><div class="card-header"><span class="card-title">📈 Por Status</span></div><div class="card-body">
      ${d.porStatus.map(s=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="flex:1;font-size:13px">${s.status}</span>${getStatusBadge(s.status)}<span style="font-weight:600;font-family:'JetBrains Mono';min-width:24px;text-align:right">${s.total}</span></div>`).join('')}
    </div></div>
  </div>
  <div class="card"><div class="card-header"><span class="card-title">🕐 Recentes</span><button class="btn btn-secondary btn-sm" onclick="goPage('ocorrencias')">Ver todas</button></div>
    <div class="table-wrap"><table><thead><tr><th>Título</th><th>Categoria</th><th>Status</th><th>Prioridade</th><th>Data</th></tr></thead>
    <tbody>${recentes.data.map(o=>`<tr style="cursor:pointer" onclick="showDetail(${o.id})">
      <td style="font-weight:500">${o.titulo}</td><td>${o.categoria_icone||''} ${o.categoria_nome||'—'}</td>
      <td>${getStatusBadge(o.status)}</td><td>${getPriBadge(o.prioridade)}</td>
      <td style="color:var(--text-muted);font-size:12px">${o.created_at?.slice(0,10)}</td>
    </tr>`).join('')}</tbody></table></div>
  </div>`;
}

// OCORRÊNCIAS
async function buildOcorrencias(){
  const params={page:state.ocPage,limit:PER_PAGE};
  if(state.filterStatus)params.status=state.filterStatus;
  if(state.filterCategory)params.categoria_id=state.filterCategory;
  if(state.filterSearch)params.busca=state.filterSearch;
  const res=await Ocorrencias.listar(params);
  const {data,total,totalPages}=res;
  const u=state.currentUser,isFiscal=u.role!=='cidadao';
  const pages=Array.from({length:totalPages},(_,i)=>i+1);
  return`
  <div class="filter-bar">
    <input class="search-input" placeholder="🔍 Buscar..." value="${state.filterSearch}" oninput="filterChange('search',this.value)">
    <select class="filter-select" onchange="filterChange('status',this.value)">
      <option value="">Todos os status</option>
      ${['Aberta','Em Análise','Em Execução','Resolvida','Encerrada'].map(s=>`<option value="${s}" ${state.filterStatus===s?'selected':''}>${s}</option>`).join('')}
    </select>
    <select class="filter-select" onchange="filterChange('cat',this.value)">
      <option value="">Todas categorias</option>
      ${state.categorias.map(c=>`<option value="${c.id}" ${state.filterCategory==c.id?'selected':''}>${c.nome}</option>`).join('')}
    </select>
    <button class="btn btn-primary" onclick="goPage('nova')">+ Nova</button>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-title">${total} ocorrência(s)</span><span style="font-size:12px;color:var(--text-muted)">Página ${state.ocPage} de ${totalPages}</span></div>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Título</th><th>Categoria</th><th>Endereço</th><th>Status</th><th>Prior.</th><th>Data</th><th>Ações</th></tr></thead>
    <tbody>${data.length?data.map(o=>`<tr>
      <td style="font-family:'JetBrains Mono';font-size:12px;color:var(--text-muted)">#${o.id}</td>
      <td style="font-weight:500;cursor:pointer;color:var(--info)" onclick="showDetail(${o.id})">${o.titulo}</td>
      <td>${o.categoria_icone||''} ${o.categoria_nome||'—'}</td>
      <td style="font-size:12px;color:var(--text-muted);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.endereco}</td>
      <td>${getStatusBadge(o.status)}</td><td>${getPriBadge(o.prioridade)}</td>
      <td style="font-size:12px;color:var(--text-muted)">${o.created_at?.slice(0,10)}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-secondary btn-sm" onclick="showDetail(${o.id})">Ver</button>
        ${(o.usuario_id===u.id||isFiscal)?`<button class="btn btn-secondary btn-sm" onclick="editOc(${o.id})">✏️</button>`:''}
        ${(o.usuario_id===u.id||u.role==='admin')?`<button class="btn btn-danger btn-sm" onclick="deleteOc(${o.id})">🗑️</button>`:''}
      </div></td>
    </tr>`).join(''):`<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🔍</div><p>Nenhuma encontrada.</p></div></td></tr>`}
    </tbody></table></div>
    ${totalPages>1?`<div class="pagination">
      <button class="page-btn" onclick="changePage(${state.ocPage-1})" ${state.ocPage<=1?'disabled':''}>‹</button>
      ${pages.map(p=>`<button class="page-btn ${p===state.ocPage?'active':''}" onclick="changePage(${p})">${p}</button>`).join('')}
      <button class="page-btn" onclick="changePage(${state.ocPage+1})" ${state.ocPage>=totalPages?'disabled':''}>›</button>
      <span class="page-info">${(state.ocPage-1)*PER_PAGE+1}–${Math.min(state.ocPage*PER_PAGE,total)} de ${total}</span>
    </div>`:''}
  </div>`;
}
async function filterChange(t,v){if(t==='status')state.filterStatus=v;if(t==='cat')state.filterCategory=v;if(t==='search')state.filterSearch=v;state.ocPage=1;document.getElementById('page-content').innerHTML=await buildOcorrencias();}
async function changePage(p){state.ocPage=p;document.getElementById('page-content').innerHTML=await buildOcorrencias();}

// NOVA OCORRÊNCIA
function buildNova(){
  return`<div class="card" style="max-width:660px;margin:0 auto"><div class="card-header"><span class="card-title">📝 Nova Ocorrência</span></div><div class="card-body">
    <div class="form-group"><label>Título *</label><input id="oc-titulo" type="text" placeholder="Descreva brevemente o problema"></div>
    <div class="grid-2">
      <div class="form-group"><label>Categoria *</label><select id="oc-cat"><option value="">Selecione...</option>${state.categorias.map(c=>`<option value="${c.id}">${c.icone} ${c.nome}</option>`).join('')}</select></div>
      <div class="form-group"><label>Prioridade</label><select id="oc-pri"><option value="Baixa">Baixa</option><option value="Média" selected>Média</option><option value="Alta">Alta</option></select></div>
    </div>
    <div class="form-group"><label>Endereço *</label><input id="oc-end" type="text" placeholder="Rua, número, bairro"></div>
    <div class="form-group"><label>Descrição detalhada *</label><textarea id="oc-desc" placeholder="Detalhe o problema..."></textarea></div>
    <div class="form-group">
      <label>📍 Localização no Mapa <span style="color:var(--danger)">*</span> <span style="font-size:11px;color:var(--text-muted);font-weight:400">(obrigatório — clique no mapa para marcar o local)</span></label>
      <div id="map-hint" style="display:flex;align-items:center;gap:8px;background:rgba(233,69,96,0.1);border:1px solid rgba(233,69,96,0.3);border-radius:var(--radius);padding:8px 12px;font-size:12px;color:var(--danger);margin-bottom:6px">⚠️ Nenhum local marcado. Clique no mapa para definir a localização.</div>
      <div id="map-nova" style="height:240px;border-radius:var(--radius);overflow:hidden;border:2px dashed var(--border)"></div>
      <div id="coord-ok" style="display:none;align-items:center;gap:8px;background:rgba(0,184,148,0.1);border:1px solid rgba(0,184,148,0.3);border-radius:var(--radius);padding:8px 12px;font-size:12px;color:var(--success);margin-top:6px">✅ Local marcado com sucesso!</div>
    </div>
    <div class="form-group" style="margin-top:1rem">
      <label>📷 Fotos <span style="font-size:11px;color:var(--text-muted);font-weight:400">(opcional — até 3 imagens)</span></label>
      <div class="foto-upload-area" onclick="document.getElementById('foto-input').click()">
        <input type="file" id="foto-input" accept="image/*" multiple onchange="handleFotos(this)">
        <div style="font-size:32px;margin-bottom:8px">📷</div>
        <div style="font-size:13px;color:var(--text-muted)">Clique para adicionar fotos</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">JPG, PNG — máx. 3 fotos</div>
      </div>
      <div class="foto-preview-grid" id="foto-preview"></div>
    </div>
    <div id="nova-alert"></div>
    <div style="display:flex;gap:10px;margin-top:.5rem">
      <button class="btn btn-secondary" onclick="goPage('ocorrencias')">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarOcorrencia()" style="flex:1">Registrar →</button>
    </div>
  </div></div>`;
}

function initMapaNova(){
  setTimeout(()=>{
    const el=document.getElementById('map-nova');if(!el||novaMap)return;
    novaMap=L.map('map-nova').setView([-9.6658,-35.7350],14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(novaMap);
    novaMap.on('click',function(e){
      novaLat=parseFloat(e.latlng.lat.toFixed(6));novaLng=parseFloat(e.latlng.lng.toFixed(6));
      if(novaMarker)novaMap.removeLayer(novaMarker);
      novaMarker=L.marker([novaLat,novaLng]).addTo(novaMap).bindPopup('📍 Local selecionado').openPopup();
      el.style.border='2px solid var(--success)';
      const hint=document.getElementById('map-hint'),ok=document.getElementById('coord-ok');
      if(hint)hint.style.display='none';if(ok)ok.style.display='flex';
    });
  },150);
}

function handleFotos(input){
  Array.from(input.files).slice(0,3-state.fotosNovas.length).forEach(file=>{
    if(state.fotosNovas.length>=3)return;
    const r=new FileReader();r.onload=e=>{state.fotosNovas.push(e.target.result);renderFotoPreview();};r.readAsDataURL(file);
  });input.value='';
}
function renderFotoPreview(){
  const g=document.getElementById('foto-preview');if(!g)return;
  g.innerHTML=state.fotosNovas.map((f,i)=>`<div class="foto-preview-item"><img src="${f}" alt="Foto ${i+1}"><button class="foto-remove" onclick="removeFoto(${i})">×</button></div>`).join('');
}
function removeFoto(i){state.fotosNovas.splice(i,1);renderFotoPreview();}

async function salvarOcorrencia(){
  const titulo=document.getElementById('oc-titulo').value.trim();
  const categoria_id=document.getElementById('oc-cat').value;
  const prioridade=document.getElementById('oc-pri').value;
  const endereco=document.getElementById('oc-end').value.trim();
  const descricao=document.getElementById('oc-desc').value.trim();
  const alertEl=document.getElementById('nova-alert');
  if(!titulo||!categoria_id||!endereco||!descricao){alertEl.innerHTML='<div class="alert alert-danger">Preencha todos os campos obrigatórios.</div>';return;}
  if(novaLat===null||novaLng===null){
    alertEl.innerHTML='<div class="alert alert-danger">📍 Marque o local no mapa antes de registrar.</div>';
    document.getElementById('map-nova')?.scrollIntoView({behavior:'smooth',block:'center'});return;
  }
  try{
    await Ocorrencias.criar({titulo,categoria_id,prioridade,endereco,descricao,lat:novaLat,lng:novaLng,fotos:state.fotosNovas});
    state.fotosNovas=[];novaMap=null;novaMarker=null;novaLat=null;novaLng=null;
    toast('Ocorrência registrada com sucesso!');goPage('ocorrencias');
  }catch(err){alertEl.innerHTML=`<div class="alert alert-danger">${err.message}</div>`;}
}

// MAPA PRINCIPAL
function buildMapa(){
  return`
  <div style="display:flex;gap:10px;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
    <select class="filter-select" onchange="filtrarMapa('cat',this.value)" style="min-width:200px">
      <option value="">🏷️ Todas as categorias</option>
      ${state.categorias.map(c=>`<option value="${c.id}" ${state.mapFilter==c.id?'selected':''}>${c.icone} ${c.nome}</option>`).join('')}
    </select>
    <select class="filter-select" onchange="filtrarMapa('status',this.value)" style="min-width:180px">
      <option value="">📌 Todos os status</option>
      ${['Aberta','Em Análise','Em Execução','Resolvida','Encerrada'].map(s=>`<option value="${s}" ${state.mapaStatusFilter===s?'selected':''}>${s}</option>`).join('')}
    </select>
    <span style="font-size:13px;color:var(--text-muted);margin-left:auto" id="mapa-count"></span>
  </div>
  <div id="map" style="height:460px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border)"></div>
  <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--text-muted);padding:.8rem 1.2rem;background:rgba(255,255,255,0.03);border-radius:var(--radius);border:1px solid var(--border);margin-top:1rem">
    ${state.categorias.map(c=>`<div style="display:flex;align-items:center;gap:6px"><div style="width:12px;height:12px;border-radius:50%;background:${c.cor}"></div><span>${c.icone} ${c.nome}</span></div>`).join('')}
  </div>`;
}

function initMapaPrincipal(){
  setTimeout(async()=>{
    const el=document.getElementById('map');if(!el)return;
    if(!mapaLeaflet){
      mapaLeaflet=L.map('map').setView([-9.6658,-35.7350],14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(mapaLeaflet);
    }
    await atualizarPins();
  },150);
}

async function filtrarMapa(tipo,val){
  if(tipo==='cat')state.mapFilter=val;if(tipo==='status')state.mapaStatusFilter=val;await atualizarPins();
}

async function atualizarPins(){
  if(!mapaLeaflet)return;
  mapaLeaflet.eachLayer(l=>{if(l instanceof L.CircleMarker||l instanceof L.Marker)mapaLeaflet.removeLayer(l);});
  const params={limit:100};
  if(state.mapFilter)params.categoria_id=state.mapFilter;
  if(state.mapaStatusFilter)params.status=state.mapaStatusFilter;
  const res=await Ocorrencias.listar(params);
  const count=document.getElementById('mapa-count');if(count)count.textContent=`${res.total} ocorrência(s) exibida(s)`;
  res.data.forEach(o=>{
    if(!o.lat||!o.lng)return;
    const sColor={'Aberta':'#e17055','Em Análise':'#fdcb6e','Em Execução':'#74b9ff','Resolvida':'#00b894','Encerrada':'#8892a4'}[o.status]||'#e94560';
    const m=L.circleMarker([o.lat,o.lng],{radius:11,fillColor:o.categoria_cor||sColor,color:'white',weight:2,opacity:1,fillOpacity:0.9}).addTo(mapaLeaflet);
    m.bindPopup(`<div style="min-width:190px">
      <div style="font-weight:600;font-size:13px;margin-bottom:4px">${o.categoria_icone||'📌'} ${o.titulo}</div>
      <div style="font-size:11px;color:#8892a4;margin-bottom:6px">${o.categoria_nome||'—'} · ${o.endereco}</div>
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:${sColor}22;color:${sColor}">${o.status}</span>
        <span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(116,185,255,0.2);color:#74b9ff">${o.prioridade}</span>
      </div>
      <button style="background:#e94560;color:white;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600" onclick="showDetail(${o.id})">Ver detalhes →</button>
    </div>`);
  });
}

// DETALHE COM FOTOS
async function showDetail(id){
  const o=await Ocorrencias.buscar(id);
  const u=state.currentUser,isFiscal=u.role!=='cidadao';
  const statuses=['Aberta','Em Análise','Em Execução','Resolvida','Encerrada'];
  const comentariosHtml=o.comentarios?.length
    ?o.comentarios.map(c=>`<div class="comment-item"><div class="comment-avatar">${ini(c.usuario_nome||'?')}</div><div class="comment-bubble"><div class="comment-meta"><span class="comment-author">${c.usuario_nome||'Usuário'}</span><span class="comment-time">${c.created_at?.slice(0,10)}</span></div><div class="comment-text">${c.texto}</div></div></div>`).join('')
    :'<p style="color:var(--text-muted);font-size:13px;margin-bottom:1rem">Nenhum comentário ainda.</p>';
  const modal=document.createElement('div');modal.className='modal-overlay';modal.id='modal-detail';
  modal.innerHTML=`<div class="modal modal-lg fade-in">
    <div class="modal-header"><h3>${o.categoria_icone||'📌'} #${o.id} — ${o.titulo}</h3><button class="close-btn" onclick="document.getElementById('modal-detail').remove()">×</button></div>
    <div class="modal-body">
      <div style="display:flex;gap:8px;margin-bottom:1rem;flex-wrap:wrap">${getStatusBadge(o.status)} ${getPriBadge(o.prioridade)}<span class="tag">${o.categoria_nome||'—'}</span></div>
      <div class="detail-desc">${o.descricao}</div>
      <div class="detail-row"><span class="detail-label">📍 Endereço</span><span class="detail-value">${o.endereco}</span></div>
      ${o.lat?`<div class="detail-row"><span class="detail-label">🗺️ Coordenadas</span><span class="detail-value" style="font-family:'JetBrains Mono';font-size:12px;color:var(--text-muted)">${parseFloat(o.lat).toFixed(4)}, ${parseFloat(o.lng).toFixed(4)}</span></div>`:''}
      <div class="detail-row"><span class="detail-label">👤 Registrado por</span><span class="detail-value">${o.usuario_nome||'—'}</span></div>
      <div class="detail-row"><span class="detail-label">📅 Data</span><span class="detail-value">${o.created_at?.slice(0,10)}</span></div>
      ${o.fotos&&o.fotos.length?`<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:.8rem">📷 FOTOS (${o.fotos.length})</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${o.fotos.map((f,i)=>`<img src="${f}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border)" onclick="openFoto('${f}')" alt="Foto ${i+1}">`).join('')}
        </div></div>`:''}
      ${isFiscal?`<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
        <div class="form-group"><label>Atualizar Status</label><div style="display:flex;gap:8px">
          <select id="new-status" style="flex:1;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:var(--radius);padding:9px 14px;color:var(--text);font-family:inherit;font-size:14px">
            ${statuses.map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <button class="btn btn-success" onclick="updateStatus(${o.id})">Salvar</button>
        </div></div></div>`:''}
      <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border)">
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:1rem">💬 COMENTÁRIOS</div>
        <div id="comments-list-${o.id}">${comentariosHtml}</div>
        <div style="display:flex;gap:10px;margin-top:1rem;align-items:flex-end">
          <div class="comment-avatar">${ini(u.nome)}</div>
          <textarea class="comment-textarea" id="comment-input-${o.id}" placeholder="Escreva um comentário..."></textarea>
          <button class="btn btn-primary btn-sm" onclick="sendComment(${o.id})" style="align-self:flex-end">Enviar</button>
        </div>
      </div>
      <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border)">
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:1rem">📋 HISTÓRICO</div>
        <div class="timeline">${o.historico?.map(h=>`<div class="timeline-item"><div class="timeline-dot"></div><div><div class="timeline-title">${h.acao}</div><div class="timeline-time">${h.created_at?.slice(0,10)} · ${h.usuario_nome}</div></div></div>`).join('')||''}</div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

function openFoto(src){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:300;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
  ov.innerHTML=`<img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:10px;">`;
  ov.onclick=()=>ov.remove();document.body.appendChild(ov);
}

async function updateStatus(id){
  const ns=document.getElementById('new-status').value;
  try{await Ocorrencias.atualizar(id,{status:ns});document.getElementById('modal-detail').remove();toast('Status atualizado!');await renderPage();afterRender();}
  catch(err){showError(err.message);}
}

async function sendComment(ocId){
  const inp=document.getElementById(`comment-input-${ocId}`),texto=inp.value.trim();if(!texto)return;
  try{
    const c=await Ocorrencias.comentar(ocId,texto);inp.value='';
    document.getElementById(`comments-list-${ocId}`).innerHTML+=`<div class="comment-item"><div class="comment-avatar">${ini(state.currentUser.nome)}</div><div class="comment-bubble"><div class="comment-meta"><span class="comment-author">${state.currentUser.nome}</span><span class="comment-time">${today()}</span></div><div class="comment-text">${c.texto}</div></div></div>`;
    toast('Comentário enviado!');
  }catch(err){showError(err.message);}
}

async function editOc(id){
  const o=await Ocorrencias.buscar(id);
  const modal=document.createElement('div');modal.className='modal-overlay';modal.id='modal-edit';
  modal.innerHTML=`<div class="modal fade-in"><div class="modal-header"><h3>✏️ Editar #${o.id}</h3><button class="close-btn" onclick="document.getElementById('modal-edit').remove()">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label>Título</label><input id="edit-titulo" type="text" value="${o.titulo}"></div>
      <div class="grid-2">
        <div class="form-group"><label>Categoria</label><select id="edit-cat">${state.categorias.map(c=>`<option value="${c.id}" ${o.categoria_id==c.id?'selected':''}>${c.icone} ${c.nome}</option>`).join('')}</select></div>
        <div class="form-group"><label>Prioridade</label><select id="edit-pri">${['Baixa','Média','Alta'].map(p=>`<option value="${p}" ${o.prioridade===p?'selected':''}>${p}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label>Endereço</label><input id="edit-end" type="text" value="${o.endereco}"></div>
      <div class="form-group"><label>Descrição</label><textarea id="edit-desc">${o.descricao}</textarea></div>
      <div id="edit-alert"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('modal-edit').remove()">Cancelar</button><button class="btn btn-primary" onclick="saveEditOc(${o.id})">Salvar</button></div>
  </div>`;
  document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function saveEditOc(id){
  const titulo=document.getElementById('edit-titulo').value.trim(),categoria_id=document.getElementById('edit-cat').value,prioridade=document.getElementById('edit-pri').value,endereco=document.getElementById('edit-end').value.trim(),descricao=document.getElementById('edit-desc').value.trim();
  if(!titulo||!endereco||!descricao){document.getElementById('edit-alert').innerHTML='<div class="alert alert-danger">Preencha todos os campos.</div>';return;}
  try{await Ocorrencias.atualizar(id,{titulo,categoria_id,prioridade,endereco,descricao});document.getElementById('modal-edit').remove();toast('Atualizada!');await renderPage();}
  catch(err){document.getElementById('edit-alert').innerHTML=`<div class="alert alert-danger">${err.message}</div>`;}
}

async function deleteOc(id){
  if(!confirm('Remover esta ocorrência?'))return;
  try{await Ocorrencias.remover(id);toast('Removida.','danger');await renderPage();}
  catch(err){showError(err.message);}
}

// NOTIFICAÇÕES
async function toggleNotif(e){
  e.stopPropagation();state.showNotif=!state.showNotif;
  const c=document.getElementById('notif-panel-container');
  if(state.showNotif){
    const res=await Notificacoes.listar();
    c.innerHTML=`<div style="position:absolute;top:60px;right:1.5rem;width:340px;background:var(--surface);border:1px solid var(--border);border-radius:14px;z-index:100;box-shadow:0 8px 32px rgba(0,0,0,.4);overflow:hidden">
      <div style="padding:1rem 1.2rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:600;font-size:14px">🔔 Notificações</span>
        ${res.naoLidas>0?`<button class="btn btn-secondary btn-sm" onclick="lerTodasNotif()">Marcar lidas</button>`:''}
      </div>
      ${res.data.length?res.data.map(n=>`<div style="padding:12px 1.2rem;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;display:flex;gap:10px;${!n.lida?'background:rgba(233,69,96,0.05);border-left:2px solid var(--accent)':''}" onclick="lerNotif(${n.id},${n.ocorrencia_id||'null'})">
        <span style="font-size:20px;flex-shrink:0">${n.tipo==='status'?'🔄':'💬'}</span>
        <div><div style="font-size:13px;font-weight:600;margin-bottom:2px">${n.titulo}</div><div style="font-size:12px;color:var(--text-muted)">${n.mensagem}</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">${n.created_at?.slice(0,10)}</div></div>
      </div>`).join(''):'<div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:13px">Sem notificações</div>'}
    </div>`;
  }else{c.innerHTML='';}
}
async function lerTodasNotif(){await Notificacoes.lerTodas();state.showNotif=false;document.getElementById('notif-panel-container').innerHTML='';toast('Todas marcadas como lidas.');}
async function lerNotif(id,ocId){await Notificacoes.lerUma(id);state.showNotif=false;document.getElementById('notif-panel-container').innerHTML='';if(ocId)await showDetail(ocId);}

async function buildNotificacoes(){
  const res=await Notificacoes.listar();
  if(!res.data.length)return`<div class="card"><div class="empty-state"><div class="empty-icon">🔔</div><p>Sem notificações.</p></div></div>`;
  return`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
    ${res.naoLidas>0?`<span class="badge badge-danger">${res.naoLidas} não lida(s)</span><button class="btn btn-secondary btn-sm" onclick="lerTodasPage()">Marcar todas lidas</button>`:'<span style="color:var(--text-muted);font-size:13px">Todas lidas</span><span></span>'}
  </div>
  <div class="card">${res.data.map(n=>`<div style="display:flex;gap:12px;padding:14px 1.2rem;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;${!n.lida?'background:rgba(233,69,96,0.04);border-left:3px solid var(--accent)':''}" onclick="lerNotif(${n.id},${n.ocorrencia_id||'null'})">
    <span style="font-size:22px;flex-shrink:0">${n.tipo==='status'?'🔄':'💬'}</span>
    <div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-size:14px;font-weight:600">${n.titulo}</span>${!n.lida?'<span class="badge badge-danger" style="font-size:10px">Nova</span>':''}</div>
    <div style="font-size:13px;color:var(--text-muted)">${n.mensagem}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">${n.created_at?.slice(0,10)}</div></div>
  </div>`).join('')}</div>`;
}
async function lerTodasPage(){await Notificacoes.lerTodas();toast('Todas lidas.');document.getElementById('page-content').innerHTML=await buildNotificacoes();}

// PERFIL
function buildPerfil(){
  const u=state.currentUser;
  return`<div style="max-width:640px;margin:0 auto">
    <div class="profile-section" style="text-align:center;padding:2rem">
      <div class="profile-avatar-big">${ini(u.nome)}</div>
      <div style="font-size:22px;font-weight:700">${u.nome}</div>
      <div style="color:var(--text-muted);font-size:14px;margin-top:4px">${roleLabel(u.role)}</div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">✏️ Editar dados</div>
      <div class="form-group"><label>Nome</label><input id="prof-nome" type="text" value="${u.nome}"></div>
      <div class="form-group"><label>E-mail</label><input id="prof-email" type="email" value="${u.email}"></div>
      <div class="form-group"><label>Bio</label><textarea id="prof-bio">${u.bio||''}</textarea></div>
      <div id="prof-alert"></div>
      <button class="btn btn-primary" onclick="savePerfil()">Salvar</button>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">🔒 Alterar senha</div>
      <div class="form-group"><label>Senha atual</label><input id="prof-old" type="password" placeholder="••••••••"></div>
      <div class="grid-2">
        <div class="form-group"><label>Nova senha</label><input id="prof-new" type="password" placeholder="••••••••"></div>
        <div class="form-group"><label>Confirmar</label><input id="prof-conf" type="password" placeholder="••••••••"></div>
      </div>
      <div id="pass-alert"></div>
      <button class="btn btn-secondary" onclick="changeSenha()">Alterar senha</button>
    </div>
  </div>`;
}
async function savePerfil(){
  const nome=document.getElementById('prof-nome').value.trim(),email=document.getElementById('prof-email').value.trim(),bio=document.getElementById('prof-bio').value.trim();
  const al=document.getElementById('prof-alert');
  try{const up=await Auth.updateMe({nome,email,bio});state.currentUser={...state.currentUser,...up};setUser(state.currentUser);al.innerHTML='<div class="alert alert-success">Dados salvos!</div>';toast('Perfil atualizado!');}
  catch(err){al.innerHTML=`<div class="alert alert-danger">${err.message}</div>`;}
}
async function changeSenha(){
  const senhaAtual=document.getElementById('prof-old').value,novaSenha=document.getElementById('prof-new').value,conf=document.getElementById('prof-conf').value;
  const al=document.getElementById('pass-alert');
  if(novaSenha!==conf){al.innerHTML='<div class="alert alert-danger">Senhas não conferem.</div>';return;}
  try{await Auth.updateSenha(senhaAtual,novaSenha);al.innerHTML='<div class="alert alert-success">Senha alterada!</div>';toast('Senha alterada!');}
  catch(err){al.innerHTML=`<div class="alert alert-danger">${err.message}</div>`;}
}

// CATEGORIAS
function buildCategorias(){
  return`<div style="display:flex;justify-content:flex-end;margin-bottom:1rem"><button class="btn btn-primary" onclick="openCatModal()">+ Nova Categoria</button></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem">
    ${state.categorias.map(c=>`<div class="card"><div class="card-body">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px"><div style="width:48px;height:48px;border-radius:12px;background:${c.cor}22;display:flex;align-items:center;justify-content:center;font-size:24px">${c.icone}</div><div><div style="font-weight:600">${c.nome}</div><div style="font-size:12px;color:var(--text-muted)">${c.total_ocorrencias||0} ocorrência(s)</div></div></div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${c.descricao||''}</p>
      <div style="display:flex;gap:8px"><button class="btn btn-secondary btn-sm" onclick="openCatModal(${c.id})">✏️ Editar</button><button class="btn btn-danger btn-sm" onclick="deleteCat(${c.id})">🗑️</button></div>
    </div></div>`).join('')}
  </div>`;
}
function openCatModal(id){
  const cat=id?state.categorias.find(c=>c.id===id):null;
  const modal=document.createElement('div');modal.className='modal-overlay';modal.id='modal-cat';
  modal.innerHTML=`<div class="modal fade-in"><div class="modal-header"><h3>${cat?'✏️ Editar':'➕ Nova'} Categoria</h3><button class="close-btn" onclick="document.getElementById('modal-cat').remove()">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label>Nome</label><input id="cat-nome" type="text" value="${cat?.nome||''}"></div>
      <div class="grid-2"><div class="form-group"><label>Ícone</label><input id="cat-icone" type="text" value="${cat?.icone||''}" placeholder="🏙️"></div><div class="form-group"><label>Cor</label><input id="cat-cor" type="color" value="${cat?.cor||'#74b9ff'}" style="height:44px;padding:4px"></div></div>
      <div class="form-group"><label>Descrição</label><textarea id="cat-desc">${cat?.descricao||''}</textarea></div>
      <div id="cat-alert"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById('modal-cat').remove()">Cancelar</button><button class="btn btn-primary" onclick="saveCat(${id||'null'})">${cat?'Salvar':'Criar'}</button></div>
  </div>`;
  document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}
async function saveCat(id){
  const nome=document.getElementById('cat-nome').value.trim(),icone=document.getElementById('cat-icone').value.trim(),cor=document.getElementById('cat-cor').value,descricao=document.getElementById('cat-desc').value.trim();
  if(!nome){document.getElementById('cat-alert').innerHTML='<div class="alert alert-danger">Nome obrigatório.</div>';return;}
  try{if(id)await Categorias.atualizar(id,{nome,icone,cor,descricao});else await Categorias.criar({nome,icone,cor,descricao});state.categorias=await Categorias.listar();document.getElementById('modal-cat').remove();toast(id?'Atualizada!':'Criada!');document.getElementById('page-content').innerHTML=buildCategorias();}
  catch(err){document.getElementById('cat-alert').innerHTML=`<div class="alert alert-danger">${err.message}</div>`;}
}
async function deleteCat(id){
  if(!confirm('Remover esta categoria?'))return;
  try{await Categorias.remover(id);state.categorias=await Categorias.listar();toast('Removida.','danger');document.getElementById('page-content').innerHTML=buildCategorias();}
  catch(err){showError(err.message);}
}

// ADMIN
async function buildAdmin(){
  if(state.adminTab==='usuarios'){
    const usuarios=await Usuarios.listar();
    return`${adminTabs()}<div class="card"><div class="card-header"><span class="card-title">Usuários</span><span style="font-size:13px;color:var(--text-muted)">${usuarios.length} cadastrado(s)</span></div>
    <div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Cadastro</th><th>Ocorrências</th><th>Ações</th></tr></thead>
    <tbody>${usuarios.map(u=>`<tr><td><div style="display:flex;align-items:center;gap:8px"><div style="width:30px;height:30px;border-radius:50%;background:var(--accent2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--info)">${ini(u.nome)}</div>${u.nome}</div></td>
      <td style="font-size:13px;color:var(--text-muted)">${u.email}</td>
      <td>${{admin:'🔴 Admin',fiscal:'🟡 Fiscal',cidadao:'🟢 Cidadão'}[u.role]||u.role}</td>
      <td style="font-size:12px;color:var(--text-muted)">${u.created_at?.slice(0,10)}</td>
      <td><span class="badge badge-info">${u.total_ocorrencias||0}</span></td>
      <td>${u.id!==state.currentUser.id?`<button class="btn btn-danger btn-sm" onclick="removeUser(${u.id})">Excluir</button>`:'<span style="font-size:12px;color:var(--text-muted)">Você</span>'}</td>
    </tr>`).join('')}</tbody></table></div></div>`;
  }else{
    const d=await Ocorrencias.dashboard(),t=d.totais,total=parseInt(t.total)||0;
    return`${adminTabs()}
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-card"><div class="stat-header"><span class="stat-label">TAXA RESOLUÇÃO</span></div><div class="stat-value" style="color:var(--success)">${total>0?Math.round(parseInt(t.resolvidas)/total*100):0}%</div></div>
      <div class="stat-card"><div class="stat-header"><span class="stat-label">TOTAL</span></div><div class="stat-value" style="color:var(--info)">${t.total}</div></div>
      <div class="stat-card"><div class="stat-header"><span class="stat-label">ALTA PRIORIDADE</span></div><div class="stat-value" style="color:var(--danger)">${t.alta_prioridade}</div></div>
    </div>
    <div class="grid-2" style="margin-top:1rem">
      <div class="card"><div class="card-header"><span class="card-title">Por Status</span></div><div class="card-body">${d.porStatus.map(s=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="flex:1;font-size:13px">${s.status}</span>${getStatusBadge(s.status)}<span style="font-weight:600;min-width:24px;text-align:right">${s.total}</span></div>`).join('')}</div></div>
      <div class="card"><div class="card-header"><span class="card-title">Por Categoria</span></div><div class="card-body">${d.porCategoria.map(c=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="font-size:16px">${c.icone}</span><span style="flex:1;font-size:13px">${c.nome}</span><span class="badge badge-info">${c.total}</span></div>`).join('')}</div></div>
    </div>`;
  }
}
function adminTabs(){return`<div class="tabs"><button class="tab ${state.adminTab==='usuarios'?'active':''}" onclick="switchAdminTab('usuarios')">👥 Usuários</button><button class="tab ${state.adminTab==='relatorio'?'active':''}" onclick="switchAdminTab('relatorio')">📈 Relatório</button></div>`;}
async function switchAdminTab(tab){state.adminTab=tab;document.getElementById('page-content').innerHTML=await buildAdmin();}
async function removeUser(id){
  if(!confirm('Excluir este usuário? As ocorrências e comentários dele também serão apagados. Esta ação não pode ser desfeita.'))return;
  try{await Usuarios.remover(id);toast('Usuário excluído.','danger');document.getElementById('page-content').innerHTML=await buildAdmin();}
  catch(err){showError(err.message);}
}

// INIT
render();
