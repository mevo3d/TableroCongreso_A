/**
 * E2E Voting Flow Tests
 * Tests the complete voting workflow from session creation to results
 */

const { test, expect } = require('@playwright/test');

// Use the diputado auth state for voting tests
test.use({ storageState: 'tests/auth/diputado.json' });

test.describe('Complete Voting Flow E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to diputado dashboard
    await page.goto('/diputado');
    
    // Wait for page to load
    await page.waitForSelector('[data-testid="voting-panel"]', { timeout: 10000 });
  });

  test.describe('Voting Interface', () => {
    test('should display voting panel correctly', async ({ page }) => {
      // Verify main voting interface elements
      await expect(page.locator('[data-testid="voting-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="initiatives-list"]')).toBeVisible();
      
      // Check for user information
      const userInfo = page.locator('[data-testid="user-info"]');
      await expect(userInfo).toBeVisible();
      await expect(userInfo).toContainText('Test Diputado 1');
    });

    test('should show current session information', async ({ page }) => {
      const sessionInfo = page.locator('[data-testid="session-info"]');
      
      if (await sessionInfo.count() > 0) {
        await expect(sessionInfo).toBeVisible();
        
        // Should show session details
        await expect(page.locator('[data-testid="session-name"]')).toBeVisible();
        await expect(page.locator('[data-testid="session-status"]')).toBeVisible();
      }
    });

    test('should display initiatives list', async ({ page }) => {
      const initiativesList = page.locator('[data-testid="initiatives-list"]');
      await expect(initiativesList).toBeVisible();

      // Check for individual initiative items
      const initiatives = page.locator('[data-testid="initiative-item"]');
      const count = await initiatives.count();
      
      if (count > 0) {
        // Verify first initiative has required elements
        const firstInitiative = initiatives.first();
        await expect(firstInitiative.locator('[data-testid="initiative-title"]')).toBeVisible();
        await expect(firstInitiative.locator('[data-testid="initiative-status"]')).toBeVisible();
      }
    });
  });

  test.describe('Voting Process', () => {
    test('should allow casting vote on active initiative', async ({ page, browser }) => {
      // Create a new context for operador to open initiative
      const operadorContext = await browser.newContext({ storageState: 'tests/auth/operador.json' });
      const operadorPage = await operadorContext.newPage();
      
      try {
        // Operador opens initiative
        await operadorPage.goto('/operador');
        await operadorPage.waitForSelector('[data-testid="initiatives-control"]');
        
        // Find and open first initiative
        const openButton = operadorPage.locator('[data-testid="open-initiative-1"]');
        if (await openButton.count() > 0) {
          await openButton.click();
          
          // Wait for confirmation
          await expect(operadorPage.locator('[data-testid="initiative-opened-alert"]')).toBeVisible({ timeout: 5000 });
        }
        
        // Switch back to diputado page
        await page.reload();
        await page.waitForSelector('[data-testid="voting-panel"]');

        // Find active initiative
        const activeInitiative = page.locator('[data-testid="initiative-active"]').first();
        
        if (await activeInitiative.count() > 0) {
          // Click on initiative to see voting options
          await activeInitiative.click();
          
          // Wait for voting buttons to appear
          await expect(page.locator('[data-testid="vote-favor"]')).toBeVisible();
          await expect(page.locator('[data-testid="vote-contra"]')).toBeVisible();
          await expect(page.locator('[data-testid="vote-abstencion"]')).toBeVisible();

          // Cast vote for "favor"
          await page.click('[data-testid="vote-favor"]');

          // Should show confirmation
          const confirmation = page.locator('[data-testid="vote-confirmation"], [data-testid="success-message"]');
          await expect(confirmation).toBeVisible({ timeout: 5000 });

          // Verify vote was recorded
          const voteStatus = page.locator('[data-testid="my-vote-status"]');
          if (await voteStatus.count() > 0) {
            await expect(voteStatus).toContainText('favor');
          }
        }
        
      } finally {
        await operadorContext.close();
      }
    });

    test('should allow changing vote before closing', async ({ page, browser }) => {
      // Setup: Ensure there's an active initiative
      const operadorContext = await browser.newContext({ storageState: 'tests/auth/operador.json' });
      const operadorPage = await operadorContext.newPage();
      
      try {
        await operadorPage.goto('/operador');
        await operadorPage.waitForSelector('[data-testid="initiatives-control"]');
        
        const openButton = operadorPage.locator('[data-testid="open-initiative-1"]');
        if (await openButton.count() > 0 && await openButton.isVisible()) {
          await openButton.click();
        }

        // Back to diputado
        await page.reload();
        await page.waitForSelector('[data-testid="voting-panel"]');

        const activeInitiative = page.locator('[data-testid="initiative-active"]').first();
        
        if (await activeInitiative.count() > 0) {
          await activeInitiative.click();
          
          // First vote: favor
          await page.waitForSelector('[data-testid="vote-favor"]');
          await page.click('[data-testid="vote-favor"]');
          await page.waitForSelector('[data-testid="vote-confirmation"]', { timeout: 5000 });

          // Change vote: contra
          await page.click('[data-testid="vote-contra"]');
          
          // Should show updated confirmation
          await expect(page.locator('[data-testid="vote-confirmation"]')).toBeVisible();
          
          // Verify updated vote status
          const voteStatus = page.locator('[data-testid="my-vote-status"]');
          if (await voteStatus.count() > 0) {
            await expect(voteStatus).toContainText('contra');
          }
        }
        
      } finally {
        await operadorContext.close();
      }
    });

    test('should prevent voting on closed initiative', async ({ page, browser }) => {
      // Create operador context to manage initiative
      const operadorContext = await browser.newContext({ storageState: 'tests/auth/operador.json' });
      const operadorPage = await operadorContext.newPage();
      
      try {
        await operadorPage.goto('/operador');
        await operadorPage.waitForSelector('[data-testid="initiatives-control"]');
        
        // Close an initiative if it exists
        const closeButton = operadorPage.locator('[data-testid="close-initiative-1"]');
        if (await closeButton.count() > 0) {
          await closeButton.click();
          
          // Wait for confirmation
          await expect(operadorPage.locator('[data-testid="initiative-closed-alert"]')).toBeVisible({ timeout: 5000 });
        }

        // Back to diputado page
        await page.reload();
        await page.waitForSelector('[data-testid="voting-panel"]');

        // Find closed initiative
        const closedInitiative = page.locator('[data-testid="initiative-closed"]').first();
        
        if (await closedInitiative.count() > 0) {
          await closedInitiative.click();
          
          // Voting buttons should not be available or should be disabled
          const voteButtons = page.locator('[data-testid="vote-favor"], [data-testid="vote-contra"], [data-testid="vote-abstencion"]');
          
          if (await voteButtons.count() > 0) {
            for (let i = 0; i < await voteButtons.count(); i++) {
              await expect(voteButtons.nth(i)).toBeDisabled();
            }
          } else {
            // Should show "voting closed" message
            await expect(page.locator('[data-testid="voting-closed-message"]')).toBeVisible();
          }
        }
        
      } finally {
        await operadorContext.close();
      }
    });
  });

  test.describe('Real-time Updates', () => {
    test('should receive real-time vote updates', async ({ page, browser }) => {
      // Create second diputado context
      const diputado2Context = await browser.newContext({ storageState: 'tests/auth/diputado.json' });
      const diputado2Page = await diputado2Context.newPage();
      
      // Create operador context
      const operadorContext = await browser.newContext({ storageState: 'tests/auth/operador.json' });
      const operadorPage = await operadorContext.newPage();
      
      try {
        // Operador opens initiative
        await operadorPage.goto('/operador');
        await operadorPage.waitForSelector('[data-testid="initiatives-control"]');
        
        const openButton = operadorPage.locator('[data-testid="open-initiative-2"]');
        if (await openButton.count() > 0) {
          await openButton.click();
        }

        // Both diputados navigate to voting
        await page.reload();
        await diputado2Page.goto('/diputado');
        
        await page.waitForSelector('[data-testid="voting-panel"]');
        await diputado2Page.waitForSelector('[data-testid="voting-panel"]');

        const activeInitiative1 = page.locator('[data-testid="initiative-active"]').first();
        const activeInitiative2 = diputado2Page.locator('[data-testid="initiative-active"]').first();
        
        if (await activeInitiative1.count() > 0 && await activeInitiative2.count() > 0) {
          // First diputado votes
          await activeInitiative1.click();
          await page.waitForSelector('[data-testid="vote-favor"]');
          await page.click('[data-testid="vote-favor"]');

          // Second diputado should see updated results
          await diputado2Page.waitForTimeout(2000); // Allow time for real-time update
          
          // Check if vote count updated on second diputado's screen
          const voteCount = diputado2Page.locator('[data-testid="vote-count-favor"]');
          if (await voteCount.count() > 0) {
            await expect(voteCount).toContainText('1');
          }
        }
        
      } finally {
        await diputado2Context.close();
        await operadorContext.close();
      }
    });

    test('should show initiative status changes in real-time', async ({ page, browser }) => {
      const operadorContext = await browser.newContext({ storageState: 'tests/auth/operador.json' });
      const operadorPage = await operadorContext.newPage();
      
      try {
        await operadorPage.goto('/operador');
        await operadorPage.waitForSelector('[data-testid="initiatives-control"]');
        
        // Diputado watches for changes
        await page.reload();
        await page.waitForSelector('[data-testid="voting-panel"]');

        // Operador opens initiative
        const openButton = operadorPage.locator('[data-testid="open-initiative-1"]');
        if (await openButton.count() > 0) {
          await openButton.click();
          
          // Diputado should see status change
          await page.waitForSelector('[data-testid="initiative-active"]', { timeout: 10000 });
          
          const statusIndicator = page.locator('[data-testid="initiative-1-status"]');
          if (await statusIndicator.count() > 0) {
            await expect(statusIndicator).toContainText(/activa|abierta/i);
          }
        }
        
      } finally {
        await operadorContext.close();
      }
    });
  });

  test.describe('Results Display', () => {
    test('should display voting results correctly', async ({ page, browser }) => {
      // Setup votes and close initiative
      const operadorContext = await browser.newContext({ storageState: 'tests/auth/operador.json' });
      const operadorPage = await operadorContext.newPage();
      
      try {
        await operadorPage.goto('/operador');
        await operadorPage.waitForSelector('[data-testid="initiatives-control"]');
        
        // Open initiative
        const openButton = operadorPage.locator('[data-testid="open-initiative-1"]');
        if (await openButton.count() > 0) {
          await openButton.click();
        }

        // Cast vote as diputado
        await page.reload();
        await page.waitForSelector('[data-testid="voting-panel"]');
        
        const activeInitiative = page.locator('[data-testid="initiative-active"]').first();
        if (await activeInitiative.count() > 0) {
          await activeInitiative.click();
          await page.waitForSelector('[data-testid="vote-favor"]');
          await page.click('[data-testid="vote-favor"]');
          await page.waitForSelector('[data-testid="vote-confirmation"]');
        }

        // Operador closes initiative
        await operadorPage.reload();
        await operadorPage.waitForSelector('[data-testid="initiatives-control"]');
        
        const closeButton = operadorPage.locator('[data-testid="close-initiative-1"]');
        if (await closeButton.count() > 0) {
          await closeButton.click();
          await operadorPage.waitForSelector('[data-testid="initiative-closed-alert"]');
        }

        // Check results display
        await page.reload();
        await page.waitForSelector('[data-testid="voting-panel"]');
        
        const closedInitiative = page.locator('[data-testid="initiative-closed"]').first();
        if (await closedInitiative.count() > 0) {
          await closedInitiative.click();
          
          // Should display results
          await expect(page.locator('[data-testid="voting-results"]')).toBeVisible({ timeout: 5000 });
          await expect(page.locator('[data-testid="result-favor"]')).toBeVisible();
          await expect(page.locator('[data-testid="result-contra"]')).toBeVisible();
          await expect(page.locator('[data-testid="result-abstencion"]')).toBeVisible();
          
          // Should show final decision
          const finalResult = page.locator('[data-testid="final-result"]');
          if (await finalResult.count() > 0) {
            await expect(finalResult).toContainText(/aprobada|rechazada|empate/i);
          }
        }
        
      } finally {
        await operadorContext.close();
      }
    });

    test('should show voting statistics and analysis', async ({ page }) => {
      // Navigate to a completed initiative
      const completedInitiative = page.locator('[data-testid="initiative-closed"]').first();
      
      if (await completedInitiative.count() > 0) {
        await completedInitiative.click();
        
        // Check for statistical information
        const statsPanel = page.locator('[data-testid="voting-statistics"]');
        if (await statsPanel.count() > 0) {
          await expect(statsPanel).toBeVisible();
          
          // Should show participation rate
          const participationRate = page.locator('[data-testid="participation-rate"]');
          if (await participationRate.count() > 0) {
            await expect(participationRate).toBeVisible();
            await expect(participationRate).toContainText(/%/);
          }
          
          // Should show total eligible voters
          const totalEligible = page.locator('[data-testid="total-eligible"]');
          if (await totalEligible.count() > 0) {
            await expect(totalEligible).toBeVisible();
          }
        }
      }
    });
  });

  test.describe('Accessibility and Usability', () => {
    test('should support keyboard navigation', async ({ page }) => {
      // Test tab navigation through voting interface
      await page.keyboard.press('Tab');
      
      // Should be able to navigate to initiatives
      const focusedElement = await page.evaluate(() => document.activeElement.tagName);
      expect(['BUTTON', 'A', 'DIV']).toContain(focusedElement);
      
      // Continue tabbing through interface
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
    });

    test('should have proper ARIA labels for voting buttons', async ({ page, browser }) => {
      const operadorContext = await browser.newContext({ storageState: 'tests/auth/operador.json' });
      const operadorPage = await operadorContext.newPage();
      
      try {
        // Ensure there's an active initiative
        await operadorPage.goto('/operador');
        await operadorPage.waitForSelector('[data-testid="initiatives-control"]');
        
        const openButton = operadorPage.locator('[data-testid="open-initiative-1"]');
        if (await openButton.count() > 0) {
          await openButton.click();
        }

        await page.reload();
        await page.waitForSelector('[data-testid="voting-panel"]');
        
        const activeInitiative = page.locator('[data-testid="initiative-active"]').first();
        if (await activeInitiative.count() > 0) {
          await activeInitiative.click();
          
          // Check ARIA labels on voting buttons
          const favorButton = page.locator('[data-testid="vote-favor"]');
          const contraButton = page.locator('[data-testid="vote-contra"]');
          const abstencionButton = page.locator('[data-testid="vote-abstencion"]');
          
          if (await favorButton.count() > 0) {
            const ariaLabel = await favorButton.getAttribute('aria-label');
            expect(ariaLabel).toBeTruthy();
            expect(ariaLabel.toLowerCase()).toContain('favor');
          }
          
          if (await contraButton.count() > 0) {
            const ariaLabel = await contraButton.getAttribute('aria-label');
            expect(ariaLabel).toBeTruthy();
            expect(ariaLabel.toLowerCase()).toContain('contra');
          }
        }
        
      } finally {
        await operadorContext.close();
      }
    });

    test('should provide clear visual feedback for vote status', async ({ page, browser }) => {
      const operadorContext = await browser.newContext({ storageState: 'tests/auth/operador.json' });
      const operadorPage = await operadorContext.newPage();
      
      try {
        await operadorPage.goto('/operador');
        await operadorPage.waitForSelector('[data-testid="initiatives-control"]');
        
        const openButton = operadorPage.locator('[data-testid="open-initiative-1"]');
        if (await openButton.count() > 0) {
          await openButton.click();
        }

        await page.reload();
        await page.waitForSelector('[data-testid="voting-panel"]');
        
        const activeInitiative = page.locator('[data-testid="initiative-active"]').first();
        if (await activeInitiative.count() > 0) {
          await activeInitiative.click();
          await page.waitForSelector('[data-testid="vote-favor"]');
          
          // Cast vote and check visual feedback
          await page.click('[data-testid="vote-favor"]');
          
          // Should show confirmation with appropriate styling
          const confirmation = page.locator('[data-testid="vote-confirmation"]');
          if (await confirmation.count() > 0) {
            await expect(confirmation).toBeVisible();
            
            // Should have success styling (green color, checkmark, etc.)
            const classes = await confirmation.getAttribute('class');
            expect(classes).toMatch(/(success|green|check|confirm)/i);
          }
          
          // Vote button should show selected state
          const favorButton = page.locator('[data-testid="vote-favor"]');
          const buttonClasses = await favorButton.getAttribute('class');
          expect(buttonClasses).toMatch(/(selected|active|voted)/i);
        }
        
      } finally {
        await operadorContext.close();
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page, context }) => {
      // Simulate network failure during vote
      await context.setOffline(true);
      
      const activeInitiative = page.locator('[data-testid="initiative-active"]').first();
      if (await activeInitiative.count() > 0) {
        await activeInitiative.click();
        
        const favorButton = page.locator('[data-testid="vote-favor"]');
        if (await favorButton.count() > 0) {
          await favorButton.click();
          
          // Should show error message
          const errorMessage = page.locator('[data-testid="error-message"], .error, .alert-danger');
          await expect(errorMessage).toBeVisible({ timeout: 10000 });
          await expect(errorMessage).toContainText(/error|falló|conexión/i);
        }
      }
      
      // Restore network
      await context.setOffline(false);
    });

    test('should handle server errors appropriately', async ({ page, context }) => {
      // Mock server error responses
      await context.route('**/api/diputado/vote', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' })
        });
      });
      
      const activeInitiative = page.locator('[data-testid="initiative-active"]').first();
      if (await activeInitiative.count() > 0) {
        await activeInitiative.click();
        
        const favorButton = page.locator('[data-testid="vote-favor"]');
        if (await favorButton.count() > 0) {
          await favorButton.click();
          
          // Should show server error message
          const errorMessage = page.locator('[data-testid="error-message"], .error, .alert-danger');
          await expect(errorMessage).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });
});