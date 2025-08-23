// Sistema de Temas - Día/Noche

(function() {
    // Obtener tema guardado o usar el tema por defecto (día)
    function getCurrentTheme() {
        return localStorage.getItem('theme') || 'light';
    }

    // Aplicar tema
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        updateThemeButton(theme);
    }

    // Actualizar el botón de tema
    function updateThemeButton(theme) {
        // Actualizar el botón del header principal
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            if (theme === 'dark') {
                themeIcon.className = 'fas fa-moon';
                themeIcon.parentElement.title = 'Cambiar a modo día';
            } else {
                themeIcon.className = 'fas fa-sun';
                themeIcon.parentElement.title = 'Cambiar a modo noche';
            }
        }
        
        // También actualizar el botón antiguo si existe
        const button = document.getElementById('themeToggle');
        if (button) {
            const icon = button.querySelector('i');
            if (theme === 'dark') {
                icon.className = 'fas fa-sun';
                button.title = 'Cambiar a modo día';
            } else {
                icon.className = 'fas fa-moon';
                button.title = 'Cambiar a modo noche';
            }
        }
    }

    // Cambiar tema
    function toggleTheme() {
        const currentTheme = getCurrentTheme();
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        
        // Efecto de transición suave
        document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    }

    // Crear botón de cambio de tema
    function createThemeButton() {
        const button = document.createElement('button');
        button.id = 'themeToggle';
        button.className = 'theme-toggle';
        button.innerHTML = '<i class="fas fa-moon"></i>';
        button.title = 'Cambiar a modo noche';
        button.onclick = toggleTheme;
        
        // Insertar el botón en el navbar si existe, o como botón flotante
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            // Buscar el contenedor de botones en el navbar
            const navbarButtons = navbar.querySelector('.d-flex');
            if (navbarButtons) {
                // Crear contenedor para el botón de tema en el navbar
                const themeButtonContainer = document.createElement('div');
                themeButtonContainer.className = 'me-3';
                
                const navbarThemeButton = document.createElement('button');
                navbarThemeButton.id = 'themeToggle';
                navbarThemeButton.className = 'btn btn-outline-light btn-sm';
                navbarThemeButton.innerHTML = '<i class="fas fa-moon"></i>';
                navbarThemeButton.title = 'Cambiar a modo noche';
                navbarThemeButton.onclick = toggleTheme;
                
                themeButtonContainer.appendChild(navbarThemeButton);
                navbarButtons.insertBefore(themeButtonContainer, navbarButtons.firstChild);
            } else {
                // Si no hay contenedor de botones, agregar como botón flotante
                document.body.appendChild(button);
            }
        } else {
            // Si no hay navbar, agregar como botón flotante
            document.body.appendChild(button);
        }
    }

    // Detectar preferencia del sistema
    function detectSystemPreference() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    // Inicializar tema cuando el DOM esté listo
    function initTheme() {
        // Si no hay tema guardado, usar la preferencia del sistema
        let theme = localStorage.getItem('theme');
        if (!theme) {
            theme = detectSystemPreference();
        }
        
        applyTheme(theme);
        createThemeButton();
        
        // Escuchar cambios en la preferencia del sistema
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                // Solo cambiar si el usuario no ha seleccionado manualmente un tema
                if (!localStorage.getItem('theme')) {
                    applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }

    // Esperar a que el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }

    // Exponer funciones globalmente por si se necesitan
    window.themeManager = {
        toggle: toggleTheme,
        apply: applyTheme,
        getCurrent: getCurrentTheme
    };
    
    // Exponer toggleTheme directamente para el onclick
    window.toggleTheme = toggleTheme;
})();