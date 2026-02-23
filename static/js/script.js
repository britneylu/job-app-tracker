/* Internship Tracker (LocalStorage) */

/* import Firebase modules */
/* https://console.firebase.google.com/u/0/project/job-app-tracker-e5dc4/authentication/users */
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
    collection,
    getDocs,
    setDoc,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* import Firebase globals */
const auth = window.firebaseAuth;
const db = window.firebaseDB;
let currentUser = null;

// Auth UI elements
const authModal = document.getElementById("authModal");
const authBackdrop = document.getElementById("authBackdrop");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");

function openAuth() {
    authModal.classList.remove("hidden");
    authBackdrop.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    authEmail.focus();
}

function closeAuth() {
    authModal.classList.add("hidden");
    authBackdrop.classList.add("hidden");
    document.body.style.overflow = "";
    authEmail.value = "";
    authPassword.value = "";
}

// open modal
btnLogin.addEventListener("click", openAuth);

// close modal
document.getElementById("btnAuthCancel").addEventListener("click", closeAuth);
document.getElementById("btnCloseAuth").addEventListener("click", closeAuth);
authBackdrop.addEventListener("click", closeAuth);

// submit login
document.getElementById("btnAuthSubmit").addEventListener("click", async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();

    if (!email || !password) {
        alert("Please enter email and password.");
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        if (err.code === "auth/user-not-found") {
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            alert(err.message);
            return;
        }
    }

    closeAuth();
});

const STORAGE_KEY = "internship_tracker_v1";
const FOLLOWUP_DEFAULT_DAYS = 30;

const Status = {
    APPLIED: "APPLIED",
    OA: "OA",
    INTERVIEW: "INTERVIEW",
    OFFER: "OFFER",
    REJECTED: "REJECTED",
    WITHDRAWN: "WITHDRAWN",
    ARCHIVED: "ARCHIVED",
};

const StatusLabel = {
    APPLIED: "Applied",
    OA: "OA",
    INTERVIEW: "Interview",
    OFFER: "Offer",
    REJECTED: "Rejected",
    WITHDRAWN: "Withdrawn",
    ARCHIVED: "Archived",
};

const els = {
    btnAdd: document.getElementById("btnAdd"),
    btnAddEmpty: document.getElementById("btnAddEmpty"),
    btnExport: document.getElementById("btnExport"),
    importFile: document.getElementById("importFile"),
    btnClearAll: document.getElementById("btnClearAll"),

    sumTotal: document.getElementById("sumTotal"),
    sumApplied: document.getElementById("sumApplied"),
    sumInterview: document.getElementById("sumInterview"),
    sumOffer: document.getElementById("sumOffer"),
    sumFollowups: document.getElementById("sumFollowups"),

    filterChips: Array.from(document.querySelectorAll(".chip")),
    searchInput: document.getElementById("searchInput"),
    sortSelect: document.getElementById("sortSelect"),
    toggleFollowupsOnly: document.getElementById("toggleFollowupsOnly"),

    tableBody: document.getElementById("tableBody"),
    resultsMeta: document.getElementById("resultsMeta"),
    emptyState: document.getElementById("emptyState"),

    modal: document.getElementById("modal"),
    modalBackdrop: document.getElementById("modalBackdrop"),
    modalTitle: document.getElementById("modalTitle"),
    btnCloseModal: document.getElementById("btnCloseModal"),
    btnCancel: document.getElementById("btnCancel"),
    btnArchiveToggle: document.getElementById("btnArchiveToggle"),

    form: document.getElementById("appForm"),
    appId: document.getElementById("appId"),
    company: document.getElementById("company"),
    role: document.getElementById("role"),
    location: document.getElementById("location"),
    status: document.getElementById("status"),
    dateApplied: document.getElementById("dateApplied"),
    postingLink: document.getElementById("postingLink"),
    accountLink: document.getElementById("accountLink"),
    followUpDate: document.getElementById("followUpDate"),
    contact: document.getElementById("contact"),
    notes: document.getElementById("notes"),

    toast: document.getElementById("toast"),
};

let state = {
    items: [],
    filter: "ALL",
    search: "",
    sort: "DATE_DESC",
    followupsOnly: false,
};

/* ---------- UTILS ---------- */
function nowISODate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function formatDateMDY(isoDate) {
    if (!isoDate) return "—";
    const [yyyy, mm, dd] = isoDate.split("-");
    return `${mm}/${dd}/${yyyy}`;
}

function safeUrl(url) {
    if (!url) return "";
    try {
        const u = new URL(url);
        return u.toString();
    } catch {
        return "";
    }
}

function daysBetween(isoA, isoB) {
    if (!isoA || !isoB) return null;
    const a = new Date(isoA + "T00:00:00");
    const b = new Date(isoB + "T00:00:00");
    const ms = b - a;
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function isFollowupNeeded(item) {
    // if rejected/offer/archived/withdrawn --> don't nag
    if ([Status.REJECTED, Status.OFFER, Status.ARCHIVED, Status.WITHDRAWN].includes(item.status)) return false;

    const today = nowISODate();

    // if explicit follow-up date exists and is due or past
    if (item.followUpDate) {
        const diff = daysBetween(item.followUpDate, today); // today - followUpDate
        return diff !== null && diff >= 0;
    }

    // otherwise, default --> applied date older than threshold
    const age = daysBetween(item.dateApplied, today);
    return age !== null && age >= FOLLOWUP_DEFAULT_DAYS;
}

function followupLabel(item) {
    const today = nowISODate();
    if (item.followUpDate) {
        const diff = daysBetween(item.followUpDate, today);
        if (diff === null) return "—";
        if (diff < 0) return `In ${Math.abs(diff)}d`;
        if (diff === 0) return "Today";
        return `${diff}d overdue`;
    }

    const age = daysBetween(item.dateApplied, today);
    if (age === null) return "—";
    if (age < FOLLOWUP_DEFAULT_DAYS) return `${FOLLOWUP_DEFAULT_DAYS - age}d`;
    if (age === FOLLOWUP_DEFAULT_DAYS) return "Due";
    return `${age - FOLLOWUP_DEFAULT_DAYS}d overdue`;
}

function statusPillClass(status) {
    switch (status) {
        case Status.APPLIED: return "applied";
        case Status.OA: return "oa";
        case Status.INTERVIEW: return "interview";
        case Status.OFFER: return "offer";
        case Status.WITHDRAWN: return "withdrawn";
        case Status.REJECTED: return "rejected";
        case Status.ARCHIVED: return "archived";
        default: return "applied";
    }
}

function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.add("hidden"), 2200);
}

/* ---------- STORAGE ---------- */
async function load() {
    if (!currentUser) {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    }

    const snap = await getDocs(
        collection(db, "users", currentUser.uid, "applications")
    );

    return snap.docs.map(d => d.data());
}

async function save(items) {
    if (!currentUser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        return;
    }

    for (const item of items) {
        await setDoc(
            doc(db, "users", currentUser.uid, "applications", item.id),
            item
        );
    }
}

/* ---------- CRUD ---------- */
function newId() {
    // simple unique enough id for local app
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function addItem(item) {
    state.items = [item, ...state.items];
    save(state.items);
    toast("Application added");
    render();
}

function updateItem(id, patch) {
    state.items = state.items.map(it => it.id === id ? { ...it, ...patch, updatedAt: Date.now() } : it);
    save(state.items);
    toast("Saved");
    render();
}

function deleteItem(id) {
    state.items = state.items.filter(it => it.id !== id);
    save(state.items);
    toast("Deleted");
    render();
}

/* ---------- FILTER/SORT ---------- */
function matchesSearch(item, q) {
    if (!q) return true;
    const hay = [
        item.company, item.role, item.location, item.status,
        item.link, item.notes, item.contact
    ].join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
}

function applyFilterSort(items) {
    let out = [...items];

    // status filter
    if (state.filter !== "ALL") {
        out = out.filter(it => it.status === state.filter);
    }

    // followups only
    if (state.followupsOnly) {
        out = out.filter(isFollowupNeeded);
    }

    // search
    out = out.filter(it => matchesSearch(it, state.search));

    // sort
    switch (state.sort) {
        case "DATE_ASC":
            out.sort((a, b) => (a.dateApplied || "").localeCompare(b.dateApplied || ""));
            break;
        case "DATE_DESC":
            out.sort((a, b) => (b.dateApplied || "").localeCompare(a.dateApplied || ""));
            break;
        case "COMPANY_ASC":
            out.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
            break;
        case "STATUS_ASC":
            out.sort((a, b) => (a.status || "").localeCompare(b.status || ""));
            break;
        case "FOLLOWUP_DESC":
            out.sort((a, b) => Number(isFollowupNeeded(b)) - Number(isFollowupNeeded(a)));
            // tie-breaker by date desc
            out.sort((a, b) => {
                const fb = Number(isFollowupNeeded(b));
                const fa = Number(isFollowupNeeded(a));
                if (fb !== fa) return fb - fa;
                return (b.dateApplied || "").localeCompare(a.dateApplied || "");
            });
            break;
        default:
            break;
    }

    return out;
}

/* ---------- RENDER ---------- */
function setSummary() {
    const total = state.items.length;
    const applied = state.items.filter(i => i.status === Status.APPLIED).length;
    const interview = state.items.filter(i => i.status === Status.INTERVIEW).length;
    const offer = state.items.filter(i => i.status === Status.OFFER).length;
    const followups = state.items.filter(isFollowupNeeded).length;

    els.sumTotal.textContent = total;
    els.sumApplied.textContent = applied;
    els.sumInterview.textContent = interview;
    els.sumOffer.textContent = offer;
    els.sumFollowups.textContent = followups;
}

function renderRow(item) {
    const followNeeded = isFollowupNeeded(item);
    const followText = followupLabel(item);

    const companyCell = item.link
        ? `<a class="link" href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">${escapeHtml(item.company)}</a>`
        : `${escapeHtml(item.company)}`;

    const followBadge = followNeeded
        ? `<span class="badge warn">${escapeHtml(followText)}</span>`
        : `<span class="badge">${escapeHtml(followText)}</span>`;

    return `
    <div class="table-row" role="row" data-id="${escapeAttr(item.id)}">
      <div role="cell">${companyCell}</div>
      <div role="cell">${escapeHtml(item.role)}</div>
      <div role="cell">${escapeHtml(item.location || "—")}</div>
      <div role="cell">
        <span class="pill ${statusPillClass(item.status)}">
          <span class="dot" aria-hidden="true"></span>
          ${escapeHtml(StatusLabel[item.status] || item.status)}
        </span>
      </div>
    <div role="cell">${escapeHtml(formatDateMDY(item.dateApplied))}</div>
      <div role="cell">${followBadge}</div>
    <div role="cell" class="actions">
        <button class="kebab-btn" aria-label="More actions">⋯</button>

        <div class="action-menu hidden">
            <button data-action="edit">Edit</button>
            <button data-action="dup">Duplicate</button>
            <button data-action="del" class="danger">Delete</button>
        </div>
    </div>

    </div>
  `;
}

function render() {
    setSummary();

    const filtered = applyFilterSort(state.items);
    els.resultsMeta.textContent = `${filtered.length} result${filtered.length === 1 ? "" : "s"}`;

    if (state.items.length === 0) {
        els.tableBody.innerHTML = "";
        els.emptyState.classList.remove("hidden");
    } else {
        els.emptyState.classList.add("hidden");
        els.tableBody.innerHTML = filtered.map(renderRow).join("");
    }

    // wire kebab menu actions
    els.tableBody.querySelectorAll(".table-row").forEach(row => {
        const kebabBtn = row.querySelector(".kebab-btn");
        const menu = row.querySelector(".action-menu");

        if (!kebabBtn || !menu) return;

        // toggle menu when clicking ...
        kebabBtn.addEventListener("click", (e) => {
            e.stopPropagation();

            // close any other open menus
            document.querySelectorAll(".action-menu").forEach(m => {
                if (m !== menu) m.classList.add("hidden");
            });

            menu.classList.toggle("hidden");
        });

        // handle menu item clicks
        menu.addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;

            const action = btn.dataset.action;
            const id = row.dataset.id;

            if (action === "edit") openModalForEdit(id);

            if (action === "dup") duplicateItem(id);

            if (action === "del") {
                const item = state.items.find(i => i.id === id);
                const ok = confirm(`Delete "${item?.company || "this"}" application?`);
                if (ok) deleteItem(id);
            }

            menu.classList.add("hidden");
        });
    });

    // close all action menus when clicking outside
    document.addEventListener("click", () => {
        document.querySelectorAll(".action-menu").forEach(menu => {
            menu.classList.add("hidden");
        });
    });

    // update chip aria-selected
    els.filterChips.forEach(ch => {
        const active = ch.classList.contains("active");
        ch.setAttribute("aria-selected", String(active));
    });
}

/* ---------- MODAL ---------- */
function openModal() {
    els.modal.classList.remove("hidden");
    els.modalBackdrop.classList.remove("hidden");
    els.modalBackdrop.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeModal() {
    els.modal.classList.add("hidden");
    els.modalBackdrop.classList.add("hidden");
    els.modalBackdrop.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

function resetForm() {
    els.form.reset();
    els.appId.value = "";
    els.status.value = Status.APPLIED;
    els.dateApplied.value = nowISODate();
    els.followUpDate.value = "";
}

function openModalForAdd(prefill = null) {
    resetForm();
    els.modalTitle.textContent = "Add Application";
    if (prefill) {
        els.company.value = prefill.company ?? "";
        els.role.value = prefill.role ?? "";
        els.location.value = prefill.location ?? "";
        els.status.value = prefill.status ?? Status.APPLIED;
        els.dateApplied.value = prefill.dateApplied ?? nowISODate();
        els.link.value = prefill.link ?? "";
        els.followUpDate.value = prefill.followUpDate ?? "";
        els.contact.value = prefill.contact ?? "";
        els.notes.value = prefill.notes ?? "";
    }
    openModal();
    setTimeout(() => els.company.focus(), 0);
}

function openModalForEdit(id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    els.modalTitle.textContent = "Edit Application";
    els.appId.value = item.id;
    els.company.value = item.company || "";
    els.role.value = item.role || "";
    els.location.value = item.location || "";
    els.status.value = item.status || Status.APPLIED;
    els.dateApplied.value = item.dateApplied || nowISODate();
    els.postingLink.value = item.link || "";
    els.accountLink.value = item.accountLink || "";
    els.followUpDate.value = item.followUpDate || "";
    els.contact.value = item.contact || "";
    els.notes.value = item.notes || "";

    openModal();
    setTimeout(() => els.company.focus(), 0);
}

function duplicateItem(id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    openModalForAdd({
        ...item,
        dateApplied: nowISODate(),
        followUpDate: "",
        notes: item.notes ? `${item.notes}\n\n(duplicated)` : "(duplicated)"
    });
}

/* ---------- IMPORT/EXPORT ---------- */
function exportData() {
    const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        items: state.items,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `job-app-tracker-export-${nowISODate()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast("Exported");
}

function importDataFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result || ""));
            const items = Array.isArray(parsed) ? parsed : parsed.items;

            if (!Array.isArray(items)) throw new Error("Invalid import format");

            // basic normalization
            const normalized = items
                .filter(Boolean)
                .map(it => ({
                    id: it.id || newId(),
                    company: String(it.company || "").trim(),
                    role: String(it.role || "").trim(),
                    location: String(it.location || "").trim(),
                    status: Status[it.status] ? it.status : (Object.values(Status).includes(it.status) ? it.status : Status.APPLIED),
                    dateApplied: it.dateApplied || nowISODate(),
                    link: safeUrl(it.link || ""),
                    followUpDate: it.followUpDate || "",
                    contact: String(it.contact || "").trim(),
                    notes: String(it.notes || "").trim(),
                    createdAt: it.createdAt || Date.now(),
                    updatedAt: it.updatedAt || Date.now(),
                }))
                .filter(it => it.company && it.role);

            const ok = confirm(`Import ${normalized.length} application(s)? This will replace your current list.`);
            if (!ok) return;

            state.items = normalized;
            save(state.items);
            toast("Imported");
            render();
        } catch (e) {
            alert("Import failed. Please upload a valid JSON export.");
        }
    };
    reader.readAsText(file);
}

/* ---------- ESCAPING (simple safety) ---------- */
function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function escapeAttr(str) {
    return escapeHtml(str).replaceAll(" ", "");
}

/* ---------- EVENTS ---------- */
function setActiveChip(filter) {
    els.filterChips.forEach(ch => {
        const isActive = ch.getAttribute("data-filter") === filter;
        ch.classList.toggle("active", isActive);
    });
}

els.btnAdd.addEventListener("click", () => openModalForAdd());
els.btnAddEmpty.addEventListener("click", () => openModalForAdd());

els.btnExport.addEventListener("click", exportData);

els.importFile.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importDataFile(file);
    e.target.value = "";
});

els.btnClearAll.addEventListener("click", () => {
    if (state.items.length === 0) return;
    const ok = confirm("Clear all applications? This cannot be undone.");
    if (!ok) return;
    state.items = [];
    save(state.items);
    toast("Cleared");
    render();
});

els.filterChips.forEach(chip => {
    chip.addEventListener("click", () => {
        state.filter = chip.getAttribute("data-filter") || "ALL";
        setActiveChip(state.filter);
        render();
    });
});

els.searchInput.addEventListener("input", (e) => {
    state.search = e.target.value || "";
    render();
});

els.sortSelect.addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
});

els.toggleFollowupsOnly.addEventListener("change", (e) => {
    state.followupsOnly = Boolean(e.target.checked);
    render();
});

// modal controls
els.btnCloseModal.addEventListener("click", closeModal);
els.btnCancel.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", closeModal);

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.modal.classList.contains("hidden")) {
        closeModal();
    }
});

els.btnArchiveToggle.addEventListener("click", () => {
    // toggle archived for current form status
    els.status.value = (els.status.value === Status.ARCHIVED) ? Status.APPLIED : Status.ARCHIVED;
});

els.form.addEventListener("submit", (e) => {
    e.preventDefault();

    const id = els.appId.value.trim();
    const item = {
        company: els.company.value.trim(),
        role: els.role.value.trim(),
        location: els.location.value.trim(),
        status: els.status.value,
        dateApplied: els.dateApplied.value,
        link: safeUrl(els.postingLink.value.trim()),
        accountLink: safeUrl(els.accountLink.value.trim()),
        followUpDate: els.followUpDate.value,
        contact: els.contact.value.trim(),
        notes: els.notes.value.trim(),
    };

    if (!item.company || !item.role || !item.dateApplied) {
        alert("Please fill in Company, Role, and Date applied.");
        return;
    }

    if (!id) {
        addItem({
            id: newId(),
            ...item,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    } else {
        updateItem(id, item);
    }

    closeModal();
});

/* ---------- LOGIN/LOGOUT LOGIC ---------- */
async function login(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch {
        await createUserWithEmailAndPassword(auth, email, password);
    }
}

async function logout() {
    await signOut(auth);
}

document.getElementById("btnLogout").addEventListener("click", logout);

/* ---------- INITIALIZATION ---------- */
(async function init() {
    state.items = await load();
    els.dateApplied.value = nowISODate();
    setActiveChip(state.filter);
    render();
})();

/* AUTH CHANGES */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        btnLogin.classList.add("hidden");
        btnLogout.classList.remove("hidden");

        state.items = await load(); // reload from Firebase
    } else {
        currentUser = null;
        btnLogin.classList.remove("hidden");
        btnLogout.classList.add("hidden");

        // when logged out --> load and show all locally saved applications from this browser
        // state.items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        state.items = []; // clear on logout
    }

    render();
});