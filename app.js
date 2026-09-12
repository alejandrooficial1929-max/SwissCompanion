// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAPY8Nwj2nAQSpIzxYVyyuBe5iM8-vYsdM",
    authDomain: "swiss-companion.firebaseapp.com",
    databaseURL: "https://swiss-companion-default-rtdb.firebaseio.com",
    projectId: "swiss-companion",
    storageBucket: "swiss-companion.firebasestorage.app",
    messagingSenderId: "612750967125",
    appId: "1:612750967125:web:a88fb3bfa3c583c4812fdc"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Estado global de la aplicación
let currentRound = 1;
let selectedBoardForF = null;
let maxIllegalsAllowed = 2;
let pairings = [];
let html5QrcodeScanner = null;
let roundsHistory = {}; 
let isArbiter = false; // Rol por defecto: Espectador
let isSyncing = false; // Evita bucles de sincronización infinita

// Datos de prueba iniciales para previsualizar la interfaz
const initialDemoData = [
    { board: 1, snoW: 1, snoB: 2, white: "Pérez, Juan", black: "Gómez, Carlos", result: "", illegalW: 0, illegalB: 0, timeStart: "10:00:00", timeEnd: null },
    { board: 2, snoW: 3, snoB: 4, white: "López, María", black: "Rodríguez, Ana", result: "", illegalW: 0, illegalB: 0, timeStart: "10:00:00", timeEnd: null },
    { board: 3, snoW: 5, snoB: 6, white: "Fernández, Luis", black: "Martínez, Sofía", result: "", illegalW: 0, illegalB: 0, timeStart: "10:00:00", timeEnd: null }
];

document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    
    // Escuchar cambios desde Firebase (Tiempo real)
    database.ref('torneo/actual').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            isSyncing = true; // Pausar envío mientras recibimos datos
            currentRound = data.currentRound || 1;
            pairings = data.pairings || [];
            maxIllegalsAllowed = data.maxIllegalsAllowed || 2;
            roundsHistory = data.roundsHistory || { 1: pairings };

            // Actualizar interfaz con los datos de la nube
            document.getElementById("roundSelect").value = currentRound;
            document.getElementById("maxIllegal").value = maxIllegalsAllowed;
            
            renderPairings();
            isSyncing = false;
        } else {
            // Si la base de datos está vacía, cargamos los de prueba
            pairings = [...initialDemoData];
            roundsHistory[1] = pairings;
            renderPairings();
        }
    });

    // Registrar Service Worker para PWA
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(err => console.log("Error al registrar SW:", err));
    }
});

function syncToCloud() {
    if (!isArbiter || isSyncing) return; // Solo el árbitro envía datos a la nube
    database.ref('torneo/actual').set({
        currentRound: currentRound,
        pairings: pairings,
        maxIllegalsAllowed: maxIllegalsAllowed,
        roundsHistory: roundsHistory
    });
}

function unlockArbiter() {
    if (isArbiter) return; // Ya está desbloqueado
    const pin = prompt("Ingresa el PIN de Árbitro:");
    if (pin === "1234") { // Contraseña por defecto
        isArbiter = true;
        document.body.classList.add("arbiter-mode");
        const btn = document.getElementById("btnUnlock");
        btn.innerText = "🔓 Árbitro";
        btn.classList.add("unlocked");
        renderPairings(); // Re-renderizar para mostrar botones
        alert("Modo Árbitro activado.");
    } else if (pin !== null) {
        alert("PIN incorrecto.");
    }
}

function setupEventListeners() {
    document.getElementById("maxIllegal").addEventListener("change", (e) => {
        maxIllegalsAllowed = parseInt(e.target.value) || 2;
        syncToCloud();
    });

    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            renderPairings(e.target.dataset.filter);
        });
    });

    document.querySelector(".close-modal").onclick = () => {
        document.getElementById("modalF").classList.add("hidden");
    };

    document.querySelector(".close-modal-edit").onclick = () => {
        document.getElementById("modalEdit").classList.add("hidden");
    };
    
    document.querySelector(".close-modal-qr").onclick = closeQRModal;
    document.getElementById("btnShowQR").onclick = generateQR;
    document.getElementById("btnScanQR").onclick = startQRScanner;
    document.getElementById("fileImport").addEventListener("change", importSwissManagerFile);
        document.getElementById("btnExport").onclick = exportResultsFile;
        
        // Listeners para el control de rondas
        document.getElementById("btnNewRound").onclick = createNewRound;
        document.getElementById("roundSelect").addEventListener("change", (e) => {
            loadRound(parseInt(e.target.value));
        });
    }

    function createNewRound() {
    // 1. Guardar el estado actual
    roundsHistory[currentRound] = pairings;
    
    // 2. Incrementar ronda
    currentRound++;
    
    // 3. Crear opción en el menú desplegable HTML
    const select = document.getElementById("roundSelect");
    const option = document.createElement("option");
    option.value = currentRound;
    option.text = `Ronda ${currentRound}`;
    select.appendChild(option);
    select.value = currentRound; // Seleccionarlo automáticamente
    
    // 4. Limpiar la mesa virtual para la nueva ronda
    pairings = [];
    roundsHistory[currentRound] = pairings;
    
    // 5. Limpiar el input de archivo por si el usuario carga un archivo con el mismo nombre
    document.getElementById("fileImport").value = "";
    
    renderPairings();
    syncToCloud();
    alert(`¡Ronda ${currentRound} iniciada! Ahora puedes cargar el archivo CSV de los emparejamientos de esta ronda.`);
}

function loadRound(roundNum) {
    // Si queremos volver a ver una ronda anterior, la cargamos desde la memoria
    currentRound = roundNum;
    pairings = roundsHistory[currentRound] || [];
    renderPairings();
    syncToCloud();
}

function renderPairings(filter = "all") {
    const container = document.getElementById("pairingsContainer");
    container.innerHTML = "";

    const filtered = pairings.filter(p => {
        if (filter === "active") return p.result === "";
        if (filter === "finished") return p.result !== "";
        if (filter === "illegal") return p.illegalW > 0 || p.illegalB > 0;
        return true;
    });

    filtered.forEach(p => {
        const card = document.createElement("div");
        card.className = `board-card ${p.result ? 'finished' : ''} ${p.illegalW > 0 || p.illegalB > 0 ? 'has-illegal' : ''}`;
        
        // Determinar los botones de acción según si ya hay o no resultado cargado
        // Variables para ocultar botones a los espectadores
        let actionButtonsHTML = "";
        let illegalControlsW = "";
        let illegalControlsB = "";

        if (isArbiter) {
            actionButtonsHTML = p.result 
                ? `<button class="btn-change-res" onclick="openEditModal(${p.board})">⚙️ Cambiar resultado</button>`
                : `<button class="btn-res" onclick="setResult(${p.board}, '1-0')">1-0</button>
                   <button class="btn-res" onclick="setResult(${p.board}, '1/2-1/2')">1/2-1/2</button>
                   <button class="btn-res" onclick="setResult(${p.board}, '0-1')">0-1</button>
                   <button class="btn-res" onclick="openModalF(${p.board})">F (Especial)</button>`;
            
            illegalControlsW = `
                <div class="illegal-controls">
                    <button class="btn-illegal" onclick="addIllegal(${p.board}, 'W')">+1 Ilegal</button>
                    ${p.illegalW > 0 ? `<button class="btn-illegal-sub" onclick="subtractIllegal(${p.board}, 'W')">-1</button>` : ''}
                </div>`;
            
            illegalControlsB = `
                <div class="illegal-controls">
                    <button class="btn-illegal" onclick="addIllegal(${p.board}, 'B')">+1 Ilegal</button>
                    ${p.illegalB > 0 ? `<button class="btn-illegal-sub" onclick="subtractIllegal(${p.board}, 'B')">-1</button>` : ''}
                </div>`;
        }

        card.innerHTML = `
            <div class="board-header">
                <span>Mesa ${p.board}</span>
                <span>${p.result ? 'Finalizada: ' + (p.timeEnd || '') : 'En juego'}</span>
            </div>
            <div class="board-players">
                <div class="player">
                    <span class="player-name">⚪ ${p.white}</span>
                    <span class="illegal-badge">${p.illegalW > 0 ? '⚠️ Ilegales: ' + p.illegalW : ''}</span>
                    ${illegalControlsW}
                </div>
                <div class="versus-container">
                    <span class="result-badge ${p.result ? 'has-result' : ''}">
                        ${p.result ? p.result : 'VS'}
                    </span>
                </div>
                <div class="player">
                    <span class="player-name">⚫ ${p.black}</span>
                    <span class="illegal-badge">${p.illegalB > 0 ? '⚠️ Ilegales: ' + p.illegalB : ''}</span>
                    ${illegalControlsB}
                </div>
            </div>
            <div class="result-buttons">
                ${actionButtonsHTML}
            </div>
        `;
        container.appendChild(card);
    });
}

function setResult(boardNum, result) {
    const p = pairings.find(item => item.board === boardNum);
    if (p) {
        p.result = result;
        p.timeEnd = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        renderPairings();
        syncToCloud();
    }
}

function addIllegal(boardNum, color) {
    const p = pairings.find(item => item.board === boardNum);
    if (!p) return;

    if (color === 'W') {
        p.illegalW++;
        if (p.illegalW >= maxIllegalsAllowed) {
            alert(`¡Atención! Blancas alcanzaron el límite de ${maxIllegalsAllowed} ilegales. Se asigna victoria a Negras (0-1).`);
            setResult(boardNum, '0-1');
            return;
        }
    } else {
        p.illegalB++;
        if (p.illegalB >= maxIllegalsAllowed) {
            alert(`¡Atención! Negras alcanzaron el límite de ${maxIllegalsAllowed} ilegales. Se asigna victoria a Blancas (1-0).`);
            setResult(boardNum, '1-0');
            return;
        }
    }
    renderPairings();
    syncToCloud();
}

function subtractIllegal(boardNum, color) {
    const p = pairings.find(item => item.board === boardNum);
    if (!p) return;

    if (color === 'W' && p.illegalW > 0) {
        p.illegalW--;
    } else if (color === 'B' && p.illegalB > 0) {
        p.illegalB--;
    }
    renderPairings();
    syncToCloud();
}

function openEditModal(boardNum) {
    selectedBoardForF = boardNum;
    const p = pairings.find(item => item.board === boardNum);
    if (!p) return;

    document.getElementById("editBoardNum").innerText = p.board;
    document.getElementById("editRoundNum").innerText = currentRound;
    document.getElementById("editPlayers").innerText = `${p.white} vs ${p.black}`;
    document.getElementById("editCurrentResult").innerText = p.result || "Sin resultado";
    document.getElementById("editTimeStart").innerText = p.timeStart || "No reg.";
    document.getElementById("editTimeEnd").innerText = p.timeEnd || "En juego";
    document.getElementById("chkUpdateEndTime").checked = false;
    document.getElementById("selectSpecialEdit").value = "";

    document.getElementById("modalEdit").classList.remove("hidden");
}

function applyEditResult(newResult) {
    if (!newResult || selectedBoardForF === null) return;
    const p = pairings.find(item => item.board === selectedBoardForF);
    if (p) {
        p.result = newResult;
        const updateTime = document.getElementById("chkUpdateEndTime").checked;
        if (updateTime || !p.timeEnd) {
            p.timeEnd = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        document.getElementById("modalEdit").classList.add("hidden");
        selectedBoardForF = null;
        renderPairings();
        syncToCloud();
    }
}

function clearResult() {
    if (selectedBoardForF === null) return;
    const p = pairings.find(item => item.board === selectedBoardForF);
    if (p) {
        p.result = "";
        p.timeEnd = null;
        document.getElementById("modalEdit").classList.add("hidden");
        selectedBoardForF = null;
        renderPairings();
        syncToCloud();
    }
}

function openModalF(boardNum) {
    selectedBoardForF = boardNum;
    document.getElementById("modalBoardInfo").innerText = `Mesa #${boardNum}`;
    document.getElementById("modalF").classList.remove("hidden");
}

function setSpecialResult(result) {
    if (selectedBoardForF !== null) {
        setResult(selectedBoardForF, result);
        document.getElementById("modalF").classList.add("hidden");
        selectedBoardForF = null;
    }
}

function generateQR() {
    const modal = document.getElementById("modalQR");
    const container = document.getElementById("qrContainer");
    const reader = document.getElementById("qrReader");
    
    document.getElementById("qrModalTitle").innerText = "Código QR de Resultados";
    container.innerHTML = "";
    container.style.display = "block";
    reader.style.display = "none";
    
    // Compactar la información de resultados
    const dataString = JSON.stringify(pairings.map(p => `${p.board}:${p.result}:${p.illegalW}:${p.illegalB}`));
    
    new QRCode(container, {
        text: dataString,
        width: 256,
        height: 256
    });

    modal.classList.remove("hidden");
}

function startQRScanner() {
    const modal = document.getElementById("modalQR");
    const container = document.getElementById("qrContainer");
    const reader = document.getElementById("qrReader");
    
    document.getElementById("qrModalTitle").innerText = "Escanear Código QR";
    container.style.display = "none";
    reader.style.display = "block";
    modal.classList.remove("hidden");

    html5QrcodeScanner = new Html5QrcodeScanner("qrReader", { fps: 10, qrbox: 250 });
    html5QrcodeScanner.render((decodedText) => {
        try {
            const parsedData = JSON.parse(decodedText);
            parsedData.forEach(item => {
                const [board, result, illegalW, illegalB] = item.split(":");
                const p = pairings.find(x => x.board === parseInt(board));
                if (p) {
                    p.result = result;
                    p.illegalW = parseInt(illegalW);
                    p.illegalB = parseInt(illegalB);
                }
            });
            alert("¡Datos sincronizados correctamente!");
            closeQRModal();
            renderPairings();
        } catch (e) {
            alert("Error al procesar el código QR.");
        }
    });
}

function closeQRModal() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
    }
    document.getElementById("modalQR").classList.add("hidden");
}

function importSwissManagerFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const lines = event.target.result.split("\n");
        const newPairings = [];
        
        // Excel usa punto y coma (;) o coma (,) al guardar como CSV según el idioma de la PC
        let delimiter = ',';
        if (lines[0].includes(';')) delimiter = ';';
        else if (lines[0].includes('\t')) delimiter = '\t';

        let isParsing = false; 
        let colW = 3, colB = 8;
        let snoWCol = 1, snoBCol = 9; // Por defecto columnas B y J (donde van los SNo)

        // ¡NUEVA LÓGICA INTELIGENTE! Buscar dinámicamente columnas de Nombres y SNo
        for (let i = 0; i < lines.length; i++) {
            const headerCols = lines[i].split(delimiter).map(c => c.trim().toLowerCase());
            if (headerCols.includes("nombre")) {
                colW = headerCols.indexOf("nombre");
                colB = headerCols.lastIndexOf("nombre");
                // También buscamos el SNo (Número de jugador)
                snoWCol = headerCols.indexOf("sno.") !== -1 ? headerCols.indexOf("sno.") : 1;
                snoBCol = headerCols.lastIndexOf("sno.") !== -1 ? headerCols.lastIndexOf("sno.") : 9;
                break; 
            }
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const emptyCheck = line.replace(new RegExp(delimiter, 'g'), '');
            
            if (isParsing && emptyCheck === "") break;

            const cols = line.split(delimiter).map(c => c.trim());
            const boardNum = parseInt(cols[0]);
            
            if (!isNaN(boardNum) && boardNum > 0) {
                isParsing = true; 
                
                // Lee el nombre desde la columna que detectó el sistema y limpia las comillas
                let wName = cols[colW] ? cols[colW].replace(/['"]+/g, '') : "Blanco";
                let bName = cols[colB] ? cols[colB].replace(/['"]+/g, '') : "Negro";
                let sNoWhite = cols[snoWCol] ? cols[snoWCol].replace(/['"]+/g, '') : "0";
                let sNoBlack = cols[snoBCol] ? cols[snoBCol].replace(/['"]+/g, '') : "0";

                const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                newPairings.push({
                    board: boardNum,
                    snoW: sNoWhite,
                    snoB: sNoBlack,
                    white: wName,
                    black: bName,
                    result: "",
                    illegalW: 0,
                    illegalB: 0,
                    timeStart: nowStr,
                    timeEnd: null
                });
            }
        }

        if (newPairings.length > 0) {
            pairings = newPairings;
            roundsHistory[currentRound] = pairings; // Vinculamos los datos a la ronda actual
            renderPairings();
            syncToCloud();
            alert(`Se cargaron ${newPairings.length} mesas para la Ronda ${currentRound}.`);
        } else {
            alert("No se encontraron jugadores en las columnas especificadas (D e I). Verifica el archivo.");
        }
    };
    reader.readAsText(file);
}

function exportResultsFile() {
    // Cabecera exacta que espera Swiss Manager
    let content = "Ronda;Mesa;ID-B;ID-N;NoB;NoN;ResB;ResM;Incomparecencia;Res;Mno;ResEloB;ResEloN\n";
    let hasResults = false;

    pairings.forEach(p => {
        if (p.result) {
            hasResults = true;
            let resB = "0", resM = "0", incomp = "", resStr = "";
            
            // Mapear nuestro resultado al formato estricto de Swiss Manager
            switch(p.result) {
                case "1-0": resB = "1"; resM = "0"; resStr = "1:0"; break;
                case "0-1": resB = "0"; resM = "1"; resStr = "0:1"; break;
                case "1/2-1/2": resB = "0,5"; resM = "0,5"; resStr = "0,5:0,5"; break;
                case "1F-0F": resB = "1"; resM = "0"; incomp = "F"; resStr = "1:0F"; break;
                case "0F-1F": resB = "0"; resM = "1"; incomp = "F"; resStr = "0:1F"; break;
                case "0F-0F": resB = "0"; resM = "0"; incomp = "F"; resStr = "0:0F"; break;
                case "0-0": resB = "0"; resM = "0"; incomp = "v"; resStr = "0:0v"; break;
            }

            content += `${currentRound};${p.board};0;0;${p.snoW || 0};${p.snoB || 0};${resB};${resM};${incomp};${resStr};0;;\n`;
        }
    });

    if (!hasResults) {
        alert("No hay resultados registrados para exportar.");
        return;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Resultados_Ronda_${currentRound}.txt`;
    link.click();
}

// Registro del Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado con éxito', reg))
            .catch(err => console.warn('Error al registrar Service Worker', err));
    });
}
