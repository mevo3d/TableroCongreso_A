const express = require('express');
const router = express.Router();

// Función auxiliar para construir URLs absolutas
function buildAbsoluteUrl(req, relativePath) {
    if (!relativePath) return null;
    
    // Si ya es una URL absoluta, devolverla tal cual
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        return relativePath;
    }
    
    // Construir URL absoluta basada en el host de la petición
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    // Asegurar que la ruta relativa empiece con /
    const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    
    return `${baseUrl}${path}`;
}

// Obtener estado actual de la pantalla (sin autenticación)
router.get('/estado', (req, res) => {
    const db = req.db;
    
    db.get('SELECT * FROM sesiones WHERE activa = 1', (err, sesion) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo sesión' });
        }
        
        if (!sesion) {
            return res.json({
                estado: 'sin_actividad',
                sesion_activa: null,
                iniciativa: null,
                votos: [],
                conteo: null
            });
        }
        
        // Buscar iniciativa activa
        db.get(
            'SELECT * FROM iniciativas WHERE sesion_id = ? AND activa = 1',
            [sesion.id],
            (err, iniciativaActiva) => {
                if (err) {
                    return res.status(500).json({ error: 'Error obteniendo iniciativa' });
                }
                
                if (iniciativaActiva) {
                    // Votación en curso
                    obtenerVotosIniciativa(db, iniciativaActiva.id, req, (votos, conteo) => {
                        res.json({
                            estado: 'votacion_activa',
                            sesion_activa: sesion,
                            iniciativa: iniciativaActiva,
                            votos,
                            conteo,
                            iniciativas: []
                        });
                    });
                } else {
                    // Buscar última votación cerrada
                    db.get(
                        'SELECT * FROM iniciativas WHERE sesion_id = ? AND cerrada = 1 ORDER BY id DESC LIMIT 1',
                        [sesion.id],
                        (err, ultimaIniciativa) => {
                            if (err || !ultimaIniciativa) {
                                return res.json({
                                    estado: 'sin_actividad',
                                    sesion_activa: sesion,
                                    iniciativa: null,
                                    votos: [],
                                    conteo: null
                                });
                            }
                            
                            obtenerVotosIniciativa(db, ultimaIniciativa.id, req, (votos, conteo) => {
                                res.json({
                                    estado: 'ultima_votacion',
                                    sesion_activa: sesion,
                                    iniciativa: ultimaIniciativa,
                                    votos,
                                    conteo,
                                    resultado: ultimaIniciativa.resultado
                                });
                            });
                        }
                    );
                }
            }
        );
    });
});

// Obtener partidos (endpoint público)
router.get('/partidos', (req, res) => {
    const db = req.db;
    
    db.all('SELECT * FROM partidos WHERE activo = 1', (err, partidos) => {
        if (err) {
            return res.status(500).json({ error: 'Error obteniendo partidos' });
        }
        
        // Convertir URLs de logos a absolutas
        partidos = partidos.map(partido => ({
            ...partido,
            logo_url: buildAbsoluteUrl(req, partido.logo_url)
        }));
        
        res.json(partidos);
    });
});

// Función auxiliar para obtener votos
function obtenerVotosIniciativa(db, iniciativaId, req, callback) {
    // Obtener TODOS los diputados con sus votos (si existen) en orden alfabético
    db.all(`
        SELECT 
            u.id,
            u.nombre_completo,
            u.partido,
            u.comision,
            u.cargo_legislativo,
            u.foto_url,
            u.orden_alfabetico,
            COALESCE(v.voto, 'sin_voto') as voto,
            v.fecha_voto
        FROM usuarios u
        LEFT JOIN votos v ON u.id = v.usuario_id AND v.iniciativa_id = ?
        WHERE u.role = 'diputado'
        ORDER BY u.orden_alfabetico, u.nombre_completo
    `, [iniciativaId], (err, votos) => {
        if (err) {
            callback([], null);
            return;
        }
        
        // Mapeo de nombres para orden correcto (apellido primero)
        const ORDEN_DIPUTADOS = {
            'Gerardo Abarca Peña': 'Abarca Peña, Gerardo',
            'Alfredo Domínguez Mandujano': 'Domínguez Mandujano, Alfredo',
            'Brenda Espinoza López': 'Espinoza López, Brenda',
            'Andrea Valentina Guadalupe Gordillo Vega': 'Gordillo Vega, Andrea Valentina Guadalupe',
            'Sergio Omar Livera Chavarría': 'Livera Chavarría, Sergio Omar',
            'Gonzala Eleonor Martínez Gómez': 'Martínez Gómez, Gonzala Eleonor',
            'Óscar Daniel Martínez Terrazas': 'Martínez Terrazas, Óscar Daniel',
            'Guillermina Maya Rendón': 'Maya Rendón, Guillermina',
            'Martha Melissa Montes de Oca Montoya': 'Montes de Oca Montoya, Martha Melissa',
            'Luis Eduardo Pedrero González': 'Pedrero González, Luis Eduardo',
            'Isaac Pimentel Mejía': 'Pimentel Mejía, Isaac',
            'Luz Dary Quevedo Maldonado': 'Quevedo Maldonado, Luz Dary',
            'Rafael Reyes Reyes': 'Reyes Reyes, Rafael',
            'Ruth Cleotilde Rodríguez López': 'Rodríguez López, Ruth Cleotilde',
            'Tania Valentina Rodríguez Ruiz': 'Rodríguez Ruiz, Tania Valentina',
            'Nayla Carolina Ruíz Rodríguez': 'Ruíz Rodríguez, Nayla Carolina',
            'Alberto Sánchez Ortega': 'Sánchez Ortega, Alberto',
            'Francisco Erik Sánchez Zavala': 'Sánchez Zavala, Francisco Erik',
            'Jazmín Juana Solano López': 'Solano López, Jazmín Juana',
            'Alfonso de Jesús Sotelo Martínez': 'Sotelo Martínez, Alfonso de Jesús'
        };
        
        // Aplicar formato de apellido primero para mostrar
        votos = votos.map(voto => ({
            ...voto,
            nombre_mostrar: ORDEN_DIPUTADOS[voto.nombre_completo] || voto.nombre_completo
        }));
        
        // Ordenar por apellido usando el formato correcto
        votos.sort((a, b) => {
            const nombreA = a.nombre_mostrar || a.nombre_completo;
            const nombreB = b.nombre_mostrar || b.nombre_completo;
            return nombreA.localeCompare(nombreB, 'es');
        });
        
        // Convertir URLs de fotos a absolutas
        votos = votos.map(voto => ({
            ...voto,
            foto_url: buildAbsoluteUrl(req, voto.foto_url)
        }));
        
        const conteo = {
            favor: votos.filter(v => v.voto === 'favor').length,
            contra: votos.filter(v => v.voto === 'contra').length,
            abstencion: votos.filter(v => v.voto === 'abstencion').length,
            pendientes: votos.filter(v => v.voto === 'sin_voto').length,
            total: votos.filter(v => v.voto !== 'sin_voto').length
        };
        
        callback(votos, conteo);
    });
}

module.exports = router;