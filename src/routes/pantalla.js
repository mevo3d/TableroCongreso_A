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
    // Obtener TODOS los diputados con sus votos (si existen)
    db.all(`
        SELECT 
            u.id,
            u.nombre_completo,
            u.partido,
            u.comision,
            u.cargo_legislativo,
            u.foto_url,
            COALESCE(v.voto, 'sin_voto') as voto,
            v.fecha_voto
        FROM usuarios u
        LEFT JOIN votos v ON u.id = v.usuario_id AND v.iniciativa_id = ?
        WHERE u.role = 'diputado'
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
    `, [iniciativaId], (err, votos) => {
        if (err) {
            callback([], null);
            return;
        }
        
        // Función para extraer el primer apellido
        function getPrimerApellido(nombreCompleto) {
            // Separar el nombre en palabras
            const palabras = nombreCompleto.trim().split(/\s+/);
            // Generalmente el formato es: Nombre(s) ApellidoPaterno ApellidoMaterno
            // Asumimos que el primer apellido está después del primer nombre
            if (palabras.length >= 2) {
                // Buscar la primera palabra que empiece con mayúscula después del primer nombre
                // O simplemente tomar la segunda palabra como apellido
                return palabras[1] || palabras[0];
            }
            return nombreCompleto;
        }
        
        // Ordenar por primer apellido
        votos.sort((a, b) => {
            const apellidoA = getPrimerApellido(a.nombre_completo).toLowerCase();
            const apellidoB = getPrimerApellido(b.nombre_completo).toLowerCase();
            return apellidoA.localeCompare(apellidoB, 'es');
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