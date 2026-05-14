import { db, auth } from "./firebase-config.js";
import { TEMAS } from "./cartas.js";
import {
  doc, setDoc, getDoc, updateDoc, onSnapshot, arrayUnion, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithPopup, signOut, GoogleAuthProvider, onAuthStateChanged,
  browserLocalPersistence, setPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ============================================================
// ESTADO
// ============================================================
let meuId       = sessionStorage.getItem("meuId") || gerarId();
let meuNome     = sessionStorage.getItem("meuNome") || "";
let meuAvatarId = localStorage.getItem("perfil_avatar") || "1";
let souDono     = false;
let salaAtual   = sessionStorage.getItem("salaAtual") || null;
let dadosAtuais = null;
let unsub       = null;
let travandoDica = false;
let timeoutAcertou = null;
let fimRegistrado = false;
let bloqueandoRender = false; // bloqueia renderizarJogo durante card de acertou/errou
let ultimoPalpiteVisto = 0;   // quantidade de palpites de erro já mostrados na rodada atual
let ultimoAcertoVisto = "";   // id da carta cujo acerto já foi exibido
let processandoResposta = false;

let modoJogo    = "classico";
let temaUnico   = "tecnologia";
let temasPersonalizados = new Set();
let maxJog      = 4;
let googleUser  = null;

sessionStorage.setItem("meuId", meuId);

function gerarId() {
  const id = Date.now() + "_" + Math.floor(Math.random() * 9999);
  sessionStorage.setItem("meuId", id);
  return id;
}
function gerarCodigo() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:6}, () => c[Math.floor(Math.random()*c.length)]).join("");
}
function norm(t) {
  return t.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function avatarSrc(id) { return `./assets/avatares/av${id}.png`; }
function criarAv(id, cls) {
  const d = document.createElement("div"); d.className = cls;
  const img = document.createElement("img"); img.src = avatarSrc(id); img.alt = "";
  img.onerror = () => { img.style.display="none"; };
  d.appendChild(img); return d;
}
function mostrarTela(id) {
  document.querySelectorAll(".tela").forEach(t => t.classList.remove("ativa"));
  document.getElementById(id).classList.add("ativa");
  window.scrollTo(0,0);
}
function mostrarMsg(txt, tipo) {
  const el = document.getElementById("mensagem"); if(!el) return;
  el.textContent = txt; el.className = "msg-jogo "+tipo;
  clearTimeout(el._t); el._t = setTimeout(() => { el.textContent=""; el.className="msg-jogo"; }, 3000);
}
function mostrarEst(id) {
  ["estAguardando","estEscolherDica","estResponder","estAcertou","estErrou","estOutro"].forEach(s => {
    const el = document.getElementById(s); if(el) el.classList.toggle("oculto", s !== id);
  });
}
function getPerfil() {
  return {
    vitorias: parseInt(localStorage.getItem("perfil_vitorias")||"0"),
    sequencia: parseInt(localStorage.getItem("perfil_sequencia")||"0"),
    recorde: parseInt(localStorage.getItem("perfil_recorde")||"0")
  };
}
function ganhou() {
  const p = getPerfil(), s = p.sequencia+1;
  localStorage.setItem("perfil_vitorias", p.vitorias+1);
  localStorage.setItem("perfil_sequencia", s);
  localStorage.setItem("perfil_recorde", Math.max(p.recorde,s));
}
function perdeu() { localStorage.setItem("perfil_sequencia","0"); }

// ============================================================
// GOOGLE AUTH
// ============================================================
const provider = new GoogleAuthProvider();
// Persistência local — usuário continua logado ao fechar e reabrir o app
setPersistence(auth, browserLocalPersistence).catch(()=>{});

onAuthStateChanged(auth, user => {
  googleUser = user;
  // Sempre atualizar visibilidade do botão de logout
  const btnLogout = document.getElementById("btnLogout");
  if(btnLogout) btnLogout.style.display = user ? "inline-flex" : "none";
  if(user) {
    meuId = user.uid;
    meuNome = user.displayName||user.email;
    sessionStorage.setItem("meuId", meuId);
    sessionStorage.setItem("meuNome", meuNome);
    // Se ainda está na tela inicial (não foi redirecionado), ir pro menu
    const telaInicio = document.getElementById("telaInicio");
    if(telaInicio && telaInicio.classList.contains("ativa")) {
      irMenu();
    }
  }
});

// Reconexão automática após F5
// ============================================================
// MODAIS
// ============================================================
document.addEventListener("click", e => {
  if(e.target.closest("button")) tocar("click");
  // Como jogar
  if(e.target.closest(".btn-como-jogar")){
    document.getElementById("modalComoJogar").classList.remove("oculto");
  }
  // Fechar como jogar
  if(e.target.closest("#fecharComoJogar") || e.target.id === "modalComoJogar"){
    document.getElementById("modalComoJogar").classList.add("oculto");
  }
  // Sair do jogo (botão no topbar do jogo)
  if(e.target.closest("#btnSairJogo")){
    document.getElementById("modalSairPartida").classList.remove("oculto");
  }
  // Cancelar sair
  if(e.target.closest("#cancelarSair")){
    document.getElementById("modalSairPartida").classList.add("oculto");
  }
  // Confirmar sair da partida
  if(e.target.closest("#confirmarSair")){
    document.getElementById("modalSairPartida").classList.add("oculto");
    if(unsub) unsub();
    salaAtual = null;
    sessionStorage.removeItem("salaAtual");
    fimRegistrado = false;
    irMenu();
  }
});


// ============================================================
// PERFIL
// ============================================================
function abrirPerfil(){
  const p = getPerfil();
  document.getElementById("perfilNomeDisplay").textContent = meuNome;
  document.getElementById("pstVitorias").textContent = p.vitorias||0;
  document.getElementById("pstStreak").textContent = p.sequencia||0;
  document.getElementById("pstRecorde").textContent = p.recorde||0;
  // Avatar grande
  const avGrande = document.getElementById("perfilAvGrande");
  avGrande.innerHTML = "";
  avGrande.appendChild(criarAv(meuAvatarId, "perfil-av-img"));
  // Badge Google
  document.getElementById("perfilGoogleBadge").style.display = googleUser ? "flex" : "none";
  // Selecionar avatar atual
  document.querySelectorAll("#perfilAvatarLista .av-opcao").forEach(b => {
    b.classList.toggle("selecionado", b.dataset.id === meuAvatarId);
  });
  document.getElementById("modalPerfil").classList.remove("oculto");
}

document.getElementById("fecharPerfil")?.addEventListener("click", () => {
  document.getElementById("modalPerfil").classList.add("oculto");
});

document.getElementById("btnAbrirPerfil")?.addEventListener("click", abrirPerfil);

// Selecionar avatar no perfil
document.querySelectorAll("#perfilAvatarLista .av-opcao").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#perfilAvatarLista .av-opcao").forEach(x => x.classList.remove("selecionado"));
    b.classList.add("selecionado");
    // Preview
    const avGrande = document.getElementById("perfilAvGrande");
    avGrande.innerHTML = "";
    avGrande.appendChild(criarAv(b.dataset.id, "perfil-av-img"));
  });
});

document.getElementById("salvarPerfil")?.addEventListener("click", () => {
  const sel = document.querySelector("#perfilAvatarLista .av-opcao.selecionado");
  if(sel) {
    meuAvatarId = sel.dataset.id;
    localStorage.setItem("perfil_avatar", meuAvatarId);
    atualizarTopbars();
  }
  document.getElementById("modalPerfil").classList.add("oculto");
});

// Reconectar ao voltar para a aba/app (mobile)
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible" && salaAtual && meuNome) {
    reconectarSala(salaAtual, meuNome);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  // Sempre começa na tela de início — depois reconecta se necessário
  // Isso garante que os botões sempre funcionam
  const salaGuardada = sessionStorage.getItem("salaAtual");
  const nomeGuardado = sessionStorage.getItem("meuNome");

  // Preenche o campo nome se já tiver salvo
  if (nomeGuardado) {
    const input = document.getElementById("nome");
    if (input) input.value = nomeGuardado;
  }

  // Tenta reconectar em background sem bloquear a tela
  if (nomeGuardado) {
    meuNome = nomeGuardado;
    if (salaGuardada) {
      // Tenta reconectar à sala, mas se der qualquer erro mostra login normal
      reconectarSala(salaGuardada, nomeGuardado);
    } else {
      // Tem nome mas sem sala — vai direto pro menu
      irMenu();
    }
  }
  // Se não tem nome, fica na telaInicio (já é a ativa por padrão)
});

async function reconectarSala(salaGuardada, nomeGuardado) {
  try {
    const snap = await getDoc(doc(db, "salas", salaGuardada));
    if (!snap.exists()) {
      sessionStorage.removeItem("salaAtual");
      irMenu();
      return;
    }
    const sala = snap.data();
    const euNaSala = sala.jogadores.some(j => j.id === meuId);
    if (!euNaSala) {
      sessionStorage.removeItem("salaAtual");
      irMenu();
      return;
    }
    souDono = sala.jogadores.find(j => j.id === meuId)?.dono === true;
    ouvirSala(salaGuardada);
  } catch(e) {
    // Qualquer erro: limpa sala e vai pro menu normalmente
    sessionStorage.removeItem("salaAtual");
    irMenu();
  }
}
document.getElementById("btnLogout")?.addEventListener("click", async () => {
  await signOut(auth).catch(()=>{});
  googleUser = null;
  sessionStorage.clear();
  location.reload();
});

document.getElementById("btnEntrarGoogle").addEventListener("click", async () => {
  try {
    const r = await signInWithPopup(auth, provider);
    googleUser = r.user; meuId = r.user.uid; meuNome = r.user.displayName||r.user.email;
    sessionStorage.setItem("meuId", meuId);
    sessionStorage.setItem("meuNome", meuNome);
    irMenu();
  } catch(e) { alert("Erro Google: "+e.message); }
});

// ============================================================
// TOPBARS
// ============================================================
function atualizarTopbars() {
  [
    ["topbarAvMenu","topbarNomeMenu","topbarPtsMenu"],
    ["topbarAvLobby","topbarNomeLobby",null],
    ["topbarAvJogo","topbarNomeJogo","topbarPtsJogo"],
    ["topbarAvFim","topbarNomeFim",null],
  ].forEach(([avId,nmId,ptsId]) => {
    const av = document.getElementById(avId);
    if(av) {
      av.innerHTML = "";
      const img = document.createElement("img");
      img.src = googleUser?.photoURL || avatarSrc(meuAvatarId);
      img.onerror = () => { img.style.display="none"; };
      av.appendChild(img);
    }
    const nm = document.getElementById(nmId); if(nm) nm.textContent = meuNome;
    if(ptsId) {
      const p = getPerfil();
      const el = document.getElementById(ptsId);
      if(el) el.textContent = `${p.vitorias} vitórias · recorde ${p.recorde}`;
    }
  });
}

// ============================================================
// TELA INÍCIO
// ============================================================
document.querySelectorAll("#avatarLista .av-opcao").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#avatarLista .av-opcao").forEach(b => b.classList.remove("selecionado"));
    btn.classList.add("selecionado"); meuAvatarId = btn.dataset.id;
    localStorage.setItem("perfil_avatar", meuAvatarId);
  });
});
(function(){
  const s = document.querySelector(`#avatarLista .av-opcao[data-id="${meuAvatarId}"]`);
  if(s){ document.querySelectorAll("#avatarLista .av-opcao").forEach(b => b.classList.remove("selecionado")); s.classList.add("selecionado"); }
})();
(function(){
  const p = new URLSearchParams(location.search);
  const s = p.get("sala"); if(s) sessionStorage.setItem("convite", s.toUpperCase());
})();
document.getElementById("btnEntrar").addEventListener("click", () => {
  const v = document.getElementById("nome").value.trim();
  if(!v){ document.getElementById("nome").focus(); return; }
  meuNome = v; sessionStorage.setItem("meuNome", meuNome); irMenu();
});
document.getElementById("nome").addEventListener("keydown", e => { if(e.key==="Enter") document.getElementById("btnEntrar").click(); });
function irMenu() {
  atualizarTopbars();
  const cv = sessionStorage.getItem("convite");
  if(cv){ sessionStorage.removeItem("convite"); document.getElementById("codigoSala").value=cv; abrirPainel("painelEntrar"); }
  mostrarTela("telaMenu");
}

// ============================================================
// MENU / PAINEIS
// ============================================================
document.getElementById("btnAbrirCriar").addEventListener("click", () => {
  fecharPaineis(); abrirPainel("painelCriar");
  const box = document.getElementById("donoBox"); box.innerHTML = "";
  box.appendChild(criarAv(meuAvatarId,"lobby-jog-av"));
  const nm = document.createElement("span"); nm.textContent = meuNome; box.appendChild(nm);
});
document.getElementById("btnAbrirEntrar").addEventListener("click", () => { fecharPaineis(); abrirPainel("painelEntrar"); });
document.querySelectorAll(".painel-x").forEach(btn => btn.addEventListener("click", () => fecharPainel(btn.dataset.fechar)));
function abrirPainel(id){ document.getElementById(id)?.classList.remove("oculto"); }
function fecharPainel(id){ document.getElementById(id)?.classList.add("oculto"); }
function fecharPaineis(){ document.querySelectorAll(".painel").forEach(p=>p.classList.add("oculto")); }

// Modo de jogo
document.querySelectorAll("[data-modo]").forEach(btn => {
  btn.addEventListener("click", () => {
    btn.closest(".tab-row").querySelectorAll(".tab").forEach(t=>t.classList.remove("ativo"));
    btn.classList.add("ativo"); modoJogo = btn.dataset.modo;
    document.getElementById("subTemaUnico").classList.toggle("oculto", modoJogo!=="aleatorio");
    document.getElementById("subTemaMulti").classList.toggle("oculto", modoJogo!=="personalizado");
  });
});
// Tema único
document.querySelectorAll("#temaFlexUnico .tchip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#temaFlexUnico .tchip").forEach(b=>b.classList.remove("ativo"));
    btn.classList.add("ativo"); temaUnico = btn.dataset.tema;
  });
});
// Multi temas
document.querySelectorAll("#temaFlexMulti .tchip").forEach(btn => {
  btn.addEventListener("click", () => {
    btn.classList.toggle("ativo");
    if(temasPersonalizados.has(btn.dataset.tema)) temasPersonalizados.delete(btn.dataset.tema);
    else temasPersonalizados.add(btn.dataset.tema);
  });
});
// Max jogadores
document.querySelectorAll(".nchip").forEach(btn => {
  btn.addEventListener("click", () => {
    btn.closest(".num-row").querySelectorAll(".nchip").forEach(b=>b.classList.remove("ativo"));
    btn.classList.add("ativo"); maxJog = Number(btn.dataset.num);
  });
});

// ============================================================
// CRIAR SALA
// ============================================================
document.getElementById("criarSala").addEventListener("click", async () => {
  if(!meuNome) return alert("Volte e coloque seu nome");
  if(modoJogo==="personalizado" && temasPersonalizados.size===0) return alert("Selecione pelo menos um tema");
  const codigo = gerarCodigo(); salaAtual = codigo; souDono = true;
  await setDoc(doc(db,"salas",codigo), {
    codigo, status:"lobby", modo: modoJogo,
    temaUnico: modoJogo==="aleatorio" ? temaUnico : null,
    temasPersonalizados: modoJogo==="personalizado" ? [...temasPersonalizados] : [],
    maxJogadores: maxJog,
    pontosVitoria: Number(document.getElementById("pontosVitoria").value),
    jogadores: [{id:meuId,nome:meuNome,avatarId:meuAvatarId,pontos:0,dono:true}],
    cartasUsadas:[], palpitesRodada:[], jogadorAtual:0, dicasAbertas:[], jaAbriuDica:false
  });
  fecharPaineis(); ouvirSala(codigo);
});

// ============================================================
// ENTRAR NA SALA
// ============================================================
document.getElementById("entrarSala").addEventListener("click", async () => {
  if(!meuNome) return alert("Volte e coloque seu nome");
  const codigo = document.getElementById("codigoSala").value.trim().toUpperCase();
  if(!codigo) return;
  const ref = doc(db,"salas",codigo);
  const snap = await getDoc(ref);
  if(!snap.exists()) return alert("Sala não encontrada");
  const sala = snap.data();
  if(sala.status!=="lobby") return alert("Partida já começou");
  if(sala.jogadores.length>=sala.maxJogadores) return alert("Sala cheia");
  if(!sala.jogadores.some(j=>j.id===meuId)) {
    await updateDoc(ref, { jogadores: arrayUnion({id:meuId,nome:meuNome,avatarId:meuAvatarId,pontos:0,dono:false}) });
  }
  salaAtual=codigo; souDono=false; fecharPaineis(); ouvirSala(codigo);
});

// ============================================================
// LOBBY
// ============================================================
document.getElementById("btnCopiarCodigo").addEventListener("click", () => {
  navigator.clipboard?.writeText(salaAtual||"");
  const b = document.getElementById("btnCopiarCodigo"); b.title="Copiado!";
  setTimeout(()=>b.title="Copiar",2000);
});
document.getElementById("btnCompartilhar").addEventListener("click", () => {
  const url = `${location.origin}${location.pathname}?sala=${salaAtual}`;
  navigator.clipboard ? navigator.clipboard.writeText(url).then(()=>alert("Link copiado!")) : prompt("Link:",url);
});
document.getElementById("btnSairSala").addEventListener("click", async () => {
  if(unsub) { unsub(); unsub = null; }
  if(salaAtual) {
    try {
      const snap = await getDoc(doc(db, "salas", salaAtual));
      if(snap.exists()) {
        const sala = snap.data();
        const novosJogadores = sala.jogadores.filter(j => j.id !== meuId);
        if(novosJogadores.length === 0 || souDono) {
          await deleteDoc(doc(db, "salas", salaAtual));
        } else {
          await updateDoc(doc(db, "salas", salaAtual), { jogadores: novosJogadores });
        }
      }
    } catch(e) {}
  }
  salaAtual = null;
  sessionStorage.removeItem("salaAtual");
  mostrarTela("telaMenu");
});
// Botão alterar config: esconder se não for dono, senão abre painel de criar como edição
document.getElementById("btnAlterarConfig").addEventListener("click", () => {
  if(!souDono) return;
  // Volta para o menu com o painel de configurações aberto
  if(unsub) unsub();
  salaAtual = null;
  sessionStorage.removeItem("salaAtual");
  mostrarTela("telaMenu");
  setTimeout(() => {
    document.getElementById("btnAbrirCriar").click();
  }, 100);
});
document.getElementById("btnIniciar").addEventListener("click", async () => {
  if(!souDono||!dadosAtuais) return;
  if(dadosAtuais.jogadores.length<2) return alert("Precisa de ao menos 2 jogadores");
  const carta = sortearCarta([], dadosAtuais);
  await updateDoc(doc(db,"salas",salaAtual), {
    status:"jogando", temaKey:carta.temaKey, temaNome:carta.temaNome,
    resposta:carta.resposta, dicas:carta.dicas, idCarta:carta.id,
    cartasUsadas:[carta.id], dicasAbertas:[], jogadorAtual:0,
    jaAbriuDica:false, palpitesRodada:[], respostaAnterior:null, mostrarRespostaAnterior:false
  });
});

function svgI(n) {
  const m = {
    grid:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    tag:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    users:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
    clock:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  };
  return m[n]||"";
}

function renderizarLobby(sala) {
  document.getElementById("lobbyCodigo").textContent = sala.codigo;
  document.getElementById("lobbyContagem").textContent = `(${sala.jogadores.length}/${sala.maxJogadores})`;
  const ul = document.getElementById("lobbyConfigLista"); ul.innerHTML="";
  const mLabel = {classico:"Tradicional",aleatorio:"Aleatório",personalizado:"Personalizado"}[sala.modo]||sala.modo;
  let tLabel = "Todos os temas";
  if(sala.modo==="aleatorio") tLabel=sala.temaUnico||"—";
  if(sala.modo==="personalizado") tLabel=(sala.temasPersonalizados||[]).join(", ")||"—";
  [{ico:"grid",l:"Modo de jogo:",v:mLabel},{ico:"tag",l:"Temas:",v:tLabel},
   {ico:"users",l:"Jogadores:",v:`${sala.jogadores.length}/${sala.maxJogadores}`},
   {ico:"clock",l:"Vitória com:",v:sala.pontosVitoria+" pts"}
  ].forEach(it => {
    const li=document.createElement("li");
    li.innerHTML=`${svgI(it.ico)}<strong>${it.l}</strong> ${it.v}`; ul.appendChild(li);
  });
  const jl = document.getElementById("lobbyJogadores"); jl.innerHTML="";
  sala.jogadores.forEach(j => {
    const li=document.createElement("li");
    const av=criarAv(j.avatarId||"1","lobby-jog-av");
    const nm=document.createElement("span"); nm.style.flex="1"; nm.textContent=j.nome;
    li.appendChild(av); li.appendChild(nm);
    if(j.dono){const t=document.createElement("span");t.className="tag-dono";t.textContent="Dono";li.appendChild(t);}
    else if(j.id===meuId){const t=document.createElement("span");t.className="tag-voce";t.textContent="Você";li.appendChild(t);}
    jl.appendChild(li);
  });
  document.getElementById("lobbyAguardando").style.display = sala.jogadores.length>=sala.maxJogadores?"none":"block";
  document.getElementById("btnIniciar").style.display = souDono ? "block" : "none";
  document.getElementById("btnAlterarConfig").style.display = souDono ? "flex" : "none";
  atualizarTopbars();
}



// ============================================================
// ÁUDIO (Web Audio API — sem arquivos externos)
// ============================================================
let audioCtx = null;
function getAudioCtx(){
  if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tocar(tipo){
  try{
    const ctx = getAudioCtx();
    const plays = {
      acertou: ()=>{
        // Acorde vitória ascendente
        [[523,0],[659,.1],[784,.2],[1047,.3]].forEach(([f,t])=>{
          const o=ctx.createOscillator(), g=ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value=f; o.type='sine';
          g.gain.setValueAtTime(0,ctx.currentTime+t);
          g.gain.linearRampToValueAtTime(.35,ctx.currentTime+t+.05);
          g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+t+.4);
          o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+.5);
        });
      },
      errou: ()=>{
        // Buzzer descendente
        [[300,0],[220,.1],[180,.2]].forEach(([f,t])=>{
          const o=ctx.createOscillator(), g=ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value=f; o.type='sawtooth';
          g.gain.setValueAtTime(0,ctx.currentTime+t);
          g.gain.linearRampToValueAtTime(.2,ctx.currentTime+t+.04);
          g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+t+.25);
          o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+.3);
        });
      },
      click: ()=>{
        const o=ctx.createOscillator(), g=ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value=800; o.type='sine';
        g.gain.setValueAtTime(.15,ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.08);
        o.start(); o.stop(ctx.currentTime+.1);
      },
      dica: ()=>{
        const o=ctx.createOscillator(), g=ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.setValueAtTime(440,ctx.currentTime);
        o.frequency.linearRampToValueAtTime(660,ctx.currentTime+.12);
        o.type='triangle';
        g.gain.setValueAtTime(.2,ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.2);
        o.start(); o.stop(ctx.currentTime+.25);
      },
      passaVez: ()=>{
        // Womp womp
        [[400,0],[300,.15],[200,.3]].forEach(([f,t])=>{
          const o=ctx.createOscillator(), g=ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value=f; o.type='triangle';
          g.gain.setValueAtTime(0,ctx.currentTime+t);
          g.gain.linearRampToValueAtTime(.25,ctx.currentTime+t+.05);
          g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+t+.3);
          o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+.35);
        });
      },
      bonus: ()=>{
        // Ding ding subindo
        [[880,0],[1047,.1],[1319,.2],[1568,.3]].forEach(([f,t])=>{
          const o=ctx.createOscillator(), g=ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value=f; o.type='sine';
          g.gain.setValueAtTime(0,ctx.currentTime+t);
          g.gain.linearRampToValueAtTime(.3,ctx.currentTime+t+.04);
          g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+t+.35);
          o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+.4);
        });
      },
      vitoria: ()=>{
        // Fanfarra
        [[523,0],[659,.15],[784,.3],[659,.45],[784,.6],[1047,.75]].forEach(([f,t])=>{
          const o=ctx.createOscillator(), g=ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value=f; o.type='square';
          g.gain.setValueAtTime(0,ctx.currentTime+t);
          g.gain.linearRampToValueAtTime(.2,ctx.currentTime+t+.05);
          g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+t+.35);
          o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+.4);
        });
      },
    };
    plays[tipo]?.();
  }catch(e){}
}

// ============================================================
// ANIMAÇÕES HELPERS
// ============================================================
function flashTela(tipo){
  const t = document.querySelector('.tela-jogo');
  if(!t) return;
  t.classList.remove('flash-verde','flash-vermelho');
  void t.offsetWidth; // reflow
  t.classList.add(tipo === 'verde' ? 'flash-verde' : 'flash-vermelho');
  setTimeout(()=>t.classList.remove('flash-verde','flash-vermelho'), 600);
}

function animarDado(){
  const d = document.querySelector('.dado-svg');
  if(!d) return;
  d.classList.remove('dado-spin');
  void d.offsetWidth;
  d.classList.add('dado-spin');
  setTimeout(()=>d.classList.remove('dado-spin'), 700);
}

function notifEspecial(txt){
  document.querySelectorAll('.notif-especial').forEach(e=>e.remove());
  const el = document.createElement('div');
  el.className = 'notif-especial';
  el.textContent = txt;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2200);
}

function animarPlacar(){
  document.querySelectorAll('.placar-item').forEach(el=>{
    el.classList.remove('updated');
    void el.offsetWidth;
    el.classList.add('updated');
    setTimeout(()=>el.classList.remove('updated'),400);
  });
}

// Dicas especiais
const DICA_PASSA_VEZ  = d => /passe a vez|passa a vez/i.test(d);
const DICA_GANHA_PTS  = d => /ganhou 10 pontos/i.test(d);
const PTS_BONUS = 10;

// ============================================================
// JOGO
// ============================================================


function mostrarCardOutro(titulo, sub, texto){
  document.getElementById("outroNome").textContent = titulo;
  const subEl = document.querySelector("#estOutro .fb-sub");
  if(subEl) subEl.textContent = sub;
  document.getElementById("outroPalpite").textContent = texto;
  bloqueandoRender = true;
  mostrarEst("estOutro");
  setTimeout(() => {
    bloqueandoRender = false;
    if(dadosAtuais && dadosAtuais.status === "jogando") renderizarJogo(dadosAtuais);
  }, 1800);
}

function renderizarJogo(sala) {
  if(bloqueandoRender) return;
  document.getElementById("jogoCodigoBadge").textContent = sala.codigo;

  // Mostrar card de ACERTO para outros jogadores (via acertoInfo)
  if(sala.acertoInfo && sala.acertoInfo.nome && sala.acertoInfo.nome !== meuNome){
    const chaveAcerto = "acerto_" + sala.idCarta;
    if(ultimoAcertoVisto !== chaveAcerto){
      ultimoAcertoVisto = chaveAcerto;
      mostrarCardOutro(`${sala.acertoInfo.nome} acertou!`, "RESPOSTA", sala.acertoInfo.resposta);
      return;
    }
    // já mostrou — não bloqueia, continua renderizando normalmente
  }

  // Mostrar card de ERRO para outros jogadores (via palpitesRodada)
  const pals = sala.palpitesRodada || [];
  if(pals.length > ultimoPalpiteVisto) {
    const pal = pals[pals.length - 1];
    if(pal && pal.id !== meuId && !pal.acertou) {
      ultimoPalpiteVisto = pals.length;
      mostrarCardOutro(`${pal.nome} errou`, "TENTATIVA", pal.texto);
      return;
    } else {
      ultimoPalpiteVisto = pals.length;
    }
  }
  atualizarTopbars();
  const jogAtual = sala.jogadores[sala.jogadorAtual];
  const euJogo   = jogAtual?.id === meuId;

  // Placar
  const pl = document.getElementById("placarLista"); pl.innerHTML="";
  sala.jogadores.forEach(j => {
    const d=document.createElement("div");
    d.className="placar-item"+(j.id===jogAtual?.id?" vez-ativa":"");
    const av=criarAv(j.avatarId||"1","placar-av");
    const nm=document.createElement("div");nm.className="placar-nome";nm.textContent=j.nome;
    const pts=document.createElement("div");pts.className="placar-pts";pts.textContent=j.pontos+" pts";
    d.appendChild(av);d.appendChild(nm);d.appendChild(pts);pl.appendChild(d);
  });

  // Dicas sidebar
  const dnl=document.getElementById("dicasNumeradas"); dnl.innerHTML="";
  for(let i=0;i<20;i++){
    const d=document.createElement("div");
    d.className="dica-num-item"+(sala.dicasAbertas.includes(i)?" revelada":"");
    d.textContent=sala.dicasAbertas.includes(i)?`${i+1}. ${sala.dicas[i]}`:`DICA${String(i+1).padStart(2,"0")}`;
    dnl.appendChild(d);
  }

  // Palpites
  const palsBar=sala.palpitesRodada||[];
  const bar=document.getElementById("palpitesBar");
  const bl=document.getElementById("palpitesBarLista");
  if(palsBar.length>0){
    bar.style.display="flex"; bl.innerHTML="";
    palsBar.forEach(p=>{
      const c=document.createElement("div");
      c.className="palpite-chip"+(p.acertou?"":" errado");
      c.innerHTML=`<span class="pch-nome">${p.nome}:</span><span class="pch-txt">${p.texto}</span>`;
      bl.appendChild(c);
    });
  } else { bar.style.display="none"; }

  // Notif resposta anterior
  if(sala.mostrarRespostaAnterior&&sala.respostaAnterior){
    exibirNotif(sala.respostaAnterior);
    if(souDono) updateDoc(doc(db,"salas",salaAtual),{mostrarRespostaAnterior:false});
  }



  if(!euJogo){
    document.getElementById("vezTexto").textContent=`Vez de ${jogAtual?.nome||"..."}`;
    mostrarEst("estAguardando"); animarDado();
  } else if(!sala.jaAbriuDica){
    construirHex(sala); mostrarEst("estEscolherDica");
  } else {
    const ult=sala.dicasAbertas[sala.dicasAbertas.length-1];
    document.getElementById("cartaTema").textContent=`TEMA: ${sala.temaNome}`;
    document.getElementById("cartaDicaTxt").textContent=sala.dicas[ult];
    document.getElementById("palpite").value="";
    mostrarEst("estResponder");
  }
}

async function abrirDica(idx, sala){
  const dica = sala.dicas[idx];

  if(DICA_PASSA_VEZ(dica)){
    await updateDoc(doc(db,"salas",salaAtual),{
      dicasAbertas:[...sala.dicasAbertas,idx], jaAbriuDica:true
    });
    travandoDica=false;
    tocar("passaVez"); notifEspecial("⏭️ Passa a vez!");
    setTimeout(async()=>{
      const snap=await getDoc(doc(db,"salas",salaAtual));
      if(!snap.exists()) return;
      const s=snap.data();
      const prox=(s.jogadorAtual+1)%s.jogadores.length;
      await updateDoc(doc(db,"salas",salaAtual),{jogadorAtual:prox,jaAbriuDica:false,palpitesRodada:[]});
    },2000);
    return;
  }

  if(DICA_GANHA_PTS(dica)){
    // Só dá os pontos e continua na mesma carta — não avança
    const jogNovos=sala.jogadores.map(j=>j.id===meuId?{...j,pontos:j.pontos+PTS_BONUS}:j);
    const venc=jogNovos.find(j=>j.pontos>=sala.pontosVitoria);
    tocar("bonus"); notifEspecial("🎯 +"+PTS_BONUS+" pontos!");
    if(venc){
      await updateDoc(doc(db,"salas",salaAtual),{
        jogadores:jogNovos, status:"fim", vencedor:venc.nome,
        dicasAbertas:[...sala.dicasAbertas,idx], jaAbriuDica:true,
        palpitesRodada:[]
      });
    } else {
      await updateDoc(doc(db,"salas",salaAtual),{
        jogadores:jogNovos,
        dicasAbertas:[...sala.dicasAbertas,idx], jaAbriuDica:true
      });
    }
    travandoDica=false;
    return;
  }

  // Dica normal
  tocar("dica");
  await updateDoc(doc(db,"salas",salaAtual),{
    dicasAbertas:[...sala.dicasAbertas,idx], jaAbriuDica:true
  });
  travandoDica=false;
}

function construirHex(sala){
  const g=document.getElementById("hexGrid"); g.innerHTML="";
  for(let i=0;i<20;i++){
    const b=document.createElement("button"); b.className="hex-btn"; b.textContent=i+1;
    if(sala.dicasAbertas.includes(i)){b.disabled=true;}
    b.addEventListener("click",async()=>{
      if(travandoDica) return; travandoDica=true;
      const s=(await getDoc(doc(db,"salas",salaAtual))).data();
      if(s.jaAbriuDica||s.dicasAbertas.includes(i)||s.jogadores[s.jogadorAtual]?.id!==meuId){travandoDica=false;return;}
      await abrirDica(i, s);
    });
    g.appendChild(b);
  }
}

document.getElementById("btnResponder").addEventListener("click",()=>processarResposta());
document.getElementById("palpite").addEventListener("keydown",e=>{if(e.key==="Enter")processarResposta();});

async function processarResposta(){
  if(processandoResposta) return;
  processandoResposta = true;
  try {
    const snap=await getDoc(doc(db,"salas",salaAtual));
    const sala=snap.data();
    const jogAtual=sala.jogadores[sala.jogadorAtual];
    if(jogAtual.id!==meuId) return mostrarMsg("Não é sua vez","erro");
    if(!sala.jaAbriuDica) return mostrarMsg("Abra uma dica primeiro!","aviso");
    const digitado=document.getElementById("palpite").value;
    if(!digitado.trim()){document.getElementById("palpite").focus();return;}
    const respNorm = norm(sala.resposta);
    const digNorm  = norm(digitado);
    const sins     = (sala.sinonimos||[]).map(s=>norm(s));
    const acertou  = digNorm === respNorm || sins.includes(digNorm);
    const palObj={id:meuId,nome:meuNome,texto:digitado.trim(),acertou};
    const palsAtual=sala.palpitesRodada||[];

    if(acertou){
      const pts=Math.max(1,20-sala.dicasAbertas.length);
      const jogNovos=sala.jogadores.map(j=>j.id===meuId?{...j,pontos:j.pontos+pts}:j);
      const venc=jogNovos.find(j=>j.pontos>=sala.pontosVitoria);
      if(venc){
        await updateDoc(doc(db,"salas",salaAtual),{
          jogadores:jogNovos, status:"fim", vencedor:venc.nome,
          palpitesRodada:[...palsAtual,palObj]
        });
        return;
      }
      // Mostrar acertou localmente por 2s (sem bloquear nada)
      document.getElementById("fbResposta").textContent = sala.resposta;
      document.getElementById("fbPontos").textContent = `Ganhou ${pts} PONTOS`;
      tocar("acertou"); flashTela("verde");
      mostrarEst("estAcertou");
      bloqueandoRender = true;
      if(timeoutAcertou) clearTimeout(timeoutAcertou);
      timeoutAcertou = setTimeout(() => {
        timeoutAcertou = null;
        bloqueandoRender = false;
        if(dadosAtuais && dadosAtuais.status === "jogando") renderizarJogo(dadosAtuais);
      }, 2000);
      await avancarCarta(jogNovos,sala,palObj,palsAtual,false,pts);
      return;
    }

    tocar("errou"); flashTela("vermelho");
    mostrarEst("estErrou");
    bloqueandoRender = true;
    setTimeout(()=>{
      bloqueandoRender = false;
      if(dadosAtuais && dadosAtuais.status === "jogando") renderizarJogo(dadosAtuais);
    }, 1000);

    if(sala.dicasAbertas.length>=20){
      await avancarCarta(sala.jogadores,sala,palObj,palsAtual,true); return;
    }
    const prox=(sala.jogadorAtual+1)%sala.jogadores.length;
    await updateDoc(doc(db,"salas",salaAtual),{jogadorAtual:prox,jaAbriuDica:false,palpitesRodada:[...palsAtual,palObj]});
  } finally {
    processandoResposta = false;
  }
}

async function avancarCarta(jogadores,sala,palObj,palsAtual,mostrarAnt,pts=0,ehBonus=false){
  ultimoPalpiteVisto = 0;
  const usadas=sala.cartasUsadas||[];
  const carta=sortearCarta(usadas,sala);
  const prox=(sala.jogadorAtual+1)%jogadores.length;
  await updateDoc(doc(db,"salas",salaAtual),{
    jogadores,
    temaKey:carta.temaKey, temaNome:carta.temaNome,
    resposta:carta.resposta, dicas:carta.dicas, sinonimos:carta.sinonimos||[], idCarta:carta.id,
    cartasUsadas:[...usadas,carta.id], dicasAbertas:[], jogadorAtual:prox,
    jaAbriuDica:false, palpitesRodada:[],
    respostaAnterior: mostrarAnt ? sala.resposta : null,
    mostrarRespostaAnterior: mostrarAnt,
    acertoInfo: (!mostrarAnt && pts > 0 && !ehBonus) ? {nome: palObj.nome, resposta: sala.resposta, pts} : null
  });
}

// ============================================================
// FIM
// ============================================================
function renderizarFim(sala){
  const ord=[...sala.jogadores].sort((a,b)=>b.pontos-a.pontos);
  const eu=sala.jogadores.find(j=>j.id===meuId);
  if(eu && !fimRegistrado){ fimRegistrado=true; if(eu.nome===sala.vencedor){tocar("vitoria");ganhou();}else{perdeu();} }
  atualizarTopbars();
  const podio=document.getElementById("podioFim"); podio.innerHTML="";
  // Montar pódio: 1º no centro, 2º à esquerda, 3º à direita
  animarPlacar(); ord.forEach((j,i)=>{
    const pos = i===0?"1º":i===1?"2º":"3º";
    const cls = i===0?"podio-1o":i===1?"podio-2o":"podio-3o";
    const div=document.createElement("div"); div.className=`podio-item ${cls}`;
    const aw=document.createElement("div"); aw.className="podio-av-wrap";
    if(i===0){const c=document.createElement("div");c.className="podio-coroa";c.textContent="👑";aw.appendChild(c);}
    aw.appendChild(criarAv(j.avatarId||"1","podio-av"));
    const nm=document.createElement("div");nm.className="podio-nome";nm.textContent=j.nome;
    const pts=document.createElement("div");pts.className="podio-pts";pts.textContent=j.pontos+" pts";
    const bl=document.createElement("div");bl.className="podio-plataforma";bl.textContent=pos;
    div.appendChild(aw);div.appendChild(nm);div.appendChild(pts);div.appendChild(bl);
    podio.appendChild(div);
  });
  document.getElementById("btnJogarNovamente").style.display=souDono?"inline-flex":"none";
  if(eu?.nome===sala.vencedor) dispararConfetes();
}

document.getElementById("btnJogarNovamente").addEventListener("click",async()=>{
  if(!salaAtual) return;
  const snap=await getDoc(doc(db,"salas",salaAtual)); if(!snap.exists()) return;
  const sala=snap.data();
  await updateDoc(doc(db,"salas",salaAtual),{
    status:"lobby", jogadores:sala.jogadores.map(j=>({...j,pontos:0})),
    cartasUsadas:[], palpitesRodada:[], dicasAbertas:[], jaAbriuDica:false,
    jogadorAtual:0, vencedor:null
  });
});

// ============================================================
// NOTIF + CONFETES
// ============================================================
function exibirNotif(r){
  const el=document.getElementById("notifResposta");
  document.getElementById("notifTexto").textContent=r;
  el.classList.remove("oculto");
  setTimeout(()=>el.classList.add("oculto"),3000);
}
function dispararConfetes(){
  const cv=document.getElementById("confetes"); cv.classList.remove("oculto");
  const ctx=cv.getContext("2d"); cv.width=innerWidth; cv.height=innerHeight;
  const cores=["#F5C800","#3AB54A","#E03A3A","#2563EB","#7C3AED"];
  const ps=Array.from({length:120},()=>({
    x:Math.random()*cv.width,y:-20,w:Math.random()*10+4,h:Math.random()*6+3,
    cor:cores[Math.floor(Math.random()*cores.length)],
    vx:(Math.random()-.5)*3,vy:Math.random()*3+2,rot:Math.random()*360,vrot:(Math.random()-.5)*8
  }));
  let f=0;
  function loop(){
    ctx.clearRect(0,0,cv.width,cv.height);
    ps.forEach(p=>{
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot*Math.PI/180);
      ctx.fillStyle=p.cor;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore();
      p.x+=p.vx;p.y+=p.vy;p.rot+=p.vrot;p.vy+=.05;
    });
    if(++f<180) requestAnimationFrame(loop);
    else{ctx.clearRect(0,0,cv.width,cv.height);cv.classList.add("oculto");}
  }
  loop();
}

// ============================================================
// OUVIR SALA
// ============================================================
function ouvirSala(codigo){
  if(unsub) unsub();
  salaAtual = codigo;
  sessionStorage.setItem("salaAtual", codigo);
  mostrarTela("telaLobby");
  unsub=onSnapshot(doc(db,"salas",codigo),snap=>{
    if(!snap.exists()) {
      if(unsub) { unsub(); unsub = null; }
      salaAtual = null;
      sessionStorage.removeItem("salaAtual");
      mostrarTela("telaMenu");
      return;
    }
    const sala=snap.data(); dadosAtuais=sala; travandoDica=false;
    const eu=sala.jogadores.find(j=>j.id===meuId);
    souDono=eu?.dono===true;
    if(sala.status==="lobby"){
      fimRegistrado=false; bloqueandoRender=false; ultimoPalpiteVisto=0; ultimoAcertoVisto="";
      if(timeoutAcertou){clearTimeout(timeoutAcertou);timeoutAcertou=null;}
      renderizarLobby(sala); mostrarTela("telaLobby");
    }
    if(sala.status==="jogando"){
      renderizarJogo(sala); mostrarTela("telaJogo");
    }
    if(sala.status==="fim"){
      bloqueandoRender=false; ultimoPalpiteVisto=0; ultimoAcertoVisto="";
      if(timeoutAcertou){clearTimeout(timeoutAcertou);timeoutAcertou=null;}
      renderizarFim(sala); mostrarTela("telaFim");
    }
  });
}

// ============================================================
// SORTEAR CARTA
// ============================================================
function sortearCarta(usadas,sala){
  const temas = sala.modo==="classico" ? Object.keys(TEMAS)
              : sala.modo==="aleatorio" ? [sala.temaUnico]
              : sala.temasPersonalizados||Object.keys(TEMAS);
  const pool=[];
  temas.forEach(key=>{
    const t=TEMAS[key]; if(!t) return;
    t.cartas.forEach((c,i)=>pool.push({id:c.id||`${key}-${i}`,temaKey:key,temaNome:t.nome,resposta:c.resposta,dicas:c.dicas,sinonimos:c.sinonimos||[]}));
  });
  let disp=pool.filter(c=>!usadas.includes(c.id));
  if(!disp.length) disp=pool;
  return disp[Math.floor(Math.random()*disp.length)];
}
