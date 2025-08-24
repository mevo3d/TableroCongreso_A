// Módulo para compartir estado de sesión entre rutas
let vicepresidenteAutorizado = false;

module.exports = {
    // Obtener estado de autorización del vicepresidente
    getVicepresidenteAutorizado: () => vicepresidenteAutorizado,
    
    // Establecer estado de autorización del vicepresidente
    setVicepresidenteAutorizado: (autorizado) => {
        vicepresidenteAutorizado = autorizado;
    }
};