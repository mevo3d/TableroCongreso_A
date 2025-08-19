const fs = require('fs');
const path = require('path');

const partidos = [
    { nombre: 'morena', color: '#8B4513', texto: 'MORENA' },
    { nombre: 'pan', color: '#0054A4', texto: 'PAN' },
    { nombre: 'pri', color: '#DA251C', texto: 'PRI' },
    { nombre: 'pt', color: '#FF0000', texto: 'PT' },
    { nombre: 'pvem', color: '#00A859', texto: 'PVEM' },
    { nombre: 'mc', color: '#FF8300', texto: 'MC' },
    { nombre: 'prd', color: '#FFD700', texto: 'PRD', textColor: '#333' },
    { nombre: 'pna', color: '#00BFFF', texto: 'PNA' }
];

const logoDir = path.join(__dirname, 'public', 'images', 'partidos');

// Asegurar que el directorio existe
if (!fs.existsSync(logoDir)) {
    fs.mkdirSync(logoDir, { recursive: true });
}

partidos.forEach(partido => {
    const textColor = partido.textColor || 'white';
    const fontSize = partido.texto.length > 3 ? '11' : '14';
    
    const svg = `<svg width="60" height="60" xmlns="http://www.w3.org/2000/svg">
  <circle cx="30" cy="30" r="28" fill="${partido.color}"/>
  <text x="30" y="30" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${partido.texto}</text>
</svg>`;
    
    const filePath = path.join(logoDir, `${partido.nombre}.svg`);
    fs.writeFileSync(filePath, svg);
    console.log(`✓ Logo creado: ${partido.nombre}.svg`);
});

console.log('\n✓ Todos los logos han sido creados en public/images/partidos/');