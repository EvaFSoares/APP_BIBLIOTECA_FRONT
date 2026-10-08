/* ========= CONFIGURAÇÃO (ajuste aos seus endpoints) ========= */
const API = "http://127.0.0.1:5000";
const LOGIN_PATH = "/funcionario/login"; // POST {login, senha}

// Cada entidade: rota, chave primária e campos [coluna, rótulo, tipo, opções?]
const ENT = {
  livro: { path: "/livro", id: "idLivro", titulo: "Livros", campos: [
    ["titulo", "Título"], ["autor", "Autor"], ["editora", "Editora"],
    ["ano", "Ano", "number"], ["categoria", "Categoria"],
    ["quantidadeDisponivel", "Qtd. disponível", "number"],
    ["quantidadeTotal", "Qtd. total", "number"]] },
  estudante: { path: "/estudante", id: "idEstudante", titulo: "Estudantes", campos: [
    ["nome", "Nome"], ["turma", "Turma"], ["matricula", "Matrícula"], ["contato", "Contato"]] },
  emprestimo: { path: "/emprestimo", id: "idEmprestimo", titulo: "Empréstimos", campos: [
    ["dataEmprestimo", "Data do empréstimo", "date"],
    ["dataDevolucaoPrevista", "Devolução prevista", "date"],
    ["dataDevolucaoReal", "Devolução real", "date"],
    ["status", "Status", "select", [[0, "Em andamento"], [1, "Devolvido"]]]] },
  funcionario: { path: "/funcionario", id: "idFuncionario", titulo: "Funcionários", campos: [
    ["nome", "Nome"], ["login", "Login"], ["senha", "Senha", "password"]] },
};

/* ========= UTILIDADES ========= */
const $ = s => document.querySelector(s);
let atual = "livro", linhas = [], editando = null;

async function api(path, method = "GET", body) {
  const r = await fetch(API + path, {
    method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  if (!r.ok) throw new Error(txt || "Erro " + r.status);
  return txt ? JSON.parse(txt) : null;
}
function toast(msg, erro) {
  const t = $("#toast"); t.textContent = msg; t.className = erro ? "err" : "";
  t.hidden = false; setTimeout(() => t.hidden = true, 3000);
}
// Aceita "2026-10-08" ou "Thu, 08 Oct 2026 00:00:00 GMT" (formato do jsonify)
function iso(v) { if (!v) return ""; const d = new Date(v); return isNaN(d) ? v : d.toISOString().slice(0, 10); }
function br(v) { const i = iso(v); return i ? i.split("-").reverse().join("/") : "—"; }
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ========= LOGIN ========= */
function entrar(nome) {
  sessionStorage.setItem("func", nome);
  $("#login").hidden = true; $("#app").hidden = false;
  $("#usuario").textContent = "👤 " + nome; carregar();
}
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  try { const r = await api(LOGIN_PATH, "POST", d); entrar(r?.nome || d.login); }
  catch { const m = $("#loginErro"); m.textContent = "Login ou senha inválidos."; m.hidden = false; }
});
$("#sair").onclick = () => { sessionStorage.clear(); location.reload(); };
if (sessionStorage.getItem("func")) entrar(sessionStorage.getItem("func"));

/* ========= LISTAGEM ========= */
document.querySelectorAll("#menu button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#menu button").forEach(x => x.classList.remove("ativo"));
  b.classList.add("ativo"); atual = b.dataset.view; $("#busca").value = ""; carregar();
});
$("#busca").oninput = desenhar;

async function carregar() {
  try { const r = await api(ENT[atual].path); linhas = Array.isArray(r) ? r : []; }
  catch (e) { linhas = []; toast("Falha ao carregar: " + e.message, true); }
  desenhar();
}

function celula(c, v) {
  const [col, , tipo] = c;
  if (tipo === "date") return br(v);
  if (tipo === "select") return `<span class="badge ${+v === 1 ? "ok" : ""}">${esc(c[3].find(o => o[0] == v)?.[1] ?? v)}</span>`;
  return esc(v);
}

function desenhar() {
  const e = ENT[atual], q = $("#busca").value.toLowerCase();
  const cols = e.campos.filter(c => c[2] !== "password");
  $("#titulo").textContent = e.titulo;
  $("#thead").innerHTML = "<tr><th>#</th>" + cols.map(c => `<th>${c[1]}</th>`).join("") + "<th>Ações</th></tr>";
  const vis = linhas.filter(l => JSON.stringify(l).toLowerCase().includes(q));
  $("#tbody").innerHTML = vis.map(l => `<tr><td>${l[e.id]}</td>` +
    cols.map(c => `<td>${celula(c, l[c[0]])}</td>`).join("") +
    `<td class="acoes-td"><button class="icone" data-ed="${l[e.id]}" title="Editar">✏️</button>` +
    `<button class="icone del" data-del="${l[e.id]}" title="Excluir">🗑️</button></td></tr>`).join("");
  $("#vazio").hidden = vis.length > 0;
}

$("#tbody").addEventListener("click", async ev => {
  const b = ev.target.closest("button"); if (!b) return;
  const e = ENT[atual];
  if (b.dataset.ed) abrir(linhas.find(l => l[e.id] == b.dataset.ed));
  if (b.dataset.del && confirm("Excluir este registro?")) {
    try { await api(`${e.path}/${b.dataset.del}`, "DELETE"); toast("Registro excluído"); carregar(); }
    catch (er) { toast(er.message, true); }
  }
});

/* ========= FORMULÁRIO (criar / editar) ========= */
function abrir(reg) {
  const e = ENT[atual]; editando = reg ? reg[e.id] : null;
  $("#modalTitulo").textContent = (reg ? "Editar " : "Novo(a) ") + e.titulo.toLowerCase();
  $("#campos").innerHTML = e.campos.map(([col, rot, tipo = "text", ops]) => {
    const v = reg ? reg[col] : "";
    const req = col === "dataDevolucaoReal" ? "" : "required"; // opcional no formulário
    if (tipo === "select") return `<label>${rot}<select name="${col}">` +
      ops.map(o => `<option value="${o[0]}" ${o[0] == v ? "selected" : ""}>${o[1]}</option>`).join("") + "</select></label>";
    const val = tipo === "date" ? iso(v) : (tipo === "password" ? "" : v);
    return `<label>${rot}<input name="${col}" type="${tipo}" value="${esc(val)}" ${req}></label>`;
  }).join("");
  $("#modal").showModal();
}
$("#novo").onclick = () => abrir();
$("#cancelar").onclick = () => $("#modal").close();

$("#form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const e = ENT[atual], dados = {};
  e.campos.forEach(([col, , tipo]) => {
    let v = ev.target.elements[col].value;
    if (tipo === "number" || tipo === "select") v = Number(v);
    dados[col] = v;
  });
  // dataDevolucaoReal é NOT NULL no banco: usa a data prevista enquanto não devolvido
  if (atual === "emprestimo" && !dados.dataDevolucaoReal) dados.dataDevolucaoReal = dados.dataDevolucaoPrevista;
  try {
    editando ? await api(`${e.path}/${editando}`, "PUT", dados) : await api(e.path, "POST", dados);
    $("#modal").close(); toast("Salvo com sucesso"); carregar();
  } catch (er) { toast(er.message, true); }
});
