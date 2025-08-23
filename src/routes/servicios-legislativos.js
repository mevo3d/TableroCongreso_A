const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { authenticateToken, authorize } = require('../auth/middleware');
const pdfExtractor = require('../pdf/extractor');

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Middleware de autenticación
router.use(authenticateToken);
router.use(authorize('servicios_legislativos', 'superadmin'));

// Obtener historial completo de sesiones del sistema
router.get('/historial-completo', (req, res) => {
    const db = req.db;
    
    // Obtener TODAS las sesiones del sistema (de ambas tablas)
    db.all(`
        SELECT 
            'sesion' as tipo_origen,
            s.id,
            s.codigo_sesion,
            s.nombre,
            s.nombre as nombre_sesion,
            s.descripcion,
            s.estado,
            s.activa,
            s.fecha,
            s.fecha_programada,
            s.fecha_clausura,
            s.iniciada_por as cargada_por,
            u.nombre_completo as nombre_usuario,
            u.role as role_usuario,
            COUNT(DISTINCT i.id) as num_iniciativas,
            COUNT(DISTINCT CASE WHEN i.resultado = 'aprobada' THEN i.id END) as aprobadas,
            COUNT(DISTINCT CASE WHEN i.resultado = 'rechazada' THEN i.id END) as rechazadas
        FROM sesiones s
        LEFT JOIN usuarios u ON s.iniciada_por = u.id
        LEFT JOIN iniciativas i ON s.id = i.sesion_id
        GROUP BY s.id
        
        UNION ALL
        
        SELECT 
            'sesion_precargada' as tipo_origen,
            sp.id,
            sp.codigo_sesion,
            sp.nombre_sesion as nombre,
            sp.nombre_sesion,
            sp.descripcion,
            sp.estado,
            0 as activa,
            sp.fecha_carga as fecha,
            sp.fecha_propuesta as fecha_programada,
            NULL as fecha_clausura,
            sp.cargada_por,
            u.nombre_completo as nombre_usuario,
            u.role as role_usuario,
            COUNT(DISTINCT ip.id) as num_iniciativas,
            0 as aprobadas,
            0 as rechazadas
        FROM sesiones_precargadas sp
        LEFT JOIN usuarios u ON sp.cargada_por = u.id
        LEFT JOIN iniciativas_precargadas ip ON sp.id = ip.sesion_precargada_id
        GROUP BY sp.id
        
        ORDER BY fecha DESC, fecha_programada DESC
    `, (err, sesiones) => {
        if (err) {
            console.error('Error obteniendo historial completo:', err);
            return res.status(500).json({ error: 'Error obteniendo historial' });
        }
        
        // Procesar y agregar metadatos
        const sesionesConMetadata = sesiones.map(sesion => ({
            ...sesion,
            tipo_sesion: sesion.cargada_por === req.user.id ? 'propia' : 'compartida',
            estadisticas: {
                aprobadas: sesion.aprobadas || 0,
                rechazadas: sesion.rechazadas || 0,
                total: sesion.num_iniciativas || 0
            }
        }));
        
        res.json(sesionesConMetadata);
    });
});

// Obtener estadísticas
router.get('/estadisticas', (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    
    db.get(`
        SELECT 
            COUNT(CASE WHEN estado = 'borrador' THEN 1 END) as borradores,
            COUNT(CASE WHEN estado = 'enviada' THEN 1 END) as enviadas,
            COUNT(CASE WHEN estado = 'procesada' THEN 1 END) as procesadas,
            (SELECT COUNT(*) FROM iniciativas_precargadas WHERE sesion_precargada_id IN 
                (SELECT id FROM sesiones_precargadas WHERE cargada_por = ?)) as totalIniciativas
        FROM sesiones_precargadas
        WHERE cargada_por = ?
    `, [userId, userId], (err, stats) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo estadísticas' });
        }
        res.json(stats || {
            borradores: 0,
            enviadas: 0,
            procesadas: 0,
            totalIniciativas: 0
        });
    });
});

// Cargar iniciativas desde Excel
router.post('/cargar-excel', upload.single('archivo'), async (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    
    if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó archivo' });
    }
    
    try {
        // Leer el archivo Excel
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);
        
        if (!data || data.length === 0) {
            return res.status(400).json({ error: 'El archivo Excel está vacío' });
        }
        
        // Validar estructura esperada
        const requiredColumns = ['numero', 'titulo', 'presentador', 'partido', 'tipo_mayoria'];
        const columns = Object.keys(data[0]);
        const missingColumns = requiredColumns.filter(col => !columns.includes(col));
        
        if (missingColumns.length > 0) {
            return res.status(400).json({ 
                error: 'Faltan columnas requeridas en el Excel',
                columnas_faltantes: missingColumns,
                columnas_esperadas: requiredColumns
            });
        }
        
        // Crear sesión precargada
        const fecha = new Date().toISOString();
        const nombreSesion = req.body.nombre || `Sesión cargada desde Excel - ${new Date().toLocaleDateString('es-MX')}`;
        
        // Generar código de sesión
        const codigo = `SL-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now().toString().slice(-4)}`;
        
        db.run(`
            INSERT INTO sesiones_precargadas (
                codigo_sesion, nombre_sesion, fecha_carga, estado, cargada_por, archivo_origen
            ) VALUES (?, ?, ?, 'borrador', ?, 'excel')
        `, [codigo, nombreSesion, fecha, userId], function(err) {
            if (err) {
                console.error('Error creando sesión desde Excel:', err);
                let mensajeError = 'Error al crear la sesión desde Excel';
                
                if (err.message.includes('UNIQUE')) {
                    mensajeError = 'Ya existe una sesión con ese código';
                } else if (err.message.includes('NOT NULL')) {
                    mensajeError = 'El archivo Excel no contiene todos los campos requeridos';
                } else if (err.message.includes('no such column')) {
                    mensajeError = 'Error en la estructura de la base de datos';
                }
                
                return res.status(500).json({ 
                    error: mensajeError,
                    detalle: err.message,
                    sugerencia: 'Verifique que el Excel tenga las columnas: numero, titulo, descripcion, presentador, partido'
                });
            }
            
            const sesionId = this.lastID;
            let iniciativasInsertadas = 0;
            let errores = [];
            
            // Insertar cada iniciativa
            const stmt = db.prepare(`
                INSERT INTO iniciativas_precargadas (
                    sesion_precargada_id, numero, titulo, descripcion,
                    presentador, partido_presentador, tipo_mayoria
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            data.forEach((row, index) => {
                // Limpiar y validar datos
                const numero = parseInt(row.numero) || (index + 1);
                const titulo = String(row.titulo || row.descripcion || 'Sin título').trim();
                const descripcion = String(row.descripcion || row.titulo || '').trim();
                const presentador = String(row.presentador || 'No especificado').trim();
                const partido = String(row.partido || row.partido_presentador || 'No especificado').trim();
                const tipoMayoria = String(row.tipo_mayoria || 'simple').toLowerCase();
                
                // Validar tipo de mayoría
                const tiposValidos = ['simple', 'absoluta', 'calificada', 'unanime'];
                const tipoMayoriaValido = tiposValidos.includes(tipoMayoria) ? tipoMayoria : 'simple';
                
                stmt.run(
                    sesionId, numero, titulo, descripcion,
                    presentador, partido, tipoMayoriaValido,
                    (err) => {
                        if (err) {
                            errores.push(`Error en fila ${index + 1}: ${err.message}`);
                        } else {
                            iniciativasInsertadas++;
                        }
                    }
                );
            });
            
            stmt.finalize((err) => {
                if (err) {
                    console.error('Error finalizando statement:', err);
                    return res.status(500).json({ error: 'Error procesando iniciativas' });
                }
                
                res.json({
                    success: true,
                    sesion_id: sesionId,
                    iniciativas_procesadas: data.length,
                    iniciativas_insertadas: iniciativasInsertadas,
                    errores: errores.length > 0 ? errores : undefined,
                    mensaje: `Sesión creada con ${iniciativasInsertadas} iniciativas`
                });
            });
        });
        
    } catch (error) {
        console.error('Error procesando Excel:', error);
        res.status(500).json({ 
            error: 'Error procesando archivo Excel',
            detalle: error.message 
        });
    }
});

// Obtener sesiones del usuario y sesiones pendientes compartidas
router.get('/mis-sesiones', (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    
    // Obtener todas las sesiones: las propias del usuario y las pendientes/indefinidas
    db.all(`
        SELECT 
            sp.id,
            sp.codigo_sesion,
            sp.nombre_sesion as nombre,
            sp.descripcion,
            sp.fecha_propuesta,
            sp.estado,
            sp.fecha_carga,
            sp.cargada_por,
            u.nombre_completo as nombre_usuario,
            COUNT(ip.id) as num_iniciativas,
            CASE 
                WHEN sp.cargada_por = ? THEN 'propia'
                ELSE 'compartida'
            END as tipo_sesion,
            CASE
                WHEN u.role = 'servicios_legislativos' THEN 'Servicios'
                WHEN u.role = 'operador' THEN 'Operador'
                ELSE u.role
            END as origen
        FROM sesiones_precargadas sp
        LEFT JOIN iniciativas_precargadas ip ON sp.id = ip.sesion_precargada_id
        LEFT JOIN usuarios u ON sp.cargada_por = u.id
        WHERE sp.cargada_por = ? 
           OR sp.estado IN ('pendiente', 'indefinida')
        GROUP BY sp.id
        ORDER BY sp.fecha_carga DESC
    `, [userId, userId], (err, sesiones) => {
        if (err) {
            console.error('Error obteniendo sesiones:', err);
            return res.status(500).json({ error: 'Error obteniendo sesiones' });
        }
        res.json(sesiones || []);
    });
});

// Obtener detalles de una sesión
router.get('/sesion/:id', (req, res) => {
    const db = req.db;
    const sesionId = req.params.id;
    const userId = req.user.id;
    
    db.get(`
        SELECT * FROM sesiones_precargadas 
        WHERE id = ? AND cargada_por = ?
    `, [sesionId, userId], (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            return res.status(404).json({ error: 'Sesión no encontrada' });
        }
        
        // Obtener iniciativas
        db.all(`
            SELECT * FROM iniciativas_precargadas 
            WHERE sesion_precargada_id = ?
            ORDER BY numero
        `, [sesionId], (err, iniciativas) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo iniciativas' });
            }
            
            sesion.iniciativas = iniciativas || [];
            res.json(sesion);
        });
    });
});

// Crear sesión manual
router.post('/crear-sesion', (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    const { nombre, fecha_propuesta, descripcion, estado, iniciativas } = req.body;
    
    if (!nombre || !iniciativas || iniciativas.length === 0) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    // Generar código de sesión
    const fecha = new Date();
    const codigo = `SL-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
    
    db.run(`
        INSERT INTO sesiones_precargadas (
            codigo_sesion, nombre_sesion, descripcion, fecha_propuesta, 
            estado, cargada_por, fecha_carga
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [codigo, nombre, descripcion, fecha_propuesta, estado || 'borrador', userId, new Date().toISOString()],
    function(err) {
        if (err) {
            console.error('Error al crear sesión manual:', err);
            let mensajeError = 'Error creando sesión en la base de datos';
            
            // Proporcionar detalles específicos del error
            if (err.message.includes('UNIQUE')) {
                mensajeError = 'Ya existe una sesión con ese código';
            } else if (err.message.includes('NOT NULL')) {
                mensajeError = 'Faltan campos obligatorios para crear la sesión';
            } else if (err.message.includes('FOREIGN KEY')) {
                mensajeError = 'Error con las referencias de usuario';
            }
            
            return res.status(500).json({ 
                error: mensajeError,
                detalle: err.message,
                codigo: err.code
            });
        }
        
        const sesionId = this.lastID;
        
        // Insertar iniciativas
        const stmt = db.prepare(`
            INSERT INTO iniciativas_precargadas (
                sesion_precargada_id, numero, titulo, descripcion,
                presentador, partido_presentador, tipo_mayoria,
                tipo_iniciativa, comision, turno, observaciones
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        let errores = 0;
        iniciativas.forEach(init => {
            stmt.run(
                sesionId,
                init.numero,
                init.titulo,
                init.descripcion || '',
                init.presentador || '',
                init.partido || '',
                init.tipo_mayoria || 'simple',
                init.tipo_iniciativa || 'ordinaria',
                init.comision || '',
                init.turno || '',
                init.observaciones || '',
                (err) => {
                    if (err) errores++;
                }
            );
        });
        
        stmt.finalize((err) => {
            if (err || errores > 0) {
                return res.status(500).json({ error: 'Error guardando iniciativas' });
            }
            
            res.json({
                success: true,
                sesion_id: sesionId,
                codigo: codigo,
                mensaje: `Sesión creada con ${iniciativas.length} iniciativas`
            });
        });
    });
});

// Cargar desde Excel
router.post('/cargar-excel', upload.single('archivo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó archivo' });
    }
    
    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        
        // Leer datos de sesión
        let datosSesion = {};
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
            return res.status(400).json({ error: 'No se encontraron iniciativas en el archivo' });
        }
        
        // Crear sesión con los datos del Excel
        const db = req.db;
        const userId = req.user.id;
        const fecha = new Date();
        const codigo = `SL-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
        
        const nombreSesion = datosSesion.NOMBRE_SESION || `Sesión ${new Date().toLocaleDateString('es-MX')}`;
        const fechaPropuesta = datosSesion.FECHA_PROPUESTA || null;
        const descripcion = datosSesion.DESCRIPCION || '';
        
        db.run(`
            INSERT INTO sesiones_precargadas (
                codigo_sesion, nombre_sesion, descripcion, fecha_propuesta,
                estado, cargada_por, fecha_carga, archivo_origen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [codigo, nombreSesion, descripcion, fechaPropuesta, 'borrador', userId, new Date().toISOString(), req.file.originalname],
        function(err) {
            if (err) {
                console.error('Error al crear sesión desde plantilla:', err);
                let mensajeError = 'Error al crear la sesión desde la plantilla';
                
                if (err.message.includes('UNIQUE')) {
                    mensajeError = 'Ya existe una sesión con ese código';
                } else if (err.message.includes('NOT NULL')) {
                    mensajeError = 'Faltan datos obligatorios para crear la sesión';
                } else if (err.message.includes('no such column')) {
                    mensajeError = 'Error en la estructura de la base de datos';
                }
                
                return res.status(500).json({ 
                    error: mensajeError,
                    detalle: err.message,
                    codigo: err.code
                });
            }
            
            const sesionId = this.lastID;
            
            // Insertar iniciativas
            const stmt = db.prepare(`
                INSERT INTO iniciativas_precargadas (
                    sesion_precargada_id, numero, titulo, descripcion,
                    presentador, partido_presentador, tipo_mayoria,
                    tipo_iniciativa, comision, turno, observaciones
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            iniciativas.forEach(init => {
                stmt.run(
                    sesionId,
                    init.numero,
                    init.titulo,
                    init.descripcion,
                    init.presentador,
                    init.partido,
                    init.tipo_mayoria,
                    init.tipo_iniciativa,
                    init.comision,
                    init.turno,
                    init.observaciones
                );
            });
            
            stmt.finalize((err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error guardando iniciativas' });
                }
                
                res.json({
                    success: true,
                    sesion: nombreSesion,
                    iniciativas: iniciativas.length,
                    mensaje: 'Archivo Excel procesado correctamente'
                });
            });
        });
        
    } catch (error) {
        console.error('Error procesando Excel:', error);
        res.status(500).json({ error: 'Error al procesar el archivo Excel' });
    }
});

// Cargar desde PDF
router.post('/cargar-pdf', upload.single('pdf'), async (req, res) => {
    console.log('Iniciando carga de PDF...');
    console.log('Headers recibidos:', req.headers);
    console.log('Usuario:', req.user);
    console.log('Archivo:', req.file ? 'Recibido' : 'No recibido');
    console.log('Body:', req.body);
    
    // Verificar que el usuario está autenticado
    if (!req.user || !req.user.id) {
        console.error('Error: Usuario no autenticado', req.user);
        return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    
    if (!req.file) {
        console.error('Error: No se proporcionó archivo PDF');
        return res.status(400).json({ error: 'No se proporcionó archivo PDF' });
    }
    
    try {
        // Extraer iniciativas del PDF
        const resultado = await pdfExtractor.extraerIniciativas(req.file.buffer, 'pdf');
        
        console.log('Resultado del extractor:', typeof resultado, 'Es array:', Array.isArray(resultado));
        
        // El extractor ahora devuelve un objeto con elementos y estadísticas
        let iniciativasArray = [];
        
        // Manejar diferentes formatos de respuesta
        if (Array.isArray(resultado)) {
            // Es un array directo
            iniciativasArray = resultado;
        } else if (resultado && typeof resultado === 'object') {
            // Es un objeto con propiedades
            if (resultado.elementos && Array.isArray(resultado.elementos)) {
                iniciativasArray = resultado.elementos;
            } else if (resultado.iniciativas && Array.isArray(resultado.iniciativas)) {
                iniciativasArray = resultado.iniciativas;
            }
        }
        
        console.log('Iniciativas procesadas:', iniciativasArray.length);
        
        if (iniciativasArray.length === 0) {
            return res.status(400).json({ error: 'No se encontraron iniciativas en el PDF' });
        }
        
        const iniciativas = iniciativasArray;
        
        const db = req.db;
        const userId = req.user.id;
        const fecha = new Date();
        const codigo = `SL-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
        
        // Obtener tipo de carga
        const tipoCarga = req.body.tipoCarga || 'inmediata';
        const fechaProgramada = req.body.fechaProgramada;
        
        // Determinar estado según tipo de carga
        let estado;
        let fechaPropuesta = null;
        
        if (tipoCarga === 'inmediata') {
            estado = 'pendiente'; // Lista para cargar inmediatamente
            fechaPropuesta = new Date().toISOString();
        } else if (tipoCarga === 'programada') {
            estado = 'programada';
            fechaPropuesta = fechaProgramada ? new Date(fechaProgramada).toISOString() : new Date().toISOString();
        } else if (tipoCarga === 'indefinida') {
            estado = 'indefinida';
            fechaPropuesta = null;
        } else {
            estado = 'pendiente';
            fechaPropuesta = new Date().toISOString();
        }
        
        const nombreSesion = `Sesión PDF ${new Date().toLocaleDateString('es-MX')}`;
        
        db.run(`
            INSERT INTO sesiones_precargadas (
                codigo_sesion, nombre_sesion, descripcion,
                estado, cargada_por, fecha_carga, fecha_propuesta, archivo_origen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [codigo, nombreSesion, 'Sesión cargada desde PDF', estado, userId, new Date().toISOString(), fechaPropuesta, req.file.originalname],
        function(err) {
            if (err) {
                console.error('Error al crear sesión desde PDF:', err);
                let mensajeError = 'Error al crear la sesión desde el PDF';
                
                // Proporcionar detalles específicos del error
                if (err.message.includes('UNIQUE')) {
                    mensajeError = 'Ya existe una sesión con ese código. Intente de nuevo.';
                } else if (err.message.includes('NOT NULL')) {
                    mensajeError = 'Faltan datos obligatorios en la sesión';
                } else if (err.message.includes('no such column')) {
                    mensajeError = 'Error en la estructura de la base de datos. Contacte al administrador.';
                } else if (err.message.includes('SQLITE_CONSTRAINT')) {
                    mensajeError = 'Error de restricción en la base de datos';
                }
                
                return res.status(500).json({ 
                    error: mensajeError,
                    detalle: err.message,
                    codigo: err.code,
                    sugerencia: 'Verifique que el PDF contiene el formato correcto de iniciativas'
                });
            }
            
            const sesionId = this.lastID;
            
            // Guardar el PDF en el servidor
            const pdfFileName = `sesion_precargada_${sesionId}_${Date.now()}.pdf`;
            const pdfPath = path.join(__dirname, '..', '..', 'uploads', 'sesiones', pdfFileName);
            
            fs.writeFileSync(pdfPath, req.file.buffer);
            
            // Actualizar la sesión precargada con la ruta del documento
            db.run('UPDATE sesiones_precargadas SET archivo_pdf = ? WHERE id = ?', [pdfFileName, sesionId]);
            
            // Insertar iniciativas
            const stmt = db.prepare(`
                INSERT INTO iniciativas_precargadas (
                    sesion_precargada_id, numero, titulo, descripcion,
                    tipo_mayoria, tipo_iniciativa
                ) VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            iniciativas.forEach(init => {
                stmt.run(
                    sesionId,
                    init.numero,
                    init.titulo,
                    init.descripcion || '',
                    init.tipo_mayoria || 'simple',
                    'ordinaria'
                );
            });
            
            stmt.finalize((err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error guardando iniciativas' });
                }
                
                res.json({
                    success: true,
                    sesion_id: sesionId,
                    iniciativas: iniciativas.length,
                    mensaje: 'PDF procesado. Revise y complete la información faltante'
                });
            });
        });
        
    } catch (error) {
        console.error('Error procesando PDF:', error);
        let mensajeError = 'Error al procesar el archivo PDF';
        
        if (error.message.includes('timeout')) {
            mensajeError = 'El PDF es demasiado grande o complejo para procesar';
        } else if (error.message.includes('formato')) {
            mensajeError = 'El formato del PDF no es compatible';
        } else if (error.message.includes('extractor')) {
            mensajeError = 'Error al extraer las iniciativas del PDF';
        }
        
        res.status(500).json({ 
            error: mensajeError,
            detalle: error.message,
            sugerencia: 'Asegúrese de que el PDF contiene un orden del día con iniciativas numeradas'
        });
    }
});

// Obtener documentos PDF disponibles
router.get('/documentos-pdf', (req, res) => {
    const db = req.db;
    
    // Obtener tanto sesiones como sesiones precargadas que tengan PDF
    const query = `
        SELECT 
            'sesiones' as tipo,
            s.id,
            s.codigo_sesion as codigo,
            s.nombre,
            s.fecha,
            s.estado,
            s.archivo_pdf,
            COUNT(i.id) as total_iniciativas
        FROM sesiones s
        LEFT JOIN iniciativas i ON s.id = i.sesion_id
        WHERE s.archivo_pdf IS NOT NULL
        GROUP BY s.id
        
        UNION ALL
        
        SELECT 
            'precargadas' as tipo,
            sp.id,
            sp.codigo_sesion as codigo,
            sp.nombre_sesion as nombre,
            sp.fecha_carga as fecha,
            sp.estado,
            sp.archivo_pdf,
            COUNT(ip.id) as total_iniciativas
        FROM sesiones_precargadas sp
        LEFT JOIN iniciativas_precargadas ip ON sp.id = ip.sesion_precargada_id
        WHERE sp.archivo_pdf IS NOT NULL
        GROUP BY sp.id
        
        ORDER BY fecha DESC
        LIMIT 50
    `;
    
    db.all(query, [], (err, documentos) => {
        if (err) {
            console.error('Error obteniendo documentos PDF:', err);
            return res.status(500).json({ error: 'Error obteniendo documentos' });
        }
        
        res.json({ documentos: documentos || [] });
    });
});

// Enviar sesión al operador
router.post('/enviar-sesion/:id', (req, res) => {
    const db = req.db;
    const sesionId = req.params.id;
    const userId = req.user.id;
    
    db.run(`
        UPDATE sesiones_precargadas 
        SET estado = 'disponible',
            fecha_envio = ?
        WHERE id = ? AND cargada_por = ? AND estado = 'borrador'
    `, [new Date().toISOString(), sesionId, userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error enviando sesión' });
        }
        
        if (this.changes === 0) {
            return res.status(400).json({ error: 'No se puede enviar esta sesión' });
        }
        
        // Notificar al operador (si hay socket disponible)
        const io = req.io;
        if (io) {
            io.emit('nueva-sesion-precargada', {
                sesion_id: sesionId,
                mensaje: 'Nueva sesión disponible de Servicios Legislativos'
            });
        }
        
        res.json({ success: true, mensaje: 'Sesión enviada al operador' });
    });
});

// Eliminar sesión (solo borradores)
router.delete('/eliminar-sesion/:id', (req, res) => {
    const db = req.db;
    const sesionId = req.params.id;
    const userId = req.user.id;
    
    // Primero eliminar iniciativas
    db.run(`
        DELETE FROM iniciativas_precargadas 
        WHERE sesion_precargada_id IN (
            SELECT id FROM sesiones_precargadas 
            WHERE id = ? AND cargada_por = ? AND estado = 'borrador'
        )
    `, [sesionId, userId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error eliminando iniciativas' });
        }
        
        // Luego eliminar sesión
        db.run(`
            DELETE FROM sesiones_precargadas 
            WHERE id = ? AND cargada_por = ? AND estado = 'borrador'
        `, [sesionId, userId], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Error eliminando sesión' });
            }
            
            if (this.changes === 0) {
                return res.status(400).json({ error: 'No se puede eliminar esta sesión' });
            }
            
            res.json({ success: true, mensaje: 'Sesión eliminada' });
        });
    });
});

module.exports = router;