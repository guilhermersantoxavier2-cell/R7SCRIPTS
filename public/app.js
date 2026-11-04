const $ = (id) => document.getElementById(id);
const state = { embeds: [], selected: null, claimStep: 0, openedAt: 0, returned: false, admin: false, timer: null };

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.add("hidden"), 2600);
}
function show(id) { $(id).classList.remove("hidden"); }
function hide(id) { $(id).classList.add("hidden"); }
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
}
function safeImage(url) {
  try {
    const value = String(url || "").trim();
    if (!value) return "";
    // Imagens enviadas ao servidor usam caminhos relativos, como /uploads/arquivo.png.
    const u = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch { return ""; }
}
async function loadEmbeds() {
  try {
    state.embeds = await api("/api/embeds");
    renderEmbeds();
  } catch (err) {
    $("embedGrid").innerHTML = `<div class="empty">Não foi possível carregar os embeds.</div>`;
  }
}
function renderEmbeds() {
  const q = $("searchInput").value.trim().toLowerCase();
  const list = state.embeds.filter(e => `${e.name} ${e.description}`.toLowerCase().includes(q));
  $("embedGrid").innerHTML = list.map(e => {
    const image = safeImage(e.image);
    return `<article class="embed-card">
      ${image ? `<img class="card-image" src="${escapeHtml(image)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;card-placeholder&quot;>R7</div>'">` : `<div class="card-placeholder">R7</div>`}
      <div class="card-content"><h3 class="card-title">${escapeHtml(e.name)}</h3><p class="card-description">${escapeHtml(e.description)}</p></div>
      <div class="card-bottom"><span class="views" title="Acessos">◉ ${Number(e.views)||0}</span><button class="btn primary" data-open-embed="${escapeHtml(e.id)}">Pegar Script</button></div>
    </article>`;
  }).join("");
  $("emptyState").classList.toggle("hidden", list.length !== 0);
  if (!list.length) $("emptyState").textContent = q ? "Nenhum resultado para essa pesquisa." : "Nenhum embed publicado ainda.";
}
$("searchInput").addEventListener("input", renderEmbeds);
$("embedGrid").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-open-embed]");
  if (!button) return;
  const embed = state.embeds.find(e => e.id === button.dataset.openEmbed);
  if (!embed) return;
  state.selected = embed;
  try {
    const result = await api(`/api/embeds/${encodeURIComponent(embed.id)}/view`, { method: "POST", body: "{}" });
    embed.views = result.views;
  } catch {}
  $("detailTitle").textContent = embed.name;
  $("detailDescription").textContent = embed.description;
  const image = safeImage(embed.image);
  $("detailImage").src = image;
  $("detailImage").classList.toggle("hidden", !image);
  show("detailOverlay");
  renderEmbeds();
});
document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => hide(btn.dataset.close)));
document.querySelectorAll(".overlay").forEach(overlay => overlay.addEventListener("click", e => {
  if (e.target === overlay && overlay.id !== "adminOverlay") hide(overlay.id);
}));
$("startClaim").addEventListener("click", async () => {
  if (!state.selected) return;
  hide("detailOverlay");
  state.claimStep = 0;
  state.openedAt = 0;
  state.returned = false;
  $("claimError").classList.add("hidden");
  $("questionBox").classList.add("hidden");
  $("waitMessage").classList.add("hidden");
  show("claimOverlay");
  await renderClaimStep();
});
async function renderClaimStep() {
  const step = state.claimStep;
  $("stepLabel").textContent = `Passo ${step + 1} de 2`;
  $("stepCount").textContent = `${step}/2 concluídas`;
  $("progressBar").style.width = `${step * 50}%`;
  $("taskIcon").textContent = step === 0 ? "♪" : "◎";
  $("taskTitle").textContent = step === 0 ? "Siga no TikTok" : "Entre no Discord";
  $("taskSubtitle").textContent = step === 0 ? "Abra o TikTok e depois volte para continuar." : "Abra o servidor e depois volte para continuar.";
  $("openTask").textContent = step === 0 ? "Abrir TikTok" : "Abrir Discord";
  $("questionText").textContent = step === 0 ? "Seguiu a conta?" : "Entrou no serve?";
  $("questionBox").classList.add("hidden");
  $("waitMessage").classList.add("hidden");
  $("openTask").disabled = false;
  $("openTask").classList.remove("hidden");
}
$("openTask").addEventListener("click", async () => {
  const config = await api("/api/config");
  const link = state.claimStep === 0 ? config.tiktokLink : config.discordLink;
  // Os endereços são injetados pelo servidor somente quando configurados.
  if (!link) {
    $("claimError").textContent = state.claimStep === 0
      ? "O link do TikTok ainda não foi configurado no .env."
      : "O link do Discord ainda não foi configurado no .env.";
    $("claimError").classList.remove("hidden");
    return;
  }
  window.open(link, "_blank", "noopener,noreferrer");
  state.openedAt = Date.now();
  state.returned = false;
  $("openTask").disabled = true;
  $("waitMessage").textContent = "Aguarde pelo menos 8 segundos. Depois, volte e confirme.";
  $("waitMessage").classList.remove("hidden");
  $("claimError").classList.add("hidden");
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    $("openTask").classList.add("hidden");
    $("waitMessage").textContent = "Tempo mínimo concluído. Responda abaixo.";
    $("questionBox").classList.remove("hidden");
  }, 8000);
});
$("answerNo").addEventListener("click", () => {
  $("claimError").textContent = "Etapa não confirmada. Conclua a etapa para liberar a próxima.";
  $("claimError").classList.remove("hidden");
});
$("answerYes").addEventListener("click", () => {
  if (!state.openedAt || Date.now() - state.openedAt < 8000) {
    $("claimError").textContent = "Você precisa aguardar 8 segundos antes de confirmar.";
    $("claimError").classList.remove("hidden");
    return;
  }
  state.claimStep++;
  if (state.claimStep < 2) {
    state.openedAt = 0;
    renderClaimStep();
  } else {
    $("stepLabel").textContent = "Concluído";
    $("stepCount").textContent = "2/2 concluídas";
    $("progressBar").style.width = "100%";
    $("taskCard").classList.add("hidden");
    $("questionBox").classList.add("hidden");
    $("waitMessage").classList.add("hidden");
    const scriptValue = state.selected?.url || "";
    $("claimTitle").textContent = "Script liberado";
    $("claimError").classList.remove("hidden");
    $("claimError").textContent = "As respostas são autodeclaradas; o site não consegue verificar seguimento ou entrada no servidor.";
    const body = $("claimOverlay").querySelector(".modal-body");
    const code = document.createElement("pre");
    code.className = "released-script";
    code.textContent = scriptValue;
    code.id = "releasedScript";
    body.appendChild(code);
    const copyButton = document.createElement("button");
    copyButton.className = "btn primary";
    copyButton.type = "button";
    copyButton.textContent = "Copiar script";
    copyButton.style.marginTop = "14px";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(scriptValue);
        copyButton.textContent = "Copiado!";
      } catch {
        copyButton.textContent = "Selecione e copie o código";
      }
    });
    body.appendChild(copyButton);
  }
});
$("claimOverlay").addEventListener("click", e => {
  if (e.target.closest('[data-close="claimOverlay"]')) {
    clearTimeout(state.timer);
    $("taskCard").classList.remove("hidden");
    $("claimOverlay").querySelectorAll("a.btn, .released-script, button.btn.primary").forEach(el => {
      if (el.textContent === "Copiar script" || el.classList.contains("released-script")) el.remove();
    });
    $("claimTitle").textContent = "Desbloquear Script";
  }
});

// Admin
$("adminTrigger").addEventListener("click", async () => {
  try {
    const me = await api("/api/admin/me");
    if (me.authenticated) {
      show("adminOverlay");
      await refreshAdmin();
    } else show("loginOverlay");
  } catch { show("loginOverlay"); }
});
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").classList.add("hidden");
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ code: $("adminCode").value }) });
    hide("loginOverlay");
    $("adminCode").value = "";
    show("adminOverlay");
    await refreshAdmin();
  } catch (err) {
    $("loginError").textContent = err.message;
    $("loginError").classList.remove("hidden");
  }
});
document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", async () => {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("hidden", p.id !== tab.dataset.tab));
  if (tab.dataset.tab === "analyticsPanel") await loadAnalytics();
  if (tab.dataset.tab === "managePanel") await loadManage();
}));
const imageFileInput = $("embedImageFile");
const imagePreviewWrap = $("imagePreviewWrap");
const imagePreview = $("imagePreview");
imageFileInput.addEventListener("change", () => {
  const file = imageFileInput.files?.[0];
  if (!file) { imagePreviewWrap.classList.add("hidden"); imagePreview.removeAttribute("src"); return; }
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    imageFileInput.value = ""; imagePreviewWrap.classList.add("hidden");
    toast("Escolha PNG, JPG, WEBP ou GIF de até 5 MB."); return;
  }
  imagePreview.src = URL.createObjectURL(file);
  imagePreviewWrap.classList.remove("hidden");
});
$("removeImage").addEventListener("click", () => {
  imageFileInput.value = ""; imagePreview.removeAttribute("src"); imagePreviewWrap.classList.add("hidden");
});

$("publishForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("publishError").classList.add("hidden");
  const payload = new FormData();
  payload.append("image", $("embedImage").value.trim());
  payload.append("name", $("embedName").value.trim());
  payload.append("description", $("embedDescription").value.trim());
  payload.append("url", $("embedUrl").value.trim());
  if (imageFileInput.files?.[0]) payload.append("imageFile", imageFileInput.files[0]);
  try {
    const response = await fetch("/api/admin/embeds", { method: "POST", credentials: "same-origin", body: payload });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível publicar o embed.");
    e.target.reset();
    imagePreviewWrap.classList.add("hidden"); imagePreview.removeAttribute("src");
    toast("Embed publicado para todos!");
    await loadEmbeds();
    await loadManage();
    document.querySelector('[data-tab="managePanel"]').click();
  } catch (err) {
    $("publishError").textContent = err.message;
    $("publishError").classList.remove("hidden");
  }
});
async function refreshAdmin() {
  await loadManage();
  await loadAnalytics();
}
async function loadManage() {
  const embeds = await api("/api/admin/embeds");
  $("manageList").innerHTML = embeds.length ? embeds.map(e => `
    <div class="manage-item">
      ${safeImage(e.image) ? `<img src="${escapeHtml(safeImage(e.image))}" alt="">` : `<div class="task-icon">R7</div>`}
      <div class="manage-info"><strong>${escapeHtml(e.name)}</strong><small>◉ ${Number(e.views)||0} visualizações</small></div>
      <button class="delete-btn" data-delete="${escapeHtml(e.id)}">Apagar</button>
    </div>`).join("") : `<p class="muted">Nenhum embed publicado.</p>`;
}
$("manageList").addEventListener("click", async e => {
  const button = e.target.closest("[data-delete]");
  if (!button) return;
  if (!confirm("Tem certeza que deseja apagar este embed?")) return;
  try {
    await api(`/api/admin/embeds/${encodeURIComponent(button.dataset.delete)}`, { method: "DELETE" });
    toast("Embed apagado.");
    await loadManage();
    await loadEmbeds();
    await loadAnalytics();
  } catch (err) { toast(err.message); }
});
async function loadAnalytics() {
  const data = await api("/api/admin/analytics");
  $("totalEmbeds").textContent = data.totalEmbeds;
  $("totalViews").textContent = data.totalViews;
  const max = Math.max(1, ...data.embeds.map(e => e.views));
  $("chartBars").innerHTML = data.embeds.length ? data.embeds.map(e => `
    <div class="chart-row">
      <span class="chart-name" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(e.views/max)*100}%"></div></div>
      <span class="chart-value">${e.views}</span>
    </div>`).join("") : `<p class="muted">Publique embeds para visualizar o desempenho.</p>`;
}
$("logoutButton").addEventListener("click", async () => {
  try { await api("/api/admin/logout", { method: "POST", body: "{}" }); } catch {}
  hide("adminOverlay");
  toast("Sessão administrativa encerrada.");
});

$("year").textContent = new Date().getFullYear();
loadEmbeds();
