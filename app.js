// Estado global de la aplicación
let currentRound = 1;
let selectedBoardForF = null;
let maxIllegalsAllowed = 2;
let pairings = [];
let html5QrcodeScanner = null;

// Datos de prueba iniciales para previsualizar la interfaz
const initialDemoData = [
    { board: 1, white: "Pérez, Juan", black: "Gómez, Carlos", result: "", illegalW: 0, illegalB: 0, timeStart: "10:00:00", timeEnd: null },
    { board: 2, white: "López, María", black: "Rodríguez, Ana", result: "", illegalW: 0, illegalB: 0, timeStart: "10:00:00", timeEnd: null },
    { board: 3, white: "Fernández, Luis", black: "Martínez, Sofía", result: "", illegalW: 0, illegalB: 0, timeStart: "10:00:00", timeEnd: null }
];

document.addEventListener("DOMContentLoaded", () => {
    pairings = [...initialDemoData];
    renderPairings();
    setupEventListeners();

    // Registrar Service Worker para PWA
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(err => console.log("Error al registrar SW:", err));
    }
});

function setupEventListeners() {
    document.getElementById("maxIllegal").addEventListener("change", (e) => {
        maxIllegalsAllowed = parseInt(e.target.value) || 2;
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
        const actionButtonsHTML = p.result 
            ? `<button class="btn-change-res" onclick="openEditModal(${p.board})">⚙️ Cambiar resultado</button>`
            : `<button class="btn-res" onclick="setResult(${p.board}, '1-0')">1-0</button>
               <button class="btn-res" onclick="setResult(${p.board}, '1/2-1/2')">1/2-1/2</button>
               <button class="btn-res" onclick="setResult(${p.board}, '0-1')">0-1</button>
               <button class="btn-res" onclick="openModalF(${p.board})">F (Especial)</button>`;

        card.innerHTML = `
            <div class="board-header">
                <span>Mesa ${p.board}</span>
                <span>${p.result ? 'Finalizada: ' + (p.timeEnd || '') : 'En juego'}</span>
            </div>
            <div class="board-players">
                <div class="player">
                    <span class="player-name">⚪ ${p.white}</span>
                    <span class="illegal-badge">${p.illegalW > 0 ? '⚠️ Ilegales: ' + p.illegalW : ''}</span>
                    <div class="illegal-controls">
                        <button class="btn-illegal" onclick="addIllegal(${p.board}, 'W')">+1 Ilegal</button>
                        ${p.illegalW > 0 ? `<button class="btn-illegal-sub" onclick="subtractIllegal(${p.board}, 'W')">-1</button>` : ''}
                    </div>
                </div>
                <div class="versus-container">
                    <span class="result-badge ${p.result ? 'has-result' : ''}">
                        ${p.result ? p.result : 'VS'}
                    </span>
                </div>
                <div class="player">
                    <span class="player-name">⚫ ${p.black}</span>
                    <span class="illegal-badge">${p.illegalB > 0 ? '⚠️ Ilegales: ' + p.illegalB : ''}</span>
                    <div class="illegal-controls">
                        <button class="btn-illegal" onclick="addIllegal(${p.board}, 'B')">+1 Ilegal</button>
                        ${p.illegalB > 0 ? `<button class="btn-illegal-sub" onclick="subtractIllegal(${p.board}, 'B')">-1</button>` : ''}
                    </div>
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

        let isParsing = false; // Bandera para saber si ya estamos dentro de la tabla

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Verificamos si es una fila vacía (limpiando los delimitadores)
            const emptyCheck = line.replace(new RegExp(delimiter, 'g'), '');
            
            // Si ya estábamos leyendo jugadores y nos topamos con una fila vacía, terminamos la lectura
            if (isParsing && emptyCheck === "") {
                break;
            }

            const cols = line.split(delimiter).map(c => c.trim());
            const boardNum = parseInt(cols[0]);
            
            // Si la columna A (índice 0) es un número de mesa válido, la leemos
            if (!isNaN(boardNum) && boardNum > 0) {
                isParsing = true; // Empezamos a leer la tabla
                
                // Forzamos la lectura estricta: Columna D (índice 3) y Columna I (índice 8)
                // Se usa replace para quitar las comillas "" que Excel a veces añade ocultas en los CSV
                let wName = cols[3] ? cols[3].replace(/['"]+/g, '') : "Blanco";
                let bName = cols[8] ? cols[8].replace(/['"]+/g, '') : "Negro";

                const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                newPairings.push({
                    board: boardNum,
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
            renderPairings();
            alert(`Se cargaron ${newPairings.length} mesas desde el archivo Excel (CSV).`);
        } else {
            alert("No se encontraron jugadores en las columnas especificadas (D e I). Verifica el archivo.");
        }
    };
    reader.readAsText(file);
}

function exportResultsFile() {
    let content = "";
    pairings.forEach(p => {
        if (p.result) {
            content += `${p.board};${p.result}\n`;
        }
    });

    if (!content) {
        alert("No hay resultados registrados para exportar.");
        return;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Resultados_Ronda_${currentRound}.txt`;
    link.click();
}
