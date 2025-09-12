const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticateToken, authorize } = require('../auth/middleware');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Función auxiliar para generar reporte de asistencias
function generarReporteAsistencias(asistencias) {
    const reporte = {
        resumen: {
            presentes: 0,
            ausentes: 0,
            justificados: 0,
            retardos: 0,
            total_diputados: 0
        },
        detalle: [],
        hora_pase_lista: null
    };
    
    if (!asistencias || asistencias.length === 0) {
        return reporte;
    }
    
    asistencias.forEach(a => {
        reporte.total_diputados++;
        
        let estadoFinal = '';
        if (a.asistencia === 'presente') {
            if (a.llegada_tardia) {
                estadoFinal = 'Asistencia con retardo';
                reporte.resumen.retardos++;
            } else {
                estadoFinal = 'Presente';
                reporte.resumen.presentes++;
            }
        } else if (a.asistencia === 'ausente') {
            estadoFinal = 'Inasistencia';
            reporte.resumen.ausentes++;
        } else if (a.asistencia === 'justificado') {
            estadoFinal = 'Inasistencia Justificada';
            reporte.resumen.justificados++;
        } else {
            estadoFinal = 'Sin registro';
        }
        
        reporte.detalle.push({
            nombre: a.nombre_completo,
            partido: a.partido,
            estado: estadoFinal,
            hora_registro: a.hora,
            hora_llegada_tardia: a.hora_llegada_tardia,
            justificacion_motivo: a.justificacion_motivo,
            justificado_por: a.justificado_por_nombre
        });
    });
    
    reporte.resumen.total_diputados = asistencias.length;
    
    return reporte;
}

// Configuración de multer para subir logos y fotos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../public/uploads'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const prefix = file.fieldname === 'foto' ? 'user' : 'logo';
        cb(null, `${prefix}-${Date.now()}${ext}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB - Aumentado para imágenes más grandes
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|svg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes'));
        }
    }
});

// Middleware de autenticación
router.use(authenticateToken);
router.use(authorize('superadmin'));

// Dashboard
router.get('/dashboard', (req, res) => {
    const db = req.db;
    
    const queries = {
        total_usuarios: 'SELECT COUNT(*) as count FROM usuarios',
        total_diputados: "SELECT COUNT(*) as count FROM usuarios WHERE role = 'diputado'",
        total_sesiones: 'SELECT COUNT(*) as count FROM sesiones',
        total_iniciativas: 'SELECT COUNT(*) as count FROM iniciativas',
        total_votos: 'SELECT COUNT(*) as count FROM votos',
        sesion_activa: 'SELECT id FROM sesiones WHERE activa = 1'
    };
    
    const results = {};
    let completed = 0;
    const totalQueries = Object.keys(queries).length;
    
    Object.entries(queries).forEach(([key, query]) => {
        db.get(query, (err, row) => {
            if (!err && row) {
                results[key] = row.count !== undefined ? row.count : (row.id ? true : false);
            } else {
                results[key] = 0;
            }
            
            completed++;
            if (completed === totalQueries) {
                res.json(results);
            }
        });
    });
});

// GESTIÓN DE PARTIDOS POLÍTICOS

// Listar todos los partidos
router.get('/partidos', (req, res) => {
    const db = req.db;
    
    db.all(`SELECT * FROM partidos ORDER BY nombre`, (err, partidos) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo partidos' });
        }
        res.json(partidos);
    });
});

// Actualizar partido (logo y color)
router.put('/partido/:id', upload.single('logo'), (req, res) => {
    const db = req.db;
    const { id } = req.params;
    const { color_primario } = req.body;
    
    let updateQuery = 'UPDATE partidos SET ';
    const params = [];
    
    if (color_primario) {
        updateQuery += 'color_primario = ?';
        params.push(color_primario);
    }
    
    if (req.file) {
        if (params.length > 0) updateQuery += ', ';
        updateQuery += 'logo_url = ?';
        params.push(`/uploads/${req.file.filename}`);
    }
    
    if (params.length === 0) {
        return res.status(400).json({ error: 'No hay datos para actualizar' });
    }
    
    updateQuery += ' WHERE id = ?';
    params.push(id);
    
    db.run(updateQuery, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error actualizando partido' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        
        res.json({ message: 'Partido actualizado correctamente' });
    });
});

// GESTIÓN DE USUARIOS

// Obtener usuarios
router.get('/usuarios', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT id, username, role, nombre_completo, apellidos, cargo_mesa_directiva, 
               cargo_coordinador, partido, comision, cargo_legislativo, 
               foto_url, activo, password_plain 
        FROM usuarios 
        ORDER BY role, apellidos, id
    `, (err, usuarios) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo usuarios' });
        }
        
        res.json({ usuarios });
    });
});

// Obtener sesiones
router.get('/sesiones', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT 
            s.*,
            COUNT(DISTINCT i.id) as total_iniciativas,
            COUNT(DISTINCT CASE WHEN i.cerrada = 1 THEN i.id END) as iniciativas_votadas
        FROM sesiones s
        LEFT JOIN iniciativas i ON s.id = i.sesion_id
        GROUP BY s.id
        ORDER BY s.id DESC
    `, (err, sesiones) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesiones' });
        }
        
        res.json({ sesiones });
    });
});

// Clausurar sesión activa (con todos los permisos de superadmin)
router.post('/cerrar-sesion', (req, res) => {
    const db = req.db;
    const io = req.io;
    const userId = req.user.id;
    
    // Obtener sesión activa
    db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            return res.status(400).json({ error: 'No hay sesión activa' });
        }
        
        // Primero obtener datos de asistencia
        db.all(
            `SELECT 
                u.nombre_completo,
                u.partido,
                a.asistencia,
                a.hora,
                a.llegada_tardia,
                a.hora_llegada_tardia,
                a.justificacion_motivo,
                a.hora_justificacion,
                uj.nombre_completo as justificado_por_nombre,
                pl.fecha as fecha_pase_lista,
                pl.hora_pase_lista_inicial
            FROM usuarios u
            LEFT JOIN pase_lista pl ON pl.sesion_id = ?
            LEFT JOIN asistencias a ON u.id = a.diputado_id AND a.pase_lista_id = pl.id
            LEFT JOIN usuarios uj ON a.justificado_por = uj.id
            WHERE u.role = 'diputado'
            ORDER BY u.nombre_completo`,
            [sesion.id],
            (err, asistencias) => {
                if (err) {
                    console.error('Error obteniendo asistencias:', err);
                }
                
                // Cerrar todas las votaciones activas
                db.run(
                    `UPDATE iniciativas 
                     SET activa = 0, cerrada = 1 
                     WHERE sesion_id = ? AND activa = 1`,
                    [sesion.id],
                    (err) => {
                        if (err) {
                            return res.status(500).json({ error: 'Error cerrando votaciones' });
                        }
                        
                        // Clausurar la sesión formalmente
                        const fechaClausura = new Date().toISOString();
                        db.run(
                            `UPDATE sesiones 
                             SET activa = 0, 
                                 fecha_clausura = ?,
                                 clausurada_por = ?,
                                 estado = 'clausurada'
                             WHERE id = ?`,
                            [fechaClausura, userId, sesion.id],
                            (err) => {
                                if (err) {
                                    return res.status(500).json({ error: 'Error clausurando sesión' });
                                }
                                
                                // Obtener estadísticas finales
                                db.get(
                                    `SELECT 
                                        COUNT(DISTINCT i.id) as total_iniciativas,
                                        COUNT(DISTINCT CASE WHEN i.resultado = 'aprobada' THEN i.id END) as aprobadas,
                                        COUNT(DISTINCT CASE WHEN i.resultado = 'rechazada' THEN i.id END) as rechazadas,
                                        COUNT(DISTINCT v.diputado_id) as participacion
                                    FROM iniciativas i
                                    LEFT JOIN votaciones v ON i.id = v.iniciativa_id
                                    WHERE i.sesion_id = ?`,
                                    [sesion.id],
                                    (err, stats) => {
                                        if (err) {
                                            console.error('Error obteniendo estadísticas:', err);
                                        }
                                        
                                        // Generar reporte de asistencias
                                        const reporteAsistencias = generarReporteAsistencias(asistencias);
                                        
                                        // Obtener timestamp del pase de lista
                                        if (asistencias && asistencias.length > 0 && asistencias[0].hora_pase_lista_inicial) {
                                            reporteAsistencias.hora_pase_lista = asistencias[0].hora_pase_lista_inicial;
                                        }
                                        
                                        // Emitir evento de sesión clausurada
                                        io.emit('sesion-clausurada', {
                                            sesion_id: sesion.id,
                                            clausurada_por: 'Superadmin',
                                            fecha_clausura: fechaClausura,
                                            estadisticas: stats || {},
                                            reporte_asistencias: reporteAsistencias
                                        });
                                        
                                        res.json({ 
                                            message: 'Sesión clausurada correctamente',
                                            estadisticas: stats || {},
                                            reporte_asistencias: reporteAsistencias
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});

// Toggle usuario activo/inactivo
router.put('/usuario/:id/toggle', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
    db.run(`
        UPDATE usuarios 
        SET activo = CASE WHEN activo = 1 THEN 0 ELSE 1 END 
        WHERE id = ?
    `, [id], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error actualizando usuario' });
        }
        
        res.json({ message: 'Usuario actualizado' });
    });
});

// Obtener detalle de votación
router.get('/votacion/:iniciativaId', (req, res) => {
    const { iniciativaId } = req.params;
    const db = req.db;
    
    db.get(
        'SELECT * FROM iniciativas WHERE id = ?',
        [iniciativaId],
        (err, iniciativa) => {
            if (err || !iniciativa) {
                return res.status(404).json({ error: 'Iniciativa no encontrada' });
            }
            
            db.all(`
                SELECT 
                    u.nombre_completo,
                    v.voto,
                    v.fecha_voto
                FROM usuarios u
                LEFT JOIN votos v ON u.id = v.usuario_id AND v.iniciativa_id = ?
                WHERE u.role = 'diputado'
                ORDER BY u.id
            `, [iniciativaId], (err, votos) => {
                if (err) {
                    return res.status(500).json({ error: 'Error obteniendo votos' });
                }
                
                res.json({ iniciativa, votos });
            });
        }
    );
});

// Crear nuevo usuario
router.post('/usuarios', upload.single('foto'), async (req, res) => {
    const { username, password, role, nombre_completo, apellidos, cargo_mesa_directiva, 
            cargo_coordinador, partido, comision, cargo_legislativo } = req.body;
    const db = req.db;
    
    if (!username || !password || !role || !nombre_completo) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const foto_url = req.file ? '/uploads/' + req.file.filename : '';
    
    db.run(
        `INSERT INTO usuarios (username, password, password_plain, role, nombre_completo, apellidos, cargo_mesa_directiva, 
                              cargo_coordinador, partido, comision, cargo_legislativo, foto_url) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [username, hashedPassword, password, role, nombre_completo, apellidos || '', cargo_mesa_directiva || '', 
         cargo_coordinador || '', partido || '', comision || '', cargo_legislativo || '', foto_url],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'El usuario ya existe' });
                }
                return res.status(500).json({ error: 'Error creando usuario' });
            }
            
            res.json({ id: this.lastID, message: 'Usuario creado exitosamente' });
        }
    );
});

// Actualizar usuario
router.put('/usuarios/:id', upload.single('foto'), async (req, res) => {
    const { id } = req.params;
    const { nombre_completo, apellidos, cargo_mesa_directiva, cargo_coordinador, 
            partido, comision, cargo_legislativo, password } = req.body;
    const db = req.db;
    
    let query = 'UPDATE usuarios SET nombre_completo = ?, apellidos = ?, cargo_mesa_directiva = ?, ' +
                'cargo_coordinador = ?, partido = ?, comision = ?, cargo_legislativo = ?';
    let params = [nombre_completo, apellidos || '', cargo_mesa_directiva || '', cargo_coordinador || '', 
                  partido || '', comision || '', cargo_legislativo || ''];
    
    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        query += ', password = ?, password_plain = ?';
        params.push(hashedPassword);
        params.push(password);
    }
    
    if (req.file) {
        query += ', foto_url = ?';
        params.push('/uploads/' + req.file.filename);
    }
    
    query += ' WHERE id = ?';
    params.push(id);
    
    db.run(query, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error actualizando usuario' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        res.json({ message: 'Usuario actualizado' });
    });
});

// Eliminar usuario
router.delete('/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
    // No permitir eliminar superadmin
    db.get('SELECT role FROM usuarios WHERE id = ?', [id], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        if (user.role === 'superadmin') {
            return res.status(403).json({ error: 'No se puede eliminar el superadmin' });
        }
        
        db.run('DELETE FROM usuarios WHERE id = ?', [id], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Error eliminando usuario' });
            }
            
            res.json({ message: 'Usuario eliminado' });
        });
    });
});

// Obtener configuración del sistema
router.get('/configuracion', (req, res) => {
    const db = req.db;
    
    db.get('SELECT * FROM configuracion_sistema WHERE id = 1', (err, config) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo configuración' });
        }
        
        res.json(config || {});
    });
});

// Actualizar configuración del sistema
router.put('/configuracion', upload.fields([
    { name: 'logo_congreso', maxCount: 1 },
    { name: 'logo_secundario', maxCount: 1 }
]), (req, res) => {
    const db = req.db;
    const { nombre_congreso } = req.body;
    
    let query = 'UPDATE configuracion_sistema SET nombre_congreso = ?';
    let params = [nombre_congreso];
    
    if (req.files['logo_congreso']) {
        query += ', logo_congreso = ?';
        params.push('/uploads/' + req.files['logo_congreso'][0].filename);
    }
    
    if (req.files['logo_secundario']) {
        query += ', logo_secundario = ?';
        params.push('/uploads/' + req.files['logo_secundario'][0].filename);
    }
    
    query += ' WHERE id = 1';
    
    db.run(query, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error actualizando configuración' });
        }
        
        res.json({ message: 'Configuración actualizada' });
    });
});

// ============= ENDPOINTS DE ESTADÍSTICAS DE DIPUTADOS =============

// Obtener lista de diputados para select
router.get('/lista-diputados', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT id, nombre_completo, partido, cargo_mesa_directiva
        FROM usuarios 
        WHERE role = 'diputado'
        ORDER BY nombre_completo
    `, (err, diputados) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo diputados' });
        }
        res.json(diputados);
    });
});

// Obtener estadísticas generales de diputados
router.get('/estadisticas-diputados', (req, res) => {
    const db = req.db;
    const { fecha_inicio, fecha_fin, diputado_id, partido } = req.query;
    
    let whereClause = ' WHERE 1=1 ';
    let params = [];
    
    if (fecha_inicio) {
        whereClause += ' AND DATE(s.fecha_inicio) >= ? ';
        params.push(fecha_inicio);
    }
    
    if (fecha_fin) {
        whereClause += ' AND DATE(s.fecha_inicio) <= ? ';
        params.push(fecha_fin);
    }
    
    if (diputado_id) {
        whereClause += ' AND u.id = ? ';
        params.push(diputado_id);
    }
    
    if (partido) {
        whereClause += ' AND u.partido = ? ';
        params.push(partido);
    }
    
    const estadisticas = {};
    
    // Resumen general
    db.get(`
        SELECT 
            COUNT(DISTINCT s.id) as total_sesiones,
            COUNT(DISTINCT i.id) as total_iniciativas,
            (SELECT COUNT(DISTINCT ad.diputado_id) 
             FROM asistencia_diputados ad 
             WHERE ad.asistencia = 'presente') as total_presentes,
            (SELECT COUNT(*) FROM usuarios WHERE role = 'diputado') as total_diputados
        FROM sesiones s
        LEFT JOIN iniciativas i ON i.sesion_id = s.id
        ${whereClause}
    `, params, (err, resumen) => {
        if (err) {
            console.error('Error en resumen:', err);
            return res.status(500).json({ error: 'Error obteniendo estadísticas' });
        }
        
        estadisticas.resumen = {
            total_sesiones: resumen.total_sesiones || 0,
            total_iniciativas: resumen.total_iniciativas || 0,
            promedio_asistencia: resumen.total_diputados > 0 ? 
                ((resumen.total_presentes / (resumen.total_diputados * resumen.total_sesiones)) * 100) : 0
        };
        
        // Asistencia por diputado
        db.all(`
            SELECT 
                u.id as diputado_id,
                u.nombre_completo,
                u.partido,
                COUNT(DISTINCT a.id) as total_sesiones,
                SUM(CASE WHEN ad.asistencia = 'presente' THEN 1 ELSE 0 END) as presentes,
                SUM(CASE WHEN ad.asistencia = 'ausente' THEN 1 ELSE 0 END) as ausentes,
                SUM(CASE WHEN ad.asistencia = 'permiso' THEN 1 ELSE 0 END) as permisos
            FROM usuarios u
            LEFT JOIN asistencia_diputados ad ON ad.diputado_id = u.id
            LEFT JOIN asistencias a ON a.id = ad.asistencia_id
            LEFT JOIN sesiones s ON s.id = a.sesion_id
            WHERE u.role = 'diputado'
            ${partido ? ' AND u.partido = ? ' : ''}
            ${diputado_id ? ' AND u.id = ? ' : ''}
            GROUP BY u.id
            ORDER BY u.nombre_completo
        `, partido ? [partido] : (diputado_id ? [diputado_id] : []), (err, asistencia) => {
            if (err) {
                console.error('Error en asistencia:', err);
                return res.status(500).json({ error: 'Error obteniendo asistencia' });
            }
            
            estadisticas.asistencia = asistencia;
            
            // Votaciones
            db.all(`
                SELECT 
                    i.id,
                    i.numero,
                    i.titulo,
                    i.sesion_id,
                    s.fecha_inicio as fecha,
                    i.resultado,
                    (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'favor') as votos_favor,
                    (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'contra') as votos_contra,
                    (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'abstencion') as votos_abstencion
                FROM iniciativas i
                JOIN sesiones s ON s.id = i.sesion_id
                ${whereClause}
                ORDER BY s.fecha_inicio DESC, i.numero
            `, params, (err, votaciones) => {
                if (err) {
                    console.error('Error en votaciones:', err);
                    return res.status(500).json({ error: 'Error obteniendo votaciones' });
                }
                
                estadisticas.votaciones = votaciones;
                
                // Iniciativas
                db.all(`
                    SELECT 
                        i.*,
                        s.fecha_inicio as fecha_sesion
                    FROM iniciativas i
                    JOIN sesiones s ON s.id = i.sesion_id
                    ${whereClause}
                    ORDER BY s.fecha_inicio DESC, i.numero
                `, params, (err, iniciativas) => {
                    if (err) {
                        console.error('Error en iniciativas:', err);
                        return res.status(500).json({ error: 'Error obteniendo iniciativas' });
                    }
                    
                    estadisticas.iniciativas = iniciativas;
                    
                    // Estadísticas por partido
                    db.all(`
                        SELECT 
                            u.partido,
                            COUNT(DISTINCT u.id) as total_diputados,
                            AVG(CASE WHEN ad.asistencia = 'presente' THEN 100.0 ELSE 0 END) as promedio_asistencia
                        FROM usuarios u
                        LEFT JOIN asistencia_diputados ad ON ad.diputado_id = u.id
                        WHERE u.role = 'diputado'
                        GROUP BY u.partido
                    `, (err, porPartido) => {
                        if (err) {
                            console.error('Error en por partido:', err);
                            return res.status(500).json({ error: 'Error obteniendo datos por partido' });
                        }
                        
                        estadisticas.por_partido = {};
                        porPartido.forEach(p => {
                            estadisticas.por_partido[p.partido] = p;
                        });
                        
                        // Calcular totales de votos
                        db.get(`
                            SELECT 
                                COUNT(*) as total_votos,
                                SUM(CASE WHEN voto = 'favor' THEN 1 ELSE 0 END) as votos_favor,
                                SUM(CASE WHEN voto = 'contra' THEN 1 ELSE 0 END) as votos_contra,
                                SUM(CASE WHEN voto = 'abstencion' THEN 1 ELSE 0 END) as votos_abstencion
                            FROM votos v
                            JOIN iniciativas i ON i.id = v.iniciativa_id
                            JOIN sesiones s ON s.id = i.sesion_id
                            ${whereClause}
                        `, params, (err, totales) => {
                            if (err) {
                                console.error('Error en totales:', err);
                                return res.status(500).json({ error: 'Error obteniendo totales' });
                            }
                            
                            estadisticas.resumen = {
                                ...estadisticas.resumen,
                                ...totales
                            };
                            
                            // Calcular promedio de participación
                            const totalPosiblesVotos = estadisticas.resumen.total_iniciativas * 20; // 20 diputados
                            estadisticas.resumen.promedio_participacion = totalPosiblesVotos > 0 ?
                                ((estadisticas.resumen.total_votos / totalPosiblesVotos) * 100) : 0;
                            
                            res.json(estadisticas);
                        });
                    });
                });
            });
        });
    });
});

// Obtener detalle de un diputado específico
router.get('/detalle-diputado/:id', (req, res) => {
    const db = req.db;
    const diputadoId = req.params.id;
    
    db.get(`
        SELECT * FROM usuarios WHERE id = ? AND role = 'diputado'
    `, [diputadoId], (err, diputado) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo diputado' });
        }
        
        if (!diputado) {
            return res.status(404).json({ error: 'Diputado no encontrado' });
        }
        
        // Obtener historial de asistencia
        db.all(`
            SELECT 
                a.sesion_id,
                s.fecha_inicio as fecha,
                ad.asistencia as estado
            FROM asistencia_diputados ad
            JOIN asistencias a ON a.id = ad.asistencia_id
            JOIN sesiones s ON s.id = a.sesion_id
            WHERE ad.diputado_id = ?
            ORDER BY s.fecha_inicio DESC
        `, [diputadoId], (err, asistencia) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo asistencia' });
            }
            
            // Obtener historial de votos
            db.all(`
                SELECT 
                    i.numero,
                    i.titulo,
                    v.voto,
                    s.fecha_inicio as fecha
                FROM votos v
                JOIN iniciativas i ON i.id = v.iniciativa_id
                JOIN sesiones s ON s.id = i.sesion_id
                WHERE v.usuario_id = ?
                ORDER BY s.fecha_inicio DESC, i.numero
            `, [diputadoId], (err, votos) => {
                if (err) {
                    return res.status(500).json({ error: 'Error obteniendo votos' });
                }
                
                // Calcular estadísticas
                const totalAsistencias = asistencia.length;
                const presentes = asistencia.filter(a => a.estado === 'presente').length;
                const totalVotos = votos.length;
                const votosFavor = votos.filter(v => v.voto === 'favor').length;
                const votosContra = votos.filter(v => v.voto === 'contra').length;
                const votosAbstencion = votos.filter(v => v.voto === 'abstencion').length;
                
                res.json({
                    ...diputado,
                    estadisticas: {
                        porcentaje_asistencia: totalAsistencias > 0 ? 
                            ((presentes / totalAsistencias) * 100).toFixed(1) : 0,
                        porcentaje_participacion: totalVotos > 0 ? 100 : 0,
                        votos_favor: votosFavor,
                        votos_contra: votosContra,
                        votos_abstencion: votosAbstencion
                    },
                    asistencia,
                    votos
                });
            });
        });
    });
});

// Exportar estadísticas (Excel/PDF/CSV)
router.get('/exportar-estadisticas', async (req, res) => {
    const { formato = 'excel', fecha_inicio, fecha_fin } = req.query;
    
    // Por ahora solo implementamos la descarga básica
    // En producción usarías librerías como exceljs, pdfkit, etc.
    
    res.json({ 
        mensaje: 'Función de exportación en desarrollo',
        formato_solicitado: formato
    });
});

// Guardar tema predefinido seleccionado
router.post('/save-theme-preset', (req, res) => {
    const db = req.db;
    const { theme_preset } = req.body;
    
    // Verificar si existe el registro de configuración
    db.get('SELECT id FROM configuracion_sistema WHERE id = 1', (err, config) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando configuración' });
        }
        
        if (config) {
            // Actualizar configuración existente
            db.run(
                'UPDATE configuracion_sistema SET theme_preset = ? WHERE id = 1',
                [theme_preset],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Error guardando tema' });
                    }
                    res.json({ success: true, message: 'Tema guardado correctamente' });
                }
            );
        } else {
            // Crear nueva configuración
            db.run(
                'INSERT INTO configuracion_sistema (id, theme_preset) VALUES (1, ?)',
                [theme_preset],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Error creando configuración' });
                    }
                    res.json({ success: true, message: 'Tema guardado correctamente' });
                }
            );
        }
    });
});

// Guardar configuración personalizada de tema
router.post('/save-theme', (req, res) => {
    const db = req.db;
    const theme = req.body;
    
    // Convertir el objeto tema a JSON string para guardarlo
    const themeJson = JSON.stringify(theme);
    
    db.get('SELECT id FROM configuracion_sistema WHERE id = 1', (err, config) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando configuración' });
        }
        
        if (config) {
            db.run(
                'UPDATE configuracion_sistema SET theme_custom = ? WHERE id = 1',
                [themeJson],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Error guardando tema personalizado' });
                    }
                    res.json({ success: true, message: 'Tema personalizado guardado' });
                }
            );
        } else {
            db.run(
                'INSERT INTO configuracion_sistema (id, theme_custom) VALUES (1, ?)',
                [themeJson],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Error creando configuración' });
                    }
                    res.json({ success: true, message: 'Tema personalizado guardado' });
                }
            );
        }
    });
});

module.exports = router;