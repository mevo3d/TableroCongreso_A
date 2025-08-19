// Servicios Legislativos - JavaScript
const socket = io();
const user = JSON.parse(localStorage.getItem('user'));
const token = localStorage.getItem('token');

// Verificar autenticación
if (!token || !user || user.role !== 'servicios_legislativos') {
    window.location.href = '/';
}

document.getElementById('userName').textContent = user.nombre_completo || user.nombre;

// Variables globales
let sesionesData = [];
let iniciativasTemp = [];
let modoEdicion = false;
let sesionEditando = null;

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

// Cargar sesiones del usuario
async function cargarMisSesiones() {
    try {
        const response = await fetch('/api/servicios-legislativos/mis-sesiones', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            sesionesData = await response.json();
            mostrarSesiones(sesionesData);
        }
    } catch (error) {
        console.error('Error cargando sesiones:', error);
    }
}

// Mostrar lista de sesiones
function mostrarSesiones(sesiones) {
    const container = document.getElementById('listaSesiones');
    
    if (sesiones.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No hay sesiones cargadas</p>';
        return;
    }
    
    container.innerHTML = sesiones.map(sesion => {
        const badgeClass = sesion.estado === 'borrador' ? 'badge-borrador' : 
                          sesion.estado === 'enviada' ? 'badge-enviada' : 'badge-procesada';
        
        return `
            <div class="sesion-card ${sesion.estado}">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="mb-1">
                            ${sesion.nombre}
                            <span class="badge ${badgeClass} ms-2">${sesion.estado.toUpperCase()}</span>
                        </h6>
                        <p class="text-muted small mb-1">${sesion.descripcion || 'Sin descripción'}</p>
                        <small class="text-muted">
                            <i class="fas fa-calendar"></i> ${new Date(sesion.fecha_propuesta || sesion.fecha_carga).toLocaleDateString('es-MX')}
                            | <i class="fas fa-file-alt"></i> ${sesion.num_iniciativas || 0} iniciativas
                        </small>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-primary" onclick="verSesion(${sesion.id})">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${sesion.estado === 'borrador' ? `
                            <button class="btn btn-sm btn-outline-warning" onclick="editarSesion(${sesion.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="eliminarSesion(${sesion.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
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
            procesarPDF(files[0]);
        }
    });
    
    pdfInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            procesarPDF(e.target.files[0]);
        }
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

// Procesar archivo PDF
async function procesarPDF(file) {
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
async function verSesion(id) {
    try {
        const response = await fetch(`/api/servicios-legislativos/sesion/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const sesion = await response.json();
            mostrarDetallesSesion(sesion);
        }
        
    } catch (error) {
        console.error('Error cargando sesión:', error);
    }
}

// Mostrar detalles de sesión
function mostrarDetallesSesion(sesion) {
    const modalBody = document.getElementById('detallesSesion');
    
    modalBody.innerHTML = `
        <h5>${sesion.nombre}</h5>
        <p class="text-muted">${sesion.descripcion || 'Sin descripción'}</p>
        <div class="row mb-3">
            <div class="col-md-6">
                <strong>Estado:</strong> <span class="badge ${sesion.estado === 'borrador' ? 'badge-borrador' : sesion.estado === 'enviada' ? 'badge-enviada' : 'badge-procesada'}">${sesion.estado.toUpperCase()}</span>
            </div>
            <div class="col-md-6">
                <strong>Fecha Propuesta:</strong> ${sesion.fecha_propuesta ? new Date(sesion.fecha_propuesta).toLocaleDateString('es-MX') : 'No definida'}
            </div>
        </div>
        
        <h6>Iniciativas (${sesion.iniciativas.length})</h6>
        <div class="list-group">
            ${sesion.iniciativas.map(init => `
                <div class="list-group-item">
                    <strong>${init.numero}. ${init.titulo}</strong>
                    <p class="mb-1 small">${init.descripcion || ''}</p>
                    <small class="text-muted">
                        ${init.presentador || 'Sin presentador'} 
                        ${init.partido ? `(${init.partido})` : ''}
                        | Mayoría: ${init.tipo_mayoria}
                    </small>
                </div>
            `).join('')}
        </div>
    `;
    
    // Mostrar/ocultar botones según estado
    const btnEditar = document.getElementById('btnEditarSesion');
    const btnEnviar = document.getElementById('btnEnviarSesion');
    
    if (sesion.estado === 'borrador') {
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

// Logout
function logout() {
    localStorage.clear();
    window.location.href = '/';
}