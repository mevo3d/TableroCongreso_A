// Theme Loader - Sistema unificado de temas
// Este archivo carga el tema configurado desde la base de datos

(function() {
    // Función para cargar el tema configurado
    async function loadSystemTheme() {
        try {
            // Obtener configuración pública del sistema (no requiere autenticación)
            const response = await fetch('/api/configuracion/public');
            if (!response.ok) return;
            
            const config = await response.json();
            
            // Si hay un tema configurado, aplicarlo
            if (config.theme_preset) {
                applySystemTheme(config.theme_preset);
            }
            
            // Si hay configuración de modo oscuro
            if (config.dark_mode_enabled) {
                const savedTheme = localStorage.getItem('theme') || 'light';
                document.documentElement.setAttribute('data-theme', savedTheme);
            }
            
        } catch (error) {
            console.error('Error cargando tema del sistema:', error);
        }
    }
    
    // Función para aplicar el tema
    function applySystemTheme(themeName) {
        const body = document.body;
        const html = document.documentElement;
        
        // Remover clases de tema anteriores
        body.classList.remove('theme-standard', 'theme-apple', 'theme-windows11', 'theme-dark', 'theme-blue', 'theme-green', 'theme-red');
        
        // Aplicar clase del tema actual
        if (themeName && themeName !== 'default') {
            body.classList.add(`theme-${themeName}`);
            
            // Para el tema Apple, asegurar que se carguen los estilos correctos
            if (themeName === 'apple') {
                // El tema Apple ya está cargado via apple-theme.css
                // Solo necesitamos asegurar que el data-theme esté configurado
                const currentDataTheme = html.getAttribute('data-theme') || 'light';
                html.setAttribute('data-theme', currentDataTheme);
            }
            
            // Para tema oscuro global
            if (themeName === 'dark') {
                html.setAttribute('data-theme', 'dark');
            }
        }
        
        // Guardar en localStorage para persistencia
        localStorage.setItem('system-theme-preset', themeName);
    }
    
    // Función para cambiar entre modo claro y oscuro (para temas que lo soporten)
    window.toggleTheme = function() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Actualizar icono si existe
        const icon = document.getElementById('theme-icon');
        if (icon) {
            if (newTheme === 'dark') {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            } else {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            }
        }
    }
    
    // Cargar tema al inicio
    document.addEventListener('DOMContentLoaded', function() {
        loadSystemTheme();
        
        // Si hay un tema guardado localmente, aplicarlo también
        const savedPreset = localStorage.getItem('system-theme-preset');
        if (savedPreset) {
            applySystemTheme(savedPreset);
        }
        
        // Cargar preferencia de modo claro/oscuro
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Actualizar icono si existe
        const icon = document.getElementById('theme-icon');
        if (icon && savedTheme === 'dark') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    });
    
    // Escuchar cambios en el tema (para sincronización entre pestañas)
    window.addEventListener('storage', function(e) {
        if (e.key === 'system-theme-preset') {
            applySystemTheme(e.newValue);
        } else if (e.key === 'theme') {
            document.documentElement.setAttribute('data-theme', e.newValue);
        }
    });
    
})();