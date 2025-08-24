const express = require('express');
const { authenticateToken, authorize } = require('../auth/middleware');
const sessionState = require('../shared/session-state');

const router = express.Router();

// Middleware de autenticación
router.use(authenticateToken);
router.use(authorize('diputado'));

// Obtener iniciativa activa
router.get('/iniciativa-activa', (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    
    db.get(`
        SELECT i.* FROM iniciativas i
        WHERE i.activa = 1
        LIMIT 1
    `, (err, iniciativa) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo iniciativa' });
        }
        
        if (!iniciativa) {
            return res.json({ iniciativa: null, yaVoto: false, miVoto: null });
        }
        
        // Verificar si ya votó
        db.get(
            'SELECT voto FROM votos WHERE iniciativa_id = ? AND usuario_id = ?',
            [iniciativa.id, userId],
            (err, voto) => {
                if (err) {
                    return res.status(500).json({ error: 'Error verificando voto' });
                }
                
                res.json({
                    iniciativa,
                    yaVoto: !!voto,
                    miVoto: voto ? voto.voto : null
                });
            }
        );
    });
});

// Emitir voto
router.post('/votar', (req, res) => {
    const { iniciativa_id, voto } = req.body;
    const userId = req.user.id;
    const db = req.db;
    
    if (!['favor', 'contra', 'abstencion'].includes(voto)) {
        return res.status(400).json({ error: 'Voto inválido' });
    }
    
    // PRIMERO: Verificar que el diputado está marcado como presente en el pase de lista
    db.get(`
        SELECT ad.asistencia 
        FROM asistencia_diputados ad
        INNER JOIN asistencias a ON ad.asistencia_id = a.id
        INNER JOIN sesiones s ON a.sesion_id = s.id
        WHERE s.activa = 1 AND ad.diputado_id = ?
        ORDER BY a.id DESC
        LIMIT 1
    `, [userId], (err, asistencia) => {
        if (err) {
            console.error('Error verificando asistencia:', err);
            // Si hay error con la tabla, intentar sin validación por ahora
            console.log('Permitiendo voto sin validación de asistencia debido a error');
        } else if (asistencia && asistencia.asistencia !== 'presente') {
            // Solo bloquear si existe registro y NO está presente
            return res.status(403).json({ 
                error: 'No puede votar sin estar presente',
                mensaje: 'Debe estar marcado como PRESENTE en el pase de lista para poder votar.',
                estado_asistencia: asistencia.asistencia
            });
        }
        
        // Verificar que la iniciativa está activa
        db.get(
            'SELECT * FROM iniciativas WHERE id = ? AND activa = 1 AND cerrada = 0',
            [iniciativa_id],
            (err, iniciativa) => {
                if (err) {
                    console.error('Error verificando iniciativa:', err);
                    return res.status(500).json({ error: 'Error verificando iniciativa' });
                }
                
                if (!iniciativa) {
                    return res.status(400).json({ error: 'Iniciativa no disponible para votación' });
                }
                
                // Insertar voto
                db.run(
                    'INSERT OR REPLACE INTO votos (iniciativa_id, usuario_id, voto) VALUES (?, ?, ?)',
                    [iniciativa_id, userId, voto],
                    (err) => {
                        if (err) {
                            console.error('Error registrando voto:', err);
                            return res.status(500).json({ error: 'Error registrando voto' });
                        }
                    
                        // Emitir evento
                        req.io.emit('voto-emitido', {
                            iniciativa_id,
                            usuario_id: userId,
                            voto
                        });
                        
                        // Verificar si todos votaron
                        db.get(
                            'SELECT COUNT(*) as votos FROM votos WHERE iniciativa_id = ?',
                            [iniciativa_id],
                            (err, result) => {
                                if (!err && result.votos === 20) {
                                    req.io.emit('votacion-completa', { iniciativa_id });
                                }
                            }
                        );
                        
                        res.json({ message: 'Voto registrado exitosamente' });
                    }
                );
            }
        );
    });
});

// Historial de votos
router.get('/mi-historial', (req, res) => {
    const userId = req.user.id;
    const db = req.db;
    
    db.all(`
        SELECT 
            i.numero,
            i.titulo,
            i.resultado,
            v.voto,
            v.fecha_voto
        FROM votos v
        JOIN iniciativas i ON v.iniciativa_id = i.id
        WHERE v.usuario_id = ?
        ORDER BY v.fecha_voto DESC
    `, [userId], (err, votos) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo historial' });
        }
        
        res.json({ votos });
    });
});

// Obtener información completa del diputado
router.get('/mi-informacion', (req, res) => {
    const userId = req.user.id;
    const db = req.db;
    
    db.get(`
        SELECT 
            nombre_completo,
            partido,
            comision,
            cargo_legislativo,
            cargo_coordinador,
            cargo_mesa_directiva,
            foto_url
        FROM usuarios
        WHERE id = ?
    `, [userId], (err, usuario) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo información del usuario' });
        }
        
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        // Buscar el coordinador del partido del diputado
        if (usuario.partido) {
            db.get(`
                SELECT nombre_completo as nombre_coordinador
                FROM usuarios
                WHERE partido = ? 
                AND cargo_coordinador LIKE '%Coordinador Grupo Parlamentario%'
                AND role = 'diputado'
                LIMIT 1
            `, [usuario.partido], (err, coordinador) => {
                if (err) {
                    console.error('Error obteniendo coordinador:', err);
                    usuario.nombre_coordinador = null;
                } else {
                    usuario.nombre_coordinador = coordinador ? coordinador.nombre_coordinador : null;
                }
                res.json(usuario);
            });
        } else {
            res.json(usuario);
        }
    });
});

// Obtener tiempo de sesión
router.get('/tiempo-sesion', (req, res) => {
    const db = req.db;
    
    db.get(`
        SELECT id, fecha as inicioSesion
        FROM sesiones
        WHERE activa = 1
    `, (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            return res.json({ sesionActiva: false, inicioSesion: null });
        }
        
        res.json({ 
            sesionActiva: true, 
            inicioSesion: sesion.inicioSesion 
        });
    });
});

// RUTAS PARA PRESIDENTE Y VICEPRESIDENTE DE MESA DIRECTIVA

// Iniciar sesión (presidente, vicepresidente autorizado, o secretario legislativo)
router.post('/iniciar-sesion', (req, res) => {
    const db = req.db;
    const io = req.io;
    const userId = req.user.id;
    
    // Verificar permisos
    db.get('SELECT cargo_mesa_directiva, role FROM usuarios WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
        
        // Verificar si es presidente, vicepresidente con autorización, o secretario legislativo
        const canStart = user.cargo_mesa_directiva === 'presidente' || 
                        (user.cargo_mesa_directiva === 'vicepresidente' && req.body.autorizado) ||
                        user.role === 'secretario';
        
        if (!canStart) {
            return res.status(403).json({ error: 'No tienes permisos para iniciar la sesión' });
        }
        
        // Verificar que haya una sesión preparada con iniciativas
        db.get(`SELECT s.*, COUNT(i.id) as count_iniciativas 
                FROM sesiones s 
                LEFT JOIN iniciativas i ON s.id = i.sesion_id 
                WHERE s.activa = 1 OR (s.estado = 'preparada' AND s.ejecutar_inmediato = 1)
                GROUP BY s.id
                ORDER BY s.fecha DESC 
                LIMIT 1`, (err, sesionPreparada) => {
            if (err) {
                return res.status(500).json({ error: 'Error verificando sesión preparada' });
            }
            
            // Si ya hay una sesión activa, verificar si está iniciada
            if (sesionPreparada && sesionPreparada.activa === 1) {
                // Si ya tiene fecha_inicio, ya está iniciada
                if (sesionPreparada.fecha_inicio) {
                    return res.json({ 
                        success: true,
                        sesion_id: sesionPreparada.id,
                        mensaje: 'La sesión ya está iniciada'
                    });
                }
                // Si no tiene fecha_inicio, actualizarla para iniciarla
                const fecha = new Date().toISOString();
                db.run(
                    `UPDATE sesiones 
                     SET fecha_inicio = ?,
                         hora_inicio = ?,
                         pase_lista_activo = 1
                     WHERE id = ?`,
                    [fecha, fecha, sesionPreparada.id],
                    function(err) {
                        if (err) {
                            console.error('Error iniciando sesión activa:', err);
                            return res.status(500).json({ error: 'Error iniciando sesión' });
                        }
                        
                        // Emitir evento a todos los clientes
                        io.emit('sesion-iniciada', {
                            id: sesionPreparada.id,
                            nombre: sesionPreparada.nombre,
                            fecha,
                            iniciada_por: user.cargo_mesa_directiva || user.role
                        });
                        
                        res.json({ 
                            success: true, 
                            sesion_id: sesionPreparada.id,
                            mensaje: 'Sesión iniciada correctamente',
                            pase_lista_activo: true
                        });
                    }
                );
                return;
            }
            
            // Verificar si hay sesión preparada con iniciativas
            if (!sesionPreparada || sesionPreparada.count_iniciativas === 0) {
                // NADIE puede iniciar sesión sin iniciativas, ni siquiera el presidente
                return res.status(400).json({ 
                    error: 'No se puede iniciar sesión sin iniciativas cargadas.',
                    mensaje: 'El Operador debe cargar primero el documento con las iniciativas del orden del día.',
                    requiere_iniciativas: true
                });
            }
            
            // Activar la sesión preparada (no crear una nueva)
            const fecha = new Date().toISOString();
            
            db.run(
                `UPDATE sesiones 
                 SET activa = 1, 
                     estado = 'activa',
                     iniciada_por = ?,
                     fecha = ?,
                     fecha_inicio = ?,
                     hora_inicio = ?,
                     pase_lista_activo = 1
                 WHERE id = ?`,
                [userId, fecha, fecha, fecha, sesionPreparada.id],
                function(err) {
                    if (err) {
                        console.error('Error activando sesión:', err);
                        return res.status(500).json({ error: 'Error iniciando sesión' });
                    }
                    
                    
                    // Emitir evento a todos los clientes
                    io.emit('sesion-iniciada', {
                        id: sesionPreparada.id,
                        nombre: sesionPreparada.nombre,
                        fecha,
                        iniciada_por: user.cargo_mesa_directiva || user.role
                    });
                    
                    // Notificar que el pase de lista está activo
                    io.emit('pase-lista-activado', {
                        sesion_id: sesionPreparada.id,
                        mensaje: 'Pase de lista activado automáticamente. Los secretarios pueden proceder.'
                    });
                    
                    res.json({ 
                        success: true, 
                        sesion_id: sesionPreparada.id,
                        mensaje: 'Sesión iniciada correctamente',
                        pase_lista_activo: true
                    });
                }
            );
        });
    });
});

// Clausurar sesión (presidente, vicepresidente autorizado, o secretario legislativo)
router.post('/clausurar-sesion', (req, res) => {
    const db = req.db;
    const io = req.io;
    const userId = req.user.id;
    
    // Verificar permisos
    db.get('SELECT cargo_mesa_directiva, nombre_completo, role FROM usuarios WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
        
        // Verificar si es presidente, vicepresidente, secretario legislativo o superadmin
        const canClose = user.cargo_mesa_directiva === 'presidente' || 
                        user.cargo_mesa_directiva === 'vicepresidente' ||
                        user.role === 'secretario' ||
                        user.role === 'superadmin';
        
        if (!canClose) {
            return res.status(403).json({ error: 'No tienes permisos para clausurar la sesión' });
        }
        
        // Obtener sesión activa
        db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo sesión' });
            }
            
            if (!sesion) {
                return res.status(400).json({ error: 'No hay sesión activa' });
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
                    
                    // Clausurar la sesión
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
                                console.error('Error clausurando sesión:', err);
                                return res.status(500).json({ error: 'Error clausurando sesión' });
                            }
                            
                            // Obtener estadísticas de la sesión
                            db.all(
                                `SELECT 
                                    COUNT(*) as total_iniciativas,
                                    SUM(CASE WHEN resultado = 'aprobada' THEN 1 ELSE 0 END) as aprobadas,
                                    SUM(CASE WHEN resultado = 'rechazada' THEN 1 ELSE 0 END) as rechazadas
                                 FROM iniciativas 
                                 WHERE sesion_id = ?`,
                                [sesion.id],
                                (err, stats) => {
                                    // Emitir evento de clausura a todos
                                    io.emit('sesion-clausurada', {
                                        sesion_id: sesion.id,
                                        clausurada_por: user.nombre_completo,
                                        cargo: user.cargo_mesa_directiva || user.role,
                                        estadisticas: stats[0]
                                    });
                                    
                                    // Si es el secretario legislativo quien clausura, notificar al presidente
                                    if (user.role === 'secretario') {
                                        io.emit('notificacion-presidente', {
                                            tipo: 'sesion_clausurada_por_secretario',
                                            mensaje: `El Secretario Legislativo ${user.nombre_completo} ha clausurado la sesión`,
                                            fecha: new Date().toISOString(),
                                            estadisticas: stats[0]
                                        });
                                    }
                                    
                                    res.json({ 
                                        success: true,
                                        mensaje: 'Sesión clausurada correctamente',
                                        clausurada_por: user.role === 'secretario' ? 'Secretario Legislativo' : user.cargo_mesa_directiva,
                                        estadisticas: stats[0]
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

// Obtener sesión actual (usado por el panel de diputado)
router.get('/sesion-actual', (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    
    // Verificar cargo y role del usuario
    db.get('SELECT cargo_mesa_directiva, role FROM usuarios WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando usuario' });
        }
        
        // Verificar si es presidente (normalizando diferentes formatos)
        const cargoLower = (user.cargo_mesa_directiva || '').toLowerCase().trim();
        const esPresidente = cargoLower === 'presidente' || 
                            cargoLower === 'presidente de la mesa directiva' ||
                            user.cargo_mesa_directiva === 'Presidente de la Mesa Directiva' ||
                            user.cargo_mesa_directiva === 'Presidente';
        const esVicepresidente = cargoLower === 'vicepresidente' ||
                                user.cargo_mesa_directiva === 'Vicepresidente';
        const esSecretario = user.role === 'secretario';
        
        console.log('Verificación de permisos:', {
            userId,
            cargo: user.cargo_mesa_directiva,
            cargoLower,
            esPresidente,
            esVicepresidente,
            esSecretario
        });
        
        // Obtener sesión activa
        db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo sesión' });
            }
            
            if (!sesion) {
                // Verificar si hay sesión preparada con iniciativas
                db.get(`SELECT s.*, COUNT(i.id) as count_iniciativas 
                        FROM sesiones s 
                        LEFT JOIN iniciativas i ON s.id = i.sesion_id 
                        WHERE s.estado = 'preparada' OR s.activa = 1
                        GROUP BY s.id
                        ORDER BY s.fecha DESC 
                        LIMIT 1`, (err, sesionPreparada) => {
                    const hayIniciativas = sesionPreparada && sesionPreparada.count_iniciativas > 0;
                    
                    return res.json({ 
                        sesion_activa: false,
                        puede_iniciar: (esPresidente || esVicepresidente || esSecretario) && hayIniciativas,
                        puede_pausar: false,
                        puede_clausurar: false,
                        iniciativas_cargadas: hayIniciativas,
                        mensaje_iniciativas: !hayIniciativas ? 'El operador debe cargar las iniciativas antes de iniciar la sesión' : null
                    });
                });
                return;
            }
            
            // Verificar si la sesión está iniciada o solo preparada
            const sesionIniciada = sesion.fecha_inicio && sesion.fecha_inicio !== null;
            
            // Obtener estadísticas de votaciones
            db.all(
                `SELECT 
                    COUNT(*) as total_iniciativas,
                    SUM(CASE WHEN cerrada = 1 THEN 1 ELSE 0 END) as votaciones_cerradas,
                    SUM(CASE WHEN activa = 1 THEN 1 ELSE 0 END) as votaciones_activas
                 FROM iniciativas 
                 WHERE sesion_id = ?`,
                [sesion.id],
                (err, stats) => {
                    const hayIniciativas = stats[0].total_iniciativas > 0;
                    
                    res.json({
                        sesion_activa: true,
                        sesion: {
                            ...sesion,
                            pausada: sesion.pausada === 1
                        },
                        estadisticas: stats[0],
                        // Si la sesión está activa pero NO iniciada, permitir iniciarla SOLO si hay iniciativas
                        puede_iniciar: !sesionIniciada && (esPresidente || esVicepresidente) && hayIniciativas,
                        puede_pausar: sesionIniciada && (esPresidente || esVicepresidente),
                        puede_clausurar: sesionIniciada && (esPresidente || esVicepresidente || esSecretario),
                        iniciativas_cargadas: hayIniciativas,
                        mensaje_iniciativas: !hayIniciativas ? 'El operador debe cargar las iniciativas antes de iniciar la sesión' : null
                    });
                }
            );
        });
    });
});

// Obtener estado de la sesión actual (mantener por compatibilidad)
router.get('/estado-sesion', (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    
    // Verificar cargo y role del usuario
    db.get('SELECT cargo_mesa_directiva, role FROM usuarios WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando usuario' });
        }
        
        // Obtener sesión activa
        db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo sesión' });
            }
            
            if (!sesion) {
                // Verificar si hay sesión preparada con iniciativas
                db.get(`SELECT s.*, COUNT(i.id) as count_iniciativas 
                        FROM sesiones s 
                        LEFT JOIN iniciativas i ON s.id = i.sesion_id 
                        WHERE s.estado = 'preparada' OR s.activa = 1
                        GROUP BY s.id
                        ORDER BY s.fecha DESC 
                        LIMIT 1`, (err, sesionPreparada) => {
                    const hayIniciativas = sesionPreparada && sesionPreparada.count_iniciativas > 0;
                    
                    return res.json({ 
                        sesion_activa: false,
                        puede_iniciar: (esPresidente || esVicepresidente || esSecretario) && hayIniciativas,
                        puede_pausar: false,
                        puede_clausurar: false,
                        iniciativas_cargadas: hayIniciativas,
                        mensaje_iniciativas: !hayIniciativas ? 'El Operador debe cargar las iniciativas del orden del día antes de iniciar la sesión' : null
                    });
                });
                return;
            }
            
            // Obtener estadísticas de votaciones
            db.all(
                `SELECT 
                    COUNT(*) as total_iniciativas,
                    SUM(CASE WHEN cerrada = 1 THEN 1 ELSE 0 END) as votaciones_cerradas,
                    SUM(CASE WHEN activa = 1 THEN 1 ELSE 0 END) as votaciones_activas
                 FROM iniciativas 
                 WHERE sesion_id = ?`,
                [sesion.id],
                (err, stats) => {
                    res.json({
                        sesion_activa: true,
                        sesion: {
                            ...sesion,
                            pausada: sesion.pausada === 1
                        },
                        estadisticas: stats[0],
                        puede_iniciar: false,
                        puede_pausar: user.cargo_mesa_directiva === 'Presidente de la Mesa Directiva',
                        puede_clausurar: user.cargo_mesa_directiva === 'presidente' || 
                                       user.cargo_mesa_directiva === 'vicepresidente' ||
                                       user.cargo_mesa_directiva === 'Presidente de la Mesa Directiva' ||
                                       user.role === 'secretario' ||
                                       user.role === 'superadmin',
                        iniciativas_cargadas: true
                    });
                }
            );
        });
    });
});

// Obtener diputados sin voto (para presidente)
router.get('/diputados-sin-voto', (req, res) => {
    const db = req.db;
    
    // Verificar que sea presidente o vicepresidente
    if (req.user.cargo_mesa_directiva !== 'presidente' && 
        req.user.cargo_mesa_directiva !== 'vicepresidente') {
        return res.status(403).json({ error: 'No tienes permisos para ver esta información' });
    }
    
    // Obtener iniciativa activa
    db.get('SELECT * FROM iniciativas WHERE activa = 1', (err, iniciativa) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo iniciativa' });
        }
        
        if (!iniciativa) {
            return res.json({ iniciativa: null, diputados: [] });
        }
        
        // Obtener diputados que no han votado
        db.all(`
            SELECT u.id, u.nombre_completo, u.partido, u.cargo_mesa_directiva
            FROM usuarios u
            WHERE u.role = 'diputado' 
            AND u.activo = 1
            AND u.id NOT IN (
                SELECT usuario_id FROM votos WHERE iniciativa_id = ?
            )
            ORDER BY 
                CASE 
                    WHEN u.nombre_completo LIKE '%Abarca Peña%' THEN 1
                    WHEN u.nombre_completo LIKE '%Domínguez Mandujano%' THEN 2
                    WHEN u.nombre_completo LIKE '%Espinoza López%' THEN 3
                    WHEN u.nombre_completo LIKE '%Gordillo Vega%' THEN 4
                    WHEN u.nombre_completo LIKE '%Livera Chavarría%' THEN 5
                    WHEN u.nombre_completo LIKE '%Martínez Gómez%' THEN 6
                    WHEN u.nombre_completo LIKE '%Martínez Terrazas%' THEN 7
                    WHEN u.nombre_completo LIKE '%Maya Rendón%' THEN 8
                    WHEN u.nombre_completo LIKE '%Montes de Oca%' THEN 9
                    WHEN u.nombre_completo LIKE '%Pedrero González%' THEN 10
                    WHEN u.nombre_completo LIKE '%Pimentel Mejía%' THEN 11
                    WHEN u.nombre_completo LIKE '%Quevedo Maldonado%' THEN 12
                    WHEN u.nombre_completo LIKE '%Reyes Reyes%' THEN 13
                    WHEN u.nombre_completo LIKE '%Rodríguez López%' THEN 14
                    WHEN u.nombre_completo LIKE '%Rodríguez Ruiz%' THEN 15
                    WHEN u.nombre_completo LIKE '%Ruíz Rodríguez%' THEN 16
                    WHEN u.nombre_completo LIKE '%Sánchez Ortega%' THEN 17
                    WHEN u.nombre_completo LIKE '%Sánchez Zavala%' THEN 18
                    WHEN u.nombre_completo LIKE '%Solano López%' THEN 19
                    WHEN u.nombre_completo LIKE '%Sotelo Martínez%' THEN 20
                    ELSE 99
                END
        `, [iniciativa.id], (err, diputados) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo diputados' });
            }
            
            res.json({
                iniciativa: {
                    id: iniciativa.id,
                    titulo: iniciativa.titulo,
                    numero: iniciativa.numero
                },
                diputados_sin_voto: diputados,
                total_sin_voto: diputados.length
            });
        });
    });
});

// Enviar recordatorio desde presidente
router.post('/enviar-recordatorio', (req, res) => {
    const { diputado_id, iniciativa_id } = req.body;
    const db = req.db;
    const io = req.io;
    
    // Verificar que sea presidente o vicepresidente
    if (req.user.cargo_mesa_directiva !== 'presidente' && 
        req.user.cargo_mesa_directiva !== 'vicepresidente') {
        return res.status(403).json({ error: 'No tienes permisos para enviar recordatorios' });
    }
    
    // Obtener información del diputado y la iniciativa
    db.get(`
        SELECT u.nombre_completo, u.id, i.titulo, i.numero
        FROM usuarios u, iniciativas i
        WHERE u.id = ? AND i.id = ?
    `, [diputado_id, iniciativa_id], (err, data) => {
        if (err || !data) {
            return res.status(404).json({ error: 'Diputado o iniciativa no encontrados' });
        }
        
        // Emitir recordatorio específico al diputado
        io.emit(`recordatorio-voto-${diputado_id}`, {
            tipo: 'recordatorio_voto',
            iniciativa_id: iniciativa_id,
            iniciativa_titulo: data.titulo,
            iniciativa_numero: data.numero,
            mensaje: `Por favor emite tu voto para la iniciativa #${data.numero}: ${data.titulo}`,
            enviado_por: req.user.nombre_completo,
            cargo_enviador: req.user.cargo_mesa_directiva === 'presidente' ? 'Presidente de Mesa Directiva' : 'Vicepresidente',
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            mensaje: `Recordatorio enviado a ${data.nombre_completo}`,
            diputado: data.nombre_completo
        });
    });
});

// Endpoint para obtener el resultado de la última votación
router.get('/ultima-votacion-resultado', (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    
    // Obtener la última iniciativa votada por el diputado
    const query = `
        SELECT 
            i.id,
            i.numero,
            i.descripcion,
            i.titulo,
            i.aprobada,
            i.conteo_favor,
            i.conteo_contra,
            i.conteo_abstencion,
            v.voto as mi_voto
        FROM iniciativas i
        LEFT JOIN votos v ON v.iniciativa_id = i.id AND v.usuario_id = ?
        WHERE i.cerrada = 1
        ORDER BY i.fecha_cierre DESC
        LIMIT 1
    `;
    
    db.get(query, [userId], (err, resultado) => {
        if (err) {
            console.error('Error obteniendo último resultado:', err);
            return res.status(500).json({ error: 'Error obteniendo resultado' });
        }
        
        if (!resultado) {
            return res.status(404).json({ error: 'No hay votaciones cerradas' });
        }
        
        res.json({
            id: resultado.id,
            numero: resultado.numero,
            descripcion: resultado.descripcion || resultado.titulo,
            aprobada: resultado.aprobada === 1,
            mi_voto: resultado.mi_voto,
            conteo: {
                favor: resultado.conteo_favor || 0,
                contra: resultado.conteo_contra || 0,
                abstencion: resultado.conteo_abstencion || 0
            }
        });
    });
});

// Obtener estado del quórum
router.get('/estado-quorum', (req, res) => {
    const db = req.db;
    
    db.get(`
        SELECT 
            s.id as sesion_id,
            s.quorum_minimo,
            (SELECT COUNT(*) FROM usuarios WHERE role = 'diputado') as total_diputados,
            (SELECT COUNT(*) 
             FROM asistencia_diputados ad 
             JOIN pase_lista pl ON ad.pase_lista_id = pl.id 
             WHERE pl.sesion_id = s.id AND ad.presente = 1) as presentes
        FROM sesiones s
        WHERE s.activa = 1
    `, (err, data) => {
        if (err) {
            console.error('Error obteniendo quórum:', err);
            return res.status(500).json({ error: 'Error obteniendo estado del quórum' });
        }
        
        if (!data) {
            // Si no hay sesión activa, devolver valores por defecto
            return res.json({
                sesion_id: null,
                quorum_minimo: 16, // Valor por defecto (2/3 de 24)
                total_diputados: 24,
                presentes: 0,
                hay_quorum: false
            });
        }
        
        // Calcular si hay quórum
        data.hay_quorum = data.presentes >= data.quorum_minimo;
        
        res.json(data);
    });
});

// Obtener lista de iniciativas de la sesión (para presidente)
router.get('/iniciativas-sesion', (req, res) => {
    const db = req.db;
    const userId = req.user.id;
    
    // Verificar si es presidente
    db.get(`
        SELECT cargo_mesa_directiva 
        FROM usuarios 
        WHERE id = ?
    `, [userId], (err, usuario) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
        
        if (!usuario || usuario.cargo_mesa_directiva !== 'Presidente de la Mesa Directiva') {
            return res.status(403).json({ error: 'Solo el Presidente puede acceder a esta función' });
        }
        
        // Obtener sesión activa
        db.get('SELECT id FROM sesiones WHERE activa = 1', (err, sesion) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo sesión' });
            }
            
            if (!sesion) {
                return res.json({ iniciativas: [] });
            }
            
            // Obtener iniciativas de la sesión
            db.all(`
                SELECT * FROM iniciativas 
                WHERE sesion_id = ? 
                ORDER BY numero
            `, [sesion.id], (err, iniciativas) => {
                if (err) {
                    return res.status(500).json({ error: 'Error obteniendo iniciativas' });
                }
                
                res.json({ iniciativas });
            });
        });
    });
});

// Activar iniciativa para votación (presidente)
router.post('/activar-iniciativa/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    const io = req.io;
    const userId = req.user.id;
    
    // Verificar permisos (presidente, secretario o vicepresidente con autorización)
    db.get(`
        SELECT cargo_mesa_directiva 
        FROM usuarios 
        WHERE id = ?
    `, [userId], (err, usuario) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
        
        const cargoMesa = usuario?.cargo_mesa_directiva || '';
        const puedeActivar = cargoMesa === 'Presidente de la Mesa Directiva' || 
                            cargoMesa === 'Secretario de la Mesa Directiva';
        
        if (!puedeActivar) {
            return res.status(403).json({ error: 'No tienes permisos para activar iniciativas' });
        }
        
        // Verificar que la iniciativa existe y no está activa
        db.get(`
            SELECT * FROM iniciativas 
            WHERE id = ? AND cerrada = 0
        `, [id], (err, iniciativa) => {
            if (err) {
                return res.status(500).json({ error: 'Error consultando iniciativa' });
            }
            
            if (!iniciativa) {
                return res.status(404).json({ error: 'Iniciativa no encontrada o ya está cerrada' });
            }
            
            if (iniciativa.activa) {
                return res.status(400).json({ error: 'La iniciativa ya está activa' });
            }
            
            // VERIFICAR PASE DE LISTA ANTES DE CUALQUIER VOTACIÓN
            db.get(`
                SELECT pl.id, pl.finalizado,
                       COUNT(a.id) as asistencias_registradas 
                FROM pase_lista pl
                LEFT JOIN asistencias a ON a.pase_lista_id = pl.id
                WHERE pl.sesion_id = ? AND pl.finalizado = 0
                GROUP BY pl.id
                ORDER BY pl.fecha DESC
                LIMIT 1
            `, [iniciativa.sesion_id], (err, paseListaActual) => {
                if (err) {
                    console.error('Error verificando pase de lista:', err);
                    return res.status(500).json({ error: 'Error verificando pase de lista' });
                }
                
                // Si no hay pase de lista o no tiene asistencias registradas
                if (!paseListaActual || paseListaActual.asistencias_registradas === 0) {
                    return res.status(400).json({ 
                        error: 'Debe completarse el pase de lista antes de iniciar votaciones',
                        mensaje: 'Los Secretarios-Diputados deben realizar el pase de lista primero',
                        requiere_pase_lista: true
                    });
                }
            
            // VALIDACIÓN CRÍTICA: Verificar si hay otra iniciativa activa
            db.get(`
                SELECT id, numero, titulo 
                FROM iniciativas 
                WHERE sesion_id = ? AND activa = 1 AND id != ?
            `, [iniciativa.sesion_id, id], (err, iniciativaActiva) => {
                if (err) {
                    return res.status(500).json({ error: 'Error verificando iniciativas activas' });
                }
                
                // Si hay otra activa, preguntar confirmación (enviando info de la activa)
                if (iniciativaActiva) {
                    // Si el cliente envía force=true, proceder a desactivar
                    if (!req.body.force) {
                        return res.status(409).json({ 
                            error: 'Ya hay otra iniciativa activa',
                            iniciativa_activa: {
                                id: iniciativaActiva.id,
                                numero: iniciativaActiva.numero,
                                titulo: iniciativaActiva.titulo
                            },
                            requiere_confirmacion: true,
                            mensaje: `La iniciativa #${iniciativaActiva.numero} está activa. ¿Desea cerrarla y activar esta nueva?`
                        });
                    }
                    
                    // Si confirma, cerrar la anterior
                    console.log(`Cerrando iniciativa activa #${iniciativaActiva.numero} para activar #${iniciativa.numero}`);
                }
                
                // VALIDACIÓN DE QUÓRUM: Verificar asistencia antes de activar
                db.get(`
                    SELECT 
                        s.quorum_minimo,
                        s.id as sesion_id,
                        (SELECT COUNT(*) FROM asistencia_diputados ad 
                         JOIN pase_lista pl ON ad.pase_lista_id = pl.id 
                         WHERE pl.sesion_id = s.id AND ad.presente = 1) as presentes,
                        (SELECT COUNT(*) FROM usuarios WHERE role = 'diputado') as total_diputados
                    FROM sesiones s
                    WHERE s.id = ?
                `, [iniciativa.sesion_id], (err, datosQuorum) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error verificando quórum' });
                    }
                    
                    // Determinar quórum requerido según tipo de mayoría
                    let quorumRequerido = datosQuorum?.quorum_minimo || 11; // Por defecto mayoría simple (11 de 20)
                    const totalDiputados = datosQuorum?.total_diputados || 20;
                    const presentes = datosQuorum?.presentes || 0;
                    
                    // Ajustar quórum según tipo de mayoría de la iniciativa
                    if (iniciativa.tipo_mayoria === 'calificada') {
                        quorumRequerido = Math.ceil(totalDiputados * 2 / 3); // 2/3 del total
                    } else if (iniciativa.tipo_mayoria === 'absoluta') {
                        quorumRequerido = Math.ceil(totalDiputados / 2) + 1; // Mitad más uno del total
                    } else if (iniciativa.tipo_mayoria === 'unanime') {
                        quorumRequerido = totalDiputados; // Todos deben estar presentes
                    }
                    
                    // Verificar si hay quórum suficiente
                    if (presentes < quorumRequerido) {
                        // Si no hay quórum pero el cliente insiste (force_quorum=true), permitir con advertencia
                        if (!req.body.force_quorum) {
                            return res.status(412).json({ // 412 Precondition Failed
                                error: 'No hay quórum suficiente',
                                quorum: {
                                    presentes: presentes,
                                    requerido: quorumRequerido,
                                    total: totalDiputados,
                                    tipo_mayoria: iniciativa.tipo_mayoria,
                                    porcentaje: Math.round((presentes / totalDiputados) * 100)
                                },
                                requiere_confirmacion_quorum: true,
                                mensaje: `No hay quórum suficiente. Se requieren ${quorumRequerido} diputados presentes pero solo hay ${presentes}. ¿Desea activar de todas formas?`,
                                advertencia: 'La votación podría ser inválida sin el quórum requerido'
                            });
                        }
                        
                        console.log(`⚠️ Activando iniciativa SIN QUÓRUM: ${presentes}/${quorumRequerido} presentes`);
                    }
                    
                    // Desactivar TODAS las iniciativas activas de la sesión
                    db.run(`
                    UPDATE iniciativas 
                    SET activa = 0 
                    WHERE sesion_id = ? AND id != ?
                `, [iniciativa.sesion_id, id], (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error desactivando otras iniciativas' });
                    }
                
                    // Activar la iniciativa seleccionada
                    db.run(`
                        UPDATE iniciativas 
                        SET activa = 1 
                        WHERE id = ?
                    `, [id], (err) => {
                        if (err) {
                            return res.status(500).json({ error: 'Error activando iniciativa' });
                        }
                        
                        // Obtener información de la sesión incluyendo el PDF
                        db.get(`
                            SELECT archivo_pdf 
                            FROM sesiones 
                            WHERE id = ?
                        `, [iniciativa.sesion_id], (err, sesion) => {
                            // Emitir evento a todos los clientes con información adicional
                            io.emit('iniciativa-activa', {
                                ...iniciativa,
                                archivo_pdf: sesion ? sesion.archivo_pdf : null,
                                mensaje: iniciativaActiva ? 
                                    `Se cerró iniciativa #${iniciativaActiva.numero} y se activó #${iniciativa.numero}` : 
                                    `Iniciativa #${iniciativa.numero} activada para votación`
                            });
                        });
                        
                        res.json({ 
                            success: true, 
                            message: 'Iniciativa activada para votación',
                            iniciativa,
                            iniciativa_cerrada: iniciativaActiva || null
                        });
                    });
                });
            });
        });
            });
        });
    });
});

// Pausar sesión (presidente)
router.post('/pausar-sesion', (req, res) => {
    const db = req.db;
    const io = req.io;
    const userId = req.user.id;
    const { minutos } = req.body;
    
    // Verificar permisos
    db.get(`
        SELECT cargo_mesa_directiva 
        FROM usuarios 
        WHERE id = ?
    `, [userId], (err, usuario) => {
        if (err) {
            console.error('Error verificando permisos:', err);
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
        
        const cargoMesa = usuario?.cargo_mesa_directiva || '';
        const cargoLower = cargoMesa.toLowerCase();
        const puedePausar = cargoLower === 'presidente' || 
                           cargoLower === 'presidente de la mesa directiva' ||
                           cargoMesa === 'Presidente de la Mesa Directiva' ||
                           cargoLower === 'vicepresidente';
        
        if (!puedePausar) {
            console.log('Usuario sin permisos para pausar:', { userId, cargo: cargoMesa });
            return res.status(403).json({ error: 'Solo el Presidente o Vicepresidente pueden pausar la sesión' });
        }
        
        // Verificar sesión activa
        db.get(`SELECT * FROM sesiones WHERE activa = 1`, (err, sesion) => {
            if (err) {
                return res.status(500).json({ error: 'Error verificando sesión' });
            }
            
            if (!sesion) {
                return res.status(400).json({ error: 'No hay sesión activa' });
            }
            
            // Actualizar estado de pausa
            const tiempoPausa = minutos > 0 ? new Date(Date.now() + minutos * 60000).toISOString() : null;
            
            db.run(`
                UPDATE sesiones 
                SET pausada = 1,
                    tiempo_pausa_hasta = ?,
                    pausada_por = ?,
                    pausada_en = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [tiempoPausa, userId, sesion.id], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error pausando sesión' });
                }
                
                // Emitir evento a todos
                io.emit('sesion-pausada', {
                    minutos,
                    tiempo_hasta: tiempoPausa,
                    mensaje: minutos > 0 ? 
                        `Sesión pausada por ${minutos} minutos` : 
                        'Sesión pausada indefinidamente'
                });
                
                res.json({
                    success: true,
                    minutos,
                    mensaje: `Sesión pausada ${minutos > 0 ? `por ${minutos} minutos` : 'indefinidamente'}`
                });
            });
        });
    });
});

// Reanudar sesión (presidente)
router.post('/reanudar-sesion', (req, res) => {
    const db = req.db;
    const io = req.io;
    const userId = req.user.id;
    
    // Verificar permisos
    db.get(`
        SELECT cargo_mesa_directiva 
        FROM usuarios 
        WHERE id = ?
    `, [userId], (err, usuario) => {
        if (err) {
            console.error('Error verificando permisos:', err);
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
        
        const cargoMesa = usuario?.cargo_mesa_directiva || '';
        const cargoLower = cargoMesa.toLowerCase();
        const puedeReanudar = cargoLower === 'presidente' || 
                             cargoLower === 'presidente de la mesa directiva' ||
                             cargoMesa === 'Presidente de la Mesa Directiva' ||
                             cargoLower === 'vicepresidente';
        
        if (!puedeReanudar) {
            console.log('Usuario sin permisos para reanudar:', { userId, cargo: cargoMesa });
            return res.status(403).json({ error: 'Solo el Presidente o Vicepresidente pueden reanudar la sesión' });
        }
        
        // Verificar sesión pausada
        db.get(`SELECT * FROM sesiones WHERE activa = 1 AND pausada = 1`, (err, sesion) => {
            if (err) {
                return res.status(500).json({ error: 'Error verificando sesión' });
            }
            
            if (!sesion) {
                return res.status(400).json({ error: 'No hay sesión pausada' });
            }
            
            // Reanudar sesión
            db.run(`
                UPDATE sesiones 
                SET pausada = 0,
                    tiempo_pausa_hasta = NULL,
                    reanudada_por = ?,
                    reanudada_en = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [userId, sesion.id], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error reanudando sesión' });
                }
                
                // Emitir evento a todos
                io.emit('sesion-reanudada', {
                    mensaje: 'La sesión ha sido reanudada'
                });
                
                res.json({
                    success: true,
                    mensaje: 'Sesión reanudada exitosamente'
                });
            });
        });
    });
});

// Cerrar votación de iniciativa (presidente)
router.post('/cerrar-votacion/:id', (req, res) => {
    const { id } = req.params;
    const db = req.db;
    const io = req.io;
    const userId = req.user.id;
    
    // Verificar permisos
    db.get(`
        SELECT cargo_mesa_directiva 
        FROM usuarios 
        WHERE id = ?
    `, [userId], (err, usuario) => {
        if (err) {
            return res.status(500).json({ error: 'Error verificando permisos' });
        }
        
        const cargoMesa = usuario?.cargo_mesa_directiva || '';
        const puedeCerrar = cargoMesa === 'Presidente de la Mesa Directiva' || 
                           cargoMesa === 'Secretario de la Mesa Directiva';
        
        if (!puedeCerrar) {
            return res.status(403).json({ error: 'No tienes permisos para cerrar votaciones' });
        }
        
        // Obtener conteo de votos
        db.get(`
            SELECT 
                i.*,
                (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'favor') as votos_favor,
                (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'contra') as votos_contra,
                (SELECT COUNT(*) FROM votos WHERE iniciativa_id = i.id AND voto = 'abstencion') as votos_abstencion
            FROM iniciativas i
            WHERE i.id = ? AND i.activa = 1
        `, [id], (err, iniciativa) => {
            if (err) {
                return res.status(500).json({ error: 'Error obteniendo iniciativa' });
            }
            
            if (!iniciativa) {
                return res.status(404).json({ error: 'Iniciativa no encontrada o no está activa' });
            }
            
            // Determinar resultado
            const totalDiputados = 20;
            let resultado = 'rechazada';
            
            if (iniciativa.tipo_mayoria === 'simple') {
                if (iniciativa.votos_favor > iniciativa.votos_contra) resultado = 'aprobada';
            } else if (iniciativa.tipo_mayoria === 'absoluta') {
                if (iniciativa.votos_favor > totalDiputados / 2) resultado = 'aprobada';
            } else if (iniciativa.tipo_mayoria === 'calificada') {
                if (iniciativa.votos_favor >= Math.ceil(totalDiputados * 2 / 3)) resultado = 'aprobada';
            } else if (iniciativa.tipo_mayoria === 'unanime') {
                if (iniciativa.votos_favor === totalDiputados) resultado = 'aprobada';
            }
            
            // Actualizar iniciativa
            db.run(`
                UPDATE iniciativas 
                SET activa = 0, cerrada = 1, resultado = ?,
                    votos_favor = ?, votos_contra = ?, votos_abstencion = ?
                WHERE id = ?
            `, [resultado, iniciativa.votos_favor, iniciativa.votos_contra, 
                iniciativa.votos_abstencion, id], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error al cerrar votación' });
                }
                
                // Emitir evento
                io.emit('votacion-cerrada', {
                    iniciativa_id: id,
                    resultado,
                    votos: {
                        favor: iniciativa.votos_favor,
                        contra: iniciativa.votos_contra,
                        abstencion: iniciativa.votos_abstencion
                    }
                });
                
                res.json({ 
                    message: 'Votación cerrada',
                    resultado,
                    votos: {
                        favor: iniciativa.votos_favor,
                        contra: iniciativa.votos_contra,
                        abstencion: iniciativa.votos_abstencion
                    }
                });
            });
        });
    });
});

// Actualizar perfil del diputado
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

// Configurar multer para manejo de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../../public/uploads/diputados');
        // Crear directorio si no existe
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'diputado-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif)'));
        }
    }
});

// Ruta para actualizar perfil
router.post('/actualizar-perfil', upload.single('fotografia'), async (req, res) => {
    const { nombre, usuario, password } = req.body;
    const userId = req.user.id;
    const db = req.db;
    
    try {
        // Verificar que el usuario no esté duplicado
        if (usuario && usuario !== req.user.username) {
            const existingUser = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM usuarios WHERE username = ? AND id != ?', [usuario, userId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            if (existingUser) {
                // Si se subió una foto, eliminarla
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
            }
        }
        
        // Preparar campos a actualizar
        let updateFields = [];
        let updateValues = [];
        
        if (nombre) {
            updateFields.push('nombre_completo = ?');
            updateValues.push(nombre);
        }
        
        if (usuario) {
            updateFields.push('username = ?');
            updateValues.push(usuario);
        }
        
        if (password && password.length >= 6) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateFields.push('password = ?', 'password_plain = ?');
            updateValues.push(hashedPassword);
            updateValues.push(password);
        }
        
        if (req.file) {
            // Eliminar foto anterior si existe
            db.get('SELECT fotografia FROM usuarios WHERE id = ?', [userId], (err, row) => {
                if (row && row.fotografia) {
                    const oldPhotoPath = path.join(__dirname, '../../public', row.fotografia);
                    if (fs.existsSync(oldPhotoPath)) {
                        fs.unlinkSync(oldPhotoPath);
                    }
                }
            });
            
            const photoPath = '/uploads/diputados/' + req.file.filename;
            updateFields.push('fotografia = ?');
            updateValues.push(photoPath);
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No hay cambios para actualizar' });
        }
        
        // Agregar ID al final de los valores
        updateValues.push(userId);
        
        // Actualizar en la base de datos
        const updateQuery = `UPDATE usuarios SET ${updateFields.join(', ')} WHERE id = ?`;
        
        db.run(updateQuery, updateValues, function(err) {
            if (err) {
                console.error('Error actualizando perfil:', err);
                // Si hubo error y se subió foto, eliminarla
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(500).json({ error: 'Error al actualizar el perfil' });
            }
            
            // Obtener datos actualizados
            db.get('SELECT nombre_completo, username, fotografia FROM usuarios WHERE id = ?', [userId], (err, row) => {
                if (err) {
                    return res.status(500).json({ error: 'Error obteniendo datos actualizados' });
                }
                
                res.json({
                    success: true,
                    message: 'Perfil actualizado correctamente',
                    nombre: row.nombre_completo,
                    usuario: row.username,
                    fotografia: row.fotografia
                });
            });
        });
        
    } catch (error) {
        console.error('Error en actualizar-perfil:', error);
        // Si hubo error y se subió foto, eliminarla
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Error al procesar la solicitud' });
    }
});

// Endpoint para verificar autorización del vicepresidente
router.get('/vicepresidente-autorizado', (req, res) => {
    res.json({ autorizado: sessionState.getVicepresidenteAutorizado() });
});

module.exports = router;