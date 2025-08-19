/**
 * E2E Login Tests
 * Tests complete login flow across different browsers and user types
 */

const { test, expect } = require('@playwright/test');

test.describe('Login Flow E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Start fresh on each test
    await page.goto('/');
  });

  test.describe('Login Page Access', () => {
    test('should display login form correctly', async ({ page }) => {
      // Verify page title
      await expect(page).toHaveTitle(/Sistema de Votación/);

      // Verify login form elements
      await expect(page.locator('#login-form')).toBeVisible();
      await expect(page.locator('#username')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('#login-button')).toBeVisible();

      // Verify form labels
      await expect(page.locator('label[for="username"]')).toContainText(/usuario/i);
      await expect(page.locator('label[for="password"]')).toContainText(/contraseña/i);
    });

    test('should have proper form validation attributes', async ({ page }) => {
      const usernameInput = page.locator('#username');
      const passwordInput = page.locator('#password');

      await expect(usernameInput).toHaveAttribute('required', '');
      await expect(passwordInput).toHaveAttribute('type', 'password');
      await expect(passwordInput).toHaveAttribute('required', '');
    });

    test('should show/hide password functionality', async ({ page }) => {
      const passwordInput = page.locator('#password');
      const toggleButton = page.locator('[data-testid="password-toggle"]');

      // If password toggle exists
      if (await toggleButton.count() > 0) {
        await passwordInput.fill('testpassword');
        
        // Initially should be hidden
        await expect(passwordInput).toHaveAttribute('type', 'password');
        
        // Click toggle to show
        await toggleButton.click();
        await expect(passwordInput).toHaveAttribute('type', 'text');
        
        // Click toggle to hide again
        await toggleButton.click();
        await expect(passwordInput).toHaveAttribute('type', 'password');
      }
    });
  });

  test.describe('Successful Login Flows', () => {
    const userCredentials = [
      { 
        username: 'test.diputado1', 
        password: '123456', 
        expectedRole: 'diputado',
        expectedRedirect: '/diputado'
      },
      { 
        username: 'test.operador', 
        password: '123456', 
        expectedRole: 'operador',
        expectedRedirect: '/operador'
      },
      { 
        username: 'test.secretario', 
        password: '123456', 
        expectedRole: 'secretario',
        expectedRedirect: '/secretario'
      },
      { 
        username: 'test.superadmin', 
        password: '123456', 
        expectedRole: 'superadmin',
        expectedRedirect: '/superadmin'
      }
    ];

    for (const user of userCredentials) {
      test(`should login successfully as ${user.expectedRole}`, async ({ page }) => {
        // Fill login form
        await page.fill('#username', user.username);
        await page.fill('#password', user.password);

        // Submit form
        await page.click('#login-button');

        // Wait for navigation
        await page.waitForURL(`**${user.expectedRedirect}**`);

        // Verify successful login
        await expect(page).toHaveURL(new RegExp(user.expectedRedirect));
        
        // Verify user info is displayed
        await expect(page.locator('[data-testid="user-info"]')).toBeVisible({ timeout: 10000 });
        
        // Check for role-specific elements
        if (user.expectedRole === 'diputado') {
          await expect(page.locator('[data-testid="voting-panel"]')).toBeVisible();
        } else if (user.expectedRole === 'operador') {
          await expect(page.locator('[data-testid="operator-controls"]')).toBeVisible();
        }
      });
    }
  });

  test.describe('Failed Login Scenarios', () => {
    test('should reject invalid username', async ({ page }) => {
      await page.fill('#username', 'nonexistent.user');
      await page.fill('#password', '123456');
      await page.click('#login-button');

      // Should show error message
      const errorMessage = page.locator('[data-testid="error-message"], .error-message, .alert-danger');
      await expect(errorMessage).toBeVisible({ timeout: 5000 });
      await expect(errorMessage).toContainText(/credenciales inválidas|usuario no encontrado/i);

      // Should stay on login page
      await expect(page).toHaveURL('/');
    });

    test('should reject invalid password', async ({ page }) => {
      await page.fill('#username', 'test.diputado1');
      await page.fill('#password', 'wrongpassword');
      await page.click('#login-button');

      // Should show error message
      const errorMessage = page.locator('[data-testid="error-message"], .error-message, .alert-danger');
      await expect(errorMessage).toBeVisible({ timeout: 5000 });
      await expect(errorMessage).toContainText(/credenciales inválidas|contraseña incorrecta/i);

      // Should stay on login page
      await expect(page).toHaveURL('/');
    });

    test('should reject empty credentials', async ({ page }) => {
      // Try to submit without filling anything
      await page.click('#login-button');

      // Should show validation messages or stay on page
      const usernameInput = page.locator('#username');
      const passwordInput = page.locator('#password');
      
      // Check for HTML5 validation
      expect(await usernameInput.evaluate(el => el.validationMessage)).toBeTruthy();
      
      // Should stay on login page
      await expect(page).toHaveURL('/');
    });

    test('should handle partial credentials', async ({ page }) => {
      // Only username, no password
      await page.fill('#username', 'test.diputado1');
      await page.click('#login-button');

      const passwordInput = page.locator('#password');
      expect(await passwordInput.evaluate(el => el.validationMessage)).toBeTruthy();

      // Only password, no username
      await page.fill('#username', '');
      await page.fill('#password', '123456');
      await page.click('#login-button');

      const usernameInput = page.locator('#username');
      expect(await usernameInput.evaluate(el => el.validationMessage)).toBeTruthy();
    });
  });

  test.describe('UI/UX Behavior', () => {
    test('should show loading state during login', async ({ page }) => {
      // Fill valid credentials
      await page.fill('#username', 'test.diputado1');
      await page.fill('#password', '123456');

      // Click login and check for loading state
      const loginButton = page.locator('#login-button');
      await loginButton.click();

      // Should show loading state (disabled button, spinner, etc.)
      const loadingIndicator = page.locator('[data-testid="loading-spinner"], .spinner, .loading');
      
      if (await loadingIndicator.count() > 0) {
        await expect(loadingIndicator).toBeVisible();
      }

      // Button should be disabled during login
      await expect(loginButton).toBeDisabled();

      // Wait for navigation to complete
      await page.waitForURL('/diputado');
    });

    test('should clear error messages when user starts typing', async ({ page }) => {
      // First, create an error
      await page.fill('#username', 'invalid.user');
      await page.fill('#password', 'wrongpass');
      await page.click('#login-button');

      // Wait for error message
      const errorMessage = page.locator('[data-testid="error-message"], .error-message, .alert-danger');
      await expect(errorMessage).toBeVisible();

      // Start typing in username field
      await page.fill('#username', '');
      await page.type('#username', 't');

      // Error message should disappear or fade
      if (await errorMessage.count() > 0) {
        await expect(errorMessage).toBeHidden({ timeout: 2000 });
      }
    });

    test('should handle keyboard navigation', async ({ page }) => {
      // Tab through form elements
      await page.keyboard.press('Tab');
      await expect(page.locator('#username')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.locator('#password')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.locator('#login-button')).toBeFocused();

      // Fill form using keyboard
      await page.focus('#username');
      await page.keyboard.type('test.diputado1');
      
      await page.keyboard.press('Tab');
      await page.keyboard.type('123456');

      // Submit using Enter key
      await page.keyboard.press('Enter');

      // Should navigate to dashboard
      await page.waitForURL('/diputado');
    });
  });

  test.describe('Security Features', () => {
    test('should not expose sensitive data in URL', async ({ page }) => {
      await page.fill('#username', 'test.diputado1');
      await page.fill('#password', '123456');
      await page.click('#login-button');

      await page.waitForURL('/diputado');

      // URL should not contain credentials
      const url = page.url();
      expect(url).not.toContain('123456');
      expect(url).not.toContain('test.diputado1');
      expect(url).not.toContain('password');
    });

    test('should not store password in browser storage', async ({ page }) => {
      await page.fill('#username', 'test.diputado1');
      await page.fill('#password', '123456');
      await page.click('#login-button');

      await page.waitForURL('/diputado');

      // Check localStorage and sessionStorage don't contain password
      const localStorage = await page.evaluate(() => JSON.stringify(window.localStorage));
      const sessionStorage = await page.evaluate(() => JSON.stringify(window.sessionStorage));

      expect(localStorage).not.toContain('123456');
      expect(sessionStorage).not.toContain('123456');
    });

    test('should handle XSS attempts in login fields', async ({ page }) => {
      const maliciousScript = '<script>alert("XSS")</script>';
      
      await page.fill('#username', maliciousScript);
      await page.fill('#password', maliciousScript);
      await page.click('#login-button');

      // Should not execute script - check no alert dialog
      const dialogPromise = page.waitForEvent('dialog', { timeout: 1000 }).catch(() => null);
      const dialog = await dialogPromise;
      
      expect(dialog).toBeNull();

      // Should show error message instead
      const errorMessage = page.locator('[data-testid="error-message"], .error-message, .alert-danger');
      await expect(errorMessage).toBeVisible();
    });
  });

  test.describe('Accessibility Features', () => {
    test('should have proper ARIA labels and roles', async ({ page }) => {
      // Check form has proper role
      const form = page.locator('#login-form');
      await expect(form).toHaveAttribute('role', 'form');

      // Check inputs have proper labels
      const usernameInput = page.locator('#username');
      const passwordInput = page.locator('#password');

      // Should have associated labels
      expect(await usernameInput.getAttribute('aria-label') || 
             await page.locator('label[for="username"]').count()).toBeTruthy();
      expect(await passwordInput.getAttribute('aria-label') || 
             await page.locator('label[for="password"]').count()).toBeTruthy();
    });

    test('should support screen reader navigation', async ({ page }) => {
      // Check for screen reader friendly elements
      const headings = page.locator('h1, h2, h3, h4, h5, h6');
      await expect(headings.first()).toBeVisible();

      // Check for proper heading hierarchy
      const mainHeading = page.locator('h1, [role="heading"][aria-level="1"]');
      await expect(mainHeading).toBeVisible();
    });

    test('should have sufficient color contrast', async ({ page }) => {
      // This would require additional tools to check color contrast
      // For now, verify elements are visible and have text
      await expect(page.locator('#login-button')).toBeVisible();
      await expect(page.locator('label[for="username"]')).toBeVisible();
      await expect(page.locator('label[for="password"]')).toBeVisible();
    });
  });

  test.describe('Responsive Design', () => {
    test('should work correctly on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 390, height: 844 }); // iPhone 12 Pro

      await page.goto('/');

      // Form should still be visible and functional
      await expect(page.locator('#login-form')).toBeVisible();
      await expect(page.locator('#username')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('#login-button')).toBeVisible();

      // Should be able to complete login flow
      await page.fill('#username', 'test.diputado1');
      await page.fill('#password', '123456');
      await page.click('#login-button');

      await page.waitForURL('/diputado');
      await expect(page.locator('[data-testid="user-info"]')).toBeVisible();
    });

    test('should work correctly on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 }); // iPad

      await page.goto('/');

      // Test login flow on tablet
      await page.fill('#username', 'test.operador');
      await page.fill('#password', '123456');
      await page.click('#login-button');

      await page.waitForURL('/operador');
      await expect(page.locator('[data-testid="user-info"]')).toBeVisible();
    });

    test('should work correctly on desktop viewport', async ({ page }) => {
      // Set desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 }); // Full HD

      await page.goto('/');

      // Test login flow on desktop
      await page.fill('#username', 'test.superadmin');
      await page.fill('#password', '123456');
      await page.click('#login-button');

      await page.waitForURL('/superadmin');
      await expect(page.locator('[data-testid="user-info"]')).toBeVisible();
    });
  });

  test.describe('Performance', () => {
    test('should load login page quickly', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/');
      await page.waitForSelector('#login-form');
      
      const loadTime = Date.now() - startTime;
      
      // Login page should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('should handle login submission efficiently', async ({ page }) => {
      await page.goto('/');
      
      const startTime = Date.now();
      
      await page.fill('#username', 'test.diputado1');
      await page.fill('#password', '123456');
      await page.click('#login-button');
      
      await page.waitForURL('/diputado');
      
      const loginTime = Date.now() - startTime;
      
      // Login should complete within 5 seconds
      expect(loginTime).toBeLessThan(5000);
    });
  });
});