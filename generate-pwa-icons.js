const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const db = require('./src/db/database');

// Obtener el logo de la base de datos
db.get('SELECT logo_congreso FROM configuracion_sistema WHERE id = 1', async (err, row) => {
    if (err || !row || !row.logo_congreso) {
        console.error('Error: No se encontró el logo en la base de datos');
        process.exit(1);
    }

    const logoPath = path.join(__dirname, 'public', row.logo_congreso);
    
    if (!fs.existsSync(logoPath)) {
        console.error('Error: El archivo del logo no existe:', logoPath);
        process.exit(1);
    }

    console.log('Generando iconos PWA desde:', logoPath);

    try {
        // Generar icono 192x192
        await sharp(logoPath)
            .resize(192, 192, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .png()
            .toFile(path.join(__dirname, 'public', 'icon-192.png'));
        console.log('✓ icon-192.png generado');

        // Generar icono 512x512
        await sharp(logoPath)
            .resize(512, 512, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .png()
            .toFile(path.join(__dirname, 'public', 'icon-512.png'));
        console.log('✓ icon-512.png generado');

        // Generar icono 180x180 para iOS
        await sharp(logoPath)
            .resize(180, 180, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .png()
            .toFile(path.join(__dirname, 'public', 'icon-180.png'));
        console.log('✓ icon-180.png generado');

        console.log('\n✅ Todos los iconos PWA se han generado exitosamente');
        process.exit(0);
    } catch (error) {
        console.error('Error generando iconos:', error);
        process.exit(1);
    }
});