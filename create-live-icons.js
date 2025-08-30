const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// Tamaños de íconos necesarios
const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

async function generateLiveIcons() {
    try {
        // Cargar el logo secundario
        const logoPath = path.join(__dirname, 'public', 'uploads', 'logo-secundario.png');
        
        // Verificar si existe el logo
        if (!fs.existsSync(logoPath)) {
            console.error('No se encontró logo-secundario.png');
            // Usar logo-congreso como alternativa
            const altLogoPath = path.join(__dirname, 'public', 'uploads', 'logo-congreso.png');
            if (fs.existsSync(altLogoPath)) {
                console.log('Usando logo-congreso.png como alternativa');
                logoPath = altLogoPath;
            } else {
                console.error('No se encontró ningún logo');
                return;
            }
        }
        
        const logo = await loadImage(logoPath);
        
        for (const size of sizes) {
            const canvas = createCanvas(size, size);
            const ctx = canvas.getContext('2d');
            
            // Fondo blanco
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            
            // Dibujar logo centrado (75% del tamaño)
            const logoSize = size * 0.75;
            const logoX = (size - logoSize) / 2;
            const logoY = (size - logoSize) / 2;
            ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
            
            // Badge LIVE
            const badgeHeight = size * 0.15;
            const badgeWidth = size * 0.35;
            const badgeX = size - badgeWidth - (size * 0.08);
            const badgeY = size * 0.08;
            const radius = size * 0.03;
            
            // Dibujar badge con bordes redondeados
            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.moveTo(badgeX + radius, badgeY);
            ctx.lineTo(badgeX + badgeWidth - radius, badgeY);
            ctx.arc(badgeX + badgeWidth - radius, badgeY + radius, radius, -Math.PI/2, 0);
            ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - radius);
            ctx.arc(badgeX + badgeWidth - radius, badgeY + badgeHeight - radius, radius, 0, Math.PI/2);
            ctx.lineTo(badgeX + radius, badgeY + badgeHeight);
            ctx.arc(badgeX + radius, badgeY + badgeHeight - radius, radius, Math.PI/2, Math.PI);
            ctx.lineTo(badgeX, badgeY + radius);
            ctx.arc(badgeX + radius, badgeY + radius, radius, Math.PI, -Math.PI/2);
            ctx.fill();
            
            // Punto blanco (indicador)
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(badgeX + badgeWidth * 0.15, badgeY + badgeHeight * 0.5, size * 0.025, 0, Math.PI * 2);
            ctx.fill();
            
            // Texto LIVE
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `bold ${size * 0.08}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('LIVE', badgeX + badgeWidth * 0.6, badgeY + badgeHeight * 0.5);
            
            // Guardar imagen
            const buffer = canvas.toBuffer('image/png');
            const outputPath = path.join(__dirname, 'public', `icon-live-${size}.png`);
            fs.writeFileSync(outputPath, buffer);
            console.log(`✅ Creado: icon-live-${size}.png`);
        }
        
        console.log('\n✅ Todos los íconos LIVE han sido generados exitosamente');
        
    } catch (error) {
        console.error('Error generando íconos:', error);
    }
}

// Ejecutar
generateLiveIcons();