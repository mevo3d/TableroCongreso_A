// Theme Loader - Sistema unificado de temas
// Este archivo carga el tema configurado desde la base de datos y lo aplica a todos los paneles

(function() {
    // Función para cargar el tema configurado
    async function loadSystemTheme() {
        try {
            // Obtener configuración pública del sistema (no requiere autenticación)
            const response = await fetch('/api/configuracion/public');
            if (!response.ok) return;
            
            const config = await response.json();
            
            // Primero aplicar tema predefinido si existe
            if (config.theme_preset) {
                applyPresetTheme(config.theme_preset);
            }
            
            // Luego aplicar colores personalizados si existen
            if (config.theme_custom) {
                applyCustomColors(config.theme_custom);
            }
            
        } catch (error) {
            console.error('Error cargando tema del sistema:', error);
        }
    }
    
    // Función para aplicar tema predefinido
    function applyPresetTheme(themeName) {
        const body = document.body;
        const html = document.documentElement;
        const root = document.documentElement;
        
        // Remover clases de tema anteriores
        body.classList.remove('theme-standard', 'theme-apple', 'theme-windows11', 'theme-dark', 'theme-blue', 'theme-green', 'theme-red', 'theme-default');
        
        // Aplicar clase del tema actual
        if (themeName && themeName !== 'default') {
            body.classList.add(`theme-${themeName}`);
        }
        
        // Aplicar estilos según el tema
        switch(themeName) {
            case 'standard':
                applyStandardTheme();
                break;
            case 'apple':
                applyAppleTheme();
                break;
            case 'windows11':
                applyWindows11Theme();
                break;
            case 'dark':
                applyDarkTheme();
                break;
            case 'blue':
                applyBlueTheme();
                break;
            case 'green':
                applyGreenTheme();
                break;
            case 'red':
                applyRedTheme();
                break;
            default:
                applyDefaultTheme();
        }
        
        // Guardar en localStorage para persistencia
        localStorage.setItem('system-theme-preset', themeName);
    }
    
    // Función para aplicar colores personalizados
    function applyCustomColors(customTheme) {
        const root = document.documentElement;
        
        // Aplicar cada color personalizado como variable CSS
        if (customTheme.navbar_bg) root.style.setProperty('--navbar-bg', customTheme.navbar_bg);
        if (customTheme.navbar_text) root.style.setProperty('--navbar-text', customTheme.navbar_text);
        if (customTheme.bg_primary) root.style.setProperty('--bg-primary', customTheme.bg_primary);
        if (customTheme.bg_card) root.style.setProperty('--bg-card', customTheme.bg_card);
        if (customTheme.color_primary) root.style.setProperty('--color-primary', customTheme.color_primary);
        if (customTheme.color_success) root.style.setProperty('--color-success', customTheme.color_success);
        if (customTheme.color_danger) root.style.setProperty('--color-danger', customTheme.color_danger);
        if (customTheme.color_warning) root.style.setProperty('--color-warning', customTheme.color_warning);
        if (customTheme.text_primary) root.style.setProperty('--text-primary', customTheme.text_primary);
        if (customTheme.text_secondary) root.style.setProperty('--text-secondary', customTheme.text_secondary);
        if (customTheme.card_header_bg) root.style.setProperty('--card-header-bg', customTheme.card_header_bg);
        if (customTheme.card_header_text) root.style.setProperty('--card-header-text', customTheme.card_header_text);
    }
    
    // Temas predefinidos
    function applyStandardTheme() {
        const root = document.documentElement;
        root.style.setProperty('--navbar-bg', '#212529');
        root.style.setProperty('--navbar-text', '#ffffff');
        root.style.setProperty('--bg-primary', '#f8f9fa');
        root.style.setProperty('--bg-card', '#ffffff');
        root.style.setProperty('--color-primary', '#007bff');
        root.style.setProperty('--color-success', '#28a745');
        root.style.setProperty('--color-danger', '#dc3545');
        root.style.setProperty('--color-warning', '#ffc107');
        root.style.setProperty('--text-primary', '#212529');
        root.style.setProperty('--text-secondary', '#6c757d');
    }
    
    function applyAppleTheme() {
        // El tema Apple usa las variables CSS del archivo apple-theme.css
        // Solo aseguramos que el data-theme esté configurado correctamente
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
    
    function applyWindows11Theme() {
        const root = document.documentElement;
        root.style.setProperty('--navbar-bg', '#0078d4');
        root.style.setProperty('--navbar-text', '#ffffff');
        root.style.setProperty('--bg-primary', '#f3f3f3');
        root.style.setProperty('--bg-card', '#ffffff');
        root.style.setProperty('--color-primary', '#0078d4');
        root.style.setProperty('--color-success', '#107c10');
        root.style.setProperty('--color-danger', '#d13438');
        root.style.setProperty('--color-warning', '#ffb900');
        root.style.setProperty('--text-primary', '#323130');
        root.style.setProperty('--text-secondary', '#605e5c');
    }
    
    function applyDarkTheme() {
        const root = document.documentElement;
        root.style.setProperty('--navbar-bg', '#1a1a1a');
        root.style.setProperty('--navbar-text', '#ffffff');
        root.style.setProperty('--bg-primary', '#121212');
        root.style.setProperty('--bg-card', '#1e1e1e');
        root.style.setProperty('--color-primary', '#bb86fc');
        root.style.setProperty('--color-success', '#03dac6');
        root.style.setProperty('--color-danger', '#cf6679');
        root.style.setProperty('--color-warning', '#ffb74d');
        root.style.setProperty('--text-primary', '#ffffff');
        root.style.setProperty('--text-secondary', '#b3b3b3');
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    
    function applyBlueTheme() {
        const root = document.documentElement;
        root.style.setProperty('--navbar-bg', '#1e3a8a');
        root.style.setProperty('--navbar-text', '#ffffff');
        root.style.setProperty('--bg-primary', '#eff6ff');
        root.style.setProperty('--bg-card', '#ffffff');
        root.style.setProperty('--color-primary', '#2563eb');
        root.style.setProperty('--color-success', '#10b981');
        root.style.setProperty('--color-danger', '#ef4444');
        root.style.setProperty('--color-warning', '#f59e0b');
        root.style.setProperty('--text-primary', '#1e293b');
        root.style.setProperty('--text-secondary', '#64748b');
    }
    
    function applyGreenTheme() {
        const root = document.documentElement;
        root.style.setProperty('--navbar-bg', '#14532d');
        root.style.setProperty('--navbar-text', '#ffffff');
        root.style.setProperty('--bg-primary', '#f0fdf4');
        root.style.setProperty('--bg-card', '#ffffff');
        root.style.setProperty('--color-primary', '#16a34a');
        root.style.setProperty('--color-success', '#22c55e');
        root.style.setProperty('--color-danger', '#dc2626');
        root.style.setProperty('--color-warning', '#eab308');
        root.style.setProperty('--text-primary', '#14532d');
        root.style.setProperty('--text-secondary', '#4b5563');
    }
    
    function applyRedTheme() {
        const root = document.documentElement;
        root.style.setProperty('--navbar-bg', '#7f1d1d');
        root.style.setProperty('--navbar-text', '#ffffff');
        root.style.setProperty('--bg-primary', '#fef2f2');
        root.style.setProperty('--bg-card', '#ffffff');
        root.style.setProperty('--color-primary', '#dc2626');
        root.style.setProperty('--color-success', '#16a34a');
        root.style.setProperty('--color-danger', '#b91c1c');
        root.style.setProperty('--color-warning', '#f59e0b');
        root.style.setProperty('--text-primary', '#450a0a');
        root.style.setProperty('--text-secondary', '#6b7280');
    }
    
    function applyDefaultTheme() {
        const root = document.documentElement;
        root.style.setProperty('--navbar-bg', '#343a40');
        root.style.setProperty('--navbar-text', '#ffffff');
        root.style.setProperty('--bg-primary', '#f8f9fa');
        root.style.setProperty('--bg-card', '#ffffff');
        root.style.setProperty('--color-primary', '#007bff');
        root.style.setProperty('--color-success', '#28a745');
        root.style.setProperty('--color-danger', '#dc3545');
        root.style.setProperty('--color-warning', '#ffc107');
        root.style.setProperty('--text-primary', '#212529');
        root.style.setProperty('--text-secondary', '#6c757d');
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
    
    // Función para recargar el tema (útil para actualización en tiempo real)
    window.reloadSystemTheme = function() {
        loadSystemTheme();
    }
    
    // Cargar tema al inicio
    document.addEventListener('DOMContentLoaded', function() {
        loadSystemTheme();
        
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
        if (e.key === 'system-theme-reload') {
            // Recargar tema cuando se detecte un cambio
            loadSystemTheme();
        } else if (e.key === 'theme') {
            document.documentElement.setAttribute('data-theme', e.newValue);
        }
    });
    
    // Recargar tema cada 5 segundos para mantener sincronización
    setInterval(function() {
        if (document.hidden) return; // No recargar si la pestaña no está activa
        loadSystemTheme();
    }, 5000);
    
})();