/**
 * Gestor de Temas - Sistema de Votación
 * Maneja el cambio entre modo claro y oscuro con paleta neutra
 */

class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'light';
        this.init();
    }

    init() {
        this.applyTheme(this.currentTheme);
        this.createThemeToggle();
        this.attachEventListeners();
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        this.currentTheme = theme;
        
        this.removeInlineStyles();
        this.updateThemeIcon();
    }

    removeInlineStyles() {
        const elementsWithInlineStyles = document.querySelectorAll('[style*="background-color"], [style*="color"]');
        elementsWithInlineStyles.forEach(element => {
            const style = element.getAttribute('style');
            if (style) {
                let newStyle = style
                    .replace(/background-color:\s*#?[a-fA-F0-9]{3,6};?/gi, '')
                    .replace(/background-color:\s*white;?/gi, '')
                    .replace(/background-color:\s*#fff(fff)?;?/gi, '')
                    .replace(/background-color:\s*#f8f9fa;?/gi, '')
                    .replace(/color:\s*#333;?/gi, '')
                    .replace(/color:\s*#666;?/gi, '')
                    .replace(/color:\s*white;?/gi, '')
                    .replace(/color:\s*#fff(fff)?;?/gi, '');
                
                if (newStyle.trim()) {
                    element.setAttribute('style', newStyle);
                } else {
                    element.removeAttribute('style');
                }
            }
        });
    }

    createThemeToggle() {
        if (document.getElementById('themeToggle')) return;

        const toggleButton = document.createElement('button');
        toggleButton.id = 'themeToggle';
        toggleButton.className = 'theme-toggle';
        toggleButton.innerHTML = this.currentTheme === 'dark' 
            ? '<i class="fas fa-sun"></i>' 
            : '<i class="fas fa-moon"></i>';
        toggleButton.title = 'Cambiar tema';
        
        const style = document.createElement('style');
        style.textContent = `
            .theme-toggle {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
                background: var(--bg-surface);
                border: 2px solid var(--border-color);
                border-radius: 50%;
                width: 50px;
                height: 50px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: var(--shadow-lg);
                transition: all 0.3s ease;
                color: var(--text-primary);
            }
            
            .theme-toggle:hover {
                transform: scale(1.1);
                box-shadow: var(--shadow-xl);
            }
            
            .theme-toggle i {
                font-size: 20px;
            }
            
            [data-theme="dark"] .theme-toggle {
                background: #2A2E38;
                border-color: #3E4450;
                color: #FDB813;
            }
            
            [data-theme="light"] .theme-toggle {
                background: #FFFFFF;
                border-color: #E1E4E8;
                color: #495057;
            }
        `;
        
        if (!document.head.querySelector('#theme-toggle-styles')) {
            style.id = 'theme-toggle-styles';
            document.head.appendChild(style);
        }
        
        document.body.appendChild(toggleButton);
    }

    updateThemeIcon() {
        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            toggle.innerHTML = this.currentTheme === 'dark' 
                ? '<i class="fas fa-sun"></i>' 
                : '<i class="fas fa-moon"></i>';
        }
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
        this.showThemeNotification(newTheme);
    }

    showThemeNotification(theme) {
        const notification = document.createElement('div');
        notification.className = 'theme-notification';
        notification.textContent = `Tema ${theme === 'dark' ? 'oscuro' : 'claro'} activado`;
        
        const style = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--bg-surface);
            color: var(--text-primary);
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: var(--shadow-lg);
            z-index: 10000;
            animation: slideIn 0.3s ease;
            border: 1px solid var(--border-color);
        `;
        
        notification.setAttribute('style', style);
        
        const animationStyle = document.createElement('style');
        animationStyle.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        
        if (!document.head.querySelector('#notification-animations')) {
            animationStyle.id = 'notification-animations';
            document.head.appendChild(animationStyle);
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    attachEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('#themeToggle')) {
                this.toggleTheme();
            }
        });

        const observer = new MutationObserver(() => {
            this.removeInlineStyles();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style']
        });
    }

    setTheme(theme) {
        if (theme === 'light' || theme === 'dark') {
            this.applyTheme(theme);
        }
    }

    getTheme() {
        return this.currentTheme;
    }
}

const themeManager = new ThemeManager();

window.setTheme = (theme) => themeManager.setTheme(theme);
window.toggleTheme = () => themeManager.toggleTheme();
window.getTheme = () => themeManager.getTheme();