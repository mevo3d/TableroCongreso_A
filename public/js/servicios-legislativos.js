// Servicios Legislativos - JavaScript
const socket = io();
const user = JSON.parse(localStorage.getItem('user'));
const token = localStorage.getItem('token');

// Verificar autenticación
if (!token || !user || user.role !== 'servicios_legislativos') {
    window.location.href = '/';
}

// Identificar usuario al conectarse
if (user) {
    socket.emit('identificar-usuario', {
        nombre: user.nombre_completo || user.username,
        rol: 'Servicios Legislativos'
    });
}

// Re-identificar al reconectar
socket.on('connect', () => {
    if (user) {
        socket.emit('identificar-usuario', {
            nombre: user.nombre_completo || user.username,
            rol: 'Servicios Legislativos'
        });
    }
});

document.getElementById('userName').textContent = user.nombre_completo || user.nombre;

// Variables globales
let sesionesData = [];
let sesionesFiltradas = [];
let iniciativasTemp = [];
let modoEdicion = false;
let sesionEditando = null;

// Variables de paginación
let paginaActual = 1;
let itemsPorPagina = 5;
let filtroActual = 'todas';
let busquedaActual = '';

// Cargar estadísticas al iniciar
document.addEventListener('DOMContentLoaded', () => {
    cargarEstadisticas();
    cargarMisSesiones();
    configurarDragDrop();
    configurarFormularios();
});

// Cargar estadísticas
async function cargarEstadisticas() {
    try {
        const response = await fetch('/api/servicios-legislativos/estadisticas', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('statBorrador').textContent = stats.borradores || 0;
            document.getElementById('statEnviadas').textContent = stats.enviadas || 0;
            document.getElementById('statProcesadas').textContent = stats.procesadas || 0;
            document.getElementById('statIniciativas').textContent = stats.totalIniciativas || 0;
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// Cargar todas las sesiones del sistema (propias y del operador)
async function cargarMisSesiones() {
    try {
        // Cargar sesiones propias de servicios legislativos
        const [responsePropia, responseSistema] = await Promise.all([
            fetch('/api/servicios-legislativos/mis-sesiones', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }),
            // Cargar todas las sesiones del sistema (como operador)
            fetch('/api/servicios-legislativos/historial-completo', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
        ]);
        
        let sesionesPropias = [];
        let sesionesSistema = [];
        
        if (responsePropia.ok) {
            sesionesPropias = await responsePropia.json();
        }
        
        if (responseSistema.ok) {
            sesionesSistema = await responseSistema.json();
        }
        
        // Combinar y eliminar duplicados
        const todasLasSesiones = [...sesionesPropias];
        const idsExistentes = new Set(sesionesPropias.map(s => s.id));
        
        sesionesSistema.forEach(sesion => {
            if (!idsExistentes.has(sesion.id)) {
                todasLasSesiones.push(sesion);
            }
        });
        
        // Ordenar por fecha descendente
        sesionesData = todasLasSesiones.sort((a, b) => {
            const fechaA = new Date(a.fecha_carga || a.fecha || a.created_at);
            const fechaB = new Date(b.fecha_carga || b.fecha || b.created_at);
            return fechaB - fechaA;
        });
        
        // Aplicar filtros y mostrar
        aplicarFiltros();
        
    } catch (error) {
        console.error('Error cargando sesiones:', error);
        // Si hay error, al menos mostrar sesiones vacías
        sesionesData = [];
        aplicarFiltros();
    }
}

// Aplicar filtros y búsqueda
function aplicarFiltros() {
    sesionesFiltradas = sesionesData.filter(sesion => {
        // Aplicar filtro de estado
        if (filtroActual !== 'todas') {
            const estado = sesion.estado || 'borrador';
            if (filtroActual !== estado.toLowerCase()) {
                return false;
            }
        }
        
        // Aplicar búsqueda
        if (busquedaActual) {
            const busqueda = busquedaActual.toLowerCase();
            const nombre = (sesion.nombre_sesion || sesion.nombre || '').toLowerCase();
            const codigo = (sesion.codigo_sesion || sesion.codigo || '').toLowerCase();
            const descripcion = (sesion.descripcion || '').toLowerCase();
            
            if (!nombre.includes(busqueda) && !codigo.includes(busqueda) && !descripcion.includes(busqueda)) {
                return false;
            }
        }
        
        return true;
    });
    
    // Resetear a página 1 cuando se aplican filtros
    paginaActual = 1;
    mostrarSesiones();
}

// Mostrar sesiones con paginación
function mostrarSesiones() {
    const container = document.getElementById('listaSesiones');
    
    // Actualizar contador de resultados
    document.getElementById('numResultados').textContent = sesionesFiltradas.length;
    
    if (sesionesFiltradas.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-4">No se encontraron sesiones</p>';
        document.getElementById('paginacionControles').style.display = 'none';
        return;
    }
    
    // Calcular paginación
    const totalPaginas = Math.ceil(sesionesFiltradas.length / itemsPorPagina);
    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = Math.min(inicio + itemsPorPagina, sesionesFiltradas.length);
    
    // Obtener sesiones de la página actual
    const sesionesPagina = sesionesFiltradas.slice(inicio, fin);
    
    // Generar HTML
    let html = '<div class="sesiones-lista">';
    sesionesPagina.forEach(sesion => {
        html += generarCardSesion(sesion);
    });
    html += '</div>';
    
    container.innerHTML = html;
    
    // Actualizar controles de paginación
    actualizarPaginacion(totalPaginas, inicio + 1, fin);
}

// Actualizar controles de paginación
function actualizarPaginacion(totalPaginas, inicio, fin) {
    document.getElementById('paginacionControles').style.display = totalPaginas > 1 ? 'flex' : 'none';
    
    document.getElementById('paginaActual').textContent = paginaActual;
    document.getElementById('totalPaginas').textContent = totalPaginas;
    document.getElementById('infoPaginacion').textContent = `${inicio} - ${fin}`;
    
    // Habilitar/deshabilitar botones
    const btnAnterior = document.getElementById('btnPaginaAnterior');
    const btnSiguiente = document.getElementById('btnPaginaSiguiente');
    
    if (paginaActual === 1) {
        btnAnterior.classList.add('disabled');
    } else {
        btnAnterior.classList.remove('disabled');
    }
    
    if (paginaActual === totalPaginas) {
        btnSiguiente.classList.add('disabled');
    } else {
        btnSiguiente.classList.remove('disabled');
    }
}

// Cambiar página
function cambiarPagina(direccion) {
    const totalPaginas = Math.ceil(sesionesFiltradas.length / itemsPorPagina);
    
    if (direccion === 'anterior' && paginaActual > 1) {
        paginaActual--;
        mostrarSesiones();
    } else if (direccion === 'siguiente' && paginaActual < totalPaginas) {
        paginaActual++;
        mostrarSesiones();
    }
}

// Cambiar items por página
function cambiarItemsPorPagina() {
    itemsPorPagina = parseInt(document.getElementById('itemsPorPagina').value);
    paginaActual = 1;
    mostrarSesiones();
}

// Filtrar sesiones por estado
function filtrarSesiones(filtro) {
    filtroActual = filtro;
    
    // Actualizar botones activos
    document.querySelectorAll('.btn-outline-warning, .btn-outline-success, .btn-outline-info, .btn-outline-secondary, .btn-outline-primary, .btn-outline-dark').forEach(btn => {
        btn.classList.remove('active');
        if (btn.onclick && btn.onclick.toString().includes(`'${filtro}'`)) {
            btn.classList.add('active');
        }
    });
    
    aplicarFiltros();
}

// Buscar sesiones
function buscarSesiones() {
    busquedaActual = document.getElementById('buscarSesion').value;
    aplicarFiltros();
}

// Mostrar lista de sesiones (compatibilidad con código anterior)
function mostrarSesiones_OLD(sesiones) {
    const container = document.getElementById('listaSesiones');
    
    if (sesiones.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No hay sesiones cargadas</p>';
        return;
    }
    
    // Separar sesiones propias y compartidas
    const sesionesPropias = sesiones.filter(s => s.tipo_sesion === 'propia');
    const sesionesCompartidas = sesiones.filter(s => s.tipo_sesion === 'compartida');
    
    let html = '';
    
    // Mostrar sesiones propias
    if (sesionesPropias.length > 0) {
        html += '<h6 class="mb-3"><i class="fas fa-folder-open"></i> Mis Sesiones</h6>';
        html += sesionesPropias.map(sesion => generarCardSesion(sesion)).join('');
    }
    
    // Mostrar sesiones compartidas (pendientes/indefinidas)
    if (sesionesCompartidas.length > 0) {
        html += '<h6 class="mb-3 mt-4"><i class="fas fa-share-alt"></i> Sesiones Pendientes del Sistema</h6>';
        html += sesionesCompartidas.map(sesion => generarCardSesion(sesion)).join('');
    }
    
    container.innerHTML = html;
}

function generarCardSesion(sesion) {
    // Determinar badge según estado
    let badgeClass = 'badge-secondary';
    let estadoTexto = sesion.estado || 'sin estado';
    
    switch(sesion.estado) {
        case 'borrador':
            badgeClass = 'badge-borrador';
            break;
        case 'enviada':
            badgeClass = 'badge-enviada';
            break;
        case 'procesada':
            badgeClass = 'badge-procesada';
            break;
        case 'pendiente':
            badgeClass = 'badge-warning';
            break;
        case 'indefinida':
            badgeClass = 'badge-secondary';
            break;
        case 'activa':
            badgeClass = 'badge-success';
            estadoTexto = 'ACTIVA';
            break;
        case 'clausurada':
            badgeClass = 'badge-dark';
            estadoTexto = 'CLAUSURADA';
            break;
        case 'preparada':
            badgeClass = 'badge-info';
            break;
        case 'programada':
            badgeClass = 'badge-primary';
            break;
    }
    
    // Determinar origen
    let origenTexto = '';
    if (sesion.cargada_por || sesion.iniciada_por) {
        const cargadaPor = sesion.nombre_usuario || sesion.cargada_por_nombre || '';
        if (cargadaPor) {
            origenTexto = `<span class="badge bg-secondary ms-2" title="Cargada por"><i class="fas fa-user"></i> ${cargadaPor}</span>`;
        }
    }
    
    // Determinar fecha a mostrar
    const fecha = sesion.fecha_programada || sesion.fecha_propuesta || sesion.fecha || sesion.fecha_carga || sesion.created_at;
    const fechaTexto = fecha ? new Date(fecha).toLocaleDateString('es-MX', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) : 'Sin fecha';
    
    // Contar iniciativas
    const numIniciativas = sesion.num_iniciativas || sesion.total_iniciativas || sesion.iniciativas_count || 0;
    
    // Descripción truncada
    const descripcion = sesion.descripcion || 'Sin descripción';
    const descripcionCorta = descripcion.length > 150 ? descripcion.substring(0, 150) + '...' : descripcion;
    
    // Determinar si es propia
    const esPropia = sesion.tipo_sesion === 'propia' || sesion.cargada_por === user.id;
    
    return `
        <div class="sesion-card ${sesion.estado || ''}" data-sesion-id="${sesion.id}">
            <div class="d-flex justify-content-between align-items-start">
                <div class="flex-grow-1">
                    <h6 class="mb-1">
                        <i class="fas fa-folder"></i> ${sesion.nombre || sesion.nombre_sesion || 'Sesión sin nombre'}
                    </h6>
                    <div class="mb-2">
                        <span class="badge ${badgeClass}">${estadoTexto.toUpperCase()}</span>
                        ${origenTexto}
                        ${sesion.activa ? '<span class="badge bg-danger ms-2 pulse">EN CURSO</span>' : ''}
                    </div>
                    <p class="text-muted small mb-2" title="${descripcion}">${descripcionCorta}</p>
                    <div class="small text-muted">
                        <span class="me-3"><i class="fas fa-calendar"></i> ${fechaTexto}</span>
                        <span class="me-3"><i class="fas fa-file-alt"></i> ${numIniciativas} iniciativas</span>
                        ${sesion.codigo_sesion ? `<span class="me-3"><i class="fas fa-barcode"></i> ${sesion.codigo_sesion}</span>` : ''}
                    </div>
                    ${sesion.estadisticas ? `
                        <div class="small mt-2">
                            <span class="badge bg-success me-1">Aprobadas: ${sesion.estadisticas.aprobadas || 0}</span>
                            <span class="badge bg-danger me-1">Rechazadas: ${sesion.estadisticas.rechazadas || 0}</span>
                            <span class="badge bg-info">Participación: ${sesion.estadisticas.participacion || 0}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="btn-group-vertical" role="group">
                    <button class="btn btn-sm btn-outline-primary" onclick="verSesion(${sesion.id}, '${sesion.estado}')" title="Ver detalles">
                        <i class="fas fa-eye"></i> Ver
                    </button>
                    ${esPropia && (sesion.estado === 'borrador' || sesion.estado === 'enviada') ? `
                        <button class="btn btn-sm btn-outline-warning" onclick="editarSesion(${sesion.id})" title="Editar sesión">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                    ` : ''}
                    ${(sesion.estado === 'pendiente' || sesion.estado === 'indefinida' || sesion.estado === 'programada') ? `
                        <button class="btn btn-sm btn-outline-success" onclick="usarSesionEnOperador(${sesion.id})" title="Usar en panel operador">
                            <i class="fas fa-upload"></i> Usar
                        </button>
                    ` : ''}
                    ${esPropia && sesion.estado === 'borrador' ? `
                        <button class="btn btn-sm btn-outline-danger" onclick="eliminarSesion(${sesion.id})" title="Eliminar sesión">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Configurar Drag & Drop
function configurarDragDrop() {
    // Excel Drop Zone
    const excelZone = document.getElementById('excelDropZone');
    const excelInput = document.getElementById('excelFile');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        excelZone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        excelZone.addEventListener(eventName, () => {
            excelZone.classList.add('dragover');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        excelZone.addEventListener(eventName, () => {
            excelZone.classList.remove('dragover');
        });
    });
    
    excelZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0 && (files[0].name.endsWith('.xlsx') || files[0].name.endsWith('.xls'))) {
            procesarExcel(files[0]);
        }
    });
    
    excelInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            procesarExcel(e.target.files[0]);
        }
    });
    
    // PDF Drop Zone (similar)
    const pdfZone = document.getElementById('pdfDropZone');
    const pdfInput = document.getElementById('pdfFile');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        pdfZone.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        pdfZone.addEventListener(eventName, () => {
            pdfZone.classList.add('dragover');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        pdfZone.addEventListener(eventName, () => {
            pdfZone.classList.remove('dragover');
        });
    });
    
    pdfZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.pdf')) {
            mostrarOpcionesCargaPDF(files[0]);
        }
    });
    
    pdfInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            mostrarOpcionesCargaPDF(e.target.files[0]);
        }
    });
    
    // Configurar listeners para tipo de carga PDF
    document.getElementById('cargaInmediataPDF')?.addEventListener('change', function() {
        document.getElementById('fechaProgramadaPDF').style.display = 'none';
    });
    
    document.getElementById('cargaProgramadaPDF')?.addEventListener('change', function() {
        document.getElementById('fechaProgramadaPDF').style.display = 'block';
        // Establecer fecha mínima como ahora
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('fechaSesionPDF').min = now.toISOString().slice(0, 16);
        document.getElementById('fechaSesionPDF').required = true;
    });
    
    document.getElementById('cargaIndefinidaPDF')?.addEventListener('change', function() {
        document.getElementById('fechaProgramadaPDF').style.display = 'none';
        document.getElementById('fechaSesionPDF').required = false;
    });
}

// Procesar archivo Excel
async function procesarExcel(file) {
    const statusDiv = document.getElementById('excelStatus');
    statusDiv.innerHTML = '<div class="alert alert-info">Procesando archivo Excel...</div>';
    
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Leer hoja de datos de sesión
        const datosSesion = {};
        if (workbook.Sheets['DATOS_SESION']) {
            const sesionData = XLSX.utils.sheet_to_json(workbook.Sheets['DATOS_SESION']);
            sesionData.forEach(row => {
                if (row.CAMPO && row.VALOR) {
                    datosSesion[row.CAMPO] = row.VALOR;
                }
            });
        }
        
        // Leer iniciativas
        const iniciativas = [];
        if (workbook.Sheets['INICIATIVAS']) {
            const iniciativasData = XLSX.utils.sheet_to_json(workbook.Sheets['INICIATIVAS']);
            iniciativasData.forEach(row => {
                // Filtrar filas de ejemplo
                if (row.NUMERO && !String(row.TITULO).includes('EJEMPLO:')) {
                    iniciativas.push({
                        numero: row.NUMERO,
                        titulo: row.TITULO,
                        descripcion: row.DESCRIPCION || '',
                        presentador: row.PRESENTADOR || '',
                        partido: row.PARTIDO || '',
                        tipo_mayoria: row.TIPO_MAYORIA || 'simple',
                        tipo_iniciativa: row.TIPO_INICIATIVA || 'ordinaria',
                        comision: row.COMISION || '',
                        turno: row.TURNO || '',
                        observaciones: row.OBSERVACIONES || ''
                    });
                }
            });
        }
        
        if (iniciativas.length === 0) {
            statusDiv.innerHTML = '<div class="alert alert-warning">No se encontraron iniciativas válidas en el archivo</div>';
            return;
        }
        
        // Enviar al servidor
        const formData = new FormData();
        formData.append('archivo', file);
        if (datosSesion.NOMBRE_SESION) {
            formData.append('nombre', datosSesion.NOMBRE_SESION);
        }
        formData.append('iniciativas', JSON.stringify(iniciativas));
        
        const response = await fetch('/api/servicios-legislativos/cargar-excel', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            statusDiv.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> Archivo procesado exitosamente
                    <br>Sesión: ${result.sesion}
                    <br>Iniciativas cargadas: ${result.iniciativas}
                </div>
            `;
            cargarEstadisticas();
            cargarMisSesiones();
            
            // Limpiar input
            document.getElementById('excelFile').value = '';
        } else {
            statusDiv.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
        }
        
    } catch (error) {
        console.error('Error procesando Excel:', error);
        statusDiv.innerHTML = '<div class="alert alert-danger">Error al procesar el archivo Excel</div>';
    }
}

// Variable para almacenar el archivo PDF temporal
let pdfFileTemp = null;

// Mostrar opciones de carga para PDF
function mostrarOpcionesCargaPDF(file) {
    pdfFileTemp = file;
    document.getElementById('tipoCargaOptions').style.display = 'block';
    document.getElementById('pdfStatus').innerHTML = `
        <div class="alert alert-info">
            <i class="fas fa-file-pdf"></i> Archivo seleccionado: <strong>${file.name}</strong>
        </div>
    `;
}

// Procesar PDF con tipo de carga
async function procesarPDFConTipo() {
    if (!pdfFileTemp) {
        alert('Por favor selecciona un archivo PDF');
        return;
    }
    
    const tipoCarga = document.querySelector('input[name="tipoCargaPDF"]:checked').value;
    const statusDiv = document.getElementById('pdfStatus');
    
    // Validar fecha para sesión programada
    if (tipoCarga === 'programada') {
        const fechaProgramada = document.getElementById('fechaSesionPDF').value;
        if (!fechaProgramada) {
            alert('Por favor selecciona una fecha para la sesión programada');
            return;
        }
    }
    
    statusDiv.innerHTML = '<div class="alert alert-info">Procesando archivo PDF...</div>';
    
    const formData = new FormData();
    formData.append('pdf', pdfFileTemp);
    formData.append('tipoCarga', tipoCarga);
    
    if (tipoCarga === 'programada') {
        formData.append('fechaProgramada', document.getElementById('fechaSesionPDF').value);
    }
    
    try {
        const response = await fetch('/api/servicios-legislativos/cargar-pdf', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            let mensaje = '';
            if (tipoCarga === 'inmediata') {
                mensaje = 'Las iniciativas están listas para que el operador las cargue';
            } else if (tipoCarga === 'programada') {
                mensaje = `Sesión programada para ${new Date(document.getElementById('fechaSesionPDF').value).toLocaleString('es-MX')}`;
            } else if (tipoCarga === 'indefinida') {
                mensaje = 'Sesión guardada con fecha indefinida. Se podrá activar cuando se decida';
            }
            
            statusDiv.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> PDF procesado exitosamente
                    <br>Iniciativas extraídas: ${result.iniciativas}
                    <br>${mensaje}
                </div>
            `;
            
            // Limpiar formulario
            document.getElementById('pdfFile').value = '';
            document.getElementById('tipoCargaOptions').style.display = 'none';
            document.getElementById('cargaInmediataPDF').checked = true;
            document.getElementById('fechaProgramadaPDF').style.display = 'none';
            pdfFileTemp = null;
            
            cargarEstadisticas();
            cargarMisSesiones();
            
        } else {
            statusDiv.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
        }
        
    } catch (error) {
        console.error('Error procesando PDF:', error);
        statusDiv.innerHTML = '<div class="alert alert-danger">Error al procesar el archivo PDF</div>';
    }
}

// Procesar archivo PDF (función anterior para compatibilidad)
async function procesarPDF(file) {
    // Redirigir a la nueva función
    mostrarOpcionesCargaPDF(file);
    return;
    
    const statusDiv = document.getElementById('pdfStatus');
    statusDiv.innerHTML = '<div class="alert alert-info">Procesando archivo PDF...</div>';
    
    const formData = new FormData();
    formData.append('pdf', file);
    
    try {
        const response = await fetch('/api/servicios-legislativos/cargar-pdf', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            statusDiv.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> PDF procesado exitosamente
                    <br>Iniciativas extraídas: ${result.iniciativas}
                    <br><button class="btn btn-sm btn-primary mt-2" onclick="revisarIniciativasPDF(${result.sesion_id})">
                        Revisar y Completar
                    </button>
                </div>
            `;
            cargarEstadisticas();
            cargarMisSesiones();
            
            // Limpiar input
            document.getElementById('pdfFile').value = '';
        } else {
            statusDiv.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
        }
        
    } catch (error) {
        console.error('Error procesando PDF:', error);
        statusDiv.innerHTML = '<div class="alert alert-danger">Error al procesar el archivo PDF</div>';
    }
}

// Mostrar formulario manual
function mostrarFormularioManual() {
    const panel = document.getElementById('capturaManual');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    
    if (panel.style.display === 'block' && iniciativasTemp.length === 0) {
        agregarIniciativaManual();
    }
}

// Agregar iniciativa manual
let contadorIniciativas = 0;
function agregarIniciativaManual() {
    const container = document.getElementById('iniciativasContainer');
    const id = `iniciativa_${++contadorIniciativas}`;
    
    const iniciativaHTML = `
        <div class="iniciativa-item" id="${id}">
            <div class="d-flex justify-content-between mb-2">
                <h6>Iniciativa ${contadorIniciativas}</h6>
                <button type="button" class="btn btn-sm btn-danger" onclick="eliminarIniciativaManual('${id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="row">
                <div class="col-md-1">
                    <input type="number" class="form-control form-control-sm" placeholder="#" name="numero_${id}" value="${contadorIniciativas}">
                </div>
                <div class="col-md-5">
                    <input type="text" class="form-control form-control-sm" placeholder="Título" name="titulo_${id}" required>
                </div>
                <div class="col-md-3">
                    <input type="text" class="form-control form-control-sm" placeholder="Presentador" name="presentador_${id}">
                </div>
                <div class="col-md-3">
                    <select class="form-select form-select-sm" name="partido_${id}">
                        <option value="">Partido...</option>
                        <option value="MORENA">MORENA</option>
                        <option value="PAN">PAN</option>
                        <option value="PRI">PRI</option>
                        <option value="PT">PT</option>
                        <option value="PVEM">PVEM</option>
                        <option value="MC">MC</option>
                        <option value="NUEVA ALIANZA">NUEVA ALIANZA</option>
                    </select>
                </div>
            </div>
            <div class="row mt-2">
                <div class="col-md-8">
                    <textarea class="form-control form-control-sm" placeholder="Descripción" name="descripcion_${id}" rows="2"></textarea>
                </div>
                <div class="col-md-4">
                    <select class="form-select form-select-sm" name="tipo_mayoria_${id}">
                        <option value="simple">Mayoría Simple</option>
                        <option value="absoluta">Mayoría Absoluta</option>
                        <option value="calificada">Mayoría Calificada</option>
                        <option value="unanime">Unanimidad</option>
                    </select>
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', iniciativaHTML);
}

// Eliminar iniciativa manual
function eliminarIniciativaManual(id) {
    document.getElementById(id).remove();
}

// Configurar formularios
function configurarFormularios() {
    const formManual = document.getElementById('formSesionManual');
    if (formManual) {
        formManual.addEventListener('submit', async (e) => {
            e.preventDefault();
            await guardarSesionManual(false);
        });
    }
}

// Guardar sesión manual
async function guardarSesionManual(enviar = false) {
    const formData = {
        nombre: document.getElementById('nombreSesion').value,
        fecha_propuesta: document.getElementById('fechaPropuesta').value,
        descripcion: document.getElementById('descripcionSesion').value,
        estado: enviar ? 'enviada' : 'borrador',
        iniciativas: []
    };
    
    // Recolectar iniciativas
    const iniciativasItems = document.querySelectorAll('.iniciativa-item');
    iniciativasItems.forEach(item => {
        const id = item.id;
        const iniciativa = {
            numero: document.querySelector(`[name="numero_${id}"]`).value,
            titulo: document.querySelector(`[name="titulo_${id}"]`).value,
            descripcion: document.querySelector(`[name="descripcion_${id}"]`).value,
            presentador: document.querySelector(`[name="presentador_${id}"]`).value,
            partido: document.querySelector(`[name="partido_${id}"]`).value,
            tipo_mayoria: document.querySelector(`[name="tipo_mayoria_${id}"]`).value,
            tipo_iniciativa: 'ordinaria'
        };
        
        if (iniciativa.titulo) {
            formData.iniciativas.push(iniciativa);
        }
    });
    
    if (formData.iniciativas.length === 0) {
        alert('Debe agregar al menos una iniciativa');
        return;
    }
    
    try {
        const url = modoEdicion ? 
            `/api/servicios-legislativos/actualizar-sesion/${sesionEditando}` : 
            '/api/servicios-legislativos/crear-sesion';
            
        const method = modoEdicion ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(enviar ? 'Sesión guardada y enviada al operador' : 'Sesión guardada como borrador');
            cancelarCapturaManual();
            cargarEstadisticas();
            cargarMisSesiones();
        } else {
            alert('Error: ' + result.error);
        }
        
    } catch (error) {
        console.error('Error guardando sesión:', error);
        alert('Error al guardar la sesión');
    }
}

// Guardar y enviar
function guardarYEnviar() {
    guardarSesionManual(true);
}

// Cancelar captura manual
function cancelarCapturaManual() {
    document.getElementById('formSesionManual').reset();
    document.getElementById('iniciativasContainer').innerHTML = '';
    document.getElementById('capturaManual').style.display = 'none';
    contadorIniciativas = 0;
    modoEdicion = false;
    sesionEditando = null;
}

// Ver sesión
async function verSesion(id, estado) {
    try {
        const response = await fetch(`/api/servicios-legislativos/sesion/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const sesion = await response.json();
            sesion.estado = estado; // Asegurar que tenemos el estado
            mostrarDetallesSesion(sesion);
        }
        
    } catch (error) {
        console.error('Error cargando sesión:', error);
    }
}

// Mostrar detalles de sesión
function mostrarDetallesSesion(sesion) {
    const modalBody = document.getElementById('detallesSesion');
    sesionPDFActual = sesion; // Guardar sesión actual para usar en revisión
    
    const tieneIniciativas = sesion.iniciativas && sesion.iniciativas.length > 0;
    
    modalBody.innerHTML = `
        <h5>${sesion.nombre || sesion.nombre_sesion || 'Sin nombre'}</h5>
        <p class="text-muted">${sesion.descripcion || 'Sin descripción'}</p>
        <div class="row mb-3">
            <div class="col-md-4">
                <strong>Estado:</strong> 
                <span class="badge ${sesion.estado === 'borrador' ? 'badge-borrador' : 
                                   sesion.estado === 'enviada' ? 'badge-enviada' : 
                                   sesion.estado === 'pendiente' ? 'badge-warning' :
                                   sesion.estado === 'programada' ? 'badge-info' :
                                   sesion.estado === 'indefinida' ? 'badge-secondary' :
                                   'badge-procesada'}">
                    ${sesion.estado ? sesion.estado.toUpperCase() : 'SIN ESTADO'}
                </span>
            </div>
            <div class="col-md-4">
                <strong>Fecha Propuesta:</strong> 
                ${sesion.fecha_propuesta ? new Date(sesion.fecha_propuesta).toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : 'No definida'}
            </div>
            <div class="col-md-4">
                <strong>Código:</strong> ${sesion.codigo_sesion || 'Sin código'}
            </div>
        </div>
        
        ${tieneIniciativas ? `
            <h6>Iniciativas (${sesion.iniciativas.length})</h6>
            <div class="list-group" style="max-height: 400px; overflow-y: auto;">
                ${sesion.iniciativas.map((init, index) => `
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <strong>${init.numero || (index + 1)}. ${init.titulo || 'Sin título'}</strong>
                                <p class="mb-1 small">${init.descripcion || ''}</p>
                                <small class="text-muted">
                                    ${init.presentador || 'Sin presentador'} 
                                    ${init.partido_presentador ? `(${init.partido_presentador})` : ''}
                                    | Mayoría: ${init.tipo_mayoria || 'simple'}
                                </small>
                            </div>
                            ${detectarSiEsVotable(init) ? 
                                '<span class="badge bg-success"><i class="fas fa-vote-yea"></i> Votable</span>' : 
                                '<span class="badge bg-secondary">Info</span>'}
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : '<p class="text-muted">No hay iniciativas cargadas</p>'}
    `;
    
    // Mostrar/ocultar botones según estado
    const btnRevisar = document.getElementById('btnRevisarIniciativas');
    const btnEditar = document.getElementById('btnEditarSesion');
    const btnEnviar = document.getElementById('btnEnviarSesion');
    
    // Mostrar botón de revisar si hay iniciativas y es una sesión pendiente de revisión
    if (tieneIniciativas && (sesion.estado === 'pendiente' || sesion.estado === 'programada' || 
                             sesion.estado === 'indefinida' || sesion.estado === 'borrador')) {
        btnRevisar.style.display = 'inline-block';
    } else {
        btnRevisar.style.display = 'none';
    }
    
    // Botones de editar y enviar solo para borradores propios
    if (sesion.estado === 'borrador' && sesion.cargada_por === user.id) {
        btnEditar.style.display = 'inline-block';
        btnEnviar.style.display = 'inline-block';
        btnEditar.onclick = () => editarSesion(sesion.id);
        btnEnviar.onclick = () => enviarSesion(sesion.id);
    } else {
        btnEditar.style.display = 'none';
        btnEnviar.style.display = 'none';
    }
    
    const modal = new bootstrap.Modal(document.getElementById('modalVerSesion'));
    modal.show();
}

// Enviar sesión al operador
async function enviarSesion(id) {
    if (!confirm('¿Está seguro de enviar esta sesión al operador? Una vez enviada no podrá editarla.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/servicios-legislativos/enviar-sesion/${id}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            alert('Sesión enviada exitosamente al operador');
            bootstrap.Modal.getInstance(document.getElementById('modalVerSesion')).hide();
            cargarEstadisticas();
            cargarMisSesiones();
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
        }
        
    } catch (error) {
        console.error('Error enviando sesión:', error);
        alert('Error al enviar la sesión');
    }
}

// Eliminar sesión
async function eliminarSesion(id) {
    if (!confirm('¿Está seguro de eliminar esta sesión? Esta acción no se puede deshacer.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/servicios-legislativos/eliminar-sesion/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            alert('Sesión eliminada exitosamente');
            cargarEstadisticas();
            cargarMisSesiones();
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
        }
        
    } catch (error) {
        console.error('Error eliminando sesión:', error);
        alert('Error al eliminar la sesión');
    }
}

// Cargar sesión pendiente del sistema
async function cargarSesionPendiente(sesionId) {
    if (!confirm('¿Desea cargar esta sesión pendiente al panel del operador?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/operador/cargar-sesion-precargada/${sesionId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            alert('Sesión cargada exitosamente en el panel del operador');
            cargarMisSesiones();
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
        }
    } catch (error) {
        console.error('Error cargando sesión:', error);
        alert('Error al cargar la sesión');
    }
}

// Filtrar sesiones
function filtrarSesiones(estado) {
    if (estado === 'todas') {
        mostrarSesiones(sesionesData);
    } else {
        const filtradas = sesionesData.filter(s => s.estado === estado);
        mostrarSesiones(filtradas);
    }
}

// Buscar sesiones
function buscarSesiones() {
    const query = document.getElementById('buscarSesion').value.toLowerCase();
    const filtradas = sesionesData.filter(s => 
        s.nombre.toLowerCase().includes(query) || 
        (s.descripcion && s.descripcion.toLowerCase().includes(query))
    );
    mostrarSesiones(filtradas);
}

// Mostrar guía
function mostrarGuia() {
    alert(`GUÍA DE USO:

1. PLANTILLA EXCEL:
   - Descargue la plantilla
   - Complete la información de la sesión
   - Agregue las iniciativas con todos sus datos
   - Guarde el archivo y súbalo al sistema

2. ARCHIVO PDF:
   - Suba el PDF con el orden del día
   - El sistema extraerá las iniciativas automáticamente
   - Revise y complete la información faltante

3. CAPTURA MANUAL:
   - Use para agregar iniciativas individuales
   - Complete todos los campos requeridos
   - Puede guardar como borrador o enviar directamente

IMPORTANTE:
- Los borradores pueden editarse
- Las sesiones enviadas no pueden modificarse
- El operador recibirá notificación de las sesiones enviadas`);
}

// Función para cargar documentos PDF
async function cargarDocumentosPDF() {
    try {
        const response = await fetch('/api/servicios-legislativos/documentos-pdf', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const container = document.getElementById('listaDocumentosPDF');
            
            if (!data.documentos || data.documentos.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-5">
                        <i class="fas fa-file-pdf fa-4x text-muted mb-3"></i>
                        <p class="text-muted">No hay documentos PDF disponibles</p>
                    </div>
                `;
                return;
            }
            
            let html = `
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Sesión</th>
                                <th>Tipo</th>
                                <th>Estado</th>
                                <th>Iniciativas</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            data.documentos.forEach(doc => {
                const fecha = new Date(doc.fecha).toLocaleDateString('es-MX');
                const tipo = doc.tipo === 'sesiones' ? 
                    '<span class="badge bg-primary">Sesión Activa</span>' : 
                    '<span class="badge bg-info">Sesión Precargada</span>';
                
                const estado = doc.estado === 'clausurada' ? 
                    '<span class="badge bg-secondary">Clausurada</span>' :
                    doc.estado === 'activa' ? 
                    '<span class="badge bg-success">Activa</span>' :
                    '<span class="badge bg-warning">' + doc.estado + '</span>';
                
                html += `
                    <tr>
                        <td>${fecha}</td>
                        <td>
                            <strong>${doc.nombre}</strong><br>
                            <small class="text-muted">${doc.codigo || 'Sin código'}</small>
                        </td>
                        <td>${tipo}</td>
                        <td>${estado}</td>
                        <td class="text-center">${doc.total_iniciativas || 0}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary" onclick="window.open('/documentos-sesion/${doc.archivo_pdf}', '_blank')">
                                <i class="fas fa-file-pdf"></i> Ver PDF
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            
            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Error cargando documentos:', error);
        document.getElementById('listaDocumentosPDF').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> Error al cargar documentos
            </div>
        `;
    }
}

// Hacer la función global
window.cargarDocumentosPDF = cargarDocumentosPDF;

// Variables globales para revisión de PDF
let sesionPDFActual = null;
let iniciativasPDFActual = [];

// Función para abrir modal de revisión
async function abrirModalRevision() {
    const sesionId = sesionPDFActual?.id;
    if (!sesionId) return;
    
    try {
        // Cargar iniciativas de la sesión
        const response = await fetch(`/api/servicios-legislativos/sesion/${sesionId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const sesion = await response.json();
            iniciativasPDFActual = sesion.iniciativas || [];
            
            // Marcar todas como seleccionadas por defecto
            iniciativasPDFActual.forEach(init => {
                init.seleccionada = true;
                // Detectar si es votable basado en el título o tipo
                init.es_votable = detectarSiEsVotable(init);
            });
            
            // Actualizar información del modal
            document.getElementById('nombreSesionPDF').textContent = sesion.nombre || sesion.nombre_sesion || 'Sin nombre';
            document.getElementById('estadoSesionPDF').textContent = sesion.estado || 'borrador';
            document.getElementById('estadoSesionPDF').className = `badge bg-${sesion.estado === 'borrador' ? 'warning' : sesion.estado === 'enviada' ? 'success' : 'info'}`;
            document.getElementById('fechaSesionPDF').textContent = sesion.fecha_propuesta ? 
                new Date(sesion.fecha_propuesta).toLocaleDateString('es-MX') : 'Sin fecha';
            
            actualizarEstadisticasPDF();
            renderizarTablaIniciativasPDF();
            
            // Cerrar modal de detalles y abrir el de revisión
            bootstrap.Modal.getInstance(document.getElementById('modalVerSesion'))?.hide();
            new bootstrap.Modal(document.getElementById('modalRevisarPDF')).show();
        }
    } catch (error) {
        console.error('Error cargando iniciativas para revisión:', error);
        alert('Error al cargar las iniciativas');
    }
}

// Detectar si una iniciativa es votable
function detectarSiEsVotable(iniciativa) {
    const titulo = (iniciativa.titulo || '').toLowerCase();
    const descripcion = (iniciativa.descripcion || '').toLowerCase();
    
    // Palabras clave que indican votación
    const palabrasVotacion = [
        'dictamen', 'dictámenes', 'segunda lectura', 'discusión',
        'votación', 'aprobación', 'decreto', 'iniciativa con proyecto'
    ];
    
    return palabrasVotacion.some(palabra => 
        titulo.includes(palabra) || descripcion.includes(palabra)
    );
}

// Actualizar estadísticas del PDF
function actualizarEstadisticasPDF() {
    const total = iniciativasPDFActual.length;
    const votables = iniciativasPDFActual.filter(i => i.es_votable).length;
    const informativos = total - votables;
    const seleccionadas = iniciativasPDFActual.filter(i => i.seleccionada).length;
    
    document.getElementById('totalIniciativasPDF').textContent = total;
    document.getElementById('votablesPDF').textContent = votables;
    document.getElementById('informativosPDF').textContent = informativos;
    document.getElementById('seleccionadasPDF').textContent = seleccionadas;
}

// Renderizar tabla de iniciativas PDF
function renderizarTablaIniciativasPDF() {
    const tbody = document.getElementById('tablaIniciativasPDF');
    const busqueda = (document.getElementById('buscarIniciativaPDF')?.value || '').toLowerCase();
    
    tbody.innerHTML = '';
    
    iniciativasPDFActual.forEach((init, index) => {
        const titulo = init.titulo || init.descripcion || 'Sin título';
        
        // Aplicar filtro de búsqueda
        if (busqueda && !titulo.toLowerCase().includes(busqueda)) {
            return;
        }
        
        const tr = document.createElement('tr');
        
        // Resaltar filas votables
        if (init.es_votable) {
            tr.style.backgroundColor = 'rgba(40, 167, 69, 0.1)';
        }
        
        tr.innerHTML = `
            <td>
                <input type="checkbox" class="form-check-input pdf-checkbox" 
                       data-index="${index}"
                       ${init.seleccionada ? 'checked' : ''}
                       onchange="toggleIniciativaPDF(${index})">
            </td>
            <td>
                ${init.es_votable ? '<i class="fas fa-vote-yea text-success" title="Votable"></i>' : ''}
                ${init.numero || index + 1}
            </td>
            <td>${titulo}</td>
            <td>
                <span class="badge bg-${init.es_votable ? 'success' : 'secondary'}">
                    ${init.es_votable ? 'Votable' : 'Informativo'}
                </span>
            </td>
            <td>
                <span class="badge bg-${init.tipo_mayoria === 'calificada' ? 'warning' : 'info'}">
                    ${init.tipo_mayoria || 'simple'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="editarIniciativaPDF(${index})">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    actualizarEstadisticasPDF();
}

// Toggle selección de iniciativa PDF
function toggleIniciativaPDF(index) {
    iniciativasPDFActual[index].seleccionada = !iniciativasPDFActual[index].seleccionada;
    actualizarEstadisticasPDF();
}

// Seleccionar todas las votables
function seleccionarVotablesPDF() {
    iniciativasPDFActual.forEach(init => {
        init.seleccionada = init.es_votable;
    });
    renderizarTablaIniciativasPDF();
}

// Seleccionar todas
function seleccionarTodasPDF() {
    iniciativasPDFActual.forEach(init => {
        init.seleccionada = true;
    });
    renderizarTablaIniciativasPDF();
}

// Deseleccionar todas
function deseleccionarTodasPDF() {
    iniciativasPDFActual.forEach(init => {
        init.seleccionada = false;
    });
    renderizarTablaIniciativasPDF();
}

// Toggle select all PDF
function toggleSelectAllPDF() {
    const selectAll = document.getElementById('selectAllPDF').checked;
    iniciativasPDFActual.forEach(init => {
        init.seleccionada = selectAll;
    });
    renderizarTablaIniciativasPDF();
}

// Filtrar iniciativas PDF
function filtrarIniciativasPDF() {
    renderizarTablaIniciativasPDF();
}

// Guardar borrador PDF
async function guardarBorradorPDF() {
    const seleccionadas = iniciativasPDFActual.filter(i => i.seleccionada);
    
    if (seleccionadas.length === 0) {
        alert('Debe seleccionar al menos una iniciativa');
        return;
    }
    
    alert(`Sesión guardada como borrador con ${seleccionadas.length} iniciativas seleccionadas`);
    bootstrap.Modal.getInstance(document.getElementById('modalRevisarPDF')).hide();
    cargarMisSesiones();
}

// Enviar al operador PDF
async function enviarAlOperadorPDF() {
    const seleccionadas = iniciativasPDFActual.filter(i => i.seleccionada);
    
    if (seleccionadas.length === 0) {
        alert('Debe seleccionar al menos una iniciativa');
        return;
    }
    
    if (!confirm(`¿Enviar sesión al operador con ${seleccionadas.length} iniciativas seleccionadas?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/servicios-legislativos/enviar-sesion/${sesionPDFActual.id}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                iniciativas: seleccionadas
            })
        });
        
        if (response.ok) {
            alert('Sesión enviada exitosamente al operador');
            bootstrap.Modal.getInstance(document.getElementById('modalRevisarPDF')).hide();
            cargarEstadisticas();
            cargarMisSesiones();
        } else {
            alert('Error al enviar la sesión');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al enviar la sesión');
    }
}

// Logout
function logout() {
    localStorage.clear();
    window.location.href = '/';
}