// AQI MATRIX — app.js (UX v2.0)

const DEFAULT_PREDICTIONS = { delhi: 350, hyd: 85, chen: 110 };
const ADMIN_PIN = "1234";

let currentCity = 'delhi';
let currentView = 'general';
let predictions = null;

const cityNames = { delhi: "DELHI", hyd: "HYDERABAD", chen: "CHENNAI" };

// FIX #3: AQI bands
const AQI_BANDS = [
    { max: 50,  label: "GOOD",         cls: "badge-good",         markerColor: "#2ECC40" },
    { max: 100, label: "SATISFACTORY", cls: "badge-satisfactory", markerColor: "#A3E635" },
    { max: 200, label: "MODERATE",     cls: "badge-moderate",     markerColor: "#FBBF23" },
    { max: 300, label: "POOR",         cls: "badge-poor",         markerColor: "#F97316" },
    { max: 400, label: "SEVERE",       cls: "badge-severe",       markerColor: "#EF4444" },
    { max: 500, label: "HAZARDOUS",    cls: "badge-hazardous",    markerColor: "#B91C1C" },
];

function getAQIBand(pm) {
    for (const band of AQI_BANDS) {
        if (pm <= band.max) return band;
    }
    return AQI_BANDS[AQI_BANDS.length - 1];
}

function getAQIMarkerPercent(pm) {
    return (Math.min(Math.max(pm, 0), 500) / 500) * 100;
}

function getPredictedTimestamp() {
    const now = new Date();
    const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const months  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const hour  = now.getHours();
    const nextH = (hour + 6) % 24;
    const fmt   = h => `${h}:00`;
    return `${fmt(hour)}\u2013${fmt(nextH)}, ${dayNames[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;
}

document.addEventListener("DOMContentLoaded", () => {
    predictions = JSON.parse(localStorage.getItem("ai_predictions")) || DEFAULT_PREDICTIONS;

    const cityBtns = document.querySelectorAll(".city-btn");
    cityBtns.forEach(btn => btn.addEventListener("click", () => switchCity(btn, cityBtns)));

    setupViewToggle();
    setupAdmin();
    render();
});

// FIX #1: City switcher
function switchCity(btn, allBtns) {
    allBtns.forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    currentCity = btn.dataset.city;
    render();
}

// FIX #2: Toggle switch
function setupViewToggle() {
    const track = document.getElementById("toggle-track");
    const lblPublic = document.getElementById("lbl-public");
    const lblExec   = document.getElementById("lbl-exec");

    function updateToggleVisual(isExec) {
        track.setAttribute("aria-checked", isExec ? "true" : "false");
        lblPublic.classList.toggle("active-side", !isExec);
        lblExec.classList.toggle("active-side", isExec);
    }

    updateToggleVisual(false);
    lblPublic.classList.add("active-side");

    track.addEventListener("click", () => {
        currentView = currentView === "general" ? "authorities" : "general";
        updateToggleVisual(currentView === "authorities");
        render();
    });
}

function render() {
    const pm   = predictions[currentCity];
    const band = getAQIBand(pm);

    document.getElementById("city-title").textContent = cityNames[currentCity];

    const pmMassive = document.getElementById("pm-massive");
    const fog        = document.getElementById("fog-overlay");

    pmMassive.textContent = pm;
    pmMassive.className   = "pm-massive";
    fog.className         = "fog-overlay";

    if (pm > 200) {
        pmMassive.classList.add("critical");
        fog.classList.add("level-critical");
    } else if (pm > 100) {
        pmMassive.classList.add("elevated");
        fog.classList.add("level-high");
    }

    // FIX #3: Severity badge
    const badge = document.getElementById("severity-badge");
    badge.textContent = band.label;
    badge.className   = "severity-badge " + band.cls;

    // FIX #3: Timestamped prediction
    document.getElementById("predicted-label").textContent =
        "PREDICTED \u00B7 " + getPredictedTimestamp();

    // FIX #3: AQI marker
    const marker = document.getElementById("aqi-marker");
    marker.style.left        = getAQIMarkerPercent(pm) + "%";
    marker.style.background  = band.markerColor;
    marker.style.borderColor = band.markerColor;

    // FIX #7: EXEC timestamp
    const execTs = document.getElementById("exec-timestamp");
    if (currentView === "authorities") {
        execTs.style.display = "block";
        document.getElementById("exec-ts-value").textContent = getPredictedTimestamp();
    } else {
        execTs.style.display = "none";
    }

    renderPanels(pm);
}

function renderPanels(pm) {
    let alertsToRender = [];
    let schoolStatus   = "Operations normal.";
    let riskStatus     = "Clear for activity.";
    let generalStatus  = "Conditions nominal.";

    if (currentView === "general") {
        document.getElementById("alerts-title").textContent = "PUBLIC HEALTH ADVISORY";

        if (pm >= 450) riskStatus = "Medical emergency. Absolute isolation required.";
        else if (pm >= 350) riskStatus = "Stay strictly indoors. Do not go out.";
        else if (pm >= 250) riskStatus = "Avoid outdoor movement. Use air purifiers.";
        else if (pm >= 120) riskStatus = "Avoid prolonged exposure. Wear an N95 mask.";
        else riskStatus = "Air quality safe. No restrictions needed.";

        if (pm >= 350) schoolStatus = "Schools closed. Keep children indoors.";
        else if (pm >= 200) schoolStatus = "Restrict outdoor play. Limit time outside.";
        else schoolStatus = "Normal school operations. Air quality acceptable.";

        // FIX #5: Alert cards with priority
        if (pm >= 400) {
            generalStatus = "Severe Risk Active.";
            alertsToRender.push({ q: "SHOULD I GO OUT?", ans: "No. Skip going out entirely.",
                detail: "Air quality is at emergency level. Stay indoors with windows sealed. Use air purifiers.", priority: "urgent" });
            alertsToRender.push({ q: "WEAR A MASK?", ans: "Yes \u2014 N95 is mandatory.",
                detail: "If you must go out, wear an N95/FFP2 mask. KN95 is the minimum accepted standard.", priority: "urgent" });
            alertsToRender.push({ q: "CHILDREN / ELDERLY?", ans: "Full indoor isolation required.",
                detail: "Asthmatic, elderly (60+), and children under 14 must remain indoors. Seek medical help if breathing worsens.", priority: "urgent" });
        } else if (pm >= 250) {
            generalStatus = "High Risk Active.";
            alertsToRender.push({ q: "SHOULD I GO OUT?", ans: "Only if extremely important.",
                detail: "Limit outdoor time to necessary errands. Avoid all strenuous outdoor activity.", priority: "high" });
            alertsToRender.push({ q: "WEAR A MASK?", ans: "Yes \u2014 high quality mask required.",
                detail: "N95 or equivalent recommended. Surgical masks provide insufficient protection at this level.", priority: "high" });
            alertsToRender.push({ q: "CHILDREN / ELDERLY?", ans: "Restrict outdoor time strictly.",
                detail: "High-risk individuals should avoid all outdoor activity. Keep windows closed.", priority: "high" });
        } else if (pm >= 120) {
            generalStatus = "Moderate Risk Active.";
            alertsToRender.push({ q: "SHOULD I GO OUT?", ans: "Yes, but limit duration.",
                detail: "Short outdoor trips are acceptable. Avoid running or cycling near heavy traffic.", priority: "normal" });
            alertsToRender.push({ q: "WEAR A MASK?", ans: "Recommended for sensitive groups.",
                detail: "Children, elderly, and those with respiratory conditions should wear a mask outdoors.", priority: "normal" });
            alertsToRender.push({ q: "CHILDREN / ELDERLY?", ans: "Reduce prolonged outdoor exposure.",
                detail: "Limit playtime outside to short periods. Carry an inhaler if needed.", priority: "normal" });
        } else {
            generalStatus = "Conditions safe.";
            alertsToRender.push({ q: "SHOULD I GO OUT?", ans: "Yes \u2014 conditions are safe.",
                detail: "Air quality is at an acceptable level. Normal activity and outdoor exercise are fine.", priority: "normal" });
            alertsToRender.push({ q: "WEAR A MASK?", ans: "Not required.",
                detail: "No mask requirement at present. Sensitive individuals may still choose to wear one.", priority: "normal" });
            alertsToRender.push({ q: "CHILDREN / ELDERLY?", ans: "No special precautions needed.",
                detail: "Outdoor activity is safe for all groups including children and elderly persons.", priority: "normal" });
        }

    } else {
        // EXEC VIEW
        document.getElementById("alerts-title").textContent = "EXECUTIVE GRAP DIRECTIVES";

        if (pm >= 450) riskStatus = "CRITICAL: Issue Medical Emergency Broadcast.";
        else if (pm >= 350) riskStatus = "Advise strict indoor isolation for vulnerable groups.";
        else if (pm >= 250) riskStatus = "Advise avoiding outdoor movement. Issue advisory.";
        else if (pm >= 120) riskStatus = "Issue prolonged exposure health warning.";
        else riskStatus = "CLEAR \u2014 No advisories required.";

        schoolStatus = pm >= 350
            ? "POLICY: Mandate school closures \u2014 remote/online mode."
            : "POLICY: Normal school operations.";

        // FIX #7: P1/P2/P3 directives
        if (pm >= 350) alertsToRender.push({ priority: "P1", text: "CLOSE SCHOOLS (Sustained > 24H)",
            meta: "Issued by: CPCB / State Authority" });
        if (pm >= 400) alertsToRender.push({ priority: "P1", text: "ODD-EVEN VEHICLE POLICY (Sustained 48H)",
            meta: "Issued by: State Transport Authority" });

        if (currentCity === 'delhi') {
            if (pm >= 201 && pm <= 300) alertsToRender.push({ priority: "P3",
                text: "Stage 1 GRAP: Dust control & emission checks.", meta: "Issued by: CPCB" });
            else if (pm > 300 && pm <= 400) alertsToRender.push({ priority: "P2",
                text: "Stage 2 GRAP: Regulate DG Sets. Boost public transport.", meta: "Issued by: CPCB" });
            else if (pm > 400 && pm <= 450) alertsToRender.push({ priority: "P1",
                text: "Stage 3 GRAP: CONSTRUCTION BAN. Restrict polluting vehicles.", meta: "Issued by: CPCB / GNCTD" });
            else if (pm > 450) alertsToRender.push({ priority: "P1",
                text: "Stage 4 GRAP: TRUCK BAN. 50% WFH MANDATE.", meta: "Issued by: Supreme Court / CPCB" });
        } else if (currentCity === 'chen') {
            if (pm >= 61 && pm <= 120) alertsToRender.push({ priority: "P3",
                text: "Moderate-Poor: Enforce anti-burning. Road sweeping.", meta: "Issued by: TNPCB" });
            else if (pm > 120 && pm <= 250) alertsToRender.push({ priority: "P2",
                text: "Very Poor: Stop DG sets. Limit industrial emissions.", meta: "Issued by: TNPCB" });
            else if (pm > 250) alertsToRender.push({ priority: "P1",
                text: "SEVERE: Reduce coal power. Scale renewable inputs.", meta: "Issued by: TNPCB / CEIG" });
        } else if (currentCity === 'hyd') {
            if (pm >= 150 && pm <= 250) alertsToRender.push({ priority: "P3",
                text: "Stage 1 GRAP: Dust control, emission checks.", meta: "Issued by: TSPCB" });
            else if (pm > 250 && pm <= 350) alertsToRender.push({ priority: "P2",
                text: "Stage 2 GRAP: Regulate DG sets, increase transport capacity.", meta: "Issued by: TSPCB" });
            else if (pm > 350 && pm <= 450) alertsToRender.push({ priority: "P1",
                text: "Stage 3 GRAP: Selective construction bans.", meta: "Issued by: TSPCB / GHMC" });
            else if (pm > 450) alertsToRender.push({ priority: "P1",
                text: "Stage 4 GRAP: EMERGENCY ACTIONS INITIATED.", meta: "Issued by: TSPCB / State CM Office" });
        }
    }

    renderPersonas(pm, schoolStatus, riskStatus, generalStatus);
    renderAlerts(alertsToRender);
}

// FIX #4: Renamed personas with severity icons
function renderPersonas(pm, schoolStatus, riskStatus, generalStatus) {
    const list = document.getElementById("personas-list");
    list.innerHTML = "";

    const personas = [
        { title: "SCHOOL CHILDREN",      status: schoolStatus,  icon: "\uD83C\uDFEB" },
        { title: "HIGH-RISK INDIVIDUALS", status: riskStatus,   icon: "\uD83E\uDEB9" },
        { title: "GENERAL PUBLIC",        status: generalStatus, icon: "\uD83D\uDC65" },
    ];

    personas.forEach(p => {
        const level  = getStatusLevel(p.status);
        const colorClass = level === "not-allowed" ? "highlight-not-allowed"
                         : level === "allowed"     ? "highlight-allowed"
                         : "highlight-advisable";
        const severityIcon = level === "not-allowed" ? "\u26A0" : level === "allowed" ? "\u2713" : "\u00B7";

        list.innerHTML += '<li class="editorial-item" role="listitem">' +
            '<h4 class="' + colorClass + '">' +
            '<span class="severity-icon" aria-hidden="true">' + severityIcon + '</span>' +
            p.icon + ' ' + p.title + '</h4>' +
            '<p>' + p.status + '</p></li>';
    });
}

// FIX #5 (public) / FIX #7 (exec)
function renderAlerts(alerts) {
    const alertsBox = document.getElementById("alerts-list");
    alertsBox.innerHTML = "";

    if (alerts.length === 0) {
        alertsBox.innerHTML = '<li class="editorial-item" role="listitem"><p class="highlight-allowed-bg">NO IMMEDIATE CONCERNS.</p></li>';
        return;
    }

    if (currentView === "general") {
        alerts.forEach((alert, i) => {
            const li = document.createElement("li");
            li.setAttribute("role", "listitem");
            const urgencyLabel = alert.priority === "urgent" ? "URGENT"
                               : alert.priority === "high"   ? "HIGH" : "";
            const urgencyHTML = urgencyLabel
                ? '<span class="alert-urgency-badge">' + urgencyLabel + '</span>' : "";
            li.innerHTML = '<div class="alert-card priority-' + alert.priority + '" id="alert-card-' + i + '">' +
                '<div class="alert-card-header" role="button" tabindex="0"' +
                ' aria-expanded="false" aria-controls="alert-body-' + i + '"' +
                ' onclick="toggleAlertCard(' + i + ')"' +
                ' onkeydown="if(event.key===\'Enter\'||event.key===\' \')toggleAlertCard(' + i + ')">' +
                '<div class="alert-card-title">' + urgencyHTML + alert.q + '</div>' +
                '<span class="alert-chevron" aria-hidden="true">\u25BE</span></div>' +
                '<div class="alert-card-body" id="alert-body-' + i + '" role="region">' +
                '<div class="alert-card-detail"><strong>' + alert.ans + '</strong><br>' + alert.detail + '</div>' +
                '</div></div>';
            alertsBox.appendChild(li);
        });
        // Auto-expand first card
        const first = document.getElementById("alert-card-0");
        if (first) first.classList.add("expanded");

    } else {
        alerts.forEach(d => {
            const li = document.createElement("li");
            li.setAttribute("role", "listitem");
            const pClass = d.priority === "P1" ? "p1-badge"
                         : d.priority === "P2" ? "p2-badge" : "p3-badge";
            li.innerHTML = '<div class="directive-item">' +
                '<span class="priority-badge ' + pClass + '">' + d.priority + '</span>' +
                '<div class="directive-body">' +
                '<div class="directive-text">' + d.text + '</div>' +
                '<div class="directive-meta">' + d.meta + '</div>' +
                '</div></div>';
            alertsBox.appendChild(li);
        });
    }
}

function toggleAlertCard(i) {
    const card   = document.getElementById("alert-card-" + i);
    const header = card.querySelector(".alert-card-header");
    const isExp  = card.classList.toggle("expanded");
    header.setAttribute("aria-expanded", isExp);
}

function getStatusLevel(text) {
    const t   = text.toLowerCase();
    const red = ["no.", "skip", "mandatory", "required", "close", "mandate", "ban", "shutdown", "emergency", "stop", "strictly", "critical", "severe", "isolation", "full"];
    const grn = ["safe", "not required", "clear", "normal", "nominal", "acceptable", "fine", "no special"];
    if (red.some(kw => t.includes(kw)))  return "not-allowed";
    if (grn.some(kw => t.includes(kw)))  return "allowed";
    return "advisable";
}

// FIX #6: PIN gate + validation + confirmation
function setupAdmin() {
    const pinModal     = document.getElementById("pin-modal");
    const adminModal   = document.getElementById("admin-modal");
    const confirmModal = document.getElementById("confirm-modal");

    document.getElementById("open-admin-btn").onclick = () => {
        document.getElementById("pin-input").value = "";
        document.getElementById("pin-error").textContent = "";
        pinModal.classList.add("visible");
        setTimeout(() => document.getElementById("pin-input").focus(), 100);
    };

    document.getElementById("close-pin-btn").onclick = () => pinModal.classList.remove("visible");

    document.getElementById("pin-submit-btn").onclick = submitPin;
    document.getElementById("pin-input").addEventListener("keydown", e => {
        if (e.key === "Enter") submitPin();
    });

    function submitPin() {
        if (document.getElementById("pin-input").value === ADMIN_PIN) {
            pinModal.classList.remove("visible");
            openAdminPanel();
        } else {
            document.getElementById("pin-error").textContent = "Incorrect PIN. Access denied.";
            document.getElementById("pin-input").value = "";
        }
    }

    function openAdminPanel() {
        document.getElementById("input-delhi").value = predictions.delhi;
        document.getElementById("input-hyd").value   = predictions.hyd;
        document.getElementById("input-chen").value  = predictions.chen;
        validateAllInputs();
        adminModal.classList.add("visible");
    }

    document.getElementById("close-admin-btn").onclick = () => adminModal.classList.remove("visible");

    // FIX #9: Live validation
    ["delhi","hyd","chen"].forEach(city => {
        document.getElementById("input-" + city).addEventListener("input", validateAllInputs);
    });

    function validateInput(id) {
        const input = document.getElementById("input-" + id);
        const msg   = document.getElementById("val-" + id);
        const v     = parseInt(input.value);
        if (isNaN(v) || v < 0 || v > 500) {
            input.classList.add("invalid");
            msg.textContent = "Enter a valid AQI (0\u2013500)";
            return false;
        }
        input.classList.remove("invalid");
        msg.textContent = "";
        return true;
    }

    function validateAllInputs() {
        const valid = validateInput("delhi") & validateInput("hyd") & validateInput("chen");
        const btn   = document.getElementById("save-data-btn");
        btn.disabled = !valid;
        btn.setAttribute("aria-disabled", !valid);
    }

    // FIX #6: Confirmation dialog
    document.getElementById("save-data-btn").onclick = () => {
        const d = parseInt(document.getElementById("input-delhi").value);
        const h = parseInt(document.getElementById("input-hyd").value);
        const c = parseInt(document.getElementById("input-chen").value);

        document.getElementById("confirm-msg").innerHTML =
            "This will update the live dashboard with:<br><br>" +
            "<strong>Delhi</strong>: " + d + " (" + getAQIBand(d).label + ")<br>" +
            "<strong>Hyderabad</strong>: " + h + " (" + getAQIBand(h).label + ")<br>" +
            "<strong>Chennai</strong>: " + c + " (" + getAQIBand(c).label + ")<br><br>" +
            "Are you sure you want to override the AQI predictions?";

        adminModal.classList.remove("visible");
        confirmModal.classList.add("visible");
    };

    document.getElementById("confirm-yes-btn").onclick = () => {
        const d = parseInt(document.getElementById("input-delhi").value);
        const h = parseInt(document.getElementById("input-hyd").value);
        const c = parseInt(document.getElementById("input-chen").value);
        predictions = { delhi: d, hyd: h, chen: c };
        localStorage.setItem("ai_predictions", JSON.stringify(predictions));
        confirmModal.classList.remove("visible");
        render();
    };

    document.getElementById("confirm-no-btn").onclick = () => {
        confirmModal.classList.remove("visible");
        adminModal.classList.add("visible");
    };

    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            pinModal.classList.remove("visible");
            adminModal.classList.remove("visible");
            confirmModal.classList.remove("visible");
        }
    });

    [pinModal, adminModal, confirmModal].forEach(modal => {
        modal.addEventListener("click", e => {
            if (e.target === modal) modal.classList.remove("visible");
        });
    });
}
