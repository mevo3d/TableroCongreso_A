const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../auth/middleware');
const router = express.Router();

// Almacenar tokens temporales en memoria (solo para pruebas)
const testTokens = new Map();

// Generar tokens de prueba para todos los diputados
router.get('/generate-test-tokens', (req, res) => {
    // Solo permitir en desarrollo
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'No disponible en producción' });
    }

    const db = req.db;
    
    db.all(
        'SELECT * FROM usuarios WHERE role = "diputado" AND activo = 1 ORDER BY id',
        [],
        (err, diputados) => {
            if (err) {
                return res.status(500).json({ error: 'Error de base de datos' });
            }

            const tokens = [];
            const baseUrl = `http://localhost:3333`;

            diputados.forEach(diputado => {
                // Crear un token único simple para cada diputado
                const testToken = Buffer.from(`test_${diputado.username}_${Date.now()}`).toString('base64url');
                
                // Crear JWT real que será usado cuando accedan con el token de prueba
                const jwtToken = jwt.sign(
                    { 
                        id: diputado.id, 
                        username: diputado.username, 
                        role: diputado.role,
                        nombre: diputado.nombre_completo,
                        cargo_mesa_directiva: diputado.cargo_mesa_directiva
                    },
                    JWT_SECRET,
                    { expiresIn: '4h' }
                );

                // Guardar mapeo en memoria
                testTokens.set(testToken, {
                    jwt: jwtToken,
                    user: diputado,
                    createdAt: new Date()
                });

                tokens.push({
                    username: diputado.username,
                    nombre: diputado.nombre_completo,
                    url: `${baseUrl}/test-access/${testToken}`
                });
            });

            res.json({
                message: 'Tokens de prueba generados',
                validFor: '4 horas',
                tokens: tokens
            });
        }
    );
});

// Acceso directo con token de prueba
router.get('/:testToken', (req, res) => {
    const { testToken } = req.params;
    
    // Solo permitir en desarrollo
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).send('No disponible en producción');
    }

    // Buscar el token en memoria
    const tokenData = testTokens.get(testToken);
    
    if (!tokenData) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Token Inválido</title>
                <style>
                    body { 
                        font-family: Arial; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        height: 100vh;
                        background: #f0f0f0;
                    }
                    .error {
                        background: white;
                        padding: 2rem;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        text-align: center;
                    }
                    h1 { color: #dc3545; }
                    p { color: #666; }
                    a { 
                        display: inline-block;
                        margin-top: 1rem;
                        padding: 0.5rem 1rem;
                        background: #007bff;
                        color: white;
                        text-decoration: none;
                        border-radius: 4px;
                    }
                </style>
            </head>
            <body>
                <div class="error">
                    <h1>⚠️ Token de Prueba Inválido</h1>
                    <p>El token no existe o ha expirado.</p>
                    <p>Por favor, genera nuevos tokens de prueba.</p>
                    <a href="/">Ir al Login</a>
                </div>
            </body>
            </html>
        `);
    }

    // Verificar que no haya expirado (4 horas)
    const hoursElapsed = (Date.now() - tokenData.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursElapsed > 4) {
        testTokens.delete(testToken);
        return res.status(401).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Token Expirado</title>
                <style>
                    body { 
                        font-family: Arial; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        height: 100vh;
                        background: #f0f0f0;
                    }
                    .error {
                        background: white;
                        padding: 2rem;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        text-align: center;
                    }
                    h1 { color: #dc3545; }
                    p { color: #666; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h1>⏰ Token Expirado</h1>
                    <p>Este token de prueba ha expirado (validez: 4 horas).</p>
                    <p>Por favor, genera nuevos tokens.</p>
                </div>
            </body>
            </html>
        `);
    }

    // Redirigir al dashboard con el JWT en localStorage
    const dashboardUrl = '/diputado';
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Acceso de Prueba - ${tokenData.user.nombre_completo}</title>
            <style>
                body { 
                    font-family: Arial; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    height: 100vh;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .loading {
                    background: white;
                    padding: 2rem;
                    border-radius: 12px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    text-align: center;
                }
                h2 { 
                    color: #333; 
                    margin-bottom: 0.5rem;
                }
                p { 
                    color: #666; 
                    margin: 0.5rem 0;
                }
                .spinner {
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid #667eea;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                    margin: 1rem auto;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .user-info {
                    background: #f8f9fa;
                    padding: 1rem;
                    border-radius: 8px;
                    margin-top: 1rem;
                }
            </style>
        </head>
        <body>
            <div class="loading">
                <h2>🔓 Acceso de Prueba Autorizado</h2>
                <div class="user-info">
                    <p><strong>Usuario:</strong> ${tokenData.user.username}</p>
                    <p><strong>Nombre:</strong> ${tokenData.user.nombre_completo}</p>
                    <p><strong>Rol:</strong> ${tokenData.user.role}</p>
                </div>
                <div class="spinner"></div>
                <p>Iniciando sesión automáticamente...</p>
            </div>
            <script>
                // Guardar el token en localStorage
                localStorage.setItem('token', '${tokenData.jwt}');
                localStorage.setItem('user', JSON.stringify(${JSON.stringify({
                    id: tokenData.user.id,
                    username: tokenData.user.username,
                    role: tokenData.user.role,
                    nombre: tokenData.user.nombre_completo,
                    cargo_mesa_directiva: tokenData.user.cargo_mesa_directiva
                })}));
                
                // Redirigir al dashboard después de un momento
                setTimeout(() => {
                    window.location.href = '${dashboardUrl}';
                }, 1500);
            </script>
        </body>
        </html>
    `);
});

module.exports = router;