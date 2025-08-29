// Sistema de gestión de temas
(function() {
    // Obtener el tema guardado o usar el tema del sistema
    function getStoredTheme() {
        return localStorage.getItem('theme');
    }

    function setStoredTheme(theme) {
        localStorage.setItem('theme', theme);
    }

    function getPreferredTheme() {
        const storedTheme = getStoredTheme();
        if (storedTheme) {
            return storedTheme;
        }
        // Detectar preferencia del sistema
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function setTheme(theme) {
        if (theme === 'auto') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    // Aplicar tema inicial
    setTheme(getPreferredTheme());

    // Escuchar cambios en la preferencia del sistema
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const storedTheme = getStoredTheme();
        if (storedTheme !== 'light' && storedTheme !== 'dark') {
            setTheme(getPreferredTheme());
        }
    });

    // Función global para cambiar tema
    window.toggleTheme = function() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        setStoredTheme(newTheme);
        
        // Disparar evento personalizado
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: newTheme } }));
    };

    // Función para establecer tema específico
    window.setAppTheme = function(theme) {
        setTheme(theme);
        setStoredTheme(theme);
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    };

    // Función para obtener tema actual
    window.getCurrentTheme = function() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    };
})();